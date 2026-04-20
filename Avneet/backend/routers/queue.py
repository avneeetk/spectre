from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from services.data_loader import get_merged_inventory, load_json, save_json

router = APIRouter()


def _is_queue_state(state: str | None) -> bool:
    if not state:
        return False
    return state.strip().lower() in {"zombie", "rogue"}


def _load_actions() -> dict:
    actions = load_json("queue_actions.json", default={})
    return actions if isinstance(actions, dict) else {}


@router.get("/api/queue")
def get_queue() -> list[dict]:
    actions = _load_actions()
    inventory = [ep for ep in get_merged_inventory() if _is_queue_state(ep.get("state"))]
    inventory.sort(key=lambda ep: ep.get("importance_score") or 0, reverse=True)

    for ep in inventory:
        api_id = ep.get("id") or ep.get("endpoint")
        stored = actions.get(api_id) if api_id else None
        if isinstance(stored, dict):
            ep["queue_status"] = stored.get("status", "pending")
            ep["queue_added_at"] = stored.get("added_at")
        elif isinstance(stored, str):
            ep["queue_status"] = stored
        else:
            ep["queue_status"] = "pending"
    return inventory


@router.post("/api/queue/{endpoint_id:path}/action")
def set_queue_action(endpoint_id: str, body: dict) -> dict:
    key = unquote(endpoint_id)
    action = body.get("action")
    if action not in {"pending", "approve", "dismiss"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    actions = _load_actions()
    # Store in a UI-friendly way keyed by api_id (fallback: endpoint path).
    prev = actions.get(key)
    added_at = prev.get("added_at") if isinstance(prev, dict) else None
    actions[key] = {"status": action, "added_at": added_at}
    if actions[key]["added_at"] is None:
        actions[key]["added_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    save_json("queue_actions.json", actions)
    return {"endpoint": key, "status": action}
