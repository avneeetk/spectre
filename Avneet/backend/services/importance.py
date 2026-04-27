"""
importance.py 
Computes importance_score (0-100) for each API endpoint.
"How much does this API matter to the business?"

Inputs:
  - endpoint data from M1 (path, state, service_name)
  - onboarding answers from the user (system type, data handled, regulations)

Logic:
  - Match the endpoint path to a domain keyword
  - Use the user's declared system type to weight that domain
  - Adjust for exposure (external > internal) and data sensitivity
  - Combine with technical_score if available (M2's output)
"""

# Domain keyword weights per system type
# Key = keyword that appears in the endpoint path
# Value = importance weight 0.0 to 1.0
DOMAIN_WEIGHTS_BY_SYSTEM = {
    "fintech": {
        "payment": 1.00,
        "transfer": 0.95,
        "transaction": 0.95,
        "account": 0.85,
        "auth": 0.85,
        "login": 0.80,
        "admin": 0.75,
        "user": 0.65,
        "kyc": 0.80,
        "loan": 0.70,
        "notification": 0.35,
        "product": 0.40,
        "report": 0.40,
        "debug": 0.20,
        "legacy": 0.50,
        "internal": 0.30,
    },
    "healthcare": {
        "patient": 1.00,
        "record": 0.95,
        "medical": 0.95,
        "prescription": 0.90,
        "auth": 0.85,
        "admin": 0.75,
        "user": 0.65,
        "appointment": 0.70,
        "billing": 0.80,
        "notification": 0.35,
        "debug": 0.20,
        "internal": 0.30,
    },
    "ecommerce": {
        "payment": 1.00,
        "order": 0.90,
        "checkout": 0.90,
        "product": 0.75,
        "inventory": 0.70,
        "auth": 0.80,
        "user": 0.65,
        "cart": 0.75,
        "admin": 0.70,
        "notification": 0.35,
        "debug": 0.20,
        "internal": 0.30,
    },
    "saas": {
        "auth": 0.90,
        "billing": 0.85,
        "subscription": 0.85,
        "user": 0.75,
        "admin": 0.80,
        "api": 0.70,
        "webhook": 0.65,
        "notification": 0.40,
        "debug": 0.20,
        "internal": 0.30,
    },
    "government": {
        "citizen": 0.95,
        "identity": 0.90,
        "auth": 0.85,
        "record": 0.90,
        "payment": 0.85,
        "admin": 0.70,
        "public": 0.75,
        "internal": 0.30,
        "debug": 0.15,
    },
}

# State urgency multipliers
# A zombie payment API is more urgent than an active one
STATE_URGENCY = {
    "Zombie": 1.30,
    "Rogue":  1.40,
    "Shadow": 1.20,
    "Active": 0.90,
}

# Regulations that increase importance
HIGH_REGULATION = {"pci", "hipaa", "gdpr"}

REGULATION_LABELS = {
    "pci": "PCI",
    "hipaa": "HIPAA",
    "gdpr": "GDPR",
    "soc2": "SOC 2",
    "iso27001": "ISO 27001",
}

DOMAIN_REASON_BY_KEYWORD = {
    "payment": "Handles financial transactions",
    "transfer": "Moves customer funds",
    "transaction": "Processes transaction flows",
    "account": "Touches customer accounts",
    "auth": "Protects authentication flows",
    "login": "Protects authentication flows",
    "admin": "Controls administrative actions",
    "kyc": "Handles identity verification",
    "loan": "Supports lending workflows",
    "billing": "Handles billing operations",
    "subscription": "Drives subscription revenue",
    "webhook": "Receives external integrations",
}


def _impact_level(score: float) -> str:
    if score >= 85:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def _find_domain_reason(path: str) -> str | None:
    path_lower = path.lower()
    for keyword, reason in DOMAIN_REASON_BY_KEYWORD.items():
        if keyword in path_lower:
            return reason
    return None


def _build_business_tags(reasons: list[str], regulations: list[str], api_consumers: list[str], domain_component: float) -> list[str]:
    tags: list[str] = []
    if domain_component >= 0.75:
        tags.append("Business Critical")
    if regulations:
        labels = [REGULATION_LABELS.get(r, str(r).upper()) for r in regulations[:2]]
        tags.append(f"Regulated ({', '.join(labels)})")
    if {"public_internet", "mobile_apps", "partner_apis"} & set(api_consumers):
        tags.append("External Exposure")
    if any("authentication" in reason.lower() or "financial" in reason.lower() for reason in reasons):
        tags.append("Sensitive Workflow")
    return tags[:3]


def _get_domain_weight(path: str, system_type: str) -> float:
    """
    Match the endpoint path to the most specific domain keyword.
    Returns a weight from 0.0 to 1.0.
    """
    weights = DOMAIN_WEIGHTS_BY_SYSTEM.get(system_type, {})
    path_lower = path.lower()

    best_weight = 0.30  # default for unrecognised paths
    for keyword, weight in weights.items():
        if keyword in path_lower:
            if weight > best_weight:
                best_weight = weight
    return best_weight


def _ai_adjustment(endpoint: dict, onboarding: dict) -> float:
    """
    Optional AI-inspired adjustment layer.
    For now, rule-based simulation of what an LLM would infer.
    Returns a small adjustment (-0.1 to +0.1).
    """

    path = endpoint.get("endpoint", "").lower()
    regulations = onboarding.get("regulations", [])

    adjustment = 0.0

    # Simulate semantic understanding
    if "payment" in path and "pci" in regulations:
        adjustment += 0.05

    if "admin" in path and endpoint.get("auth_present") is False:
        adjustment += 0.05

    if "internal" in path and endpoint.get("state") == "Active":
        adjustment -= 0.05

    return max(min(adjustment, 0.1), -0.1)


def compute_importance_score(endpoint: dict, onboarding: dict) -> int:
    """
    Returns importance_score as an integer 0-100.

    Enhanced version with:
    - Explainability (component breakdown)
    - AI hook (optional adjustment layer)
    """

    system_type = onboarding.get("system_type", "fintech")
    regulations = [str(r).lower() for r in onboarding.get("regulations", []) if str(r).lower() != "none"]
    api_consumers = [str(c) for c in onboarding.get("api_consumers", [])]

    path = endpoint.get("endpoint", "")
    # NOTE (M4): The frontend/demo data often uses lowercase states ("zombie"),
    # while the original contract uses capitalised ("Zombie"). Normalise here
    # so the importance model stays consistent regardless of casing.
    raw_state = endpoint.get("state", "Active")
    state = raw_state
    if isinstance(raw_state, str):
        for canonical in ("Active", "Shadow", "Zombie", "Rogue"):
            if raw_state.strip().lower() == canonical.lower():
                state = canonical
                break
    technical_score = endpoint.get("technical_score")

    # --- Component 1: Technical ---
    if technical_score is not None:
        tech_component = technical_score / 100
    else:
        flag_count = len(endpoint.get("owasp_flags", []))
        tech_component = min(flag_count * 0.25, 1.0)

    # --- Component 2: Domain ---
    domain_component = _get_domain_weight(path, system_type)
    domain_reason = _find_domain_reason(path)

    # --- Component 3: Regulatory ---
    reg_component = 0.0
    if any(r in HIGH_REGULATION for r in regulations):
        path_lower = path.lower()
        regulated_keywords = ["payment", "patient", "user", "account",
                              "transfer", "record", "identity", "kyc"]
        if any(kw in path_lower for kw in regulated_keywords):
            reg_component = 1.0
        else:
            reg_component = 0.3

    # --- Component 4: Exposure ---
    is_external = (
        "public_internet" in api_consumers or
        "mobile_apps" in api_consumers or
        "partner_apis" in api_consumers
    )
    exposure_component = 1.0 if is_external else 0.4

    # --- Base Score ---
    raw_score = (
        0.40 * tech_component +
        0.35 * domain_component +
        0.15 * reg_component +
        0.10 * exposure_component
    )

    # --- State Multiplier ---
    urgency = STATE_URGENCY.get(state, 1.0)

    # --- AI Hook (optional adjustment layer) ---
    ai_adjustment = _ai_adjustment(endpoint, onboarding)

    business_score = (raw_score + ai_adjustment) * 100
    final_score = business_score * urgency

    importance_reasons: list[str] = []
    if domain_reason and domain_component >= 0.65:
        importance_reasons.append(domain_reason)

    high_regulations = [REGULATION_LABELS.get(r, str(r).upper()) for r in regulations if r in HIGH_REGULATION]
    if high_regulations:
        importance_reasons.append(f"Under {' and '.join(high_regulations[:2])} compliance")

    consumer_set = set(api_consumers)
    if "partner_apis" in consumer_set:
        importance_reasons.append("Used by external partners")
    elif {"public_internet", "mobile_apps"} & consumer_set:
        importance_reasons.append("Exposed to public clients")

    if technical_score is not None and technical_score >= 70:
        importance_reasons.append("High technical risk")

    impact = _impact_level(final_score)
    tags = _build_business_tags(importance_reasons, regulations, api_consumers, domain_component)

    if not importance_reasons:
        importance_reasons.append("Supports core API operations")

    endpoint["importance_reason"] = importance_reasons[:4]
    endpoint["business_impact"] = impact
    endpoint["business_tags"] = tags
    endpoint["importance_summary"] = "This API matters because " + "; ".join(reason.lower() for reason in importance_reasons[:3]) + "."

    # --- Explainability ---
    endpoint["importance_breakdown"] = {
        "technical": round(tech_component, 3),
        "domain": round(domain_component, 3),
        "regulatory": round(reg_component, 3),
        "exposure": round(exposure_component, 3),
        "ai_adjustment": round(ai_adjustment, 3),
        "state_multiplier": urgency
    }

    return min(int(final_score), 100)
