"""
Job Matching & Scoring Engine
Evaluates job postings against candidate profile.
"""
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import logging

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

    # --- Skill Match (0–35 points) ---
    tech_keywords_in_jd = extract_keywords(full_text)

    for skill in candidate_skills:
        # check exact or substring match
        if skill in full_text or any(skill in kw or kw in skill for kw in tech_keywords_in_jd):
            matched_skills.append(skill)

    skill_score = min(35, int((len(matched_skills) / max(len(candidate_skills), 1)) * 35))
    score += skill_score

    # --- Keyword Match (0–20 points) ---
    jd_keywords = extract_keywords(full_text)
    candidate_keywords = extract_keywords(" ".join(candidate_skills))
    keyword_overlap = jd_keywords & candidate_keywords
    keyword_score = min(20, int((len(keyword_overlap) / max(len(jd_keywords), 1)) * 100))
    score += keyword_score

    # Find important missing keywords (tech terms in JD not in candidate profile)
    tech_indicators = ['python', 'java', 'javascript', 'typescript', 'react', 'node', 'aws', 'docker',
                       'kubernetes', 'sql', 'nosql', 'mongodb', 'postgres', 'redis', 'kafka', 'go', 'rust',
                       'swift', 'kotlin', 'flutter', 'django', 'flask', 'fastapi', 'spring', 'angular', 'vue',
                       'graphql', 'rest', 'api', 'ci', 'cd', 'git', 'linux', 'ml', 'ai', 'tensorflow', 'pytorch']
    for kw in tech_indicators:
        if kw in full_text and kw not in candidate_skills_set:
            missing_keywords.append(kw)

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

    # --- Salary Match (-20 to 10 points) ---
    salary_match = None
    salary_score = 0  # neutral by default
    min_salary = profile.get("min_salary")
    job_salary_str = job.get("salary") or ""
    if min_salary and job_salary_str:
        s_str = job_salary_str.lower().replace(',', '').replace(' ', '')
        # extract ranges like 150000, 15lpa, 15l, 100k, $100k
        numbers = re.findall(r'(\d+)(k|lpa|l|m|cr)?', s_str)
        if numbers:
            max_offered = 0
            for num, suffix in numbers:
                val = int(num)
                if suffix == 'k': val *= 1000
                elif suffix in ('l', 'lpa'): val *= 100000
                elif suffix in ('cr'): val *= 10000000
                elif suffix == 'm': val *= 1000000
                if val > max_offered:
                    max_offered = val
            
            # Compare annual salaries
            if max_offered > 1000:
                if max_offered >= min_salary:
                    salary_score = 10
                    salary_match = True
                else:
                    salary_score = -20  # Strong penalty for paying below expectations
                    salary_match = False
    score += salary_score

    # --- Job Recency (0–5 points) ---
    recency_score = 3.0
    posted_date = job.get("posted_date")
    if posted_date:
        if isinstance(posted_date, str):
            try:
                posted_date = datetime.fromisoformat(posted_date)
            except Exception:
                posted_date = None
        if posted_date:
            # Strip timezone info to avoid naive/aware comparison errors
            if posted_date.tzinfo is not None:
                posted_date = posted_date.replace(tzinfo=None)
            days_old = (datetime.utcnow() - posted_date).days
            if days_old <= 2:
                recency_score = 5.0
            elif days_old <= 7:
                recency_score = 4.0
            elif days_old <= 14:
                recency_score = 3.0
            elif days_old <= 30:
                recency_score = 2.0
            else:
                recency_score = 1.0

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
        "salary_match": salary_match,
        "experience_match": experience_match,
        "recency_score": recency_score,
        "breakdown": {
            "skill_score": skill_score,
            "keyword_score": keyword_score,
            "experience_score": exp_score,
            "location_score": loc_score,
            "salary_score": salary_score,
            "recency_score": recency_score,
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
