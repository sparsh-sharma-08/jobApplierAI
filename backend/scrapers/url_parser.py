import logging
import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
import json
import re

logger = logging.getLogger(__name__)

BOT_CHALLENGE_INDICATORS = [
    "just a moment...",
    "attention required! | cloudflare",
    "verify you are human",
    "checking your browser",
    "enable javascript and cookies to continue",
    "cf-browser-verification",
    "access denied",
    "please enable cookies",
    "security check to access",
    "robot or human?",
]

def is_bot_challenge(text: str) -> bool:
    if not text or len(text.strip()) < 40:
        return True
    sample = text[:1500].lower()
    for indicator in BOT_CHALLENGE_INDICATORS:
        if indicator in sample:
            return True
    return False


class UrlParserScraper:
    """
    Scrapes arbitrary job URLs (LinkedIn, Lever, Greenhouse, etc.) 
    and uses the LLM to structure the HTML body into our Job schema.
    """
    
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
        }

    def fetch_page_text(self, url: str) -> Optional[str]:
        """Fetches the raw HTML of a URL and extracts the visible text."""
        
        # 1. Primary: Use Jina AI Reader API with timeout and headers
        try:
            logger.info(f"Fetching job URL via Jina AI: {url}")
            jina_url = f"https://r.jina.ai/{url}"
            jina_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-No-Cache': 'true',
            }
            response = requests.get(jina_url, headers=jina_headers, timeout=10)
            
            if response.status_code == 200 and len(response.text) > 100:
                if not is_bot_challenge(response.text):
                    text = re.sub(r'\n{3,}', '\n\n', response.text)
                    for marker in ["## Similar jobs", "## People also viewed", "### Similar Jobs", "## Explore top content"]:
                        if marker in text:
                            text = text.split(marker)[0]
                    return text[:15000]
                else:
                    logger.warning(f"Jina AI received bot challenge for {url}, falling back to direct scrape")
        except Exception as e:
            logger.warning(f"Jina AI fetch failed, falling back to direct scrape: {e}")

        # 2. Fallback: Direct Request Scrape
        try:
            logger.info(f"Fallback direct fetch: {url}")
            response = requests.get(url, headers=self.headers, timeout=10, allow_redirects=True)
            if response.status_code in [403, 429]:
                logger.warning(f"Direct request received status {response.status_code} for {url}")
                return None
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()

            text = soup.get_text(separator=' ', strip=True)
            text = re.sub(r'\s+', ' ', text)
            
            if is_bot_challenge(text):
                logger.warning(f"Direct scrape text matched bot challenge for {url}")
                return None
                
            return text[:15000] if len(text) > 50 else None
            
        except requests.exceptions.Timeout:
            logger.error(f"Timeout fetching URL {url}")
            return None
        except Exception as e:
            logger.error(f"Error fetching URL {url}: {e}")
            return None

    def extract_job_details(self, url: str, raw_text: str) -> Dict[str, Any]:
        """Uses the LLM service to extract structured job data from raw text."""
        clean_url = (url or "").strip() or "custom-url"
        try:
            from services.llm_service import get_openai_client, LLM_MODEL
            client = get_openai_client()
            if not client:
                raise Exception("LLM Client not configured")

            prompt = f"""
            You are an expert technical recruiter analyzing a job posting.
            The user provided this source URL: {clean_url}
            
            Here is the raw text from the job posting:
            \"\"\"
            {raw_text[:12000]}
            \"\"\"
            
            Extract the core job details and return ONLY a valid JSON object matching this schema:
            {{
                "role": "The exact job title (e.g., Senior Full Stack Engineer)",
                "company": "The name of the hiring company",
                "location": "Job location (e.g., 'Remote', 'New York, NY', 'Hybrid - San Francisco')",
                "salary": "Any salary or compensation range mentioned. If completely absent, put an empty string ''",
                "description": "A very clean, well-formatted Markdown summary of the role's requirements and responsibilities. NOTE: DO NOT ECHO THESE INSTRUCTIONS. PROVIDE ONLY THE CONTENT FROM THE POSTING."
            }}
            
            Rules:
            1. Strictly focus on the MAIN job described in the text, not 'Similar Jobs' or navigation links.
            2. If role or company cannot be found, make an educated guess from context or use 'Software Engineer' / 'Hiring Company'. Never return 'Just a moment...' or prompt instructions.
            3. Do not include markdown code block formatting like ```json. Output ONLY the JSON.
            """

            response = client.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": "You are a precise data extraction API that only outputs valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            result_content = response.choices[0].message.content.strip()
            json_match = re.search(r'(\{.*\})', result_content, re.DOTALL)
            if json_match:
                result_content = json_match.group(1)
            else:
                if result_content.startswith('```json'):
                    result_content = result_content[7:]
                if result_content.startswith('```'):
                    result_content = result_content[3:]
                if result_content.endswith('```'):
                    result_content = result_content[:-3]
                
            data = json.loads(result_content.strip())
            
            role = (data.get("role") or "").strip() or "Imported Role"
            company = (data.get("company") or "").strip() or "Unknown Company"
            if role.lower() in ["just a moment...", "unknown role", ""]:
                role = "Imported Role"
            if company.lower() in ["just a moment...", "cloudflare", ""]:
                company = "Unknown Company"

            return {
                "external_id": f"custom-{clean_url}",
                "source": "custom-url",
                "company": company,
                "role": role,
                "location": (data.get("location") or "").strip() or "Remote",
                "salary": (data.get("salary") or "").strip(),
                "description": (data.get("description") or "").strip() or raw_text[:2000],
                "apply_link": clean_url if clean_url.startswith("http") else "",
            }
            
        except Exception as e:
            logger.error(f"Failed to extract job details via LLM: {e}")
            return {
                "external_id": f"custom-{clean_url}",
                "source": "custom-url",
                "company": "Custom Job",
                "role": "Imported Role",
                "location": "Remote",
                "salary": "",
                "description": raw_text[:2000] if raw_text else "Custom imported job.",
                "apply_link": clean_url if clean_url.startswith("http") else "",
            }

    def parse_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Main orchestrated method to fetch and parse."""
        text = self.fetch_page_text(url)
        if not text:
            return None
            
        return self.extract_job_details(url, text)

    def parse_raw_text(self, raw_text: str, url: Optional[str] = None) -> Dict[str, Any]:
        """Direct extraction from user-pasted text without scraping."""
        return self.extract_job_details(url or "custom-pasted", raw_text)
