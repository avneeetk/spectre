"""
scan.py — Live Scan Router
Directly calls M1 (Scanner), M2 (Classifier), and M3 (Agent) services via HTTP.
Replaces the pipeline script with live service orchestration.
"""

import os
import json
import requests
import hashlib
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.data_loader import load_json

router = APIRouter(prefix="/api/scan", tags=["scan"])

# Service URLs (Docker Compose service names)
SCANNER_URL = os.environ.get("SPECTRE_M1_URL", "http://scanner:8001")
AGENT_URL = os.environ.get("SPECTRE_M3_URL", "http://agent:8002")
CLASSIFIER_URL = os.environ.get("SPECTRE_M2_URL", "http://classifier:8003")

# Debug flag to save JSON backups
SAVE_DEBUG = os.environ.get("SPECTRE_SAVE_DEBUG", "true").lower() in {"1", "true", "yes"}
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
M2_OWASP_CONCURRENCY = max(int(os.environ.get("SPECTRE_M2_OWASP_CONCURRENCY", "8")), 1)


class ScanRequest(BaseModel):
    use_cache: bool = False
    repo_url: Optional[str] = None
    github_token: Optional[str] = None
    environment_name: Optional[str] = None
    gateway_config_path: Optional[str] = None
    repo_path: Optional[str] = None
    network_interface: Optional[str] = None
    docker_socket: Optional[str] = None
    scan_sources: Optional[dict] = None


REQUIRED_ONBOARDING_KEYS = {"system_type", "regulations", "api_consumers", "critical_service"}


def _http_post(url: str, body: Any, timeout: int = 60) -> Any:
    """Helper to POST JSON and return response."""
    try:
        resp = requests.post(url, json=body, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Service unreachable: {url} - {e}")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail=f"Service timeout: {url}")
    except requests.exceptions.HTTPError as e:
        raise HTTPException(status_code=resp.status_code, detail=f"Service error: {resp.text}")


def _http_get(url: str, timeout: int = 10) -> dict:
    """Helper to GET and return response."""
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail=f"Service unreachable: {url}")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail=f"Service timeout: {url}")


def _save_debug(filename: str, data: dict):
    """Save JSON for debugging if SAVE_DEBUG is enabled."""
    if SAVE_DEBUG:
        os.makedirs(DATA_DIR, exist_ok=True)
        filepath = os.path.join(DATA_DIR, filename)
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[scan] Debug saved: {filepath}")


def _days_ago_from_iso(last_seen: str | None) -> int | None:
    """Convert ISO timestamp to days ago."""
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
    """Minimal rule-based state inference until M2 output exists."""
    in_gateway = bool(ep.get("in_gateway"))
    in_repo = bool(ep.get("in_repo"))
    seen_in_traffic = bool(ep.get("seen_in_traffic"))
    conflict = ep.get("also_found_in_conflict_with") or ep.get("also_found_in_conflict_with")

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
    """Derive OWASP flags from endpoint metadata."""
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


def _stable_id(method: str, path: str) -> str:
    seed = f"{method.upper()}:{path}"
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12]


def _require_onboarding_context() -> dict:
    onboarding = load_json("onboarding.json", default={})
    if not isinstance(onboarding, dict):
        raise HTTPException(status_code=400, detail="Onboarding must be completed before starting a scan")

    missing = [key for key in REQUIRED_ONBOARDING_KEYS if not onboarding.get(key)]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Onboarding must be completed before starting a scan. Missing: {', '.join(missing)}",
        )
    return onboarding


def _to_m2_discovered_endpoint(ep: dict, *, raw_context_as: str = "string") -> dict | None:
    """
    Convert M1 scanner record into Gurleen/M2 `DiscoveredEndpoint` schema.
    M2 expects:
      - raw_context: string or dict (schema drift handled by caller retry)
      - also_found_in_conflict_with: Optional[str]
    """
    path = ep.get("path") or ep.get("endpoint")
    if not path:
        return None
    method = (ep.get("method") or "GET").upper()
    endpoint_id = ep.get("id") or ep.get("endpoint_id") or _stable_id(method, path)

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

    raw_context_text = ep.get("raw_context")
    if raw_context_text is None:
        raw_context_text = ""
    if raw_context_as == "dict":
        raw_context: Any = {"text": str(raw_context_text)}
    else:
        raw_context = str(raw_context_text)

    None

    auth_detected = bool(ep.get("auth_detected", False))
    auth_type = ep.get("auth_type") or ("jwt" if auth_detected else "none")

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
        "also_found_in_conflict_with": also_found_in_conflict_with,
        "status_codes": status_codes,
        "last_seen": ep.get("last_seen"),
        "tags": tags,
        "raw_context": raw_context,
        "has_owner": bool(ep.get("has_owner") or ep.get("owner_team")),
    }


def _transform_scanner_to_canonical(scanner_eps: list[dict]) -> list[dict]:
    """Transform scanner output to canonical bridge schema."""
    result = []
    for ep in scanner_eps:
        path = ep.get("path") or ep.get("endpoint")
        if not path:
            continue

        state = _canonical_state(ep)
        raw_flags = ep.get("owasp_flags")
        flags = [str(flag) for flag in raw_flags if str(flag).strip()] if isinstance(raw_flags, list) else []
        method = (ep.get("method") or "GET").upper()
        endpoint_id = ep.get("id") or ep.get("endpoint_id") or _stable_id(method, path)

        result.append({
            "id": str(endpoint_id),
            "endpoint": path,
            "method": method,
            "state": state,
            "last_seen_days_ago": _days_ago_from_iso(ep.get("last_seen")),
            "auth_present": bool(ep.get("auth_detected", False)),
            "rate_limited": bool(ep.get("rate_limited", False)),
            "tls_enabled": bool(ep.get("tls_enabled", True)),
            "in_gateway": bool(ep.get("in_gateway", False)),
            "owasp_flags": flags,
            "service_name": ep.get("service_name") or "unknown",
            "confidence": float(ep.get("confidence") or 0.0),
            "in_repo": bool(ep.get("in_repo", False)),
            "seen_in_traffic": bool(ep.get("seen_in_traffic", False)),
            "sources": ep.get("sources", []),
            "raw_context": ep.get("raw_context"),
            "also_found_in_conflict_with": ep.get("also_found_in_conflict_with") or ep.get("also_found_in_conflict_with"),
        })
    return result


def _extract_m2_owasp_flags(m2_owasp_resp: dict) -> tuple[list[str], list[dict]]:
    failures = m2_owasp_resp.get("failures")
    if not isinstance(failures, list):
        return [], []

    flags: list[str] = []
    normalized_failures: list[dict] = []
    for failure in failures:
        if not isinstance(failure, dict):
            continue
        normalized_failures.append(failure)
        check_id = failure.get("check_id")
        if isinstance(check_id, str) and check_id.strip():
            flags.append(check_id.strip())

    return sorted(set(flags)), normalized_failures


def _fetch_m2_owasp(endpoint_id: str, discovered_ep: dict) -> tuple[str, dict | None, str | None]:
    try:
        owasp_resp = _http_post(
            f"{CLASSIFIER_URL}/owasp",
            {"endpoint": discovered_ep, "active": False},
            timeout=30,
        )
        if isinstance(owasp_resp, dict):
            return endpoint_id, owasp_resp, None
        return endpoint_id, None, "OWASP response was not a JSON object"
    except Exception as e:
        return endpoint_id, None, str(e)


def _normalise_m3_results(m3_results: Any, m3_payload: list[dict]) -> list[dict]:
    """
    Harjot's agent currently returns endpoint-level analysis without stable ids/methods.
    Reattach those fields from the payload we sent so saved artifacts can be rejoined later.
    """
    normalised: list[dict] = []

    if not isinstance(m3_results, list):
        return normalised

    for index, item in enumerate(m3_results):
        if not isinstance(item, dict):
            continue

        seed = m3_payload[index] if index < len(m3_payload) and isinstance(m3_payload[index], dict) else {}
        enriched = dict(item)

        if seed.get("id") and not enriched.get("id"):
            enriched["id"] = seed["id"]
        if seed.get("method") and not enriched.get("method"):
            enriched["method"] = seed["method"]
        if seed.get("endpoint") and not enriched.get("endpoint"):
            enriched["endpoint"] = seed["endpoint"]
        if seed.get("service_name") and not enriched.get("service_name"):
            enriched["service_name"] = seed["service_name"]

        normalised.append(enriched)

    return normalised


def _prepare_m3_payload(canonical_eps: list[dict]) -> list[dict]:
    """Prepare payload for M3 (Agent) service."""
    return [
        {
            "id": ep["id"],
            "endpoint": ep["endpoint"],
            "method": ep["method"],
            "service_name": ep.get("service_name", ""),
            "state": ep.get("state", "Unknown"),
            "last_seen_days_ago": int(ep.get("last_seen_days_ago") or 0),
            "auth_present": bool(ep.get("auth_present")),
            "rate_limited": bool(ep.get("rate_limited")),
            "tls_enabled": bool(ep.get("tls_enabled")),
            "in_gateway": bool(ep.get("in_gateway")),
            "owasp_flags": ep.get("owasp_flags", []),
        }
        for ep in canonical_eps
    ]


@router.post("/trigger")
def trigger_scan(req: ScanRequest):
    """
    Trigger a full live scan:
    1. Call Scanner (M1) to discover endpoints
    2. Call Classifier (M2) to classify endpoints (optional)
    3. Call Agent (M3) to analyze threats
    4. Return enriched data for dashboard
    """
    try:
        _require_onboarding_context()
        warnings: list[str] = []
        timings: dict[str, float] = {}
        scan_started = time.perf_counter()

        # Step 1: Call Scanner Service (M1)
        scanner_started = time.perf_counter()
        if req.repo_url:
            print(f"[scan] Calling scanner GitHub scan at {SCANNER_URL}/scan/github")
            try:
                scanner_resp = _http_post(
                    f"{SCANNER_URL}/scan/github",
                    {"repo_url": req.repo_url, "github_token": req.github_token},
                    timeout=90,
                )
            except HTTPException as e:
                # Backward compat: if M1 doesn't support /scan/github yet, fall back to sample scan.
                # Only fallback on the *route being missing*, not when the repo scan found no files.
                msg = str(getattr(e, "detail", "")) + str(e)
                route_missing = (
                    e.status_code in {404, 405}
                    and ("\"detail\":\"Not Found\"" in msg or "Method Not Allowed" in msg)
                )
                if route_missing:
                    print(f"[scan] M1 /scan/github unavailable; falling back to /scan/sample")
                    scanner_resp = _http_post(f"{SCANNER_URL}/scan/sample", {}, timeout=60)
                else:
                    raise
        else:
            print(f"[scan] Calling scanner at {SCANNER_URL}/scan/sample")
            scanner_resp = _http_post(f"{SCANNER_URL}/scan/sample", {}, timeout=60)
        scanner_eps = scanner_resp.get("endpoints", [])

        if not scanner_eps:
            raise HTTPException(status_code=502, detail="Scanner returned no endpoints")

        timings["scanner_seconds"] = round(time.perf_counter() - scanner_started, 2)
        print(f"[scan] Scanner completed in {timings['scanner_seconds']}s with {len(scanner_eps)} endpoints")
        _save_debug("scanner_raw.json", {"endpoints": scanner_eps})

        # Transform to canonical format
        canonical_eps = _transform_scanner_to_canonical(scanner_eps)

        # Step 2: Call Classifier (M2) - optional enrichment
        try:
            m2_started = time.perf_counter()
            def build_m2_payload(raw_context_as: str) -> list[dict]:
                payload: list[dict] = []
                for raw in scanner_eps:
                    if not isinstance(raw, dict):
                        continue
                    rec = _to_m2_discovered_endpoint(raw, raw_context_as=raw_context_as)
                    if rec is not None:
                        payload.append(rec)
                return payload

            discovered_for_m2 = build_m2_payload("string")
            discovered_by_id = {
                str(item.get("id")): item
                for item in discovered_for_m2
                if isinstance(item, dict) and item.get("id")
            }
            _save_debug("m2_payload.json", {"endpoints": discovered_for_m2})

            print(f"[scan] Calling classifier at {CLASSIFIER_URL}/classify/batch")
            try:
                m2_resp = _http_post(f"{CLASSIFIER_URL}/classify/batch", discovered_for_m2, timeout=60)
            except HTTPException as e:
                # M2 schema drift: some versions expect raw_context as dict, some as string.
                msg = str(getattr(e, "detail", "")) + str(e)
                if e.status_code == 422 and "raw_context" in msg:
                    alt = "dict" if '"type":"dict_type"' in msg else "string"
                    discovered_for_m2 = build_m2_payload(alt)
                    m2_resp = _http_post(f"{CLASSIFIER_URL}/classify/batch", discovered_for_m2, timeout=60)
                else:
                    raise
            if not isinstance(m2_resp, list):
                raise ValueError(f"M2 returned non-list payload: {type(m2_resp)}")
            _save_debug("m2_classify_raw.json", {"endpoints": m2_resp})
            print(f"[scan] M2 returned {len(m2_resp)} results, sample: {m2_resp[:2] if m2_resp else 'empty'}")
            timings["m2_classify_seconds"] = round(time.perf_counter() - m2_started, 2)
            print(f"[scan] M2 classify completed in {timings['m2_classify_seconds']}s")

            m2_owasp_by_id: dict[str, dict] = {}
            owasp_started = time.perf_counter()
            owasp_workers = min(M2_OWASP_CONCURRENCY, max(len(discovered_by_id), 1))
            with ThreadPoolExecutor(max_workers=owasp_workers) as executor:
                future_map = {
                    executor.submit(_fetch_m2_owasp, endpoint_id, discovered_ep): endpoint_id
                    for endpoint_id, discovered_ep in discovered_by_id.items()
                }
                for future in as_completed(future_map):
                    endpoint_id, owasp_resp, error = future.result()
                    if isinstance(owasp_resp, dict):
                        m2_owasp_by_id[endpoint_id] = owasp_resp
                    elif error:
                        print(f"[scan] M2 OWASP unavailable for {endpoint_id}: {error}")
            timings["m2_owasp_seconds"] = round(time.perf_counter() - owasp_started, 2)
            print(
                f"[scan] M2 OWASP completed in {timings['m2_owasp_seconds']}s "
                f"for {len(m2_owasp_by_id)}/{len(discovered_by_id)} endpoints using {owasp_workers} workers"
            )

            # Enrich canonical data with M2 results
            m2_by_id = {r.get("endpoint_id"): r for r in m2_resp if isinstance(r, dict) and r.get("endpoint_id")}
            m2_by_path: dict[str, list[dict]] = {}
            for r in m2_resp:
                if not isinstance(r, dict):
                    continue
                path = r.get("path")
                if isinstance(path, str) and path:
                    m2_by_path.setdefault(path, []).append(r)
            print(f"[scan] M2 IDs: {list(m2_by_id.keys())[:5]}")
            print(f"[scan] M2 endpoints: {list(m2_by_path.keys())[:5]}")
            for ep in canonical_eps:
                ep_id = ep.get("id")
                ep_path = ep.get("endpoint")
                m2_rec = m2_by_id.get(ep_id) if ep_id else None
                if not m2_rec and isinstance(ep_path, str):
                    candidates = m2_by_path.get(ep_path, [])
                    if candidates:
                        # Prefer method match, then ANY, else first.
                        method = str(ep.get("method") or "").upper()
                        exact = next((c for c in candidates if str(c.get("method") or "").upper() == method), None)
                        any_m = next((c for c in candidates if str(c.get("method") or "").upper() == "ANY"), None)
                        m2_rec = exact or any_m or candidates[0]
                if m2_rec:
                    if m2_rec.get("state"):
                        ep["state"] = m2_rec["state"].strip().title()
                    # Expose M2 context to the UI; keep M4's own `data_sensitivity` field separate.
                    ep["state_reason"] = m2_rec.get("state_reason")
                    ep["m2_data_sensitivity"] = m2_rec.get("data_sensitivity")
                    ep["m2_sensitivity_score"] = m2_rec.get("sensitivity_score")
                    ep["m2_risk_score"] = m2_rec.get("risk_score")
                    ep["m2_risk_factors"] = m2_rec.get("risk_factors")

                    try:
                        risk_score = float(m2_rec.get("risk_score") or 0.0)
                        ep["technical_score"] = max(0, min(int(round(risk_score * 100)), 100))
                    except (TypeError, ValueError):
                        pass

                owasp_resp = m2_owasp_by_id.get(str(ep_id)) if ep_id else None
                if isinstance(owasp_resp, dict):
                    m2_flags, failures = _extract_m2_owasp_flags(owasp_resp)
                    ep["m2_owasp_failures"] = failures
                    ep["owasp_flags"] = m2_flags

            print(f"[scan] Enriched {len([e for e in canonical_eps if e.get('technical_score')])} endpoints via M2")
        except Exception as e:
            print(f"[scan] M2 classifier unavailable or error: {e}")
            # Continue without M2 enrichment

        # Save canonical scanner output for inventory to read (includes M2 enrichment if available)
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(os.path.join(DATA_DIR, "scanner_output.json"), "w") as f:
            json.dump(canonical_eps, f, indent=2)
        _save_debug("scanner_canonical.json", {"endpoints": canonical_eps})

        # Step 3: Call Agent Service (M3)
        m3_payload = _prepare_m3_payload(canonical_eps)
        _save_debug("m3_payload.json", {"data": m3_payload})

        m3_results: list[dict] = []
        m3_started = time.perf_counter()
        try:
            print(f"[scan] Calling agent at {AGENT_URL}/analyze/batch")
            m3_resp = _http_post(f"{AGENT_URL}/analyze/batch", m3_payload, timeout=240)
            raw_m3_results = m3_resp.get("data", []) if isinstance(m3_resp, dict) else []
            m3_results = _normalise_m3_results(raw_m3_results, m3_payload)
            if raw_m3_results and not m3_results:
                raise ValueError("Agent returned no usable result records")
        except Exception as e:
            print(f"[scan] M3 agent unavailable or error: {e}")
            warnings.append(f"Agent unavailable: {e}")
        timings["m3_agent_seconds"] = round(time.perf_counter() - m3_started, 2)
        print(f"[scan] M3 completed in {timings['m3_agent_seconds']}s with {len(m3_results)} results")

        # Save agent results as bare list (not wrapped) for data_loader compatibility
        agent_path = os.path.join(DATA_DIR, "agent_results.json")
        with open(agent_path, "w") as f:
            json.dump(m3_results, f, indent=2)
        print(f"[scan] Saved agent results: {agent_path}")

        # Step 4: Merge M3 results with canonical data
        # Use id first, then fallback to method+endpoint
        result_index = {}
        for r in m3_results:
            if isinstance(r, dict):
                if r.get("id"):
                    result_index[r["id"]] = r
                else:
                    # Fallback: method+endpoint key
                    method_ep_key = f"{r.get('method', '')}:{r.get('endpoint', '')}"
                    result_index[method_ep_key] = r
        
        final_data = []

        for ep in canonical_eps:
            m3_rec = None
            # Try matching by id first
            if ep.get("id"):
                m3_rec = result_index.get(ep["id"])
            
            # Fallback to method+endpoint if no id match
            if not m3_rec:
                method_ep_key = f"{ep.get('method', '')}:{ep.get('endpoint', '')}"
                m3_rec = result_index.get(method_ep_key)

            merged = {
                **ep,
                "risk_summary": m3_rec.get("risk_summary") if m3_rec else "AI analysis unavailable",
                "violations": m3_rec.get("violations", []) if m3_rec else [],
                "recommended_action": m3_rec.get("recommended_action") if m3_rec else "No recommendation available",
                "technical_fix": m3_rec.get("technical_fix") if m3_rec else None,
            }
            final_data.append(merged)

        # Save final merged output
        _save_debug("final_inventory.json", {"endpoints": final_data})
        timings["total_seconds"] = round(time.perf_counter() - scan_started, 2)
        _save_debug("scan_timings.json", timings)
        print(f"[scan] Total pipeline completed in {timings['total_seconds']}s")

        return {
            "status": "success",
            "total": len(final_data),
            "endpoints": final_data,
            "sources": {
                "scanner": len(scanner_eps),
                "agent": len(m3_results),
            },
            "context": {
                "repo_url": req.repo_url,
                "environment_name": req.environment_name,
                "scan_sources": req.scan_sources,
                "gateway_config_path": req.gateway_config_path,
                "repo_path": req.repo_path,
                "network_interface": req.network_interface,
                "docker_socket": req.docker_socket,
            },
            "debug_saved": SAVE_DEBUG,
            "warnings": warnings,
            "timings": timings,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[scan] Error during scan: {e}")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")


@router.get("/health/services")
def health_check_services():
    """Health check for all downstream services."""
    services = {
        "scanner": {"url": f"{SCANNER_URL}/ping", "status": "unknown"},
        "classifier": {"url": f"{CLASSIFIER_URL}/health", "status": "unknown"},
        "agent": {"url": f"{AGENT_URL}/health", "status": "unknown"},
    }

    for name, info in services.items():
        try:
            resp = requests.get(info["url"], timeout=5)
            info["status"] = "healthy" if resp.status_code == 200 else f"unhealthy ({resp.status_code})"
        except Exception as e:
            info["status"] = f"unreachable: {str(e)}"

    all_healthy = all(s["status"] == "healthy" for s in services.values())
    return {
        "overall": "healthy" if all_healthy else "degraded",
        "services": services,
    }
