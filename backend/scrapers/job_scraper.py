"""
Job Scrapers for various sources.
Uses free public JSON APIs, RSS/Atom feeds, and guest endpoints.
Targets Remote work and Software Engineering jobs in India and worldwide.
"""
import hashlib
import html
import logging
import random
import re
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import os

logger = logging.getLogger(__name__)

HTTP_PROXY = os.getenv("HTTP_PROXY")

# Common Indian tech hub cities for localized matching
INDIAN_CITIES = [
    "bengaluru", "bangalore", "hyderabad", "pune", "gurgaon", "gurugram",
    "noida", "delhi", "mumbai", "chennai", "kolkata", "ahmedabad", "kochi",
    "trivandrum", "chandigarh", "jaipur", "indore", "india"
]

SOFTWARE_ENGINEERING_KEYWORDS = [
    "software", "engineer", "developer", "backend", "frontend", "fullstack",
    "full-stack", "devops", "cloud", "python", "golang", "java", "react",
    "node", "ai", "ml", "data engineer", "sre", "distributed"
]


def _make_job_id(source: str, url: str) -> str:
    return hashlib.md5(f"{source}:{url}".encode()).hexdigest()[:16]


def _human_delay(min_s=0.5, max_s=1.5):
    time.sleep(random.uniform(min_s, max_s))


def _clean_html(raw_html: str) -> str:
    """Strip tags and unescape entities from an HTML snippet."""
    if not raw_html:
        return ""
    text = html.unescape(raw_html)
    text = re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split()).strip()


# ─────────────────────────────────────────────────────
# 1. Remotive  —  Public JSON API, no auth
# ─────────────────────────────────────────────────────
class RemotiveScraper:
    API_URL = "https://remotive.com/api/remote-jobs"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(0.5, 1.2)

            job_results = []
            effective_roles = roles if roles and any(r.strip() for r in roles) else ["Software Engineer"]

            for role in effective_roles[:3]:
                search_term = role.split()[0] if role else ""
                params = {"search": search_term, "limit": max_jobs * 2}
                response = requests.get(self.API_URL, params=params, headers=headers, timeout=15, proxies=proxies)
                response.raise_for_status()

                data = response.json()
                if "jobs" not in data:
                    continue

                for item in data["jobs"]:
                    if not isinstance(item, dict):
                        continue

                    location = item.get("candidate_required_location", "Remote")

                    if locations:
                        loc_lower = location.lower()
                        loc_match = (
                            any(l.lower() in loc_lower for l in locations)
                            or "worldwide" in loc_lower
                            or "anywhere" in loc_lower
                            or loc_lower == "remote"
                            or (any(c in loc_lower for c in INDIAN_CITIES) if any(l.lower() in ["india", "in"] for l in locations) else False)
                        )
                        if not loc_match:
                            continue

                    job_id = _make_job_id("remotive", str(item.get("id", item.get("url", ""))))
                    apply_link = item.get("url") or ""
                    description = _clean_html(item.get("description", ""))
                    posted_date = _parse_date(item.get("publication_date"))
                    salary = item.get("salary") or ""

                    job_results.append({
                        "external_id": job_id,
                        "source": "remotive",
                        "company": item.get("company_name", "Unknown"),
                        "role": item.get("title", ""),
                        "location": location,
                        "salary": salary,
                        "description": description[:5000],
                        "apply_link": apply_link,
                        "posted_date": posted_date,
                        "raw_data": {"category": item.get("category", ""), "id": item.get("id"), "remote": True}
                    })

                    if len(job_results) >= max_jobs:
                        break

                if len(job_results) >= max_jobs:
                    break

            return job_results

        except Exception as e:
            logger.error(f"Remotive scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 2. LinkedIn Guest API  —  India & Remote Software Engineering
# ─────────────────────────────────────────────────────
class LinkedInScraper:
    """
    Scrapes live LinkedIn job postings via the guest API without authentication.
    High yield for active Software Engineering jobs across India and Remote worldwide.
    """
    GUEST_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        import requests
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None

        job_results = []
        effective_roles = [r for r in roles if r.strip()] if roles and any(r.strip() for r in roles) else ["Software Engineer"]

        # Determine target locations (India or requested cities, plus remote)
        target_locations = []
        if locations:
            for loc in locations:
                target_locations.append(loc)
        else:
            target_locations = ["India"]

        for role in effective_roles[:2]:
            if len(job_results) >= max_jobs:
                break

            # Search India / user location
            for loc in target_locations[:2]:
                if len(job_results) >= max_jobs:
                    break
                try:
                    _human_delay(0.4, 0.9)
                    params = {
                        "keywords": role,
                        "location": loc,
                        "start": 0
                    }
                    resp = requests.get(self.GUEST_URL, params=params, headers=headers, timeout=12, proxies=proxies)
                    if resp.status_code == 200:
                        parsed = self._parse_html(resp.text, default_loc=loc)
                        for job in parsed:
                            if job["external_id"] not in [j["external_id"] for j in job_results]:
                                job_results.append(job)
                                if len(job_results) >= max_jobs:
                                    break
                except Exception as e:
                    logger.warning(f"LinkedIn scrape error for {role} in {loc}: {e}")

            # Also search Remote (f_WT=2)
            if len(job_results) < max_jobs:
                try:
                    _human_delay(0.4, 0.9)
                    params = {
                        "keywords": role,
                        "f_WT": "2",  # LinkedIn remote filter
                        "start": 0
                    }
                    resp = requests.get(self.GUEST_URL, params=params, headers=headers, timeout=12, proxies=proxies)
                    if resp.status_code == 200:
                        parsed = self._parse_html(resp.text, default_loc="Remote", is_remote=True)
                        for job in parsed:
                            if job["external_id"] not in [j["external_id"] for j in job_results]:
                                job_results.append(job)
                                if len(job_results) >= max_jobs:
                                    break
                except Exception as e:
                    logger.warning(f"LinkedIn scrape error for remote {role}: {e}")

        return job_results[:max_jobs]

    def _parse_html(self, html_text: str, default_loc: str = "India", is_remote: bool = False) -> List[Dict[str, Any]]:
        jobs = []
        cards = re.findall(r"<li\b[^>]*>(.*?)</li>", html_text, re.DOTALL)
        for card in cards:
            title_m = re.search(r"<h3 class=\"base-search-card__title\">\s*(.*?)\s*</h3>", card, re.DOTALL)
            if not title_m:
                continue
            title = _clean_html(title_m.group(1))
            if not title:
                continue

            comp_m = re.search(r"<h4 class=\"base-search-card__subtitle\">(?:.*?<a[^>]*>)?\s*(.*?)\s*(?:</a>)?\s*</h4>", card, re.DOTALL)
            company = _clean_html(comp_m.group(1)) if comp_m else "Unknown"

            loc_m = re.search(r"<span class=\"job-search-card__location\">\s*(.*?)\s*</span>", card, re.DOTALL)
            location = _clean_html(loc_m.group(1)) if loc_m else default_loc

            link_m = re.search(r"<a class=\"base-card__full-link[^\"]*\"\s+href=\"([^\"]+)\"", card)
            apply_link = link_m.group(1).split("?")[0].strip() if link_m else ""
            if not apply_link:
                continue

            date_m = re.search(r"<time[^>]*datetime=\"([^\"]+)\"", card)
            posted_date = _parse_date(date_m.group(1)) if date_m else datetime.utcnow().isoformat()

            desc = f"{title} at {company} ({location}). View requirements and apply directly via LinkedIn."

            job_id = _make_job_id("linkedin", apply_link)
            jobs.append({
                "external_id": job_id,
                "source": "linkedin",
                "company": company,
                "role": title,
                "location": location,
                "salary": "",
                "description": desc,
                "apply_link": apply_link,
                "posted_date": posted_date,
                "raw_data": {
                    "remote": is_remote or "remote" in location.lower(),
                    "location": location,
                }
            })
        return jobs


# ─────────────────────────────────────────────────────
# 3. RemoteOK  —  Public JSON API, no auth
# ─────────────────────────────────────────────────────
class RemoteOKScraper:
    """
    Public API for remote software engineering jobs.
    Contains high-paying engineering, backend, frontend, fullstack, and cloud roles.
    """
    API_URL = "https://remoteok.com/api"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "CareerCopilot/1.0 (contact@careercopilot.dev)"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(0.5, 1.2)

            response = requests.get(self.API_URL, headers=headers, timeout=15, proxies=proxies)
            response.raise_for_status()
            data = response.json()

            if not isinstance(data, list) or len(data) <= 1:
                return []

            # First element is a disclaimer object, actual jobs follow
            job_items = [item for item in data[1:] if isinstance(item, dict)]
            role_keywords = _build_keywords(roles) if roles and any(r.strip() for r in roles) else []

            jobs = []
            for item in job_items:
                position = item.get("position") or ""
                pos_lower = position.lower()
                tags = [str(t).lower() for t in item.get("tags", [])]
                tags_str = " ".join(tags)

                # Prioritize software engineering jobs
                is_engineering = any(k in tags_str or k in pos_lower for k in [
                    "dev", "engineer", "software", "backend", "frontend", "fullstack",
                    "full stack", "python", "react", "golang", "java", "node", "devops",
                    "cloud", "ai", "machine learning", "data", "web"
                ])
                if not is_engineering:
                    continue

                if role_keywords and not any(kw in pos_lower or kw in tags_str for kw in role_keywords):
                    continue

                apply_link = item.get("url") or item.get("apply_url") or ""
                if not apply_link:
                    continue
                if apply_link.startswith("/"):
                    apply_link = "https://remoteok.com" + apply_link

                job_id = _make_job_id("remoteok", str(item.get("id") or apply_link))
                company = item.get("company") or "Unknown"

                # Salary format
                sal_min = item.get("salary_min")
                sal_max = item.get("salary_max")
                salary = ""
                if sal_min and sal_max:
                    salary = f"${int(sal_min):,} - ${int(sal_max):,}"
                elif sal_min:
                    salary = f"${int(sal_min):,}+"

                desc = _clean_html(item.get("description", ""))
                posted_date = _parse_date(item.get("date"))

                jobs.append({
                    "external_id": job_id,
                    "source": "remoteok",
                    "company": company,
                    "role": position,
                    "location": "Remote",
                    "salary": salary,
                    "description": desc[:5000],
                    "apply_link": apply_link,
                    "posted_date": posted_date,
                    "raw_data": {
                        "tags": tags,
                        "remote": True,
                        "location": item.get("location", "Worldwide"),
                    }
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"RemoteOK scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 4. Instahyre  —  Public JSON API (India Tech Focused)
# ─────────────────────────────────────────────────────
class InstahyreScraper:
    """
    Premier Indian tech jobs platform.
    Maps software engineering queries to high-density technical skills for maximum yield.
    """
    API_URL = "https://www.instahyre.com/api/v1/job_search"

    # Skill expansion map for software engineering queries
    SKILL_MAP = {
        "software": ["software", "backend", "fullstack", "python"],
        "backend": ["backend", "python", "golang", "java", "node"],
        "frontend": ["frontend", "react", "javascript", "vue"],
        "fullstack": ["fullstack", "react", "node", "python"],
        "full stack": ["fullstack", "react", "node", "python"],
        "devops": ["devops", "cloud", "aws", "kubernetes"],
        "cloud": ["cloud", "aws", "devops"],
        "data": ["data engineer", "python", "sql"],
        "ai": ["machine learning", "python", "deep learning"],
        "ml": ["machine learning", "python"],
    }

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(0.5, 1.2)

            skills_to_query = []
            if roles and any(r.strip() for r in roles):
                for r in roles:
                    r_low = r.lower()
                    matched = False
                    for key, mapped_skills in self.SKILL_MAP.items():
                        if key in r_low:
                            skills_to_query.extend(mapped_skills)
                            matched = True
                            break
                    if not matched:
                        skills_to_query.append(r.split()[0])
            else:
                skills_to_query = ["software", "backend", "python", "fullstack"]

            # Deduplicate skills while preserving order
            seen_skills = set()
            query_skills = []
            for s in skills_to_query:
                if s not in seen_skills:
                    seen_skills.add(s)
                    query_skills.append(s)

            job_results = []
            target_location = locations[0] if locations else None

            for skill in query_skills[:4]:
                if len(job_results) >= max_jobs:
                    break

                params = {"skills": skill}
                if target_location:
                    params["location"] = target_location

                try:
                    response = requests.get(self.API_URL, params=params, headers=headers, timeout=12, proxies=proxies)
                    response.raise_for_status()
                    data = response.json()
                except Exception as e:
                    logger.warning(f"Instahyre API error for skill '{skill}': {e}")
                    continue

                for item in data.get("objects", []):
                    if not isinstance(item, dict):
                        continue

                    job_id = _make_job_id("instahyre", str(item.get("id", "")))
                    if any(j["external_id"] == job_id for j in job_results):
                        continue

                    apply_link = item.get("public_url") or f"/job-{item.get('id')}"
                    if apply_link.startswith("/"):
                        apply_link = "https://www.instahyre.com" + apply_link

                    title = item.get("title", "")
                    emp_info = item.get("employer", {})
                    company = emp_info.get("company_name", "Unknown") if isinstance(emp_info, dict) else "Unknown"

                    loc_list = [loc.get("name", "") for loc in item.get("locations", []) if isinstance(loc, dict)]
                    location = ", ".join(loc_list) if loc_list else "India"

                    description = f"{title} at {company} ({location}). Apply on Instahyre."
                    posted_date = _parse_date(item.get("published_at"))

                    job_results.append({
                        "external_id": job_id,
                        "source": "instahyre",
                        "company": company,
                        "role": title,
                        "location": location,
                        "salary": "",
                        "description": description[:5000],
                        "apply_link": apply_link,
                        "posted_date": posted_date,
                        "raw_data": {"id": item.get("id"), "location": location}
                    })

                    if len(job_results) >= max_jobs:
                        break

            return job_results

        except Exception as e:
            logger.error(f"Instahyre scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 5. Hasjob  —  HasGeek Developer Community Feed (India & Remote)
# ─────────────────────────────────────────────────────
class HasjobScraper:
    """
    Premier Indian developer job board run by the HasGeek tech community.
    Covers Bangalore, Pune, Mumbai, Delhi-NCR, and Remote India tech opportunities.
    """
    FEED_URL = "https://hasjob.co/feed"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(0.3, 0.8)

            resp = requests.get(self.FEED_URL, headers=headers, timeout=12, proxies=proxies)
            resp.raise_for_status()
            xml_text = resp.text

            entries = re.findall(r"<entry>(.*?)</entry>", xml_text, re.DOTALL)
            role_keywords = _build_keywords(roles) if roles and any(r.strip() for r in roles) else []

            jobs = []
            for entry in entries:
                title_m = re.search(r"<title[^>]*>(.*?)</title>", entry, re.DOTALL)
                if not title_m:
                    continue
                full_title = _clean_html(title_m.group(1))

                link_m = re.search(r"<link[^>]*href=\"([^\"]+)\"", entry)
                apply_link = link_m.group(1).strip() if link_m else ""
                if not apply_link:
                    continue

                content_m = re.search(r"<content[^>]*>(.*?)</content>", entry, re.DOTALL)
                content = _clean_html(content_m.group(1)) if content_m else ""

                pub_m = re.search(r"<(?:published|updated)>(.*?)</(?:published|updated)>", entry)
                pub_date = _parse_date(pub_m.group(1)) if pub_m else datetime.utcnow().isoformat()

                # Parse Company and Role
                if " at " in full_title:
                    parts = full_title.split(" at ", 1)
                    role_title = parts[0].strip()
                    company = parts[1].strip()
                elif " - " in full_title:
                    parts = full_title.split(" - ", 1)
                    role_title = parts[0].strip()
                    company = parts[1].strip()
                else:
                    role_title = full_title
                    company = "Tech Startup"

                # Check relevance to software engineering
                title_lower = full_title.lower()
                desc_lower = content.lower()

                if role_keywords and not any(kw in title_lower or kw in desc_lower for kw in role_keywords):
                    # If not matched user's role keyword, allow if it matches software keywords
                    if not any(sw in title_lower for sw in SOFTWARE_ENGINEERING_KEYWORDS):
                        continue

                # Determine location: check content or title for Indian tech hubs
                location = "India / Remote"
                for city in INDIAN_CITIES:
                    if city in desc_lower[:300] or city in title_lower:
                        location = city.capitalize() + ", India"
                        break
                if "remote" in desc_lower[:300] or "remote" in title_lower:
                    location = "Remote / India"

                job_id = _make_job_id("hasjob", apply_link)
                jobs.append({
                    "external_id": job_id,
                    "source": "hasjob",
                    "company": company,
                    "role": role_title,
                    "location": location,
                    "salary": "",
                    "description": content[:5000],
                    "apply_link": apply_link,
                    "posted_date": pub_date,
                    "raw_data": {"remote": "remote" in location.lower(), "location": location}
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"Hasjob scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 6. Jobicy  —  Public JSON API, no auth
# ─────────────────────────────────────────────────────
class JobicyScraper:
    API_URL = "https://jobicy.com/api/v2/remote-jobs"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            role_keywords = _build_keywords(roles) if roles and any(r.strip() for r in roles) else []

            jobs = []
            _human_delay(0.4, 1.0)
            params = {"count": 50}

            response = requests.get(self.API_URL, params=params, headers=headers, timeout=15, proxies=proxies)
            response.raise_for_status()
            data = response.json()

            for item in data.get("jobs", []):
                title = (item.get("jobTitle") or "").lower()
                industry_raw = item.get("jobIndustry", "")
                industry = " ".join(industry_raw).lower() if isinstance(industry_raw, list) else str(industry_raw).lower()
                excerpt = (item.get("jobExcerpt") or "").lower()

                if role_keywords and not any(kw in title or kw in industry or kw in excerpt for kw in role_keywords):
                    continue

                geo = item.get("jobGeo", "")
                location = geo if geo else "Remote"

                if locations:
                    loc_lower = location.lower()
                    loc_match = any(l.lower() in loc_lower for l in locations) or "anywhere" in loc_lower or "worldwide" in loc_lower or loc_lower == "remote"
                    if not loc_match:
                        continue

                url = item.get("url", "")
                if not url:
                    continue
                job_id = _make_job_id("jobicy", url or str(item.get("id", "")))
                posted_date = _parse_date(item.get("pubDate"))
                desc = _clean_html(item.get("jobDescription") or item.get("jobExcerpt") or "")

                jobs.append({
                    "external_id": job_id,
                    "source": "jobicy",
                    "company": item.get("companyName", "Unknown"),
                    "role": item.get("jobTitle", ""),
                    "location": location,
                    "salary": "",
                    "description": desc[:5000],
                    "apply_link": url,
                    "posted_date": posted_date,
                    "raw_data": {
                        "jobType": item.get("jobType", []),
                        "jobLevel": item.get("jobLevel", ""),
                        "remote": True,
                    }
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"Jobicy scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 7. Himalayas.app  —  Public JSON API, no auth
# ─────────────────────────────────────────────────────
class HimalayasScraper:
    API_URL = "https://himalayas.app/jobs/api"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            role_keywords = _build_keywords(roles) if roles and any(r.strip() for r in roles) else []

            jobs = []
            _human_delay(0.4, 1.0)
            params = {"limit": min(max_jobs * 3, 100)}
            response = requests.get(self.API_URL, params=params, headers=headers, timeout=15, proxies=proxies)
            response.raise_for_status()
            data = response.json()

            for item in data.get("jobs", []):
                title = (item.get("title") or "").lower()
                categories = " ".join(item.get("categories", [])).lower()
                excerpt = (item.get("excerpt") or "").lower()

                if role_keywords and not any(kw in title or kw in categories or kw in excerpt for kw in role_keywords):
                    continue

                loc_restrictions = item.get("locationRestrictions", [])
                location = ", ".join(loc_restrictions) if loc_restrictions else "Remote / Worldwide"

                if locations:
                    loc_lower = location.lower()
                    loc_match = any(l.lower() in loc_lower for l in locations) or "worldwide" in loc_lower or "anywhere" in loc_lower
                    if not loc_match and loc_restrictions:
                        continue

                apply_link = item.get("applicationLink") or item.get("guid") or ""
                if not apply_link:
                    continue
                job_id = _make_job_id("himalayas", apply_link)
                posted_date = _parse_date(item.get("pubDate"))

                salary = ""
                min_sal = item.get("minSalary")
                max_sal = item.get("maxSalary")
                currency = item.get("currency", "USD")
                if min_sal and max_sal:
                    salary = f"{currency} {int(min_sal):,} - {int(max_sal):,}"
                elif min_sal:
                    salary = f"{currency} {int(min_sal):,}+"

                description = _clean_html(item.get("description") or item.get("excerpt") or "")

                jobs.append({
                    "external_id": job_id,
                    "source": "himalayas",
                    "company": item.get("companyName", "Unknown"),
                    "role": item.get("title", ""),
                    "location": location,
                    "salary": salary,
                    "description": description[:5000],
                    "apply_link": apply_link,
                    "posted_date": posted_date,
                    "raw_data": {
                        "seniority": item.get("seniority", ""),
                        "remote": True,
                    }
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"Himalayas scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 8. Arbeitnow  —  Public JSON API, no auth
# ─────────────────────────────────────────────────────
class ArbeitnowScraper:
    """
    Free job board API with explicit remote filtering and rich tech job listings.
    """
    API_URL = "https://www.arbeitnow.com/api/job-board-api"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(0.3, 0.8)

            resp = requests.get(self.API_URL, headers=headers, timeout=12, proxies=proxies)
            resp.raise_for_status()
            data = resp.json()

            items = data.get("data", [])
            role_keywords = _build_keywords(roles) if roles and any(r.strip() for r in roles) else []

            jobs = []
            for item in items:
                title = item.get("title", "")
                title_low = title.lower()
                tags = [str(t).lower() for t in item.get("tags", [])]
                tags_str = " ".join(tags)
                is_remote = bool(item.get("remote", False))
                loc = "Remote" if is_remote else item.get("location", "Remote")

                # Filter software / tech relevance
                is_tech = any(k in tags_str or k in title_low for k in SOFTWARE_ENGINEERING_KEYWORDS)
                if not is_tech:
                    continue

                if role_keywords and not any(kw in title_low or kw in tags_str for kw in role_keywords):
                    continue

                apply_link = item.get("url", "")
                if not apply_link:
                    continue

                job_id = _make_job_id("arbeitnow", item.get("slug") or apply_link)
                desc = _clean_html(item.get("description", ""))
                posted_date = _parse_date(item.get("created_at"))

                jobs.append({
                    "external_id": job_id,
                    "source": "arbeitnow",
                    "company": item.get("company_name", "Unknown"),
                    "role": title,
                    "location": loc,
                    "salary": "",
                    "description": desc[:5000],
                    "apply_link": apply_link,
                    "posted_date": posted_date,
                    "raw_data": {"remote": is_remote, "tags": tags}
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"Arbeitnow scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 9. The Muse  —  Public JSON API, no auth
# ─────────────────────────────────────────────────────
class TheMuseScraper:
    """
    Public API with dedicated 'Software Engineering' category filter.
    Offers high quality verified listings.
    """
    API_URL = "https://www.themuse.com/api/public/jobs"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(0.3, 0.8)

            params = {
                "category": "Software Engineering",
                "page": 1,
            }
            resp = requests.get(self.API_URL, params=params, headers=headers, timeout=12, proxies=proxies)
            resp.raise_for_status()
            data = resp.json()

            results = data.get("results", [])
            role_keywords = _build_keywords(roles) if roles and any(r.strip() for r in roles) else []

            jobs = []
            for item in results:
                name = item.get("name", "")
                name_low = name.lower()

                if role_keywords and not any(kw in name_low for kw in role_keywords):
                    # Still keep if it is software engineering
                    if not any(k in name_low for k in SOFTWARE_ENGINEERING_KEYWORDS):
                        continue

                company_info = item.get("company", {})
                company = company_info.get("name", "Unknown") if isinstance(company_info, dict) else "Unknown"

                locs = item.get("locations", [])
                loc_names = [loc.get("name", "") for loc in locs if isinstance(loc, dict)]
                location = ", ".join(loc_names) if loc_names else "Remote"

                refs = item.get("refs", {})
                apply_link = refs.get("landing_page", "") if isinstance(refs, dict) else ""
                if not apply_link:
                    continue

                is_remote = any("flexible" in l.lower() or "remote" in l.lower() for l in loc_names)
                job_id = _make_job_id("themuse", str(item.get("id") or apply_link))
                desc = _clean_html(item.get("contents", ""))
                posted_date = _parse_date(item.get("publication_date"))

                jobs.append({
                    "external_id": job_id,
                    "source": "themuse",
                    "company": company,
                    "role": name,
                    "location": location,
                    "salary": "",
                    "description": desc[:5000],
                    "apply_link": apply_link,
                    "posted_date": posted_date,
                    "raw_data": {"remote": is_remote, "location": location}
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"TheMuse scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 10. WeWorkRemotely  —  RSS feed (no auth)
# ─────────────────────────────────────────────────────
class WeWorkRemotelyScraper:
    FEED_URLS = [
        "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
        "https://weworkremotely.com/categories/remote-product-jobs.rss",
    ]

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            role_keywords = _build_keywords(roles) if roles and any(r.strip() for r in roles) else []

            jobs = []
            for feed_url in self.FEED_URLS:
                if len(jobs) >= max_jobs:
                    break
                try:
                    _human_delay(0.3, 0.7)
                    response = requests.get(feed_url, headers=headers, timeout=12, proxies=proxies)
                    response.raise_for_status()
                    xml_text = response.text

                    items = re.findall(r"<item>(.*?)</item>", xml_text, re.DOTALL)

                    for item_xml in items:
                        title = re.search(r"<title><!\[CDATA\[(.*?)\]\]></title>", item_xml)
                        if not title:
                            title = re.search(r"<title>(.*?)</title>", item_xml)
                        title_text = title.group(1).strip() if title else ""

                        link = re.search(r"<link>(.*?)</link>", item_xml)
                        link_text = link.group(1).strip() if link else ""
                        if not link_text:
                            continue

                        description = re.search(r"<description><!\[CDATA\[(.*?)\]\]></description>", item_xml, re.DOTALL)
                        desc_text = description.group(1).strip() if description else ""

                        pub_date = re.search(r"<pubDate>(.*?)</pubDate>", item_xml)
                        pub_date_text = pub_date.group(1).strip() if pub_date else ""

                        if ": " in title_text:
                            parts = title_text.split(": ", 1)
                            company = parts[0].strip()
                            role_title = parts[1].strip()
                        else:
                            company = "Unknown"
                            role_title = title_text

                        if role_keywords and not any(kw in role_title.lower() or kw in desc_text.lower() for kw in role_keywords):
                            continue

                        job_id = _make_job_id("weworkremotely", link_text)
                        posted_date = _parse_date(pub_date_text) if pub_date_text else datetime.utcnow().isoformat()
                        clean_desc = _clean_html(desc_text)

                        jobs.append({
                            "external_id": job_id,
                            "source": "weworkremotely",
                            "company": company,
                            "role": role_title,
                            "location": "Remote",
                            "salary": "",
                            "description": clean_desc[:5000],
                            "apply_link": link_text,
                            "posted_date": posted_date,
                            "raw_data": {"feed": feed_url.split("/")[-1].replace(".rss", ""), "remote": True}
                        })

                        if len(jobs) >= max_jobs:
                            break

                except Exception as e:
                    logger.error(f"WeWorkRemotely feed error ({feed_url}): {e}")
                    continue

            return jobs

        except Exception as e:
            logger.error(f"WeWorkRemotely scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 11. FindRemotely  —  Deprecated stub
# ─────────────────────────────────────────────────────
class FindRemotelyScraper:
    """findremotely.co domain is defunct; returns empty list immediately without hanging."""
    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        logger.info("FindRemotely source is deprecated/offline; skipping.")
        return []


# ─────────────────────────────────────────────────────
# 12. Adzuna  —  Free tier API (requires env vars)
# ─────────────────────────────────────────────────────
class AdzunaScraper:
    BASE_URL = "https://api.adzuna.com/v1/api/jobs"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30, country: str = "in") -> List[Dict[str, Any]]:
        import requests

        app_id = os.getenv("ADZUNA_APP_ID")
        app_key = os.getenv("ADZUNA_APP_KEY")

        if not app_id or not app_key:
            logger.warning("Adzuna API keys not set. Skipping.")
            return []

        jobs = []
        proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None

        for role in roles[:3]:
            try:
                params = {
                    "app_id": app_id,
                    "app_key": app_key,
                    "results_per_page": min(max_jobs, 50),
                    "what": role,
                    "content-type": "application/json",
                    "sort_by": "date",
                }
                if locations:
                    params["where"] = locations[0]

                _human_delay(0.5, 1.5)
                url = f"{self.BASE_URL}/{country}/search/1"
                response = requests.get(url, params=params, timeout=15, proxies=proxies)
                response.raise_for_status()
                data = response.json()

                for item in data.get("results", []):
                    job_id = _make_job_id("adzuna", str(item.get("id", item.get("redirect_url", ""))))
                    apply_link = item.get("redirect_url", "")

                    salary_min = item.get("salary_min")
                    salary_max = item.get("salary_max")
                    salary = ""
                    if salary_min and salary_max:
                        salary = f"₹{int(salary_min):,} - ₹{int(salary_max):,}"
                    elif salary_min:
                        salary = f"₹{int(salary_min):,}+"

                    posted_date = _parse_date(item.get("created"))

                    company_info = item.get("company", {})
                    company_name = company_info.get("display_name", "Unknown") if isinstance(company_info, dict) else str(company_info)
                    location_info = item.get("location", {})
                    location_name = ""
                    if isinstance(location_info, dict):
                        loc_parts = location_info.get("display_name", "")
                        location_name = loc_parts if isinstance(loc_parts, str) else str(loc_parts)

                    jobs.append({
                        "external_id": job_id,
                        "source": "adzuna",
                        "company": company_name,
                        "role": item.get("title", ""),
                        "location": location_name,
                        "salary": salary,
                        "description": _clean_html(item.get("description", ""))[:5000],
                        "apply_link": apply_link,
                        "posted_date": posted_date,
                        "raw_data": {"category": item.get("category", {}), "id": item.get("id")}
                    })

                    if len(jobs) >= max_jobs:
                        break

            except Exception as e:
                logger.error(f"Adzuna scrape error for role '{role}': {e}")

        return jobs[:max_jobs]


# ─────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────
def _build_keywords(roles: List[str]) -> List[str]:
    """Build a list of search keywords strictly from user role phrases."""
    kw = set()
    for r in roles:
        for word in r.lower().split():
            clean = re.sub(r"[^a-z0-9]", "", word)
            if len(clean) > 2:
                kw.add(clean)
    return list(kw)


def _parse_date(raw) -> str:
    """Parse various date formats into ISO string."""
    if not raw:
        return datetime.utcnow().isoformat()
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).isoformat()
    except Exception:
        try:
            return datetime.fromtimestamp(int(raw)).isoformat()
        except Exception:
            return datetime.utcnow().isoformat()


# ─────────────────────────────────────────────────────
# Manager
# ─────────────────────────────────────────────────────
class JobScrapeManager:
    """Manages multiple scrapers with rate limiting."""

    def __init__(self):
        self.scrapers = {
            "linkedin": LinkedInScraper(),
            "instahyre": InstahyreScraper(),
            "remoteok": RemoteOKScraper(),
            "hasjob": HasjobScraper(),
            "remotive": RemotiveScraper(),
            "jobicy": JobicyScraper(),
            "himalayas": HimalayasScraper(),
            "arbeitnow": ArbeitnowScraper(),
            "themuse": TheMuseScraper(),
            "weworkremotely": WeWorkRemotelyScraper(),
            "adzuna": AdzunaScraper(),
            "findremotely": FindRemotelyScraper(),
        }

    def fetch_jobs(
        self,
        sources: List[str],
        roles: List[str],
        locations: List[str],
        remote_pref: str = "any",
        max_jobs_per_source: int = 20
    ) -> List[Dict[str, Any]]:
        all_jobs = []

        # Default to high-yield sources if none specified
        active_sources = sources if sources else [
            "linkedin", "instahyre", "remoteok", "hasjob", "remotive", "arbeitnow"
        ]

        # Default roles to Software Engineering if empty
        effective_roles = [r for r in roles if r.strip()] if roles and any(r.strip() for r in roles) else [
            "Software Engineer", "Backend Developer", "Full Stack Developer"
        ]

        strictly_remote_sources = {"remotive", "remoteok", "jobicy", "himalayas", "weworkremotely"}

        for source in active_sources:
            scraper = self.scrapers.get(source)
            if not scraper:
                logger.warning(f"Unknown source: {source}")
                continue

            # Skip strictly remote job boards if user explicitly wants onsite only
            if remote_pref == "onsite" and source in strictly_remote_sources:
                logger.info(f"Skipping {source} because preference is onsite-only")
                continue

            logger.info(f"Fetching from {source}...")
            try:
                jobs = scraper.scrape(effective_roles, locations, max_jobs_per_source)
                logger.info(f"Fetched {len(jobs)} jobs from {source}")
                all_jobs.extend(jobs)

            except Exception as e:
                logger.error(f"Error fetching from {source}: {e}")

        return all_jobs
