"""
Preference-based job filtering helpers.

Architecture note
-----------------
CandidateProfile holds job-search preferences (remote_preference, min_salary,
preferred_locations, salary_currency).  ResumeProfile holds resume/scoring data.
GET /jobs reads *filters* from CandidateProfile and *scoring* from the selected
ResumeProfile.  These two roles must never be conflated; do not copy preference
fields onto ResumeProfile.

Design rules (codified here so every future caller is consistent)
------------------------------------------------------------------
remote_preference
    "remote"  → hide jobs that are *clearly* onsite (no remote keyword).
    "hybrid"  → hide jobs that are *clearly* onsite (same rule).
    "any"     → no filtering.
    Unknown remote status (ambiguous location, no keyword) → keep visible.

min_salary / salary_currency
    Only filter when ALL of these hold:
      • job has a non-empty salary string
      • we can parse a numeric value from it
      • we can detect a currency symbol/code in the salary string
      • detected currency matches the user's salary_currency preference
      • parsed value < min_salary
    Any unknown → keep visible.

preferred_locations
    Soft-score factor only (applied outside this module by the scorer).
    Hard filtering is opt-in and only applies to non-remote jobs.
"""

import re
from typing import Optional

# ── Remote detection ──────────────────────────────────────────────────────────

_REMOTE_KEYWORDS = re.compile(
    r"\b(remote|worldwide|work from home|wfh|distributed|telecommute)\b",
    re.IGNORECASE,
)
_ONSITE_KEYWORDS = re.compile(
    r"\b(on[\s-]?site|in[\s-]?office|in-person|on[\s-]?location)\b",
    re.IGNORECASE,
)


def classify_remote(location: Optional[str], description: Optional[str] = None) -> str:
    """
    Return "remote", "onsite", or "unknown".

    "unknown" is returned whenever the evidence is ambiguous so the caller can
    safely keep the job visible.
    """
    text = " ".join(filter(None, [location, description or ""])).strip()
    if not text:
        return "unknown"

    has_remote = bool(_REMOTE_KEYWORDS.search(text))
    has_onsite = bool(_ONSITE_KEYWORDS.search(text))

    if has_remote and not has_onsite:
        return "remote"
    if has_onsite and not has_remote:
        return "onsite"
    # Both keywords present (e.g. "Remote / On-site") → ambiguous → keep visible
    return "unknown"


def is_incompatible_remote(
    location: Optional[str],
    description: Optional[str],
    remote_preference: Optional[str],
) -> bool:
    """
    Return True only when the job is *clearly* onsite AND the user wants remote or hybrid.
    Unknown → False (keep visible).
    """
    if not remote_preference or remote_preference == "any":
        return False
    if remote_preference not in ("remote", "hybrid"):
        return False
    classification = classify_remote(location, description)
    return classification == "onsite"


# ── Salary parsing ────────────────────────────────────────────────────────────

# Map of currency symbol/code to ISO code
_CURRENCY_MAP = {
    "$": "USD",
    "usd": "USD",
    "us$": "USD",
    "£": "GBP",
    "gbp": "GBP",
    "€": "EUR",
    "eur": "EUR",
    "₹": "INR",
    "inr": "INR",
    "rs": "INR",
    "rs.": "INR",
    "cad": "CAD",
    "ca$": "CAD",
    "aud": "AUD",
    "a$": "AUD",
}


def detect_currency(salary_str: str) -> Optional[str]:
    """
    Return ISO currency code from a salary string, or None if unknown.
    Checks known symbols/codes in order of specificity.
    """
    if not salary_str:
        return None
    lower = salary_str.lower()
    # Check multi-char codes first to avoid "$" matching "ca$"
    for token, iso in sorted(_CURRENCY_MAP.items(), key=lambda x: -len(x[0])):
        if token in lower:
            return iso
    return None


def parse_salary_number(salary_str: str) -> Optional[float]:
    """
    Extract the *lower bound* of a salary range as a float.
    Handles:  "$50,000 - $80,000", "$50-$75 /hour", "80000", "₹12,00,000 – ₹15,00,000"
    Returns None if no numeric value can be extracted.

    Strategy: strip known currency symbols, then find the first complete
    numeric token (digits with optional embedded commas/dots).  Strip
    commas from that token before converting to float.
    """
    if not salary_str:
        return None
    # Remove currency symbols so they don't interfere with number detection
    cleaned = re.sub(r"[$£€₹]", " ", salary_str)
    # Match numbers that may contain commas (e.g. "50,000") or dots
    nums = re.findall(r"\d[\d,]*(?:\.\d+)?", cleaned)
    if not nums:
        return None
    try:
        # Take the first (lower bound); strip commas before float conversion
        return float(nums[0].replace(",", ""))
    except ValueError:
        return None


def is_below_salary_floor(
    salary_str: Optional[str],
    min_salary: Optional[int],
    salary_currency: Optional[str],
) -> bool:
    """
    Return True only when the salary is known, parseable, currency-matched,
    and below the floor.  Any unknown → False (keep visible).
    """
    if not min_salary or min_salary <= 0:
        return False
    if not salary_str or not salary_str.strip():
        # Null / empty salary → keep visible (we don't know)
        return False

    detected_currency = detect_currency(salary_str)
    if not detected_currency:
        # Cannot determine currency → keep visible
        return False
    if salary_currency and detected_currency != salary_currency.upper():
        # Currency mismatch → skip filter, keep visible
        return False

    value = parse_salary_number(salary_str)
    if value is None:
        return False

    return value < min_salary


# ── Location matching ─────────────────────────────────────────────────────────


def is_incompatible_location(
    location: Optional[str],
    preferred_locations: Optional[list],
) -> bool:
    """
    If preferred_locations is set, hide jobs whose location does not match ANY
    of the preferred locations. Only filter if job location is known.
    Unknown location stays visible.
    """
    if not preferred_locations:
        return False
    valid_prefs = [p.strip().lower() for p in preferred_locations if isinstance(p, str) and p.strip()]
    if not valid_prefs:
        return False

    if not location or not location.strip():
        # Unknown location -> keep visible
        return False

    norm_loc = location.strip().lower()
    # Remote/worldwide jobs have no geographic restriction -> keep visible
    if any(k in norm_loc for k in ("remote", "anywhere", "worldwide", "virtual", "wfh", "work from home")):
        return False

    for pref in valid_prefs:
        if pref in norm_loc or norm_loc in pref:
            return False

    return True


# ── Main predicate ─────────────────────────────────────────────────────────────


def should_hide_job(
    *,
    location: Optional[str],
    description: Optional[str],
    salary: Optional[str],
    remote_preference: Optional[str],
    min_salary: Optional[int],
    salary_currency: Optional[str],
    preferred_locations: Optional[list] = None,
) -> bool:
    """
    Return True if the job should be hidden by preference filtering.
    Called per-job before pagination to compute hidden counts accurately.
    """
    if is_incompatible_remote(location, description, remote_preference):
        return True
    if is_below_salary_floor(salary, min_salary, salary_currency):
        return True
    if is_incompatible_location(location, preferred_locations):
        return True
    return False
