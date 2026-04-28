import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import { useTheme } from "@/hooks/useTheme";
import type { GraphResponse } from "@/types/spectre";

interface KnowledgeGraphPreviewProps {
  graph: GraphResponse;
}

const stateNodeColors: Record<string, { light: string; dark: string }> = {
  active: { light: "#085041", dark: "#1D9E75" },
  zombie: { light: "#791F1F", dark: "#E24B4A" },
  shadow: { light: "#3C3489", dark: "#534AB7" },
  rogue: { light: "#633806", dark: "#EF9F27" },
  unknown: { light: "#6B7280", dark: "#9CA3AF" },
};

const KnowledgeGraphPreview = ({ graph }: KnowledgeGraphPreviewProps) => {
  const { theme } = useTheme();
  const cyRef = useRef<HTMLDivElement>(null);

  const previewNodes = useMemo(() => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    return [...nodes]
      .sort((a, b) => {
        const aScore = Number(a.data.centrality || 0) + Number(a.data.relation_count || 0) / 10;
        const bScore = Number(b.data.centrality || 0) + Number(b.data.relation_count || 0) / 10;
        return bScore - aScore;
      })
      .slice(0, 6);
  }, [graph]);

  const previewIds = useMemo(() => new Set(previewNodes.map((node) => node.data.id)), [previewNodes]);

  const previewEdges = useMemo(() => {
    const edges = Array.isArray(graph?.edges) ? graph.edges : [];
    return edges.filter((edge) => previewIds.has(edge.data.source) && previewIds.has(edge.data.target));
  }, [graph, previewIds]);

  useEffect(() => {
    if (!cyRef.current) return;
    const isDark = theme === "dark";

    const cy = cytoscape({
      container: cyRef.current,
      elements: [
        ...previewNodes.map((node) => ({
          data: {
            ...node.data,
            shortLabel: `${node.data.method || "GET"} ${node.data.path || "/"}`,
            color: node.data.colour || stateNodeColors[String(node.data.state || "unknown").toLowerCase()]?.[theme] || stateNodeColors.unknown[theme],
            size: Math.max(28, Math.min(48, Number(node.data.size || 34) * 0.65)),
          },
        })),
        ...previewEdges.map((edge) => ({
          data: {
            ...edge.data,
            color: isDark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.14)",
          },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(shortLabel)",
            width: "data(size)",
            height: "data(size)",
            "font-size": "8px",
            "text-wrap": "wrap",
            "text-max-width": "64px",
            "text-valign": "bottom",
            "text-margin-y": 4,
            color: isDark ? "#CBD5E1" : "#475569",
            "border-width": 1,
            "border-color": isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.05)",
          } as unknown as cytoscape.Css.Node,
        },
        {
          selector: "edge",
          style: {
            width: 1.2,
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.5,
            opacity: 0.8,
          } as unknown as cytoscape.Css.Edge,
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 3600,
        idealEdgeLength: () => 70,
        gravity: 0.5,
      } as unknown as cytoscape.LayoutOptions,
      userZoomingEnabled: false,
      userPanningEnabled: false,
      autoungrabify: true,
    });

    return () => cy.destroy();
  }, [previewEdges, previewNodes, theme]);

  return <div ref={cyRef} className="h-[180px] w-full" />;
};

export default KnowledgeGraphPreview;
