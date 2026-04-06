import yaml
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from scanner.schema import create_endpoint, validate_endpoint

def parse_kong_config(filepath):
    """
    Read a Kong declarative config YAML file.
    Returns a list of APIEndpoint objects.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    results = []

    # Kong config has a top-level "services" list
    services = config.get("services", [])

    for service in services:
        service_name = service.get("name", "unknown")

        # Check for auth plugins at the SERVICE level
        # If the service has jwt/oauth2/key-auth, ALL its routes inherit it
        service_plugins = [p["name"] for p in service.get("plugins", [])]
        service_has_auth, service_auth_type = detect_auth_from_plugins(service_plugins)

        # Now go through each route in this service
        routes = service.get("routes", [])

        for route in routes:
            paths = route.get("paths", ["/unknown"])
            methods = route.get("methods", ["ANY"])

            # Check for auth plugins at the ROUTE level too
            route_plugins = [p["name"] for p in route.get("plugins", [])]
            route_has_auth, route_auth_type = detect_auth_from_plugins(route_plugins)

            # Route-level auth overrides service-level
            if route_has_auth:
                auth_detected = True
                auth_type = route_auth_type
            elif service_has_auth:
                auth_detected = True
                auth_type = service_auth_type
            else:
                auth_detected = False
                auth_type = "none"

            # A route can have multiple paths and methods
            # Create one endpoint record per path+method combination
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