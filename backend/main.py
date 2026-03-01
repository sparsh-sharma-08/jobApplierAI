"""
AI Career Copilot - FastAPI Backend
"""
import logging
import os
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
import fitz # PyMuPDF

from models.database import get_db, create_tables, SessionLocal, User, CandidateProfile, Job, JobScore, Resume, Application
from models.schemas import (
    UserCreate, UserOut, Token,
    CandidateProfileCreate, CandidateProfileOut,
    JobOut, ResumeOut, ApplicationCreate, ApplicationUpdate, ApplicationOut
)
from core.security import (
    get_password_hash, verify_password, create_access_token, 
    get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
)
from core.helpers import profile_to_dict
from services.scorer import score_job, batch_score_jobs
from services.llm_service import generate_resume, generate_cover_letter, parse_pdf_to_json
from services.resume_exporter import generate_resume_pdf_bytes
from scrapers.job_scraper import JobScrapeManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Career Copilot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("./data", exist_ok=True)
os.makedirs("./data/resumes", exist_ok=True)
os.makedirs("./logs", exist_ok=True)

app.mount("/data", StaticFiles(directory="./data"), name="data")


from fastapi.responses import FileResponse

@app.get("/download/{file_path:path}")
def download_file(file_path: str):
    """Serve generated resume/cover letter files for download."""
    # Handle both relative and absolute paths
    if file_path.startswith("./"):
        full_path = os.path.join(os.getcwd(), file_path[2:])
    elif file_path.startswith("/"):
        full_path = file_path
    else:
        full_path = os.path.join(os.getcwd(), file_path)
    
    if not os.path.exists(full_path):
        raise HTTPException(404, f"File not found")
    
    return FileResponse(
        full_path,
        media_type="application/pdf" if full_path.endswith(".pdf") else "application/octet-stream",
        filename=os.path.basename(full_path)
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "message": exc.detail},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": True, "message": "Validation Error", "details": exc.errors()},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": True, "message": "An unexpected internal server error occurred"},
    )


@app.on_event("startup")
def startup():
    create_tables()
    logger.info("Database initialized")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "AI Career Copilot API is running"}


# ─────────────────────────────────────────
# AUTH ENDPOINTS
# ─────────────────────────────────────────

@app.post("/auth/register", response_model=UserOut)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user_in.password)
    new_user = User(email=user_in.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


# ─────────────────────────────────────────
# PROFILE ENDPOINTS
# ─────────────────────────────────────────

@app.get("/profile", response_model=Optional[CandidateProfileOut])
def get_profile(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    return db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()


@app.post("/profile", response_model=CandidateProfileOut)
def upsert_profile(
    data: CandidateProfileCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if profile:
        for key, value in data.model_dump().items():
            setattr(profile, key, value)
    else:
        profile = CandidateProfile(**data.model_dump(), user_id=current_user.id)
        db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@app.post("/profile/upload-resume")
async def upload_resume_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text() + "\n"
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")
            
        parsed_json = parse_pdf_to_json(text)
        
        if not parsed_json:
            raise HTTPException(status_code=500, detail="Failed to parse resume using AI.")

        # Auto-save the parsed JSON as master_resume on the profile
        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
        if profile:
            profile.master_resume = parsed_json
            db.commit()
            db.refresh(profile)
            
        return {"message": "Success", "parsed_data": parsed_json, "saved_to_profile": profile is not None}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error extracting resume PDF: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while processing the PDF.")


@app.get("/profile/master-resume")
def get_master_resume(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the saved master resume JSON for review/editing."""
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(404, "Profile not found")
    return {"master_resume": profile.master_resume or {}}


@app.put("/profile/master-resume")
def update_master_resume(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save the user-reviewed/edited master resume JSON."""
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(404, "Profile not found. Create a profile first.")
    profile.master_resume = data.get("master_resume", {})
    db.commit()
    db.refresh(profile)
    return {"message": "Master resume saved", "master_resume": profile.master_resume}


# ─────────────────────────────────────────
# JOB ENDPOINTS
# ─────────────────────────────────────────

@app.get("/jobs", response_model=List[JobOut])
def list_jobs(
    min_score: Optional[float] = None,
    source: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Job).filter(Job.user_id == current_user.id)
    if source:
        query = query.filter(Job.source == source)
    if min_score is not None:
        query = query.join(JobScore).filter(JobScore.score >= min_score)
    return query.order_by(Job.fetched_date.desc()).offset(offset).limit(limit).all()


@app.get("/jobs/{job_id}", response_model=JobOut)
def get_job(
    job_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.post("/jobs/fetch")
def fetch_jobs(
    sources: List[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(400, "Please set up your profile first")

    sources_to_fetch = sources or ["remoteok"]
    roles = profile.preferred_roles or ["software engineer"]
    locations = profile.preferred_locations or []
    
    # Needs to be extracted into Celery, but passing user_id to background thread for now
    user_id = current_user.id
    profile_dict = profile_to_dict(profile)

    # Trigger Celery Background Task
    from core.tasks import fetch_and_score_jobs_task
    task = fetch_and_score_jobs_task.delay(user_id, profile_dict, sources_to_fetch, roles, locations)
    
    return {
        "message": "Fetching jobs in background", 
        "task_id": task.id
    }


@app.post("/jobs/score-all")
def score_all_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(400, "Profile not found")

    profile_dict = profile_to_dict(profile)
    unscored_jobs = db.query(Job).filter(Job.user_id == current_user.id, ~Job.score.has()).all()
    count = 0

    for job in unscored_jobs:
        job_dict = {
            "description": job.description,
            "role": job.role,
            "location": job.location,
            "salary": job.salary,
            "posted_date": job.posted_date
        }
        result = score_job(job_dict, profile_dict)
        score = JobScore(job_id=job.id, score=result["score"], explanation=result["explanation"])
        db.add(score)
        count += 1

    db.commit()
    return {"scored": count}


# ─────────────────────────────────────────
# RESUME ENDPOINTS
# ─────────────────────────────────────────

@app.post("/resumes/generate/{job_id}")
def generate_resume_for_job(
    job_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate a tailored resume + cover letter for a specific job.
    Uses master_resume directly (no hallucination), only LLM for summary + cover letter.
    """
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(400, "Please set up your profile first")

    master_resume = profile.master_resume or {}
    if not master_resume.get("name") and not master_resume.get("skills"):
        logger.warning(f"No master resume for user {current_user.id}, building from profile data")

    profile_dict = profile_to_dict(profile)

    # Generate tailored resume (master_resume-based, instant)
    resume_data = generate_resume(
        job_description=job.description or "",
        job_title=job.role or "",
        company=job.company or "",
        master_resume=master_resume,
        profile=profile_dict
    )

    # Generate cover letter
    cover_letter = generate_cover_letter(
        job_description=job.description or "",
        job_title=job.role or "",
        company=job.company or "",
        resume_data=resume_data,
        profile=profile_dict
    )

    # Export to files removed to save storage. PDF is generated on-the-fly now.

    # Check if resume already exists for this job
    existing = db.query(Resume).filter(Resume.job_id == job_id).first()
    if existing:
        existing.resume_data = resume_data
        existing.cover_letter = cover_letter
        existing.file_path_json = None
        existing.file_path_docx = None
        existing.file_path_pdf = None
        db.commit()
        db.refresh(existing)
        resume_record = existing
    else:
        resume_record = Resume(
            job_id=job_id,
            resume_data=resume_data,
            cover_letter=cover_letter,
            file_path_json=None,
            file_path_docx=None,
            file_path_pdf=None
        )
        db.add(resume_record)
        db.commit()
        db.refresh(resume_record)

    return {
        "message": "Resume generated",
        "resume_id": resume_record.id,
        "file_path_pdf": f"/resumes/{resume_record.id}/pdf",
        "cover_letter": cover_letter
    }


@app.get("/resumes/{resume_id}", response_model=ResumeOut)
def get_resume(
    resume_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    resume = db.query(Resume).join(Job).filter(Resume.id == resume_id, Job.user_id == current_user.id).first()
    if not resume:
        raise HTTPException(404, "Resume not found")
    return resume


@app.get("/resumes/{resume_id}/pdf")
def get_resume_pdf(resume_id: int, db: Session = Depends(get_db)):
    """Dynamically generate and serve the PDF in-memory."""
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(404, "Resume not found")
        
    pdf_bytes = generate_resume_pdf_bytes(resume.resume_data)
    if not pdf_bytes:
        raise HTTPException(500, "Failed to generate PDF")
        
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="resume_job_{resume.job_id}.pdf"'}
    )


@app.get("/jobs/{job_id}/resume", response_model=Optional[ResumeOut])
def get_job_resume(
    job_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    resume = db.query(Resume).join(Job).filter(
        Job.id == job_id, Job.user_id == current_user.id
    ).order_by(Resume.id.desc()).first()
    if not resume:
        raise HTTPException(404, "Resume not generated yet")
    return resume


@app.put("/jobs/{job_id}/resume")
def update_job_resume(
    job_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update the generated resume data and/or cover letter for a job."""
    resume = db.query(Resume).join(Job).filter(
        Job.id == job_id, Job.user_id == current_user.id
    ).order_by(Resume.id.desc()).first()
    if not resume:
        raise HTTPException(404, "Resume not generated yet")
    
    if "resume_data" in data:
        resume.resume_data = data["resume_data"]
        # No local export anymore; PDF is requested dynamically via /resumes/{id}/pdf
        resume.file_path_json = None
        resume.file_path_docx = None
        resume.file_path_pdf = None
    
    if "cover_letter" in data:
        resume.cover_letter = data["cover_letter"]
    
    db.commit()
    db.refresh(resume)
    
    return {
        "message": "Resume updated",
        "file_path_pdf": f"/resumes/{resume.id}/pdf",
        "cover_letter": resume.cover_letter,
        "resume_data": resume.resume_data
    }

# ─────────────────────────────────────────
# APPLICATION ENDPOINTS
# ─────────────────────────────────────────

@app.get("/applications", response_model=List[ApplicationOut])
def list_applications(
    status: Optional[str] = None, 
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Application).filter(Application.user_id == current_user.id)
    if status:
        query = query.filter(Application.status == status)
    return query.order_by(Application.created_at.desc()).offset(offset).limit(limit).all()


@app.post("/applications", response_model=ApplicationOut)
def create_application(
    data: ApplicationCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(Job).filter(Job.id == data.job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")

    app_record = Application(job_id=data.job_id, notes=data.notes, user_id=current_user.id)
    db.add(app_record)
    db.commit()
    db.refresh(app_record)
    return app_record


@app.patch("/applications/{app_id}", response_model=ApplicationOut)
def update_application(
    app_id: int, 
    data: ApplicationUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    app_record = db.query(Application).filter(Application.id == app_id, Application.user_id == current_user.id).first()
    if not app_record:
        raise HTTPException(404, "Application not found")

    if data.status:
        app_record.status = data.status
        if data.status == "applied":
            app_record.applied_date = datetime.utcnow()
    if data.notes is not None:
        app_record.notes = data.notes

    db.commit()
    db.refresh(app_record)
    return app_record


@app.delete("/applications/{app_id}")
def delete_application(
    app_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    app_record = db.query(Application).filter(Application.id == app_id, Application.user_id == current_user.id).first()
    if not app_record:
        raise HTTPException(404, "Application not found")
    db.delete(app_record)
    db.commit()
    return {"deleted": True}


@app.post("/applications/{app_id}/apply")
def trigger_application(
    app_id: int, 
    mode: str = "semi_auto", 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from services.automation import open_application_page

    app_record = db.query(Application).filter(Application.id == app_id, Application.user_id == current_user.id).first()
    if not app_record:
        raise HTTPException(404, "Application not found")

    job = app_record.job

    if mode == "open":
        success = open_application_page(job.apply_link)
        return {"success": success, "apply_link": job.apply_link}

    from core.tasks import trigger_application_task
    task = trigger_application_task.delay(app_id, current_user.id, mode)

    return {"message": "Application automation triggered", "task_id": task.id}


# ─────────────────────────────────────────
# STATS / DASHBOARD
# ─────────────────────────────────────────

@app.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_jobs = db.query(Job).filter(Job.user_id == current_user.id).count()
    total_applications = db.query(Application).filter(Application.user_id == current_user.id).count()
    status_counts = {}
    for status in ["pending", "applied", "interview", "rejected", "offer", "no_response"]:
        status_counts[status] = db.query(Application).filter(
            Application.status == status, Application.user_id == current_user.id
        ).count()

    top_jobs = (
        db.query(Job, JobScore)
        .join(JobScore)
        .filter(Job.user_id == current_user.id)
        .order_by(JobScore.score.desc())
        .limit(5)
        .all()
    )

    return {
        "total_jobs": total_jobs,
        "total_applications": total_applications,
        "status_breakdown": status_counts,
        "top_matches": [
            {
                "job_id": j.id,
                "company": j.company,
                "role": j.role,
                "score": s.score,
                "apply_link": j.apply_link
            }
            for j, s in top_jobs
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
