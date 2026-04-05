from agent.llm import call_llm
from dotenv import load_dotenv
import os
import json
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.rag import retrieve_owasp_context

load_dotenv()       


def classify_severity(api_record: dict) -> str:
    state = api_record["state"]
    flags = api_record["owasp_flags"]
    auth = api_record["auth_present"]

    if state == "Rogue":
        return "Critical"
    if state == "Zombie" and not auth:
        return "High"
    if state == "Shadow" and not auth:
        return "High"
    if len(flags) >= 3:
        return "High"
    if len(flags) >= 1:
        return "Medium"
    return "Low"


def analyze_endpoint(api_record: dict) -> dict:
    severity = classify_severity(api_record)
    
    owasp_context = retrieve_owasp_context(api_record["owasp_flags"])
    
    state = api_record["state"]
    if state in ["Zombie", "Rogue"]:
        action_instruction = (
            "Generate a specific Nginx config snippet to block this route with a 410 Gone response. "
            "Also write a one paragraph deprecation notice that could be sent to the engineering team."
        )
    elif state == "Shadow":
        action_instruction = (
            "Generate a template for registering this endpoint in an API gateway. "
            "Include these fields: owner, purpose, auth_method, rate_limit_per_minute."
        )
    else:
        action_instruction = (
            "List specific, actionable fixes for each OWASP violation found. "
            "Use actual config syntax or code examples where possible."
        )

    prompt = f"""You are a security analyst reviewing API endpoints for a banking system.

OWASP REFERENCE DOCUMENTATION:
{owasp_context}

API ENDPOINT DATA:
- Endpoint: {api_record['endpoint']}
- State: {state}
- Last seen: {api_record['last_seen_days_ago']} days ago
- Authentication present: {api_record['auth_present']}
- Rate limiting present: {api_record['rate_limited']}
- TLS enabled: {api_record['tls_enabled']}
- Registered in gateway: {api_record['in_gateway']}
- OWASP violations detected: {', '.join(api_record['owasp_flags']) if api_record['owasp_flags'] else 'None'}
- Severity: {severity}

Respond in EXACTLY this format, no extra text:

RISK SUMMARY:
(2-3 sentences. Be specific about this endpoint. Mention the state, how long it has been inactive if applicable, and what the biggest risk is. Do NOT write generic advice.)

VIOLATIONS:
(one line per OWASP flag. Format: API2 — explain exactly what is wrong with this specific endpoint)

RECOMMENDED ACTION:
(one specific next step a developer should take TODAY)

TECHNICAL FIX:
{action_instruction}
"""

    analysis = call_llm(prompt)
    
    return {
        "endpoint": api_record["endpoint"],
        "state": state,
        "severity": severity,
        "owasp_flags": api_record["owasp_flags"],
        "analysis": analysis
    }


if __name__ == "__main__":
    with open("data/mock_apis.json") as f:
        apis = json.load(f)
    
    print("Running analyzer on all mock endpoints...\n")
    print("=" * 60)
    
    results = []
    for api in apis:
        print(f"\nAnalyzing: {api['endpoint']}")
        print(f"State: {api['state']} | Flags: {api['owasp_flags']}")
        print("-" * 40)
        
        result = analyze_endpoint(api)
        results.append(result)
        
        print(result["analysis"])
        print("=" * 60)
    
    with open("data/agent_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\nDone. Results saved to data/agent_results.json")