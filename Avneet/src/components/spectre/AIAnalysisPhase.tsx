import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import StateBadge from "./StateBadge";
import NavBar from "./NavBar";
import { useSpectreData } from "@/providers/SpectreDataProvider";

interface AIAnalysisPhaseProps {
  onComplete: () => void;
}

const importanceSteps = [
  "Reading system type: Fintech / banking…",
  "Reading declared regulations: PCI-DSS, GDPR…",
  "Reading critical service: payment processing…",
  "Building service dependency graph from traffic data…",
  "Computing centrality scores…",
  "Applying importance scores to 15 APIs…",
];

const AIAnalysisPhase = ({ onComplete }: AIAnalysisPhaseProps) => {
  const { inventory, serviceContext } = useSpectreData();
  const topServices = [...serviceContext].slice(0, 4);
  const flaggedApis = inventory.filter((a) => a.mitigation_steps && a.mitigation_steps.length > 0);
  const [subStep, setSubStep] = useState<"importance" | "mitigation">("importance");

  // Importance step state
  const [importIdx, setImportIdx] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const [tableRows, setTableRows] = useState(0);

  // Mitigation state
  const [mitigApiIdx, setMitigApiIdx] = useState(0);
  const [mitigStepIdx, setMitigStepIdx] = useState(0);
  const [mitigShowRec, setMitigShowRec] = useState(false);
  const [mitigDone, setMitigDone] = useState(false);

  // Importance animation
  useEffect(() => {
    if (subStep !== "importance") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    importanceSteps.forEach((_, i) => {
      timers.push(setTimeout(() => setImportIdx(i + 1), (i + 1) * 600));
    });
    const afterSteps = importanceSteps.length * 600 + 400;
    timers.push(setTimeout(() => setShowTable(true), afterSteps));
    topServices.forEach((_, i) => {
      timers.push(setTimeout(() => setTableRows(i + 1), afterSteps + 300 + i * 300));
    });
    timers.push(setTimeout(() => setSubStep("mitigation"), afterSteps + topServices.length * 300 + 3000));
    return () => timers.forEach(clearTimeout);
  }, [subStep]);

  // Mitigation animation
  useEffect(() => {
    if (subStep !== "mitigation") return;
    if (mitigApiIdx >= flaggedApis.length) {
      setMitigDone(true);
      return;
    }
    const api = flaggedApis[mitigApiIdx];
    const steps = api.mitigation_steps || [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    setMitigStepIdx(0);
    setMitigShowRec(false);

    const STEP_MS = 1700; // slowed down so users can actually read
    const API_PAUSE_MS = 1400;

    steps.forEach((_, i) => {
      timers.push(setTimeout(() => setMitigStepIdx(i + 1), (i + 1) * STEP_MS));
    });
    timers.push(setTimeout(() => setMitigShowRec(true), (steps.length + 1) * STEP_MS));
    timers.push(
      setTimeout(() => {
        setMitigApiIdx((prev) => prev + 1);
      }, (steps.length + 1) * STEP_MS + API_PAUSE_MS)
    );

    return () => timers.forEach(clearTimeout);
  }, [subStep, mitigApiIdx]);

  const currentApi = mitigApiIdx < flaggedApis.length ? flaggedApis[mitigApiIdx] : null;

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <PhaseIndicator currentPhase={3} />
      <div className="mx-auto max-w-[640px] px-6">
        {/* Mini sub-step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className={`h-1.5 w-16 rounded-full ${subStep === "importance" ? "bg-foreground" : "bg-spectre-active"}`} />
          <div className={`h-1.5 w-16 rounded-full ${subStep === "mitigation" ? "bg-foreground" : "bg-muted"}`} />
        </div>

        {subStep === "importance" && (
          <div className="animate-spectre-fade-in">
            <h2 className="text-xl font-medium tracking-tight text-foreground mb-1">Computing API importance</h2>
            <p className="text-sm text-muted-foreground mb-8">Using your business answers + service dependency graph</p>

            <div className="space-y-2 mb-8">
              {importanceSteps.map((step, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm transition-all ${i < importIdx ? "text-foreground" : "text-muted-foreground/30"}`}>
                  {i < importIdx && <Check className="h-3.5 w-3.5 text-spectre-active shrink-0" />}
                  {i >= importIdx && <div className="h-3.5 w-3.5 shrink-0" />}
                  {step}
                </div>
              ))}
            </div>

            {showTable && (
              <div className="animate-spectre-fade-in rounded-xl border border-border bg-card overflow-hidden mb-6">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Service</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Criticality</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Centrality</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Importance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topServices.slice(0, tableRows).map((svc) => (
                      <tr key={svc.service_name} className="border-b border-border/50 animate-spectre-fade-in">
                        <td className="px-4 py-2 font-mono text-foreground">{svc.service_name}</td>
                        <td className="px-4 py-2 capitalize text-muted-foreground">{svc.criticality}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{svc.centrality_score.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">{svc.importance_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tableRows >= topServices.length && (
              <p className="text-xs text-muted-foreground italic animate-spectre-fade-in">
                Payment and auth APIs elevated to top priority based on your business context.
              </p>
            )}
          </div>
        )}

        {subStep === "mitigation" && (
          <div className="animate-spectre-fade-in">
            <h2 className="text-xl font-medium tracking-tight text-foreground mb-1">Mitigation agent investigating flagged APIs</h2>
            <p className="text-sm text-muted-foreground mb-8">Checking {flaggedApis.length} high-risk endpoints</p>

            {currentApi && (
              <div className="animate-spectre-fade-in" key={currentApi.id}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-mono text-sm text-foreground">{currentApi.path}</span>
                  <StateBadge state={currentApi.state} />
                </div>

                <div className="space-y-3 mb-6">
                  {(currentApi.mitigation_steps || []).map((s, i: number) => (
                    <div key={s.step} className={`transition-all ${i < mitigStepIdx ? "opacity-100" : "opacity-20"}`}>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E24B4A]/10 text-[10px] font-medium text-[#E24B4A]">{s.step}</div>
                        {i < mitigStepIdx && <Check className="h-3 w-3 text-spectre-active shrink-0" />}
                        <span className="text-foreground">{s.action}</span>
                      </div>
                      {i < mitigStepIdx && (
                        <p className="ml-7 mt-0.5 text-xs text-muted-foreground">{s.finding}</p>
                      )}
                    </div>
                  ))}
                </div>

                {mitigShowRec && currentApi.mitigation_recommendation && (
                  <div className="animate-spectre-fade-in rounded-xl border-l-2 border-l-spectre-active bg-spectre-active-bg/30 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{currentApi.mitigation_recommendation}</span>
                      <span className="rounded-full bg-spectre-active-bg px-2 py-0.5 text-[10px] font-medium text-spectre-active">
                        {currentApi.mitigation_confidence}% confidence
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-4 text-xs text-muted-foreground text-center">
                  {mitigApiIdx + 1} of {flaggedApis.length} endpoints
                </div>
              </div>
            )}

            {mitigDone && (
              <div className="text-center animate-spectre-fade-in mt-8">
                <button
                  onClick={onComplete}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  View full results
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAnalysisPhase;
