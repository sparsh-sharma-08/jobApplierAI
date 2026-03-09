"""
Job Matching & Scoring Engine
Evaluates job postings against candidate profile.
"""
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import logging
import numpy as np

try:
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError:
    pass # Will be handled by the script runner

from services.embedding_service import embedding_service

logger = logging.getLogger(__name__)


def normalize_text(text: str) -> str:
    return re.sub(r'[^a-z0-9\s]', ' ', text.lower())


def extract_keywords(text: str) -> set:
    words = normalize_text(text).split()
    stopwords = {'the', 'a', 'an', 'and', 'or', 'in', 'at', 'for', 'to', 'of', 'with', 'on', 'is', 'are', 'be',
                 'will', 'have', 'has', 'we', 'you', 'our', 'your', 'this', 'that', 'as', 'by', 'from', 'about',
                 'team', 'work', 'experience', 'looking', 'seeking', 'role', 'position', 'candidate', 'required',
                 'preferred', 'strong', 'good', 'excellent', 'ability', 'skills', 'using', 'use', 'must', 'also',
                 'new', 'other', 'more', 'not', 'do', 'all', 'but', 'into', 'than', 'then', 'up', 'its', 'it'}
    return {w for w in words if len(w) > 2 and w not in stopwords}


def score_job(
    job: Dict[str, Any],
    profile: Dict[str, Any],
    threshold: int = 40
) -> Dict[str, Any]:
    """
    Score a job against candidate profile.
    Returns score (0-100) and explanation.
    """
    score = 0
    matched_skills = []
    missing_keywords = []

    candidate_skills = [s.lower() for s in profile.get("skills", [])]
    candidate_skills_set = set(candidate_skills)
    description = (job.get("description") or "").lower()
    role = (job.get("role") or "").lower()
    full_text = description + " " + role

    # --- 1. Semantic Vector Match (0–60 points) ---
    semantic_score = 0
    try:
        # Flatten master resume into a searchable document string
        master_resume = profile.get("master_resume")
        if master_resume and isinstance(master_resume, dict):
            resume_text = f"{master_resume.get('summary', '')} "
            for exp in master_resume.get("experience", []):
                resume_text += f"{exp.get('title', '')} {exp.get('company', '')} {exp.get('description', '')} "
            for proj in master_resume.get("projects", []):
                resume_text += f"{proj.get('name', '')} {proj.get('description', '')} "
        else:
            resume_text = " ".join(candidate_skills)

        # Get Embeddings
        # In a real heavy traffic system, we should pass user_id to cache the resume,
        # but for this fallback we will just recompute or use a dummy ID 0
        resume_vector = embedding_service.get_resume_embedding(0, resume_text).reshape(1, -1)
        job_vector = embedding_service.encode(full_text).reshape(1, -1)
        
        # Calculate Cosine Similarity (-1 to 1) -> scaled to (0 to 1)
        similarity = cosine_similarity(resume_vector, job_vector)[0][0]
        # Only reward positive similarity
        if similarity > 0:
            semantic_score = similarity * 60  # 60% of total score
            
    except Exception as e:
        logger.error(f"Semantic scoring failed, falling back to 0: {e}")
        
    score += semantic_score

    # --- 2. Hard Skill/Keyword Match (0–20 points) ---
    tech_keywords_in_jd = extract_keywords(full_text)

    for skill in candidate_skills:
        if skill in full_text or any(skill in kw or kw in skill for kw in tech_keywords_in_jd):
            matched_skills.append(skill)

    jd_keywords = extract_keywords(full_text)
    candidate_keywords = extract_keywords(" ".join(candidate_skills))
    keyword_overlap = jd_keywords & candidate_keywords
    
    # 20 max points out of the total 100
    keyword_score = min(20, int((len(keyword_overlap) / max(len(jd_keywords), 1)) * 20))
    score += keyword_score

    # Find truly missing skills dynamically from the job description itself, not a hardcoded engineering list
    # Extract important keywords from the JD (using the same extract_keywords filter to drop stopwords)
    jd_keywords_set = extract_keywords(full_text)
    
    # Filter out common buzzwords that aren't real skills
    buzzwords = {'team', 'work', 'experience', 'looking', 'seeking', 'role', 'position', 'requirements', 'years'}
    meaningful_jd_words = {kw for kw in jd_keywords_set if kw not in buzzwords and len(kw) > 2}
    
    # Calculate words in JD that the user does not have in their skills/resume
    for kw in meaningful_jd_words:
        # Check if this keyword is anywhere in the candidate's skills string
        candidate_skills_str = " ".join(candidate_skills)
        if kw not in candidate_skills_str:
            # We also check that the keyword appeared multiple times to ensure it's a real "skill"
            # Or if it's a known tech/domain term. Since we want this to be domain agnostic,
            # we'll just check if it appears in the text.
            missing_keywords.append(kw)
            
    # Sort them by frequency in the JD to surface the most critical missing ones
    # (Since we just have a set, we'll count occurrences in full_text to rank them)
    missing_keywords.sort(key=lambda kw: full_text.count(kw), reverse=True)

    # --- Experience Compatibility (0–20 points) ---
    exp_level = profile.get("experience_level", "fresher").lower()
    experience_match = True
    exp_score = 10  # default neutral

    exp_patterns = {
        "fresher": ["fresher", "entry level", "0-1 year", "no experience", "fresh graduate", "graduate"],
        "junior": ["junior", "1-2 year", "1-3 year", "entry"],
        "mid": ["mid", "2-4 year", "3-5 year", "intermediate"],
        "senior": ["senior", "5+ year", "lead", "principal"]
    }

    jd_lower = full_text
    matched_level = None
    for level, patterns in exp_patterns.items():
        if any(p in jd_lower for p in patterns):
            matched_level = level

    if matched_level is None or matched_level == exp_level:
        exp_score = 20
    elif (exp_level == "fresher" and matched_level == "junior") or \
         (exp_level == "junior" and matched_level in ["fresher", "mid"]):
        exp_score = 14
    else:
        exp_score = 5
        experience_match = False

    score += exp_score

    # --- Location Preference (0–15 points) ---
    location_match = False
    loc_score = 7  # neutral
    preferred_locations = [l.lower() for l in profile.get("preferred_locations", [])]
    remote_pref = profile.get("remote_preference", "any").lower()
    job_location = (job.get("location") or "").lower()

    if remote_pref in ["remote", "any"] and ("remote" in job_location or "anywhere" in job_location):
        loc_score = 15
        location_match = True
    elif preferred_locations:
        for pref_loc in preferred_locations:
            if pref_loc in job_location:
                loc_score = 15
                location_match = True
                break
        if not location_match and remote_pref == "remote":
            loc_score = 3
    else:
        loc_score = 10  # no preference means any is fine

    score += loc_score

    # Removed the chaotic Salary regex matching that mistakenly penalized users.

    # --- 3. Job Recency (0–10 points) ---
    recency_score = 5.0
    posted_date = job.get("posted_date")
    if posted_date:
        if isinstance(posted_date, str):
            try:
                posted_date = datetime.fromisoformat(posted_date)
            except Exception:
                posted_date = None
        if posted_date:
            if posted_date.tzinfo is not None:
                posted_date = posted_date.replace(tzinfo=None)
            days_old = (datetime.utcnow() - posted_date).days
            if days_old <= 2:
                recency_score = 10.0
            elif days_old <= 7:
                recency_score = 8.0
            elif days_old <= 14:
                recency_score = 5.0
            elif days_old <= 30:
                recency_score = 2.0
            else:
                recency_score = 0.0

    score += recency_score

    # --- Role Title Match (bonus up to 5) ---
    preferred_roles = [r.lower() for r in profile.get("preferred_roles", [])]
    role_bonus = 0
    for pref_role in preferred_roles:
        if pref_role in role or any(word in role for word in pref_role.split()):
            role_bonus = 5
            break
    score = min(100, score + role_bonus)

    explanation = {
        "matched_skills": matched_skills,
        "missing_keywords": missing_keywords[:10],
        "location_match": location_match,
        "experience_match": experience_match,
        "recency_score": recency_score,
        "breakdown": {
            "semantic_score": round(semantic_score, 2),
            "keyword_score": round(keyword_score, 2),
            "experience_score": round(exp_score, 2),
            "location_score": round(loc_score, 2),
            "recency_score": round(recency_score, 2),
            "role_bonus": role_bonus
        },
        "reasoning": _generate_reasoning(matched_skills, missing_keywords, location_match, experience_match, score)
    }

    return {
        "score": round(score, 2),
        "explanation": explanation
    }


def _generate_reasoning(matched_skills, missing_keywords, location_match, experience_match, score) -> str:
    parts = []
    if matched_skills:
        parts.append(f"Strong skill alignment with: {', '.join(matched_skills[:5])}")
    if missing_keywords:
        parts.append(f"Could improve by adding: {', '.join(missing_keywords[:3])}")
    if not location_match:
        parts.append("Location may not match your preferences")
    if not experience_match:
        parts.append("Experience level mismatch detected")
    if score >= 75:
        parts.append("Excellent match — highly recommended to apply")
    elif score >= 50:
        parts.append("Good match — worth applying")
    elif score >= 35:
        parts.append("Moderate match — consider applying")
    else:
        parts.append("Low match — may not be the best fit")
    return ". ".join(parts)


def batch_score_jobs(jobs: List[Dict], profile: Dict, threshold: int = 40) -> List[Dict]:
    results = []
    for job in jobs:
        result = score_job(job, profile)
        result["job_id"] = job.get("id")
        if result["score"] >= threshold:
            results.append(result)
    results.sort(key=lambda x: x["score"], reverse=True)
    return results
