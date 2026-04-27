from fastapi import APIRouter, HTTPException
from services.data_loader import load_json, save_json

router = APIRouter()

def validate_onboarding(data):
    required = ["system_type", "regulations", "api_consumers", "critical_service"]
    for key in required:
        if key not in data or not data.get(key):
            raise ValueError(f"Missing {key}")
    return True

@router.get("/api/onboarding")
def get_onboarding():
    return load_json("onboarding.json", default={})

@router.post("/api/onboarding")
def set_onboarding(onboarding: dict):
    try:
        validate_onboarding(onboarding)
        save_json("onboarding.json", onboarding)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
