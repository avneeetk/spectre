from datetime import datetime, timezone
from models import APIState, DiscoveredEndpoint


def classify(ep: DiscoveredEndpoint) -> tuple[APIState, str]:

    # ── derived signals ────────────────────────────────────────────────
    has_conflict      = ep.also_found_in_conflict_with is not None
    has_owner         = getattr(ep, "has_owner", False)
    has_auth          = getattr(ep, "auth_detected", False)
    in_gateway        = bool(ep.in_gateway)
    in_repo           = bool(ep.in_repo)
    seen_in_traffic   = bool(ep.seen_in_traffic)
    sources           = getattr(ep, "sources", []) or []
    only_infra_source = sources and all(
        s in ("nginx_config", "infra", "k8s", "ingress") for s in sources
    )

    days_since_seen = None
    if ep.last_seen:
        days_since_seen = (
            datetime.now(timezone.utc)
            - ep.last_seen.replace(tzinfo=timezone.utc)
        ).days

    never_seen = days_since_seen is None and not seen_in_traffic

    # ══════════════════════════════════════════════════════════════════
    # RULE 1 — ROGUE
    # Unregistered, unowned, has conflict OR has live traffic with
    # no gateway/repo registration at all
    if has_conflict and not in_gateway and not has_owner:
        return (
            APIState.ROGUE,
            f"Unregistered path conflicts with '{ep.also_found_in_conflict_with}' and has no owner"
        )

    if seen_in_traffic and not in_gateway and not in_repo and not has_owner:
        return (
            APIState.ROGUE,
            "Receiving live traffic with zero registration and no owner — rogue deployment"
        )

    if has_conflict and not has_owner and seen_in_traffic:
        return (
            APIState.ROGUE,
            f"Conflicting path '{ep.also_found_in_conflict_with}' actively receiving traffic without ownership"
        )

    # ══════════════════════════════════════════════════════════════════
    # RULE 2 — SHADOW
    # Exists somewhere but is not officially tracked/documented

    # Classic: traffic but undocumented everywhere
    if seen_in_traffic and not in_gateway and not in_repo:
        return (
            APIState.SHADOW,
            "Live traffic observed but endpoint is completely undocumented"
        )

    # Infra-only: in gateway/nginx but not in repo (your case)
    if in_gateway and not in_repo and only_infra_source:
        return (
            APIState.SHADOW,
            "Endpoint exists only in infra config (nginx/k8s) — never registered in repo"
        )

    # Gateway but no repo and no owner
    if in_gateway and not in_repo and not has_owner:
        return (
            APIState.SHADOW,
            "Endpoint is in gateway but absent from repo and has no owner — undocumented"
        )

    # In repo but never made it to gateway and has traffic
    if in_repo and not in_gateway and seen_in_traffic:
        return (
            APIState.SHADOW,
            "Endpoint exists in repo but bypasses the gateway — shadow routing"
        )

    # No auth + no owner + in gateway = quietly exposed
    if in_gateway and not has_auth and not has_owner and not in_repo:
        return (
            APIState.SHADOW,
            "Exposed in gateway with no auth and no owner — silently undocumented"
        )

    # ══════════════════════════════════════════════════════════════════
    # RULE 3 — ZOMBIE
    # Was or should be alive, but shows no sign of recent life
    # Registered but stale traffic
    if (in_gateway or in_repo) and days_since_seen is not None and days_since_seen > 90:
        return (
            APIState.ZOMBIE,
            f"Registered endpoint with no traffic for {days_since_seen} days — likely abandoned"
        )

    # Registered but never seen at all
    if (in_gateway or in_repo) and never_seen:
        return (
            APIState.ZOMBIE,
            "Endpoint is registered but has never been observed in traffic — dead on arrival"
        )

    # In repo, not in gateway, never had traffic
    if in_repo and not in_gateway and never_seen:
        return (
            APIState.ZOMBIE,
            "Defined in repo but never deployed to gateway and never seen in traffic"
        )

    # Moderately stale (30–90 days) with no owner = likely forgotten
    if (in_gateway or in_repo) and days_since_seen is not None and 30 < days_since_seen <= 90 and not has_owner:
        return (
            APIState.ZOMBIE,
            f"No traffic for {days_since_seen} days and no owner — likely forgotten endpoint"
        )

    # ══════════════════════════════════════════════════════════════════
    # RULE 4 — ACTIVE
    # Properly registered, owned, and recently used

    # Fully healthy
    if in_gateway and in_repo and has_owner and days_since_seen is not None and days_since_seen < 30:
        return (
            APIState.ACTIVE,
            "Fully registered in gateway and repo, owned, and recently active"
        )

    # Gateway + owner + recent traffic (repo optional)
    if in_gateway and has_owner and days_since_seen is not None and days_since_seen < 30:
        return (
            APIState.ACTIVE,
            "Registered, owned, and recently active in gateway"
        )

    # Repo + recent traffic + owner (gateway optional — internal service)
    if in_repo and has_owner and seen_in_traffic and days_since_seen is not None and days_since_seen < 30:
        return (
            APIState.ACTIVE,
            "Repo-tracked, owned, and actively receiving traffic"
        )

    # Recently seen + in gateway, no owner but healthy traffic
    if in_gateway and seen_in_traffic and days_since_seen is not None and days_since_seen < 7:
        return (
            APIState.ACTIVE,
            "Active traffic in the last 7 days via registered gateway endpoint"
        )

    # ══════════════════════════════════════════════════════════════════
    # SAFETY NET — force classify instead of UNKNOWN where possible

    # Lean SHADOW: in gateway, nothing else confirmable
    if in_gateway and not in_repo:
        return (
            APIState.SHADOW,
            "In gateway but not in repo — defaulting to shadow for manual audit"
        )

    # Lean ZOMBIE: registered somewhere, no activity at all
    if (in_gateway or in_repo) and never_seen:
        return (
            APIState.ZOMBIE,
            "Registered but no traffic evidence — treated as zombie pending review"
        )

    # Lean ACTIVE: has recent traffic regardless of docs
    if seen_in_traffic and days_since_seen is not None and days_since_seen < 30:
        return (
            APIState.ACTIVE,
            "Recent traffic detected — classified as active pending full registration"
        )

    # Lean ROGUE: has conflict, nothing else fits
    if has_conflict:
        return (
            APIState.ROGUE,
            f"Path conflict with '{ep.also_found_in_conflict_with}' — classified rogue pending investigation"
        )

    # TRUE FALLBACK — only if absolutely no signal exists
    return (
        APIState.UNKNOWN,
        "No classifiable signals found — manual review required"
    )