from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from typing import Optional
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/career_copilot.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True, index=True)
    reset_password_token = Column(String, nullable=True, index=True)
    reset_password_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    profile = relationship("CandidateProfile", back_populates="user", uselist=False)
    jobs = relationship("Job", back_populates="user")
    applications = relationship("Application", back_populates="user")
    resume_profiles = relationship("ResumeProfile", back_populates="user")


class CandidateProfile(Base):
    __tablename__ = "candidate_profile"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    name = Column(String)
    email = Column(String)
    phone = Column(String)
    location = Column(String)
    linkedin = Column(String)
    github = Column(String)
    skills = Column(JSON)  # list of strings
    experience_level = Column(String)  # fresher, junior, mid, senior
    preferred_roles = Column(JSON)  # list of strings
    preferred_locations = Column(JSON)  # list of strings
    remote_preference = Column(String)  # remote, hybrid, onsite, any
    min_salary = Column(Integer)
    salary_currency = Column(String, default="USD")  # ISO 4217 code, e.g. USD, INR, GBP
    target_companies = Column(JSON)  # list of strings
    master_resume = Column(JSON)  # structured resume data
    weekly_digest = Column(Integer, default=1)  # 1 for True, 0 for False (for broader DB compatibility)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="profile")


class ResumeProfile(Base):
    __tablename__ = "resume_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)  # Profile name, e.g., "Frontend Developer"
    role_title = Column(String)  # Target role title
    summary = Column(Text)
    skills = Column(JSON)  # List of strings
    experience_level = Column(String)
    preferred_roles = Column(JSON)
    master_resume = Column(JSON)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="resume_profiles")


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    external_id = Column(String, index=True)
    source = Column(String)
    company = Column(String)
    role = Column(String)
    location = Column(String)
    salary = Column(String)
    description = Column(Text)
    apply_link = Column(String)
    posted_date = Column(DateTime)
    fetched_date = Column(DateTime, default=datetime.utcnow)
    raw_data = Column(JSON)
    scores = relationship("JobScore", back_populates="job")
    applications = relationship("Application", back_populates="job")
    user = relationship("User", back_populates="jobs")

    @property
    def recency_label(self) -> str:
        return compute_recency_label(self.posted_date)


def compute_recency_label(posted_date: Optional[datetime], now: Optional[datetime] = None) -> str:
    """
    Format job recency for display.
    Null posted date returns 'Posting date unknown', never 'Posted today'.
    """
    if not posted_date:
        return "Posting date unknown"
    if now is None:
        now = datetime.utcnow()
    p_date = posted_date.replace(tzinfo=None) if posted_date.tzinfo else posted_date
    n_date = now.replace(tzinfo=None) if now.tzinfo else now

    days = (n_date.date() - p_date.date()).days
    if days < 0:
        days = 0
    if days == 0:
        return "Posted today"
    elif days == 1:
        return "Posted 1 day ago"
    else:
        return f"Posted {days} days ago"


class JobScore(Base):
    __tablename__ = "scores"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"))
    profile_id = Column(Integer, ForeignKey("resume_profiles.id"), nullable=True)
    score = Column(Float)
    explanation = Column(JSON)
    scored_at = Column(DateTime, default=datetime.utcnow)
    
    job = relationship("Job", back_populates="scores")
    profile = relationship("ResumeProfile")


class Resume(Base):
    __tablename__ = "resumes"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"))
    profile_id = Column(Integer, ForeignKey("resume_profiles.id"), nullable=True)
    resume_data = Column(JSON)
    cover_letter = Column(Text)
    file_path_json = Column(String)
    file_path_docx = Column(String)
    file_path_pdf = Column(String)
    generated_date = Column(DateTime, default=datetime.utcnow)
    applications = relationship("Application", back_populates="resume")


class Application(Base):
    __tablename__ = "applications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    job_id = Column(Integer, ForeignKey("jobs.id"))
    profile_id = Column(Integer, ForeignKey("resume_profiles.id"), nullable=True)
    resume_id = Column(Integer, ForeignKey("resumes.id"), nullable=True)
    status = Column(String, default="pending")  # pending, applied, interview, rejected, offer, no_response
    applied_date = Column(DateTime, nullable=True)
    applied_date_estimated = Column(Boolean, default=False, nullable=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    job = relationship("Job", back_populates="applications")
    resume = relationship("Resume", back_populates="applications")
    user = relationship("User", back_populates="applications")


class MockInterview(Base):
    __tablename__ = "mock_interviews"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    job_id = Column(Integer, ForeignKey("jobs.id"))
    profile_id = Column(Integer, ForeignKey("resume_profiles.id"), nullable=True)
    questions = Column(JSON)  # List of dicts: {"question": "...", "strategy": "..."}
    generated_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job")
    user = relationship("User")


class ColdEmail(Base):
    __tablename__ = "cold_emails"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    job_id = Column(Integer, ForeignKey("jobs.id"))
    profile_id = Column(Integer, ForeignKey("resume_profiles.id"), nullable=True)
    email_body = Column(Text)
    generated_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job")
    user = relationship("User")


class ApplicationEvent(Base):
    """
    Immutable timeline of what happened to an application.
    Never update rows — only append. This makes funnel analytics
    trivially correct and audit-friendly.
    """
    __tablename__ = "application_events"
    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), index=True)
    event_type = Column(String, nullable=False)
    event_kind = Column(String, nullable=True)  # e.g. day_3, day_7, day_14 for followed_up
    # Valid event_types:
    #   applied          — initial submission
    #   followed_up      — user sent a follow-up (day 3 / 7 / 14)
    #   response_received — recruiter / hiring manager replied
    #   phone_screen     — scheduled / completed
    #   technical        — technical round scheduled / completed
    #   final_round      — final interview
    #   offer            — verbal or written offer received
    #   rejected         — explicit rejection
    #   ghosted          — user marks as no response after 21+ days
    occurred_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    note = Column(Text, nullable=True)  # user-written, never LLM-generated

    application = relationship("Application", backref="events")


class ImpactMetric(Base):
    """
    User-confirmed quantitative facts about their own work.
    Every number that appears in a generated resume bullet MUST
    trace back to a row here (user_provided=True) or to literal
    text already in master_resume. The generation validator
    enforces this — never the LLM prompt alone.

    source_ref uses JSONPath-style notation so we can pinpoint
    the exact bullet that prompted the question, e.g.:
        'experience[0].highlights[2]'
        'projects[1].highlights[0]'
    """
    __tablename__ = "impact_metrics"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    profile_id = Column(Integer, ForeignKey("resume_profiles.id"), nullable=True)
    source_ref = Column(String, nullable=False)   # e.g. "experience[0].highlights[2]"
    original_bullet = Column(Text, nullable=True)  # the vague bullet that triggered the question
    question_asked = Column(Text, nullable=True)   # exact question shown to user
    metric_value = Column(String, nullable=False)  # "500", "40", "3"
    metric_unit = Column(String, nullable=False)   # "users", "%", "hours/week", "$", "ms"
    user_qualifier = Column(String, nullable=True) # "about", "over", "approximately" — preserved verbatim
    user_provided = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


def create_tables():
    Base.metadata.create_all(bind=engine)
