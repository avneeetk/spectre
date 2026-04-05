from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.agent_loop import run_agent

router = APIRouter()


# ─────────────────────────────────────────────
# Input schema
# This is what Member 4 sends TO your API
# ─────────────────────────────────────────────

class APIRecord(BaseModel):
    endpoint: str
    state: str
    last_seen_days_ago: int
    auth_present: bool
    rate_limited: bool
    tls_enabled: bool
    in_gateway: bool
    owasp_flags: list[str]


# ─────────────────────────────────────────────
# Route 1: Analyze a single endpoint
# POST /analyze
# ─────────────────────────────────────────────

@router.post("/analyze")
async def analyze_single(record: APIRecord):
    try:
        result = run_agent(record.model_dump())
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# Route 2: Analyze a batch of endpoints
# POST /analyze/batch
# ─────────────────────────────────────────────

@router.post("/analyze/batch")
async def analyze_batch(records: list[APIRecord]):
    results = []
    errors = []

    for record in records:
        try:
            result = run_agent(record.model_dump())
            results.append(result)
        except Exception as e:
            errors.append({
                "endpoint": record.endpoint,
                "error": str(e)
            })

    return {
        "status": "success",
        "analyzed": len(results),
        "errors": len(errors),
        "data": results,
        "error_details": errors
    }


# ─────────────────────────────────────────────
# Route 3: Get the decommission queue
# GET /decommission-queue
# This is what Member 4 shows on the dashboard
# ─────────────────────────────────────────────

@router.get("/decommission-queue")
async def get_decommission_queue():
    results_path = "data/agent_results.json"

    if not os.path.exists(results_path):
        raise HTTPException(
            status_code=404,
            detail="No results found. Run /analyze/batch first."
        )

    with open(results_path) as f:
        all_results = json.load(f)

    queue = [
        r for r in all_results
        if r["state"] in ["Zombie", "Rogue"]
    ]

    severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    queue.sort(key=lambda x: severity_order.get(x["severity"], 4))

    return {
        "status": "success",
        "total": len(queue),
        "queue": queue
    }


# ─────────────────────────────────────────────
# Route 4: Health check
# GET /health
# Member 4 can ping this to check if the service is running
# ─────────────────────────────────────────────

@router.get("/health")
async def health_check():
    return {"status": "online", "service": "SPECTRE AI Layer"}