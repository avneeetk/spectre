"""
OWASP API Security Top 10 (2023) checks.
Focused on vulnerabilities most common in forgotten/zombie infrastructure.

Checks implemented:
  API2 — Broken Authentication
  API4 — No Rate Limiting
  API8 — Security Misconfiguration
  API9 — Improper Inventory Management  (PRIMARY)

Each check receives a DiscoveredEndpoint and returns an OWASPResult.
Active HTTP checks (API2, API4, API8) also accept a base_url so the
scanner can fire real requests in a non-prod environment.
"""

import httpx
from models import DiscoveredEndpoint, OWASPResult


# ---------------------------------------------------------------------------
# API9 — Improper Inventory Management  (no live request needed)
# ---------------------------------------------------------------------------

def check_api9_inventory(ep: DiscoveredEndpoint) -> OWASPResult:
    """
    An endpoint passes only if it appears in the gateway, has a repo entry,
    AND has a declared owner. Missing any one of these is a flag.
    """
    missing = []
    if not ep.in_gateway:
        missing.append("gateway")
    if not ep.in_repo:
        missing.append("repo/spec")
    if not ep.has_owner:
        missing.append("owner")

    passed = len(missing) == 0
    evidence = (
        "Endpoint is fully registered and owned."
        if passed
        else f"Missing from: {', '.join(missing)}"
    )

    return OWASPResult(
        check_id="API9",
        passed=passed,
        evidence=evidence,
        severity="HIGH" if not passed else "NONE",
    )


# ---------------------------------------------------------------------------
# API2 — Broken Authentication  (live request)
# ---------------------------------------------------------------------------

def check_api2_auth(ep: DiscoveredEndpoint, base_url: str) -> OWASPResult:
    """
    Sends a request with NO credentials.
    Passes if the server responds with 401 or 403.
    Fails (broken auth) if it returns 200 or any 2xx.
    """
    url = f"{base_url.rstrip('/')}{ep.path}"
    try:
        resp = httpx.request(ep.method, url, timeout=5)
        passed = resp.status_code in (401, 403)
        evidence = f"Unauthenticated {ep.method} returned HTTP {resp.status_code}"
    except httpx.RequestError as exc:
        # Cannot reach the endpoint — treat as inconclusive, not a pass
        passed = False
        evidence = f"Request failed: {exc}"

    return OWASPResult(
        check_id="API2",
        passed=passed,
        evidence=evidence,
        severity="CRITICAL" if not passed else "NONE",
    )


# ---------------------------------------------------------------------------
# API4 — No Rate Limiting  (live request)
# ---------------------------------------------------------------------------

def check_api4_rate_limit(
    ep: DiscoveredEndpoint,
    base_url: str,
    probe_count: int = 15,
) -> OWASPResult:
    """
    Fires probe_count rapid requests.
    Passes if ANY response contains a 429 or a rate-limit header.
    """
    url = f"{base_url.rstrip('/')}{ep.path}"
    rate_limited = False
    evidence_detail = ""

    with httpx.Client(timeout=5) as client:
        for i in range(probe_count):
            try:
                resp = client.request(ep.method, url)
                has_rl_header = any(
                    h in resp.headers
                    for h in ("x-ratelimit-limit", "ratelimit-limit", "retry-after")
                )
                if resp.status_code == 429 or has_rl_header:
                    rate_limited = True
                    evidence_detail = (
                        f"Rate limiting triggered on request {i + 1} "
                        f"(status={resp.status_code})"
                    )
                    break
            except httpx.RequestError:
                break  # network error — stop probing

    if not rate_limited:
        evidence_detail = f"No 429 or rate-limit header observed after {probe_count} rapid requests"

    return OWASPResult(
        check_id="API4",
        passed=rate_limited,
        evidence=evidence_detail,
        severity="HIGH" if not rate_limited else "NONE",
    )


# ---------------------------------------------------------------------------
# API8 — Security Misconfiguration  (live request)
# ---------------------------------------------------------------------------

def check_api8_misconfig(ep: DiscoveredEndpoint, base_url: str) -> OWASPResult:
    """
    Checks for three common misconfigurations in a single OPTIONS probe:
      1. TLS — is the base_url using HTTPS?
      2. CORS — is Access-Control-Allow-Origin set to wildcard (*)?
      3. Error leakage — does a bad request return a stack trace?
    """
    issues = []

    # 1. TLS check (static — no request needed)
    if not base_url.startswith("https://"):
        issues.append("No TLS (endpoint served over plain HTTP)")

    url = f"{base_url.rstrip('/')}{ep.path}"

    # 2. CORS wildcard check via OPTIONS
    try:
        opts = httpx.options(url, timeout=5)
        cors = opts.headers.get("access-control-allow-origin", "")
        if cors == "*":
            issues.append("CORS allows all origins (Access-Control-Allow-Origin: *)")
    except httpx.RequestError:
        issues.append("OPTIONS request failed — CORS posture unknown")

    # 3. Error leakage check — send a malformed request
    try:
        bad = httpx.get(url + "/__bad__", timeout=5)
        body = bad.text.lower()
        leak_signals = ["traceback", "stack trace", "exception", "at line", "syntaxerror"]
        if any(sig in body for sig in leak_signals):
            issues.append("Error response leaks stack trace or exception detail")
    except httpx.RequestError:
        pass  # not conclusive either way

    passed = len(issues) == 0
    return OWASPResult(
        check_id="API8",
        passed=passed,
        evidence="; ".join(issues) if issues else "No misconfigurations detected",
        severity="MEDIUM" if not passed else "NONE",
    )


# ---------------------------------------------------------------------------
# run_all_checks — convenience wrapper used by the API route
# ---------------------------------------------------------------------------

def run_all_checks(
    ep: DiscoveredEndpoint,
    base_url: str | None = None,
    active: bool = False,
) -> list[OWASPResult]:
    """
    Run all implemented OWASP checks for an endpoint.

    Args:
        ep:       The endpoint to scan.
        base_url: Required when active=True. The scheme+host to probe,
                  e.g. "https://api.internal".
        active:   If False, only passive checks (API9) run.
                  If True, active HTTP probes (API2, API4, API8) also run.
    """
    results = [check_api9_inventory(ep)]

    if active:
        if not base_url:
            raise ValueError("base_url is required for active OWASP checks.")
        results.append(check_api2_auth(ep, base_url))
        results.append(check_api4_rate_limit(ep, base_url))
        results.append(check_api8_misconfig(ep, base_url))

    return results