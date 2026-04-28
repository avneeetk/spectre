# SPECTRE : Agentic AI Layer

> **Shadow, Phantom, Classified, Terminated & Rogue API Engine**  
> B.Tech Final Year Major Project • Semester VIII • 2026–27  

---

## What this Module Does

This is the AI layer of the SPECTRE platform. It takes structured API endpoint data produced by the discovery scanner and classifier, and transforms it into human-readable risk analysis, OWASP violation breakdowns, and actionable remediation plans.

Without this module, SPECTRE produces raw JSON flags. This module is what makes those flags meaningful. It explains what is wrong, why it matters, and exactly what a developer should do to fix it.

The module exposes a FastAPI service that the dashboard consumes to retrieve analysis results and the decommission queue.

---

## Architecture
```
Discovery Scanner ──┐
├──► JSON Record ──► Agent Loop ──► Groq LLM (Llama 3) ──► Analysis Output
Classifier ──────────┘                                  ▲
                                                        │
                                                    ChromaDB
                                              (OWASP Knowledge Base)
                                                        │
                                              FastAPI Service (port 8000)
                                                        │
                                                    Dashboard
```

The agent loop runs at most two LLM calls per endpoint:
1. **Risk summary + violations** : plain English risk explanation and a one-line breakdown per OWASP flag, generated in a single call
2. **Technical fix** : Nginx config, gateway registration template, or hardening steps depending on the endpoint state

Active endpoints with no violations skip the second call entirely. Repeat requests for the same record skip both calls and are served from cache.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Python 3.11 | Primary language |
| Groq API (Llama 3) | LLM for risk reasoning and remediation generation |
| ChromaDB | Local vector store for OWASP documentation |
| FastAPI | Exposes the AI layer as a REST service |
| Uvicorn | ASGI server that runs the FastAPI app |
| Pydantic | Input validation and schema enforcement |
| python-dotenv | Loads API keys from `.env` file |

---

## Project Structure
```
spectre-ai/
│
├── data/
│   ├── mock_apis.json          # Simulated API records for testing
│   └── agent_results.json      # Generated analysis output (auto-created)
│
├── knowledge_base/
│   └── owasp_docs.py           # OWASP docs loaded into ChromaDB
│
├── agent/
│   ├── llm.py                  # Central LLM helper (Groq client)
│   ├── rag.py                  # Retrieval function - fetches OWASP context by flag
│   ├── analyzer.py             # Single-call analyzer (kept for reference)
│   └── agent_loop.py           # Multi-step agent - main logic
│
├── api/
│   ├── __init__.py
│   └── routes.py               # FastAPI route definitions
│
├── .env                        # API keys (never committed)
├── .gitignore
├── main.py                     # App entry point, starts the server
├── requirements.txt
└── README.md
```

---

## How the Agent Loop Works

Each API record goes through five steps inside `agent/agent_loop.py`:

**Step 1 — Severity classification (pure logic, no LLM)**  
Deterministic rules assign Critical / High / Medium / Low based on state, auth presence, TLS status, and number of OWASP flags. No AI is used here — the result must be explainable and consistent.

**Step 2 — Action type decision**  
Based on the endpoint state, the agent decides what kind of output to generate:
- Zombie / Rogue → `decommission` (Nginx block + deprecation notice)
- Shadow → `register` (gateway registration template)
- Active → `harden` (specific fixes for each violation)

**Step 3 — RAG retrieval (cached)**  
The OWASP flags for the endpoint are used to fetch matching documentation from ChromaDB. This context is injected into the LLM prompt so the model reasons from the actual OWASP standard, not general knowledge. Results are cached by flag set — if multiple endpoints in a batch share the same flags, ChromaDB is only queried once. Skipped entirely when an endpoint has no flags.

**Step 4 — Risk summary + violations (LLM call 1)**  
A single prompt generates both the plain English risk explanation and the one-line violation breakdown per flag. Both outputs need the same context, so they are produced together in one call and parsed into separate fields.

**Step 5 — Technical fix (LLM call 2)**  
A second prompt generates the remediation output — either an Nginx 410 config with a deprecation notice, a JSON gateway registration template, or specific hardening instructions with code examples. Skipped entirely for Active endpoints with no violations — a static response is returned instead.

---

## LLM Call Budget

| Endpoint type | LLM calls |
|---|---|
| Any endpoint with flags | 2 |
| Active, no violations | 1 |
| Repeat request for same record | 0 |

---

## Caching Strategy

The pipeline uses two independent caches to avoid redundant work:

**Result cache** — every completed analysis is stored in memory, keyed by a hash of the input record. If the same endpoint record comes in again during the same server session (for example from a dashboard refresh), the entire pipeline is skipped and the stored result is returned immediately. Resets on server restart.

**RAG cache** — OWASP context lookups from ChromaDB are cached by flag set. Flags are sorted before caching so `["API2", "API4"]` and `["API4", "API2"]` always resolve to the same entry. In a batch of 8 endpoints where several share common flag combinations, ChromaDB may only be queried 4-5 times instead of 8.

---

## API Endpoints

Start the server with `python main.py`. The service runs on `http://localhost:8000`.  
Interactive docs available at `http://localhost:8000/docs`.

### `GET /health`
Check if the service is running.

**Response:**
```json
{
  "status": "online",
  "service": "SPECTRE AI Layer"
}
```

---

### `POST /analyze`
Analyze a single API endpoint.

**Request body:**
```json
{
  "endpoint": "/api/v1/users",
  "state": "Zombie",
  "last_seen_days_ago": 210,
  "auth_present": false,
  "rate_limited": false,
  "tls_enabled": true,
  "in_gateway": false,
  "owasp_flags": ["API2", "API4", "API9"]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "endpoint": "/api/v1/users",
    "state": "Zombie",
    "severity": "High",
    "action_type": "decommission",
    "owasp_flags": ["API2", "API4", "API9"],
    "last_seen_days_ago": 210,
    "risk_summary": "...",
    "violations": "...",
    "technical_fix": "..."
  }
}
```

---

### `POST /analyze/batch`
Analyze multiple endpoints in one request. Accepts a list of the same record format as `/analyze`.

> **Note:** Swagger UI generates a single-item example by default. To test all endpoints at once, edit the request body manually or use curl:
> ```bash
> curl -X POST http://localhost:8000/analyze/batch \
>   -H "Content-Type: application/json" \
>   -d @data/mock_apis.json
> ```

**Response:**
```json
{
  "status": "success",
  "analyzed": 8,
  "errors": 0,
  "data": [...],
  "error_details": []
}
```

---

### `GET /decommission-queue`
Returns all Zombie and Rogue endpoints from the last batch run, sorted by severity with Critical first.

**Response:**
```json
{
  "status": "success",
  "total": 4,
  "queue": [
    {
      "endpoint": "/api/debug/internal",
      "state": "Rogue",
      "severity": "Critical",
      ...
    }
  ]
}
```

---

## OWASP Coverage

This module checks and explains four risks from the OWASP API Security Top 10 (2023):

| ID | Risk | How it is detected |
|---|---|---|
| API2 | Broken Authentication | `auth_present: false` on any endpoint |
| API4 | Unrestricted Resource Consumption | `rate_limited: false` on any endpoint |
| API8 | Security Misconfiguration | `tls_enabled: false` or other misconfig flags |
| API9 | Improper Inventory Management | `in_gateway: false` — endpoint not in official registry |

---

## Endpoint States

| State | Meaning | Typical action |
|---|---|---|
| Active | Known, registered, receiving traffic | Harden if violations found |
| Shadow | Receiving traffic but not registered anywhere | Investigate and register or remove |
| Zombie | No traffic in 90+ days, still reachable | Decommission immediately |
| Rogue | Created to bypass governance, no auth | Critical — block and escalate |

---

## SETUP

### Prerequisites
- Python 3.11+
- A Groq API key — free at https://console.groq.com

### Steps
```bash
# 1. Clone the repository
git clone https://github.com/avneeetk/spectre.git
cd spectre-ai
cd Harjot

# 2. Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac / Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create a .env file in the root folder with:
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama3-8b-8192

# 5. Start the server
python main.py
```

The server starts at `http://localhost:8000`.  
Interactive API docs are available at `http://localhost:8000/docs`.

---

## Testing

Run the agent against all mock endpoints:
```bash
python test_agent.py
```

Results are saved to `data/agent_results.json`.

Hit the decommission queue to verify output:
```bash
curl http://localhost:8000/decommission-queue
```

---

## CONTRIBUTORS

| Workflow | Name | Role |
|---|---|---|
| Member 1 | **Neeraj Gandhi** | Discovery engine and scanning |
| Member 2 | **Gurleen Kaur** | Classification and OWASP checker |
| Member 3 | **Harjot Kaur** | Agentic AI layer |
| Member 4 | **Avneet Kaur** | Dashboard and DevOps |