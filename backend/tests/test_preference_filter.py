"""
Tests for preference-based job filtering in GET /jobs.

Coverage:
  1. null salary → kept visible
  2. explicit onsite → hidden when remote_preference=remote
  3. unknown remote (ambiguous location) → kept visible
  4. salary currency mismatch → not filtered
  5. toggle apply_preferences=false → everything returned, hidden_count == 0
  6. total and hidden_by_preferences counts correct with pagination
  7. profile_id param is honoured (tests poll path parity)

Unit tests for preference_filter helpers are in the same file for locality.
"""

import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from main import app
from models.database import Base, get_db, Job, User, CandidateProfile, ResumeProfile
from core.security import create_access_token, get_password_hash
from services.preference_filter import (
    classify_remote,
    is_incompatible_remote,
    is_below_salary_floor,
    detect_currency,
    parse_salary_number,
    should_hide_job,
)

# ── DB setup ──────────────────────────────────────────────────────────────────

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_pref_filter.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


client = TestClient(app)

USER_EMAIL = "pref_filter_user@example.com"


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db

    db = TestingSessionLocal()
    user = User(
        email=USER_EMAIL,
        hashed_password=get_password_hash("password123"),
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    uid = user.id

    # Candidate profile: remote-only, USD min_salary 100 000
    profile = CandidateProfile(
        user_id=uid,
        name="Test User",
        email=USER_EMAIL,
        remote_preference="remote",
        min_salary=100_000,
        salary_currency="USD",
        preferred_locations=[],
        skills=[],
        preferred_roles=[],
    )
    db.add(profile)

    # --- Jobs ---

    # J1: null salary, remote location → visible (null salary never filtered)
    db.add(Job(
        user_id=uid, role="J1-null-salary", company="A",
        location="Remote", salary=None,
        description="", apply_link="https://j1.com",
    ))

    # J2: explicit onsite → hidden for remote_preference=remote
    db.add(Job(
        user_id=uid, role="J2-onsite", company="B",
        location="New York, NY", salary="$120,000",
        description="This is an on-site role, in-office.",
        apply_link="https://j2.com",
    ))

    # J3: ambiguous location (both "Remote" and "On-site" in description) → kept
    # Salary is above floor ($120k > $100k) so only the remote signal is tested here
    db.add(Job(
        user_id=uid, role="J3-ambiguous-remote", company="C",
        location="New York, NY / Remote", salary="$120,000",
        description="Hybrid: remote and on-site options.",
        apply_link="https://j3.com",
    ))

    # J4: below salary floor, USD, remote → hidden (salary filter)
    db.add(Job(
        user_id=uid, role="J4-below-floor", company="D",
        location="Remote", salary="$50,000",
        description="Fully remote.", apply_link="https://j4.com",
    ))

    # J5: salary in INR (different currency) → not filtered despite being "low" in USD
    db.add(Job(
        user_id=uid, role="J5-inr-salary", company="E",
        location="Remote", salary="₹50,00,000",
        description="Fully remote.", apply_link="https://j5.com",
    ))

    # J6: remote, above floor, USD → visible
    db.add(Job(
        user_id=uid, role="J6-visible", company="F",
        location="Remote", salary="$150,000",
        description="Fully remote.", apply_link="https://j6.com",
    ))

    # J7: no location, no description → unknown remote → kept visible
    db.add(Job(
        user_id=uid, role="J7-unknown-remote", company="G",
        location=None, salary=None,
        description=None, apply_link="https://j7.com",
    ))

    db.commit()
    db.close()

    yield

    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    for f in ["./test_pref_filter.db"]:
        if os.path.exists(f):
            os.remove(f)


@pytest.fixture(scope="module")
def auth_header():
    token = create_access_token(data={"sub": USER_EMAIL})
    return {"Authorization": f"Bearer {token}"}


# ─── Unit tests: preference_filter helpers ────────────────────────────────────

class TestClassifyRemote:
    def test_clearly_remote_location(self):
        assert classify_remote("Remote") == "remote"

    def test_worldwide_is_remote(self):
        assert classify_remote("Worldwide") == "remote"

    def test_no_location_unknown(self):
        assert classify_remote(None) == "unknown"

    def test_empty_location_unknown(self):
        assert classify_remote("") == "unknown"

    def test_city_only_unknown(self):
        assert classify_remote("New York, NY") == "unknown"

    def test_explicit_onsite_description(self):
        assert classify_remote("New York, NY", "This is an on-site role, in-office.") == "onsite"

    def test_ambiguous_both_keywords_unknown(self):
        assert classify_remote("New York / Remote", "Hybrid: remote and on-site options.") == "unknown"


class TestIsIncompatibleRemote:
    def test_any_pref_never_incompatible(self):
        assert not is_incompatible_remote("New York", "In-office role.", "any")

    def test_remote_pref_onsite_job_incompatible(self):
        assert is_incompatible_remote("NYC", "In-office only.", "remote")

    def test_remote_pref_unknown_remote_compatible(self):
        assert not is_incompatible_remote("Berlin", "", "remote")

    def test_remote_pref_remote_job_compatible(self):
        assert not is_incompatible_remote("Remote", "", "remote")

    def test_hybrid_pref_onsite_incompatible(self):
        assert is_incompatible_remote("HQ", "Must be on-site daily.", "hybrid")


class TestDetectCurrency:
    def test_dollar_sign(self):
        assert detect_currency("$50,000") == "USD"

    def test_usd_code(self):
        assert detect_currency("50,000 USD") == "USD"

    def test_rupee_symbol(self):
        assert detect_currency("₹50,00,000") == "INR"

    def test_inr_code(self):
        assert detect_currency("50000 INR") == "INR"

    def test_gbp(self):
        assert detect_currency("£40,000") == "GBP"

    def test_unknown(self):
        assert detect_currency("50000") is None

    def test_empty(self):
        assert detect_currency("") is None


class TestParseSalaryNumber:
    def test_simple(self):
        assert parse_salary_number("$50,000") == 50000.0

    def test_range_takes_lower(self):
        assert parse_salary_number("$50,000 - $80,000") == 50000.0

    def test_hourly(self):
        assert parse_salary_number("$50-$75 /hour") == 50.0

    def test_none_input(self):
        assert parse_salary_number(None) is None

    def test_empty(self):
        assert parse_salary_number("") is None

    def test_no_number(self):
        assert parse_salary_number("Competitive") is None


class TestIsBelowSalaryFloor:
    def test_null_salary_kept(self):
        assert not is_below_salary_floor(None, 100_000, "USD")

    def test_empty_salary_kept(self):
        assert not is_below_salary_floor("", 100_000, "USD")

    def test_below_floor_usd(self):
        assert is_below_salary_floor("$50,000", 100_000, "USD")

    def test_above_floor_usd(self):
        assert not is_below_salary_floor("$150,000", 100_000, "USD")

    def test_currency_mismatch_kept(self):
        # INR salary, USD floor → skip filter
        assert not is_below_salary_floor("₹50,00,000", 100_000, "USD")

    def test_no_min_salary_kept(self):
        assert not is_below_salary_floor("$50,000", None, "USD")

    def test_zero_min_salary_kept(self):
        assert not is_below_salary_floor("$50,000", 0, "USD")

    def test_unknown_currency_in_salary_kept(self):
        assert not is_below_salary_floor("50000", 100_000, "USD")


# ─── Integration tests: GET /jobs ─────────────────────────────────────────────

def test_response_has_envelope_shape(auth_header):
    """GET /jobs must return {total, hidden_by_preferences, jobs}."""
    res = client.get("/jobs", headers=auth_header)
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert "hidden_by_preferences" in data
    assert "jobs" in data


def test_null_salary_kept(auth_header):
    """J1 has null salary → must not be hidden."""
    res = client.get("/jobs", headers=auth_header)
    assert res.status_code == 200
    roles = [j["role"] for j in res.json()["jobs"]]
    assert "J1-null-salary" in roles


def test_explicit_onsite_hidden_for_remote_only(auth_header):
    """J2 is clearly onsite → must be hidden when remote_preference=remote."""
    res = client.get("/jobs", headers=auth_header)
    assert res.status_code == 200
    roles = [j["role"] for j in res.json()["jobs"]]
    assert "J2-onsite" not in roles


def test_unknown_remote_kept(auth_header):
    """J3 has ambiguous remote signal → must be kept visible."""
    res = client.get("/jobs", headers=auth_header)
    assert res.status_code == 200
    roles = [j["role"] for j in res.json()["jobs"]]
    assert "J3-ambiguous-remote" in roles


def test_below_salary_floor_hidden(auth_header):
    """J4 is $50k USD, floor is $100k USD → hidden."""
    res = client.get("/jobs", headers=auth_header)
    assert res.status_code == 200
    roles = [j["role"] for j in res.json()["jobs"]]
    assert "J4-below-floor" not in roles


def test_currency_mismatch_not_filtered(auth_header):
    """J5 is ₹50L INR, preference is USD floor → not filtered."""
    res = client.get("/jobs", headers=auth_header)
    assert res.status_code == 200
    roles = [j["role"] for j in res.json()["jobs"]]
    assert "J5-inr-salary" in roles


def test_toggle_off_returns_everything(auth_header):
    """apply_preferences=false → all 7 jobs returned, hidden_count == 0."""
    res = client.get("/jobs?apply_preferences=false", headers=auth_header)
    assert res.status_code == 200
    data = res.json()
    assert data["hidden_by_preferences"] == 0
    roles = [j["role"] for j in data["jobs"]]
    # All 7 jobs must be present
    for r in ["J1-null-salary", "J2-onsite", "J3-ambiguous-remote",
              "J4-below-floor", "J5-inr-salary", "J6-visible", "J7-unknown-remote"]:
        assert r in roles


def test_total_and_hidden_counts_correct(auth_header):
    """
    7 jobs total.
    Hidden: J2 (onsite) + J4 (below USD floor) = 2.
    Visible: 5.
    """
    res = client.get("/jobs", headers=auth_header)
    assert res.status_code == 200
    data = res.json()
    assert data["hidden_by_preferences"] == 2
    assert data["total"] == 5


def test_pagination_respects_filtered_set(auth_header):
    """
    With limit=2&offset=0 the total/hidden counts must still reflect the
    full filtered set, not just the page.
    """
    res = client.get("/jobs?limit=2&offset=0", headers=auth_header)
    assert res.status_code == 200
    data = res.json()
    # total and hidden reflect full filtered set
    assert data["total"] == 5
    assert data["hidden_by_preferences"] == 2
    # but only 2 jobs returned in this page
    assert len(data["jobs"]) == 2


def test_profile_id_param_accepted(auth_header):
    """
    profile_id=999 (non-existent) must still return 200 — just no scoring.
    This validates that the poll path can pass profile_id without error.
    """
    res = client.get("/jobs?profile_id=999", headers=auth_header)
    assert res.status_code == 200
    # Score should be null when no profile found
    for job in res.json()["jobs"]:
        assert job.get("score") is None


def test_candidate_profile_preferences_used_not_resume_profile(auth_header):
    """
    CandidateProfile holds job-search preferences; ResumeProfile holds scoring data.
    When both exist and profile_id is passed for ResumeProfile, GET /jobs uses
    CandidateProfile for filtering (e.g. min_salary, remote_preference) and ResumeProfile
    only for scoring.
    """
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == USER_EMAIL).first()
    
    # Create a ResumeProfile for the user (it has NO min_salary/remote_preference fields)
    rp = ResumeProfile(
        user_id=user.id,
        name="Backend Dev",
        role_title="Backend Engineer",
        skills=["Python", "FastAPI"],
        is_default=True,
    )
    db.add(rp)
    db.commit()
    db.refresh(rp)
    db.close()

    # Call /jobs with profile_id pointing to the ResumeProfile
    res = client.get(f"/jobs?profile_id={rp.id}", headers=auth_header)
    assert res.status_code == 200
    data = res.json()

    # Filtering still applied via CandidateProfile:
    # 2 jobs hidden (onsite J2 + below-floor J4)
    assert data["hidden_by_preferences"] == 2
    assert data["total"] == 5

    # Verify ResumeProfile model does not have preference fields
    from models.database import ResumeProfile as RPModel
    assert not hasattr(RPModel, "min_salary")
    assert not hasattr(RPModel, "remote_preference")
    assert not hasattr(RPModel, "salary_currency")


def test_preferred_locations_filters_unmatched_locations(auth_header):
    """
    If preferred_locations is set, hide jobs whose location does not match ANY
    of the preferred locations. Only filter if job location is known.
    """
    from services.preference_filter import is_incompatible_location
    
    # Unit tests
    assert is_incompatible_location("Austin, TX", ["San Francisco", "New York"]) is True
    assert is_incompatible_location("New York, NY", ["San Francisco", "New York"]) is False
    assert is_incompatible_location("Remote", ["San Francisco", "New York"]) is False
    assert is_incompatible_location(None, ["San Francisco"]) is False
    assert is_incompatible_location("", ["San Francisco"]) is False
    assert is_incompatible_location("Austin, TX", []) is False
    assert is_incompatible_location("Austin, TX", None) is False

    # DB API test with CandidateProfile preferred_locations
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == USER_EMAIL).first()
    cp = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    old_remote = cp.remote_preference
    old_min_sal = cp.min_salary
    old_locs = cp.preferred_locations

    try:
        # Relax remote and salary so only location filter is in play
        cp.remote_preference = "any"
        cp.min_salary = 0
        cp.preferred_locations = ["San Francisco"]
        db.commit()

        # J2 is in "New York, NY" (known location, not SF, not remote) -> should be hidden
        # J1 is "Remote" -> kept
        # J3 is "New York, NY / Remote" -> kept (contains remote)
        # J6 is "San Francisco, CA" -> kept (matches SF)
        # J7 is "Unknown / Ambiguous" -> kept (no clear mismatch / unknown)
        res = client.get("/jobs", headers=auth_header)
        assert res.status_code == 200
        roles = [j["role"] for j in res.json()["jobs"]]
        assert "J6-visible" in roles  # matches SF
        assert "J2-onsite" not in roles  # NY != SF
    finally:
        cp.remote_preference = old_remote
        cp.min_salary = old_min_sal
        cp.preferred_locations = old_locs
        db.commit()
        db.close()
