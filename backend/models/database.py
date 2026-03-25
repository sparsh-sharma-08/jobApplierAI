from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
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
    created_at = Column(DateTime, default=datetime.utcnow)
    profile = relationship("CandidateProfile", back_populates="user", uselist=False)
    jobs = relationship("Job", back_populates="user")
    applications = relationship("Application", back_populates="user")


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
    target_companies = Column(JSON)  # list of strings
    master_resume = Column(JSON)  # structured resume data
    weekly_digest = Column(Integer, default=1)  # 1 for True, 0 for False (for broader DB compatibility)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="profile")


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
    score = relationship("JobScore", back_populates="job", uselist=False)
    applications = relationship("Application", back_populates="job")
    user = relationship("User", back_populates="jobs")


class JobScore(Base):
    __tablename__ = "scores"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), unique=True)
    score = Column(Float)
    explanation = Column(JSON)
    scored_at = Column(DateTime, default=datetime.utcnow)
    job = relationship("Job", back_populates="score")


class Resume(Base):
    __tablename__ = "resumes"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"))
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
    resume_id = Column(Integer, ForeignKey("resumes.id"), nullable=True)
    status = Column(String, default="pending")  # pending, applied, interview, rejected, offer, no_response
    applied_date = Column(DateTime, nullable=True)
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
    questions = Column(JSON)  # List of dicts: {"question": "...", "strategy": "..."}
    generated_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job")
    user = relationship("User")


class ColdEmail(Base):
    __tablename__ = "cold_emails"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    job_id = Column(Integer, ForeignKey("jobs.id"))
    email_body = Column(Text)
    generated_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job")
    user = relationship("User")


def create_tables():
    Base.metadata.create_all(bind=engine)
