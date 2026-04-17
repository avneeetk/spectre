from __future__ import annotations

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from services.data_loader import get_merged_inventory

router = APIRouter()


@router.get("/api/inventory")
def get_inventory() -> list[dict]:
    return get_merged_inventory()


@router.get("/api/inventory/{endpoint_id:path}")
def get_inventory_item(endpoint_id: str) -> dict:
    key = unquote(endpoint_id)
    for ep in get_merged_inventory():
        if ep.get("id") == key:
            return ep
        if ep.get("endpoint") == key:
            return ep
        if ep.get("path") == key:
            return ep
    raise HTTPException(status_code=404, detail="Endpoint not found")
