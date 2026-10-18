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
    is_verified: bool
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

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

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
    salary_currency: Optional[str] = "USD"  # ISO 4217 code for salary comparison (e.g. USD, INR, GBP)
    target_companies: Optional[List[str]] = []
    master_resume: Optional[Dict[str, Any]] = None
    weekly_digest: bool = True

class CandidateProfileOut(CandidateProfileCreate):
    id: int
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# Resume Profile
class ResumeProfileCreate(BaseModel):
    name: str
    role_title: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = []
    experience_level: Optional[str] = "mid"
    preferred_roles: Optional[List[str]] = []
    master_resume: Optional[Dict[str, Any]] = None
    is_default: bool = False

class ResumeProfileUpdate(BaseModel):
    name: Optional[str] = None
    role_title: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    experience_level: Optional[str] = None
    preferred_roles: Optional[List[str]] = None
    master_resume: Optional[Dict[str, Any]] = None
    is_default: Optional[bool] = None

class ResumeProfileOut(BaseModel):
    id: int
    user_id: int
    name: str
    role_title: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = []
    experience_level: Optional[str] = "mid"
    preferred_roles: Optional[List[str]] = []
    master_resume: Optional[Dict[str, Any]] = None
    is_default: bool = False
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    class Config:
        from_attributes = True


# Job
class JobOut(BaseModel):
    id: int
    external_id: Optional[str] = "unknown"
    source: Optional[str] = "unknown"
    company: Optional[str] = "Unknown Company"
    role: Optional[str] = "Unknown Role"
    location: Optional[str] = None
    salary: Optional[str] = None
    description: Optional[str] = ""
    apply_link: Optional[str] = ""
    posted_date: Optional[datetime] = None
    fetched_date: Optional[datetime] = None
    recency_label: Optional[str] = None
    score: Optional["JobScoreOut"] = None
    status: Optional[str] = "saved"
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
    raw_text: Optional[str] = None

class JobCreateManual(BaseModel):
    role: str
    company: str
    location: Optional[str] = "Remote"
    salary: Optional[str] = ""
    description: Optional[str] = ""
    apply_link: Optional[str] = ""

class JobParseTextRequest(BaseModel):
    text: str
    url: Optional[str] = ""

JobOut.model_rebuild()


class JobListOut(BaseModel):
    """Envelope for GET /jobs when apply_preferences=true.
    total: count of jobs after preference filtering.
    hidden_by_preferences: count excluded by preference rules.
    jobs: the (paginated) result set.
    """
    total: int
    hidden_by_preferences: int
    jobs: List[JobOut]

    class Config:
        from_attributes = True

class JobBulkAction(BaseModel):
    action: str # "delete" or "mark_applied"
    job_ids: List[int]
    profile_id: Optional[int] = None


# Resume
class ResumeOut(BaseModel):
    id: int
    job_id: int
    profile_id: Optional[int] = None
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
    profile_id: Optional[int] = None
    status: Optional[str] = "applied"
    notes: Optional[str] = None

class ApplicationUpdate(BaseModel):
    status: Optional[str] = None
    profile_id: Optional[int] = None
    notes: Optional[str] = None
    applied_date: Optional[datetime] = None

class ApplicationOut(BaseModel):
    id: int
    job_id: Optional[int] = None
    profile_id: Optional[int] = None
    resume_id: Optional[int]
    status: str
    applied_date: Optional[datetime]
    applied_date_estimated: Optional[bool] = False
    notes: Optional[str]
    created_at: Optional[datetime]
    job: Optional[JobOut] = None
    class Config:
        from_attributes = True


# Application Events & Follow-up Tracking
class ApplicationEventCreate(BaseModel):
    event_type: str  # applied, followed_up, response_received, phone_screen, technical, final_round, offer, rejected, ghosted
    event_kind: Optional[str] = None  # day_3, day_7, day_14
    note: Optional[str] = None
    occurred_at: Optional[datetime] = None
    applied_date: Optional[datetime] = None


class ApplicationEventOut(BaseModel):
    id: int
    application_id: int
    event_type: str
    event_kind: Optional[str] = None
    note: Optional[str] = None
    occurred_at: datetime
    class Config:
        from_attributes = True


class FollowUpDueOut(BaseModel):
    kind: str
    due_since: datetime
    days_overdue: int
    message: str


class ApplicationFollowUpStateOut(BaseModel):
    application_id: int
    applied_date: Optional[datetime]
    applied_date_estimated: Optional[bool] = False
    company: str
    role: str
    days_since_applied: int
    due_now: List[FollowUpDueOut]
    already_followed_up_kinds: List[str]
    has_response: bool
    dismissed_kinds: List[str] = []
    next_action_date: Optional[datetime] = None


class FunnelAnalyticsOut(BaseModel):
    # Raw counts — always shown
    total_tracked: int          # all applications in tracker
    applied_count: int          # apps with an applied event or applied_date set
    response_count: int         # apps with a response_received/phone_screen/etc event
    interview_count: int        # apps with phone_screen/technical/final_round event
    offer_count: int
    rejected_count: int
    ghosted_count: int

    # Rates — only meaningful when applied_count >= 10
    response_rate: Optional[float] = None   # response_count / applied_count * 100
    interview_rate: Optional[float] = None  # interview_count / applied_count * 100

    # Flag: when True the UI should hide percentages and show only counts
    sample_too_small: bool      # True when applied_count < 10



# Impact Metrics
class ImpactMetricCreate(BaseModel):
    source_ref: str
    original_bullet: Optional[str] = None
    question_asked: Optional[str] = None
    metric_value: str
    metric_unit: str
    user_qualifier: Optional[str] = None
    profile_id: Optional[int] = None


class ImpactMetricOut(BaseModel):
    id: int
    source_ref: str
    original_bullet: Optional[str] = None
    question_asked: Optional[str] = None
    metric_value: str
    metric_unit: str
    user_qualifier: Optional[str] = None
    user_provided: bool
    profile_id: Optional[int] = None
    created_at: datetime
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

class StatsOut(BaseModel):
    total_profiles: int
    total_resumes: int
