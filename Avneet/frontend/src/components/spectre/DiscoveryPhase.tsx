import { useEffect, useState, useRef } from "react";
import { Server, Code, Wifi, Container, Check, ArrowRight } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import NavBar from "./NavBar";
import { useSpectreData } from "@/providers/SpectreDataProvider";
import type { ApiEndpointUI } from "@/types/spectre";

// Map inventory items to log lines with proper source attribution
const generateLogLines = (inventory: ApiEndpointUI[]) => {
  return inventory.map((api) => {
    const source = api.sources?.[0]?.toUpperCase() || 
                   (api.in_gateway ? "GATEWAY" : 
                    api.in_repo ? "REPO" : 
                    api.seen_in_traffic ? "TRAFFIC" : "REPO");
    
    const stateLabel = api.state?.toUpperCase?.() || api.state || "UNKNOWN";
    const endpoint = api.endpoint || api.path || "/unknown";
    
    let text = `Discovered endpoint: ${endpoint}`;
    if (api.state === "zombie" || api.state === "Zombie") {
      text = `Zombie API detected: ${endpoint}`;
    } else if (api.state === "shadow" || api.state === "Shadow") {
      text = `Shadow API found: ${endpoint}`;
    } else if (api.state === "rogue" || api.state === "Rogue") {
      text = `Rogue API identified: ${endpoint}`;
    }
    
    return { source, text, state: api.state };
  });
};

// Determine which sources are active based on inventory
const getActiveSources = (inventory: ApiEndpointUI[]): Set<string> => {
  const sources = new Set<string>();
  inventory.forEach((api) => {
    if (api.in_gateway) sources.add("GATEWAY");
    if (api.in_repo) sources.add("REPO");
    if (api.seen_in_traffic) sources.add("TRAFFIC");
    if (api.sources?.some((s: string) => s.includes("docker") || s.includes("container"))) {
      sources.add("CONTAINER");
    }
  });
  // Default to REPO if no sources detected
  if (sources.size === 0 && inventory.length > 0) {
    sources.add("REPO");
  }
  return sources;
};

interface DiscoveryPhaseProps {
  onComplete: () => void;
}

const SOURCE_COLORS: Record<string, string> = {
  GATEWAY: "text-[#378ADD]",
  REPO: "text-[#534AB7]",
  TRAFFIC: "text-[#EF9F27]",
  CONTAINER: "text-[#1D9E75]",
  COMPLETE: "text-[#1D9E75] font-medium",
};

const sourceCards = [
  { key: "GATEWAY", icon: Server, label: "API Gateway Scan", desc: "Kong declarative config" },
  { key: "REPO", icon: Code, label: "Code Repository Scan", desc: "Python AST · FastAPI routes" },
  { key: "TRAFFIC", icon: Wifi, label: "Network Traffic Proxy", desc: "Passive observation · eth0" },
  { key: "CONTAINER", icon: Container, label: "Container Metadata", desc: "Docker socket inspection" },
];

const DiscoveryPhase = ({ onComplete }: DiscoveryPhaseProps) => {
  const { inventory, loading, refresh } = useSpectreData();
  const [logLines, setLogLines] = useState<{source: string; text: string; state?: string}[]>([]);
  const [visibleLogs, setVisibleLogs] = useState<{source: string; text: string; state?: string}[]>([]);
  const [displayCount, setDisplayCount] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  // Refresh data on mount to get fresh scan results
  useEffect(() => {
    refresh();
  }, []);

  // Generate logs from real inventory data
  useEffect(() => {
    if (inventory && inventory.length > 0) {
      const lines = generateLogLines(inventory);
      setLogLines(lines);
    }
  }, [inventory]);

  useEffect(() => {
    setVisibleLogs([]);
    setDisplayCount(0);

    if (!logLines.length) return;

    const countStep = Math.max(1, Math.ceil(logLines.length / 8));
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      const nextCount = Math.min(logLines.length, revealed);
      setVisibleLogs(logLines.slice(0, nextCount));
      setDisplayCount(Math.min(logLines.length, nextCount * countStep));
      if (nextCount >= logLines.length) {
        setDisplayCount(logLines.length);
        window.clearInterval(timer);
      }
    }, 180);

    return () => window.clearInterval(timer);
  }, [logLines]);

  // Auto-scroll to latest log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  const activeSources = getActiveSources(inventory || []);
  const apiCount = inventory?.length || 0;
  const hasData = apiCount > 0;

  const getCardState = (key: string) => {
    const hasSourceApis = (inventory || []).some((api) => {
      if (key === "GATEWAY") return api.in_gateway;
      if (key === "REPO") return api.in_repo;
      if (key === "TRAFFIC") return api.seen_in_traffic;
      if (key === "CONTAINER") return api.sources?.some((s: string) => s.includes("docker") || s.includes("container"));
      return false;
    });
    
    if (!activeSources.has(key)) return loading ? "active" : "idle";
    if (hasSourceApis) return "done";
    return "active";
  };

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <PhaseIndicator currentPhase={1} />
      
      <div className="mx-auto flex max-w-6xl gap-6 px-6">
        <div className="w-[58%]">
          <div className="mb-5">
            <h2 className="text-lg font-medium text-foreground">Discovery agent is mapping your API surface</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gateway, repo, traffic, and container signals are merged here before the results are handed to the classifier.</p>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-2.5">
            {sourceCards.map((card) => {
              const state = getCardState(card.key);
              return (
                <div
                  key={card.key}
                  className={`rounded-xl border p-4 transition-all duration-500 ${
                    state === "active" ? "border-foreground/15 bg-card animate-spectre-glow" :
                    state === "done" ? "border-spectre-active/20 bg-card" : "border-border bg-card"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <card.icon className={`h-4 w-4 ${state === "done" ? "text-spectre-active" : "text-muted-foreground"}`} />
                      <span className="text-sm text-foreground">{card.label}</span>
                    </div>
                    {state === "done" && <Check className="h-3.5 w-3.5 text-spectre-active" />}
                  </div>
                  <p className="mb-3 text-[11px] text-muted-foreground">{card.desc}</p>
                  <div className="h-0.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-all duration-1000 ${
                      state === "done" ? "w-full bg-spectre-active" : state === "active" ? "w-2/3 bg-foreground/30" : "w-0"
                    }`} />
                  </div>
                  <div className="mt-1.5 text-[10px] text-muted-foreground">
                    {state === "idle" ? "Waiting…" : state === "active" ? "Scanning…" : "Complete ✓"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">APIs found</div>
            <div className="text-4xl font-medium tabular-nums text-foreground">{displayCount}</div>
          </div>

          {hasData && (
            <div className="mt-20 text-center animate-spectre-fade-in">
              <button
                onClick={onComplete}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Send results to classifier'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="w-[42%]">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-1.5 border-b border-white/5 bg-[#0A0E1A] px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-red-400/50" />
              <div className="h-2 w-2 rounded-full bg-amber-400/50" />
              <div className="h-2 w-2 rounded-full bg-green-400/50" />
              <span className="ml-2 text-[10px] text-gray-500">spectre-scan</span>
            </div>
            <div ref={logRef} className="h-[460px] overflow-y-auto bg-[#0A0E1A] p-3 font-mono text-[11px] leading-relaxed">
              {loading && logLines.length === 0 && (
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="animate-pulse">Scanning...</span>
                </div>
              )}
              {!loading && logLines.length === 0 && (
                <span className="text-gray-600">Waiting for scan data...</span>
              )}
              {visibleLogs.map((line, i) => (
                <div key={i} className="mb-0.5">
                  <span className={SOURCE_COLORS[line.source] || "text-gray-500"}>
                    [{line.source}]
                  </span>{" "}
                  <span className="text-gray-300">{line.text}</span>
                  {line.state && (
                    <span className={`ml-2 text-[10px] ${
                      line.state === "active" ? "text-emerald-400" :
                      line.state === "shadow" ? "text-violet-400" :
                      line.state === "zombie" ? "text-amber-400" :
                      line.state === "rogue" ? "text-rose-400" : "text-gray-500"
                    }`}>
                      ({line.state})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoveryPhase;
