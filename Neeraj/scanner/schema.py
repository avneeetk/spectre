"""
schema.py — SPECTRE Shared Data Contract
=========================================
This file defines what one discovered API endpoint looks like.
Every member imports from this file. Nobody defines their own format.

WHO USES THIS:
  Member 1 (you)   → produces APIEndpoint objects using create_endpoint()
  Member 2         → reads endpoints, adds: state, owasp_flags, risk_reason
  Member 3         → reads endpoints, adds their own AI fields on top
  Member 4         → reads final endpoints to display on the dashboard

VALID SOURCE VALUES (use exactly these strings, no abbreviations):
  "nginx_config"      → found in an Nginx config file
  "kong_gateway"      → found in a Kong config file
  "code_repository"   → found by scanning Python source code
  "network_traffic"   → observed by mitmproxy traffic capture
  "kubernetes"        → found in a Docker/Kubernetes manifest

VALID STATE VALUES (set by Member 2):
  "active"   → known, documented, recently used
  "shadow"   → receiving traffic but not in any gateway or repo
  "zombie"   → in gateway/repo but no traffic in 90+ days
  "rogue"    → not registered, no auth, suspicious
  "unknown"  → default before classification runs

VALID AUTH TYPE VALUES:
  "none"     → no authentication detected
  "jwt"      → JWT / Bearer token
  "basic"    → HTTP Basic Auth
  "api_key"  → API key in header or query param
  "oauth2"   → OAuth2
  "unknown"  → auth detected but type unclear
"""

from dataclasses import dataclass, field, asdict
from typing import Optional
import hashlib
import json


# ---------------------------------------------------------------------------
# Valid value sets — use these to validate fields
# ---------------------------------------------------------------------------

VALID_SOURCES = {
    "nginx_config",
    "kong_gateway",
    "code_repository",
    "network_traffic",
    "kubernetes",
}

VALID_STATES = {
    "active",
    "shadow",
    "zombie",
    "rogue",
    "unknown",
}

VALID_AUTH_TYPES = {
    "none",
    "jwt",
    "basic",
    "api_key",
    "oauth2",
    "unknown",
}

VALID_METHODS = {
    "GET", "POST", "PUT", "DELETE",
    "PATCH", "OPTIONS", "HEAD", "ANY",
}


# ---------------------------------------------------------------------------
# The core data structure
# ---------------------------------------------------------------------------

@dataclass
class APIEndpoint:
    """
    One discovered API endpoint.

    Fields are grouped by who fills them in:
      - Identity fields: always required, set at creation
      - Discovery fields: filled in by Member 1 (scanner)
      - Classification fields: filled in by Member 2
    """

    # ------------------------------------------------------------------
    # Identity — always required
    # ------------------------------------------------------------------

    id: str
    # Stable 12-character hash generated from method + path.
    # Format: md5("GET:/api/v1/users")[:12]
    # Generated automatically by create_endpoint() — do not set manually.

    method: str
    # HTTP method. One of VALID_METHODS.
    # Use "ANY" when the method is not specified (e.g. Nginx location blocks).

    path: str
    # The route path. Always starts with "/". No query parameters.
    # Examples: "/api/v1/users", "/internal/debug/logs"

    service_name: str
    # The backend service this endpoint belongs to.
    # From proxy_pass in Nginx, service name in Kong,
    # or the filename in code scanning.
    # Example: "user-service", "payment-service"

    # ------------------------------------------------------------------
    # Discovery — filled in by Member 1
    # ------------------------------------------------------------------

    sources: list = field(default_factory=list)
    # Every source where this endpoint was found.
    # Values must be from VALID_SOURCES.
    # Can contain multiple values if found in more than one place.
    # Example: ["nginx_config", "code_repository"]

    in_repo: bool = False
    # True if found by the Python AST code scanner.

    in_gateway: bool = False
    # True if found in Nginx or Kong config files.

    seen_in_traffic: bool = False
    # True if observed by mitmproxy traffic capture.

    auth_detected: bool = False
    # True if any authentication mechanism was detected.

    auth_type: str = "none"
    # Type of auth. Must be one of VALID_AUTH_TYPES.

    status_codes: list = field(default_factory=list)
    # HTTP status codes observed in traffic (from mitmproxy).
    # Empty list if seen_in_traffic is False.
    # Example: [200, 401]

    last_seen: Optional[str] = None
    # ISO 8601 UTC timestamp of last observed traffic.
    # None if this endpoint has never been seen in traffic.
    # Example: "2025-03-17T10:00:00Z"

    tags: list = field(default_factory=list)
    # Freeform labels for filtering.
    # Example: ["python", "fastapi"], ["nginx", "internal"]

    raw_context: str = ""
    # The raw text where this endpoint was found.
    # Keep this descriptive — Member 3's AI layer uses it for explanations.
    # Example: "location /api/v1/users { proxy_pass http://user-service; }"

    also_found_in_conflict_with: Optional[str] = None
    # If a similar path exists in another source with a mismatch,
    # store the conflicting path here.
    # Example: traffic shows "/api/v1/user" but gateway has "/api/v1/users"
    # Used by Member 2 for rogue API detection.

    # ------------------------------------------------------------------
    # Classification — filled in by Member 2
    # ------------------------------------------------------------------

    state: str = "unknown"
    # One of VALID_STATES. Set by the classification engine.

    owasp_flags: list = field(default_factory=list)
    # OWASP API Security IDs this endpoint fails.
    # Example: ["API2", "API9"]

    risk_reason: str = ""
    # One sentence explaining the main risk.
    # Example: "Endpoint has no auth and is not in the gateway registry."


# ---------------------------------------------------------------------------
# create_endpoint() — Member 1 uses this in every parser
# ---------------------------------------------------------------------------

def create_endpoint(method, path, service_name, source, **kwargs):
    """
    Create a new APIEndpoint. Use this instead of APIEndpoint() directly.

    Automatically:
      - Generates a stable ID from method + path
      - Sets in_gateway, in_repo, seen_in_traffic based on source
      - Ensures path starts with "/"
      - Uppercases the method

    Example:
        ep = create_endpoint(
            method="GET",
            path="/api/v1/users",
            service_name="user-service",
            source="nginx_config",
            auth_detected=True,
            auth_type="jwt",
            raw_context="location /api/v1/users { auth_jwt on; }"
        )
    """
    method = method.upper()
    if not path.startswith("/"):
        path = "/" + path

    endpoint_id = hashlib.md5(
        f"{method}:{path}".encode()
    ).hexdigest()[:12]

    in_gateway = source in ("nginx_config", "kong_gateway")
    in_repo = source == "code_repository"
    seen_in_traffic = source == "network_traffic"

    return APIEndpoint(
        id=endpoint_id,
        method=method,
        path=path,
        service_name=service_name,
        sources=[source],
        in_gateway=in_gateway,
        in_repo=in_repo,
        seen_in_traffic=seen_in_traffic,
        **kwargs
    )


# ---------------------------------------------------------------------------
# merge_endpoint() — called when same endpoint found in a second source
# ---------------------------------------------------------------------------

def merge_endpoint(existing, new_source):
    """
    Update an existing endpoint when found in a second source.
    Do NOT create a duplicate — update the existing record instead.

    Example:
        /api/v1/users found in nginx_config → create_endpoint(...)
        /api/v1/users also found in code    → merge_endpoint(existing, "code_repository")

        Result: sources     = ["nginx_config", "code_repository"]
                in_gateway  = True
                in_repo     = True
    """
    if new_source not in existing.sources:
        existing.sources.append(new_source)

    if new_source in ("nginx_config", "kong_gateway"):
        existing.in_gateway = True
    elif new_source == "code_repository":
        existing.in_repo = True
    elif new_source == "network_traffic":
        existing.seen_in_traffic = True

    return existing


# ---------------------------------------------------------------------------
# save_endpoints() and load_endpoints()
# ---------------------------------------------------------------------------

def save_endpoints(endpoints, filepath):
    """
    Save a list of APIEndpoint objects to a JSON file.
    Member 1 calls this at the end of every scanner run.

    Example:
        save_endpoints(all_endpoints, "output/discovered_endpoints.json")
    """
    import os
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    data = [asdict(ep) for ep in endpoints]
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"[schema] Saved {len(endpoints)} endpoints → {filepath}")


def load_endpoints(filepath):
    """
    Load APIEndpoint objects from a JSON file.
    Members 2, 3, and 4 call this to read Member 1's output.

    Example:
        endpoints = load_endpoints("output/discovered_endpoints.json")
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [APIEndpoint(**ep) for ep in data]


# ---------------------------------------------------------------------------
# validate_endpoint() and validate_all()
# ---------------------------------------------------------------------------

def validate_endpoint(ep):
    """
    Check one endpoint for errors.
    Returns a list of error strings. Empty list = valid.

    Member 1 should call this on every endpoint before saving.

    Example:
        errors = validate_endpoint(ep)
        if errors:
            print(f"Problem with {ep.path}: {errors}")
    """
    errors = []

    if not ep.id or len(ep.id) != 12:
        errors.append(f"id must be 12 characters, got '{ep.id}'")

    if ep.method not in VALID_METHODS:
        errors.append(f"invalid method '{ep.method}'")

    if not ep.path.startswith("/"):
        errors.append(f"path must start with '/', got '{ep.path}'")

    if "?" in ep.path:
        errors.append(f"path must not contain query params, got '{ep.path}'")

    if not ep.sources:
        errors.append("sources list is empty")

    for s in ep.sources:
        if s not in VALID_SOURCES:
            errors.append(f"invalid source '{s}' — use one of {VALID_SOURCES}")

    if ep.auth_type not in VALID_AUTH_TYPES:
        errors.append(f"invalid auth_type '{ep.auth_type}'")

    if ep.auth_detected and ep.auth_type == "none":
        errors.append("auth_detected is True but auth_type is 'none'")

    if not ep.auth_detected and ep.auth_type != "none":
        errors.append("auth_type is set but auth_detected is False")

    if ep.state not in VALID_STATES:
        errors.append(f"invalid state '{ep.state}'")

    for code in ep.status_codes:
        if not (100 <= code <= 599):
            errors.append(f"invalid HTTP status code: {code}")

    return errors


def validate_all(endpoints):
    """
    Validate a full list of endpoints. Prints all errors.
    Returns True if everything is valid, False if any errors found.
    """
    all_valid = True
    for ep in endpoints:
        errors = validate_endpoint(ep)
        if errors:
            all_valid = False
            print(f"\n[INVALID] {ep.method} {ep.path}")
            for e in errors:
                print(f"  - {e}")

    if all_valid:
        print(f"[schema] All {len(endpoints)} endpoints valid.")

    return all_valid


# ---------------------------------------------------------------------------
# Run this file directly to see a working example
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    print("=== Creating a sample endpoint (from Nginx parser) ===\n")

    ep = create_endpoint(
        method="GET",
        path="/api/v1/users",
        service_name="user-service",
        source="nginx_config",
        auth_detected=False,
        auth_type="none",
        tags=["nginx", "internal"],
        raw_context="location /api/v1/users { proxy_pass http://user-service; }"
    )

    print(json.dumps(asdict(ep), indent=2))

    print("\n=== Same endpoint also found in code repo ===\n")
    merge_endpoint(ep, "code_repository")
    print(f"sources       : {ep.sources}")
    print(f"in_gateway    : {ep.in_gateway}")
    print(f"in_repo       : {ep.in_repo}")
    print(f"seen_in_traffic: {ep.seen_in_traffic}")

    print("\n=== Validation ===\n")
    errors = validate_endpoint(ep)
    if errors:
        for e in errors:
            print(f"  ERROR: {e}")
    else:
        print("Valid — no errors found.")