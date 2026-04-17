#!/usr/bin/env python3
"""
Pipeline runner (Stage-2 integration):
- Calls Member 1 (Neeraj) service to discover endpoints
- Writes Avneet/backend/data/scanner_output.json (canonical bridge schema)
- Calls Member 3 (Harjot) service to generate AI results
- Writes Avneet/backend/data/agent_results.json (canonical agent schema)

This intentionally does NOT depend on Member 2 (Gurleen) having a FastAPI service yet.
Once M2 is available, the runner can insert the classifier step between M1 and M3.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT, "data")
REPO_ROOT = os.path.abspath(os.path.join(ROOT, "..", ".."))

M1_URL = os.environ.get("SPECTRE_M1_URL", "http://localhost:8001").rstrip("/")
M3_URL = os.environ.get("SPECTRE_M3_URL", "http://localhost:8002").rstrip("/")
ALLOW_STUB_M3 = os.environ.get("SPECTRE_ALLOW_STUB_M3", "").strip().lower() in {"1", "true", "yes"}
M1_FILE = os.environ.get("SPECTRE_M1_FILE", os.path.join(REPO_ROOT, "Neeraj", "output", "discovered_endpoints.json"))


def _http_json(method: str, url: str, body: dict | list | None = None) -> Any:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url=url, method=method.upper(), data=data, headers=headers)
    with urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else None


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


def _canonical_state(ep: dict) -> str:
    """
    Minimal rule-based state inference until M2 output exists.
    Returns capitalised values: Active|Shadow|Zombie|Rogue|Unknown.
    """
    in_gateway = bool(ep.get("in_gateway"))
    in_repo = bool(ep.get("in_repo"))
    seen_in_traffic = bool(ep.get("seen_in_traffic"))
    conflict = ep.get("also_found_in_conflict_with") or ep.get("path_conflict")

    days = _days_ago_from_iso(ep.get("last_seen"))
    auth = bool(ep.get("auth_detected"))

    if conflict and not in_gateway and not auth:
        return "Rogue"
    if seen_in_traffic and not in_gateway and not in_repo:
        return "Shadow"
    if (in_gateway or in_repo) and days is not None and days > 90:
        return "Zombie"
    if in_gateway and days is not None and days < 30:
        return "Active"
    return "Unknown"


def _derive_owasp_flags(ep: dict) -> list[str]:
    flags: list[str] = []
    if ep.get("auth_detected") is False:
        flags.append("API2")
    if ep.get("in_gateway") is False:
        flags.append("API9")
    return flags


def _load_m1_endpoints() -> list[dict] | None:
    """
    Prefer service-based integration (M1 FastAPI). If M1 isn't running yet,
    fall back to file-based integration using Neeraj's output JSON.
    """
    try:
        m1 = _http_json("POST", f"{M1_URL}/scan/sample", body={})
        endpoints = (m1 or {}).get("endpoints", [])
        if isinstance(endpoints, list):
            return [e for e in endpoints if isinstance(e, dict)]
    except (HTTPError, URLError, TimeoutError):
        pass

    if os.path.exists(M1_FILE):
        try:
            with open(M1_FILE, "r", encoding="utf-8") as f:
                raw = f.read().strip()
                data = json.loads(raw) if raw else None
            if isinstance(data, dict) and isinstance(data.get("endpoints"), list):
                return [e for e in data["endpoints"] if isinstance(e, dict)]
            if isinstance(data, list):
                return [e for e in data if isinstance(e, dict)]
        except Exception:
            return None

    return None


def run() -> int:
    os.makedirs(DATA_DIR, exist_ok=True)

    endpoints = _load_m1_endpoints()
    if endpoints is None:
        print(f"[pipeline] ERROR: unable to load M1 endpoints (tried {M1_URL}/scan/sample and {M1_FILE})", file=sys.stderr)
        return 2

    scanner_output: list[dict] = []
    for ep in endpoints:
        path = ep.get("path") or ep.get("endpoint")
        if not path:
            continue

        last_seen_days_ago = _days_ago_from_iso(ep.get("last_seen"))
        state = _canonical_state(ep)
        flags = ep.get("owasp_flags") if isinstance(ep.get("owasp_flags"), list) else _derive_owasp_flags(ep)

        scanner_output.append(
            {
                "endpoint": path,
                "method": (ep.get("method") or "GET").upper(),
                "state": state,
                "last_seen_days_ago": last_seen_days_ago,
                "auth_present": bool(ep.get("auth_detected", False)),
                "rate_limited": bool(ep.get("rate_limited", False)),
                "tls_enabled": bool(ep.get("tls_enabled", True)),
                "in_gateway": bool(ep.get("in_gateway", False)),
                "owasp_flags": flags,
                "service_name": ep.get("service_name") or "unknown",
                "confidence": float(ep.get("confidence") or 0.0),
                # Optional fields consumed by the UI layer:
                "in_repo": bool(ep.get("in_repo", False)),
                "seen_in_traffic": bool(ep.get("seen_in_traffic", False)),
                "sources": ep.get("sources") if isinstance(ep.get("sources"), list) else [],
                "raw_context": ep.get("raw_context"),
                "also_found_in_conflict_with": ep.get("also_found_in_conflict_with") or ep.get("path_conflict"),
            }
        )

    with open(os.path.join(DATA_DIR, "scanner_output.json"), "w") as f:
        json.dump(scanner_output, f, indent=2)

    # Call M3
    m3_payload = []
    for ep in scanner_output:
        m3_payload.append(
            {
                "endpoint": ep["endpoint"],
                "state": ep.get("state", "Unknown"),
                "last_seen_days_ago": int(ep.get("last_seen_days_ago") or 0),
                "auth_present": bool(ep.get("auth_present")),
                "rate_limited": bool(ep.get("rate_limited")),
                "tls_enabled": bool(ep.get("tls_enabled")),
                "in_gateway": bool(ep.get("in_gateway")),
                "owasp_flags": ep.get("owasp_flags", []),
            }
        )

    try:
        m3 = _http_json("POST", f"{M3_URL}/analyze/batch", body=m3_payload)
    except (HTTPError, URLError, TimeoutError) as e:
        if not ALLOW_STUB_M3:
            print(f"[pipeline] ERROR calling M3 at {M3_URL}: {e}", file=sys.stderr)
            return 3
        print(f"[pipeline] WARN: M3 unavailable ({e}); writing stub agent_results.json", file=sys.stderr)
        m3 = {
            "status": "stub",
            "data": [
                {
                    "endpoint": ep["endpoint"],
                    "state": ep.get("state"),
                    "risk_summary": "Stub AI summary (M3 not reachable).",
                    "violations": [],
                    "recommended_action": "Run M3 service to generate real remediation guidance.",
                    "technical_fix": "Stub: start M3 to generate nginx/gateway fixes.",
                }
                for ep in scanner_output
            ],
        }

    status = (m3 or {}).get("status")
    analyzed = (m3 or {}).get("analyzed")
    error_count = (m3 or {}).get("errors")
    error_details = (m3 or {}).get("error_details")
    if isinstance(analyzed, int) or isinstance(error_count, int) or isinstance(status, str):
        print(f"[pipeline] M3 status={status!r} analyzed={analyzed!r} errors={error_count!r}")

    results = (m3 or {}).get("data", [])
    if not isinstance(results, list):
        print("[pipeline] ERROR: M3 response missing `data` list", file=sys.stderr)
        return 3

    result_index: dict[str, dict] = {}
    for r in results:
        if isinstance(r, dict) and r.get("endpoint"):
            result_index[str(r["endpoint"])] = r

    error_map: dict[str, str] = {}
    if isinstance(error_details, list):
        for item in error_details:
            if not isinstance(item, dict):
                continue
            endpoint = item.get("endpoint")
            err = item.get("error")
            if isinstance(endpoint, str) and endpoint:
                error_map[endpoint] = str(err) if err is not None else "Unknown error"

    agent_results: list[dict] = []
    for ep in scanner_output:
        endpoint = ep.get("endpoint")
        if not endpoint:
            continue

        r = result_index.get(endpoint)
        if not isinstance(r, dict):
            err = error_map.get(endpoint) or "No result returned by M3"
            agent_results.append(
                {
                    "endpoint": endpoint,
                    "state": ep.get("state"),
                    "risk_summary": f"AI analysis unavailable for this endpoint. M3 error: {err}",
                    "violations": [],
                    "recommended_action": "Start/fix the M3 service and re-run the pipeline to generate remediation guidance.",
                    "technical_fix": "M3 did not return a technical_fix for this endpoint (see M3 logs).",
                }
            )
            continue

        raw_violations = r.get("violations")
        if isinstance(raw_violations, str):
            violations = [
                line.strip()
                for line in raw_violations.splitlines()
                if line.strip() and line.strip().lower() != "none"
            ]
        elif isinstance(raw_violations, list):
            violations = [str(v) for v in raw_violations]
        else:
            violations = []

        recommended_action = r.get("recommended_action")
        if not recommended_action and isinstance(r.get("action_type"), str):
            if r["action_type"] == "decommission":
                recommended_action = "Approve decommission and block this endpoint (410 Gone) after verifying no active callers."
            elif r["action_type"] == "register":
                recommended_action = "Register this endpoint in the API gateway and assign an owner, auth, and rate limits."
            elif r["action_type"] == "harden":
                recommended_action = "Harden this endpoint based on OWASP failures (auth, rate limiting, TLS, configuration)."

        agent_results.append(
            {
                "endpoint": endpoint,
                "state": r.get("state") or ep.get("state"),
                "risk_summary": r.get("risk_summary"),
                "violations": violations,
                "recommended_action": recommended_action,
                "technical_fix": r.get("technical_fix"),
            }
        )

    with open(os.path.join(DATA_DIR, "agent_results.json"), "w") as f:
        json.dump(agent_results, f, indent=2)

    print(f"[pipeline] OK wrote {len(scanner_output)} scanner endpoints -> {os.path.join(DATA_DIR, 'scanner_output.json')}")
    print(f"[pipeline] OK wrote {len(agent_results)} agent results -> {os.path.join(DATA_DIR, 'agent_results.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
