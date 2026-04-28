import { useEffect, useState } from "react";
import { Check, Star, ArrowRight } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import NavBar from "./NavBar";
import { useSpectreData } from "@/providers/SpectreDataProvider";

interface ClassificationPhaseProps {
  onComplete: () => void;
}

const EMPTY_INVENTORY = [];

const ClassificationPhase = ({ onComplete }: ClassificationPhaseProps) => {
  const { inventory, loading } = useSpectreData();
  const [showOwasp, setShowOwasp] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);

  const total = inventory?.length || 0;
  const classified = inventory ?? EMPTY_INVENTORY;
  
  // OWASP checks are derived from actual inventory data
  const owaspChecks = ["API2", "API4", "API8", "API9"];
  const hasOwaspFlags = classified.some((api) => api.owasp_flags?.length > 0);
  const stateCounts = classified.reduce(
    (acc, api) => { acc[api.state] = (acc[api.state] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  useEffect(() => {
    setRevealedCount(0);
    if (!classified.length) return;

    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      setRevealedCount(Math.min(classified.length, revealed));
      if (revealed >= classified.length) window.clearInterval(timer);
    }, 140);

    return () => window.clearInterval(timer);
  }, [classified]);

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <PhaseIndicator currentPhase={2} />
   <div className="max flex justify-center pt-4">
      <div className="flex mb-5 gap-3">
          {[
            { label: "Active", key: "active", cls: "text-spectre-active" },
            { label: "Zombie", key: "zombie", cls: "text-spectre-zombie" },
            { label: "Shadow", key: "shadow", cls: "text-spectre-shadow" },
            { label: "Rogue", key: "rogue", cls: "text-spectre-rogue" },
          ].map(({ label, key, cls }) => (
            <div key={key} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2">
              <span className={`text-xl font-medium tabular-nums ${cls}`}>{stateCounts[key] || 0}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-[800px] px-6">
        
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-medium text-foreground">
            Classifier labeled {Math.min(revealedCount, total)} discovered APIs
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Discovery output is now normalized into endpoint states, OWASP signals, and service ownership before being sent to the AI Layer.
          </p>
          <div className="h-0.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-spectre-active transition-all duration-300" style={{ width: `${total ? (revealedCount / total) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-2.5">
          {classified.slice(0, revealedCount).map((api) => (
            <div key={api.id} className="rounded-xl border border-border bg-card p-3 animate-spectre-fade-in">
              <div className="mb-1 flex items-center gap-2">
                <MethodBadge method={api.method} />
                <span className="truncate font-mono text-[11px] text-foreground" title={api.path}>{api.path}</span>
              </div>
              <div className="mb-2">
                <StateBadge state={api.state} />
              </div>
              <div className="text-[10px] text-muted-foreground">{api.service_name}</div>
            </div>
          ))}
        </div>

        <div className="mb-6">
          <button
            onClick={() => setShowOwasp(!showOwasp)}
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            {showOwasp ? "Hide" : "View"} OWASP security checks
          </button>
        </div>

        {showOwasp && (
          <div className="mb-8 animate-spectre-fade-in">
            <h3 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">OWASP security checks</h3>
            <div className="space-y-1.5">
              {[
                { id: "API2", name: "Broken Authentication", desc: "Weak auth mechanisms" },
                { id: "API4", name: "Rate Limiting", desc: "Missing throttling" },
                { id: "API8", name: "Security Config", desc: "Misconfiguration exposure" },
                { id: "API9", name: "Inventory Management", desc: "Unknown API exposure", star: true },
              ].map((check) => {
                // Check if any API has this OWASP flag
                const flaggedCount = classified.filter((api) => 
                  api.owasp_flags?.includes(check.id)
                ).length;
                const isFlagged = flaggedCount > 0;
                
                return (
                  <div key={check.id} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
                    isFlagged ? "border-spectre-rogue/30 bg-spectre-rogue-bg/20" : "border-border bg-card"
                  }`}>
                    <span className={`text-xs ${check.star ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {check.id}
                      {check.star && <Star className="inline h-3 w-3 ml-0.5 text-spectre-rogue" />}
                    </span>
                    <div className="flex-1">
                      <span className="text-xs text-muted-foreground">{check.name}</span>
                      {isFlagged && (
                        <span className="ml-2 text-[10px] text-spectre-rogue">
                          {flaggedCount} APIs flagged
                        </span>
                      )}
                    </div>
                    {isFlagged ? (
                      <span className="text-[10px] text-spectre-rogue">Flagged</span>
                    ) : (
                      <Check className="h-3.5 w-3.5 text-spectre-active" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual proceed button */}
        <div className="flex justify-center mt-0">
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Send results to AI Layer
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        
      </div>
    </div>
  );
};

export default ClassificationPhase;
