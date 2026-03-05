from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


# User and Auth
class UserCreate(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    created_at: Optional[datetime]
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: str

class TokenRefreshRequest(BaseModel):
    refresh_token: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Candidate Profile
class MasterResumeExperience(BaseModel):
    title: str
    company: str
    start_date: str
    end_date: Optional[str] = "Present"
    description: List[str]
    technologies: Optional[List[str]] = []

class MasterResumeProject(BaseModel):
    name: str
    description: str
    technologies: List[str]
    link: Optional[str] = None
    highlights: Optional[List[str]] = []

class MasterResumeEducation(BaseModel):
    degree: str
    institution: str
    year: str
    gpa: Optional[str] = None

class MasterResume(BaseModel):
    summary: Optional[str] = None
    experience: Optional[List[MasterResumeExperience]] = []
    projects: Optional[List[MasterResumeProject]] = []
    education: Optional[List[MasterResumeEducation]] = []
    certifications: Optional[List[str]] = []
    languages: Optional[List[str]] = []

class CandidateProfileCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    skills: List[str] = []
    experience_level: str = "fresher"
    preferred_roles: List[str] = []
    preferred_locations: List[str] = []
    remote_preference: str = "any"
    min_salary: Optional[int] = None
    target_companies: Optional[List[str]] = []
    master_resume: Optional[Dict[str, Any]] = None

class CandidateProfileOut(CandidateProfileCreate):
    id: int
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# Job
class JobOut(BaseModel):
    id: int
    external_id: str
    source: str
    company: str
    role: str
    location: Optional[str]
    salary: Optional[str]
    description: str
    apply_link: str
    posted_date: Optional[datetime]
    fetched_date: Optional[datetime]
    score: Optional["JobScoreOut"] = None
    class Config:
        from_attributes = True

class JobScoreOut(BaseModel):
    score: float
    explanation: Dict[str, Any]
    scored_at: Optional[datetime]
    class Config:
        from_attributes = True

class UrlInput(BaseModel):
    url: str

JobOut.model_rebuild()


# Resume
class ResumeOut(BaseModel):
    id: int
    job_id: int
    resume_data: Optional[Dict[str, Any]]
    cover_letter: Optional[str]
    file_path_json: Optional[str]
    file_path_docx: Optional[str]
    file_path_pdf: Optional[str]
    generated_date: Optional[datetime]
    class Config:
        from_attributes = True


# Application
class ApplicationCreate(BaseModel):
    job_id: int
    notes: Optional[str] = None

class ApplicationUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class ApplicationOut(BaseModel):
    id: int
    job_id: int
    resume_id: Optional[int]
    status: str
    applied_date: Optional[datetime]
    notes: Optional[str]
    created_at: Optional[datetime]
    job: Optional[JobOut] = None
    class Config:
        from_attributes = True


# Scoring
class ScoreExplanation(BaseModel):
    matched_skills: List[str]
    missing_keywords: List[str]
    location_match: bool
    salary_match: Optional[bool]
    experience_match: bool
    recency_score: float
    reasoning: str


# AI Tools
class MockInterviewOut(BaseModel):
    id: int
    job_id: int
    questions: List[Dict[str, str]]
    generated_at: Optional[datetime]
    class Config:
        from_attributes = True

class MockInterviewUpdate(BaseModel):
    questions: List[Dict[str, str]]

class ColdEmailOut(BaseModel):
    id: int
    job_id: int
    email_body: str
    generated_at: Optional[datetime]
    class Config:
        from_attributes = True

class ColdEmailUpdate(BaseModel):
    email_body: str
