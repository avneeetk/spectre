import ast
import os
import sys
from pathlib import Path

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from scanner.schema import create_endpoint, validate_endpoint

def parse_python_routes(directory):
    """
    Walk a directory, find all .py files,
    extract FastAPI route definitions from each one.
    Returns a list of APIEndpoint objects.
    """
    results = []
    directory = Path(directory)

    # Walk through every .py file in the directory
    for py_file in directory.rglob("*.py"):

        # Skip __init__.py files — they never have routes
        if py_file.name == "__init__.py":
            continue

        try:
            with open(py_file, "r", encoding="utf-8") as f:
                source = f.read()

            # Parse the file into a syntax tree
            tree = ast.parse(source)

            # Extract routes from this file's tree
            file_routes = extract_routes(tree, str(py_file))
            results.extend(file_routes)

        except SyntaxError:
            # File has invalid Python syntax — skip it, don't crash
            print(f"  [ast_parser] Skipping {py_file} — syntax error")
            continue

        except UnicodeDecodeError:
            # File has encoding issues — skip it
            print(f"  [ast_parser] Skipping {py_file} — encoding error")
            continue

    return results

def extract_routes(tree, filepath):
    """
    Walk a parsed AST and find all FastAPI route decorators.
    Returns a list of APIEndpoint objects for this file.
    """
    routes = []
    filename = Path(filepath).stem  # e.g. "test_fastapi_service"

    # Walk every node in the entire tree
    for node in ast.walk(tree):

        # We only care about function definitions
        if not isinstance(node, ast.FunctionDef):
            continue

        # Check each decorator on this function
        for decorator in node.decorator_list:

            route_info = get_route_from_decorator(decorator)
            if not route_info:
                continue

            path, method = route_info

            # Check if this function uses auth
            auth_detected, auth_type = check_auth_in_function(node)

            endpoint = create_endpoint(
                method=method,
                path=path,
                service_name=filename,
                source="code_repository",
                auth_detected=auth_detected,
                auth_type=auth_type,
                tags=["python", "fastapi"],
                raw_context=f"File: {filepath} | Function: {node.name}"
            )

            routes.append(endpoint)

    return routes

def get_route_from_decorator(decorator):
    """
    Check if a decorator is a FastAPI route.
    Returns (path, method) if it is, None if it isn't.

    Handles: @app.get("/path"), @app.post("/path"),
             @router.get("/path"), etc.
    """
    # A route decorator looks like a function call: @app.get("/path")
    if not isinstance(decorator, ast.Call):
        return None

    func = decorator.func

    # It must be an attribute call: something.get, something.post, etc.
    if not isinstance(func, ast.Attribute):
        return None

    method = func.attr.upper()  # "get" → "GET"

    # Check it's an HTTP method we recognise
    valid_methods = {"GET", "POST", "PUT", "DELETE", "PATCH"}
    if method not in valid_methods:
        return None

    # The first argument is the path string: @app.get("/api/v1/users")
    if not decorator.args:
        return None

    path_node = decorator.args[0]

    # Must be a string constant
    if not isinstance(path_node, ast.Constant):
        return None

    path = path_node.value

    # Make sure it's actually a string (not a number or other constant)
    if not isinstance(path, str):
        return None

    return (path, method)

def check_auth_in_function(func_node):
    """
    Check if a function uses authentication.
    Looks for common auth patterns in function arguments.

    Returns (auth_detected: bool, auth_type: str)
    """
    # Keywords that suggest auth is being used
    auth_keywords = [
        "token", "auth", "credentials",
        "current_user", "oauth2_scheme",
        "api_key", "bearer", "jwt"
    ]

    # Check every argument name in the function signature
    for arg in func_node.args.args:
        arg_name = arg.arg.lower()
        if any(kw in arg_name for kw in auth_keywords):
            return True, "unknown"

    # Also check default values — Depends(oauth2_scheme) shows up here
    for default in func_node.args.defaults:
        # Depends(oauth2_scheme) is a Call node
        if isinstance(default, ast.Call):
            # Convert to string to check for auth keywords
            default_str = ast.dump(default).lower()
            if any(kw in default_str for kw in auth_keywords):
                return True, "unknown"

    return False, "none"

if __name__ == "__main__":
    from dataclasses import asdict
    import json

    print("Running AST parser test...\n")

    # Point at the test_files directory
    endpoints = parse_python_routes("test_files")

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
        # Save output
        from scanner.schema import save_endpoints
        save_endpoints(endpoints, "output/sample_ast_endpoints.json")