import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { useTheme } from "@/hooks/useTheme";
import type { ApiEndpointUI, ServiceContext } from "@/types/spectre";

interface KnowledgeGraphPreviewProps {
  apis: ApiEndpointUI[];
  serviceContext: ServiceContext[];
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

const KnowledgeGraphPreview = ({ apis, serviceContext }: KnowledgeGraphPreviewProps) => {
  const { theme } = useTheme();
  const cyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cyRef.current) return;
    const isDark = theme === "dark";
    const topServices = [...(serviceContext || [])]
      .sort((a, b) => (b.dependent_services?.length || 0) - (a.dependent_services?.length || 0))
      .slice(0, 4);
    const serviceNames = topServices.map((s) => s.service_name);

    const nodes = topServices.map((svc) => {
      const apiCount = apis.filter((a) => a.service_name === svc.service_name).length;
      const worstState = getWorstState(apis, svc.service_name);
      const color = stateNodeColors[worstState]?.[theme] || stateNodeColors.active[theme];
      return {
        data: {
          id: svc.service_name,
          label: svc.service_name.replace("-service", ""),
          size: Math.max(28, Math.min(48, 24 + apiCount * 10)),
          color,
        },
      };
    });

    const edges: { data: { source: string; target: string } }[] = [];
    topServices.forEach((svc) => {
      (svc.depends_on || []).forEach((dep: string) => {
        if (serviceNames.includes(dep)) {
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
            "font-size": "8px",
            "text-valign": "bottom",
            "text-margin-y": 4,
            color: isDark ? "#8B8FA8" : "#6B6B6B",
            "border-width": 1,
            "border-color": isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          } as unknown as cytoscape.Css.Node,
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
            "target-arrow-color": isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.5,
          } as unknown as cytoscape.Css.Edge,
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 3500,
        idealEdgeLength: () => 55,
        gravity: 0.5,
      } as unknown as cytoscape.LayoutOptions,
      userZoomingEnabled: false,
      userPanningEnabled: false,
      autoungrabify: true,
    });

    return () => cy.destroy();
  }, [theme, apis, serviceContext]);

  return <div ref={cyRef} className="h-[180px] w-full" />;
};

export default KnowledgeGraphPreview;
