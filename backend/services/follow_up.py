"""
Follow-up due-date logic for job applications.

Pure functions only — no database, no HTTP, no side effects.
Every function is independently testable with a fixed `now` argument.

Design decisions captured here so they don't drift into comments spread
across the codebase:

1.  Day counts are calendar days from applied_date, not business days.
    Recruiters work weekends at many companies; business-day logic adds
    complexity and false precision.

2.  The three follow-up windows (3 / 7 / 14) are thresholds, not exact
    days. A follow-up is "due" from that day onward until the next window
    or until the application is no longer in a state that warrants one.

3.  A follow-up is only due when the application is in a state where
    there has been no response yet. Once there is a response_received,
    phone_screen, offer, rejected, or ghosted event, follow-up nudges stop.

4.  "Ghosted" is a user action, not an automatic label. We surface a
    suggestion at 21+ days with no response, but never auto-update status.
    The user decides.

5.  All functions accept `now: datetime` so tests can be fully deterministic.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import List, Optional
from zoneinfo import ZoneInfo

# Timezone used for computing "due today" boundaries.
# Calendar-day comparisons should use the user's LOCAL date, not UTC.
# Default matches the project author's location (IST = UTC+5:30).
USER_TIMEZONE = ZoneInfo(os.getenv("USER_TIMEZONE", "Asia/Kolkata"))


# ─── Types ────────────────────────────────────────────────────────────────────

class FollowUpKind(str, Enum):
    """Which follow-up window this nudge represents."""
    DAY_3  = "day_3"    # LinkedIn connection / brief check-in
    DAY_7  = "day_7"    # First formal follow-up email
    DAY_14 = "day_14"   # Final check-in before marking ghosted
    GHOSTED_SUGGESTION = "ghosted_suggestion"  # 21+ days, suggest marking ghosted


# Event types that mean "we have a response — stop nudging"
_RESPONSE_EVENT_TYPES = frozenset({
    "response_received",
    "phone_screen",
    "technical",
    "final_round",
    "offer",
    "rejected",
    "ghosted",
})

# Follow-up windows: (kind, due_after_days, message shown to user)
_WINDOWS = [
    (FollowUpKind.DAY_3,  3,  "Send a brief LinkedIn connection request to someone at {company}."),
    (FollowUpKind.DAY_7,  7,  "Send a polite follow-up email referencing your {role} application."),
    (FollowUpKind.DAY_14, 14, "Send a final check-in. If no reply after this, consider marking as ghosted."),
    (FollowUpKind.GHOSTED_SUGGESTION, 21, "No response in 21 days. You can mark this as ghosted or keep waiting."),
]


@dataclass(frozen=True)
class FollowUpDue:
    """A single follow-up nudge that is currently due."""
    kind: FollowUpKind
    due_since: datetime   # the datetime when this window opened
    days_overdue: int     # how many days past due_since we are now
    message: str          # human-readable instruction, company/role substituted in


@dataclass(frozen=True)
class ApplicationFollowUpState:
    """
    Complete follow-up state for one application.

    `due_now` is empty when no follow-up is currently needed
    (either the application is too fresh, already responded to,
    or the user already sent the appropriate follow-up).
    """
    application_id: int
    applied_date: datetime
    company: str
    role: str
    days_since_applied: int
    due_now: List[FollowUpDue]
    already_followed_up_kinds: List[FollowUpKind]
    has_response: bool
    dismissed_kinds: List[FollowUpKind] = field(default_factory=list)


# ─── Core pure functions ───────────────────────────────────────────────────────

def days_since(applied_date: datetime, now: datetime) -> int:
    """
    Integer calendar days between applied_date and now (both naive UTC).
    Returns 0 if now < applied_date (clock skew safety).
    Preserved for backward-compatible unit tests that pass naive datetimes.
    """
    delta = (now - applied_date).days
    return max(0, delta)


def days_since_tz(applied_date: datetime, now: datetime, tz: ZoneInfo = USER_TIMEZONE) -> int:
    """
    Calendar-day difference computed in the user's LOCAL timezone.

    Why: at 20:00 UTC on day N, a user in IST (UTC+5:30) is already at
    01:30 on day N+1. A plain timedelta subtraction would return 0 days
    elapsed even though the user's calendar already shows day N+1.

    Parameters
    ----------
    applied_date : naive UTC datetime (as stored in DB)
    now          : naive UTC datetime (datetime.utcnow() or injectable)
    tz           : local timezone for calendar-date comparison (default USER_TIMEZONE)

    Returns 0 when now is before applied_date (clock skew safety).
    """
    def to_local_date(dt: datetime):
        # Make UTC-aware then convert to local date
        aware = dt.replace(tzinfo=timezone.utc)
        return aware.astimezone(tz).date()

    local_applied = to_local_date(applied_date)
    local_now = to_local_date(now)
    delta = (local_now - local_applied).days
    return max(0, delta)


def has_received_response(event_types: List[str]) -> bool:
    """
    True if any event in the application's timeline indicates
    the recruiter/company has responded. Once true, follow-up
    nudges stop entirely.
    """
    return any(e in _RESPONSE_EVENT_TYPES for e in event_types)


def followed_up_kinds(event_types: List[str], event_kinds: List[Optional[str]]) -> List[FollowUpKind]:
    """
    Returns the FollowUpKind values the user has already completed,
    derived from 'followed_up' events that carry a kind tag.

    `event_types` and `event_kinds` are parallel lists of the same length.
    event_kinds[i] is only meaningful when event_types[i] == 'followed_up'.
    """
    result = []
    for etype, ekind in zip(event_types, event_kinds):
        if etype == "followed_up" and ekind:
            try:
                k = FollowUpKind(ekind)
                if k not in result:
                    result.append(k)
            except ValueError:
                pass  # unknown kind stored in DB — ignore safely
    return result


def dismissed_follow_up_kinds(event_types: List[str], event_kinds: List[Optional[str]]) -> List[FollowUpKind]:
    """
    Returns the FollowUpKind values the user has dismissed,
    derived from 'follow_up_dismissed' or 'dismissed' events that carry a kind tag.
    """
    result = []
    for etype, ekind in zip(event_types, event_kinds):
        if etype in ("follow_up_dismissed", "dismissed") and ekind:
            try:
                k = FollowUpKind(ekind)
                if k not in result:
                    result.append(k)
            except ValueError:
                pass  # unknown kind stored in DB — ignore safely
    return result


def compute_follow_up_state(
    *,
    application_id: int,
    applied_date: datetime,
    company: str,
    role: str,
    event_types: List[str],
    event_kinds: List[Optional[str]],
    now: datetime,
    tz: ZoneInfo = USER_TIMEZONE,
) -> ApplicationFollowUpState:
    """
    Primary entry point. Given an application's timeline events,
    compute what follow-up actions (if any) are due right now.

    Parameters
    ----------
    application_id : int
    applied_date   : naive UTC datetime stored in DB
    company        : company name, for message formatting only
    role           : role title, for message formatting only
    event_types    : list of event_type strings from ApplicationEvent rows
    event_kinds    : parallel list; for 'followed_up' events, the FollowUpKind
                     stored as event metadata; None for all other event types
    now            : naive UTC datetime (injectable for tests)
    tz             : user timezone for calendar-day boundary checks
    """
    d = days_since_tz(applied_date, now, tz)
    responded = has_received_response(event_types)
    done_kinds = followed_up_kinds(event_types, event_kinds)
    dismissed = dismissed_follow_up_kinds(event_types, event_kinds)

    due: List[FollowUpDue] = []

    if not responded:
        for kind, threshold, template in _WINDOWS:
            if d >= threshold and kind not in done_kinds and kind not in dismissed:
                message = template.format(company=company, role=role)
                due.append(FollowUpDue(
                    kind=kind,
                    due_since=applied_date + timedelta(days=threshold),
                    days_overdue=d - threshold,
                    message=message,
                ))

    return ApplicationFollowUpState(
        application_id=application_id,
        applied_date=applied_date,
        company=company,
        role=role,
        days_since_applied=d,
        due_now=due,
        already_followed_up_kinds=done_kinds,
        has_response=responded,
        dismissed_kinds=dismissed,
    )



def next_follow_up_date(applied_date: datetime, done_kinds: List[FollowUpKind]) -> Optional[datetime]:
    """
    Returns the datetime of the next follow-up window that hasn't been done yet,
    or None if all windows are completed.

    Useful for rendering "Next action on {date}" in the Tracker UI.
    """
    for kind, threshold, _ in _WINDOWS:
        if kind not in done_kinds:
            return applied_date + timedelta(days=threshold)
    return None


def recency_label(days_old: int) -> str:
    """
    Human-readable freshness label that mirrors exactly what scorer.py
    computes, so UI copy is grounded in the actual scoring model.

    Scorer awards (from services/scorer.py lines 203-212):
      <= 2 days  -> 10/10 recency
      <= 7 days  -> 8/10
      <= 14 days -> 5/10
      <= 30 days -> 2/10
      > 30 days  -> 0/10

    We never claim anything about response rates we cannot measure.
    """
    if days_old <= 2:
        return "Posted recently — scores 10/10 for recency"
    elif days_old <= 7:
        return f"Posted {days_old} days ago — scores 8/10 for recency"
    elif days_old <= 14:
        return f"Posted {days_old} days ago — scores 5/10 for recency"
    elif days_old <= 30:
        return f"Posted {days_old} days ago — scores 2/10 for recency"
    else:
        return f"Posted {days_old} days ago — scores 0/10 for recency"
