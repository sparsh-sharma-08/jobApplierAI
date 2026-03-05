import logging
import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
import json

logger = logging.getLogger(__name__)

class UrlParserScraper:
    """
    Scrapes arbitrary job URLs (LinkedIn, Lever, Greenhouse, etc.) 
    and uses the LLM to structure the HTML body into our Job schema.
    """
    
    def __init__(self):
        # We need a robust header to avoid basic bot blocks
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }

    def fetch_page_text(self, url: str) -> Optional[str]:
        """Fetches the raw HTML of a URL and extracts the visible text."""
        try:
            logger.info(f"Fetching job URL: {url}")
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()

            # Get text and clean it up
            text = soup.get_text(separator=' ', strip=True)
            
            # Compress excessive whitespace
            import re
            text = re.sub(r'\s+', ' ', text)
            
            return text[:15000] # Cap length to avoid massive prompt token costs
            
        except requests.exceptions.Timeout:
            logger.error(f"Timeout fetching URL {url}")
            return None
        except Exception as e:
            logger.error(f"Error fetching URL {url}: {e}")
            return None

    def extract_job_details(self, url: str, raw_text: str) -> Dict[str, Any]:
        """Uses the LLM service to extract structured job data from raw text."""
        try:
            from services.llm_service import require_client
            client, model = require_client()
            if not client:
                raise Exception("LLM Client not configured")

            prompt = f"""
            You are an expert technical recruiter analyzing a job posting scraped from the web.
            The user provided this URL: {url}
            
            Here is the raw scraped text from the webpage:
            \"\"\"
            {raw_text}
            \"\"\"
            
            Extract the core job details and return ONLY a valid JSON object matching this schema:
            {{
                "role": "The exact job title (e.g., Senior Full Stack Engineer)",
                "company": "The name of the hiring company",
                "location": "Job location (e.g., 'Remote', 'New York, NY', 'Hybrid - San Francisco')",
                "salary": "Any salary or compensation range mentioned. If completely absent, put an empty string ''",
                "description": "A very clean, well-formatted Markdown summary of the role, including the exact requirements and responsibilities. Ensure bullet points are formatted with Markdown '- '."
            }}
            
            Do not include any Markdown code blocks around the JSON output. Just output the raw JSON string.
            """

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a precise data extraction API that only outputs valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            result_content = response.choices[0].message.content.strip()
            # Clean up potential markdown formatting from the response
            if result_content.startswith('```json'):
                result_content = result_content[7:]
            if result_content.endswith('```'):
                result_content = result_content[:-3]
                
            data = json.loads(result_content.strip())
            
            # Format to match our internal Job schema expectations
            return {
                "external_id": f"custom-{url}",
                "source": "custom-url",
                "company": data.get("company", "Unknown Company"),
                "role": data.get("role", "Unknown Role"),
                "location": data.get("location", "Remote"),
                "salary": data.get("salary", ""),
                "description": data.get("description", raw_text[:500] + "..."),
                "apply_link": url,
            }
            
        except Exception as e:
            logger.error(f"Failed to extract job details via LLM: {e}")
            # Fallback to basic extraction
            return {
                "external_id": f"custom-{url}",
                "source": "custom-url",
                "company": "Parsed URL",
                "role": "Imported Job",
                "location": "See Description",
                "salary": "",
                "description": raw_text[:2000] if raw_text else "Failed to parse text.",
                "apply_link": url,
            }

    def parse_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Main orchestrated method to fetch and parse."""
        text = self.fetch_page_text(url)
        if not text:
            return None
            
        return self.extract_job_details(url, text)
