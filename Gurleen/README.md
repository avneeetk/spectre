# SPECTRE - API Threat Classification Platform

---

## 1. Classification
Each discovered API endpoint is processed through a **rule-based core engine**. We use deterministic rules (instead of a machine learning model) to ensure explainability and transparency. The classification logic is designed so that developers can easily verify why an API is labeled as "Zombie," "Shadow," "Active," or "Rogue."

## Features

- **Single Endpoint Classification** - Classify individual endpoints via `/classify` endpoint
- **Batch Classification** - Process multiple endpoints efficiently via `/classify/batch`
- **OWASP Security Scanning** - Run passive or active security checks via `/owasp`
- **Passive & Active Scanning** - Support for both passive analysis and active testing
- **Health Check** - `/health` endpoint for service monitoring

### Key Inputs for Classification:
- Presence in a known spec/gateway configuration
- Last recorded traffic timestamp
- Detectable authentication mechanisms
- Route path conflicts

### Classification Logic:
- **Active**: Endpoint is documented, receives recent traffic, and has an assigned owner.
- **Shadow**: Endpoint receives live traffic but is not documented in any gateway or spec.
- **Zombie**: Endpoint has no traffic for 90+ days, lacks an owner, is not in any spec, but is still reachable.
- **Rogue**: Endpoint is suspected to be created to bypass controls (not registered, no auth, mimics/conflicts with known endpoints).

---

## 2. OWASP Security Checks
Each classified endpoint undergoes automated security checks based on the **OWASP API Security Top 10 (2023)**. While **API9: Improper Inventory Management** is the primary focus, we also check for vulnerabilities commonly found in forgotten or unmonitored APIs.

### Automated Checks:
   **OWASP ID** | **Risk**                     | **How We Check**                                                                                     | **Why It Matters**                                      |
 |--------------|------------------------------|------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
 | API2         | Broken Authentication        | Check if the endpoint requires an auth header. Send a request with no credentials and observe the response. | Most zombie APIs lack authentication.                  |
 | API4         | No Rate Limiting             | Send repeated requests and check for `429` responses or throttling headers.                        | Forgotten APIs rarely have rate-limiting policies.      |
 | API8         | Security Misconfiguration     | Check TLS presence, CORS headers, allowed HTTP methods, and error response verbosity.               | Old debug configs are common in zombie APIs.           |
 | API9         | Improper Inventory Management| Cross-reference every discovered endpoint against known gateway configs, specs, and owner records.  | Foundational vulnerability SPECTRE addresses.         |

### Local Setup

1. Clone the repository:
```bash
git clone https://github.com/avneeetk/spectre.git
cd spectre/Gurleen
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the server:
```bash
uvicorn main:app --port 8000 --reload
```

The API will be available at `http://localhost:8000`

## Project Structure

```
Gurleen/
├── main.py                 # FastAPI application and route handlers
├── models.py              # Pydantic data models and enums
├── requirements.txt       # Python dependencies
├── Dockerfile             # Docker configuration
├── classification/        # Classification logic
│   ├── classifier.py      # State classification engine
│   ├── sensitivity.py     # Data sensitivity detection
│   └── risk.py           # Risk computation (stub)
├── owasp/                # OWASP security checks
│   └── checker.py        # OWASP check runner
├── tests/                # Unit tests
└── mock_endpoints.json   # Test data
```


## API Documentation

### Health Check

**GET** `/health`

Check if the service is running.

**Response:**
```json
{
  "status": "ok"
}
```

### Classify Single Endpoint

**POST** `/classify`

Classify a single discovered API endpoint.

**Request:**
```json
{
  "id": "endpoint-123",
  "method": "GET",
  "path": "/api/users/profile",
  "service_name": "user-service",
  "sources": ["gateway", "traffic"],
  "in_repo": true,
  "in_gateway": true,
  "seen_in_traffic": true,
  "auth_detected": true,
  "auth_type": "bearer",
  "also_found_in_conflict_with": null,
  "status_codes": [200, 401],
  "last_seen": "2026-04-28T10:30:00Z",
  "tags": ["production", "user-data"],
  "raw_context": "Found in production traffic",
  "has_owner": true
}
```

**Response:**
```json
{
  "endpoint_id": "endpoint-123",
  "path": "/api/users/profile",
  "method": "GET",
  "host": "user-service",
  "state": "active",
  "state_reason": "Endpoint is documented in gateway and seen in active traffic",
  "data_sensitivity": "PII",
  "sensitivity_score": 0.85,
  "risk_score": 0.25,
  "risk_factors": ["Sensitive data path detected (score=0.85)"],
  "owasp_failures": [],
  "scanned_at": "2026-04-28T10:35:00Z"
}
```

### Classify Batch of Endpoints

**POST** `/classify/batch`

Classify multiple endpoints in a single request.

**Request:**
```json
[
  {
    "id": "endpoint-123",
    "method": "GET",
    "path": "/api/users/profile",
    "service_name": "user-service",
    "sources": ["gateway", "traffic"],
    "in_repo": true,
    "in_gateway": true,
    "seen_in_traffic": true,
    "auth_detected": true,
    "auth_type": "bearer",
    "also_found_in_conflict_with": null,
    "status_codes": [200, 401],
    "last_seen": "2026-04-28T10:30:00Z",
    "tags": ["production", "user-data"],
    "raw_context": "Found in production traffic",
    "has_owner": true
  },
  {
    "id": "endpoint-456",
    "method": "POST",
    "path": "/api/auth/login",
    "service_name": "auth-service",
    "sources": ["traffic"],
    "in_repo": false,
    "in_gateway": false,
    "seen_in_traffic": true,
    "auth_detected": false,
    "auth_type": "",
    "also_found_in_conflict_with": "shadow-endpoint-789",
    "status_codes": [200, 401],
    "last_seen": "2026-04-28T10:20:00Z",
    "tags": ["undocumented"],
    "raw_context": "Discovered in live traffic",
    "has_owner": false
  }
]
```

**Response:**
```json
[
  {
    "endpoint_id": "endpoint-123",
    "path": "/api/users/profile",
    "method": "GET",
    "host": "user-service",
    "state": "active",
    "state_reason": "Endpoint is documented in gateway and seen in active traffic",
    "data_sensitivity": "PII",
    "sensitivity_score": 0.85,
    "risk_score": 0.25,
    "risk_factors": ["Sensitive data path detected (score=0.85)"],
    "owasp_failures": [],
    "scanned_at": "2026-04-28T10:35:00Z"
  },
  {
    "endpoint_id": "endpoint-456",
    "path": "/api/auth/login",
    "method": "POST",
    "host": "auth-service",
    "state": "shadow",
    "state_reason": "Live traffic detected but endpoint is not in gateway or repository",
    "data_sensitivity": "NONE",
    "sensitivity_score": 0.0,
    "risk_score": 0.80,
    "risk_factors": ["Live traffic with no documentation or gateway entry"],
    "owasp_failures": [],
    "scanned_at": "2026-04-28T10:35:00Z"
  }
]
```

### OWASP Security Scanning

**POST** `/owasp`

Run OWASP security checks against an endpoint.

**Request:**
```json
{
  "endpoint": {
    "id": "endpoint-123",
    "method": "GET",
    "path": "/api/users/profile",
    "service_name": "user-service",
    "sources": ["gateway"],
    "in_repo": true,
    "in_gateway": true,
    "seen_in_traffic": true,
    "auth_detected": true,
    "auth_type": "bearer",
    "also_found_in_conflict_with": null,
    "status_codes": [200, 401],
    "last_seen": "2026-04-28T10:30:00Z",
    "tags": ["production"],
    "raw_context": "Production endpoint",
    "has_owner": true
  },
  "base_url": "https://api.example.com",
  "active": false
}
```

**Response:**
```json
{
  "endpoint_id": "endpoint-123",
  "path": "/api/users/profile",
  "checks_run": 12,
  "failures": [
    {
      "check_id": "missing-auth",
      "passed": false,
      "evidence": "Endpoint allows unauthenticated requests",
      "severity": "high"
    }
  ],
  "all_passed": false,
  "scanned_at": "2026-04-28T10:35:00Z"
}