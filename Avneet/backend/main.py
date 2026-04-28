from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from routers import onboarding, inventory, queue, graph, scan

app = FastAPI(
    title="SPECTRE Dashboard API",
    description="Dashboard API for M1 discovery, M2 classification, and the M3 AI Layer.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(onboarding.router)
app.include_router(inventory.router)
app.include_router(queue.router)
app.include_router(graph.router)
app.include_router(scan.router)

HEALTH_CHECK_ENDPOINTS = [
    "/api/inventory",
    "/api/inventory/refresh",
    "/api/queue",
    "/api/onboarding",
    "/api/graph",
    "/api/scan/trigger",
    "/api/scan/health/services",
]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "routes": HEALTH_CHECK_ENDPOINTS}
