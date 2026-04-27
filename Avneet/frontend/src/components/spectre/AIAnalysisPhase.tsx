import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, GitBranch, ShieldAlert, Sparkles } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import NavBar from "./NavBar";
import { useSpectreData } from "@/providers/SpectreDataProvider";
import type { ApiEndpointUI, ServiceContext } from "@/types/spectre";

interface AIAnalysisPhaseProps {
  onComplete: () => void;
}

const importanceSteps = [
  "Reading business context",
  "Mapping service dependencies",
  "Computing centrality scores",
  "Applying importance scoring",
];

const EMPTY_INVENTORY: ApiEndpointUI[] = [];
const EMPTY_SERVICES: ServiceContext[] = [];

const getServicePriority = (service: ServiceContext) =>
  (service.importance_score || 0) * 100 + Math.round(service.centrality_score * 100);

const AIAnalysisPhase = ({ onComplete }: AIAnalysisPhaseProps) => {
  const { inventory, serviceContext, loading } = useSpectreData();
  const [importanceIndex, setImportanceIndex] = useState(0);
  const [tableVisible, setTableVisible] = useState(false);
  const [mitigationVisible, setMitigationVisible] = useState(false);
  const [revealedMitigations, setRevealedMitigations] = useState(0);
  const [mitigDone, setMitigDone] = useState(false);

  const apis = inventory ?? EMPTY_INVENTORY;

  const topServices = useMemo(
    () =>
      [...(serviceContext ?? EMPTY_SERVICES)]
        .sort((a, b) => getServicePriority(b) - getServicePriority(a))
        .slice(0, 2),
    [serviceContext]
  );

  const mitigationApis = useMemo(
    () =>
      apis.filter(
        (api) =>
          (api.mitigation_steps && api.mitigation_steps.length > 0) ||
          api.mitigation_recommendation ||
          api.technical_fix ||
          api.state !== "active"
      ),
    [apis]
  );

  const importanceProgress = Math.min((importanceIndex / importanceSteps.length) * 100, 100);
  const mitigationProgress = mitigationApis.length
    ? Math.min((revealedMitigations / mitigationApis.length) * 100, 100)
    : mitigationVisible
    ? 100
    : 0;
  const globalProgress = mitigDone ? 100 : mitigationVisible ? 90 : 50;

  useEffect(() => {
    setImportanceIndex(0);
    setTableVisible(false);
    setMitigationVisible(false);
    setRevealedMitigations(0);
    setMitigDone(false);

    if (!apis.length) return;

    let currentStep = 0;
    let phaseDelayTimer: number | undefined;
    const timer = window.setInterval(() => {
      currentStep += 1;
      setImportanceIndex(Math.min(importanceSteps.length, currentStep));

      if (currentStep >= importanceSteps.length) {
        window.clearInterval(timer);
        setTableVisible(true);
        phaseDelayTimer = window.setTimeout(() => {
          setMitigationVisible(true);
        }, 800);
      }
    }, 650);

    return () => {
      window.clearInterval(timer);
      if (phaseDelayTimer) window.clearTimeout(phaseDelayTimer);
    };
  }, [apis]);

  useEffect(() => {
    setRevealedMitigations(0);
    setMitigDone(false);

    if (!mitigationVisible) return;

    if (!mitigationApis.length) {
      const doneTimer = window.setTimeout(() => {
        setMitigDone(true);
      }, 400);
      return () => window.clearTimeout(doneTimer);
    }

    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      setRevealedMitigations(Math.min(mitigationApis.length, revealed));

      if (revealed >= mitigationApis.length) {
        window.clearInterval(timer);
        setMitigDone(true);
      }
    }, 180);

    return () => window.clearInterval(timer);
  }, [mitigationVisible, mitigationApis]);

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />

      <div className="mx-auto max-w-[960px] px-6 pt-2">
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              AI Analysis in progress
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{globalProgress}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#E24B4A] transition-all duration-700"
              style={{ width: `${globalProgress}%` }}
            />
          </div>
        </div>
      </div>

      <PhaseIndicator currentPhase={3} />

      <div className="mx-auto max-w-[960px] px-6 pb-10">
        <div className="mb-8 rounded-2xl border border-border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-foreground">Computing API importance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Importance derived from business inputs and service dependency graph
            </p>
          </div>

          <div className="mb-4 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-spectre-shadow transition-all duration-500"
              style={{ width: `${importanceProgress}%` }}
            />
          </div>

          <div className="mb-5 grid gap-2">
            {importanceSteps.map((step, index) => {
              const done = index < importanceIndex;
              const active = index === importanceIndex && importanceIndex < importanceSteps.length;

              return (
                <div
                  key={step}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-300 ${
                    done
                      ? "border-spectre-active/20 bg-spectre-active-bg/20"
                      : active
                      ? "border-spectre-shadow/20 bg-spectre-shadow-bg/20"
                      : "border-border bg-background"
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                      done
                        ? "bg-spectre-active text-white"
                        : active
                        ? "bg-spectre-shadow text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </div>
                  <span className={done || active ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Importance scoring
              </div>
              <div className="text-3xl font-medium tabular-nums text-foreground">
                {apis.filter((api) => (api.importance_score || 0) > 0).length}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">Endpoints scored with business weighting</div>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                Graph contribution
              </div>
              <div className="text-3xl font-medium tabular-nums text-foreground">
                {topServices[0] ? topServices[0].centrality_score.toFixed(2) : "0.00"}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">Highest service centrality influencing priority</div>
            </div>
          </div>
        </div>

        {mitigationVisible && (
          <div className="rounded-2xl border border-[#E24B4A]/20 bg-[#E24B4A]/[0.05] p-5 animate-spectre-fade-in">
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#E24B4A]" />
                <h3 className="text-lg font-medium text-foreground">Generating mitigation plan</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">AI is reasoning step-by-step for each endpoint</p>
            </div>

            <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/60 dark:bg-background/40">
              <div
                className="h-full rounded-full bg-[#E24B4A] transition-all duration-500"
                style={{ width: `${mitigationProgress}%` }}
              />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[#E24B4A]/10 bg-background/80 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">At-risk APIs</div>
                <div className="text-2xl font-medium tabular-nums text-foreground">{mitigationApis.length}</div>
              </div>
              <div className="rounded-xl border border-[#E24B4A]/10 bg-background/80 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Steps revealed</div>
                <div className="text-2xl font-medium tabular-nums text-foreground">{revealedMitigations}</div>
              </div>
              <div className="rounded-xl border border-[#E24B4A]/10 bg-background/80 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Technical fixes</div>
                <div className="text-2xl font-medium tabular-nums text-foreground">
                  {mitigationApis.filter((api) => api.technical_fix).length}
                </div>
              </div>
              <div className="rounded-xl border border-[#E24B4A]/10 bg-background/80 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Next actions</div>
                <div className="text-2xl font-medium tabular-nums text-foreground">
                  {mitigationApis.filter((api) => api.ai_next_step).length}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {mitigationApis.slice(0, revealedMitigations).map((api) => (
                <div key={api.id} className="rounded-xl border border-[#E24B4A]/10 bg-background/90 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <MethodBadge method={api.method} />
                    <span className="font-mono text-sm text-foreground">{api.path || api.endpoint}</span>
                    <StateBadge state={api.state} />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      Importance {api.importance_score}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      Tech {api.technical_score}
                    </span>
                  </div>

                  {api.mitigation_steps && api.mitigation_steps.length > 0 ? (
                    <div className="space-y-2">
                      {api.mitigation_steps.map((step) => (
                        <div key={step.step} className="flex items-start gap-3 text-xs">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E24B4A]/10 text-[10px] font-medium text-[#E24B4A]">
                            {step.step}
                          </div>
                          <div>
                            <div className="text-foreground">{step.action}</div>
                            <div className="text-[10px] text-muted-foreground">{step.finding}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      No mitigation steps were generated for this endpoint.
                    </div>
                  )}

                  {api.mitigation_recommendation && (
                    <div
                      className={`mt-3 rounded-lg border-l-2 p-3 ${
                        api.mitigation_recommendation.includes("Block")
                          ? "border-l-spectre-zombie bg-spectre-zombie-bg/30"
                          : "border-l-spectre-active bg-spectre-active-bg/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{api.mitigation_recommendation}</span>
                        {api.mitigation_confidence && (
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-[#A43A37] dark:bg-background/30">
                            {api.mitigation_confidence}% confidence
                          </span>
                        )}
                      </div>
                      {api.mitigation_detail && (
                        <p className="mt-1 text-[10px] text-muted-foreground">{api.mitigation_detail}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {!mitigationApis.length && (
                <div className="rounded-xl border border-dashed border-[#E24B4A]/20 bg-background/80 px-4 py-8 text-center text-sm text-muted-foreground">
                  No mitigation workflow was required for this analysis run.
                </div>
              )}
            </div>
          </div>
        )}

        {mitigDone && (
          <div className="mt-8 flex justify-center animate-spectre-fade-in">
            <button
              onClick={onComplete}
              className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Open security dashboard
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading && !apis.length && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Preparing AI analysis context from live inventory data...
          </div>
        )}

        {!loading && !apis.length && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            No classified APIs are available yet for AI analysis.
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAnalysisPhase;
