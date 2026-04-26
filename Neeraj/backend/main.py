"""
backend/main.py — SPECTRE Discovery Engine API
================================================
FastAPI wrapper around the scanner module.
Exposes the scanner over HTTP so the dashboard can call it.

Endpoints:
  GET  /ping            → wake-up check, returns {"status": "ok"}
  POST /scan/sample     → runs real parsers on bundled test files
  POST /scan/github     → scans a public GitHub repo URL (non-interactive)
  POST /scan/upload     → runs real parsers on user-uploaded files

Note on classification:
  This module returns raw scanner output with state="unknown" on all endpoints.
  Gurleen's classifier is responsible for setting state, owasp_flags,
  and risk_reason.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dataclasses import asdict
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
import tempfile
import shutil
import json
import sys
import os

# Add root to path so we can import scanner modules
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from scanner.parsers.nginx_parser import parse_nginx_config
from scanner.parsers.kong_parser import parse_kong_config
from scanner.parsers.ast_parser import parse_python_routes
from scanner.schema import merge_endpoint
from scanner.resolvers.github_resolver import resolve_github_repo_api

app = FastAPI(
    title="SPECTRE Discovery Engine",
    description="Finds every API endpoint — including shadow APIs",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Avneet: restrict this to your frontend domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths to bundled sample files
SAMPLE_DIR   = ROOT / "test_files"
SAMPLE_NGINX = SAMPLE_DIR / "test_nginx.conf"
SAMPLE_KONG  = SAMPLE_DIR / "test_kong.yml"
SAMPLE_PY    = SAMPLE_DIR
SAMPLE_TRAFFIC_LOG = ROOT / "test_files" / "traffic_log.json"


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def merge_into(existing: dict, new_eps: list, source: str) -> int:
    """
    Merge new endpoints into existing dict, deduplicating by ID.
    Returns count of brand new endpoints added.
    """
    new_count = 0
    for ep in new_eps:
        if ep.id not in existing:
            existing[ep.id] = ep
            new_count += 1
        else:
            merge_endpoint(existing[ep.id], source)
    return new_count


def build_response(all_endpoints: dict, traffic_eps: list = None) -> dict:
    """
    Convert merged endpoint dict into a clean JSON-serializable response.
    Returns raw scanner output — state is "unknown" on everything.
    Classification is Member 2's responsibility.
    """
    result = [asdict(ep) for ep in all_endpoints.values()]

    if traffic_eps:
        result.extend(traffic_eps)

    total = len(result)
    sources_seen = set()
    for e in result:
        sources_seen.update(e.get("sources", []))

    # Count shadow APIs — endpoints seen in traffic but not in any config or repo
    shadows = sum(
        1 for e in result
        if e.get("seen_in_traffic") and not e.get("in_gateway") and not e.get("in_repo")
    )

    no_auth = sum(1 for e in result if not e.get("auth_detected"))

    return {
        "total": total,
        "shadow_count": shadows,
        "no_auth_count": no_auth,
        "sources_scanned": len(sources_seen),
        "endpoints": result
    }


# ─────────────────────────────────────────────
# GET /ping — wake-up check
# ─────────────────────────────────────────────

@app.get("/ping")
def ping():
    return {"status": "ok", "service": "SPECTRE Discovery Engine"}


# ─────────────────────────────────────────────
# POST /scan/sample — run on bundled test files
# ─────────────────────────────────────────────

@app.post("/scan/sample")
def scan_sample():
    """
    Run the real parsers on the bundled test files in test_files/.
    No hardcoded data — everything comes from actual parser output.
    """
    all_endpoints = {}
    errors = []

    try:
        if SAMPLE_NGINX.exists():
            eps = parse_nginx_config(str(SAMPLE_NGINX))
            merge_into(all_endpoints, eps, "nginx_config")
    except Exception as e:
        errors.append(f"Nginx parser: {str(e)}")

    try:
        if SAMPLE_KONG.exists():
            eps = parse_kong_config(str(SAMPLE_KONG))
            merge_into(all_endpoints, eps, "kong_gateway")
    except Exception as e:
        errors.append(f"Kong parser: {str(e)}")

    try:
        if SAMPLE_PY.exists():
            eps = parse_python_routes(str(SAMPLE_PY))
            merge_into(all_endpoints, eps, "code_repository")
    except Exception as e:
        errors.append(f"AST parser: {str(e)}")

    # Traffic log priority:
    # 1. output/traffic_log.json — real mitmproxy capture (2 shadow APIs)
    # 2. test_files/traffic_log.json — sample fallback (1 shadow API)
    traffic_eps = []
    real_log = ROOT / "output" / "traffic_log.json"

    if real_log.exists() and real_log.stat().st_size > 2:
        source_used = "network env sample"
        log_path = real_log
    elif SAMPLE_TRAFFIC_LOG.exists():
        source_used = "hardcoded sample"
        log_path = SAMPLE_TRAFFIC_LOG
    else:
        source_used = None
        log_path = None

    if log_path:
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                traffic_eps = list(data.values())
            elif isinstance(data, list):
                traffic_eps = data
        except Exception as e:
            errors.append(f"Traffic log ({source_used}): {str(e)}")

    response = build_response(all_endpoints, traffic_eps)
    response["traffic_source"] = source_used  # "network env sample", "hardcoded sample", or None
    if errors:
        response["warnings"] = errors

    return JSONResponse(response)


# ─────────────────────────────────────────────
# POST /scan/github — scan a public GitHub repo (non-interactive)
# ─────────────────────────────────────────────

class ScanGithubRequest(BaseModel):
    repo_url: str
    github_token: Optional[str] = None
    auto_confirm: bool = True
    max_total_files: int = 20
    max_per_type: int = 8


@app.post("/scan/github")
def scan_github(req: ScanGithubRequest):
    """
    Scan a public GitHub repo URL without any interactive prompts.
    This uses the same GitHub resolver logic as the CLI, but auto-selects files.

    Important:
      - No fallback to sample files (otherwise results get "contaminated").
      - Traffic logs are not available from GitHub scanning.
    """
    config = resolve_github_repo_api(
        req.repo_url,
        github_token=req.github_token,
        auto_confirm=req.auto_confirm,
        max_total_files=req.max_total_files,
        max_per_type=req.max_per_type,
    )

    if config is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Repo scan found no scannable files or downloads failed. "
                "Currently supported discovery inputs are: Nginx proxy_pass (*.conf), "
                "Kong gateway (_format_version in *.yml/*.yaml), and Python route files "
                "(@app.get/@app.post/@router.get)."
            ),
        )

    tmpdir = config.get("tmpdir")
    if not tmpdir:
        raise HTTPException(status_code=500, detail="GitHub resolver returned no tmpdir")

    all_endpoints: dict = {}
    errors: list[str] = []

    try:
        for path in config.get("nginx_configs", []) or []:
            try:
                eps = parse_nginx_config(str(path))
                merge_into(all_endpoints, eps, "nginx_config")
            except Exception as e:
                errors.append(f"Nginx parser ({path}): {str(e)}")

        for path in config.get("kong_configs", []) or []:
            try:
                eps = parse_kong_config(str(path))
                merge_into(all_endpoints, eps, "kong_gateway")
            except Exception as e:
                errors.append(f"Kong parser ({path}): {str(e)}")

        for repo_dir in config.get("python_repos", []) or []:
            try:
                eps = parse_python_routes(str(repo_dir))
                merge_into(all_endpoints, eps, "code_repository")
            except Exception as e:
                errors.append(f"AST parser ({repo_dir}): {str(e)}")

        response = build_response(all_endpoints, traffic_eps=None)
        response["traffic_source"] = None
        response["repo_url"] = req.repo_url
        response["repo_files"] = {
            "nginx_configs": config.get("nginx_configs", []),
            "kong_configs": config.get("kong_configs", []),
            "python_repos": config.get("python_repos", []),
        }
        if errors:
            response["warnings"] = errors

        return JSONResponse(response)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ─────────────────────────────────────────────
# POST /scan/upload — run on user-uploaded files
# ─────────────────────────────────────────────

@app.post("/scan/upload")
async def scan_upload(
    nginx:   Optional[UploadFile] = File(None),
    kong:    Optional[UploadFile] = File(None),
    py:      Optional[UploadFile] = File(None),
    traffic: Optional[UploadFile] = File(None),
):
    """
    Accept uploaded config files and run the real parsers on them.
    Falls back to sample files for any source not provided.
    Traffic log is only included if explicitly uploaded — no planted data.
    """
    all_endpoints = {}
    errors = []
    tmpdir = tempfile.mkdtemp()

    try:
        # ── Nginx ──────────────────────────────────────────────
        if nginx and nginx.filename:
            try:
                nginx_path = os.path.join(tmpdir, "nginx.conf")
                with open(nginx_path, "wb") as f:
                    f.write(await nginx.read())
                eps = parse_nginx_config(nginx_path)
                merge_into(all_endpoints, eps, "nginx_config")
            except Exception as e:
                errors.append(f"Nginx parse failed: {str(e)}")
        else:
            try:
                eps = parse_nginx_config(str(SAMPLE_NGINX))
                merge_into(all_endpoints, eps, "nginx_config")
            except Exception:
                pass

        # ── Kong ───────────────────────────────────────────────
        if kong and kong.filename:
            try:
                kong_path = os.path.join(tmpdir, "kong.yml")
                with open(kong_path, "wb") as f:
                    f.write(await kong.read())
                eps = parse_kong_config(kong_path)
                merge_into(all_endpoints, eps, "kong_gateway")
            except Exception as e:
                errors.append(f"Kong parse failed: {str(e)}")
        else:
            try:
                eps = parse_kong_config(str(SAMPLE_KONG))
                merge_into(all_endpoints, eps, "kong_gateway")
            except Exception:
                pass

        # ── Python file ────────────────────────────────────────
        if py and py.filename:
            try:
                py_dir = os.path.join(tmpdir, "pyfiles")
                os.makedirs(py_dir, exist_ok=True)
                py_path = os.path.join(py_dir, py.filename)
                with open(py_path, "wb") as f:
                    f.write(await py.read())
                eps = parse_python_routes(py_dir)
                merge_into(all_endpoints, eps, "code_repository")
            except Exception as e:
                errors.append(f"AST parse failed: {str(e)}")

        # ── Traffic log ────────────────────────────────────────
        # Only included if uploaded — no fallback, no planted data
        traffic_eps = []
        if traffic and traffic.filename:
            try:
                content = await traffic.read()
                traffic_data = json.loads(content)
                if isinstance(traffic_data, dict):
                    traffic_eps = list(traffic_data.values())
                elif isinstance(traffic_data, list):
                    traffic_eps = traffic_data
            except Exception as e:
                errors.append(f"Traffic log parse failed: {str(e)}")

        response = build_response(all_endpoints, traffic_eps)
        if errors:
            response["warnings"] = errors

        return JSONResponse(response)

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
