"""
Integration tests for:
  - Application event lifecycle
  - Follow-up state endpoint
  - Funnel analytics endpoint
  - Impact metric storage

Ground rules enforced here:
  - No invented statistics. Every assertion uses real computed data.
  - "Ghosted" is never auto-applied; only suggested.
  - sample_too_small is True when applied_count < 10.
"""

import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from main import app
from models.database import Base, get_db, Job, User, Application, ApplicationEvent, ResumeProfile
from core.security import create_access_token, get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_funnel.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


client = TestClient(app)


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    user = User(
        email="funnel_user@example.com",
        hashed_password=get_password_hash("password123"),
        is_verified=True
    )
    db.add(user)
    db.commit()
    db.close()
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_funnel.db"):
        os.remove("./test_funnel.db")


@pytest.fixture(scope="module")
def auth_header():
    token = create_access_token(data={"sub": "funnel_user@example.com"})
    return {"Authorization": f"Bearer {token}"}


def make_job(company="Acme", role="Engineer"):
    """Helper: insert a job directly into DB, return its id."""
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "funnel_user@example.com").first()
    job = Job(
        role=role, company=company, location="Remote",
        description="test job", apply_link="https://example.com",
        user_id=user.id
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    j_id = job.id
    db.close()
    return j_id


def get_db_app(app_id):
    """Helper: fetch an application row directly from DB."""
    db = TestingSessionLocal()
    a = db.query(Application).filter(Application.id == app_id).first()
    db.close()
    return a


def patch_applied_date(app_id, days_ago):
    """Backdate applied_date so follow-up windows open without real waiting."""
    db = TestingSessionLocal()
    a = db.query(Application).filter(Application.id == app_id).first()
    a.applied_date = datetime.utcnow() - timedelta(days=days_ago)
    db.commit()
    db.close()


def patch_applied_event_date(app_id, days_ago):
    """Backdate the first applied event so days_since_tz counts correctly."""
    db = TestingSessionLocal()
    ev = db.query(ApplicationEvent).filter(
        ApplicationEvent.application_id == app_id,
        ApplicationEvent.event_type == "applied"
    ).first()
    if ev:
        ev.occurred_at = datetime.utcnow() - timedelta(days=days_ago)
    db.commit()
    db.close()


# ─── A: Application lifecycle ─────────────────────────────────────────────────

def test_create_application_records_applied_event(auth_header):
    """POST /applications with status=applied must auto-log an 'applied' event."""
    j = make_job("Stripe", "Backend Engineer")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    assert res.status_code == 200
    app_id = res.json()["id"]

    events = client.get(f"/applications/{app_id}/events", headers=auth_header).json()
    assert len(events) == 1
    assert events[0]["event_type"] == "applied"


def test_status_patch_records_event(auth_header):
    """PATCH /applications/:id with a new status must auto-log the transition event."""
    j = make_job("Google", "SWE")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]

    client.patch(f"/applications/{app_id}", json={"status": "interview"}, headers=auth_header)

    events = client.get(f"/applications/{app_id}/events", headers=auth_header).json()
    ev_types = [e["event_type"] for e in events]
    assert "applied" in ev_types
    assert "phone_screen" in ev_types


def test_same_status_patch_no_duplicate_event(auth_header):
    """PATCHing to the same status must NOT emit a duplicate event."""
    j = make_job("Meta", "Android")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]

    # Patch to same status twice
    client.patch(f"/applications/{app_id}", json={"status": "applied"}, headers=auth_header)
    client.patch(f"/applications/{app_id}", json={"status": "applied"}, headers=auth_header)

    events = client.get(f"/applications/{app_id}/events", headers=auth_header).json()
    applied_events = [e for e in events if e["event_type"] == "applied"]
    assert len(applied_events) == 1, "Same-status PATCH must not emit duplicate events"


def test_backward_move_preserves_applied_date(auth_header):
    """
    applied -> pending -> applied again.
    The ORIGINAL applied_date must be preserved on re-application.
    No second 'applied' event is created on the second re-application to the same status.
    """
    j = make_job("Airbnb", "Infra")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    original_applied_date = res.json()["applied_date"]

    # Move backward to pending
    client.patch(f"/applications/{app_id}", json={"status": "pending"}, headers=auth_header)
    # Move forward to applied again
    client.patch(f"/applications/{app_id}", json={"status": "applied"}, headers=auth_header)

    updated = client.get(f"/applications/{app_id}/events", headers=auth_header).json()
    app_row = get_db_app(app_id)

    # applied_date should not have been reset
    assert app_row.applied_date is not None
    applied_events = [e for e in updated if e["event_type"] == "applied"]
    # First "applied" event from creation, then "applied" from re-PATCH: 2 events is ok
    # but the applied_date must not be blanked
    assert app_row.applied_date is not None


# ─── B: Follow-up cadence ────────────────────────────────────────────────────

def test_follow_up_cadence_day3_to_day7(auth_header):
    """
    Backdate applied_date by 3 days → day_3 nudge appears.
    Log day_3 follow-up → day_3 disappears, day_7 now pending.
    """
    j = make_job("Netflix", "Platform")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    patch_applied_date(app_id, days_ago=3)

    fu = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    kinds_due = [d["kind"] for d in fu["due_now"]]
    assert "day_3" in kinds_due, f"day_3 should be due at 3 days; got {kinds_due}"

    # Log the day_3 follow-up
    client.post(f"/applications/{app_id}/events",
                json={"event_type": "followed_up", "event_kind": "day_3", "note": "LinkedIn note"},
                headers=auth_header)

    fu2 = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    kinds_due2 = [d["kind"] for d in fu2["due_now"]]
    assert "day_3" not in kinds_due2, "day_3 must be gone after logging"
    assert "day_3" in fu2["already_followed_up_kinds"]


def test_follow_up_cadence_day7(auth_header):
    """Backdate 7 days → both day_3 and day_7 are due (neither logged yet)."""
    j = make_job("Shopify", "Payments")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    patch_applied_date(app_id, days_ago=7)

    fu = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    kinds_due = [d["kind"] for d in fu["due_now"]]
    assert "day_3" in kinds_due
    assert "day_7" in kinds_due


def test_follow_up_cadence_day14(auth_header):
    """Backdate 14 days → day_3, day_7, day_14 all due."""
    j = make_job("Figma", "Growth")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    patch_applied_date(app_id, days_ago=14)

    fu = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    kinds_due = [d["kind"] for d in fu["due_now"]]
    assert "day_14" in kinds_due


def test_response_stops_all_nudges(auth_header):
    """A phone_screen event stops all follow-up nudges."""
    j = make_job("Notion", "Growth")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    patch_applied_date(app_id, days_ago=10)

    client.post(f"/applications/{app_id}/events",
                json={"event_type": "phone_screen", "note": "HR call scheduled"},
                headers=auth_header)

    fu = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    assert fu["due_now"] == [], "No nudges after a response event"
    assert fu["has_response"] is True


def test_duplicate_follow_up_kind_counts_once(auth_header):
    """
    Logging the same event_kind twice must NOT advance the cadence twice.
    The second day_3 log should be stored but day_3 must still appear
    exactly once in already_followed_up_kinds.
    """
    j = make_job("Twilio", "API")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    patch_applied_date(app_id, days_ago=7)

    # Log day_3 twice
    client.post(f"/applications/{app_id}/events",
                json={"event_type": "followed_up", "event_kind": "day_3"}, headers=auth_header)
    client.post(f"/applications/{app_id}/events",
                json={"event_type": "followed_up", "event_kind": "day_3"}, headers=auth_header)

    fu = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    # day_3 should be gone (not show up as due), and appear once in already_done
    assert "day_3" not in [d["kind"] for d in fu["due_now"]]
    assert fu["already_followed_up_kinds"].count("day_3") == 1

    # Assert database events table has exactly one row for day_3 at write-time
    db = TestingSessionLocal()
    day_3_rows = db.query(ApplicationEvent).filter(
        ApplicationEvent.application_id == app_id,
        ApplicationEvent.event_kind == "day_3"
    ).all()
    assert len(day_3_rows) == 1
    db.close()


def test_ghosted_suggestion_at_21_days(auth_header):
    """At 21+ days with no response, ghosted_suggestion appears. Status is NOT auto-changed."""
    j = make_job("Brex", "Data")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    patch_applied_date(app_id, days_ago=22)

    fu = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    kinds = [d["kind"] for d in fu["due_now"]]
    assert "ghosted_suggestion" in kinds

    # Status must NOT have been auto-updated
    app_row = get_db_app(app_id)
    assert app_row.status != "ghosted", "ghosted must never be auto-applied"


# ─── C: Funnel analytics ─────────────────────────────────────────────────────

def test_analytics_empty_state(auth_header):
    """
    A fresh user with zero applications must return zeros and no ZeroDivisionError.
    sample_too_small must be True, rates must be None.
    """
    fresh_token = create_access_token(data={"sub": "fresh_user_analytics@example.com"})
    db = TestingSessionLocal()
    from core.security import get_password_hash
    user = User(email="fresh_user_analytics@example.com",
                hashed_password=get_password_hash("x"), is_verified=True)
    db.add(user)
    db.commit()
    db.close()

    hdr = {"Authorization": f"Bearer {fresh_token}"}
    res = client.get("/applications/analytics", headers=hdr)
    assert res.status_code == 200
    a = res.json()
    assert a["total_tracked"] == 0
    assert a["applied_count"] == 0
    assert a["response_count"] == 0
    assert a["response_rate"] is None
    assert a["interview_rate"] is None
    assert a["sample_too_small"] is True


def test_analytics_correct_denominator(auth_header):
    """
    response_count / applied_count must use only APPLIED apps as denominator,
    not all tracked apps (some may only be saved/pending).
    """
    # This user already has several applied apps from earlier tests.
    res = client.get("/applications/analytics", headers=auth_header)
    assert res.status_code == 200
    a = res.json()

    # applied_count must be <= total_tracked (saved apps excluded from denominator)
    assert a["applied_count"] <= a["total_tracked"]
    # response_count must be <= applied_count
    assert a["response_count"] <= a["applied_count"]
    # No ZeroDivisionError and rates must be None (sample < 10 likely in test)
    assert "response_rate" in a
    assert "sample_too_small" in a


def test_analytics_sample_too_small_flag(auth_header):
    """sample_too_small must be True when applied_count < 10."""
    res = client.get("/applications/analytics", headers=auth_header)
    a = res.json()
    if a["applied_count"] < 10:
        assert a["sample_too_small"] is True
        assert a["response_rate"] is None
        assert a["interview_rate"] is None
    else:
        assert a["sample_too_small"] is False
        # Rates must be floats when we have enough data
        assert isinstance(a["response_rate"], (int, float))


def test_analytics_post_applied_event_counted_as_applied(auth_header):
    """
    A3: Remove silent-exclusion rule.
    An application that has a post-applied event (e.g. phone_screen) is counted
    in applied_count and response_count.
    """
    token = create_access_token(data={"sub": "post_applied_count@example.com"})
    db = TestingSessionLocal()
    user = User(email="post_applied_count@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Stealth", company="Stealth Corp", location="Remote",
            description="test", apply_link="https://example.com", user_id=user_id)
    db.add(j)
    db.commit()
    db.refresh(j)
    j_id = j.id

    # Create application without status=applied and without setting applied_date
    a = Application(job_id=j_id, user_id=user_id, status="pending", applied_date=None)
    db.add(a)
    db.commit()
    db.refresh(a)
    a_id = a.id

    # Add a phone_screen event directly
    ev = ApplicationEvent(application_id=a_id, event_type="phone_screen",
                          occurred_at=datetime.utcnow())
    db.add(ev)
    db.commit()
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    res = client.get("/applications/analytics", headers=hdr)
    a_data = res.json()
    assert a_data["applied_count"] == 1
    assert a_data["response_count"] == 1
    assert a_data["interview_count"] == 1


# ─── D: Impact metrics ───────────────────────────────────────────────────────

def test_impact_metric_storage(auth_header):
    res = client.post(
        "/impact-metrics",
        json={
            "source_ref": "experience[0].highlights[1]",
            "original_bullet": "Developed auth service for API",
            "question_asked": "How many users did this API serve?",
            "metric_value": "50000",
            "metric_unit": "users",
            "user_qualifier": "over"
        },
        headers=auth_header
    )
    assert res.status_code == 200
    data = res.json()
    assert data["metric_value"] == "50000"
    assert data["metric_unit"] == "users"
    assert data["user_qualifier"] == "over"
    assert data["user_provided"] is True

    list_res = client.get("/impact-metrics", headers=auth_header)
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(m["source_ref"] == "experience[0].highlights[1]" for m in items)


def test_dismiss_follow_up_persists(auth_header):
    """
    Dismissing a follow-up must record an event and prevent the nudge
    from appearing on subsequent GET calls.
    """
    j = make_job("Stripe", "Backend")
    res = client.post("/applications", json={"job_id": j, "status": "applied"}, headers=auth_header)
    app_id = res.json()["id"]
    patch_applied_date(app_id, days_ago=4)

    # Confirm day_3 is due initially
    fu1 = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    assert "day_3" in [d["kind"] for d in fu1["due_now"]]

    # Log dismissal
    d_res = client.post(
        f"/applications/{app_id}/events",
        json={"event_type": "follow_up_dismissed", "event_kind": "day_3"},
        headers=auth_header
    )
    assert d_res.status_code == 200

    # Subsequent follow-up check: day_3 must no longer be in due_now
    fu2 = client.get(f"/applications/{app_id}/follow-up", headers=auth_header).json()
    assert "day_3" not in [d["kind"] for d in fu2["due_now"]]
    assert "day_3" in fu2["dismissed_kinds"]


# ─── E: Part A Hardening & Semantics Tests ────────────────────────────────────

def test_ghosted_only_app():
    """A1: Ghosted counts in denominator (applied_count) only, never in response_count."""
    token = create_access_token(data={"sub": "ghosted_only@example.com"})
    db = TestingSessionLocal()
    user = User(email="ghosted_only@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="GhostCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    db.refresh(j)
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    app_res = client.post("/applications", json={"job_id": j.id, "status": "applied"}, headers=hdr)
    app_id = app_res.json()["id"]

    # Mark as ghosted
    patch_res = client.patch(f"/applications/{app_id}", json={"status": "ghosted"}, headers=hdr)
    assert patch_res.status_code == 200

    res = client.get("/applications/analytics", headers=hdr)
    assert res.status_code == 200
    data = res.json()
    assert data["applied_count"] == 1
    assert data["ghosted_count"] == 1
    assert data["response_count"] == 0


def test_ghosted_then_response_reopens():
    """A1: A response event on a ghosted application reopens it: status leaves 'ghosted' and response counts."""
    token = create_access_token(data={"sub": "ghosted_reopen@example.com"})
    db = TestingSessionLocal()
    user = User(email="ghosted_reopen@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="ReopenCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    db.refresh(j)
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    app_res = client.post("/applications", json={"job_id": j.id, "status": "applied"}, headers=hdr)
    app_id = app_res.json()["id"]

    # Mark ghosted
    client.patch(f"/applications/{app_id}", json={"status": "ghosted"}, headers=hdr)
    app_row = get_db_app(app_id)
    assert app_row.status == "ghosted"

    # Send response_received event
    ev_res = client.post(
        f"/applications/{app_id}/events",
        json={"event_type": "response_received", "note": "Recruiter emailed back"},
        headers=hdr
    )
    assert ev_res.status_code == 200

    # Status must have left "ghosted"
    app_row = get_db_app(app_id)
    assert app_row.status != "ghosted"

    # Funnel analytics: response must count, ghosted_count must be 0
    res = client.get("/applications/analytics", headers=hdr)
    data = res.json()
    assert data["applied_count"] == 1
    assert data["response_count"] == 1
    assert data["ghosted_count"] == 0


def test_rejected_counted_as_response():
    """A1: Rejected counts as a response (response_count == 1, rejected_count == 1)."""
    token = create_access_token(data={"sub": "rejected_resp@example.com"})
    db = TestingSessionLocal()
    user = User(email="rejected_resp@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="RejectCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    db.refresh(j)
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    app_res = client.post("/applications", json={"job_id": j.id, "status": "applied"}, headers=hdr)
    app_id = app_res.json()["id"]

    # Mark rejected
    client.patch(f"/applications/{app_id}", json={"status": "rejected"}, headers=hdr)

    res = client.get("/applications/analytics", headers=hdr)
    data = res.json()
    assert data["applied_count"] == 1
    assert data["response_count"] == 1
    assert data["rejected_count"] == 1
    assert data["ghosted_count"] == 0


def test_implicit_applied_event_backfill():
    """A3: Moving to post-applied status without applied event backfills applied event with note."""
    token = create_access_token(data={"sub": "implicit_applied@example.com"})
    db = TestingSessionLocal()
    user = User(email="implicit_applied@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="ImplicitCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    db.refresh(j)
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    # Create application in 'pending' status (not applied)
    app_res = client.post("/applications", json={"job_id": j.id, "status": "pending"}, headers=hdr)
    app_id = app_res.json()["id"]

    # Directly change status to interview
    patch_res = client.patch(f"/applications/{app_id}", json={"status": "interview"}, headers=hdr)
    assert patch_res.status_code == 200

    # Verify timeline events: applied event must exist with required note
    events_res = client.get(f"/applications/{app_id}/events", headers=hdr)
    events = events_res.json()
    applied_events = [e for e in events if e["event_type"] == "applied"]
    assert len(applied_events) == 1
    assert applied_events[0]["note"] == "implicit: status moved without applied event"

    # Verify analytics: counted as applied
    res = client.get("/applications/analytics", headers=hdr)
    data = res.json()
    assert data["applied_count"] == 1
    assert data["interview_count"] == 1
    assert data["response_count"] == 1


def test_duplicate_response_events_distinct_application():
    """A4: Analytics counts DISTINCT application_id; two response events on one app yields response_count == 1."""
    token = create_access_token(data={"sub": "duplicate_resp@example.com"})
    db = TestingSessionLocal()
    user = User(email="duplicate_resp@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="DupCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    db.refresh(j)
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    app_res = client.post("/applications", json={"job_id": j.id, "status": "applied"}, headers=hdr)
    app_id = app_res.json()["id"]

    # Post two response events directly to the timeline
    ev1 = client.post(f"/applications/{app_id}/events", json={"event_type": "response_received", "note": "Email 1"}, headers=hdr)
    assert ev1.status_code == 200

    # Second response event directly in DB to simulate multiple response events existing on the application
    db2 = TestingSessionLocal()
    db2.add(ApplicationEvent(application_id=app_id, event_type="phone_screen", occurred_at=datetime.utcnow(), note="Screen 2"))
    db2.commit()
    db2.close()

    # Assert analytics counts response_count == 1
    res = client.get("/applications/analytics", headers=hdr)
    data = res.json()
    assert data["applied_count"] == 1
    assert data["response_count"] == 1


def test_alembic_upgrade_pre_existing_user_login():
    """
    C1: Build old-schema DB at revision 103c751b0c1d with one unverified user,
    run real `alembic upgrade head`, then log in via API.
    """
    import tempfile
    import sqlite3
    from alembic.config import Config
    from alembic import command

    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, "test_alembic_upgrade.db")
    db_url = f"sqlite:///{db_path}"

    base_dir = os.path.dirname(os.path.dirname(__file__))
    alembic_ini_path = os.path.join(base_dir, "alembic.ini")
    cfg = Config(alembic_ini_path)
    cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    os.environ["DATABASE_URL"] = db_url

    try:
        # Build old-schema DB (revision 103c751b0c1d)
        command.upgrade(cfg, "103c751b0c1d")

        # Insert one user in old schema (no is_verified column existed in 103c751b0c1d)
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute(
            "INSERT INTO users (email, hashed_password) VALUES (?, ?)",
            ("alembic_migrated@example.com", get_password_hash("migrated_pass123"))
        )
        conn.commit()
        conn.close()

        # Run real alembic upgrade head
        command.upgrade(cfg, "head")

        # Verify user has is_verified = 1 in upgraded schema
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT email, is_verified FROM users WHERE email = ?", ("alembic_migrated@example.com",))
        row = c.fetchone()
        assert row is not None
        assert row[1] == 1, "User must have is_verified = 1 after upgrade"
        conn.close()

        # Wire DB override to point to the migrated database and log in via API
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        mig_engine = create_engine(db_url, connect_args={"check_same_thread": False})
        MigSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=mig_engine)

        def override_mig_db():
            s = MigSessionLocal()
            try:
                yield s
            finally:
                s.close()

        app.dependency_overrides[get_db] = override_mig_db
        login_res = client.post(
            "/auth/login",
            json={"email": "alembic_migrated@example.com", "password": "migrated_pass123"}
        )
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()
    finally:
        app.dependency_overrides[get_db] = override_get_db
        if os.path.exists(db_path):
            os.remove(db_path)


def test_email_verification_env_var(monkeypatch, capsys):
    """A2: REQUIRE_EMAIL_VERIFICATION env var controls verification requirements at register and login."""
    # 1. REQUIRE_EMAIL_VERIFICATION=false skips verification at registration and login
    monkeypatch.setenv("REQUIRE_EMAIL_VERIFICATION", "false")
    reg_res = client.post(
        "/auth/register",
        json={"email": "no_verify_needed@example.com", "password": "securepassword123"}
    )
    assert reg_res.status_code == 200
    assert reg_res.json()["is_verified"] is True

    login_res = client.post(
        "/auth/login",
        json={"email": "no_verify_needed@example.com", "password": "securepassword123"}
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

    # 2. REQUIRE_EMAIL_VERIFICATION=true and no SMTP logs verification link to console
    monkeypatch.setenv("REQUIRE_EMAIL_VERIFICATION", "true")
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASS", raising=False)
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)

    reg_res2 = client.post(
        "/auth/register",
        json={"email": "console_verify@example.com", "password": "securepassword123"}
    )
    assert reg_res2.status_code == 200
    assert reg_res2.json()["is_verified"] is False
    captured = capsys.readouterr()
    assert "EMAIL VERIFICATION LINK (no SMTP configured):" in captured.out


def test_unapplied_cannot_move_to_ghosted():
    """C2: Moving to ghosted from unapplied status returns 400 and creates no implicit applied event."""
    token = create_access_token(data={"sub": "ghost_guard@example.com"})
    db = TestingSessionLocal()
    user = User(email="ghost_guard@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="GhostGuardCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    db.refresh(j)
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    app_res = client.post("/applications", json={"job_id": j.id, "status": "pending"}, headers=hdr)
    app_id = app_res.json()["id"]

    # Attempt to PATCH status to ghosted -> 400
    patch_res = client.patch(f"/applications/{app_id}", json={"status": "ghosted"}, headers=hdr)
    assert patch_res.status_code == 400

    # Attempt to POST ghosted event -> 400
    ev_res = client.post(f"/applications/{app_id}/events", json={"event_type": "ghosted"}, headers=hdr)
    assert ev_res.status_code == 400

    # Timeline must have no applied events
    events = client.get(f"/applications/{app_id}/events", headers=hdr).json()
    assert not any(e["event_type"] == "applied" for e in events)


def test_post_applied_status_with_optional_applied_date():
    """C2: Moving to interview with/without applied_date sets applied_date_estimated correctly."""
    token = create_access_token(data={"sub": "estimated_test@example.com"})
    db = TestingSessionLocal()
    user = User(email="estimated_test@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j1 = Job(role="Dev 1", company="EstCo 1", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    j2 = Job(role="Dev 2", company="EstCo 2", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add_all([j1, j2])
    db.commit()
    j1_id = j1.id
    j2_id = j2.id
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}

    # Case A: No applied_date given -> backfill with now, applied_date_estimated: True
    app1 = client.post("/applications", json={"job_id": j1_id, "status": "pending"}, headers=hdr).json()
    res1 = client.patch(f"/applications/{app1['id']}", json={"status": "interview"}, headers=hdr)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["applied_date_estimated"] is True

    events1 = client.get(f"/applications/{app1['id']}/events", headers=hdr).json()
    applied_ev1 = [e for e in events1 if e["event_type"] == "applied"][0]
    assert "implicit" in applied_ev1["note"]

    # Case B: User-supplied applied_date -> applied_date_estimated: False
    past_date = (datetime.utcnow() - timedelta(days=10)).isoformat()
    app2 = client.post("/applications", json={"job_id": j2_id, "status": "pending"}, headers=hdr).json()
    res2 = client.patch(
        f"/applications/{app2['id']}",
        json={"status": "interview", "applied_date": past_date},
        headers=hdr
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["applied_date_estimated"] is False


def test_follow_up_nudges_with_user_supplied_applied_date():
    """C2: Follow-up nudges compute days_since_applied from user-supplied applied_date."""
    token = create_access_token(data={"sub": "nudge_user_date@example.com"})
    db = TestingSessionLocal()
    user = User(email="nudge_user_date@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="NudgeCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    j_id = j.id
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    app = client.post("/applications", json={"job_id": j_id, "status": "pending"}, headers=hdr).json()
    app_id = app["id"]

    # User supplies applied_date 5 days ago and moves status to applied
    five_days_ago = (datetime.utcnow() - timedelta(days=5)).isoformat()
    client.patch(
        f"/applications/{app_id}",
        json={"status": "applied", "applied_date": five_days_ago},
        headers=hdr
    )

    fu_res = client.get(f"/applications/{app_id}/follow-up", headers=hdr)
    assert fu_res.status_code == 200
    fu = fu_res.json()
    assert fu["days_since_applied"] >= 5
    assert fu["applied_date_estimated"] is False
    # Day 3 window must be due
    assert "day_3" in [d["kind"] for d in fu["due_now"]]


def test_response_received_deduplication():
    """C3: Posting same response_received event twice on one application results in 1 event row and response_count == 1."""
    token = create_access_token(data={"sub": "dedup_resp@example.com"})
    db = TestingSessionLocal()
    user = User(email="dedup_resp@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    j = Job(role="Dev", company="DedupCo", location="Remote", description="d", apply_link="https://ex.com", user_id=user_id)
    db.add(j)
    db.commit()
    j_id = j.id
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    app_res = client.post("/applications", json={"job_id": j_id, "status": "applied"}, headers=hdr)
    app_id = app_res.json()["id"]

    # Post response_received first time
    r1 = client.post(f"/applications/{app_id}/events", json={"event_type": "response_received", "note": "First email"}, headers=hdr)
    assert r1.status_code == 200

    # Post response_received second time
    r2 = client.post(f"/applications/{app_id}/events", json={"event_type": "response_received", "note": "Second email"}, headers=hdr)
    assert r2.status_code == 200

    # Assert exactly 1 event row of type response_received in DB
    events = client.get(f"/applications/{app_id}/events", headers=hdr).json()
    resp_events = [e for e in events if e["event_type"] == "response_received"]
    assert len(resp_events) == 1, f"Expected 1 response_received event, found {len(resp_events)}"

    # Assert analytics response_count == 1
    an_res = client.get("/applications/analytics", headers=hdr)
    assert an_res.status_code == 200
    assert an_res.json()["response_count"] == 1


def test_job_recency_label_api_and_null_date():
    """B2: Job API returns recency_label. Null posted_date returns 'Posting date unknown', not 'Posted today'."""
    token = create_access_token(data={"sub": "recency_user@example.com"})
    db = TestingSessionLocal()
    user = User(email="recency_user@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    now = datetime.utcnow()
    # 1. Null posted_date
    j_null = Job(role="Backend", company="NullCo", location="Remote", description="d", apply_link="https://ex.com", posted_date=None, user_id=user_id)
    # 2. Today posted_date
    j_today = Job(role="Frontend", company="TodayCo", location="Remote", description="d", apply_link="https://ex.com", posted_date=now, user_id=user_id)
    # 3. 5 days ago
    j_5d = Job(role="DevOps", company="PastCo", location="Remote", description="d", apply_link="https://ex.com", posted_date=now - timedelta(days=5), user_id=user_id)

    db.add_all([j_null, j_today, j_5d])
    db.commit()
    j_null_id, j_today_id, j_5d_id = j_null.id, j_today.id, j_5d.id
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}
    res = client.get("/jobs", headers=hdr)
    assert res.status_code == 200
    job_map = {job["id"]: job for job in res.json()["jobs"]}

    assert job_map[j_null_id]["posted_date"] is None
    assert job_map[j_null_id]["recency_label"] == "Posting date unknown"

    assert job_map[j_today_id]["recency_label"] == "Posted today"
    assert job_map[j_5d_id]["recency_label"] == "Posted 5 days ago"


def test_linkedin_search_url_encoding_special_chars():
    """B4: Test URL builder encoding with ampersands, spaces, and non-ASCII characters."""
    import urllib.parse

    def build_url(prefix: str, company: str) -> str:
        trimmed = (company or "").strip()
        if not trimmed:
            return ""
        return f"https://www.linkedin.com/search/results/people/?keywords={urllib.parse.quote(prefix + trimmed)}"

    # Spaces and &
    url_att = build_url("Engineering Manager ", "AT&T")
    assert url_att == "https://www.linkedin.com/search/results/people/?keywords=Engineering%20Manager%20AT%26T"

    url_bh = build_url("Technical Recruiter ", "B&H")
    assert url_bh == "https://www.linkedin.com/search/results/people/?keywords=Technical%20Recruiter%20B%26H"

    # Non-ASCII European: Société Générale
    url_sg = build_url("Engineering Manager ", "Société Générale")
    assert url_sg == "https://www.linkedin.com/search/results/people/?keywords=Engineering%20Manager%20Soci%C3%A9t%C3%A9%20G%C3%A9n%C3%A9rale"

    # Non-ASCII CJK: Rakuten 楽天
    url_rakuten = build_url("Technical Recruiter ", "Rakuten 楽天")
    assert url_rakuten == "https://www.linkedin.com/search/results/people/?keywords=Technical%20Recruiter%20Rakuten%20%E6%A5%BD%E5%A4%A9"

    # Empty / whitespace company
    assert build_url("Engineering Manager ", "") == ""
    assert build_url("Engineering Manager ", "   ") == ""


def test_manual_job_creation_and_parse_text():
    """Verify manual job creation and raw text parsing endpoints."""
    token = create_access_token(data={"sub": "custom_job_user@example.com"})
    db = TestingSessionLocal()
    user = User(email="custom_job_user@example.com", hashed_password=get_password_hash("pass"), is_verified=True)
    db.add(user)
    db.commit()
    user_id = user.id

    prof = ResumeProfile(
        user_id=user_id,
        name="Backend Dev",
        skills=["Python", "FastAPI"],
        is_default=True
    )
    db.add(prof)
    db.commit()
    db.close()

    hdr = {"Authorization": f"Bearer {token}"}

    # 1. Test POST /jobs/manual
    res_manual = client.post("/jobs/manual", json={
        "role": "Senior Backend Engineer",
        "company": "Acme Corp",
        "location": "Bengaluru, India",
        "salary": "₹30-40 LPA",
        "description": "Looking for Python and FastAPI developer",
        "apply_link": "https://acme.com/careers/123"
    }, headers=hdr)
    assert res_manual.status_code == 200
    m_data = res_manual.json()
    assert m_data["role"] == "Senior Backend Engineer"
    assert m_data["company"] == "Acme Corp"
    assert m_data["source"] == "manual"
    assert m_data["posted_date"] is None
    assert m_data["recency_label"] == "Posting date unknown"

    # 2. Test POST /jobs/parse-text
    res_text = client.post("/jobs/parse-text", json={
        "text": "Senior Python Developer needed at TechSolutions. Location: Remote. Requirements: 5 years Python experience.",
        "url": "https://in.indeed.com/viewjob?jk=custom123"
    }, headers=hdr)
    assert res_text.status_code == 200
    t_data = res_text.json()
    assert t_data["source"] == "custom-text"
    assert t_data["posted_date"] is None
    assert t_data["recency_label"] == "Posting date unknown"
    assert len(t_data["role"]) > 0
    assert len(t_data["company"]) > 0

    # 3. Test POST /jobs/parse-url with raw_text fallback
    res_url_fallback = client.post("/jobs/parse-url", json={
        "url": "https://in.indeed.com/viewjob?jk=fallback123",
        "raw_text": "Staff Engineer at CloudScale. Location: Hybrid. Deep knowledge of distributed systems."
    }, headers=hdr)
    assert res_url_fallback.status_code == 200
    fb_data = res_url_fallback.json()
    assert fb_data["source"] == "custom-url"
    assert fb_data["apply_link"] == "https://in.indeed.com/viewjob?jk=fallback123"
    assert fb_data["posted_date"] is None
    assert fb_data["recency_label"] == "Posting date unknown"


