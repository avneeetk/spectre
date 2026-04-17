from fastapi import APIRouter

from services.data_loader import get_merged_inventory
from services.graph_builder import build_graph

router = APIRouter()


@router.get("/api/graph")
def get_graph() -> dict:
    return build_graph(get_merged_inventory())
