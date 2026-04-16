from models import DiscoveredEndpoint
from classification.classifier import classify
from datetime import datetime, timedelta, timezone

tests = [
    {
        "id": "ep-001",
        "path": "/api/v1/legacy-payments",
        "method": "POST",
        "service_name": "payments.internal",
        "sources": ["gateway"],
        "in_repo": True, "in_gateway": True,
        "seen_in_traffic": False,
        "auth_detected": False, "auth_type": "none",
        "path_conflict": None,
        "status_codes": [200],
        "confidence": 0.9,
        "last_seen": (datetime.now(timezone.utc) - timedelta(days=170)).isoformat(),
        "tags": [], "raw_context": "", "has_owner": False
    },
    {
        "id": "ep-002",
        "path": "/debug/db-dump",
        "method": "GET",
        "service_name": "api.internal",
        "sources": [],
        "in_repo": False, "in_gateway": False,
        "seen_in_traffic": True,
        "auth_detected": False, "auth_type": "none",
        "path_conflict": None,
        "status_codes": [200],
        "confidence": 0.5,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "tags": [], "raw_context": "", "has_owner": False
    },
    {
        "id": "ep-003",
        "path": "/api/v1/user",
        "method": "GET",
        "service_name": "api.internal",
        "sources": [],
        "in_repo": False, "in_gateway": False,
        "seen_in_traffic": True,
        "auth_detected": False, "auth_type": "none",
        "path_conflict": "/api/v1/users",
        "status_codes": [200],
        "confidence": 0.5,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "tags": [], "raw_context": "", "has_owner": False
    },
    {
        "id": "ep-004",
        "path": "/api/v2/products",
        "method": "GET",
        "service_name": "catalog.internal",
        "sources": ["gateway", "repo"],
        "in_repo": True, "in_gateway": True,
        "seen_in_traffic": True,
        "auth_detected": True, "auth_type": "jwt",
        "path_conflict": None,
        "status_codes": [200],
        "confidence": 0.95,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "tags": [], "raw_context": "", "has_owner": True
    },
]

for t in tests:
    ep = DiscoveredEndpoint(**t)
    state, reason = classify(ep)
    print(f"{ep.path:35} -> {state.value:8} | {reason}")