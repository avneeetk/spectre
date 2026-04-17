import { useEffect, useState, useRef } from "react";
import { Server, Code, Wifi, Container, Check } from "lucide-react";
import { SCAN_LOG_LINES, DISCOVERED_APIS } from "@/data/mockData";
import PhaseIndicator from "./PhaseIndicator";
import NavBar from "./NavBar";

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
  const [logLines, setLogLines] = useState<typeof SCAN_LOG_LINES>([]);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [completedSources, setCompletedSources] = useState<Set<string>>(new Set());
  const [apiCount, setApiCount] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sourceLastLine: Record<string, number> = {};
    SCAN_LOG_LINES.forEach((line) => {
      sourceLastLine[line.source] = Math.max(sourceLastLine[line.source] || 0, line.delay);
    });

    SCAN_LOG_LINES.forEach((line, i) => {
      timers.push(
        setTimeout(() => {
          setLogLines((prev) => [...prev, line]);
          setActiveSources((prev) => new Set(prev).add(line.source));
          setApiCount(Math.min(Math.floor((i / SCAN_LOG_LINES.length) * 15) + 1, 15));
          if (line.delay === sourceLastLine[line.source]) {
            setTimeout(() => setCompletedSources((prev) => new Set(prev).add(line.source)), 300);
          }
          if (i === SCAN_LOG_LINES.length - 1) {
            setApiCount(15);
            setTimeout(() => setAllDone(true), 800);
          }
        }, line.delay)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  useEffect(() => {
    if (!allDone) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); onComplete(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [allDone, onComplete]);

  const getCardState = (key: string) => {
    if (completedSources.has(key)) return "done";
    if (activeSources.has(key)) return "active";
    return "idle";
  };

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <PhaseIndicator currentPhase={1} />
      <div className="mx-auto flex max-w-6xl gap-6 px-6">
        <div className="w-[58%]">
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
            <div className="text-4xl font-medium tabular-nums text-foreground">{apiCount}</div>
          </div>

          {allDone && (
            <div className="mt-5 text-center animate-spectre-fade-in">
              <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                Classification starting in {countdown}…
              </span>
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
              {logLines.map((line, i) => (
                <div key={i} className="mb-0.5">
                  <span className={SOURCE_COLORS[line.source] || "text-gray-500"}>
                    [{line.source}]
                  </span>{" "}
                  <span className="text-gray-300">{line.text}</span>
                </div>
              ))}
              {logLines.length === 0 && <span className="text-gray-600">Initializing scan...</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoveryPhase;
