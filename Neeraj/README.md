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
│   ├── parsers/
│   │   ├── nginx_parser.py  ← reads Nginx config files, extracts location blocks
│   │   ├── kong_parser.py   ← reads Kong YAML configs, handles plugin-level auth
│   │   ├── ast_parser.py    ← walks Python AST to find FastAPI/Flask route decorators
│   │   └── traffic_parser.py← mitmproxy script, logs every HTTP endpoint observed
│   └── resolvers/
│       └── github_resolver.py ← fetches real configs directly from public GitHub repos
├── backend/
│   ├── main.py              ← FastAPI wrapper, exposes scanner over HTTP
│   └── requirements.txt
├── test_environment/
│   ├── docker-compose.yml   ← spins up mock services including a planted shadow API
│   └── services/
│       └── shadow_service/  ← FastAPI app with one undocumented endpoint for demo
├── test_files/
│   ├── test_nginx.conf          ← sample Nginx config with 5 routes, mixed auth
│   ├── test_kong.yml            ← sample Kong config with service and route level plugins
│   ├── test_fastapi_service.py  ← sample FastAPI app with 8 routes, mixed auth
│   └── test_flask_service.py    ← sample Flask app with 6 routes, mixed auth
├── output/                  ← gitignored, generated at runtime
│   ├── discovered_endpoints.json
│   └── traffic_log.json
├── .env                     ← gitignored, put your GITHUB_TOKEN here
├── .gitignore
├── requirements.txt
└── README.md
```

---

## How it works

### Step 1 : Choose your input source

When you run the scanner, it asks:

```
Do you want to scan a public GitHub repo? [Y/N]:
```

**If N** — scans the local test files in `test_files/` exactly as before.

**If Y** — opens the GitHub repo scanner. Paste any public repo URL and the scanner searches it for nginx configs, Kong configs, and Python route files. It shows you every file it finds and asks for confirmation before downloading anything. Only confirmed files get scanned.

### Step 2 : Each parser scans its source

The Nginx parser reads config files and extracts every `location` block. The Kong parser loads YAML and traverses the service/route/plugin tree. The AST parser walks Python syntax trees looking for `@app.get`, `@app.post`, `@app.route` etc. decorators. The traffic parser runs inside mitmproxy and logs every unique HTTP request it intercepts.

Each parser produces a list of endpoint records matching the schema defined in `schema.py`.

### Step 3 : main.py merges everything

`main.py` runs all four parsers and merges their outputs into one deduplicated list. If the same endpoint appears in two sources - say, found in both the Nginx config and the Python codebase - it becomes one record with `sources: ["nginx_config", "code_repository"]` rather than two separate records. This cross-referencing is where the real value is.

### Step 4 : Output

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
  "tags": ["nginx", "location:exact"],
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

### GitHub repo scanning (optional)

To scan real public GitHub repos, generate a free Personal Access Token:

1. Go to **github.com → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Note: `spectre-scanner`, Expiration: 90 days, Scope: tick only **`public_repo`**
4. Copy the token and add it to a `.env` file in the project root:

```
GITHUB_TOKEN=ghp_yourtoken
```

The `.env` file is already in `.gitignore` — it will never be committed. Without a token the scanner still works but is limited to 10 search API calls per hour (enough for roughly 1 repo scan). With a token that limit rises to 30 calls per minute.

---

## Running the scanner

### Quick run : file parsers only

No Docker needed. Scans the local test files and produces output.
```bash
python scanner/main.py
```

When prompted, enter `N` to skip GitHub and scan local files directly.

### Scanning a real GitHub repo

```bash
python scanner/main.py
```

When prompted:
```
Do you want to scan a public GitHub repo? [Y/N]: Y

──────────────────────────────────────────────────
  GitHub Repo Scanner
──────────────────────────────────────────────────
  (type 'exit' at any prompt to cancel)

Enter public GitHub repo URL: https://github.com/owner/repo

[github] Checking owner/repo...
  ✓ Repo found

[github] Searching owner/repo for API-related files...
  Searching for Nginx config files...
    → 1 result(s)
  Searching for Kong config (.yml) files...
    → 0 result(s)
  Searching for Kong config (.yaml) files...
    → 0 result(s)
  Searching for Kong config (filename .yaml) files...
    → 0 result(s)
  Searching for Kong config (filename .yml) files...
    → 0 result(s)
  Searching for Python routes (app.get)...
    → 3 result(s)
  Searching for Python routes (app.post)...
    → 2 result(s)
  Searching for Python routes (router)...
    → 0 result(s)

[github] Found 2 candidate file(s):

  Scan nginx/nginx.conf (Nginx config)? [Y/N]: Y
  ✓ Added
  Scan services/api/routes.py (Python routes (get))? [Y/N]: Y
  ✓ Added

[github] Downloading 2 confirmed file(s)...
  ✓ nginx/nginx.conf
  ✓ services/api/routes.py

[github] Ready to scan:
  Nginx configs : 1 file(s)
  Python files  : ready
  Traffic log   : not available from repo (skipped)
```

The scanner runs 8 search queries per scan (nginx, kong × 4, python × 3). Multiple Kong queries are needed because Kong config files can use either `.yml` or `.yaml` extensions and may be named explicitly `kong.yaml` or `kong.yml`. Deduplication ensures a file matched by more than one query is only shown once in the confirmation list.

If no matching files are found or you exit early, you are offered the option to fall back to local test files instead. If you enter an invalid URL or an inaccessible repo, the scanner tells you what went wrong and lets you try again — it never silently falls back.

**Note:** Traffic logs cannot be retrieved from a GitHub repo — they are runtime data. Traffic analysis requires the mitmproxy setup described below.

### Verified test repos

These public repos are confirmed to work well for demo and testing purposes:

| Source | Repo | What it finds |
|--------|------|---------------|
| Nginx | https://github.com/remp2020/remp | Multi-server nginx config with PHP and proxy routes |
| Kong | https://github.com/Kong/kong-proxy-docker | `kong.yaml` with service and route definitions |
| Python AST | https://github.com/testdrivenio/fastapi-crud-async | FastAPI app with full CRUD route decorators |

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

Watch Terminal 2 — you will see:
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

## Parser details

### Nginx parser

Handles all four location modifier types (`~`, `~*`, `=`, `^~`) and one level of nested braces. Extracts `server_name` from each server block and uses it to generate unique endpoint IDs — so if three different virtual hosts all have a `/` location, they produce three separate records instead of one. Also resolves service names from the `set $upstream host:port` pattern commonly used in Docker-based nginx setups, in addition to direct `proxy_pass` URLs.

The `tags` field includes the modifier type for each location, e.g. `["nginx", "location:~"]`.

### Kong parser

Requires `_format_version` at the top of the YAML file to confirm it is a Kong declarative config. This guard prevents false positives from Docker Compose files and other YAMLs that happen to have a `services` key. Auth plugin inheritance follows Kong's priority order: route-level overrides service-level, which overrides global (top-level `plugins` list).

### AST parser

Supports both **FastAPI** and **Flask** route decorators:

- FastAPI: `@app.get("/path")`, `@router.post("/path")`, async handlers
- Flask: `@app.route("/path", methods=["GET", "POST"])`, defaults to GET when `methods=` is omitted

Auth detection checks function argument names, `Depends()` values, and decorators like `@require_token`, `@login_required`, `@jwt_required`. Tags indicate the framework: `["python", "fastapi"]` or `["python", "flask"]`.

The parser does not support Go, Node.js, Java, or other languages. These are planned for a future release.

### Traffic parser

Runs as a mitmproxy script - not called directly but loaded via `mitmdump`. Intercepts every HTTP request flowing through the proxy and logs unique endpoints to `output/traffic_log.json`. Each entry records the method, path, host, auth header type if present, and a timestamp. On subsequent requests to the same endpoint, only `last_seen` is updated rather than creating a duplicate.

The parser filters out noise paths (`/health`, `/favicon.ico`, `/robots.txt`) and by default only logs paths beginning with `/api` or `/internal`. Status codes are captured from the response leg and appended to the endpoint record. Traffic data is the only source that can detect shadow APIs with no footprint in any config file or codebase.

---

## Running the FastAPI backend

The backend exposes the scanners over HTTP, so they can be called without running Python locally.

### Start the backend
```bash
uvicorn backend.main:app --reload --port 8000
```

### Interactive API docs

Once running, open this in your browser:
```
http://localhost:8000/docs
```

FastAPI generates a full interactive documentation page. You can test all endpoints directly from the browser without writing any code.

---

## API endpoints

### `GET /ping`
Wake-up check. Use this to verify the backend is running.

**Response:**
```json
{"status": "ok", "service": "SPECTRE Discovery Engine"}
```

---

### `POST /scan/sample`
Runs the real parsers on the bundled test files in `test_files/`. No uploads needed.

For the traffic log, it checks `output/traffic_log.json` first (real mitmproxy capture). If that doesn't exist, it falls back to `test_files/traffic_log.json` (sample data with 1 planted shadow API).

You can tell which was used from the `traffic_source` field in the response : `"network env sample"` or `"hardcoded sample"`.

**Response:**
```json
{
  "total": 11,
  "shadow_count": 1,
  "no_auth_count": 5,
  "sources_scanned": 4,
  "traffic_source": "sample",
  "endpoints": [ ...list of APIEndpoint objects... ]
}
```

---

### `POST /scan/upload`
Accepts uploaded config files and runs the real parsers on them. Parsers fall back to sample files for any source not provided.

**Accepted fields:**

| Field | Type | Description |
|-------|------|-------------|
| `nginx` | `.conf` file | Nginx config to scan |
| `kong` | `.yml` / `.yaml` file | Kong declarative config to scan |
| `py` | `.py` file | Python service file to scan |
| `traffic` | `.json` file | mitmproxy traffic log in SPECTRE schema format |

**Response:** same format as `/scan/sample`.

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
| `requests` | GitHub API calls for repo scanning |
| `mitmproxy` | Live HTTP traffic interception |
| Docker Compose | Mock service environment |
| `dataclasses` | Typed endpoint schema |
| `FastAPI` | HTTP wrapper around the scanner for team integration |
| `uvicorn` | ASGI server |

---

## Part of a larger system

This repository is the discovery stage of the SPECTRE platform. The output file `discovered_endpoints.json` feeds into:

- **Classifier** : labels each endpoint as Active, Shadow, Zombie, or Rogue
- **OWASP Checker** : tests each endpoint against API2, API4, API8, API9
- **AI Layer** : generates plain-English risk summaries using LangChain + RAG
- **Dashboard** : displays everything in a React monitoring interface
