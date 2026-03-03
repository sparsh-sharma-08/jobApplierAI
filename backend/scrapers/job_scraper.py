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

    def scrape(self, roles: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            _human_delay(1, 2)
            
            job_results = []
            
            for role in roles:
                # The remotive API sometimes fails on spaces in search, urlencoding helps or just relying on raw search
                search_term = role.split()[0] if role else ""
                params = {"search": search_term, "limit": max_jobs}
                response = requests.get(self.API_URL, params=params, headers=headers, timeout=15, proxies=proxies)
                response.raise_for_status()

                data = response.json()
                if "jobs" not in data:
                    continue
                
                for item in data["jobs"][:max_jobs]:
                    if not isinstance(item, dict):
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
                        "location": item.get("candidate_required_location", "Remote"),
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
# 2. Arbeitnow  —  Public JSON API, no auth
# ─────────────────────────────────────────────────────
class ArbeitnowScraper:
    API_URL = "https://www.arbeitnow.com/api/job-board-api"

    def scrape(self, roles: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
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

            for item in data.get("data", [])[:200]:
                if not isinstance(item, dict):
                    continue

                title = (item.get("title") or "").lower()
                tags = [t.lower() for t in item.get("tags", [])]

                if not any(kw in title or any(kw in tag for tag in tags) for kw in role_keywords):
                    continue

                slug = item.get("slug", "")
                apply_link = item.get("url") or f"https://www.arbeitnow.com/view/{slug}"
                job_id = _make_job_id("arbeitnow", apply_link)

                posted_date_raw = item.get("created_at")
                posted_date = datetime.utcnow().isoformat()
                if posted_date_raw:
                    try:
                        posted_date = datetime.fromtimestamp(int(posted_date_raw)).isoformat()
                    except Exception:
                        pass

                jobs.append({
                    "external_id": job_id,
                    "source": "arbeitnow",
                    "company": item.get("company_name", "Unknown"),
                    "role": item.get("title", ""),
                    "location": item.get("location", "Remote"),
                    "salary": "",
                    "description": (item.get("description") or "")[:5000],
                    "apply_link": apply_link,
                    "posted_date": posted_date,
                    "raw_data": {"tags": item.get("tags", []), "remote": item.get("remote", False)}
                })

                if len(jobs) >= max_jobs:
                    break

            return jobs

        except Exception as e:
            logger.error(f"Arbeitnow scrape error: {e}")
            return []


# ─────────────────────────────────────────────────────
# 3. Jobicy  —  Public JSON API, no auth
#    Remote jobs with geo, industry, level info
# ─────────────────────────────────────────────────────
class JobicyScraper:
    API_URL = "https://jobicy.com/api/v2/remote-jobs"

    def scrape(self, roles: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
        try:
            import requests
            headers = {"User-Agent": "Mozilla/5.0 CareerCopilot/1.0"}
            proxies = {"http": HTTP_PROXY, "https": HTTP_PROXY} if HTTP_PROXY else None
            role_keywords = _build_keywords(roles)

            jobs = []
            _human_delay(0.5, 1.5)
            # Fetch broadly — Jobicy's tag filter is too narrow
            params = {"count": 50}
            response = requests.get(self.API_URL, params=params, headers=headers, timeout=15, proxies=proxies)
            response.raise_for_status()
            data = response.json()

            for item in data.get("jobs", []):
                title = (item.get("jobTitle") or "").lower()
                industry_raw = item.get("jobIndustry", "")
                industry = " ".join(industry_raw).lower() if isinstance(industry_raw, list) else str(industry_raw).lower()
                excerpt = (item.get("jobExcerpt") or "").lower()

                if not any(kw in title or kw in industry or kw in excerpt for kw in role_keywords):
                    continue

                url = item.get("url", "")
                job_id = _make_job_id("jobicy", url or str(item.get("id", "")))

                posted_date = _parse_date(item.get("pubDate"))
                desc = item.get("jobDescription") or item.get("jobExcerpt") or ""

                geo = item.get("jobGeo", "")
                location = geo if geo else "Remote"

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

    def scrape(self, roles: List[str], max_jobs: int = 30) -> List[Dict[str, Any]]:
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

                if not any(kw in title or kw in categories or kw in excerpt for kw in role_keywords):
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

                # Build location from restrictions
                loc_restrictions = item.get("locationRestrictions", [])
                location = ", ".join(loc_restrictions) if loc_restrictions else "Remote / Worldwide"

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
# 6. LinkedIn  —  Public search pages (Playwright)
#    Kept for users who have Playwright installed, but
#    may be unreliable due to bot detection
# ─────────────────────────────────────────────────────
class LinkedInScraper:
    def scrape(self, roles: List[str], locations: List[str], max_jobs: int = 25) -> List[Dict[str, Any]]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            logger.warning("Playwright not installed. Skipping LinkedIn.")
            return []

        jobs = []
        with sync_playwright() as p:
            proxy_settings = {"server": HTTP_PROXY} if HTTP_PROXY else None
            browser = p.chromium.launch(headless=True, proxy=proxy_settings)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()

            for role in roles[:2]:
                try:
                    keywords = role.replace(" ", "%20")
                    location_str = locations[0].replace(" ", "%20") if locations else ""
                    search_url = f"https://www.linkedin.com/jobs/search/?keywords={keywords}"
                    if location_str:
                        search_url += f"&location={location_str}"

                    page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                    _human_delay(3, 5)

                    for _ in range(3):
                        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        _human_delay(1.5, 2.5)

                    job_cards = page.query_selector_all('div.base-card') or \
                                page.query_selector_all('ul.jobs-search__results-list > li')

                    for card in job_cards[:max_jobs // max(len(roles), 1)]:
                        try:
                            title_el = card.query_selector('h3.base-search-card__title') or card.query_selector('h3')
                            company_el = card.query_selector('h4.base-search-card__subtitle') or card.query_selector('a.hidden-nested-link')
                            location_el = card.query_selector('span.job-search-card__location')
                            link_el = card.query_selector('a.base-card__full-link') or card.query_selector('a')

                            title = title_el.inner_text().strip() if title_el else "Unknown Role"
                            company = company_el.inner_text().strip() if company_el else "Unknown Company"
                            location = location_el.inner_text().strip() if location_el else ""
                            href = link_el.get_attribute("href") if link_el else ""
                            if not href:
                                continue

                            job_id = _make_job_id("linkedin", href)
                            jobs.append({
                                "external_id": job_id,
                                "source": "linkedin",
                                "company": company,
                                "role": title,
                                "location": location,
                                "salary": "",
                                "description": "",
                                "apply_link": href.split("?")[0],
                                "posted_date": datetime.utcnow().isoformat(),
                                "raw_data": {"href": href}
                            })
                        except Exception as e:
                            logger.debug(f"LinkedIn card extraction error: {e}")
                        _human_delay(0.5, 1.0)

                except Exception as e:
                    logger.error(f"LinkedIn scrape error for role '{role}': {e}")

            browser.close()
        return jobs[:max_jobs]


# ─────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────
def _build_keywords(roles: List[str]) -> List[str]:
    """Build a list of search keywords from role phrases."""
    kw = set()
    for r in roles:
        for word in r.lower().split():
            if len(word) > 2:
                kw.add(word)
    kw.update({'developer', 'engineer', 'frontend', 'backend', 'mobile',
               'software', 'ai', 'ml', 'data', 'cloud', 'devops', 'web',
               'python', 'java', 'react', 'node', 'full-stack', 'fullstack'})
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
            "arbeitnow": ArbeitnowScraper(),
            "jobicy": JobicyScraper(),
            "himalayas": HimalayasScraper(),
            "adzuna": AdzunaScraper(),
            "linkedin": LinkedInScraper(),
        }

    def fetch_jobs(
        self,
        sources: List[str],
        roles: List[str],
        locations: List[str],
        max_jobs_per_source: int = 20
    ) -> List[Dict[str, Any]]:
        all_jobs = []

        for source in sources:
            scraper = self.scrapers.get(source)
            if not scraper:
                logger.warning(f"Unknown source: {source}")
                continue

            logger.info(f"Fetching from {source}...")
            try:
                if source in ("remotive", "arbeitnow", "jobicy", "himalayas"):
                    jobs = scraper.scrape(roles, max_jobs_per_source)
                elif source == "adzuna":
                    jobs = scraper.scrape(roles, locations, max_jobs_per_source)
                elif source in ("linkedin",):
                    jobs = scraper.scrape(roles, locations, max_jobs_per_source)
                else:
                    jobs = []

                logger.info(f"Fetched {len(jobs)} jobs from {source}")
                all_jobs.extend(jobs)

            except Exception as e:
                logger.error(f"Error fetching from {source}: {e}")

        return all_jobs
