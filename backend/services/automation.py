"""
Application Automation using Playwright.
Mode 1: Semi-automatic (pre-fill, user reviews)
Mode 2: Fully automatic (configurable)
"""
import time
import random
import logging
from typing import Dict, Any, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class ApplicationMode(str, Enum):
    SEMI_AUTO = "semi_auto"
    AUTO = "auto"


def _human_delay(min_s=0.5, max_s=2.0):
    time.sleep(random.uniform(min_s, max_s))


def _human_type(page, selector: str, text: str):
    """Type text with human-like delays."""
    page.click(selector)
    page.fill(selector, "")
    for char in text:
        page.keyboard.type(char)
        time.sleep(random.uniform(0.02, 0.08))


class ApplicationAutomator:
    """
    Automates job applications using Playwright.
    """

    def __init__(self, mode: ApplicationMode = ApplicationMode.SEMI_AUTO, daily_limit: int = 20):
        self.mode = mode
        self.daily_limit = daily_limit
        self._daily_count = 0

    def apply_to_job(
        self,
        job: Dict[str, Any],
        profile: Dict[str, Any],
        resume_path: Optional[str] = None,
        cover_letter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Open the job application page and optionally pre-fill/submit.
        Returns result dict with status and any errors.
        """
        if self._daily_count >= self.daily_limit:
            return {"success": False, "reason": f"Daily limit of {self.daily_limit} applications reached"}

        apply_link = job.get("apply_link", "")
        if not apply_link:
            return {"success": False, "reason": "No apply link available"}

        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return {"success": False, "reason": "Playwright not installed"}

        result = {"success": False, "reason": "", "apply_link": apply_link}

        with sync_playwright() as p:
            if self.mode == ApplicationMode.SEMI_AUTO:
                # Open in non-headless so user can review
                browser = p.chromium.launch(headless=False)
            else:
                browser = p.chromium.launch(headless=True)

            context = browser.new_context()
            page = context.new_page()

            try:
                page.goto(apply_link, wait_until="domcontentloaded", timeout=30000)
                _human_delay(2, 3)

                # Pre-fill common fields
                self._prefill_form(page, profile, resume_path, cover_letter)

                if self.mode == ApplicationMode.SEMI_AUTO:
                    # Keep browser open for user review
                    logger.info(f"Application page opened for {job.get('company')} - {job.get('role')}. Please review and submit.")
                    # Wait up to 5 minutes for user
                    try:
                        page.wait_for_event("close", timeout=300000)
                    except Exception:
                        pass
                    result["success"] = True
                    result["reason"] = "Semi-auto: page opened for user review"

                elif self.mode == ApplicationMode.AUTO:
                    submitted = self._attempt_submit(page)
                    if submitted:
                        self._daily_count += 1
                        result["success"] = True
                        result["reason"] = "Auto-submitted"
                    else:
                        result["reason"] = "Could not find submit button"

            except Exception as e:
                result["reason"] = str(e)
                logger.error(f"Application error: {e}")
            finally:
                if self.mode == ApplicationMode.AUTO:
                    browser.close()

        return result

    def _prefill_form(self, page, profile: Dict, resume_path: Optional[str], cover_letter: Optional[str]):
        """Attempt to fill common application form fields."""
        field_map = {
            # Name fields
            'input[name*="name" i]:not([name*="company"]):not([name*="last"])': profile.get("name", ""),
            'input[name*="first_name" i]': (profile.get("name", "") or "").split()[0],
            'input[name*="last_name" i]': " ".join((profile.get("name", "") or "").split()[1:]),
            'input[name*="email" i]': profile.get("email", ""),
            'input[type="email"]': profile.get("email", ""),
            'input[name*="phone" i]': profile.get("phone", ""),
            'input[name*="linkedin" i]': profile.get("linkedin", ""),
            'input[name*="github" i]': profile.get("github", ""),
            'input[name*="website" i]': profile.get("github", ""),
        }

        for selector, value in field_map.items():
            if value:
                try:
                    element = page.query_selector(selector)
                    if element and element.is_visible():
                        element.fill(str(value))
                        _human_delay(0.2, 0.5)
                except Exception:
                    pass

        # Cover letter textarea
        if cover_letter:
            cover_selectors = [
                'textarea[name*="cover" i]',
                'textarea[placeholder*="cover" i]',
                'textarea[name*="letter" i]',
                '#cover-letter',
            ]
            for sel in cover_selectors:
                try:
                    el = page.query_selector(sel)
                    if el and el.is_visible():
                        el.fill(cover_letter)
                        break
                except Exception:
                    pass

        # Resume upload
        if resume_path:
            upload_selectors = [
                'input[type="file"][name*="resume" i]',
                'input[type="file"][accept*="pdf"]',
                'input[type="file"]',
            ]
            for sel in upload_selectors:
                try:
                    el = page.query_selector(sel)
                    if el:
                        el.set_input_files(resume_path)
                        _human_delay(1, 2)
                        break
                except Exception:
                    pass

    def _attempt_submit(self, page) -> bool:
        """Attempt to find and click submit button."""
        submit_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Submit Application")',
            'button:has-text("Apply Now")',
            'button:has-text("Submit")',
            'a:has-text("Apply")',
        ]
        for sel in submit_selectors:
            try:
                btn = page.query_selector(sel)
                if btn and btn.is_visible():
                    _human_delay(1, 2)
                    btn.click()
                    _human_delay(2, 3)
                    return True
            except Exception:
                pass
        return False


def open_application_page(apply_link: str) -> bool:
    """Simply open the application page in browser."""
    try:
        import webbrowser
        webbrowser.open(apply_link)
        return True
    except Exception:
        return False
