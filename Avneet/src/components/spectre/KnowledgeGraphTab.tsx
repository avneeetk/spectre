import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { useTheme } from "@/hooks/useTheme";
import StateBadge from "./StateBadge";
import type { ApiEndpointUI, ServiceContext } from "@/types/spectre";

interface KnowledgeGraphTabProps {
  apis: ApiEndpointUI[];
  serviceContext: ServiceContext[];
  onSelectApi: (apiId: string) => void;
}

const getWorstState = (apis: ApiEndpointUI[], serviceName: string): string => {
  const svcApis = apis.filter((a) => a.service_name === serviceName);
  if (svcApis.some((a) => a.state === "rogue")) return "rogue";
  if (svcApis.some((a) => a.state === "shadow")) return "shadow";
  if (svcApis.some((a) => a.state === "zombie")) return "zombie";
  return "active";
};

const stateNodeColors: Record<string, { light: string; dark: string }> = {
  active: { light: "#085041", dark: "#1D9E75" },
  zombie: { light: "#791F1F", dark: "#E24B4A" },
  shadow: { light: "#3C3489", dark: "#534AB7" },
  rogue: { light: "#633806", dark: "#EF9F27" },
};

const KnowledgeGraphTab = ({ apis, serviceContext, onSelectApi }: KnowledgeGraphTabProps) => {
  const { theme } = useTheme();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<string>("all");

  const selectedCtx = selectedService ? serviceContext.find((s) => s.service_name === selectedService) : null;
  const selectedApis = selectedService ? apis.filter((a) => a.service_name === selectedService) : [];

  useEffect(() => {
    if (!cyRef.current) return;
    const isDark = theme === "dark";

    const nodes = (serviceContext || []).map((svc) => {
      const apiCount = apis.filter((a) => a.service_name === svc.service_name).length;
      const worstState = getWorstState(apis, svc.service_name);
      const color = stateNodeColors[worstState]?.[theme] || stateNodeColors.active[theme];
      return {
        data: {
          id: svc.service_name,
          label: svc.service_name.replace("-service", ""),
          apiCount,
          size: Math.max(40, Math.min(80, 30 + apiCount * 15)),
          color,
        },
      };
    });

    const edges: { data: { source: string; target: string } }[] = [];
    (serviceContext || []).forEach((svc) => {
      (svc.depends_on || []).forEach((dep: string) => {
        if ((serviceContext || []).some((s) => s.service_name === dep)) {
          edges.push({ data: { source: svc.service_name, target: dep } });
        }
      });
    });

    const cy = cytoscape({
      container: cyRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            width: "data(size)",
            height: "data(size)",
            "font-size": "10px",
            "text-valign": "bottom",
            "text-margin-y": 6,
            color: isDark ? "#8B8FA8" : "#6B6B6B",
            "border-width": 1.5,
            "border-color": isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          } as unknown as cytoscape.Css.Node,
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)",
            "target-arrow-color": isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.8,
          } as unknown as cytoscape.Css.Edge,
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 2.5,
            "border-color": isDark ? "#F0F0F0" : "#0F0F0F",
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
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 120,
        gravity: 0.3,
      } as unknown as cytoscape.LayoutOptions,
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    cy.on("tap", "node", (e) => {
      const node = e.target;
      setSelectedService(node.id());
      cy.elements().removeClass("dimmed");
      const connected = node.connectedEdges().connectedNodes().add(node);
      cy.elements().not(connected).not(node.connectedEdges()).addClass("dimmed");
    });

    cy.on("tap", (e) => {
      if (e.target === cy) {
        setSelectedService(null);
        cy.elements().removeClass("dimmed");
      }
    });

    cyInstance.current = cy;
    return () => cy.destroy();
  }, [theme, apis, serviceContext]);

  const importanceRanking = [...apis].sort((a, b) => b.importance_score - a.importance_score);

  return (
    <div className="flex h-[calc(100vh-49px)]">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-3">
          <input
            type="text"
            placeholder="Search services…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg bg-input border border-input-border px-3 py-1.5 text-xs text-foreground outline-none w-48"
          />
          <div className="flex gap-1">
            {["all", "active", "zombie", "shadow", "rogue"].map((s) => (
              <button key={s} onClick={() => setFilterState(s)} className={`rounded-full px-2.5 py-1 text-[10px] capitalize transition-colors ${
                filterState === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}>{s}</button>
            ))}
          </div>
          <button
            onClick={() => {
              cyInstance.current?.layout({ name: "cose", animate: true, animationDuration: 500, nodeRepulsion: () => 8000, idealEdgeLength: () => 120, gravity: 0.3 } as unknown as cytoscape.LayoutOptions).run();
              setSelectedService(null);
              cyInstance.current?.elements().removeClass("dimmed");
            }}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset layout
          </button>
        </div>

        <div className="flex-1 flex">
          <div ref={cyRef} className="flex-1" />

          {selectedCtx && (
            <div className="w-[280px] border-l border-border bg-card p-4 overflow-y-auto animate-spectre-fade-in">
              <h3 className="text-sm font-medium text-foreground mb-3">{selectedCtx.service_name}</h3>
              <div className="space-y-2 text-xs text-muted-foreground mb-4">
                <div className="flex justify-between">
                  <span>Criticality</span>
                  <span className="capitalize text-foreground">{selectedCtx.criticality}</span>
                </div>
                <div className="flex justify-between">
                  <span>Importance</span>
                  <span className="text-foreground">{selectedCtx.importance_score}</span>
                </div>
                <div className="flex justify-between">
                  <span>Centrality</span>
                  <span className="text-foreground">{selectedCtx.centrality_score.toFixed(2)}</span>
                </div>
              </div>
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">APIs in this service</h4>
              <div className="space-y-1 mb-4">
                {selectedApis.map((api) => (
                  <button key={api.id} onClick={() => onSelectApi(api.id)} className="w-full text-left rounded-lg border border-border bg-background p-2 hover:bg-muted/30 transition-colors">
                    <div className="font-mono text-[10px] text-foreground truncate">{api.path}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <StateBadge state={api.state} />
                      <span className="text-[10px] text-muted-foreground">Score: {api.technical_score}</span>
                    </div>
                  </button>
                ))}
              </div>
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Depends on</h4>
              <div className="flex flex-wrap gap-1 mb-3">
                {selectedCtx.depends_on.length ? selectedCtx.depends_on.map((d) => (
                  <span key={d} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{d}</span>
                )) : <span className="text-[10px] text-muted-foreground">None</span>}
              </div>
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Called by</h4>
              <div className="flex flex-wrap gap-1">
                {selectedCtx.dependent_services.length ? selectedCtx.dependent_services.map((d) => (
                  <span key={d} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{d}</span>
                )) : <span className="text-[10px] text-muted-foreground">None</span>}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card p-4 max-h-[220px] overflow-y-auto">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Importance ranking</h3>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1.5 font-medium">#</th>
                <th className="pb-1.5 font-medium">Endpoint</th>
                <th className="pb-1.5 font-medium">Service</th>
                <th className="pb-1.5 font-medium">State</th>
                <th className="pb-1.5 text-right font-medium">Centrality</th>
                <th className="pb-1.5 text-right font-medium">Importance</th>
              </tr>
            </thead>
            <tbody>
              {importanceRanking.map((api, i) => (
                <tr key={api.id} className="border-t border-border/50">
                  <td className="py-1 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="py-1 font-mono text-foreground">{api.path}</td>
                  <td className="py-1 text-muted-foreground">{api.service_name}</td>
                  <td className="py-1"><StateBadge state={api.state} /></td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground">
                    {serviceContext.find((s) => s.service_name === api.service_name)?.centrality_score.toFixed(2) || "—"}
                  </td>
                  <td className="py-1 text-right tabular-nums font-medium text-foreground">{api.importance_score}</td>
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
