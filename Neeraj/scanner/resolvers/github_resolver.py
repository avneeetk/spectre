"""
scanner/resolvers/github_resolver.py - SPECTRE GitHub Resolver
===============================================================
Accepts a public GitHub repo URL, searches for nginx/kong/python
files using the GitHub API, asks for user confirmation per file,
downloads confirmed files to a temp directory, and returns paths
ready for the existing parsers.

Usage (called from scanner/main.py):
    from scanner.resolvers.github_resolver import resolve_github_repo
    result = resolve_github_repo()
    # result is a dict with keys: nginx_configs, kong_configs, python_repos, tmpdir
    # Pass result into run_scanner(config) - same shape as SCAN_CONFIG

Token:
    Reads GITHUB_TOKEN from .env automatically.
    Falls back to anonymous if not set (lower rate limits).
"""

import os
import re
import sys
import time
import tempfile
import requests
from pathlib import Path

# Loading .env manually, no external dependency needed
def _load_env():
    env_path = Path(__file__).parent.parent.parent / ".env"
    if not env_path.exists():
        return
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

_load_env()


# ---------------------------------------------------------------------------
# GitHub API helpers
# ---------------------------------------------------------------------------

GITHUB_API = "https://api.github.com"

def _headers():
    token = os.environ.get("GITHUB_TOKEN")
    h = {"Accept": "application/vnd.github+json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _parse_repo_url(url):
    """
    Extract owner and repo name from a GitHub URL.
    Handles:
      https://github.com/owner/repo
      https://github.com/owner/repo.git
      github.com/owner/repo
    Returns (owner, repo) or raises ValueError.
    """
    url = url.strip().rstrip("/")
    match = re.search(r"github\.com[/:]([^/]+)/([^/]+?)(?:\.git)?$", url)
    if not match:
        raise ValueError(f"Could not parse GitHub URL: {url}")
    return match.group(1), match.group(2)


def _check_repo_exists(owner, repo):
    """Return True if the repo is accessible, False otherwise."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}"
    r = requests.get(url, headers=_headers(), timeout=10)
    return r.status_code == 200


def _search_code(owner, repo, query):
    """
    Search for files in a repo using GitHub code search.
    Returns a list of dicts with: path, download_url, html_url
    """
    # GitHub code search requires: query + repo filter
    full_query = f"{query} repo:{owner}/{repo}"
    url = f"{GITHUB_API}/search/code"
    params = {"q": full_query, "per_page": 10}

    r = requests.get(url, headers=_headers(), params=params, timeout=15)

    if r.status_code == 403:
        print("  [github] Rate limit hit. Wait a minute or add a GITHUB_TOKEN to .env")
        return []
    if r.status_code == 422:
        # Repo too new or empty - search index not ready
        return []
    if r.status_code != 200:
        print(f"  [github] Search failed ({r.status_code}): {r.json().get('message', '')}")
        return []

    items = r.json().get("items", [])
    print(f"    → {len(items)} result(s)")
    results = []
    for item in items:
        results.append({
            "path": item["path"],
            "download_url": item.get("url"),   # API URL - we'll use contents API
            "html_url": item.get("html_url"),
        })
    return results


def _get_file_content(owner, repo, path):
    """
    Download raw content of a single file from the repo.
    Returns the content as a string, or None on failure.
    """
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
    r = requests.get(url, headers=_headers(), timeout=15)

    if r.status_code != 200:
        print(f"  [github] Could not download {path} ({r.status_code})")
        return None

    data = r.json()

    # GitHub returns base64-encoded content
    import base64
    if data.get("encoding") == "base64":
        try:
            return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        except Exception as e:
            print(f"  [github] Decode error for {path}: {e}")
            return None

    return None


# ---------------------------------------------------------------------------
# File discovery : searches for each file type
# ---------------------------------------------------------------------------

# Each entry: (label, search_query, file_type)
# file_type is used to route files to the right parser later
FILE_SEARCHES = [
    (
        "Nginx config (nginx.conf)",           
        "proxy_pass filename:nginx.conf",   
        "nginx"
    ),
    (
        "Nginx config (default.conf)",           
        "proxy_pass filename:default.conf",  
        "nginx"
    ),
    (
        "Kong config (yaml)",            
        "_format_version filename:kong.yaml", 
        "kong"
    ),
    (
        "Kong config (yml)",            
        "_format_version filename:kong.yml",  
        "kong"
    ),
    (
        "Python routes (app)",    
        "@app.get language:python",          
        "python"
    ),
    (
        "Python routes (router)", 
        "@router.get language:python",       
        "python"
    ),
]


def _discover_files(owner, repo):
    """
    Run all searches against the repo.
    Returns a list of candidate dicts:
      { path, file_type, label }
    Deduplicates by path.
    """
    print(f"\n[github] Searching {owner}/{repo} for API-related files...")

    # GitHub code search has a small rate limit, adding a pause between queries
    candidates = []
    seen_paths = set()

    for label, query, file_type in FILE_SEARCHES:
        print(f"  Searching for {label} files...")
        results = _search_code(owner, repo, query)

        for r in results:
            if r["path"] not in seen_paths:
                seen_paths.add(r["path"])
                candidates.append({
                    "path": r["path"],
                    "file_type": file_type,
                    "label": label,
                })

        # Small pause to avoid hammering the search API
        time.sleep(1)

    return candidates


# ---------------------------------------------------------------------------
# User confirmation : ask Y/N per file
# ---------------------------------------------------------------------------

def _ask_confirmation(candidates):
    """
    Show each candidate file and ask the user Y/N.
    Returns only the confirmed files.
    """
    if not candidates:
        return []

    print(f"\n[github] Found {len(candidates)} candidate file(s):\n")

    confirmed = []

    for candidate in candidates:
        file_type_label = candidate["label"]
        path = candidate["path"]

        while True:
            answer = input(f"  Scan {path} ({file_type_label})? [Y/N]: ").strip().lower()
            if answer in ("y", "yes"):
                confirmed.append(candidate)
                print(f"  ✓ Added")
                break
            elif answer in ("n", "no"):
                print(f"  ✗ Skipped")
                break
            else:
                print("  Please enter Y or N")

    return confirmed


# ---------------------------------------------------------------------------
# Download confirmed files to a temp directory
# ---------------------------------------------------------------------------

def _download_files(owner, repo, confirmed, tmpdir):
    """
    Download each confirmed file into tmpdir.
    Returns a structured dict ready for run_scanner():
      {
        nginx_configs: [...paths...],
        kong_configs:  [...paths...],
        python_repos:  [...dirs...],
        tmpdir:        path (caller must clean up)
      }
    """
    nginx_configs = []
    kong_configs  = []
    py_dir        = os.path.join(tmpdir, "pyfiles")

    has_python = any(c["file_type"] == "python" for c in confirmed)
    if has_python:
        os.makedirs(py_dir, exist_ok=True)

    print(f"\n[github] Downloading {len(confirmed)} confirmed file(s)...")

    for candidate in confirmed:
        path      = candidate["path"]
        file_type = candidate["file_type"]
        filename  = Path(path).name

        content = _get_file_content(owner, repo, path)
        if content is None:
            print(f"  ✗ Failed to download {path}")
            continue

        if file_type == "nginx":
            local_path = os.path.join(tmpdir, filename)
            with open(local_path, "w", encoding="utf-8") as f:
                f.write(content)
            nginx_configs.append(local_path)
            print(f"  ✓ {path}")

        elif file_type == "kong":
            local_path = os.path.join(tmpdir, filename)
            with open(local_path, "w", encoding="utf-8") as f:
                f.write(content)
            kong_configs.append(local_path)
            print(f"  ✓ {path}")

        elif file_type == "python":
            local_path = os.path.join(py_dir, filename)
            with open(local_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"  ✓ {path}")

        time.sleep(0.3)  # polite pause between downloads

    result = {
        "nginx_configs": nginx_configs,
        "kong_configs":  kong_configs,
        "python_repos":  [py_dir] if has_python and os.listdir(py_dir) else [],
        "traffic_log":   None,   # traffic is never available from a repo
        "tmpdir":        tmpdir,
    }

    return result


# ---------------------------------------------------------------------------
# Main entry point : called from scanner/main.py
# ---------------------------------------------------------------------------

def resolve_github_repo():
    """
    Interactive flow:
      1. Ask for a GitHub repo URL (with retry on bad URL / repo not found)
      2. Discover candidate files
      3. Ask Y/N per file
      4. Download confirmed files to a temp dir
      5. Return a config dict shaped like SCAN_CONFIG

    Return values:
      dict  -- success, caller scans this config
      None  -- user deliberately exited (typed 'exit' or confirmed no files)

    Caller is responsible for cleaning up result["tmpdir"] after scanning.
    """
    print("\n" + "─" * 50)
    print("  GitHub Repo Scanner")
    print("─" * 50)
    print("  (type 'exit' at any prompt to cancel)\n")

    owner, repo = None, None

    while True:
        url = input("Enter public GitHub repo URL: ").strip()

        if not url:
            print("  Please enter a URL, or type 'exit' to cancel.\n")
            continue

        if url.lower() == "exit":
            print("[github] Cancelled.")
            return None

        try:
            owner, repo = _parse_repo_url(url)
        except ValueError:
            print(f"  ✗ That does not look like a valid GitHub URL.")
            print(f"    Expected format: https://github.com/owner/repo\n")
            continue

        print(f"\n[github] Checking {owner}/{repo}...")
        if not _check_repo_exists(owner, repo):
            print(f"  ✗ Repo not found or not public: github.com/{owner}/{repo}")
            print(f"    Check the URL and make sure the repo is public.\n")
            owner, repo = None, None
            continue

        print(f"  ✓ Repo found\n")
        break

    candidates = _discover_files(owner, repo)

    if not candidates:
        print("\n[github] No nginx, Kong, or Python route files found in this repo.")
        print("         The repo may use a different stack or the search index may not be ready.")
        return None

    confirmed = _ask_confirmation(candidates)

    if not confirmed:
        print("\n[github] No files confirmed. Exiting GitHub scanner.")
        return None

    tmpdir = tempfile.mkdtemp(prefix="spectre_github_")
    config = _download_files(owner, repo, confirmed, tmpdir)

    total = (
        len(config["nginx_configs"]) +
        len(config["kong_configs"])  +
        len(config["python_repos"])
    )

    if total == 0:
        print("\n[github] All downloads failed.")
        return None

    print(f"\n[github] Ready to scan:")
    if config["nginx_configs"]:
        print(f"  Nginx configs : {len(config['nginx_configs'])} file(s)")
    if config["kong_configs"]:
        print(f"  Kong configs  : {len(config['kong_configs'])} file(s)")
    if config["python_repos"]:
        print(f"  Python files  : ready")
    print(f"  Traffic log   : not available from repo (skipped)")

    return config