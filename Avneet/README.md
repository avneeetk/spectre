# Avneet's Part: Member 4 Dashboard + Backend Integration

> **Member 4: Avneet Kaur**  
> Dashboard, frontend integration, backend orchestration, and DevOps handoff

This folder contains my part of the SPECTRE project:

- `frontend/` - React + Vite + Tailwind dashboard UI
- `backend/` - FastAPI backend that connects M1, M2, and M3 and serves the frontend data

## What My Part Does

My backend is the integration layer between the other teammates' services:

- `M1` scanner on port `8001`
- `M2` classifier on port `8003`
- `M3` AI layer on port `8002`
- my backend on port `8000`
- my frontend on port `5173`

The backend exposes inventory, graph, queue, onboarding, and scan endpoints for the UI.

This means my work is the layer that turns three separate technical modules into one usable product. Instead of raw JSON from different services, the user gets a guided flow, a live dashboard, queue-based action items, and one place to trigger and review the full SPECTRE pipeline.

## What I Built

I worked on both the product-facing frontend and the orchestration backend.

### Frontend work

- built the full React dashboard experience for SPECTRE
- created the multi-step user flow: landing page, onboarding, scan setup, discovery phase, classification phase, AI analysis phase, and final dashboard
- added endpoint inventory views with prioritization, risk summaries, endpoint detail modal, and state-based badges
- added knowledge graph screens and service context views so relationships between APIs can be visualized
- added decommission queue interactions so risky endpoints can be reviewed and marked with actions
- supported mock mode and live mode so the UI stays usable during development and demos

### Backend work

- built the FastAPI gateway used by the dashboard on port `8000`
- exposed clean dashboard endpoints for inventory, graph, onboarding, queue, health, and scan control
- orchestrated the live `M1 -> M2 -> M3` pipeline from one backend route instead of making the frontend talk to each member service directly
- normalized and merged outputs from the scanner, classifier, and AI layer into one UI-ready inventory format
- saved debug artifacts in `Avneet/backend/data/` so pipeline runs can be inspected and reused
- added queue persistence and onboarding persistence for dashboard state

### DevOps and integration work

- connected all four members' services through `docker-compose.yml`
- configured health checks and service ordering so the frontend starts only after the backend is healthy, and the backend waits for scanner, classifier, and agent services
- made the dashboard layer the final handoff point where the whole SPECTRE system can be demonstrated end to end

## Architecture

```text
Member 1 Scanner (8001)
        |
        v
Member 2 Classifier (8003)
        |
        v
Member 3 AI Layer (8002)
        |
        v
Member 4 Backend Gateway (8000)
        |
        v
Member 4 Frontend Dashboard (5173)
```

In practice, my backend also checks service health, stores onboarding context, builds graph data, prepares queue items, and returns one consistent response format that the frontend can render without needing to understand each teammate's internal schema.

## Key Dashboard Features

- onboarding flow that captures system type, regulations, API consumers, and critical service context
- scan configuration flow for starting a fresh run
- live inventory view with endpoint states like `active`, `shadow`, `zombie`, and `rogue`
- AI-backed findings display including violations, risk summaries, and technical fixes
- knowledge graph view built from merged endpoint relationships
- decommission queue for high-priority or risky APIs
- live health-aware data loading with mock fallback for development

## Why My Part Matters

The other modules generate discovery, classification, and AI analysis. My work is what makes that output understandable and actionable for a real user. It is the part of SPECTRE that behaves like the finished platform: the operator can onboard a system, run a scan, see prioritized risky endpoints, inspect graph relationships, and decide what to decommission or fix next.

## Quick Start For Teammates

The easiest way to run everything is from the project root:

```bash
docker compose up --build
```

Before running Docker, add a root `.env` file if you want GitHub-backed scanning to work cleanly:

```env
GITHUB_TOKEN=your_github_personal_access_token
```

This token is passed into the scanner service through `docker-compose.yml`. It is especially useful when the scan flow needs to read public GitHub repositories without hitting low anonymous rate limits.

Then open:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8000/health`
- Scanner health: `http://localhost:8001/ping`
- Agent health: `http://localhost:8002/health`
- Classifier health: `http://localhost:8003/health`

## Recommended Run Order

If you are not using Docker, start services in this order:

1. `Neeraj` scanner
2. `Harjot` AI layer
3. `Gurleen` classifier
4. `Avneet/backend`
5. `Avneet/frontend`

My backend depends on the other three services being available.

## Environment Variable

If you are using repository-based scanning, create a `.env` file in the project root and add:

```env
GITHUB_TOKEN=your_github_personal_access_token
```

Notes:

- this is the GitHub token used by the scanner service
- place the `.env` file at the root of the project, beside `docker-compose.yml`
- without it, local demo flows may still run, but GitHub scanning can fail or get rate-limited
- never commit the real token to Git

## Local Run: Backend

From the repo root:

```bash
cd Avneet/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend base URL:

```text
http://localhost:8000
```

Useful backend routes:

- `GET /health`
- `GET /api/inventory`
- `POST /api/inventory/refresh`
- `GET /api/graph`
- `GET /api/queue`
- `GET /api/onboarding`
- `POST /api/scan/trigger`
- `GET /api/scan/health/services`

## Local Run: Frontend

From the repo root:

```bash
cd Avneet/frontend
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

Useful frontend commands:

```bash
npm run build
npx eslint .
npm test
```

## Notes About Data Flow

- The frontend reads live data from the FastAPI backend.
- The backend merges scanner output and AI analysis into UI-ready inventory.
- `POST /api/inventory/refresh` triggers the full `M1 -> M2 -> M3` pipeline and reloads inventory.
- Debug pipeline artifacts are written to `Avneet/backend/data/`.

## If Something Is Not Loading

Check these first:

1. Are ports `8000`, `8001`, `8002`, `8003`, and `5173` free?
2. Are all three teammate services healthy?
3. Does `http://localhost:8000/api/scan/health/services` show healthy downstream services?
4. If frontend is up but empty, try `POST /api/inventory/refresh` or re-run the scan from the UI.

## Folder Map

```text
Avneet/
  backend/
    main.py
    routers/
    services/
    data/
  frontend/
    src/
    package.json
```

## Handoff Summary

If you just want to run my part with the full system:

```bash
docker compose up --build
```

If you only want to work on my UI/backend locally:

- start teammates' services first
- run `Avneet/backend`
- run `Avneet/frontend`

## Contributor Role

| Workflow | Name | Role |
|---|---|---|
| Member 4 | **Avneet Kaur** | Dashboard and DevOps |
