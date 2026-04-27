#!/usr/bin/env python3
"""
Sanity checks for Stage-2 integration artifacts.

Reads:
  - Avneet/backend/data/scanner_output.json
  - Avneet/backend/data/agent_results.json

Validates:
  - endpoints are present
  - join coverage between scanner and agent outputs
  - minimal required fields exist
"""

from __future__ import annotations

import json
import os
import sys


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT, "data")


def _load(path: str):
  if not os.path.exists(path):
    return None
  with open(path, "r") as f:
    raw = f.read().strip()
    return json.loads(raw) if raw else None


def main() -> int:
  scanner_path = os.path.join(DATA_DIR, "scanner_output.json")
  agent_path = os.path.join(DATA_DIR, "agent_results.json")

  scanner = _load(scanner_path)
  agent = _load(agent_path)

  if not isinstance(scanner, list):
    print(f"[check] ERROR: {scanner_path} missing or not a list", file=sys.stderr)
    return 2
  if not isinstance(agent, list):
    print(f"[check] ERROR: {agent_path} missing or not a list", file=sys.stderr)
    return 2

  # Create method+endpoint keys for proper validation
  scanner_keys = set()
  agent_keys = set()
  
  for e in scanner:
    if isinstance(e, dict):
      method = e.get("method", "")
      endpoint = e.get("endpoint", "")
      if method and endpoint:
        scanner_keys.add(f"{method}:{endpoint}")
  
  for e in agent:
    if isinstance(e, dict):
      # Try id first, then method+endpoint
      if e.get("id"):
        agent_keys.add(e["id"])
      else:
        method = e.get("method", "")
        endpoint = e.get("endpoint", "")
        if method and endpoint:
          agent_keys.add(f"{method}:{endpoint}")

  missing_agent = sorted(scanner_keys - agent_keys)
  missing_scanner = sorted(agent_keys - scanner_keys)

  print(f"[check] scanner endpoints: {len(scanner_keys)}")
  print(f"[check] agent endpoints:   {len(agent_keys)}")
  print(f"[check] join coverage:     {len(scanner_keys & agent_keys)}/{len(scanner_keys)}")

  if missing_agent:
    print(f"[check] WARN: missing agent_results for {len(missing_agent)} endpoints (showing up to 10):")
    for e in missing_agent[:10]:
      print(f"  - {e}")
  if missing_scanner:
    print(f"[check] WARN: agent_results has {len(missing_scanner)} unknown endpoints (showing up to 10):")
    for e in missing_scanner[:10]:
      print(f"  - {e}")

  # Minimal per-record field checks
  required_scanner = {"endpoint", "method", "state", "owasp_flags", "service_name"}
  bad_scanner = [
    e for e in scanner
    if isinstance(e, dict) and any(k not in e for k in required_scanner)
  ]
  required_agent = {"endpoint", "risk_summary", "recommended_action", "technical_fix"}
  # Also check for id or method in agent results
  bad_agent = [
    e for e in agent
    if isinstance(e, dict) and (
      any(k not in e for k in required_agent) or
      (not e.get("id") and not e.get("method"))
    )
  ]

  if bad_scanner:
    print(f"[check] WARN: {len(bad_scanner)} scanner records missing required keys")
  if bad_agent:
    print(f"[check] WARN: {len(bad_agent)} agent records missing required keys")

  if missing_agent or bad_scanner or bad_agent:
    print("[check] RESULT: attention needed (warnings present)")
    return 1

  print("[check] RESULT: OK")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

