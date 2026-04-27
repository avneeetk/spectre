import yaml
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from scanner.schema import create_endpoint, validate_endpoint


def parse_kong_config(filepath):
    """
    Read a Kong declarative config YAML file.
    Returns a list of APIEndpoint objects.

    Fixes applied:
      1. _format_version guard : rejects non-Kong YAMLs (e.g. docker-compose)
         before trying to parse them, preventing false positives on real repos
      2. Global plugins handled : top-level plugins list is now checked and
         applied to all routes, same as service/route-level auth inheritance
    """
    with open(filepath, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Fix 1: guard against non-Kong YAML files
    # Kong declarative configs always have _format_version at the top level.
    # Without this, docker-compose.yml and other YAMLs with a "services" key
    # would be silently parsed and produce garbage endpoints.
    if not isinstance(config, dict):
        return []
    if "_format_version" not in config:
        return []

    results = []

    # Fix 2: check global plugins, these apply to every route in the file
    global_plugins = [p["name"] for p in config.get("plugins", [])]
    global_has_auth, global_auth_type = detect_auth_from_plugins(global_plugins)

    services = config.get("services", [])

    for service in services:
        service_name = service.get("name", "unknown")

        # Service-level plugins apply to all routes under this service
        service_plugins = [p["name"] for p in service.get("plugins", [])]
        service_has_auth, service_auth_type = detect_auth_from_plugins(service_plugins)

        routes = service.get("routes", [])

        for route in routes:
            paths = route.get("paths", ["/unknown"])
            methods = route.get("methods", ["ANY"])

            # Route-level plugins are most specific
            route_plugins = [p["name"] for p in route.get("plugins", [])]
            route_has_auth, route_auth_type = detect_auth_from_plugins(route_plugins)

            # Priority: route > service > global
            if route_has_auth:
                auth_detected, auth_type = True, route_auth_type
            elif service_has_auth:
                auth_detected, auth_type = True, service_auth_type
            elif global_has_auth:
                auth_detected, auth_type = True, global_auth_type
            else:
                auth_detected, auth_type = False, "none"

            for path in paths:
                for method in methods:
                    endpoint = create_endpoint(
                        method=method,
                        path=path,
                        service_name=service_name,
                        source="kong_gateway",
                        auth_detected=auth_detected,
                        auth_type=auth_type,
                        tags=["kong"],
                        raw_context=f"Service: {service_name} | Route: {route.get('name', 'unnamed')}"
                    )
                    results.append(endpoint)

    return results


def detect_auth_from_plugins(plugin_names):
    """
    Given a list of Kong plugin names, detect if any are auth plugins.
    Returns (auth_detected: bool, auth_type: str)
    """
    for plugin in plugin_names:
        plugin = plugin.lower()

        if plugin in ("jwt", "oauth2-introspection"):
            return True, "jwt"

        if plugin in ("basic-auth",):
            return True, "basic"

        if plugin in ("key-auth", "key-authentication"):
            return True, "api_key"

        if plugin in ("oauth2",):
            return True, "oauth2"

    return False, "none"


if __name__ == "__main__":
    from dataclasses import asdict
    import json

    print("Running Kong parser test...\n")

    endpoints = parse_kong_config("test_files/test_kong.yml")

    print(f"Found {len(endpoints)} endpoints:\n")

    all_valid = True
    for ep in endpoints:
        errors = validate_endpoint(ep)
        if errors:
            all_valid = False
            print(f"INVALID: {ep.method} {ep.path} — {errors}")
        else:
            print(f"OK: {ep.method} {ep.path}")
            print(f"   auth: {ep.auth_detected} ({ep.auth_type})")
            print(f"   service: {ep.service_name}")
            print()

    if all_valid:
        from scanner.schema import save_endpoints
        save_endpoints(endpoints, "output/sample_kong_endpoints.json")
