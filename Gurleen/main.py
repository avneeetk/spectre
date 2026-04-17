from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional


from models import DiscoveredEndpoint, EndpointRecord, APIState, OWASPResult, DataSensitivity

# Your existing classification functions
from classification.classifier import classify
from classification.sensitivity import detect_sensitivity

# OWASP checks (owasp/checks.py)
# from owasp.checker import run_all_checks

# risk.py is empty for now — this try/except means the app still starts
try:
    from classification.risk import compute_risk
except ImportError:
    compute_risk = None


app = FastAPI(
    title="SPECTRE Classification API",
    version="0.1.0",
)

# GET /health- to check server is running
@app.get("/health")
def health():
    return {"status": "ok"}


# POST /classify

@app.post("/classify", response_model=EndpointRecord)
def classify_endpoint(ep: DiscoveredEndpoint):
    # Step 1: Run your classifier
    # classify() is from classifier.py — it looks at ep.in_gateway,
    # ep.in_repo, ep.seen_in_traffic, ep.path_conflict, ep.last_seen etc.
    # and returns one of: ROGUE, SHADOW, ZOMBIE, ACTIVE, UNKNOWN
    # plus a human-readable reason string.
    state, state_reason = classify(ep)

    sensitivity, sensitivity_score = detect_sensitivity(ep.path)


    if compute_risk is not None:
        risk_score, risk_factors = compute_risk(ep, state, sensitivity)
    else:
        risk_score, risk_factors = _stub_risk(state, sensitivity_score)


    return EndpointRecord(
        endpoint_id=ep.id,
        path=ep.path,
        method=ep.method,
        host=ep.service_name,
        state=state,
        state_reason=state_reason,
        data_sensitivity=sensitivity,
        sensitivity_score=sensitivity_score,
        risk_score=risk_score,
        risk_factors=risk_factors,
        owasp_failures=[],
        scanned_at=datetime.now(timezone.utc),
    )


# POST /classify/batch

@app.post("/classify/batch", response_model=list[EndpointRecord])
def classify_batch(endpoints: list[DiscoveredEndpoint]):
    if not endpoints:
        raise HTTPException(status_code=400, detail="Endpoint list is empty.")
    return [classify_endpoint(ep) for ep in endpoints]


# POST /owasp

class OWASPRequest(BaseModel):
    endpoint: DiscoveredEndpoint
    base_url: Optional[str] = None
    active: bool = False


class OWASPResponse(BaseModel):
    endpoint_id: str
    path: str
    checks_run: int             # how many OWASP checks were executed
    failures: list[OWASPResult] # only the checks that FAILED
    all_passed: bool            # convenience flag
    scanned_at: datetime


@app.post("/owasp", response_model=OWASPResponse)
def owasp_scan(req: OWASPRequest):
    if req.active and not req.base_url:
        raise HTTPException(
            status_code=422,
            detail="base_url is required when active=true."
        )


    # results = run_all_checks(
    #     ep=req.endpoint,
    #     base_url=req.base_url,
    #     active=req.active,
    # )

    # failures = [r for r in results if not r.passed]

    # return OWASPResponse(
    #     endpoint_id=req.endpoint.id,
    #     path=req.endpoint.path,
    #     checks_run=len(results),
    #     failures=failures,
    #     all_passed=len(failures) == 0,
    #     scanned_at=datetime.now(timezone.utc),
    # )



# Stub risk scorer

def _stub_risk(state: APIState, sensitivity_score: float) -> tuple[float, list[str]]:
    # Base risk score by state
    base = {
        APIState.ROGUE:   0.95,  # worst — unregistered + conflict
        APIState.SHADOW:  0.80,  # bad — live but totally undocumented
        APIState.ZOMBIE:  0.60,  # stale — still reachable, no traffic
        APIState.ACTIVE:  0.20,  # healthy
        APIState.UNKNOWN: 0.50,  # can't tell — flag for review
    }.get(state, 0.50)

    # Nudge score up slightly if sensitive data is involved
    score = min(1.0, round(base + sensitivity_score * 0.1, 2))

    # Human-readable list of why this score is what it is
    factors = []
    if state == APIState.ROGUE:
        factors.append("Unregistered endpoint with path conflict")
    if state == APIState.SHADOW:
        factors.append("Live traffic with no documentation or gateway entry")
    if state == APIState.ZOMBIE:
        factors.append("No recent traffic — endpoint still reachable")
    if sensitivity_score > 0:
        factors.append(f"Sensitive data path detected (score={sensitivity_score})")

    return score, factors
