from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def load_json_path(path: str, default: list | dict | None = None) -> list | dict:
    if not os.path.exists(path):
        return [] if default is None else default
    try:
        with open(path, "r") as f:
            raw = f.read().strip()
            if not raw:
                return [] if default is None else default
            return json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return [] if default is None else default


def load_json(filename: str, default: list | dict | None = None) -> list | dict:
    path = os.path.join(DATA_DIR, filename)
    return load_json_path(path, default=default)


def save_json(filename: str, data: list | dict):
    path = os.path.join(DATA_DIR, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

def _api_id(method: str, path: str) -> str:
    return f"hash({method.upper()}:{path})"


def _normalise_state(state: str | None) -> str:
    if not state:
        return "unknown"
    s = state.strip().lower()
    if s in {"active", "shadow", "zombie", "rogue", "unknown"}:
        return s
    # allow capitalised inputs too
    if s in {"active", "shadow", "zombie", "rogue"}:
        return s
    return "unknown"


def _infer_state(
    raw_state: str | None,
    *,
    in_gateway: bool,
    in_repo: bool = False,
    seen_in_traffic: bool = False,
    last_seen_days_ago: int | None,
) -> str:
    s = _normalise_state(raw_state)
    if s != "unknown":
        return s
    if seen_in_traffic and not in_gateway and not in_repo:
        return "shadow"
    if last_seen_days_ago is not None and last_seen_days_ago >= 90:
        return "zombie"
    if in_repo and not in_gateway and not seen_in_traffic:
        # Code-only endpoints with no observed traffic are good zombie candidates in the demo stage.
        return "zombie"
    if not in_gateway:
        return "shadow"
    return "active"


def _days_ago_from_iso(last_seen: str | None) -> int | None:
    if not last_seen:
        return None
    try:
        dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(int((datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds() // 86400), 0)
    except ValueError:
        return None


def _iso_from_days_ago(last_seen_days_ago: int | None) -> str | None:
    if last_seen_days_ago is None:
        return None
    dt = datetime.now(timezone.utc) - timedelta(days=int(last_seen_days_ago))
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _infer_domain(path: str) -> str:
    path_lower = path.lower()
    for keyword, domain in (
        ("payments", "payment"),
        ("payment", "payment"),
        ("transfer", "transfer"),
        ("transaction", "transaction"),
        ("account", "accounts"),
        ("auth", "auth"),
        ("login", "auth"),
        ("kyc", "kyc"),
        ("admin", "ops"),
        ("audit", "ops"),
        ("report", "reporting"),
        ("inventory", "inventory"),
        ("product", "product"),
        ("notification", "notification"),
        ("debug", "debug"),
        ("internal", "internal"),
        ("user", "user"),
        ("billing", "billing"),
        ("subscription", "billing"),
        ("webhook", "webhook"),
    ):
        if keyword in path_lower:
            return domain
    return "api"


def _infer_data_sensitivity(domain: str, onboarding: dict) -> str:
    regulated = set((onboarding or {}).get("regulations", []) or [])
    data_handled = set((onboarding or {}).get("data_handled", []) or [])
    if {"pci", "hipaa", "gdpr"} & regulated:
        return "critical"
    if domain in {"payment", "accounts", "auth", "kyc", "billing"}:
        return "critical"
    if {"financial_transactions", "customer_personal_data", "medical_health"} & data_handled:
        return "critical"
    if domain in {"reporting", "inventory", "user"}:
        return "medium"
    return "low"


def _is_external_facing(onboarding: dict) -> bool:
    api_consumers = set((onboarding or {}).get("api_consumers", []) or [])
    return bool(api_consumers & {"public_internet", "mobile_apps", "partner_apis"})


def _estimate_technical_score(ep: dict) -> int:
    existing = ep.get("technical_score")
    if isinstance(existing, int):
        return max(0, min(existing, 100))

    score = 0
    if ep.get("auth_present") is False:
        score += 30
    if ep.get("rate_limited") is False:
        score += 20
    if ep.get("tls_enabled") is False:
        score += 15
    if ep.get("in_gateway") is False:
        score += 25
    score += min(len(ep.get("owasp_flags", []) or []) * 5, 15)
    return max(0, min(int(score), 100))


def _synth_traffic_history(api_id: str, state: str, last_seen_days_ago: int | None) -> list[dict]:
    # Deterministic values to keep the UI stable across refreshes.
    seed = int(hashlib.sha1(api_id.encode("utf-8")).hexdigest()[:8], 16)
    months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]

    if state == "active":
        base = 12000 + (seed % 9000)
        return [{"month": m, "calls": base + (i * (base // 20))} for i, m in enumerate(months)]

    if state == "rogue":
        end = 250 + (seed % 500)
        start = max(end // 20, 0)
        series = [int(start + (end - start) * (i / (len(months) - 1))) for i in range(len(months))]
        return [{"month": m, "calls": c} for m, c in zip(months, series)]

    if state == "shadow":
        end = 15 + (seed % 60)
        start = max(end // 4, 0)
        series = [int(start + (end - start) * (i / (len(months) - 1))) for i in range(len(months))]
        return [{"month": m, "calls": c} for m, c in zip(months, series)]

    # zombie / unknown: decay to 0 (or stay 0 if very old)
    old = (last_seen_days_ago or 0) >= 180
    start = 140 + (seed % 400)
    series = [0] * len(months) if old else [int(start * (1 - (i / (len(months) - 1)))) for i in range(len(months))]
    return [{"month": m, "calls": c} for m, c in zip(months, series)]


def _owasp_checks(ep: dict) -> dict:
    auth_present = bool(ep.get("auth_present"))
    rate_limited = bool(ep.get("rate_limited"))
    tls_enabled = bool(ep.get("tls_enabled"))
    in_gateway = bool(ep.get("in_gateway"))

    return {
        "API2": {
            "passed": auth_present,
            "detail": "Auth required" if auth_present else "No auth required — endpoint open",
        },
        "API4": {
            "passed": rate_limited,
            "detail": "Rate limiting enforced" if rate_limited else "No 429 after burst requests (estimated)",
        },
        "API8": {
            "passed": tls_enabled,
            "detail": "TLS present" if tls_enabled else "TLS not enabled (estimated)",
        },
        "API9": {
            "passed": in_gateway,
            "detail": "In gateway registry" if in_gateway else "Not in gateway registry",
        },
    }


def _normalise_scanner_record(raw: dict, onboarding: dict) -> tuple[dict, dict]:
    """
    Accept either:
      - Member-4 canonical scanner schema (endpoint/auth_present/last_seen_days_ago...)
      - Neeraj discovery-engine schema (path/auth_detected/last_seen...)
    Returns (canonical, ui_seed).
    """
    if "endpoint" in raw:
        endpoint = raw.get("endpoint") or ""
        method = (raw.get("method") or "GET").upper()
        in_gateway = bool(raw.get("in_gateway", False))
        last_seen_days_ago = raw.get("last_seen_days_ago")
        in_repo = bool(raw.get("in_repo", False))
        seen_in_traffic = bool(raw.get("seen_in_traffic", last_seen_days_ago is not None))
        if last_seen_days_ago is None:
            last_seen_days_ago = 0 if (seen_in_traffic or in_gateway) else (120 if in_repo else 0)
        state = _infer_state(
            raw.get("state"),
            in_gateway=in_gateway,
            in_repo=in_repo,
            seen_in_traffic=seen_in_traffic,
            last_seen_days_ago=last_seen_days_ago,
        )
        canonical = {
            "endpoint": endpoint,
            "method": method,
            "state": state,
            "last_seen_days_ago": last_seen_days_ago,
            "auth_present": raw.get("auth_present", False),
            "rate_limited": raw.get("rate_limited", False),
            "tls_enabled": raw.get("tls_enabled", True),
            "in_gateway": in_gateway,
            "owasp_flags": raw.get("owasp_flags", []) or [],
            "service_name": raw.get("service_name", "unknown"),
            "confidence": raw.get("confidence", 0.0),
            "technical_score": raw.get("technical_score"),
        }
        ui_seed = dict(raw)
        ui_seed.setdefault("id", raw.get("id") or _api_id(method, endpoint))
        ui_seed.setdefault("path", endpoint)
        ui_seed.setdefault("state", state)
        ui_seed.setdefault("in_repo", in_repo)
        ui_seed.setdefault("seen_in_traffic", seen_in_traffic)
        ui_seed.setdefault("auth_detected", bool(canonical["auth_present"]))
        ui_seed.setdefault("last_seen", raw.get("last_seen") or _iso_from_days_ago(last_seen_days_ago))
        ui_seed.setdefault("service_name", canonical["service_name"])
        ui_seed.setdefault("owasp_flags", canonical["owasp_flags"])
        return canonical, ui_seed

    # Neeraj-style record
    path = raw.get("path") or raw.get("endpoint") or ""
    method = (raw.get("method") or "GET").upper()
    in_gateway = bool(raw.get("in_gateway", False))
    last_seen = raw.get("last_seen")
    last_seen_days_ago = _days_ago_from_iso(last_seen)
    in_repo = bool(raw.get("in_repo", False))
    seen_in_traffic = bool(raw.get("seen_in_traffic", last_seen_days_ago is not None))
    if last_seen_days_ago is None:
        last_seen_days_ago = 0 if (seen_in_traffic or in_gateway) else (120 if in_repo else 0)
    state = _infer_state(
        raw.get("state"),
        in_gateway=in_gateway,
        in_repo=in_repo,
        seen_in_traffic=seen_in_traffic,
        last_seen_days_ago=last_seen_days_ago,
    )
    canonical = {
        "endpoint": path,
        "method": method,
        "state": state,
        "last_seen_days_ago": last_seen_days_ago,
        "auth_present": raw.get("auth_detected", False),
        "rate_limited": raw.get("rate_limited", False),
        "tls_enabled": raw.get("tls_enabled", True),
        "in_gateway": in_gateway,
        "owasp_flags": raw.get("owasp_flags", []) or [],
        "service_name": raw.get("service_name", "unknown"),
        "confidence": raw.get("confidence", 0.0),
        "technical_score": raw.get("technical_score"),
    }
    ui_seed = dict(raw)
    ui_seed.setdefault("path", path)
    ui_seed.setdefault("auth_detected", canonical["auth_present"])
    ui_seed.setdefault("last_seen", last_seen or _iso_from_days_ago(last_seen_days_ago))
    ui_seed.setdefault("state", state)
    ui_seed.setdefault("id", raw.get("id") or _api_id(method, path))
    ui_seed.setdefault("service_name", canonical["service_name"])
    ui_seed.setdefault("owasp_flags", canonical["owasp_flags"])
    return canonical, ui_seed


def _enrich_for_ui(canonical: dict, ui_seed: dict, onboarding: dict, agent: dict) -> dict:
    endpoint = canonical.get("endpoint", "")
    method = canonical.get("method", "GET")
    api_id = ui_seed.get("id") or _api_id(method, endpoint)

    state = _normalise_state(canonical.get("state"))

    last_seen_days_ago = canonical.get("last_seen_days_ago")
    last_seen = (
        ui_seed.get("last_seen")
        or _iso_from_days_ago(last_seen_days_ago)
        or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    )

    domain = ui_seed.get("domain") or _infer_domain(endpoint)
    regs = [r for r in ((onboarding or {}).get("regulations", []) or []) if r != "none"]

    in_gateway = bool(canonical.get("in_gateway"))
    in_repo = bool(ui_seed.get("in_repo", False))
    seen_in_traffic = bool(ui_seed.get("seen_in_traffic", last_seen_days_ago is not None))

    sources = ui_seed.get("sources")
    if not isinstance(sources, list):
        sources = []
        if in_gateway:
            sources.append("gateway")
        if in_repo:
            sources.append("repo")
        if seen_in_traffic:
            sources.append("traffic")
    if not sources:
        sources = ["traffic"]

    auth_present = bool(canonical.get("auth_present"))
    auth_type = ui_seed.get("auth_type") or ("jwt" if auth_present else "none")

    technical_score = _estimate_technical_score(canonical)
    checks = ui_seed.get("owasp_checks")
    if not isinstance(checks, dict):
        checks = _owasp_checks(
            {
                "auth_present": auth_present,
                "rate_limited": bool(canonical.get("rate_limited")),
                "tls_enabled": bool(canonical.get("tls_enabled")),
                "in_gateway": in_gateway,
            }
        )

    out: dict[str, Any] = dict(ui_seed)
    out.update(
        {
            # Canonical bridge fields (kept)
            "endpoint": endpoint,
            "method": method,
            "state_canonical": state.title() if state != "unknown" else "Unknown",
            "last_seen_days_ago": last_seen_days_ago,
            "auth_present": auth_present,
            "rate_limited": bool(canonical.get("rate_limited")),
            "tls_enabled": bool(canonical.get("tls_enabled")),
            "in_gateway": in_gateway,
            "service_name": canonical.get("service_name", "unknown"),
            "confidence": float(canonical.get("confidence") or 0.0),
            "owasp_flags": canonical.get("owasp_flags", []) or [],
            "risk_summary": canonical.get("risk_summary"),
            "violations": canonical.get("violations", []) or [],
            "recommended_action": canonical.get("recommended_action"),
            "technical_fix": canonical.get("technical_fix"),
            "technical_score": technical_score,
            "importance_score": int(canonical.get("importance_score") or 0),

            # UI fields (Lovable schema)
            "id": api_id,
            "path": endpoint,
            "state": state,
            "sources": sources,
            "in_repo": in_repo,
            "seen_in_traffic": seen_in_traffic,
            "auth_detected": auth_present,
            "auth_type": auth_type,
            "also_found_in_conflict_with": ui_seed.get("also_found_in_conflict_with"),
            "status_codes": ui_seed.get("status_codes")
            or ([200, 401] if auth_present else [200]),
            "last_seen": last_seen,
            "tags": ui_seed.get("tags") or [],
            "raw_context": ui_seed.get("raw_context") or f"discovered: {method} {endpoint}",
            "owner_team": ui_seed.get("owner_team"),
            "domain": domain,
            "data_sensitivity": ui_seed.get("data_sensitivity") or _infer_data_sensitivity(domain, onboarding),
            "is_external_facing": bool(ui_seed.get("is_external_facing", _is_external_facing(onboarding))),
            "regulatory_scope": ui_seed.get("regulatory_scope") or regs,
            "centrality_score": float(ui_seed.get("centrality_score") or 0.0),
            "traffic_history": ui_seed.get("traffic_history")
            or _synth_traffic_history(api_id, state, last_seen_days_ago),
            "owasp_checks": checks,
            "ai_summary": ui_seed.get("ai_summary") or agent.get("risk_summary"),
            "ai_next_step": ui_seed.get("ai_next_step") or agent.get("recommended_action"),
        }
    )

    # Mitigation agent (derived): keep UI sections alive even without a live agent
    if state in {"shadow", "rogue", "zombie"}:
        steps = ui_seed.get("mitigation_steps")
        if not isinstance(steps, list):
            steps = [
                {"step": 1, "action": "Checking discovery context", "finding": out["raw_context"]},
                {"step": 2, "action": "Reviewing OWASP flags", "finding": f"Flags: {', '.join(out['owasp_flags']) or 'none'}"},
                {"step": 3, "action": "Assessing exposure", "finding": "External-facing" if out["is_external_facing"] else "Internal-facing"},
                {"step": 4, "action": "Generating remediation plan", "finding": out["ai_next_step"] or "Investigate owner + block if necessary"},
            ]
        out["mitigation_steps"] = steps
        out["mitigation_recommendation"] = ui_seed.get("mitigation_recommendation") or (
            "Block immediately — treat as incident" if state in {"rogue", "shadow"} and not auth_present else "Remove immediately"
        )
        out["mitigation_detail"] = ui_seed.get("mitigation_detail") or (out["ai_next_step"] or "Review and remediate.")
        out["mitigation_confidence"] = ui_seed.get("mitigation_confidence") or (95 if state in {"rogue", "shadow"} else 90)
    else:
        out.setdefault("mitigation_steps", [])

    return out


def _load_scanner_data() -> list[dict]:
    primary = load_json("scanner_output.json", default=[])
    if isinstance(primary, list) and primary:
        return primary

    # Fallback to Neeraj's discovery output if present (read-only).
    fallback_path = os.path.join(REPO_ROOT, "Neeraj", "output", "discovered_endpoints.json")
    fallback = load_json_path(fallback_path, default=[])
    return fallback if isinstance(fallback, list) else []


def get_merged_inventory() -> list[dict]:
    """
    Merges M1's scanner output with M3's AI agent results.
    M1 provides: endpoint, state, owasp_flags, auth_present, etc.
    M3 provides: risk_summary, violations, recommended_action, technical_fix.
    We join them on the 'endpoint' field.
    """
    scanner_data: list = _load_scanner_data()
    agent_data: list = load_json("agent_results.json", default=[])
    onboarding: dict = load_json("onboarding.json", default={})

    # Index M3's data by endpoint path for fast lookup
    agent_index = {}
    for item in agent_data if isinstance(agent_data, list) else []:
        if not isinstance(item, dict):
            continue
        key = item.get("endpoint") or item.get("path")
        if key:
            agent_index[key] = item

    merged = []
    for raw_ep in scanner_data if isinstance(scanner_data, list) else []:
        if not isinstance(raw_ep, dict):
            continue

        ep, ui_seed = _normalise_scanner_record(raw_ep, onboarding)
        path = ep.get("endpoint", "")
        agent = agent_index.get(path, {}) if isinstance(agent_index, dict) else {}
        # Harjot/M3 currently returns `violations` as a single string (newline-separated).
        raw_violations = agent.get("violations", [])
        if isinstance(raw_violations, str):
            if raw_violations.strip().lower() == "none":
                violations: list[str] = []
            else:
                violations = [line.strip() for line in raw_violations.splitlines() if line.strip()]
        elif isinstance(raw_violations, list):
            violations = [str(v) for v in raw_violations]
        else:
            violations = []

        # Some agent outputs use `action_type` instead of `recommended_action`.
        recommended_action = agent.get("recommended_action")
        if not recommended_action and isinstance(agent.get("action_type"), str):
            action_type = agent.get("action_type")
            if action_type == "decommission":
                recommended_action = "Approve decommission and block this endpoint (410 Gone) after verifying no active callers."
            elif action_type == "register":
                recommended_action = "Register this endpoint in the API gateway and assign an owner, auth, and rate limits."
            elif action_type == "harden":
                recommended_action = "Harden this endpoint based on OWASP failures (auth, rate limiting, TLS, configuration)."
            else:
                recommended_action = "Investigate ownership and usage, then decide whether to harden, register, or decommission."

        merged_ep = {
            # --- From M1 (scanner) ---
            "endpoint": path,
            "method": ep.get("method", "GET"),
            "state": ep.get("state", "unknown"),
            "last_seen_days_ago": ep.get("last_seen_days_ago"),
            "auth_present": ep.get("auth_present", False),
            "rate_limited": ep.get("rate_limited", False),
            "tls_enabled": ep.get("tls_enabled", True),
            "in_gateway": ep.get("in_gateway", False),
            "owasp_flags": ep.get("owasp_flags", []) or [],
            "service_name": ep.get("service_name", "unknown"),
            "confidence": ep.get("confidence", 0.0),

            # --- From M3 (AI agent) ---
            "risk_summary": agent.get("risk_summary"),
            "violations": violations,
            "recommended_action": recommended_action,
            "technical_fix": agent.get("technical_fix"),

            # --- From M2 (technical score — they write this field)
            # If M2 has not yet added technical_score, we leave it None
            # and the frontend shows "pending"
            "technical_score": ep.get("technical_score"),

            # --- Computed by M4 (importance score) ---
            # This is YOUR contribution — computed fresh each call
            "importance_score": None,  # filled below

            # --- Seed UI-only fields (optional) ---
            "_ui_seed": ui_seed,
        }

        merged.append(merged_ep)

    # Now compute importance scores using onboarding context
    from services.importance import compute_importance_score
    for ep in merged:
        # Ensure tech score is usable for the importance model, even in demo data.
        if ep.get("technical_score") is None:
            ep["technical_score"] = _estimate_technical_score(ep)
        ep["importance_score"] = compute_importance_score(ep, onboarding)

    # Return a UI-friendly superset schema so the existing frontend can stay unchanged.
    enriched: list[dict] = []
    for ep in merged:
        ui_seed = ep.pop("_ui_seed", {}) if isinstance(ep.get("_ui_seed"), dict) else {}
        agent = {
            "risk_summary": ep.get("risk_summary"),
            "recommended_action": ep.get("recommended_action"),
        }
        enriched.append(_enrich_for_ui(ep, ui_seed, onboarding, agent))

    # Add per-endpoint centrality scores (derived from the same graph builder used by /api/graph).
    try:
        from services.graph_builder import build_graph

        graph = build_graph(enriched)
        centrality_map = {
            svc.get("service_name"): float(svc.get("centrality_score") or 0.0)
            for svc in (graph.get("service_context") or [])
            if isinstance(svc, dict)
        }
        for ep in enriched:
            svc = ep.get("service_name")
            if svc in centrality_map:
                ep["centrality_score"] = centrality_map[svc]
    except Exception:
        pass

    return enriched
