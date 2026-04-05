import sys
import os

from click import prompt

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from agent.rag import retrieve_owasp_context
from agent.llm import call_llm

load_dotenv()


# ─────────────────────────────────────────────
# STEP 1: Severity classifier (pure logic, no AI)
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
# STEP 2: Decide action type based on state
# ─────────────────────────────────────────────

def decide_action_type(state: str) -> str:
    actions = {
        "Zombie": "decommission",
        "Rogue": "decommission",
        "Shadow": "register",
        "Active": "harden"
    }
    return actions.get(state, "review")


# ─────────────────────────────────────────────
# STEP 3: Generate risk reasoning (Gemini call 1)
# ─────────────────────────────────────────────

def generate_risk_summary(api_record: dict, severity: str, owasp_context: str) -> str:
    state = api_record["state"]
    days = api_record["last_seen_days_ago"]

    if state in ["Zombie", "Rogue"]:
        state_context = f"This endpoint has been inactive for {days} days and is still reachable."
    elif state == "Shadow":
        state_context = f"This endpoint is receiving live traffic but is undocumented and unregistered."
    else:
        state_context = f"This endpoint is active and was last seen {days} days ago."

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
- OWASP flags: {', '.join(api_record['owasp_flags']) if api_record['owasp_flags'] else 'None'}
- Severity: {severity}

Write ONLY a risk summary: 2-3 sentences, specific to this endpoint.
Mention the state, the biggest risk, and the consequence if exploited.
Do NOT write generic advice. Do NOT use bullet points.
Do NOT include headings. Just the paragraph.

Important: An Active endpoint last seen 0-7 days ago is healthy. Do not flag recency as a risk for active endpoints."""

    return call_llm(prompt)


# ─────────────────────────────────────────────
# STEP 4: Generate violations breakdown (Gemini call 2)
# ─────────────────────────────────────────────

def generate_violations(api_record: dict, owasp_context: str) -> str:
    if not api_record["owasp_flags"]:
        return "None"

    prompt = f"""You are a security analyst.

OWASP REFERENCE:
{owasp_context}

ENDPOINT: {api_record['endpoint']}
FLAGS: {', '.join(api_record['owasp_flags'])}
AUTH: {api_record['auth_present']}
RATE LIMITED: {api_record['rate_limited']}
TLS: {api_record['tls_enabled']}

For each OWASP flag, write exactly one line in this format:
FLAGID — one sentence explaining what is specifically wrong with this endpoint.

Example:
API2 — No authentication header is required, allowing any caller to access user data freely.

Write only the violation lines. Nothing else."""

    return call_llm(prompt)


# ─────────────────────────────────────────────
# STEP 5: Generate technical fix (Gemini call 3)
# ─────────────────────────────────────────────

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
        if not flags:
            return "No violations detected. Continue monitoring this endpoint regularly."

        prompt = f"""The {endpoint} endpoint has these OWASP violations: {', '.join(flags)}.

Auth present: {api_record['auth_present']}
Rate limited: {api_record['rate_limited']}  
TLS enabled: {api_record['tls_enabled']}

For each violation, provide a specific technical fix with actual code or config syntax.
Keep each fix concise and actionable."""

    return call_llm(prompt)


# ─────────────────────────────────────────────
# STEP 6: Master agent function
# Chains all steps together
# ─────────────────────────────────────────────

def run_agent(api_record: dict) -> dict:
    # Step 1 — classify severity (pure logic)
    severity = classify_severity(api_record)

    # Step 2 — decide what kind of action is needed
    action_type = decide_action_type(api_record["state"])

    # Step 3 — fetch relevant OWASP context from ChromaDB
    owasp_context = retrieve_owasp_context(api_record["owasp_flags"])

    # Step 4 — generate risk summary (Gemini call 1)
    risk_summary = generate_risk_summary(api_record, severity, owasp_context)
    

    # Step 5 — generate violations breakdown (Gemini call 2)
    violations = generate_violations(api_record, owasp_context)
    

    # Step 6 — generate technical fix (Gemini call 3)
    technical_fix = generate_technical_fix(api_record, action_type)
    

    # Step 7 — package result
    return {
        "endpoint": api_record["endpoint"],
        "state": api_record["state"],
        "severity": severity,
        "action_type": action_type,
        "owasp_flags": api_record["owasp_flags"],
        "last_seen_days_ago": api_record["last_seen_days_ago"],
        "risk_summary": risk_summary,
        "violations": violations,
        "technical_fix": technical_fix,
        "auth_present": api_record["auth_present"],
        "rate_limited": api_record["rate_limited"],
        "tls_enabled": api_record["tls_enabled"],
        "in_gateway": api_record["in_gateway"]
    }