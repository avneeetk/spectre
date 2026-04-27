from __future__ import annotations

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from services.data_loader import get_merged_inventory
from routers.scan import trigger_scan, ScanRequest

router = APIRouter()


@router.get("/api/inventory")
def get_inventory() -> list[dict]:
    return get_merged_inventory()


@router.post("/api/inventory/refresh")
def refresh_inventory(body: dict | None = None):
    """
    Trigger a fresh scan and return updated inventory.
    This runs M1 → M2 → M3 pipeline and returns the merged results.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Run the scan pipeline
    payload = body if isinstance(body, dict) else {}
    scan_result = trigger_scan(ScanRequest(use_cache=False, **payload))
    logger.info(f"[refresh] Scan complete. Sources: {scan_result.get('sources', {})}")
    
    # Get fresh inventory from newly saved files
    fresh_inventory = get_merged_inventory()
    logger.info(f"[refresh] Fresh inventory loaded: {len(fresh_inventory)} endpoints")
    
    return {
        "scan": scan_result,
        "inventory": fresh_inventory,
    }


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
