from __future__ import annotations

from collections import defaultdict
import json
import os

try:
    import networkx as nx  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    nx = None  # type: ignore


# Optional dependency config file (demo -> real bridge).
# Format: [["service-a","service-b"], ["service-b","service-c"]]
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DEPENDENCIES_FILE = os.path.join(DATA_DIR, "known_dependencies.json")


# Optional fallback when no dependency config is provided.
# Keep empty by default so we never show "wrong" edges for a real project.
KNOWN_DEPENDENCIES: list[tuple[str, str]] = []


_STATE_SEVERITY = {
    "Rogue": 4,
    "Zombie": 3,
    "Shadow": 2,
    "Active": 1,
    "Unknown": 0,
}

_STATE_COLOURS = {
    "Active": "#085041",
    "Zombie": "#E24B4A",
    "Shadow": "#534AB7",
    "Rogue": "#EF9F27",
    "Unknown": "#6B7280",
}


def _normalise_state(state: str | None) -> str:
    if not state:
        return "Unknown"
    for canonical in ("Active", "Shadow", "Zombie", "Rogue"):
        if state.strip().lower() == canonical.lower():
            return canonical
    return "Unknown"


def _heuristic_dependencies(services: list[str], by_service: dict[str, list[dict]]) -> list[tuple[str, str]]:
    """
    Best-effort edges when we don't have real dependency telemetry yet.
    Goal: avoid an empty graph for Stage-2 demos while keeping logic explainable.

    Heuristic:
      - Pick a "core" service (prefer auth/identity, then accounts/user, else max api_count)
      - Add edges from every other service -> core
      - Add a couple of common-sense edges if names exist (payment->account, account->user)
    """
    if len(services) < 2:
        return []

    def score(service_name: str) -> int:
        name = service_name.lower()
        base = len(by_service.get(service_name, []))
        if any(k in name for k in ("auth", "identity", "iam")):
            return base + 1000
        if any(k in name for k in ("account", "accounts")):
            return base + 700
        if "user" in name:
            return base + 600
        if any(k in name for k in ("payment", "payments")):
            return base + 400
        return base

    core = max(services, key=score)
    deps: list[tuple[str, str]] = [(s, core) for s in services if s != core]

    def pick(substrs: tuple[str, ...]) -> str | None:
        for s in services:
            if any(sub in s.lower() for sub in substrs):
                return s
        return None

    payment = pick(("payment", "payments"))
    account = pick(("account", "accounts"))
    user = pick(("user",))

    extras: list[tuple[str, str]] = []
    if payment and account and payment != account:
        extras.append((payment, account))
    if account and user and account != user:
        extras.append((account, user))

    for edge in extras:
        if edge not in deps and edge[0] != edge[1]:
            deps.append(edge)

    return deps


def _load_known_dependencies() -> list[tuple[str, str]]:
    """
    Loads dependencies from Avneet/backend/data/known_dependencies.json if present.
    This keeps the graph correct for real projects without hardcoding.
    """
    try:
        if not os.path.exists(DEPENDENCIES_FILE):
            return KNOWN_DEPENDENCIES
        with open(DEPENDENCIES_FILE, "r") as f:
            raw = f.read().strip()
            if not raw:
                return KNOWN_DEPENDENCIES
            data = json.loads(raw)
        deps: list[tuple[str, str]] = []
        if isinstance(data, list):
            for item in data:
                if isinstance(item, (list, tuple)) and len(item) == 2:
                    a, b = item
                    if isinstance(a, str) and isinstance(b, str):
                        deps.append((a, b))
        return deps or KNOWN_DEPENDENCIES
    except Exception:
        return KNOWN_DEPENDENCIES


def build_graph(inventory: list[dict]) -> dict:
    """
    Build a Cytoscape.js-compatible graph for the dashboard.
    Nodes = services, edges = dependencies, centrality = degree_centrality.
    """

    by_service: dict[str, list[dict]] = defaultdict(list)
    for ep in inventory:
        service_name = ep.get("service_name") or "unknown"
        by_service[service_name].append(ep)

    services = sorted(by_service.keys())
    known_deps = _load_known_dependencies()
    if known_deps:
        dependency_source = "file" if os.path.exists(DEPENDENCIES_FILE) else "static"
    else:
        dependency_source = "heuristic"
        known_deps = _heuristic_dependencies(services, by_service)

    if nx is not None:
        g = nx.DiGraph()
        g.add_nodes_from(services)
    else:
        g = {"nodes": set(services), "edges": set()}

    unmatched_dependencies: list[tuple[str, str]] = []
    for source, target in known_deps:
        if source in by_service and target in by_service:
            if nx is not None:
                g.add_edge(source, target)
            else:
                g["edges"].add((source, target))
        else:
            unmatched_dependencies.append((source, target))

    if nx is not None:
        centrality = nx.degree_centrality(g) if g.number_of_nodes() else {}
        edge_iter = list(g.edges())
    else:
        node_count = len(g["nodes"])
        denom = max(node_count - 1, 1)
        degrees: dict[str, int] = {n: 0 for n in g["nodes"]}
        for s, t in g["edges"]:
            degrees[s] = degrees.get(s, 0) + 1
            degrees[t] = degrees.get(t, 0) + 1
        centrality = {n: (degrees.get(n, 0) / denom) for n in g["nodes"]}
        edge_iter = sorted(g["edges"])

    def worst_state(service_name: str) -> str:
        states = [_normalise_state(ep.get("state")) for ep in by_service.get(service_name, [])]
        if not states:
            return "Unknown"
        return max(states, key=lambda s: _STATE_SEVERITY.get(s, 0))

    depends_on_map: dict[str, list[str]] = {s: [] for s in services}
    dependent_map: dict[str, list[str]] = {s: [] for s in services}
    for source, target in edge_iter:
        depends_on_map.setdefault(source, []).append(target)
        dependent_map.setdefault(target, []).append(source)

    def criticality_for(c: float, service_state: str) -> str:
        # Keep it simple and explainable for demo purposes.
        if service_state in {"Rogue", "Shadow"}:
            return "critical"
        if c >= 0.70:
            return "critical"
        if c >= 0.40:
            return "high"
        if c >= 0.20:
            return "medium"
        return "low"

    nodes = []
    service_context = []
    for service_name in services:
        api_count = len(by_service.get(service_name, []))
        service_state = worst_state(service_name)
        c = float(centrality.get(service_name, 0.0))
        size = min(max(35 + api_count * 6 + int(c * 40), 30), 80)
        nodes.append(
            {
                "data": {
                    "id": service_name,
                    "label": service_name,
                    "worst_state": service_state,
                    "colour": _STATE_COLOURS.get(service_state, _STATE_COLOURS["Unknown"]),
                    "centrality": round(c, 3),
                    "api_count": api_count,
                    "size": size,
                }
            }
        )

        endpoints = by_service.get(service_name, [])
        regulatory_scope: set[str] = set()
        for ep in endpoints:
            regs = ep.get("regulatory_scope") or []
            if isinstance(regs, list):
                regulatory_scope.update([str(r) for r in regs])

        handles_customer_data = any((ep.get("data_sensitivity") or "").lower() in {"critical", "medium"} for ep in endpoints)
        processes_payments = any((ep.get("domain") or "") == "payment" for ep in endpoints)
        is_public_facing = any(bool(ep.get("is_external_facing")) for ep in endpoints)
        importance_score = max([int(ep.get("importance_score") or 0) for ep in endpoints], default=0)

        service_context.append(
            {
                "service_name": service_name,
                "criticality": criticality_for(c, service_state),
                "handles_customer_data": handles_customer_data,
                "processes_payments": processes_payments,
                "is_public_facing": is_public_facing,
                "regulatory_scope": sorted(regulatory_scope),
                "centrality_score": round(c, 3),
                "importance_score": importance_score,
                "dependent_services": sorted(set(dependent_map.get(service_name, []))),
                "depends_on": sorted(set(depends_on_map.get(service_name, []))),
            }
        )

    edges = []
    for source, target in edge_iter:
        edges.append(
            {
                "data": {
                    "id": f"{source}->{target}",
                    "source": source,
                    "target": target,
                }
            }
        )

    most_central = None
    if centrality:
        most_central = max(centrality.items(), key=lambda kv: kv[1])[0]

    return {
        "nodes": nodes,
        "edges": edges,
        "service_context": service_context,
        "summary": {
            "total_services": len(services),
            "total_dependencies": len(edges),
            "most_central": most_central,
            "dependency_source": dependency_source,
            "dependency_config_path": DEPENDENCIES_FILE,
            "unmatched_dependencies": unmatched_dependencies,
        },
    }
