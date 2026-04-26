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
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT, "data")
REPO_ROOT = os.path.abspath(os.path.join(ROOT, "..", ".."))

M1_URL = os.environ.get("SPECTRE_M1_URL", "http://scanner:8001").rstrip("/")
M2_URL = os.environ.get("SPECTRE_M2_URL", "http://classifier:8003").rstrip("/")
M3_URL = os.environ.get("SPECTRE_M3_URL", "http://agent:8002").rstrip("/")
ALLOW_STUB_M3 = os.environ.get("SPECTRE_ALLOW_STUB_M3", "").strip().lower() in {"1", "true", "yes"}
M1_FILE = os.environ.get("SPECTRE_M1_FILE", os.path.join(REPO_ROOT, "Neeraj", "output", "discovered_endpoints.json"))
REQUIRE_M2 = os.environ.get("SPECTRE_REQUIRE_M2", "").strip().lower() in {"1", "true", "yes"}

def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


M1_TIMEOUT_S = _int_env("SPECTRE_M1_TIMEOUT_S", 30)
M2_TIMEOUT_S = _int_env("SPECTRE_M2_TIMEOUT_S", 30)
# M3 often loads embeddings/KB on first request; default to a longer timeout.
M3_TIMEOUT_S = _int_env("SPECTRE_M3_TIMEOUT_S", 240)
M3_BATCH_SIZE = max(1, _int_env("SPECTRE_M3_BATCH_SIZE", 5))


def _http_json(method: str, url: str, body: dict | list | None = None, *, timeout_s: int = 30) -> Any:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url=url, method=method.upper(), data=data, headers=headers)
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as e:
        details = ""
        try:
            details = e.read().decode("utf-8", errors="replace").strip()
        except Exception:
            details = ""
        raise RuntimeError(f"HTTP {e.code} calling {url}{(': ' + details) if details else ''}") from e


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
    if ep.get("rate_limited") is False:
        flags.append("API4")
    if ep.get("tls_enabled") is False:
        flags.append("API8")
    if ep.get("in_gateway") is False:
        flags.append("API9")
    return flags


def _load_m1_endpoints() -> list[dict] | None:
    """
    Prefer service-based integration (M1 FastAPI). If M1 isn't running yet,
    fall back to file-based integration using Neeraj's output JSON.
    """
    try:
        m1 = _http_json("POST", f"{M1_URL}/scan/sample", body={}, timeout_s=M1_TIMEOUT_S)
        endpoints = (m1 or {}).get("endpoints", [])
        if isinstance(endpoints, list):
            return [e for e in endpoints if isinstance(e, dict)]
    except Exception:
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


def _to_m2_discovered_endpoint(ep: dict, *, raw_context_as: str = "string") -> dict | None:
    path = ep.get("path") or ep.get("endpoint")
    if not path:
        return None
    method = (ep.get("method") or "GET").upper()
    endpoint_id = ep.get("id") or ep.get("endpoint_id") or f"{method}:{path}"

    auth_detected = bool(ep.get("auth_detected", ep.get("auth_present", False)))
    auth_type = ep.get("auth_type") or ("jwt" if auth_detected else "none")

    sources_raw = ep.get("sources") if isinstance(ep.get("sources"), list) else []
    sources = [str(s) for s in sources_raw if s is not None and str(s).strip()]

    tags_raw = ep.get("tags") if isinstance(ep.get("tags"), list) else []
    tags = [str(t) for t in tags_raw if t is not None and str(t).strip()]

    status_codes_raw = ep.get("status_codes") if isinstance(ep.get("status_codes"), list) else []
    status_codes: list[int] = []
    for sc in status_codes_raw:
        try:
            status_codes.append(int(sc))
        except (TypeError, ValueError):
            continue

    last_seen = ep.get("last_seen")
    if not isinstance(last_seen, str) or not last_seen.strip():
        last_seen = None

    # Gurleen/M2 currently types `path_conflict` as Optional[bool] in Pydantic,
    # but uses it like "conflict exists". To avoid misclassification, we only ever
    # send `True` (conflict exists) or `None` (no conflict), never `False`.
    path_conflict_raw = ep.get("path_conflict") or ep.get("also_found_in_conflict_with")
    path_conflict = True if (isinstance(path_conflict_raw, str) and path_conflict_raw.strip()) else None

    # Gurleen/M2 schema drift: some versions expect `raw_context` as a string, some as a dict.
    raw_context_text = str(ep.get("raw_context") or "")
    raw_context: Any
    if raw_context_as == "dict":
        raw_context = {"text": raw_context_text}
    else:
        raw_context = raw_context_text

    return {
        "id": str(endpoint_id),
        "method": method,
        "path": path,
        "service_name": str(ep.get("service_name") or "unknown"),
        "sources": sources,
        "in_repo": bool(ep.get("in_repo", False)),
        "in_gateway": bool(ep.get("in_gateway", False)),
        "seen_in_traffic": bool(ep.get("seen_in_traffic", False)),
        "auth_detected": auth_detected,
        "auth_type": str(auth_type),
        "path_conflict": path_conflict,
        "status_codes": status_codes,
        "confidence": float(ep.get("confidence") or 0.0),
        "last_seen": last_seen,
        "tags": tags,
        "raw_context": raw_context,
        "has_owner": bool(ep.get("has_owner", False)),
    }


def run() -> int:
    os.makedirs(DATA_DIR, exist_ok=True)

    endpoints = _load_m1_endpoints()
    if endpoints is None:
        print(f"[pipeline] ERROR: unable to load M1 endpoints (tried {M1_URL}/scan/sample and {M1_FILE})", file=sys.stderr)
        return 2

    scanner_output: list[dict] = []
    discovered_for_m2: list[dict] = []
    for ep in endpoints:
        path = ep.get("path") or ep.get("endpoint")
        if not path:
            continue

        m2_in = _to_m2_discovered_endpoint(ep, raw_context_as="string")
        if m2_in is not None:
            discovered_for_m2.append(m2_in)

        last_seen_days_ago = _days_ago_from_iso(ep.get("last_seen"))
        state = _canonical_state(ep)
        flags = ep.get("owasp_flags") if isinstance(ep.get("owasp_flags"), list) else _derive_owasp_flags(ep)

        scanner_output.append(
            {
                "id": ep.get("id") or ep.get("endpoint_id") or (m2_in.get("id") if isinstance(m2_in, dict) else None),
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

    # Call M2 (classifier) if available: enrich state + technical_score before writing artifacts.
    if discovered_for_m2:
        try:
            try:
                m2 = _http_json("POST", f"{M2_URL}/classify/batch", body=discovered_for_m2, timeout_s=M2_TIMEOUT_S)
            except Exception as e:
                # Retry once with alternate `raw_context` shape if schema drift caused a 422.
                msg = str(e)
                if "HTTP 422" in msg and "raw_context" in msg:
                    alt = "dict" if "string_type" in msg else "string"
                    discovered_for_m2 = []
                    for ep in endpoints:
                        if not isinstance(ep, dict):
                            continue
                        m2_in = _to_m2_discovered_endpoint(ep, raw_context_as=alt)
                        if m2_in is not None:
                            discovered_for_m2.append(m2_in)
                    m2 = _http_json("POST", f"{M2_URL}/classify/batch", body=discovered_for_m2, timeout_s=M2_TIMEOUT_S)
                else:
                    raise
            if not isinstance(m2, list):
                raise ValueError("M2 response is not a list")

            by_id = {str(e.get("id")): e for e in discovered_for_m2 if isinstance(e, dict) and e.get("id")}
            records_by_id = {
                str(r.get("endpoint_id")): r
                for r in m2
                if isinstance(r, dict) and r.get("endpoint_id")
            }
            records_by_path: dict[str, list[dict]] = {}
            for r in m2:
                if not isinstance(r, dict):
                    continue
                path = r.get("path")
                if isinstance(path, str) and path:
                    records_by_path.setdefault(path, []).append(r)

            updated = 0
            for ep in scanner_output:
                endpoint_id = ep.get("id")
                r = records_by_id.get(str(endpoint_id)) if endpoint_id else None
                if not isinstance(r, dict):
                    ep_path = ep.get("endpoint") or ep.get("path")
                    if isinstance(ep_path, str) and ep_path in records_by_path:
                        candidates = records_by_path[ep_path]
                        method = str(ep.get("method") or "").upper()
                        exact = next((c for c in candidates if str(c.get("method") or "").upper() == method), None)
                        any_m = next((c for c in candidates if str(c.get("method") or "").upper() == "ANY"), None)
                        r = exact or any_m or (candidates[0] if candidates else None)
                if not isinstance(r, dict):
                    continue

                state_raw = r.get("state")
                if isinstance(state_raw, str) and state_raw:
                    ep["state"] = state_raw.strip().title()
                ep["state_reason"] = r.get("state_reason")
                # Keep M2 sensitivity separate from M4's UI-facing `data_sensitivity`
                # ("critical|medium|low") so the graph + UI logic stays consistent.
                ep["m2_data_sensitivity"] = r.get("data_sensitivity")
                ep["m2_sensitivity_score"] = r.get("sensitivity_score")
                ep["m2_risk_score"] = r.get("risk_score")
                ep["m2_risk_factors"] = r.get("risk_factors")

                # M2 doesn't expose `technical_score` yet; map risk_score (0..1) -> 0..100 for now.
                try:
                    risk_score = float(r.get("risk_score") or 0.0)
                    ep["technical_score"] = max(0, min(int(round(risk_score * 100)), 100))
                except (TypeError, ValueError):
                    pass

                # If M2 starts returning OWASP failures, prefer those as flags.
                failures = r.get("owasp_failures")
                if isinstance(failures, list) and failures:
                    ep["m2_owasp_failures"] = failures
                    failure_flags: list[str] = []
                    for f in failures:
                        if isinstance(f, dict) and f.get("check_id"):
                            failure_flags.append(str(f["check_id"]))
                    if failure_flags:
                        ep["owasp_flags"] = sorted(set(failure_flags))

                # Ensure we always have a reasonable set of flags for M3 prompts.
                if not ep.get("owasp_flags"):
                    m2_src = by_id.get(str(endpoint_id), {})
                    ep["owasp_flags"] = _derive_owasp_flags(m2_src if isinstance(m2_src, dict) else {})

                updated += 1

            print(f"[pipeline] OK enriched {updated} endpoints via M2 -> {M2_URL}")
        except Exception as e:
            if REQUIRE_M2:
                print(f"[pipeline] ERROR calling M2 at {M2_URL}: {e}", file=sys.stderr)
                return 4
            print(f"[pipeline] WARN: M2 unavailable ({e}); continuing without classifier enrichment", file=sys.stderr)

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

    def _call_m3(payload: list[dict]) -> dict:
        # Retry once: first request may trigger KB/model loading in Harjot's service.
        last_err: Exception | None = None
        for attempt in range(2):
            try:
                return _http_json("POST", f"{M3_URL}/analyze/batch", body=payload, timeout_s=M3_TIMEOUT_S) or {}
            except (TimeoutError, URLError, RuntimeError) as e:
                last_err = e
                if attempt == 0:
                    time.sleep(2)
                    continue
                raise
        raise RuntimeError(f"M3 call failed: {last_err}")

    # Call M3 in small batches to keep latency predictable.
    merged_m3: dict[str, Any] = {"status": "success", "data": [], "error_details": []}
    try:
        for i in range(0, len(m3_payload), M3_BATCH_SIZE):
            chunk = m3_payload[i : i + M3_BATCH_SIZE]
            resp = _call_m3(chunk)
            if isinstance(resp, dict):
                data = resp.get("data", [])
                if isinstance(data, list):
                    merged_m3["data"].extend(data)
                errs = resp.get("error_details", [])
                if isinstance(errs, list):
                    merged_m3["error_details"].extend(errs)
        merged_m3["analyzed"] = len(merged_m3["data"])
        merged_m3["errors"] = len(merged_m3["error_details"])
        m3 = merged_m3
    except (HTTPError, URLError, TimeoutError, RuntimeError) as e:
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
