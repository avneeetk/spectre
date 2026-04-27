# Avneet's Part: Dashboard + Backend Integration

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

## Quick Start For Teammates

The easiest way to run everything is from the project root:

```bash
docker compose up --build
```

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
