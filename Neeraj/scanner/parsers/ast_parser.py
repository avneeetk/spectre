import ast
import os
import sys
from pathlib import Path

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from scanner.schema import create_endpoint, validate_endpoint


def parse_python_routes(directory):
    """
    Walk a directory, find all .py files, and extract route definitions.
    Supports FastAPI and Flask.
    Returns a list of APIEndpoint objects.
    """
    results = []
    directory = Path(directory)

    for py_file in directory.rglob("*.py"):
        if py_file.name == "__init__.py":
            continue

        try:
            with open(py_file, "r", encoding="utf-8") as f:
                source = f.read()

            tree = ast.parse(source)
            file_routes = extract_routes(tree, str(py_file))
            results.extend(file_routes)

        except SyntaxError:
            print(f"  [ast_parser] Skipping {py_file} — syntax error")
            continue

        except UnicodeDecodeError:
            print(f"  [ast_parser] Skipping {py_file} — encoding error")
            continue

    return results


def extract_routes(tree, filepath):
    """
    Walk a parsed AST and find all route decorators.
    Handles both FastAPI and Flask patterns.
    Returns a list of APIEndpoint objects for this file.
    """
    routes = []
    filename = Path(filepath).stem

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        for decorator in node.decorator_list:
            route_info = get_route_from_decorator(decorator)
            if not route_info:
                continue

            path, methods, framework = route_info
            auth_detected, auth_type = check_auth_in_function(node)

            for method in methods:
                endpoint = create_endpoint(
                    method=method,
                    path=path,
                    service_name=filename,
                    source="code_repository",
                    auth_detected=auth_detected,
                    auth_type=auth_type,
                    tags=["python", framework],
                    raw_context=f"File: {filepath} | Function: {node.name}"
                )
                routes.append(endpoint)

    return routes


def get_route_from_decorator(decorator):
    """
    Check if a decorator is a FastAPI or Flask route.

    FastAPI:  @app.get("/path"), @router.post("/path")
              → returns (path, ["GET"], "fastapi")

    Flask:    @app.route("/path", methods=["GET", "POST"])
              → returns (path, ["GET", "POST"], "flask")
              @app.route("/path")           (no methods → defaults to GET)
              → returns (path, ["GET"], "flask")

    Returns (path, [methods], framework) or None.
    """
    if not isinstance(decorator, ast.Call):
        return None

    func = decorator.func
    if not isinstance(func, ast.Attribute):
        return None

    attr = func.attr.upper()
    valid_methods = {"GET", "POST", "PUT", "DELETE", "PATCH"}

    # --- FastAPI: @app.get("/path"), @router.delete("/path"), etc. ---
    if attr in valid_methods:
        if not decorator.args:
            return None
        path_node = decorator.args[0]
        if not isinstance(path_node, ast.Constant) or not isinstance(path_node.value, str):
            return None
        return (path_node.value, [attr], "fastapi")

    # --- Flask: @app.route("/path", methods=["GET", "POST"]) ---
    if attr == "ROUTE":
        if not decorator.args:
            return None
        path_node = decorator.args[0]
        if not isinstance(path_node, ast.Constant) or not isinstance(path_node.value, str):
            return None

        path = path_node.value
        methods = ["GET"]  # Flask default when methods= is omitted

        # Look for methods= keyword argument
        for kw in decorator.keywords:
            if kw.arg == "methods" and isinstance(kw.value, ast.List):
                extracted = []
                for elt in kw.value.elts:
                    if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                        m = elt.value.upper()
                        if m in valid_methods:
                            extracted.append(m)
                if extracted:
                    methods = extracted

        return (path, methods, "flask")

    return None


def check_auth_in_function(func_node):
    """
    Check if a function uses authentication.
    Looks for common auth patterns in function arguments and decorators.
    Returns (auth_detected: bool, auth_type: str)
    """
    auth_keywords = [
        "token", "auth", "credentials",
        "current_user", "oauth2_scheme",
        "api_key", "bearer", "jwt"
    ]

    # Check argument names
    for arg in func_node.args.args:
        if any(kw in arg.arg.lower() for kw in auth_keywords):
            return True, "unknown"

    # Check default values — catches Depends(oauth2_scheme)
    for default in func_node.args.defaults:
        if isinstance(default, ast.Call):
            if any(kw in ast.dump(default).lower() for kw in auth_keywords):
                return True, "unknown"

    # Check decorators — catches @require_token, @login_required, @jwt_required
    auth_decorator_keywords = [
        "token", "auth", "login_required",
        "jwt_required", "require"
    ]
    for decorator in func_node.decorator_list:
        decorator_str = ast.dump(decorator).lower()
        if any(kw in decorator_str for kw in auth_decorator_keywords):
            return True, "unknown"

    return False, "none"


if __name__ == "__main__":
    from dataclasses import asdict
    import json

    print("Running AST parser test...\n")

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
            print(f"   tags: {ep.tags}")
            print()

    if all_valid:
        from scanner.schema import save_endpoints
        save_endpoints(endpoints, "output/sample_ast_endpoints.json")
