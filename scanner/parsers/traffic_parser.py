"""
traffic_parser.py — mitmproxy traffic capture script

HOW TO RUN:
    mitmdump -s scanner/parsers/traffic_parser.py --listen-port 8080

This script runs INSIDE mitmproxy. It is called automatically
for every HTTP request that flows through the proxy.

Output: output/traffic_log.json
Each entry is one unique endpoint observed in traffic.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

OUTPUT_FILE = "output/traffic_log.json"

# Paths to ignore — health checks and proxy noise
IGNORE_PATHS = {"/health", "/favicon.ico", "/robots.txt"}


def load_log():
    """Load existing traffic log, or return empty dict."""
    path = Path(OUTPUT_FILE)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}


def save_log(data):
    """Save traffic log to file."""
    Path("output").mkdir(exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def request(flow):
    """
    mitmproxy calls this function for EVERY request it intercepts.
    We log the endpoint details and save to our traffic log.
    """
    method = flow.request.method
    path = flow.request.path

    # Strip query parameters — we only want the path
    if "?" in path:
        path = path.split("?")[0]

    # Skip noise
    if path in IGNORE_PATHS:
        return

    # Skip non-API paths (optional filter)
    if not path.startswith("/api") and not path.startswith("/internal"):
        return

    host = flow.request.pretty_host
    now = datetime.now(timezone.utc).isoformat()

    # Build a stable ID the same way schema.py does
    import hashlib
    endpoint_id = hashlib.md5(
        f"{method}:{path}".encode()
    ).hexdigest()[:12]

    # Check if auth header is present
    headers_lower = {k.lower(): v for k, v in flow.request.headers.items()}
    auth_detected = "authorization" in headers_lower
    if auth_detected:
        auth_header = headers_lower["authorization"].lower()
        if auth_header.startswith("bearer"):
            auth_type = "jwt"
        elif auth_header.startswith("basic"):
            auth_type = "basic"
        else:
            auth_type = "unknown"
    else:
        auth_type = "none"

    # Load existing log
    log = load_log()

    if endpoint_id not in log:
        # New endpoint — create a full record
        log[endpoint_id] = {
            "id": endpoint_id,
            "method": method,
            "path": path,
            "service_name": host,
            "sources": ["network_traffic"],
            "in_repo": False,
            "in_gateway": False,
            "seen_in_traffic": True,
            "auth_detected": auth_detected,
            "auth_type": auth_type,
            "status_codes": [],
            "last_seen": now,
            "tags": ["traffic"],
            "raw_context": f"Observed at {host} on {now}",
            "also_found_in_conflict_with": None,
            "state": "unknown",
            "owasp_flags": [],
            "risk_reason": ""
        }
        print(f"[traffic] NEW endpoint: {method} {path}")
    else:
        # Already seen — just update last_seen
        log[endpoint_id]["last_seen"] = now
        print(f"[traffic] Updated: {method} {path}")

    save_log(log)


def response(flow):
    """
    mitmproxy also calls this for every response.
    We use it to capture the HTTP status code.
    """
    method = flow.request.method
    path = flow.request.path
    if "?" in path:
        path = path.split("?")[0]

    if path in IGNORE_PATHS:
        return

    import hashlib
    endpoint_id = hashlib.md5(
        f"{method}:{path}".encode()
    ).hexdigest()[:12]

    status_code = flow.response.status_code
    log = load_log()

    if endpoint_id in log:
        codes = log[endpoint_id].get("status_codes", [])
        if status_code not in codes:
            codes.append(status_code)
            log[endpoint_id]["status_codes"] = codes
            save_log(log)