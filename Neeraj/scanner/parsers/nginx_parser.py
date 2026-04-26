import re
import sys
import os
import hashlib

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from scanner.schema import create_endpoint, validate_endpoint


def _extract_server_blocks(content):
    """
    Split an nginx config into (server_name, block_content) tuples.
    Handles multiple server blocks in a single file.
    Falls back to ("unknown", full_content) if no server blocks found.
    """
    results = []
    depth = 0
    in_server = False
    block_start = 0
    i = 0

    while i < len(content):
        if not in_server:
            if content[i:i+6] == 'server' and (i == 0 or not content[i-1].isalnum()):
                j = i + 6
                while j < len(content) and content[j] in ' \t\n\r':
                    j += 1
                if j < len(content) and content[j] == '{':
                    in_server = True
                    depth = 1
                    block_start = j + 1
                    i = j + 1
                    continue
        else:
            if content[i] == '{':
                depth += 1
            elif content[i] == '}':
                depth -= 1
                if depth == 0:
                    block_content = content[block_start:i]
                    sn_match = re.search(r'server_name\s+([^\s;]+)', block_content)
                    server_name = sn_match.group(1) if sn_match else "unknown"
                    results.append((server_name, block_content))
                    in_server = False
        i += 1

    # Fallback: no server blocks found, treat whole file as one block
    if not results:
        results.append(("unknown", content))

    return results


def parse_nginx_config(filepath):
    """
    Read an Nginx config file and return a list
    of APIEndpoint objects — one per location block.

    Fixes applied:
      1. Regex handles all 4 location modifier types: ~, ~*, =, ^~
      2. Group references updated to match new capture groups
      3. Modifier stored in tags (e.g. "location:~")
      4. server_name extracted per server block — used in ID to prevent
         collisions when multiple servers share the same path (e.g. "/")
      5. extract_service_name handles "set $upstream" pattern
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    server_blocks = _extract_server_blocks(content)
    results = []

    for server_name, block_content in server_blocks:
        # Fix 1: regex handles optional modifier + one level of nested braces
        pattern = r'location\s+(~\*?|=|\^\~)?\s*([^\s{]+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}'
        matches = re.finditer(pattern, block_content, re.DOTALL)

        for match in matches:
            # Fix 2: updated group references
            modifier     = match.group(1) or "exact"
            path         = match.group(2).strip()
            block        = match.group(3).strip()

            auth_detected, auth_type = detect_auth(block)
            service_name = extract_service_name(block)

            endpoint = create_endpoint(
                method="ANY",
                path=path,
                service_name=service_name,
                source="nginx_config",
                auth_detected=auth_detected,
                auth_type=auth_type,
                # Fix 3: modifier in tags
                tags=["nginx", f"location:{modifier}"],
                raw_context=block[:200]
            )

            # Fix 4: include server_name in ID to prevent collisions
            endpoint.id = hashlib.md5(f"{server_name}:{path}".encode()).hexdigest()[:12]

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

    return False, "none"


def extract_service_name(block_content):
    """
    Pull the service name from a proxy_pass line.
    Handles two patterns:
      Direct:   proxy_pass http://user-service:8000  -> "user-service"
      Variable: set $upstream campaign:9000;          -> "campaign"
                proxy_pass http://$upstream;
    """
    # Fix 5: handle "set $upstream host:port" pattern
    upstream_match = re.search(r'set\s+\$upstream\s+([^:/;\s]+)', block_content)
    if upstream_match:
        return upstream_match.group(1)

    # Original: direct proxy_pass URL
    direct_match = re.search(r'proxy_pass\s+https?://([^:/;\s]+)', block_content)
    if direct_match:
        return direct_match.group(1)

    return "unknown"


if __name__ == "__main__":
    import json
    from scanner.schema import validate_endpoint
    from dataclasses import asdict

    print("Running Nginx parser test...\n")

    test_file = "test_files/test_nginx.conf"
    endpoints = parse_nginx_config(test_file)

    print(f"Found {len(endpoints)} endpoints:\n")

    for ep in endpoints:
        errors = validate_endpoint(ep)
        if errors:
            print(f"INVALID: {ep.path} — {errors}")
        else:
            print(f"OK: {ep.method} {ep.path}")
            print(f"   auth: {ep.auth_detected} ({ep.auth_type})")
            print(f"   service: {ep.service_name}")
            print(f"   tags: {ep.tags}")
            print()

    from scanner.schema import save_endpoints
    save_endpoints(endpoints, "output/sample_nginx_endpoints.json")
    print("Saved to output/sample_nginx_endpoints.json")