"""
main.py : SPECTRE Scanner Entry Point

Runs all parsers and combines their output into one file:
    output/discovered_endpoints.json

This file is the handoff to Member 2.

Usage:
    python scanner/main.py
"""

import json
import os
import sys
from pathlib import Path
from dataclasses import asdict

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scanner.schema import (
    load_endpoints,
    save_endpoints,
    validate_all,
    merge_endpoint,
    APIEndpoint,
)
from scanner.parsers.nginx_parser import parse_nginx_config
from scanner.parsers.ast_parser import parse_python_routes
from scanner.parsers.kong_parser import parse_kong_config
from scanner.resolvers.github_resolver import resolve_github_repo


# ---------------------------------------------------------------------------
# Config : tells the scanner where to look
# Change these paths to point at real services when Member 4 has Docker ready
# ---------------------------------------------------------------------------

SCAN_CONFIG = {
    "nginx_configs": [
        "test_files/test_nginx.conf",
    ],
    "kong_configs": [
        "test_files/test_kong.yml",
    ],
    "python_repos": [
        "test_files",
    ],
    "traffic_log": "output/traffic_log.json",
}

OUTPUT_FILE = "output/discovered_endpoints.json"


# ---------------------------------------------------------------------------
# Main scanner logic
# ---------------------------------------------------------------------------

def run_scanner(config):
    """
    Run all parsers, merge results, validate, and save.
    Returns the final list of APIEndpoint objects.
    """
    # This dict holds all endpoints, keyed by ID
    # Using a dict means we automatically deduplicate by ID
    all_endpoints = {}

    # ------------------------------------------------------------------
    # 1. Nginx configs
    # ------------------------------------------------------------------
    print("\n[scanner] Running Nginx parser...")
    for filepath in config.get("nginx_configs", []):
        if not Path(filepath).exists():
            print(f"  Skipping {filepath} - file not found")
            continue
        endpoints = parse_nginx_config(filepath)
        count = merge_into(all_endpoints, endpoints, "nginx_config")
        print(f"  {filepath} → {len(endpoints)} found, {count} new")

    # ------------------------------------------------------------------
    # 2. Kong configs
    # ------------------------------------------------------------------
    print("\n[scanner] Running Kong parser...")
    for filepath in config.get("kong_configs", []):
        if not Path(filepath).exists():
            print(f"  Skipping {filepath} - file not found")
            continue
        endpoints = parse_kong_config(filepath)
        count = merge_into(all_endpoints, endpoints, "kong_gateway")
        print(f"  {filepath} → {len(endpoints)} found, {count} new")

    # ------------------------------------------------------------------
    # 3. Python code repos
    # ------------------------------------------------------------------
    print("\n[scanner] Running AST parser...")
    for dirpath in config.get("python_repos", []):
        if not Path(dirpath).exists():
            print(f"  Skipping {dirpath} - directory not found")
            continue
        endpoints = parse_python_routes(dirpath)
        count = merge_into(all_endpoints, endpoints, "code_repository")
        print(f"  {dirpath} → {len(endpoints)} found, {count} new")

    # ------------------------------------------------------------------
    # 4. Traffic log from mitmproxy
    # ------------------------------------------------------------------
    print("\n[scanner] Loading traffic log...")
    traffic_log_path = config.get("traffic_log")
    if traffic_log_path and Path(traffic_log_path).exists():
        with open(traffic_log_path, "r", encoding="utf-8") as f:
            traffic_data = json.load(f)

        traffic_endpoints = [APIEndpoint(**ep) for ep in traffic_data.values()]
        count = merge_into(all_endpoints, traffic_endpoints, "network_traffic")
        print(f"  traffic_log.json → {len(traffic_endpoints)} observed, {count} new")
    else:
        print("  No traffic log found - skipping")

    # ------------------------------------------------------------------
    # 5. Validate and save
    # ------------------------------------------------------------------
    final_list = list(all_endpoints.values())

    print(f"\n[scanner] Total unique endpoints found: {len(final_list)}")
    print("\n[scanner] Validating...")

    valid = validate_all(final_list)
    if not valid:
        print("\n[scanner] WARNING: Some endpoints failed validation.")
        print("          Fix the errors above before handing off to Member 2.")

    save_endpoints(final_list, OUTPUT_FILE)

    print(f"\n[scanner] Done. Output saved to {OUTPUT_FILE}")

    return final_list


def merge_into(existing_dict, new_endpoints, source):
    """
    Merge a list of new endpoints into the existing dict.
    If an endpoint already exists (same ID), call merge_endpoint()
    to update its source flags instead of creating a duplicate.

    Returns the count of brand new endpoints added.
    """
    new_count = 0

    for ep in new_endpoints:
        if ep.id not in existing_dict:
            # Brand new endpoint
            existing_dict[ep.id] = ep
            new_count += 1
        else:
            # Already seen from another source - merge
            merge_endpoint(existing_dict[ep.id], source)

    return new_count


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import shutil

    print("=" * 50)
    print("  SPECTRE : API Discovery Scanner")
    print("=" * 50)

    # ------------------------------------------------------------------
    # Ask whether to scan a GitHub repo or use local files
    # ------------------------------------------------------------------
    github_tmpdir = None

    while True:
        answer = input("\nDo you want to scan a public GitHub repo? [Y/N]: ").strip().lower()
        if answer in ("y", "yes"):
            use_github = True
            break
        elif answer in ("n", "no"):
            use_github = False
            break
        else:
            print("Please enter Y or N")

    if use_github:
        github_config = resolve_github_repo()

        if github_config is None:
            # User exited the GitHub flow (typed exit, no files confirmed,
            # or repo had no matching files). Ask whether to run locally instead.
            print()
            while True:
                fallback = input("Run on local test files instead? [Y/N]: ").strip().lower()
                if fallback in ("y", "yes"):
                    config = SCAN_CONFIG
                    break
                elif fallback in ("n", "no"):
                    print("[scanner] Exiting.")
                    sys.exit(0)
                else:
                    print("Please enter Y or N")
        else:
            github_tmpdir = github_config.pop("tmpdir")  # hold for cleanup
            config = github_config
    else:
        config = SCAN_CONFIG

    # ------------------------------------------------------------------
    # Run the scanner with whichever config was chosen
    # ------------------------------------------------------------------
    results = run_scanner(config)

    # ------------------------------------------------------------------
    # Clean up temp files if we downloaded from GitHub
    # ------------------------------------------------------------------
    if github_tmpdir:
        shutil.rmtree(github_tmpdir, ignore_errors=True)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n[scanner] Summary by source:")
    source_counts = {}
    for ep in results:
        for s in ep.sources:
            source_counts[s] = source_counts.get(s, 0) + 1
    for source, count in sorted(source_counts.items()):
        print(f"  {source}: {count} endpoints")

    print("\n[scanner] Shadow APIs detected:")
    shadow_count = 0
    for ep in results:
        if ep.seen_in_traffic and not ep.in_gateway and not ep.in_repo:
            shadow_count += 1
            print(f"  !! {ep.method} {ep.path} - in traffic only, not in any config or repo")
    if shadow_count == 0:
        print("  None detected")