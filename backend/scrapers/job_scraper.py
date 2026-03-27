"""
Job Scrapers for various sources.
Uses free public JSON APIs — no scraping, no auth keys required.
"""
import hashlib
import logging
import random
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import os

logger = logging.getLogger(__name__)

HTTP_PROXY = os.getenv("HTTP_PROXY")


def _make_job_id(source: str, url: str) -> str:
    return hashlib.md5(f"{source}:{url}".encode()).hexdigest()[:16]


def _human_delay(min_s=0.5, max_s=1.5):
    time.sleep(random.uniform(min_s, max_s))


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
            _human_delay(1, 2)
            
            job_results = []
            
            for role in roles:
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
                        # Only allow if job location says worldwide/anywhere/remote or matches user location
                        loc_lower = location.lower()
                        loc_match = any(l.lower() in loc_lower for l in locations) or "worldwide" in loc_lower or "anywhere" in loc_lower or loc_lower == "remote"
                        if not loc_match:
                            continue

                    job_id = _make_job_id("remotive", str(item.get("id", item.get("url", ""))))
                    apply_link = item.get("url") or ""
                    description = item.get("description", "")
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
                        "raw_data": {"category": item.get("category", ""), "id": item.get("id")}
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
# 2. FindRemotelyJobs — Public JSON API, no auth
#    Good for remote jobs, supports search
# ─────────────────────────────────────────────────────
class FindRemotelyScraper:
    API_URL = "https://findremotely.com/api/jobs"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(0.5, 1.5)
            
            response = requests.get(self.API_URL, headers=headers, timeout=15, proxies=proxies)
            response.raise_for_status()
            data = response.json()
            
            jobs = []
            role_keywords = _build_keywords(roles)
            
            items = data if isinstance(data, list) else data.get("jobs", data.get("data", []))
            
            for item in items:
                if not isinstance(item, dict):
                    continue
                    
                title = (item.get("title") or item.get("name") or "").lower()
                description = (item.get("description") or "").lower()
                
                if role_keywords and not any(kw in title or kw in description for kw in role_keywords):
                    continue
                
                company = item.get("company_name") or item.get("company") or "Unknown"
                if isinstance(company, dict):
                    company = company.get("name", "Unknown")
                    
                location = item.get("location") or item.get("candidate_required_location") or "Remote"
                apply_link = item.get("url") or item.get("apply_url") or ""
                job_id = _make_job_id("findremotely", apply_link or str(item.get("id", "")))
                posted_date = _parse_date(item.get("published_at") or item.get("created_at"))
                
                jobs.append({
                    "external_id": job_id,
                    "source": "findremotely",
                    "company": str(company),
                    "role": item.get("title") or item.get("name") or "",
                    "location": location,
                    "salary": item.get("salary") or "",
                    "description": (item.get("description") or "")[:5000],
                    "apply_link": apply_link,
                    "posted_date": posted_date,
                    "raw_data": {"id": item.get("id")}
                })
                
                if len(jobs) >= max_jobs:
                    break
            
            return jobs
            
        except Exception as e:
            logger.error(f"FindRemotely scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 3. Jobicy  —  Public JSON API, no auth
#    Remote jobs with geo, industry, level info
# ─────────────────────────────────────────────────────
class JobicyScraper:
    API_URL = "https://jobicy.com/api/v2/remote-jobs"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            role_keywords = _build_keywords(roles)

            jobs = []
            _human_delay(0.5, 1.5)
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
                job_id = _make_job_id("jobicy", url or str(item.get("id", "")))

                posted_date = _parse_date(item.get("pubDate"))
                desc = item.get("jobDescription") or item.get("jobExcerpt") or ""

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
                        "jobIndustry": item.get("jobIndustry", ""),
                        "companyLogo": item.get("companyLogo", ""),
                    }
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"Jobicy scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 4. Himalayas.app  —  Public JSON API, no auth
#    Rich data: salary, seniority, categories
# ─────────────────────────────────────────────────────
class HimalayasScraper:
    API_URL = "https://himalayas.app/jobs/api"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            role_keywords = _build_keywords(roles)

            jobs = []
            _human_delay(0.5, 1.5)
            params = {"limit": min(max_jobs * 3, 100)}  # Fetch more, filter locally
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
                job_id = _make_job_id("himalayas", apply_link or item.get("title", ""))

                posted_date = _parse_date(item.get("pubDate"))

                # Build salary string
                salary = ""
                min_sal = item.get("minSalary")
                max_sal = item.get("maxSalary")
                currency = item.get("currency", "USD")
                if min_sal and max_sal:
                    salary = f"{currency} {int(min_sal):,} - {int(max_sal):,}"
                elif min_sal:
                    salary = f"{currency} {int(min_sal):,}+"

                description = item.get("description") or item.get("excerpt") or ""

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
                        "employmentType": item.get("employmentType", ""),
                        "categories": item.get("categories", []),
                        "companyLogo": item.get("companyLogo", ""),
                    }
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"Himalayas scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 5. Adzuna  —  Free tier API (requires env vars)
# ─────────────────────────────────────────────────────
class AdzunaScraper:
    BASE_URL = "https://api.adzuna.com/v1/api/jobs"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30, country: str = "in") -> List[Dict[str, Any]]:
        import requests

        app_id = os.getenv("ADZUNA_APP_ID")
        app_key = os.getenv("ADZUNA_APP_KEY")

        if not app_id or not app_key:
            logger.warning("Adzuna API keys not set. Set ADZUNA_APP_ID and ADZUNA_APP_KEY env vars. Skipping.")
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
                        "description": (item.get("description", "") or "")[:5000],
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
# 6. Instahyre  —  Public JSON API (India focused)
# ─────────────────────────────────────────────────────
class InstahyreScraper:
    API_URL = "https://www.instahyre.com/api/v1/job_search"

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(1, 2)
            
            job_results = []
            
            for role in roles:
                search_term = role.split()[0] if role else ""
                params = {"skills": search_term}
                if locations:
                    params["location"] = locations[0]
                    
                response = requests.get(self.API_URL, params=params, headers=headers, timeout=15, proxies=proxies)
                response.raise_for_status()

                data = response.json()
                if "objects" not in data:
                    continue
                
                for item in data.get("objects", []):
                    if not isinstance(item, dict):
                        continue

                    job_id = _make_job_id("instahyre", str(item.get("id", "")))
                    apply_link = item.get("public_url") or f"/job-{item.get('id')}"
                    if apply_link.startswith("/"):
                        apply_link = "https://www.instahyre.com" + apply_link
                    
                    description = str(item.get("title", "")) + " at " + str(item.get("employer", {}).get("company_name", ""))
                    
                    posted_date = _parse_date(item.get("published_at"))
                    
                    emp_info = item.get("employer", {})
                    company = emp_info.get("company_name", "Unknown") if isinstance(emp_info, dict) else "Unknown"
                    location = ", ".join([loc.get("name", "") for loc in item.get("locations", []) if isinstance(loc, dict)])

                    job_results.append({
                        "external_id": job_id,
                        "source": "instahyre",
                        "company": company,
                        "role": item.get("title", ""),
                        "location": location or "India",
                        "salary": "",
                        "description": description[:5000],
                        "apply_link": apply_link,
                        "posted_date": posted_date,
                        "raw_data": {"id": item.get("id")}
                    })

                    if len(job_results) >= max_jobs:
                        break
                        
                if len(job_results) >= max_jobs:
                     break

            return job_results

        except Exception as e:
            logger.error(f"Instahyre scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 7. WeWorkRemotely  —  RSS feed (no auth)
#    One of the best remote job boards
# ─────────────────────────────────────────────────────
class WeWorkRemotelyScraper:
    FEED_URLS = [
        "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        "https://weworkremotely.com/categories/remote-design-jobs.rss",
        "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
        "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
        "https://weworkremotely.com/categories/remote-product-jobs.rss",
    ]

    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            import re
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            role_keywords = _build_keywords(roles)
            
            jobs = []
            
            for feed_url in self.FEED_URLS:
                if len(jobs) >= max_jobs:
                    break
                try:
                    _human_delay(0.3, 0.8)
                    response = requests.get(feed_url, headers=headers, timeout=15, proxies=proxies)
                    response.raise_for_status()
                    xml_text = response.text
                    
                    # Simple XML parsing without lxml dependency
                    items = re.findall(r'<item>(.*?)</item>', xml_text, re.DOTALL)
                    
                    for item_xml in items:
                        title = re.search(r'<title><!\[CDATA\[(.*?)\]\]></title>', item_xml)
                        if not title:
                            title = re.search(r'<title>(.*?)</title>', item_xml)
                        title_text = title.group(1).strip() if title else ""
                        
                        link = re.search(r'<link>(.*?)</link>', item_xml)
                        link_text = link.group(1).strip() if link else ""
                        
                        description = re.search(r'<description><!\[CDATA\[(.*?)\]\]></description>', item_xml, re.DOTALL)
                        desc_text = description.group(1).strip() if description else ""
                        
                        pub_date = re.search(r'<pubDate>(.*?)</pubDate>', item_xml)
                        pub_date_text = pub_date.group(1).strip() if pub_date else ""
                        
                        # Parse "Company: Role" format from title
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
                        
                        # Clean HTML from description
                        clean_desc = re.sub(r'<[^>]+>', ' ', desc_text)
                        
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
                            "raw_data": {"feed": feed_url.split("/")[-1].replace(".rss", "")}
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
# Shared helpers
# ─────────────────────────────────────────────────────
def _build_keywords(roles: List[str]) -> List[str]:
    """Build a list of search keywords strictly from user role phrases."""
    kw = set()
    for r in roles:
        for word in r.lower().split():
            if len(word) > 2:
                kw.add(word)
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
            "remotive": RemotiveScraper(),
            "findremotely": FindRemotelyScraper(),
            "jobicy": JobicyScraper(),
            "himalayas": HimalayasScraper(),
            "adzuna": AdzunaScraper(),
            "instahyre": InstahyreScraper(),
            "weworkremotely": WeWorkRemotelyScraper(),
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

        for source in sources:
            scraper = self.scrapers.get(source)
            if not scraper:
                logger.warning(f"Unknown source: {source}")
                continue

            # Skip strictly remote job boards if user explicitly wants onsite only
            if remote_pref == "onsite" and source in ("remotive", "findremotely", "jobicy", "himalayas", "weworkremotely"):
                logger.info(f"Skipping {source} because preference is onsite-only")
                continue

            logger.info(f"Fetching from {source}...")
            try:
                jobs = scraper.scrape(roles, locations, max_jobs_per_source)
                logger.info(f"Fetched {len(jobs)} jobs from {source}")
                all_jobs.extend(jobs)

            except Exception as e:
                logger.error(f"Error fetching from {source}: {e}")

        return all_jobs

