import re
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from scanner.schema import create_endpoint, validate_endpoint

def parse_nginx_config(filepath):
    """
    Read an Nginx config file and return a list
    of APIEndpoint objects — one per location block.
    """
    # Open the file and read its entire contents as a string
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Use regex to find every location block
    # Pattern: the word "location", then the path, then { block content }
    pattern = r'location\s+([^\s{]+)\s*\{([^}]+)\}'
    matches = re.finditer(pattern, content, re.DOTALL)

    results = []

    for match in matches:
        # match.group(1) is the path, e.g. /api/v1/users
        # match.group(2) is everything inside the { }
        path = match.group(1).strip()
        block = match.group(2).strip()

        # Detect auth by checking for known auth keywords
        auth_detected, auth_type = detect_auth(block)

        # Extract the upstream service name from proxy_pass
        service_name = extract_service_name(block)

        # Build a confidence score — lower if it looks unusual
        confidence = 0.9 if 'proxy_pass' in block else 0.6

        # Use create_endpoint from schema.py to build the record
        endpoint = create_endpoint(
          method="ANY",
          path=path,
          service_name=service_name,
          source="nginx_config",
          auth_detected=auth_detected,
          auth_type=auth_type,
          tags=["nginx"],
          raw_context=block[:200]
        )

        results.append(endpoint)

    return results


def detect_auth(block_content):
    """
    Look for auth-related keywords inside a location block.
    Returns (auth_detected: bool, auth_type: str)
    """
    block_lower = block_content.lower()

    if 'auth_jwt' in block_lower or 'auth_bearer' in block_lower:
        return True, "jwt"

    if 'auth_basic' in block_lower:
        return True, "basic"

    if 'auth_request' in block_lower:
        return True, "unknown"

    if 'proxy_set_header authorization' in block_lower:
        return True, "unknown"

    # No auth keywords found
    return False, "none"


def extract_service_name(block_content):
    """
    Pull the service name from a proxy_pass line.
    e.g. "proxy_pass http://user-service:8000" → "user-service"
    """
    match = re.search(
        r'proxy_pass\s+https?://([^:/;\s]+)',
        block_content
    )
    if match:
        return match.group(1)

    return "unknown"

if __name__ == "__main__":
    import json
    from scanner.schema import validate_endpoint
    from dataclasses import asdict

    print("Running Nginx parser test...\n")

    # Point to your test config file
    test_file = "test_files/test_nginx.conf"
    endpoints = parse_nginx_config(test_file)

    print(f"Found {len(endpoints)} endpoints:\n")

    for ep in endpoints:
        # Validate each one
        errors = validate_endpoint(ep)
        if errors:
            print(f"INVALID: {ep.path} — {errors}")
        else:
            print(f"OK: {ep.method} {ep.path}")
            print(f"   auth: {ep.auth_detected} ({ep.auth_type})")
            print(f"   service: {ep.service_name}")
            print()
    
    # Save output to a file for Member 2
    from scanner.schema import save_endpoints
    save_endpoints(endpoints, "output/sample_nginx_endpoints.json")
    print("Saved to output/sample_nginx_endpoints.json")