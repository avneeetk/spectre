import { useEffect, useState } from "react";
import { Loader2, Check, X, Star } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import NavBar from "./NavBar";
import { useSpectreData } from "@/providers/SpectreDataProvider";

interface ClassificationPhaseProps {
  onComplete: () => void;
}

const ClassificationPhase = ({ onComplete }: ClassificationPhaseProps) => {
  const { inventory } = useSpectreData();
  const [classifiedCount, setClassifiedCount] = useState(0);
  const [owaspPhase, setOwaspPhase] = useState<"idle" | "checking" | "done">("idle");
  const [owaspChecked, setOwaspChecked] = useState<string[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    inventory.forEach((_, i) => {
      timers.push(setTimeout(() => setClassifiedCount(i + 1), i * 500));
    });

    const afterCards = inventory.length * 500 + 500;
    timers.push(setTimeout(() => setOwaspPhase("checking"), afterCards));

    const checks = ["API2", "API4", "API8", "API9"];
    checks.forEach((c, i) => {
      timers.push(setTimeout(() => setOwaspChecked((prev) => [...prev, c]), afterCards + 400 + i * 600));
    });

    timers.push(setTimeout(() => setOwaspPhase("done"), afterCards + 400 + checks.length * 600 + 300));
    timers.push(setTimeout(() => onComplete(), afterCards + 400 + checks.length * 600 + 2300));

    return () => timers.forEach(clearTimeout);
  }, [onComplete, inventory]);

  const total = inventory.length;
  const classified = inventory.slice(0, classifiedCount);
  const stateCounts = classified.reduce(
    (acc, api) => { acc[api.state] = (acc[api.state] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <PhaseIndicator currentPhase={2} />
      <div className="mx-auto max-w-[800px] px-6">
        <div className="mb-5">
          <h2 className="mb-3 text-lg font-medium text-foreground">
            Classifying APIs — {classifiedCount} of {total}
          </h2>
          <div className="h-0.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground transition-all duration-500" style={{ width: `${(classifiedCount / total) * 100}%` }} />
          </div>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-2.5">
          {classified.map((api) => (
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

        {owaspPhase !== "idle" && (
          <div className="mb-8 animate-spectre-fade-in">
            <h3 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">OWASP security checks</h3>
            <div className="space-y-1.5">
              {[
                { id: "API2", name: "Broken Authentication" },
                { id: "API4", name: "Rate Limiting" },
                { id: "API8", name: "Security Config" },
                { id: "API9", name: "Inventory Management", star: true },
              ].map((check) => {
                const isDone = owaspChecked.includes(check.id);
                return (
                  <div key={check.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
                    <span className={`text-xs ${check.star ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {check.id}
                      {check.star && <Star className="inline h-3 w-3 ml-0.5 text-spectre-rogue" />}
                    </span>
                    <span className="text-xs text-muted-foreground flex-1">{check.name}</span>
                    {isDone ? (
                      <Check className="h-3.5 w-3.5 text-spectre-active" />
                    ) : (
                      <span className="flex gap-0.5">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="h-1 w-1 rounded-full bg-muted-foreground animate-dot-pulse" style={{ animationDelay: `${d * 200}ms` }} />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3">
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
    </div>
  );
};

export default ClassificationPhase;
