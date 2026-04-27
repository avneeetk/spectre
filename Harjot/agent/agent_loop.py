# =============================================================================
# agent_loop.py — SPECTRE AI Layer | Core Agent Pipeline
# =============================================================================
#
# This is the brain of SPECTRE. It takes a structured API record from the
# discovery scanner and runs it through a five-step pipeline to produce
# a risk summary, OWASP violation breakdown, and a technical remediation plan.
#
# PIPELINE (per endpoint):
#   Step 1 — Severity classification     (pure logic)
#   Step 2 — Action type decision         (pure logic)
#   Step 3 — RAG retrieval from ChromaDB  (cached by flag set)
#   Step 4 — Risk summary + violations    (1 LLM call)
#   Step 5 — Technical fix                (1 LLM call)
#
# Each endpoint costs at most 2 LLM calls. Clean Active endpoints with no
# violations cost 1. Repeat requests for the same record cost 0 — the result
# is pulled straight from an in-memory cache.
#
# =============================================================================

import sys
import os
import hashlib
import json

from functools import lru_cache

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from agent.rag import retrieve_owasp_context
from agent.llm import call_llm

load_dotenv()


# =============================================================================
# RESULT CACHE
# =============================================================================
# Simple in-memory store keyed by a hash of the input record. If the same
# endpoint comes in twice during a session — say from a dashboard refresh —
# we skip the pipeline entirely and return what we already computed.
# Resets on server restart, which is fine for our use case.
# =============================================================================

_result_cache = {}


def _record_hash(api_record: dict) -> str:
    # MD5 hash of the record with sorted keys so key order never affects the result.
    return hashlib.md5(json.dumps(api_record, sort_keys=True).encode()).hexdigest()


# =============================================================================
# STEP 1 — SEVERITY CLASSIFIER
# =============================================================================
# Assigns Critical / High / Medium / Low using deterministic rules.
# No LLM here — severity needs to be consistent and explainable, not
# probabilistic. A Rogue endpoint is always Critical, full stop.
# =============================================================================

def classify_severity(api_record: dict) -> str:
    state = api_record["state"]
    flags = api_record["owasp_flags"]
    auth = api_record["auth_present"]
    tls = api_record["tls_enabled"]

    if state == "Rogue":
        return "Critical"
    if state == "Zombie" and not auth and not tls:
        return "High"
    if state == "Zombie" and not auth:
        return "High"
    if state == "Shadow" and not auth:
        return "High"
    if len(flags) >= 3:
        return "High"
    if len(flags) >= 1:
        return "Medium"
    return "Low"


# =============================================================================
# STEP 2 — ACTION TYPE DECISION
# =============================================================================
# The endpoint's state tells us what kind of output to generate downstream.
# Zombie and Rogue endpoints need to be shut down, Shadow endpoints need to
# be formally registered, and Active endpoints just need their violations fixed.
# =============================================================================

def decide_action_type(state: str) -> str:
    actions = {
        "Zombie": "decommission",
        "Rogue": "decommission",
        "Shadow": "register",
        "Active": "harden"
    }
    return actions.get(state, "review")


# =============================================================================
# STEP 3 — RAG RETRIEVAL
# =============================================================================
# Pulls the relevant OWASP documentation chunks from ChromaDB for the
# endpoint's flags. This gets injected into the LLM prompt so the model
# reasons from the actual OWASP standard, not general knowledge.
#
# Results are cached by flag set — if two endpoints share the same flags,
# ChromaDB is only queried once. Flags are sorted before caching so that
# ["API2", "API4"] and ["API4", "API2"] always resolve to the same entry.
#
# Skipped entirely when there are no flags — nothing to look up.
# =============================================================================

@lru_cache(maxsize=32)
def _cached_owasp_context(flags_tuple: tuple) -> str:
    return retrieve_owasp_context(list(flags_tuple))


# =============================================================================
# STEP 4 — RISK SUMMARY + VIOLATIONS  (1 LLM call)
# =============================================================================
# Generates two things in a single call: a plain-English risk summary and a
# one-line violation breakdown per OWASP flag. Both need the same context
# (the endpoint record + OWASP docs), so there's no reason to make two
# separate requests.
#
# The prompt uses explicit section headers so the response can be cleanly
# parsed into two fields without fragile regex or guesswork.
# =============================================================================

def generate_risk_and_violations(api_record: dict, severity: str, owasp_context: str) -> dict:
    state = api_record["state"]
    days = api_record["last_seen_days_ago"]
    flags = api_record["owasp_flags"]

    # Give the model a plain-English description of what the state means
    # so it doesn't have to infer it from the label alone.
    if state in ["Zombie", "Rogue"]:
        state_context = f"This endpoint has been inactive for {days} days and is still reachable."
    elif state == "Shadow":
        state_context = "This endpoint is receiving live traffic but is undocumented and unregistered."
    else:
        state_context = f"This endpoint is active and was last seen {days} days ago."

    # If there are no flags, we explicitly tell the model to output "None"
    # so the response format stays consistent regardless of the endpoint.
    if flags:
        violations_instruction = f"""VIOLATIONS:
For each flag in {', '.join(flags)}, write exactly one line in this format:
FLAGID — one sentence explaining what is specifically wrong with this endpoint.
Example: API2 — No authentication header is required, allowing any caller to access user data freely.
Write only the violation lines. No extra text."""
    else:
        violations_instruction = "VIOLATIONS:\nNone"

    prompt = f"""You are a security analyst reviewing API endpoints for a banking system.

OWASP REFERENCE:
{owasp_context}

ENDPOINT:
- Path: {api_record['endpoint']}
- State: {state}
- Context: {state_context}
- Auth present: {api_record['auth_present']}
- Rate limiting: {api_record['rate_limited']}
- TLS enabled: {api_record['tls_enabled']}
- In gateway: {api_record['in_gateway']}
- OWASP flags: {', '.join(flags) if flags else 'None'}
- Severity: {severity}

Respond in exactly this format with no extra text, no preamble, no closing remarks:

RISK_SUMMARY:
[2-3 sentences. Specific to this endpoint. Mention the state, the biggest risk, and the consequence if exploited. No bullet points. No headings. Active endpoints seen 0-7 days ago are healthy — do not flag recency as a risk for them.]

{violations_instruction}"""

    raw = call_llm(prompt)

    # Split the response on the VIOLATIONS header and clean each part.
    # Defaults handle the case where the model ignores the format instructions.
    risk_summary = ""
    violations = "None"

    if "RISK_SUMMARY:" in raw:
        parts = raw.split("VIOLATIONS:")
        risk_summary = parts[0].replace("RISK_SUMMARY:", "").strip()
        if len(parts) > 1:
            violations_text = parts[1].strip()
            violations = violations_text if violations_text else "None"

    return {"risk_summary": risk_summary, "violations": violations}


# =============================================================================
# STEP 5 — TECHNICAL FIX  (1 LLM call)
# =============================================================================
# Generates the actual remediation output. What it produces depends on the
# action type decided in Step 2:
#
#   decommission → Nginx 410 block + deprecation notice for the eng team
#   register     → Gateway registration JSON template
#   harden       → Specific fix per OWASP flag with code or config syntax
#
# Kept as a separate call from Step 4 because the prompt structure changes
# significantly per action type — mixing them would make the prompt harder
# to control and the output less reliable.
#
# Not called at all for Active endpoints with no flags — there's nothing to fix.
# =============================================================================

def generate_technical_fix(api_record: dict, action_type: str) -> str:
    endpoint = api_record["endpoint"]
    state = api_record["state"]
    flags = api_record["owasp_flags"]

    if action_type == "decommission":
        prompt = f"""Generate two things for the {endpoint} endpoint which is a {state} API:

1. An Nginx config snippet that blocks this route with a 410 Gone response.
2. A short deprecation notice (3-4 sentences) to send to the engineering team explaining why it is being removed.

Be specific. Use the actual endpoint path."""

    elif action_type == "register":
        prompt = f"""Generate a gateway registration template for the shadow API endpoint {endpoint}.

Include these fields as a JSON object:
- endpoint
- owner (set to "TBD - requires investigation")
- purpose (set to "TBD - requires investigation")
- auth_method (recommend the right one based on it being a banking API)
- rate_limit_per_minute (recommend a sensible number)
- tls_required (set appropriately)
- registered_by
- registration_date

Return only the JSON. No explanation."""

    else:
        prompt = f"""The {endpoint} endpoint has these OWASP violations: {', '.join(flags)}.

Auth present: {api_record['auth_present']}
Rate limited: {api_record['rate_limited']}
TLS enabled: {api_record['tls_enabled']}

For each violation, provide a specific technical fix with actual code or config syntax.
Keep each fix concise and actionable."""

    return call_llm(prompt)


# =============================================================================
# run_agent — MAIN ENTRY POINT
# =============================================================================
# This is what the FastAPI routes call, for both /analyze and /analyze/batch.
# It runs the full five-step pipeline for a single API record and returns
# a structured result dict ready to be sent back to the dashboard.
#
# LLM calls per endpoint:
#   Has flags (any state)       → 2 calls
#   Active, no flags            → 1 call  (technical fix skipped)
#   Already seen this record    → 0 calls (cache hit)
# =============================================================================

def run_agent(api_record: dict) -> dict:

    # Return immediately if we've already analyzed this exact record.
    cache_key = _record_hash(api_record)
    if cache_key in _result_cache:
        return _result_cache[cache_key]

    # Step 1 — Figure out how serious this is
    severity = classify_severity(api_record)

    # Step 2 — Decide what kind of fix to generate
    action_type = decide_action_type(api_record["state"])

    # Step 3 — Pull OWASP context for the flags (skipped if there are none)
    if api_record["owasp_flags"]:
        owasp_context = _cached_owasp_context(tuple(sorted(api_record["owasp_flags"])))
    else:
        owasp_context = ""

    # Step 4 — Risk summary and violations in one shot
    analysis = generate_risk_and_violations(api_record, severity, owasp_context)

    # Step 5 — Technical fix (skipped for clean Active endpoints)
    if action_type == "harden" and not api_record["owasp_flags"]:
        technical_fix = "No violations detected. Continue monitoring this endpoint regularly."
    else:
        technical_fix = generate_technical_fix(api_record, action_type)

    result = {
        "endpoint": api_record["endpoint"],
        "state": api_record["state"],
        "severity": severity,
        "action_type": action_type,
        "owasp_flags": api_record["owasp_flags"],
        "last_seen_days_ago": api_record["last_seen_days_ago"],
        "risk_summary": analysis["risk_summary"],
        "violations": analysis["violations"],
        "technical_fix": technical_fix,
        "auth_present": api_record["auth_present"],
        "rate_limited": api_record["rate_limited"],
        "tls_enabled": api_record["tls_enabled"],
        "in_gateway": api_record["in_gateway"]
    }

    # Cache the result so repeat requests don't hit the LLM again
    _result_cache[cache_key] = result
    return result