# SPECTRE : Discovery Engine

> API surface scanner for the SPECTRE API Threat Classification Platform

---

## What this is

This repository contains the **discovery engine** for SPECTRE, a platform that finds and classifies dangerous APIs in an organization's network.

The discovery engine's job is simple but critical: **find every API endpoint that exists, from every possible source, and produce one unified list.** That list is what the rest of the platform runs on.

It scans four sources in parallel:

- **Nginx config files** : officially registered routes at the gateway level
- **Kong gateway configs** : YAML-based API gateway route definitions
- **Python source code** : routes defined in FastAPI/Flask apps via AST parsing, even if never registered in a gateway
- **Live network traffic** : HTTP requests captured via mitmproxy, catching endpoints that exist in no file anywhere

The output is a single JSON file : `discovered_endpoints.json`, containing every unique endpoint found, where it was found, whether auth was detected, and when it was last seen in traffic. This file feeds into the classifier, OWASP checker, and AI explanation layer in the broader SPECTRE pipeline.

---

## Why this matters

Most API security tools only look in one place. If an endpoint isn't in the gateway config, they miss it. This scanner looks in four places simultaneously and cross-references them, so an endpoint that appears in traffic but exists in no config or codebase gets flagged immediately as a shadow API.

This is a direct technical implementation of **OWASP API9: Improper Inventory Management** - the most common root cause of API security breaches.

---

## Project structure
```
spectre-discovery/
├── scanner/
│   ├── schema.py            ← shared data contract, defines one endpoint record
│   ├── main.py              ← entry point, runs all parsers and combines output
│   └── parsers/
│       ├── nginx_parser.py  ← reads Nginx config files, extracts location blocks
│       ├── kong_parser.py   ← reads Kong YAML configs, handles plugin-level auth
│       ├── ast_parser.py    ← walks Python AST to find FastAPI/Flask route decorators
│       └── traffic_parser.py← mitmproxy script, logs every HTTP endpoint observed
├── test_environment/
│   ├── docker-compose.yml   ← spins up mock services including a planted shadow API
│   └── services/
│       └── shadow_service/  ← FastAPI app with one undocumented endpoint for demo
├── test_files/
│   ├── test_nginx.conf      ← sample Nginx config with 5 routes, mixed auth
│   ├── test_kong.yml        ← sample Kong config with service and route level plugins
│   └── test_fastapi_service.py ← sample FastAPI app with 8 routes, mixed auth
├── output/                  ← gitignored, generated at runtime
│   ├── discovered_endpoints.json
│   └── traffic_log.json
├── .gitignore
├── requirements.txt
└── README.md
```

---

## How it works

### Step 1 : Each parser scans its source

The Nginx parser reads config files and extracts every `location` block using regex. The Kong parser loads YAML and traverses the service/route/plugin tree. The AST parser walks Python syntax trees looking for `@app.get`, `@app.post` etc. decorators. The traffic parser runs inside mitmproxy and logs every unique HTTP request it intercepts.

Each parser produces a list of endpoint records matching the schema defined in `schema.py`.

### Step 2 : main.py merges everything

`main.py` runs all four parsers and merges their outputs into one deduplicated list. If the same endpoint appears in two sources - say, found in both the Nginx config and the Python codebase - it becomes one record with `sources: ["nginx_config", "code_repository"]` rather than two separate records. This cross-referencing is where the real value is.

### Step 3 : Output

The final `discovered_endpoints.json` has one record per unique endpoint. Each record carries:
- Where it was found (`sources`, `in_gateway`, `in_repo`, `seen_in_traffic`)
- Whether authentication was detected and what type
- HTTP status codes observed in traffic
- The raw context it was found in (for AI explanation later)
- A `state` field defaulting to `"unknown"` : filled in by the classifier

---

## Endpoint record format

Every discovered endpoint looks like this:
```json
{
  "id": "1316b67f45e6",
  "method": "GET",
  "path": "/api/v1/users",
  "service_name": "user-service",
  "sources": ["nginx_config", "code_repository"],
  "in_repo": true,
  "in_gateway": true,
  "seen_in_traffic": true,
  "auth_detected": false,
  "auth_type": "none",
  "status_codes": [200],
  "last_seen": "2025-03-17T10:00:00Z",
  "tags": ["nginx", "python"],
  "raw_context": "location /api/v1/users { proxy_pass http://user-service; }",
  "also_found_in_conflict_with": null,
  "state": "unknown",
  "owasp_flags": [],
  "risk_reason": ""
}
```

`state`, `owasp_flags`, and `risk_reason` are left as defaults. They get populated by the classifier in the next stage of the pipeline.

---

## Setup

**Requirements:** Python 3.11+, Docker Desktop, Git
```bash
# Clone
git clone https://github.com/YOURNAME/spectre-discovery.git
cd spectre-discovery

# Virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux

# Dependencies
pip install -r requirements.txt

# Verify
python scanner/schema.py
# Should print a sample endpoint and "Valid - no errors found."
```

---

## Running the scanner

### Quick run : file parsers only

No Docker needed. Scans the test files and produces output.
```bash
python scanner/main.py
```

### Full run : including live traffic capture

Needs three terminal windows.

**Terminal 1 : start mock services:**
```bash
cd test_environment
docker-compose up --build
```
Wait for `Uvicorn running on http://0.0.0.0:8000`

**Terminal 2 : start mitmproxy:**
```bash
mitmdump -s scanner/parsers/traffic_parser.py --listen-port 8080
```

**Terminal 3 : send traffic through the proxy:**
```bash
# Windows
curl.exe --proxy http://localhost:8080 http://localhost:8000/api/v1/users
curl.exe --proxy http://localhost:8080 http://localhost:8000/api/v2/internal/users
```

Watch Terminal 2 : you will see:
```
[traffic] NEW endpoint: GET /api/v1/users
[traffic] NEW endpoint: GET /api/v2/internal/users
```

`/api/v2/internal/users` is the planted shadow API. It exists in no config file and no codebase, only in traffic. The scanner detects it.

**Terminal 3 : run the full scanner:**
```bash
python scanner/main.py
```

Expected output:
```
[scanner] Running Nginx parser...
[scanner] Running Kong parser...
[scanner] Running AST parser...
[scanner] Loading traffic log...
[scanner] Total unique endpoints found: 13
[scanner] All 13 endpoints valid.

[scanner] Shadow APIs detected:
  !! GET /api/v2/internal/users - in traffic only, not in any config or repo
```

---

## Testing individual parsers
```bash
python scanner/parsers/nginx_parser.py
python scanner/parsers/ast_parser.py
python scanner/parsers/kong_parser.py
```

Each one reads from `test_files/`, prints its findings with validation results, and saves a sample JSON to `output/`.

---

## Adding a new source to scan

1. Create a new file in `scanner/parsers/` - e.g. `kubernetes_parser.py`
2. Write a function that returns a list of `APIEndpoint` objects using `create_endpoint()` from `schema.py`
3. Add it to the `SCAN_CONFIG` dictionary in `main.py`
4. Add the source string to `VALID_SOURCES` in `schema.py`

The merger in `main.py` handles deduplication automatically. Your new parser just needs to return the right format.

---

## Tech stack

| Tool | Purpose |
|------|---------|
| Python 3.11 | Core language |
| `ast` module | Syntax tree parsing for route extraction |
| `pyyaml` | Kong YAML config parsing |
| `mitmproxy` | Live HTTP traffic interception |
| Docker Compose | Mock service environment |
| `dataclasses` | Typed endpoint schema |

---

## Part of a larger system

This repository is the discovery stage of the SPECTRE platform. The output file `discovered_endpoints.json` feeds into:

- **Classifier** : labels each endpoint as Active, Shadow, Zombie, or Rogue
- **OWASP Checker** : tests each endpoint against API2, API4, API8, API9
- **AI Layer** : generates plain-English risk summaries using LangChain + RAG
- **Dashboard** : displays everything in a React monitoring interface