import os
import logging
from datetime import datetime
from celery import Celery
from sqlalchemy.orm import Session

from models.database import SessionLocal, Job, JobScore, CandidateProfile, Resume, Application
from services.scorer import score_job
from scrapers.job_scraper import JobScrapeManager
from services.llm_service import generate_resume, generate_cover_letter
from services.resume_exporter import export_resume
from services.automation import ApplicationAutomator, ApplicationMode
from core.helpers import profile_to_dict

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "career_copilot_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

@celery_app.task(name="fetch_and_score_jobs_task")
def fetch_and_score_jobs_task(user_id: int, profile_dict: dict, sources: list, roles: list, locations: list):
    logger.info(f"Starting fetch_and_score_jobs_task for user_id={user_id}")
    db: Session = SessionLocal()
    try:
        scraper = JobScrapeManager()
        jobs_data = scraper.fetch_jobs(sources, roles, locations)
        new_count = 0

        for job_data in jobs_data:
            existing = db.query(Job).filter(Job.user_id == user_id, Job.external_id == job_data["external_id"]).first()
            if existing: continue

            posted_date = None
            if job_data.get("posted_date"):
                try: posted_date = datetime.fromisoformat(job_data["posted_date"])
                except Exception: pass

            job = Job(
                user_id=user_id,
                external_id=job_data["external_id"],
                source=job_data["source"],
                company=job_data["company"],
                role=job_data["role"],
                location=job_data.get("location", ""),
                salary=job_data.get("salary", ""),
                description=job_data.get("description", ""),
                apply_link=job_data["apply_link"],
                posted_date=posted_date,
                raw_data=job_data.get("raw_data", {})
            )
            db.add(job)
            db.flush()

            score_result = score_job(job_data, profile_dict)
            db.add(JobScore(job_id=job.id, score=score_result["score"], explanation=score_result["explanation"]))
            new_count += 1

        db.commit()
        return {"user_id": user_id, "new_jobs": new_count}
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


@celery_app.task(name="generate_resume_task")
def generate_resume_task(job_id: int, user_id: int):
    logger.info(f"Starting generate_resume_task for job_id={job_id}, user={user_id}")
    db: Session = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id, Job.user_id == user_id).first()
        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id).first()
        if not job or not profile: return {"error": "Not found"}

        profile_dict = profile_to_dict(profile)
        master_resume = profile.master_resume or {}

        resume_data = generate_resume(
            job_description=job.description,
            job_title=job.role,
            company=job.company,
            master_resume=master_resume,
            profile=profile_dict
        )

        cover_letter = generate_cover_letter(
            job_description=job.description,
            job_title=job.role,
            company=job.company,
            resume_data=resume_data,
            profile=profile_dict
        )

        paths = export_resume(resume_data, job_id)

        resume = Resume(
            job_id=job_id,
            resume_data=resume_data,
            cover_letter=cover_letter,
            file_path_json=paths["json"],
            file_path_docx=paths["docx"],
            file_path_pdf=paths["pdf"]
        )
        db.add(resume)
        db.commit()
        return {"job_id": job_id, "resume_id": resume.id}
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@celery_app.task(name="trigger_application_task")
def trigger_application_task(app_id: int, user_id: int, mode: str):
    logger.info(f"Starting trigger_application_task for app_id={app_id}, user={user_id}")
    db: Session = SessionLocal()
    try:
        app_record = db.query(Application).filter(Application.id == app_id, Application.user_id == user_id).first()
        if not app_record: return {"error": "Not found"}

        job = app_record.job
        profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id).first()
        resume_path = None

        if app_record.resume_id:
            resume = db.query(Resume).filter(Resume.id == app_record.resume_id).first()
            if resume:
                resume_path = resume.file_path_pdf or resume.file_path_docx

        automator = ApplicationAutomator(
            mode=ApplicationMode(mode),
            daily_limit=int(os.getenv("DAILY_LIMIT", "20"))
        )
        profile_dict = profile_to_dict(profile) if profile else {}
        result = automator.apply_to_job(
            job={"apply_link": job.apply_link, "company": job.company, "role": job.role},
            profile=profile_dict,
            resume_path=resume_path
        )

        if result.get("success") and mode == "auto":
            app_record.status = "applied"
            app_record.applied_date = datetime.utcnow()
            db.commit()

        return {"app_id": app_id, "success": result.get("success"), "reason": result.get("reason")}
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
