import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ShieldAlert, Sparkles, TerminalSquare } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import NavBar from "./NavBar";
import { useSpectreData } from "@/providers/SpectreDataProvider";
import type { ApiEndpointUI } from "@/types/spectre";

interface AIAnalysisPhaseProps {
  onComplete: () => void;
}

type Severity = "Critical" | "High" | "Medium" | "Low";
type ActionType = "decommission" | "register" | "harden" | "review";

type EndpointAnalysis = {
  api: ApiEndpointUI;
  endpointLabel: string;
  severity: Severity;
  actionType: ActionType;
  riskSummary: string;
  violationLines: string[];
  technicalFix: string;
  priority: number;
};

const analysisSteps = [
  "Classifying severity",
  "Choosing action type",
  "Retrieving OWASP context",
  "Generating risk summary",
  "Generating technical fix",
];

const BOARD_COLUMNS: Array<{ key: ActionType; label: string; helper: string }> = [
  { key: "decommission", label: "Decommission", helper: "Zombie / Rogue endpoints" },
  { key: "register", label: "Register", helper: "Shadow endpoints" },
  { key: "harden", label: "Harden", helper: "Active endpoints with violations" },
  { key: "review", label: "Review", helper: "Fallback action type" },
];

const EMPTY_INVENTORY: ApiEndpointUI[] = [];
const SEVERITY_RANK: Record<Severity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const truncate = (text?: string | null, length = 140) => {
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length)}...` : text;
};

const toTitleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const getEndpointLabel = (api: ApiEndpointUI) => api.path || api.endpoint || "/unknown";

const getSeverityTone = (severity: Severity) => {
  if (severity === "Critical") return "border-spectre-zombie/20 bg-spectre-zombie-bg/30 text-spectre-zombie";
  if (severity === "High") return "border-spectre-rogue/20 bg-spectre-rogue-bg/30 text-spectre-rogue";
  if (severity === "Medium") return "border-spectre-shadow/20 bg-spectre-shadow-bg/30 text-spectre-shadow";
  return "border-spectre-active/20 bg-spectre-active-bg/30 text-spectre-active";
};

const getActionTone = (actionType: ActionType) => {
  if (actionType === "decommission") return "border-spectre-zombie/20 bg-spectre-zombie-bg/20";
  if (actionType === "register") return "border-spectre-shadow/20 bg-spectre-shadow-bg/20";
  if (actionType === "harden") return "border-spectre-active/20 bg-spectre-active-bg/20";
  return "border-border bg-card";
};

const getSeverity = (api: ApiEndpointUI): Severity => {
  if (api.severity) return api.severity;
  const state = api.state?.toLowerCase();
  const flags = api.owasp_flags || [];
  const authPresent = api.auth_present ?? api.auth_detected ?? !flags.includes("API2");
  const tlsEnabled = !flags.includes("API8");

  if (state === "rogue") return "Critical";
  if (state === "zombie" && !authPresent && !tlsEnabled) return "High";
  if (state === "zombie" && !authPresent) return "High";
  if (state === "shadow" && !authPresent) return "High";
  if (flags.length >= 3) return "High";
  if (flags.length >= 1) return "Medium";
  return "Low";
};

const getActionType = (api: ApiEndpointUI): ActionType => {
  if (api.action_type) return api.action_type;
  const state = api.state?.toLowerCase();
  if (state === "zombie" || state === "rogue") return "decommission";
  if (state === "shadow") return "register";
  if (state === "active") return "harden";
  return "review";
};

const getViolationLines = (api: ApiEndpointUI) => {
  const raw = api.violations as unknown;

  if (Array.isArray(raw)) {
    return raw.filter((line): line is string => Boolean(line)).slice(0, 4);
  }

  if (typeof raw === "string") {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.toLowerCase() !== "none")
      .slice(0, 4);
  }

  return [];
};

const getRiskSummary = (api: ApiEndpointUI, actionType: ActionType) =>
  api.risk_summary ||
  api.ai_summary ||
  api.why_this_matters ||
  api.priority_summary ||
  api.importance_summary ||
  api.mitigation_detail ||
  (actionType === "decommission"
    ? "This endpoint should be removed or blocked because it no longer fits the approved API surface and carries unnecessary exposure."
    : actionType === "register"
      ? "This endpoint is behaving like a live API but is missing formal registration and governance context."
      : "This endpoint is active, but the AI layer is checking whether it still needs hardening or continued monitoring.");

const getTechnicalFix = (api: ApiEndpointUI, actionType: ActionType) =>
  api.technical_fix ||
  api.ai_next_step ||
  api.mitigation_recommendation ||
  (actionType === "harden"
    ? "No violations detected. Continue monitoring this endpoint regularly."
    : "AI is preparing a remediation response for this endpoint.");

const getPriority = (api: ApiEndpointUI, severity: Severity, actionType: ActionType) =>
  SEVERITY_RANK[severity] * 100 +
  (actionType === "decommission" ? 35 : actionType === "register" ? 20 : 10) +
  (api.owasp_flags?.length || 0) * 8 +
  (api.technical_score || 0) +
  (api.importance_score || 0) * 0.4 +
  (api.seen_in_traffic ? 12 : 0);

const AIAnalysisPhase = ({ onComplete }: AIAnalysisPhaseProps) => {
  const { inventory, loading } = useSpectreData();
  const [stepIndex, setStepIndex] = useState(0);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [phaseDone, setPhaseDone] = useState(false);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

  const apis = inventory ?? EMPTY_INVENTORY;

  const analyses = useMemo<EndpointAnalysis[]>(
    () =>
      [...apis]
        .map((api) => {
          const severity = getSeverity(api);
          const actionType = getActionType(api);

          return {
            api,
            endpointLabel: getEndpointLabel(api),
            severity,
            actionType,
            riskSummary: getRiskSummary(api, actionType),
            violationLines: getViolationLines(api),
            technicalFix: getTechnicalFix(api, actionType),
            priority: getPriority(api, severity, actionType),
          };
        })
        .sort((a, b) => b.priority - a.priority || a.endpointLabel.localeCompare(b.endpointLabel)),
    [apis]
  );

  const visibleAnalysisCount = Math.min(revealedCount, analyses.length);
  const visibleQueue = analyses.slice(0, Math.min(visibleAnalysisCount, 8));
  const additionalCount = Math.max(visibleAnalysisCount - visibleQueue.length, 0);
  const selectedAnalysis =
    visibleQueue.find((analysis) => analysis.api.id === selectedAnalysisId) ||
    visibleQueue[0] ||
    analyses[0] ||
    null;

  const stepProgress = Math.min((stepIndex / analysisSteps.length) * 100, 100);
  const queueProgress = analyses.length ? Math.min((revealedCount / analyses.length) * 100, 100) : resultsVisible ? 100 : 0;
  const globalProgress = phaseDone ? 100 : resultsVisible ? Math.min(62 + queueProgress * 0.38, 99) : Math.round(15 + stepProgress * 0.47);

  const criticalHighCount = analyses.filter((analysis) => analysis.severity === "Critical" || analysis.severity === "High").length;
  const decommissionCount = analyses.filter((analysis) => analysis.actionType === "decommission").length;
  const registerCount = analyses.filter((analysis) => analysis.actionType === "register").length;
  const hardenCount = analyses.filter((analysis) => analysis.actionType === "harden").length;
  const flaggedCount = analyses.filter((analysis) => analysis.api.owasp_flags.length > 0).length;
  const visibleColumns = BOARD_COLUMNS
    .map((column) => ({
      ...column,
      items: visibleQueue.filter((analysis) => analysis.actionType === column.key),
      total: analyses.filter((analysis) => analysis.actionType === column.key).length,
    }))
    .filter((column) => column.key !== "review" || column.total > 0);
  const progressNarrative = !resultsVisible
    ? `${analysisSteps[Math.min(stepIndex, analysisSteps.length - 1)] || analysisSteps[0]} across classified endpoints`
    : phaseDone
      ? "AI analysis complete. Results are ready for the security dashboard."
      : `AI is filling action lanes and generating remediation output for ${visibleAnalysisCount}/${analyses.length} endpoints`;

  useEffect(() => {
    setStepIndex(0);
    setResultsVisible(false);
    setRevealedCount(0);
    setPhaseDone(false);
    setSelectedAnalysisId(null);

    if (!apis.length) return;

    let currentStep = 0;
    let revealTimer: number | undefined;
    const timer = window.setInterval(() => {
      currentStep += 1;
      setStepIndex(Math.min(analysisSteps.length, currentStep));

      if (currentStep >= analysisSteps.length) {
        window.clearInterval(timer);
        revealTimer = window.setTimeout(() => {
          setResultsVisible(true);
        }, 500);
      }
    }, 520);

    return () => {
      window.clearInterval(timer);
      if (revealTimer) window.clearTimeout(revealTimer);
    };
  }, [apis]);

  useEffect(() => {
    setRevealedCount(0);
    setPhaseDone(false);
    setSelectedAnalysisId(null);

    if (!resultsVisible) return;

    if (!analyses.length) {
      const doneTimer = window.setTimeout(() => {
        setPhaseDone(true);
      }, 300);
      return () => window.clearTimeout(doneTimer);
    }

    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      setRevealedCount(Math.min(analyses.length, revealed));

      if (revealed >= analyses.length) {
        window.clearInterval(timer);
        setPhaseDone(true);
      }
    }, 120);

    return () => window.clearInterval(timer);
  }, [resultsVisible, analyses]);

  useEffect(() => {
    if (!selectedAnalysisId && visibleQueue[0]) {
      setSelectedAnalysisId(visibleQueue[0].api.id);
    }
  }, [visibleQueue, selectedAnalysisId]);

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <PhaseIndicator currentPhase={3} />
      <div className="mx-auto max-w-6xl px-6 pb-10">
        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#A43A37]">AI Analysis</div>
              <h2 className="text-lg font-medium text-foreground">AI layer is prioritizing what happens next</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {progressNarrative}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Analyzed</div>
                <div className="text-sm font-medium tabular-nums text-foreground">{revealedCount}</div>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Critical / High</div>
                <div className="text-sm font-medium tabular-nums text-foreground">{criticalHighCount}</div>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">OWASP flagged</div>
                <div className="text-sm font-medium tabular-nums text-foreground">{flaggedCount}</div>
              </div>
            </div>
          </div>

          <div className="mb-3 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#E24B4A] transition-all duration-700"
              style={{ width: `${globalProgress}%` }}
            />
          </div>

          <div className="mb-4 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Scan progress</span>
            <span className="tabular-nums">{globalProgress}%</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {analysisSteps.map((step, index) => {
              const done = index < stepIndex;
              const active = index === stepIndex && stepIndex < analysisSteps.length;

              return (
                <div
                  key={step}
                  className={`rounded-full border px-3 py-2 text-[11px] transition-all duration-300 ${
                    done
                      ? "border-spectre-active/20 bg-spectre-active-bg/20 text-foreground"
                      : active
                        ? "border-spectre-shadow/20 bg-spectre-shadow-bg/20 text-foreground"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className="mr-2 font-medium">{done ? "✓" : index + 1}</span>
                  {step}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-6">
          <div className="w-[58%]">
            {resultsVisible ? (
              <div className="rounded-xl border border-border bg-card p-4 flex flex-col min-h-[520px]">

                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#A43A37]">
                      AI Action Board
                    </div>
                    <div className="text-sm text-foreground">
                      Prioritized decisions across your API surface
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {visibleAnalysisCount}/{analyses.length}
                  </div>
                </div>

                {/* <div className="mb-4 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-[#E24B4A] transition-all duration-500"
                    style={{ width: `${queueProgress}%` }}
                  />
                </div> */}

                <div className="grid grid-cols-3 gap-3 flex-1 items-stretch">
                  {visibleColumns.map((column) => {
                    const sortedItems = [...column.items].sort(
                      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
                    );

                    return (
                      <div
                        key={column.key}
                        className="rounded-lg border border-border bg-background flex flex-col h-full"
                      >
                        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                          <div className="text-xs font-medium text-foreground">
                            {column.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {column.items.length}/{column.total}
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                          {sortedItems.length > 0 ? (
                            sortedItems.map((analysis) => {
                              const isSelected = selectedAnalysis?.api.id === analysis.api.id;

                              return (
                                <button
                                  key={analysis.api.id}
                                  onClick={() => setSelectedAnalysisId(analysis.api.id)}
                                  className={`w-full text-left rounded-md border px-3 py-2 transition-all ${
                                    isSelected
                                      ? "border-[#E24B4A]/30 bg-[#E24B4A]/[0.06]"
                                      : "border-border hover:border-[#E24B4A]/20"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                      <MethodBadge method={analysis.api.method} />
                                      <StateBadge state={analysis.api.state} />
                                    </div>

                                    <span
                                      className={`text-[10px] ${
                                        analysis.severity === "Critical"
                                          ? "text-red-500"
                                          : analysis.severity === "High"
                                          ? "text-orange-400"
                                          : analysis.severity === "Medium"
                                          ? "text-yellow-400"
                                          : "text-green-400"
                                      }`}
                                    >
                                      {analysis.severity}
                                    </span>
                                  </div>

                                  <div className="font-mono text-[11px] text-foreground truncate">
                                    {analysis.endpointLabel}
                                  </div>

                                  <div className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                                    {truncate(analysis.riskSummary, 80)}
                                  </div>

                                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>{analysis.api.owasp_flags.length} flags</span>
                                    <span className="capitalize">
                                      {analysis.actionType === "decommission"
                                        ? "Remove"
                                        : analysis.actionType === "register"
                                        ? "Add"
                                        : analysis.actionType === "harden"
                                        ? "Fix"
                                        : "Review"}
                                    </span>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground">
                              No endpoints
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {additionalCount > 0 && (
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    {additionalCount} more analyzed endpoint{additionalCount === 1 ? "" : "s"} will be available in the dashboard.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                AI action board will appear as soon as the analysis pipeline starts returning endpoint decisions.
              </div>
            )}
          </div>

          <div className="w-[42%]">
            <div className="rounded-xl border border-border overflow-hidden animate-spectre-fade-in">
              <div className="flex items-center gap-1.5 border-b border-white/5 bg-[#0A0E1A] px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-red-400/50" />
                <div className="h-2 w-2 rounded-full bg-amber-400/50" />
                <div className="h-2 w-2 rounded-full bg-green-400/50" />
                <TerminalSquare className="ml-2 h-3.5 w-3.5 text-gray-500" />
                <span className="text-[10px] text-gray-500">spectre-ai</span>
              </div>

              <div className="min-h-[520px] bg-[#0A0E1A] p-4">
                {!resultsVisible || !selectedAnalysis ? (
                  <div className="flex h-full min-h-[488px] items-center justify-center text-center">
                    <div>
                      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">AI Layer</div>
                      <div className="text-sm text-gray-400">
                        {loading ? "Preparing endpoint context..." : "Waiting for AI analysis output..."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 font-mono text-[11px] leading-relaxed">
                    <div className="border-b border-white/5 pb-3">
                      <div className="mb-1 text-gray-500">SELECTED_ENDPOINT</div>
                      <div className="text-gray-200">{selectedAnalysis.endpointLabel}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-300">
                          {selectedAnalysis.api.method}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-300">
                          {selectedAnalysis.api.state}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-300">
                          {selectedAnalysis.severity}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-300">
                          {selectedAnalysis.actionType === "decommission"
                            ? "Remove / Block"
                            : selectedAnalysis.actionType === "register"
                            ? "Add to Inventory"
                            : selectedAnalysis.actionType === "harden"
                            ? "Fix Security Issues"
                            : "Needs Review"}
                        </span>
                      </div>
                    </div>

                    <div className="border-b border-white/5 pb-3">
                      <div className="mb-1 text-[#E24B4A]">RISK_SUMMARY</div>
                      <div className="text-gray-300">{selectedAnalysis.riskSummary}</div>
                    </div>

                    <div className="border-b border-white/5 pb-3">
                      <div className="mb-1 text-[#EF9F27]">VIOLATIONS</div>
                      {selectedAnalysis.violationLines.length > 0 ? (
                        <div className="space-y-1.5 text-gray-300">
                          {selectedAnalysis.violationLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-500">No violation lines were generated for this endpoint.</div>
                      )}
                    </div>

                    <div>
                      <div className="mb-1 text-[#1D9E75]">TECHNICAL_FIX</div>
                      <div className="whitespace-pre-wrap break-words text-gray-300">{selectedAnalysis.technicalFix}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {phaseDone && (
          <div className="mt-8 flex justify-center animate-spectre-fade-in">
            <button
              onClick={onComplete}
              className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
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
