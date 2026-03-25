"""
AI Career Copilot - FastAPI Backend
"""
import logging
import os
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status, Request, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session, joinedload
import fitz # PyMuPDF

from models.database import get_db, create_tables, SessionLocal, User, CandidateProfile, Job, JobScore, Resume, Application, MockInterview, ColdEmail
from models.schemas import (
    UserCreate, UserOut, Token, TokenRefreshRequest,
    CandidateProfileCreate, CandidateProfileOut,
    JobOut, ResumeOut, ApplicationCreate, ApplicationUpdate, ApplicationOut,
    UrlInput,
    MockInterviewOut, ColdEmailOut, MockInterviewUpdate, ColdEmailUpdate,
    JobBulkAction
)
from core.security import (
    get_password_hash, verify_password, create_access_token, create_refresh_token,
    get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES, SECRET_KEY, ALGORITHM
)
from core.helpers import profile_to_dict
from services.scorer import score_job, batch_score_jobs
from services.llm_service import generate_resume, generate_cover_letter, parse_pdf_to_json, generate_mock_interview, generate_cold_email
from services.resume_exporter import generate_resume_pdf_bytes
from scrapers.job_scraper import JobScrapeManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="AI Career Copilot", version="1.0.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
def login(user_in: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer", "refresh_token": refresh_token}


from jose import JWTError, jwt

@app.post("/auth/refresh", response_model=Token)
def refresh_token(request: TokenRefreshRequest, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(request.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if email is None or token_type != "refresh":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    new_refresh_token = create_refresh_token(data={"sub": user.email})
    
    return {"access_token": access_token, "token_type": "bearer", "refresh_token": new_refresh_token}


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
        # Only update fields explicitly provided in the payload, don't overwrite master_resume with null
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
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

        # Auto-save the parsed JSON as master_resume on the profile if it exists
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
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.put("/profile/master-resume")
def update_master_resume(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Please set your basic profile first.")
        
    master_resume = payload.get("master_resume")
    if master_resume is None:
        raise HTTPException(status_code=400, detail="master_resume payload is required")
        
    profile.master_resume = master_resume
    db.commit()
    db.refresh(profile)
    return {"message": "Master resume updated successfully"}

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
    exclude_applied: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Job).filter(Job.user_id == current_user.id)
    if source:
        query = query.filter(Job.source == source)
    if min_score is not None:
        query = query.join(JobScore).filter(JobScore.score >= min_score)
    if exclude_applied:
        query = query.filter(~Job.applications.any())
    jobs = query.order_by(Job.fetched_date.desc()).offset(offset).limit(limit).all()
    for job in jobs:
        if job.applications:
            job.status = job.applications[0].status
        else:
            job.status = "saved"
    return jobs


@app.delete("/jobs/clear")
def clear_unapplied_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Find jobs that do not have any applications
    unapplied_jobs = db.query(Job).filter(
        Job.user_id == current_user.id,
        ~Job.applications.any()
    ).all()
    
    count = 0
    for job in unapplied_jobs:
        # Related JobScore and Resumes will be cascade-deleted if configured, or we can manually delete them
        # SQLite with SQLAlchemy sometimes needs manual cleanup if cascade is not set
        db.query(JobScore).filter(JobScore.job_id == job.id).delete(synchronize_session=False)
        db.query(Resume).filter(Resume.job_id == job.id).delete(synchronize_session=False)
        db.delete(job)
        count += 1
        
    db.commit()
    return {"message": f"Successfully cleared {count} unapplied fetched jobs.", "deleted_count": count}


@app.get("/jobs/{job_id}", response_model=JobOut)
def get_job(
    job_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.applications:
        job.status = job.applications[0].status
    else:
        job.status = "saved"
    return job


@app.post("/jobs/bulk-action")
def bulk_action_jobs(
    action: JobBulkAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    valid_jobs = db.query(Job).filter(Job.id.in_(action.job_ids), Job.user_id == current_user.id).all()
    logger.info(f"Bulk application action: {action.action} for job_ids: {action.job_ids} (Found {len(valid_jobs)} valid jobs)")
    if not valid_jobs:
        return {"message": "No valid jobs found", "count": 0}

    count = 0
    if action.action == "delete":
        for job in valid_jobs:
            db.query(JobScore).filter(JobScore.job_id == job.id).delete(synchronize_session=False)
            db.query(Resume).filter(Resume.job_id == job.id).delete(synchronize_session=False)
            db.delete(job)
            count += 1
        db.commit()
        return {"message": f"Successfully deleted {count} jobs.", "count": count}

    elif action.action == "mark_applied":
        for job in valid_jobs:
            # Check if application exists
            app_req = db.query(Application).filter(Application.job_id == job.id).first()
            if not app_req:
                app_req = Application(job_id=job.id, user_id=current_user.id, status="applied", applied_date=datetime.utcnow())
                db.add(app_req)
            else:
                app_req.status = "applied"
                app_req.applied_date = datetime.utcnow()
            count += 1
        db.commit()
        return {"message": f"Successfully marked {count} jobs as applied.", "count": count}
        
    raise HTTPException(status_code=400, detail="Invalid action")



from fastapi import Body

@app.post("/jobs/fetch")
def fetch_jobs(
    sources: List[str] = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(400, "Please set up your profile first")

    sources_to_fetch = sources or ["remotive"]
    
    # Intelligently determine roles:
    # 1. Use explicitly preferred roles if available
    # 2. Fall back to their basic profile skills (first 5)
    # 3. If no skills, look at their master resume job titles
    # 4. If all else fails, use a completely blank search to fetch generic remote jobs
    roles = profile.preferred_roles or []
    
    if not roles and profile.skills:
        roles = profile.skills[:5]
        
    if not roles and profile.master_resume:
        exp = profile.master_resume.get("experience", [])
        if exp and len(exp) > 0:
            title = exp[0].get("title")
            if title:
                roles = [title]
                
    if not roles:
        roles = [""] # Empty string will trigger an unfettered generic search on most APIs
        
    locations = profile.preferred_locations or []

    # Needs to be extracted into Celery, but passing user_id to background thread for now
    user_id = current_user.id
    profile_dict = profile_to_dict(profile)

    # Trigger Celery Background Task
    from core.tasks import fetch_and_score_jobs_task
    task = fetch_and_score_jobs_task.delay(user_id, profile_dict, sources_to_fetch, roles, locations)
    
    return {
        "message": "Fetching jobs intelligently in background", 
        "task_id": task.id
    }


@app.post("/jobs/parse-url", response_model=JobOut)
def parse_job_url(
    payload: UrlInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=400, detail="Please set up your profile first")

    # Parse URL
    from scrapers.url_parser import UrlParserScraper
    scraper = UrlParserScraper()
    try:
        job_data = scraper.parse_url(payload.url)
    except Exception as e:
        logger.error(f"URL Parsing failed for {payload.url}: {e}")
        raise HTTPException(status_code=500, detail=f"AI Extraction failed: {str(e)}")
    
    if not job_data:
        raise HTTPException(status_code=400, detail="Could not reach or extract content from that URL. LinkedIn and other major sites may occasionally block our automated requests. Please try again or copy-paste the text manually.")
        
    # Check if we already scraped this exact URL manually
    existing_job = db.query(Job).filter(
        Job.user_id == current_user.id,
        Job.apply_link == payload.url
    ).first()
    
    if existing_job:
        raise HTTPException(status_code=409, detail="You have already added this job to your tracker.")

    # Score it!
    from services.scorer import score_job
    profile_dict = profile_to_dict(profile)
    score_result = score_job(job_data, profile_dict)
    
    # Save the DB
    new_job = Job(
        external_id=job_data["external_id"],
        source=job_data["source"],
        user_id=current_user.id,
        company=job_data["company"],
        role=job_data["role"],
        location=job_data["location"],
        salary=job_data.get("salary", ""),
        description=job_data["description"],
        apply_link=job_data["apply_link"],
        fetched_date=datetime.utcnow(),
        posted_date=datetime.utcnow()
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    
    # Save Score
    new_score = JobScore(
        job_id=new_job.id,
        score=score_result["score"],
        explanation=score_result["explanation"]
    )
    db.add(new_score)
    db.commit()
    
    # Refresh to include relations
    db.refresh(new_job)
    return new_job


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
@limiter.limit("5/minute")
def generate_resume_for_job(
    job_id: int, 
    request: Request,
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
        db.commit()
        db.refresh(existing)
        existing.file_path_pdf = f"/resumes/{existing.id}/pdf"
        db.commit()
        resume_record = existing
    else:
        resume_record = Resume(
            job_id=job_id,
            resume_data=resume_data,
            cover_letter=cover_letter
        )
        db.add(resume_record)
        db.commit()
        db.refresh(resume_record)
        resume_record.file_path_pdf = f"/resumes/{resume_record.id}/pdf"
        db.commit()

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
    
    if not resume.file_path_pdf:
        resume.file_path_pdf = f"/resumes/{resume.id}/pdf"
        db.commit()
    
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
    try:
        query = db.query(Application).options(joinedload(Application.job)).filter(Application.user_id == current_user.id)
        if status:
            query = query.filter(Application.status == status)
        apps = query.order_by(Application.created_at.desc()).offset(offset).limit(limit).all()
        return apps
    except Exception as e:
        logger.error(f"[Applications] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/applications", response_model=ApplicationOut)
def create_application(
    data: ApplicationCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(Job).filter(Job.id == data.job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")

    # Check if application already exists for this job and user
    existing_app = db.query(Application).filter(Application.job_id == data.job_id, Application.user_id == current_user.id).first()
    if existing_app:
        raise HTTPException(status_code=400, detail="This job is already in your tracker.")

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
# AI FEATURE UPGRADES: MOCK INTERVIEW & COLD EMAIL
# ─────────────────────────────────────────

@app.post("/jobs/{job_id}/interview", response_model=MockInterviewOut)
@limiter.limit("5/minute")
def create_mock_interview(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")
        
    resume = db.query(Resume).filter(Resume.job_id == job_id).order_by(Resume.id.desc()).first()
    resume_data = resume.resume_data if resume and resume.resume_data else {}
    
    questions = generate_mock_interview(
        job_description=job.description,
        job_title=job.role,
        resume_data=resume_data
    )
    
    mock = MockInterview(user_id=current_user.id, job_id=job_id, questions=questions)
    db.add(mock)
    db.commit()
    db.refresh(mock)
    return mock


@app.get("/jobs/{job_id}/interview", response_model=List[MockInterviewOut])
def get_mock_interviews(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(MockInterview).filter(MockInterview.job_id == job_id, MockInterview.user_id == current_user.id).order_by(MockInterview.generated_at.desc()).all()


@app.put("/jobs/{job_id}/interview/{interview_id}", response_model=MockInterviewOut)
def update_mock_interview(
    job_id: int,
    interview_id: int,
    update: MockInterviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    mock = db.query(MockInterview).filter(MockInterview.id == interview_id, MockInterview.job_id == job_id, MockInterview.user_id == current_user.id).first()
    if not mock:
        raise HTTPException(404, "Mock interview not found")
    mock.questions = update.questions
    db.commit()
    db.refresh(mock)
    return mock


@app.post("/jobs/{job_id}/cold-email", response_model=ColdEmailOut)
@limiter.limit("5/minute")
def create_cold_email(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")
        
    resume = db.query(Resume).filter(Resume.job_id == job_id).order_by(Resume.id.desc()).first()
    resume_data = resume.resume_data if resume and resume.resume_data else {}
    
    email_body = generate_cold_email(
        job_title=job.role,
        company=job.company,
        resume_data=resume_data
    )
    
    cold_email = ColdEmail(user_id=current_user.id, job_id=job_id, email_body=email_body)
    db.add(cold_email)
    db.commit()
    db.refresh(cold_email)
    return cold_email


@app.get("/jobs/{job_id}/cold-email", response_model=List[ColdEmailOut])
def get_cold_emails(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(ColdEmail).filter(ColdEmail.job_id == job_id, ColdEmail.user_id == current_user.id).order_by(ColdEmail.generated_at.desc()).all()


@app.put("/jobs/{job_id}/cold-email/{email_id}", response_model=ColdEmailOut)
def update_cold_email(
    job_id: int,
    email_id: int,
    update: ColdEmailUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cold = db.query(ColdEmail).filter(ColdEmail.id == email_id, ColdEmail.job_id == job_id, ColdEmail.user_id == current_user.id).first()
    if not cold:
        raise HTTPException(404, "Cold email not found")
    cold.email_body = update.email_body
    db.commit()
    db.refresh(cold)
    return cold


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
