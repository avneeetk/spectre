from datetime import datetime, timedelta, timezone
from models import APIState, DiscoveredEndpoint


def classify(ep: DiscoveredEndpoint) -> tuple[APIState, str]:

    has_conflict = ep.path_conflict is not None

    days_since_seen = None
    if ep.last_seen:
        days_since_seen = (datetime.now(timezone.utc) - ep.last_seen.replace(tzinfo=timezone.utc)).days

    # Rule 1 — ROGUE (checked first, most dangerous)
    if has_conflict and not ep.in_gateway and not ep.has_owner:
        return (
            APIState.ROGUE,
            f"Unregistered path conflicts with {ep.path_conflict}"
        )

    # Rule 2 — SHADOW
    if ep.seen_in_traffic and not ep.in_gateway and not ep.in_repo:
        return (
            APIState.SHADOW,
            "Live traffic observed but endpoint is completely undocumented"
        )

    # Rule 3 — ZOMBIE
    if (ep.in_gateway or ep.in_repo) and days_since_seen is not None and days_since_seen > 90:
        return (
            APIState.ZOMBIE,
            f"No traffic for {days_since_seen} days — endpoint still reachable"
        )

    # Rule 4 — ACTIVE
    if ep.in_gateway and ep.has_owner and days_since_seen is not None and days_since_seen < 30:
        return (
            APIState.ACTIVE,
            "Registered, owned, and recently active"
        )

    # Fallback
    return (
        APIState.UNKNOWN,
        "Insufficient data to classify — flagged for manual review"
    )