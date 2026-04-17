from fastapi import FastAPI
from routers import onboarding, inventory, queue, graph
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

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

HEALTH_CHECK_ENDPOINTS = [
    "/api/inventory",
    "/api/queue",
    "/api/onboarding",
    "/api/graph",
]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "routes": HEALTH_CHECK_ENDPOINTS}
