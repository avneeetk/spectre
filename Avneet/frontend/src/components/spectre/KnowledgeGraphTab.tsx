import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { useTheme } from "@/hooks/useTheme";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import type { ApiEndpointUI, GraphEdgeData, GraphNodeData, GraphResponse, ServiceContext } from "@/types/spectre";

interface KnowledgeGraphTabProps {
  apis: ApiEndpointUI[];
  graph: GraphResponse;
  serviceContext: ServiceContext[];
  onSelectApi: (apiId: string) => void;
}

const relationCopy: Record<string, string> = {
  "configured-service": "Declared dependency",
  "identity-dependency": "Identity dependency",
  "operations-dependency": "Operational dependency",
  "shared-resource": "Shared resource",
  "shared-service": "Shared service",
};

const edgeTone: Record<string, string> = {
  "configured-service": "#0F766E",
  "identity-dependency": "#B45309",
  "operations-dependency": "#7C3AED",
  "shared-resource": "#2563EB",
  "shared-service": "#64748B",
};

const stateNodeColors: Record<string, { light: string; dark: string }> = {
  active: { light: "#085041", dark: "#1D9E75" },
  zombie: { light: "#791F1F", dark: "#E24B4A" },
  shadow: { light: "#3C3489", dark: "#534AB7" },
  rogue: { light: "#633806", dark: "#EF9F27" },
  unknown: { light: "#6B7280", dark: "#9CA3AF" },
};

const getNodeState = (node: GraphNodeData) => String(node.state || "unknown").toLowerCase();

const getNodeService = (node: GraphNodeData) => String(node.service_name || node.service || "unknown");

const getNodeLabel = (node: GraphNodeData) => String(node.label || `${node.method || "GET"} ${node.path || "/"}`);

const KnowledgeGraphTab = ({ apis, graph, serviceContext, onSelectApi }: KnowledgeGraphTabProps) => {
  const { theme } = useTheme();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<string>("all");

  const graphNodes = useMemo(() => Array.isArray(graph?.nodes) ? graph.nodes : [], [graph]);
  const graphEdges = useMemo(() => Array.isArray(graph?.edges) ? graph.edges : [], [graph]);

  const filteredNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return graphNodes.filter(({ data }) => {
      const nodeState = getNodeState(data);
      const matchesState = filterState === "all" || nodeState === filterState;
      const searchHaystack = `${getNodeLabel(data)} ${getNodeService(data)} ${data.path || ""}`.toLowerCase();
      const matchesQuery = !query || searchHaystack.includes(query);
      return matchesState && matchesQuery;
    });
  }, [filterState, graphNodes, searchQuery]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((node) => node.data.id)), [filteredNodes]);

  const filteredEdges = useMemo(() => {
    return graphEdges.filter(({ data }) => filteredNodeIds.has(data.source) && filteredNodeIds.has(data.target));
  }, [filteredNodeIds, graphEdges]);

  const selectedNode = useMemo(() => {
    const source = filteredNodes.find((node) => node.data.id === selectedNodeId) || graphNodes.find((node) => node.data.id === selectedNodeId);
    return source?.data || null;
  }, [filteredNodes, graphNodes, selectedNodeId]);

  const selectedApi = useMemo(() => {
    if (!selectedNode?.api_id) return null;
    return apis.find((api) => api.id === selectedNode.api_id) || null;
  }, [apis, selectedNode]);

  const selectedService = useMemo(() => {
    if (!selectedNode) return null;
    return serviceContext.find((svc) => svc.service_name === getNodeService(selectedNode)) || null;
  }, [selectedNode, serviceContext]);

  const related = useMemo(() => {
    if (!selectedNodeId) return { incoming: [] as GraphEdgeData[], outgoing: [] as GraphEdgeData[] };
    return {
      outgoing: filteredEdges.map((edge) => edge.data).filter((edge) => edge.source === selectedNodeId),
      incoming: filteredEdges.map((edge) => edge.data).filter((edge) => edge.target === selectedNodeId),
    };
  }, [filteredEdges, selectedNodeId]);

  const ranking = useMemo(() => {
    return [...graphNodes]
      .map((node) => node.data)
      .sort((a, b) => {
        const centralityDiff = Number(b.centrality || 0) - Number(a.centrality || 0);
        if (centralityDiff !== 0) return centralityDiff;
        const importanceDiff = Number(b.importance_score || 0) - Number(a.importance_score || 0);
        if (importanceDiff !== 0) return importanceDiff;
        return getNodeLabel(a).localeCompare(getNodeLabel(b));
      });
  }, [graphNodes]);

  useEffect(() => {
    if (selectedNodeId && !filteredNodeIds.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [filteredNodeIds, selectedNodeId]);

  useEffect(() => {
    if (!cyRef.current) return;
    const isDark = theme === "dark";

    const nodes = filteredNodes.map(({ data }) => ({
      data: {
        ...data,
        shortLabel: `${data.method || "GET"} ${data.path || "/"}`,
        color: data.colour || stateNodeColors[getNodeState(data)]?.[theme] || stateNodeColors.unknown[theme],
      },
    }));

    const edges = filteredEdges.map(({ data }) => ({
      data: {
        ...data,
        color: edgeTone[data.relation || "shared-service"] || edgeTone["shared-service"],
      },
    }));

    const cy = cytoscape({
      container: cyRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(shortLabel)",
            width: "data(size)",
            height: "data(size)",
            "font-size": "9px",
            "text-wrap": "wrap",
            "text-max-width": "84px",
            "text-valign": "bottom",
            "text-margin-y": 6,
            color: isDark ? "#CBD5E1" : "#475569",
            "border-width": 1.5,
            "border-color": isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)",
          } as unknown as cytoscape.Css.Node,
        },
        {
          selector: "edge",
          style: {
            width: 1.8,
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.85,
            opacity: 0.55,
          } as unknown as cytoscape.Css.Edge,
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 2.5,
            "border-color": isDark ? "#F8FAFC" : "#0F172A",
          } as unknown as cytoscape.Css.Node,
        },
        {
          selector: ".dimmed",
          style: { opacity: 0.12 } as unknown as cytoscape.Css.Node,
        },
      ],
      layout: {
        name: "cose",
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 9000,
        idealEdgeLength: () => 140,
        gravity: 0.25,
      } as unknown as cytoscape.LayoutOptions,
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    cy.on("tap", "node", (e) => {
      const node = e.target;
      const apiId = String(node.data("api_id") || node.id());
      setSelectedNodeId(node.id());
      cy.elements().removeClass("dimmed");
      const connected = node.connectedEdges().connectedNodes().add(node);
      cy.elements().not(connected).not(node.connectedEdges()).addClass("dimmed");
      onSelectApi(apiId);
    });

    cy.on("tap", (e) => {
      if (e.target === cy) {
        setSelectedNodeId(null);
        cy.elements().removeClass("dimmed");
      }
    });

    cyInstance.current = cy;
    return () => cy.destroy();
  }, [filteredEdges, filteredNodes, onSelectApi, theme]);

  const totalDependencies = typeof graph.summary?.total_dependencies === "number" ? graph.summary.total_dependencies : filteredEdges.length;
  const inferredRelationships = typeof graph.summary?.inferred_relationships === "number" ? graph.summary.inferred_relationships : filteredEdges.length;

  const renderRelatedEdge = (edge: GraphEdgeData, direction: "incoming" | "outgoing") => {
    const otherNodeId = direction === "outgoing" ? edge.target : edge.source;
    const otherNode = graphNodes.find((node) => node.data.id === otherNodeId)?.data;
    if (!otherNode) return null;
    const badge = relationCopy[edge.relation || "shared-service"] || "Linked";

    return (
      <button
        key={edge.id}
        onClick={() => {
          setSelectedNodeId(otherNode.id);
          if (otherNode.api_id) onSelectApi(otherNode.api_id);
        }}
        className="w-full rounded-lg border border-border bg-background p-2 text-left transition-colors hover:bg-muted/30"
      >
        <div className="mb-1 flex items-center gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{badge}</span>
          <span className="text-[10px] text-muted-foreground">{getNodeService(otherNode)}</span>
        </div>
        <div className="font-mono text-[11px] text-foreground">{getNodeLabel(otherNode)}</div>
        {edge.reason && <div className="mt-1 text-[10px] leading-4 text-muted-foreground">{edge.reason}</div>}
        {edge.impact && <div className="mt-1 text-[10px] leading-4 text-primary/90">{edge.impact}</div>}
      </button>
    );
  };

  return (
    <div className="flex h-[calc(100vh-49px)]">
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-3">
          <input
            type="text"
            placeholder="Search endpoints or services…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-56 rounded-lg border border-input-border bg-input px-3 py-1.5 text-xs text-foreground outline-none"
          />
          <div className="flex gap-1">
            {["all", "active", "zombie", "shadow", "rogue"].map((state) => (
              <button
                key={state}
                onClick={() => setFilterState(state)}
                className={`rounded-full px-2.5 py-1 text-[10px] capitalize transition-colors ${
                  filterState === state ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {state}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>{filteredNodes.length} APIs</span>
            <span>{totalDependencies} links</span>
            <span>{inferredRelationships} inferred</span>
          </div>
          <button
            onClick={() => {
              cyInstance.current?.layout({
                name: "cose",
                animate: true,
                animationDuration: 500,
                nodeRepulsion: () => 9000,
                idealEdgeLength: () => 140,
                gravity: 0.25,
              } as unknown as cytoscape.LayoutOptions).run();
              setSelectedNodeId(null);
              cyInstance.current?.elements().removeClass("dimmed");
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Reset layout
          </button>
        </div>

        <div className="flex flex-1">
          <div className="relative flex-1">
            <div ref={cyRef} className="h-full w-full" />
            {filteredNodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-center backdrop-blur-sm">
                <div>
                  <div className="text-sm font-medium text-foreground">No endpoints match this filter</div>
                  <div className="mt-1 text-xs text-muted-foreground">Try a different state filter or search term.</div>
                </div>
              </div>
            )}
          </div>

          <div className="w-[340px] border-l border-border bg-card p-4 overflow-y-auto">
            {!selectedNode && (
              <>
                <h3 className="text-sm font-medium text-foreground">Relationship summary</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  This graph is inferred from shared service boundaries, resource families, auth-sensitive routes, and any configured service dependencies.
                </p>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Services</span>
                    <span className="text-foreground">{serviceContext.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Endpoints</span>
                    <span className="text-foreground">{graphNodes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Links</span>
                    <span className="text-foreground">{totalDependencies}</span>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-[11px] leading-5 text-muted-foreground">
                  Select a node to see which APIs it can affect and which other APIs may influence it.
                </div>
              </>
            )}

            {selectedNode && (
              <>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <MethodBadge method={selectedNode.method || "GET"} />
                      <StateBadge state={getNodeState(selectedNode)} />
                    </div>
                    <h3 className="font-mono text-sm text-foreground">{selectedNode.path || getNodeLabel(selectedNode)}</h3>
                    <div className="mt-1 text-xs text-muted-foreground">{getNodeService(selectedNode)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background px-2 py-1 text-right">
                    <div className="text-[10px] text-muted-foreground">Centrality</div>
                    <div className="text-xs font-medium text-foreground">{Number(selectedNode.centrality || 0).toFixed(2)}</div>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-border bg-background p-2">
                    <div className="text-[10px] text-muted-foreground">Importance</div>
                    <div className="font-medium text-foreground">{selectedNode.importance_score || 0}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2">
                    <div className="text-[10px] text-muted-foreground">Technical</div>
                    <div className="font-medium text-foreground">{selectedNode.technical_score || 0}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2">
                    <div className="text-[10px] text-muted-foreground">Links</div>
                    <div className="font-medium text-foreground">{selectedNode.relation_count || 0}</div>
                  </div>
                </div>

                {selectedApi?.risk_summary && (
                  <div className="mb-4 rounded-lg border border-border bg-background p-3 text-[11px] leading-5 text-muted-foreground">
                    {selectedApi.risk_summary}
                  </div>
                )}

                {selectedService && (
                  <div className="mb-4 rounded-lg border border-border bg-background p-3 text-[11px]">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Service criticality</span>
                      <span className="capitalize text-foreground">{selectedService.criticality}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Depends on</span>
                      <span className="text-foreground">{selectedService.depends_on.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Called by</span>
                      <span className="text-foreground">{selectedService.dependent_services.length}</span>
                    </div>
                  </div>
                )}

                <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Potentially impacts</h4>
                <div className="space-y-2">
                  {related.outgoing.length ? related.outgoing.map((edge) => renderRelatedEdge(edge, "outgoing")) : (
                    <div className="rounded-lg border border-border bg-background p-3 text-[11px] text-muted-foreground">No downstream links for this node.</div>
                  )}
                </div>

                <h4 className="mb-2 mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Potentially affected by</h4>
                <div className="space-y-2">
                  {related.incoming.length ? related.incoming.map((edge) => renderRelatedEdge(edge, "incoming")) : (
                    <div className="rounded-lg border border-border bg-background p-3 text-[11px] text-muted-foreground">No upstream links for this node.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="max-h-[220px] overflow-y-auto border-t border-border bg-card p-4">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Most connected APIs</h3>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1.5 font-medium">#</th>
                <th className="pb-1.5 font-medium">Endpoint</th>
                <th className="pb-1.5 font-medium">Service</th>
                <th className="pb-1.5 font-medium">State</th>
                <th className="pb-1.5 text-right font-medium">Links</th>
                <th className="pb-1.5 text-right font-medium">Centrality</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((node, index) => (
                <tr key={node.id} className="border-t border-border/50">
                  <td className="py-1 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="py-1">
                    <button
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        if (node.api_id) onSelectApi(node.api_id);
                      }}
                      className="font-mono text-foreground hover:text-primary"
                    >
                      {node.path || getNodeLabel(node)}
                    </button>
                  </td>
                  <td className="py-1 text-muted-foreground">{getNodeService(node)}</td>
                  <td className="py-1"><StateBadge state={getNodeState(node)} /></td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground">{node.relation_count || 0}</td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground">{Number(node.centrality || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraphTab;
