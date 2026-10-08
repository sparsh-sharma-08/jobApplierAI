"""
Tests for backend/services/follow_up.py

All tests use a fixed `now` so they never depend on the clock.
Run with:  pytest backend/tests/test_follow_up.py -v
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

import pytest
from datetime import datetime, timedelta

from services.follow_up import (
    FollowUpKind,
    ApplicationFollowUpState,
    compute_follow_up_state,
    days_since,
    has_received_response,
    followed_up_kinds,
    next_follow_up_date,
    recency_label,
)

NOW = datetime(2024, 6, 15, 12, 0, 0)  # fixed reference point


def applied(days_ago: int) -> datetime:
    return NOW - timedelta(days=days_ago)


def state(days_ago, event_types=None, event_kinds=None):
    return compute_follow_up_state(
        application_id=1,
        applied_date=applied(days_ago),
        company="Acme",
        role="Backend Engineer",
        event_types=event_types or [],
        event_kinds=event_kinds or [],
        now=NOW,
    )


# ─── days_since ───────────────────────────────────────────────────────────────

class TestDaysSince:
    def test_zero_on_same_day(self):
        assert days_since(NOW, NOW) == 0

    def test_exact_days(self):
        assert days_since(applied(7), NOW) == 7

    def test_clock_skew_safety(self):
        # applied_date is in the future — should return 0, not negative
        future = NOW + timedelta(days=2)
        assert days_since(future, NOW) == 0


# ─── has_received_response ────────────────────────────────────────────────────

class TestHasReceivedResponse:
    def test_empty_events(self):
        assert has_received_response([]) is False

    def test_applied_only(self):
        assert has_received_response(["applied"]) is False

    def test_followed_up_only(self):
        assert has_received_response(["applied", "followed_up"]) is False

    def test_phone_screen_triggers_response(self):
        assert has_received_response(["applied", "phone_screen"]) is True

    def test_rejected_triggers_response(self):
        assert has_received_response(["rejected"]) is True

    def test_offer_triggers_response(self):
        assert has_received_response(["offer"]) is True

    def test_ghosted_triggers_response(self):
        # User manually marked ghosted — no more nudges
        assert has_received_response(["ghosted"]) is True


# ─── followed_up_kinds ────────────────────────────────────────────────────────

class TestFollowedUpKinds:
    def test_no_follow_ups(self):
        assert followed_up_kinds(["applied"], [None]) == []

    def test_single_follow_up(self):
        kinds = followed_up_kinds(
            ["applied", "followed_up"],
            [None, "day_3"],
        )
        assert kinds == [FollowUpKind.DAY_3]

    def test_multiple_follow_ups(self):
        kinds = followed_up_kinds(
            ["applied", "followed_up", "followed_up"],
            [None, "day_3", "day_7"],
        )
        assert FollowUpKind.DAY_3 in kinds
        assert FollowUpKind.DAY_7 in kinds

    def test_unknown_kind_ignored_safely(self):
        kinds = followed_up_kinds(
            ["followed_up"],
            ["invented_kind_from_old_data"],
        )
        assert kinds == []


# ─── compute_follow_up_state ─────────────────────────────────────────────────

class TestComputeFollowUpState:

    def test_no_action_before_day_3(self):
        s = state(days_ago=1)
        assert s.due_now == []
        assert s.days_since_applied == 1
        assert s.has_response is False

    def test_day_3_due(self):
        s = state(days_ago=3)
        assert len(s.due_now) == 1
        assert s.due_now[0].kind == FollowUpKind.DAY_3
        assert s.due_now[0].days_overdue == 0
        assert "Acme" in s.due_now[0].message

    def test_day_7_due_accumulates(self):
        # At day 7, both day_3 and day_7 windows are open
        s = state(days_ago=7)
        kinds = [d.kind for d in s.due_now]
        assert FollowUpKind.DAY_3 in kinds
        assert FollowUpKind.DAY_7 in kinds

    def test_day_3_done_day_7_shows(self):
        s = state(
            days_ago=7,
            event_types=["applied", "followed_up"],
            event_kinds=[None, "day_3"],
        )
        kinds = [d.kind for d in s.due_now]
        assert FollowUpKind.DAY_3 not in kinds
        assert FollowUpKind.DAY_7 in kinds

    def test_all_windows_done_no_nudge(self):
        s = state(
            days_ago=25,
            event_types=["applied", "followed_up", "followed_up", "followed_up"],
            event_kinds=[None, "day_3", "day_7", "day_14"],
        )
        # Only ghosted_suggestion remains (day 21)
        kinds = [d.kind for d in s.due_now]
        assert kinds == [FollowUpKind.GHOSTED_SUGGESTION]

    def test_response_stops_all_nudges(self):
        s = state(
            days_ago=20,
            event_types=["applied", "response_received"],
            event_kinds=[None, None],
        )
        assert s.due_now == []
        assert s.has_response is True

    def test_ghosted_suggestion_at_21_days(self):
        s = state(days_ago=21)
        kinds = [d.kind for d in s.due_now]
        assert FollowUpKind.GHOSTED_SUGGESTION in kinds

    def test_days_overdue_is_accurate(self):
        s = state(days_ago=10)  # day_3 is 7 days overdue
        day3 = next(d for d in s.due_now if d.kind == FollowUpKind.DAY_3)
        assert day3.days_overdue == 7

    def test_message_contains_role(self):
        s = state(days_ago=7)
        day7 = next(d for d in s.due_now if d.kind == FollowUpKind.DAY_7)
        assert "Backend Engineer" in day7.message


# ─── next_follow_up_date ─────────────────────────────────────────────────────

class TestNextFollowUpDate:
    def test_first_window_when_none_done(self):
        base = datetime(2024, 6, 1)
        expected = base + timedelta(days=3)
        assert next_follow_up_date(base, []) == expected

    def test_second_window_when_day_3_done(self):
        base = datetime(2024, 6, 1)
        expected = base + timedelta(days=7)
        result = next_follow_up_date(base, [FollowUpKind.DAY_3])
        assert result == expected

    def test_none_when_all_done(self):
        base = datetime(2024, 6, 1)
        all_kinds = [FollowUpKind.DAY_3, FollowUpKind.DAY_7,
                     FollowUpKind.DAY_14, FollowUpKind.GHOSTED_SUGGESTION]
        assert next_follow_up_date(base, all_kinds) is None


# ─── recency_label ────────────────────────────────────────────────────────────

class TestRecencyLabel:
    """
    Verify that labels exactly mirror the scoring bands in scorer.py.
    If scorer.py changes its thresholds, these tests will fail as a reminder
    to update the UI copy too.
    """
    def test_0_days(self):
        assert "10/10" in recency_label(0)

    def test_2_days(self):
        assert "10/10" in recency_label(2)

    def test_3_days(self):
        assert "8/10" in recency_label(3)

    def test_7_days(self):
        assert "8/10" in recency_label(7)

    def test_8_days(self):
        assert "5/10" in recency_label(8)

    def test_14_days(self):
        assert "5/10" in recency_label(14)

    def test_15_days(self):
        assert "2/10" in recency_label(15)

    def test_30_days(self):
        assert "2/10" in recency_label(30)

    def test_31_days(self):
        assert "0/10" in recency_label(31)

    def test_no_invented_statistics(self):
        # Regression: labels must never mention "80%", "response rate", etc.
        for days in [0, 1, 3, 7, 8, 14, 15, 30, 31, 60]:
            label = recency_label(days)
            assert "%" not in label, f"recency_label({days}) contains a percentage: {label!r}"
            assert "response rate" not in label.lower()


# ─── Timezone Tests ────────────────────────────────────────────────────────────

class TestDaysSinceTz:
    """
    Verify that days_since_tz computes calendar-day difference in the user's
    LOCAL timezone, not UTC. Key edge case: 20:00 UTC on day N is already
    01:30 on day N+1 in IST (UTC+5:30).
    """

    def _ist(self):
        from zoneinfo import ZoneInfo
        return ZoneInfo("Asia/Kolkata")

    def _utc(self):
        from zoneinfo import ZoneInfo
        return ZoneInfo("UTC")

    def test_import_days_since_tz(self):
        from services.follow_up import days_since_tz
        assert callable(days_since_tz)

    def test_same_utc_date_same_ist_date(self):
        """12:00 UTC on day N → 17:30 IST on day N → 0 days difference."""
        from services.follow_up import days_since_tz
        applied = datetime(2024, 6, 15, 6, 0, 0)   # 06:00 UTC = 11:30 IST
        now     = datetime(2024, 6, 15, 12, 0, 0)  # 12:00 UTC = 17:30 IST
        assert days_since_tz(applied, now, self._ist()) == 0

    def test_utc_day_boundary_ist_advances(self):
        """
        applied: 2024-06-15 06:00 UTC (= 11:30 IST on June 15)
        now:     2024-06-15 20:00 UTC (= 01:30 IST on June 16)
        UTC difference: (20-6)/24 = 0 full days.
        IST calendar difference: June 15 → June 16 = 1 day.
        days_since_tz must return 1, not 0.
        """
        from services.follow_up import days_since_tz, days_since
        applied = datetime(2024, 6, 15, 6, 0, 0)
        now     = datetime(2024, 6, 15, 20, 0, 0)

        utc_days = days_since(applied, now)          # 0 days (same UTC date)
        ist_days = days_since_tz(applied, now, self._ist())  # 1 day (IST already day+1)

        assert utc_days == 0, f"UTC should see 0 days, got {utc_days}"
        assert ist_days == 1, f"IST should see 1 day, got {ist_days}"

    def test_day3_boundary_triggers_correctly_in_ist(self):
        """
        Applied: 2024-06-12 06:00 UTC
        Now:     2024-06-15 20:00 UTC = 2024-06-16 01:30 IST
        UTC days: 3 (June 12→15), IST calendar days: 4 (June 12→16).
        day_3 must be due and day_3 must be in due_now.
        """
        from services.follow_up import compute_follow_up_state
        from zoneinfo import ZoneInfo
        applied = datetime(2024, 6, 12, 6, 0, 0)
        now     = datetime(2024, 6, 15, 20, 0, 0)
        ist     = ZoneInfo("Asia/Kolkata")

        st = compute_follow_up_state(
            application_id=999, applied_date=applied,
            company="TestCo", role="Eng",
            event_types=[], event_kinds=[],
            now=now, tz=ist
        )
        kinds_due = [d.kind for d in st.due_now]
        assert FollowUpKind.DAY_3 in kinds_due
        assert st.days_since_applied == 4  # IST calendar sees 4 days

    def test_days_since_tz_utc_timezone_matches_days_since(self):
        """
        When tz=UTC, days_since_tz must produce the same result as days_since
        (for naive datetimes at noon, where time-of-day doesn't cross midnight).
        """
        from services.follow_up import days_since_tz, days_since
        applied = datetime(2024, 6, 10, 12, 0, 0)
        now     = datetime(2024, 6, 17, 12, 0, 0)
        assert days_since(applied, now) == days_since_tz(applied, now, self._utc())

    def test_clock_skew_safety_tz(self):
        """days_since_tz must return 0, not negative, if now is before applied."""
        from services.follow_up import days_since_tz
        applied = datetime(2024, 6, 20, 12, 0, 0)
        now     = datetime(2024, 6, 18, 12, 0, 0)
        assert days_since_tz(applied, now, self._ist()) == 0


class TestDismissal:
    def test_dismissed_day_3_not_due(self):
        st = compute_follow_up_state(
            application_id=1,
            applied_date=applied(5),
            company="Acme",
            role="Dev",
            event_types=["applied", "follow_up_dismissed"],
            event_kinds=[None, "day_3"],
            now=NOW,
        )
        assert "day_3" not in [d.kind.value for d in st.due_now]
        assert FollowUpKind.DAY_3 in st.dismissed_kinds

    def test_dismissed_day_3_allows_day_7_when_due(self):
        st = compute_follow_up_state(
            application_id=1,
            applied_date=applied(8),
            company="Acme",
            role="Dev",
            event_types=["applied", "follow_up_dismissed"],
            event_kinds=[None, "day_3"],
            now=NOW,
        )
        due_kinds = [d.kind.value for d in st.due_now]
        assert "day_3" not in due_kinds
        assert "day_7" in due_kinds

