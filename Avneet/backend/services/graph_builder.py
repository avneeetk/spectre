from __future__ import annotations

from collections import defaultdict
import json
import os
import re

try:
    import networkx as nx  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    nx = None  # type: ignore


DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DEPENDENCIES_FILE = os.path.join(DATA_DIR, "known_dependencies.json")


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

_GENERIC_PREFIXES = {"api"}
_IDENTITY_KEYWORDS = {"auth", "login", "signup", "session", "token", "user", "users", "account", "identity", "password", "me"}
_OPERATIONS_KEYWORDS = {"health", "status", "metrics", "test", "email", "notification", "webhook"}
_EDGE_PRIORITY = {
    "configured-service": 5,
    "identity-dependency": 4,
    "operations-dependency": 3,
    "shared-resource": 2,
    "shared-service": 1,
}


def _normalise_state(state: str | None) -> str:
    if not state:
        return "Unknown"
    for canonical in ("Active", "Shadow", "Zombie", "Rogue"):
        if state.strip().lower() == canonical.lower():
            return canonical
    return "Unknown"


def normalize_path(path: str | None) -> str:
    path = (path or "/").strip()
    if not path.startswith("/"):
        path = f"/{path}"
    path = re.sub(r"{.*?}", ":param", path)
    path = re.sub(r"/+", "/", path)
    normalized = path.rstrip("/")
    return normalized or "/"


def _path_from_endpoint(endpoint: dict) -> str:
    for key in ("path", "endpoint", "route", "url"):
        value = endpoint.get(key)
        if isinstance(value, str) and value.strip():
            return normalize_path(value)
    return "/"


def _path_segments(path: str) -> list[str]:
    return [segment for segment in normalize_path(path).split("/") if segment]


def _resource_family(path: str) -> str:
    segments = _path_segments(path)
    for segment in segments:
        lowered = segment.lower()
        if lowered in _GENERIC_PREFIXES or re.fullmatch(r"v\d+", lowered):
            continue
        if lowered.startswith(":"):
            continue
        return lowered
    return "root"


def _is_root_like(path: str) -> bool:
    return len(_path_segments(path)) <= 1


def _is_identity_endpoint(path: str, service_name: str) -> bool:
    haystack = f"{service_name} {normalize_path(path)}".lower()
    return any(keyword in haystack for keyword in _IDENTITY_KEYWORDS)


def _is_operations_endpoint(path: str, service_name: str) -> bool:
    haystack = f"{service_name} {normalize_path(path)}".lower()
    return any(keyword in haystack for keyword in _OPERATIONS_KEYWORDS)


def _worst_state(states: list[str]) -> str:
    if not states:
        return "Unknown"
    return max(states, key=lambda state: _STATE_SEVERITY.get(state, 0))


def _criticality_for(centrality_score: float, service_state: str) -> str:
    if service_state == "Rogue":
        return "critical"
    if service_state == "Zombie":
        return "high"
    if service_state == "Shadow":
        return "high" if centrality_score >= 0.2 else "medium"
    if centrality_score >= 0.5:
        return "critical"
    if centrality_score >= 0.2:
        return "high"
    if centrality_score > 0:
        return "medium"
    return "low"


def _load_known_dependencies() -> list[tuple[str, str]]:
    if not os.path.exists(DEPENDENCIES_FILE):
        return []

    try:
        with open(DEPENDENCIES_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return []

    dependencies: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    if not isinstance(payload, list):
        return []

    for item in payload:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            continue
        source, target = item
        if not isinstance(source, str) or not isinstance(target, str):
            continue
        source_name = source.strip()
        target_name = target.strip()
        if not source_name or not target_name or source_name == target_name:
            continue
        edge = (source_name, target_name)
        if edge not in seen:
            seen.add(edge)
            dependencies.append(edge)

    return dependencies


def _sort_key(endpoint: dict) -> tuple[int, int, int, str, str]:
    path = _path_from_endpoint(endpoint)
    return (
        int(endpoint.get("technical_score") or 0),
        int(endpoint.get("importance_score") or 0),
        1 if _is_root_like(path) else 0,
        endpoint.get("method") or "GET",
        path,
    )


def _pick_hub(endpoints: list[dict]) -> dict | None:
    if not endpoints:
        return None
    return max(endpoints, key=_sort_key)


def _make_edge_payload(source: dict, target: dict, relation: str, reason: str, impact: str, *, inferred: bool) -> dict:
    source_id = str(source["id"])
    target_id = str(target["id"])
    return {
        "source": source_id,
        "target": target_id,
        "relation": relation,
        "reason": reason,
        "impact": impact,
        "inferred": inferred,
    }


def _merge_edge(existing: dict | None, candidate: dict) -> dict:
    if existing is None:
        return candidate
    existing_priority = _EDGE_PRIORITY.get(str(existing.get("relation")), 0)
    candidate_priority = _EDGE_PRIORITY.get(str(candidate.get("relation")), 0)
    return candidate if candidate_priority >= existing_priority else existing


def _add_edge(edge_map: dict[tuple[str, str], dict], source: dict, target: dict, relation: str, reason: str, impact: str, *, inferred: bool) -> None:
    source_id = str(source["id"])
    target_id = str(target["id"])
    if source_id == target_id:
        return
    key = (source_id, target_id)
    edge_map[key] = _merge_edge(edge_map.get(key), _make_edge_payload(source, target, relation, reason, impact, inferred=inferred))


def _build_endpoint_records(inventory: list[dict]) -> list[dict]:
    records: list[dict] = []
    for endpoint in inventory:
        if not isinstance(endpoint, dict):
            continue

        api_id = str(endpoint.get("id") or "").strip()
        if not api_id:
            continue

        path = _path_from_endpoint(endpoint)
        method = str(endpoint.get("method") or "GET").upper()
        service_name = str(endpoint.get("service_name") or "unknown").strip() or "unknown"
        state = _normalise_state(endpoint.get("state"))
        owasp_flags = endpoint.get("owasp_flags") if isinstance(endpoint.get("owasp_flags"), list) else []

        records.append(
            {
                "id": api_id,
                "label": f"{method} {path}",
                "method": method,
                "path": path,
                "service_name": service_name,
                "state": state,
                "resource_family": _resource_family(path),
                "technical_score": int(endpoint.get("technical_score") or 0),
                "importance_score": int(endpoint.get("importance_score") or 0),
                "risk_summary": endpoint.get("risk_summary"),
                "owasp_flags": [str(flag) for flag in owasp_flags if str(flag).strip()],
                "auth_present": bool(endpoint.get("auth_present") or endpoint.get("auth_detected")),
                "is_external_facing": bool(endpoint.get("is_external_facing")),
                "data_sensitivity": str(endpoint.get("data_sensitivity") or "").lower(),
                "domain": str(endpoint.get("domain") or "").lower(),
                "regulatory_scope": endpoint.get("regulatory_scope") if isinstance(endpoint.get("regulatory_scope"), list) else [],
            }
        )
    return records


def _infer_edges(endpoints: list[dict], dependency_pairs: list[tuple[str, str]]) -> tuple[list[dict], set[tuple[str, str]], list[tuple[str, str]]]:
    by_service: dict[str, list[dict]] = defaultdict(list)
    by_service_family: dict[tuple[str, str], list[dict]] = defaultdict(list)
    identity_sources: dict[str, list[dict]] = defaultdict(list)
    operations_sources: dict[str, list[dict]] = defaultdict(list)
    service_hubs: dict[str, dict] = {}
    edge_map: dict[tuple[str, str], dict] = {}

    for endpoint in endpoints:
        service_name = endpoint["service_name"]
        path = endpoint["path"]
        by_service[service_name].append(endpoint)
        by_service_family[(service_name, endpoint["resource_family"])].append(endpoint)
        if _is_identity_endpoint(path, service_name):
            identity_sources[service_name].append(endpoint)
        if _is_operations_endpoint(path, service_name):
            operations_sources[service_name].append(endpoint)

    for service_name, service_endpoints in by_service.items():
        hub = _pick_hub(service_endpoints)
        if hub is None:
            continue
        service_hubs[service_name] = hub
        for endpoint in service_endpoints:
            if endpoint["id"] == hub["id"]:
                continue
            _add_edge(
                edge_map,
                hub,
                endpoint,
                "shared-service",
                f"Same service boundary inside {service_name}.",
                f"If {hub['label']} changes or is decommissioned, sibling route {endpoint['label']} likely needs the same rollout or owner review.",
                inferred=True,
            )

    for (service_name, resource_family), family_endpoints in by_service_family.items():
        if len(family_endpoints) < 2:
            continue
        hub = _pick_hub(family_endpoints)
        if hub is None:
            continue
        for endpoint in family_endpoints:
            if endpoint["id"] == hub["id"]:
                continue
            _add_edge(
                edge_map,
                hub,
                endpoint,
                "shared-resource",
                f"Shared {resource_family} resource surface in {service_name}.",
                f"Risk on {hub['label']} can propagate to {endpoint['label']} because both routes touch the same API resource family.",
                inferred=True,
            )

    for source_service, source_endpoints in identity_sources.items():
        for target_service, target_endpoints in by_service.items():
            if source_service == target_service:
                continue
            if not any(endpoint["auth_present"] or endpoint["data_sensitivity"] in {"critical", "medium"} for endpoint in target_endpoints):
                continue
            source = _pick_hub(source_endpoints)
            target = _pick_hub(target_endpoints)
            if source is None or target is None:
                continue
            _add_edge(
                edge_map,
                source,
                target,
                "identity-dependency",
                f"{source_service} likely supplies identity or access control context for {target_service}.",
                f"If {source['label']} is broken, authenticated or customer-data routes in {target_service} may become unreachable or exposed.",
                inferred=True,
            )

    for source_service, source_endpoints in operations_sources.items():
        for target_service, target_endpoints in by_service.items():
            if source_service == target_service:
                continue
            if not any(
                endpoint["is_external_facing"]
                or endpoint["data_sensitivity"] in {"critical", "medium"}
                or endpoint["resource_family"] in {"user", "users", "account", "accounts"}
                for endpoint in target_endpoints
            ):
                continue
            source = _pick_hub(source_endpoints)
            target = _pick_hub(target_endpoints)
            if source is None or target is None:
                continue
            _add_edge(
                edge_map,
                source,
                target,
                "operations-dependency",
                f"{source_service} exposes operational or messaging surfaces consumed around {target_service}.",
                f"Changes to {source['label']} may impact notifications, monitoring, or rollout checks around {target['label']}.",
                inferred=True,
            )

    matched_service_dependencies: set[tuple[str, str]] = set()
    unmatched_dependencies: list[tuple[str, str]] = []
    for source_service, target_service in dependency_pairs:
        source = service_hubs.get(source_service)
        target = service_hubs.get(target_service)
        if source is None or target is None:
            unmatched_dependencies.append((source_service, target_service))
            continue
        matched_service_dependencies.add((source_service, target_service))
        _add_edge(
            edge_map,
            source,
            target,
            "configured-service",
            f"Declared service dependency from {source_service} to {target_service}.",
            f"{source['label']} is configured upstream of {target['label']}, so incidents or removals can affect downstream behavior.",
            inferred=False,
        )

    return sorted(edge_map.values(), key=lambda item: (item["source"], item["target"])), matched_service_dependencies, unmatched_dependencies


def build_graph(inventory: list[dict]) -> dict:
    endpoints = _build_endpoint_records(inventory)
    by_service: dict[str, list[dict]] = defaultdict(list)
    for endpoint in endpoints:
        by_service[endpoint["service_name"]].append(endpoint)

    services = sorted(by_service.keys())
    dependency_pairs = _load_known_dependencies()
    inferred_edges, matched_service_dependencies, unmatched_dependencies = _infer_edges(endpoints, dependency_pairs)

    node_centrality: dict[str, float] = {}
    relation_count: dict[str, int] = defaultdict(int)
    for edge in inferred_edges:
        relation_count[edge["source"]] += 1
        relation_count[edge["target"]] += 1

    if nx is not None:
        graph = nx.DiGraph()
        for endpoint in endpoints:
            graph.add_node(endpoint["id"])
        for edge in inferred_edges:
            graph.add_edge(edge["source"], edge["target"])
        if graph.number_of_edges() >= 2:
            betweenness = {
                node_id: float(score)
                for node_id, score in nx.betweenness_centrality(graph).items()
            }
            if any(score > 0 for score in betweenness.values()):
                node_centrality = betweenness
            else:
                node_centrality = {
                    node_id: float(score)
                    for node_id, score in nx.degree_centrality(graph).items()
                }
        else:
            node_centrality = {node_id: 0.0 for node_id in graph.nodes()}
    else:
        denominator = max(len(endpoints) - 1, 1)
        node_centrality = {
            endpoint["id"]: round(relation_count.get(endpoint["id"], 0) / denominator, 3)
            for endpoint in endpoints
        }

    nodes = []
    for endpoint in sorted(endpoints, key=lambda item: (item["service_name"], item["path"], item["method"])):
        centrality_score = float(node_centrality.get(endpoint["id"], 0.0))
        size = min(max(34 + int(endpoint["technical_score"] / 4) + relation_count.get(endpoint["id"], 0) * 3, 30), 82)
        summary = endpoint.get("risk_summary")
        nodes.append(
            {
                "data": {
                    "id": endpoint["id"],
                    "api_id": endpoint["id"],
                    "label": endpoint["label"],
                    "method": endpoint["method"],
                    "path": endpoint["path"],
                    "service": endpoint["service_name"],
                    "service_name": endpoint["service_name"],
                    "state": endpoint["state"],
                    "resource_family": endpoint["resource_family"],
                    "technical_score": endpoint["technical_score"],
                    "importance_score": endpoint["importance_score"],
                    "owasp_flags": endpoint["owasp_flags"],
                    "relation_count": relation_count.get(endpoint["id"], 0),
                    "centrality": round(centrality_score, 3),
                    "summary": summary if isinstance(summary, str) else None,
                    "colour": _STATE_COLOURS.get(endpoint["state"], _STATE_COLOURS["Unknown"]),
                    "size": size,
                }
            }
        )

    edges = [
        {
            "data": {
                "id": f"{edge['source']}->{edge['target']}",
                "source": edge["source"],
                "target": edge["target"],
                "relation": edge["relation"],
                "reason": edge["reason"],
                "impact": edge["impact"],
                "inferred": edge["inferred"],
            }
        }
        for edge in inferred_edges
    ]

    depends_on_map: dict[str, set[str]] = {service_name: set() for service_name in services}
    dependent_map: dict[str, set[str]] = {service_name: set() for service_name in services}

    for edge in inferred_edges:
        source_service = next((endpoint["service_name"] for endpoint in endpoints if endpoint["id"] == edge["source"]), None)
        target_service = next((endpoint["service_name"] for endpoint in endpoints if endpoint["id"] == edge["target"]), None)
        if not source_service or not target_service or source_service == target_service:
            continue
        depends_on_map[target_service].add(source_service)
        dependent_map[source_service].add(target_service)

    for source_service, target_service in matched_service_dependencies:
        depends_on_map.setdefault(target_service, set()).add(source_service)
        dependent_map.setdefault(source_service, set()).add(target_service)

    service_context = []
    for service_name in services:
        service_endpoints = by_service.get(service_name, [])
        service_states = [endpoint["state"] for endpoint in service_endpoints]
        service_state = _worst_state(service_states)
        centrality_score = max((float(node_centrality.get(endpoint["id"], 0.0)) for endpoint in service_endpoints), default=0.0)
        regulatory_scope: set[str] = set()
        for endpoint in service_endpoints:
            for reg in endpoint.get("regulatory_scope") or []:
                regulatory_scope.add(str(reg))

        handles_customer_data = any(endpoint["data_sensitivity"] in {"critical", "medium"} for endpoint in service_endpoints)
        processes_payments = any(endpoint["domain"] == "payment" for endpoint in service_endpoints)
        is_public_facing = any(endpoint["is_external_facing"] for endpoint in service_endpoints)
        importance_score = max((int(endpoint["importance_score"] or 0) for endpoint in service_endpoints), default=0)

        service_context.append(
            {
                "service_name": service_name,
                "criticality": _criticality_for(centrality_score, service_state),
                "handles_customer_data": handles_customer_data,
                "processes_payments": processes_payments,
                "is_public_facing": is_public_facing,
                "regulatory_scope": sorted(regulatory_scope),
                "centrality_score": round(centrality_score, 3),
                "importance_score": importance_score,
                "dependent_services": sorted(dependent_map.get(service_name, set())),
                "depends_on": sorted(depends_on_map.get(service_name, set())),
                "api_count": len(service_endpoints),
                "worst_state": service_state,
            }
        )

    most_central_endpoint = None
    most_central_service = None
    if node_centrality:
        most_central_endpoint = max(node_centrality.items(), key=lambda item: item[1])[0]
        for endpoint in endpoints:
            if endpoint["id"] == most_central_endpoint:
                most_central_service = endpoint["service_name"]
                break

    dependency_source = "inferred"
    if os.path.exists(DEPENDENCIES_FILE):
        dependency_source = "file+inferred"

    return {
        "nodes": nodes,
        "edges": edges,
        "service_context": service_context,
        "summary": {
            "total_services": len(services),
            "total_nodes": len(nodes),
            "total_dependencies": len(edges),
            "most_central": most_central_service,
            "most_central_endpoint": most_central_endpoint,
            "dependency_source": dependency_source,
            "dependency_config_path": DEPENDENCIES_FILE,
            "unmatched_dependencies": unmatched_dependencies,
            "inferred_relationships": len([edge for edge in inferred_edges if edge["inferred"]]),
        },
    }
