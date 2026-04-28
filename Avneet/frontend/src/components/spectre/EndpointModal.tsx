import { useEffect, useState } from "react";
import { BrainCircuit, X, Check, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import { useTheme } from "@/hooks/useTheme";
import type { ApiEndpointUI, DecommissionQueueItem, ServiceContext } from "@/types/spectre";

interface EndpointModalProps {
  api: ApiEndpointUI;
  serviceContext: ServiceContext[];
  decommQueue: DecommissionQueueItem[];
  onClose: () => void;
  onAddToDecomm: (id: string) => void;
  onMarkReviewed: (id: string) => void;
}

const OWASP_NAMES: Record<string, string> = {
  API2: "Broken Authentication",
  API4: "Unrestricted Resource Consumption",
  API8: "Security Misconfiguration",
  API9: "Improper Inventory Management",
};

const getAIConfidenceLabel = (confidence = 0) => {
  if (confidence >= 0.9) return "High";
  if (confidence >= 0.78) return "Medium";
  return "Low";
};

const getReasoningTags = (api: ApiEndpointUI, serviceCtx?: ServiceContext) => {
  const tags: string[] = [];

  if (api.auth_detected === false || api.auth_present === false || api.owasp_flags.includes("API2")) tags.push("No authentication");
  if (api.state === "zombie") tags.push("Deprecated endpoint");
  if (api.owasp_flags.includes("API9") || (!api.in_gateway && !api.in_repo)) tags.push("Inventory mismatch");
  if (api.owasp_flags.includes("API4")) tags.push("Rate limit missing");
  if ((serviceCtx?.is_public_facing || api.is_external_facing) && api.importance_score > 40) tags.push("Public exposure");
  if ((api.data_sensitivity || api.m2_data_sensitivity)?.toLowerCase() === "critical") tags.push("Sensitive data exposure");

  return Array.from(new Set(tags)).slice(0, 4);
};

const formatRegulation = (value?: string) => {
  const labels: Record<string, string> = {
    pci: "PCI",
    gdpr: "GDPR",
    hipaa: "HIPAA",
    soc2: "SOC 2",
    iso27001: "ISO 27001",
  };
  return value ? (labels[value.toLowerCase()] || value.toUpperCase()) : "None";
};

const getBusinessTags = (api: ApiEndpointUI, serviceCtx?: ServiceContext) => {
  if (api.business_tags?.length) return api.business_tags;

  const tags: string[] = [];
  if (api.business_impact === "CRITICAL" || api.business_impact === "HIGH" || api.importance_score >= 70) tags.push("Business Critical");
  if (api.regulatory_scope?.length) tags.push(`Regulated (${formatRegulation(api.regulatory_scope[0])})`);
  if (serviceCtx?.is_public_facing || api.is_external_facing) tags.push("External Exposure");
  return Array.from(new Set(tags)).slice(0, 3);
};

const AIInsightPanel = ({
  text,
  confidence,
  tags = [],
}: {
  text?: string | null;
  confidence?: number;
  tags?: string[];
}) => {
  if (!text) return null;

  return (
    <div className="rounded-xl border border-[#E24B4A]/15 bg-[#E24B4A]/[0.06] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <BrainCircuit className="h-3.5 w-3.5 text-[#E24B4A]" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#E24B4A]">AI Insight</span>
        </div>
        <span className="rounded-full border border-[#E24B4A]/12 bg-white/60 px-2 py-0.5 text-[9px] font-medium text-[#A43A37] dark:bg-background/30 dark:text-[#F1A3A1]">
          {getAIConfidenceLabel(confidence)}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">{text}</p>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#E24B4A]/12 bg-white/60 px-2 py-0.5 text-[9px] text-[#A43A37] dark:bg-background/30 dark:text-[#F1A3A1]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const getViolations = (api: ApiEndpointUI) => {
  const raw = api.violations;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.toLowerCase() !== "none");
  }
  return [];
};

const EndpointModal = ({ api, serviceContext, decommQueue, onClose, onAddToDecomm, onMarkReviewed }: EndpointModalProps) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"summary" | "classifier" | "agent" | "evidence">("summary");
  const inQueue = decommQueue.some((d) => d.api_id === api.id);
  const scoreColor = (score: number) => score > 70 ? "text-spectre-zombie" : score > 40 ? "text-spectre-rogue" : "text-spectre-active";
  const serviceCtx = serviceContext.find((s) => s.service_name === api.service_name);
  const isAtRisk = api.state !== "active";
  const hasMitigation = api.mitigation_steps && api.mitigation_steps.length > 0;
  const violations = getViolations(api);
  const hasTechnicalFix = Boolean(api.technical_fix);
  const hasAgentResponse = isAtRisk && (hasMitigation || hasTechnicalFix || violations.length > 0 || Boolean(api.mitigation_recommendation));
  const reasoningTags = getReasoningTags(api, serviceCtx);

  const chartColors = {
    active: theme === "dark" ? "#9FE1CB" : "#085041",
    zero: theme === "dark" ? "#2a2f3e" : "#e0e0e0",
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    return () => {
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setActiveTab("summary");
  }, [api.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`absolute inset-0 ${theme === "dark" ? "bg-black/70" : "bg-black/55"}`} onClick={onClose} />
      <div
        className="relative z-10 flex w-full max-w-[860px] max-h-[90vh] flex-col overflow-hidden rounded-[16px] border border-border bg-card shadow-2xl animate-spectre-scale-in"
        style={{ borderRadius: 16 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
          {/* Header */}
          <div className="border-b border-border bg-card px-5 py-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <MethodBadge method={api.method} />
                  <span className="font-mono text-lg text-foreground">{api.path}</span>
                  <StateBadge state={api.state} large />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{api.service_name}</span>
                  <span>·</span>
                  <span>Confidence: {Math.round(api.confidence * 100)}%</span>
                </div>
                <div className="mt-2 flex gap-1">
                  {(api.sources || []).map((s: string) => (
                    <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground capitalize">{s}</span>
                  ))}
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="border-b border-border px-5 py-3">
            <div className="flex flex-wrap gap-1">
              {[
                { id: "summary", label: "Summary" },
                { id: "classifier", label: "Classifier" },
                { id: "agent", label: "AI Layer" },
                { id: "evidence", label: "Evidence" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    activeTab === tab.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5" style={{ maxHeight: 'calc(90vh - 180px)' }}>
            {activeTab === "summary" && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-[11px] text-muted-foreground mb-1">Technical risk</div>
                    <div className={`text-3xl font-medium tabular-nums ${scoreColor(api.technical_score)}`}>{api.technical_score}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">OWASP security analysis · classifier</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{api.owasp_flags.length} flags raised</div>
                    {api.state_reason && (
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        <span className="text-muted-foreground/70">Reason:</span> {api.state_reason}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-[11px] text-muted-foreground mb-1">Importance score</div>
                    <div className={`text-3xl font-medium tabular-nums ${scoreColor(api.importance_score)}`}>{api.importance_score}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">Business context + graph centrality</div>
                    {serviceCtx && (
                      <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                        <div>Service criticality: <span className="text-foreground capitalize">{serviceCtx.criticality}</span></div>
                        <div>Dependent services: <span className="text-foreground">{serviceCtx.dependent_services.length}</span></div>
                        <div>Graph centrality: <span className="text-foreground">{serviceCtx.centrality_score.toFixed(2)}</span></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[#E24B4A]/12 bg-[#E24B4A]/[0.05] p-4">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#A43A37]">Why this matters</div>
                  <p className="text-sm leading-relaxed text-foreground/85">
                    {api.why_this_matters || api.priority_summary || api.importance_summary || "This API is influencing system priority because of business context, technical risk, and dependency impact."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {getBusinessTags(api, serviceCtx).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[#E24B4A]/12 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-[#A43A37] dark:bg-background/30"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground">
                      {api.blast_radius_reason || `High blast radius - affects ${serviceCtx?.dependent_services.length || 0} services`}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[10px] text-muted-foreground sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-background p-2">
                      <div className="uppercase tracking-[0.12em]">Domain</div>
                      <div className="mt-1 text-foreground">{api.onboarding_context?.domain || "Business context"}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2">
                      <div className="uppercase tracking-[0.12em]">Regulation</div>
                      <div className="mt-1 text-foreground">{api.onboarding_context?.regulation || (api.regulatory_scope?.length ? formatRegulation(api.regulatory_scope[0]) : "None")}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2">
                      <div className="uppercase tracking-[0.12em]">Impact</div>
                      <div className="mt-1 text-foreground">{api.onboarding_context?.impact || api.business_impact || "LOW"}</div>
                    </div>
                  </div>
                  {api.priority_reason_lines?.length ? (
                    <div className="mt-3 space-y-1 text-[10px] text-muted-foreground">
                      {api.priority_reason_lines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {api.ai_summary ? (
                  <div className="space-y-2">
                    <AIInsightPanel text={api.ai_summary} confidence={api.confidence} tags={reasoningTags} />
                    {api.ai_next_step && (
                      <AIInsightPanel text={api.ai_next_step} confidence={api.confidence} tags={reasoningTags.slice(0, 3)} />
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No AI summary available for this endpoint.</p>
                )}
              </div>
            )}

            {activeTab === "classifier" && (
              <div className="space-y-5">
                {(api.m2_risk_score != null || (api.m2_risk_factors && api.m2_risk_factors.length > 0) || api.m2_data_sensitivity) ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-[10px] text-muted-foreground mb-1">M2 risk score</div>
                      <div className="text-sm font-medium text-foreground tabular-nums">
                        {api.m2_risk_score != null ? api.m2_risk_score.toFixed(2) : "-"}
                      </div>
                      {api.m2_data_sensitivity && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Sensitivity: <span className="text-foreground">{api.m2_data_sensitivity}</span>
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-[10px] text-muted-foreground mb-1">Risk factors</div>
                      {api.m2_risk_factors && api.m2_risk_factors.length > 0 ? (
                        <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
                          {api.m2_risk_factors.slice(0, 4).map((factor) => (
                            <li key={factor}>{factor}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-[11px] text-muted-foreground">-</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-[11px] text-muted-foreground">
                    Classifier detail is not available for this endpoint.
                  </div>
                )}

                <div>
                  <h3 className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Security checks</h3>
                  <div className="space-y-1">
                    {Object.entries(api.owasp_checks).map(([key, check]) => {
                      const c = check as { passed?: boolean; detail?: string };
                      return (
                        <div key={key} className="flex items-start gap-2.5 rounded-lg border border-border bg-background p-3">
                          <div className="mt-0.5">
                            {c.passed ? <Check className="h-3.5 w-3.5 text-spectre-active" /> : <X className="h-3.5 w-3.5 text-spectre-zombie" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs ${key === "API9" ? "font-medium" : ""} text-foreground`}>
                                {key}
                                {key === "API9" && <Star className="inline h-3 w-3 ml-0.5 text-spectre-rogue" />}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{OWASP_NAMES[key]}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{c.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "agent" && (
              <div className="space-y-5">
                {hasAgentResponse ? (
                  <div>
                    <h3 className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">AI Layer analysis</h3>

                    {hasTechnicalFix && (
                      <div className="mb-4 rounded-lg border border-border bg-background p-3">
                        <div className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Technical fix</div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground max-h-96 overflow-y-auto">
                          {api.technical_fix}
                        </pre>
                      </div>
                    )}

                    {violations.length > 0 && (
                      <div className="mb-4 rounded-lg border border-border bg-background p-3">
                        <div className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">OWASP Violations</div>
                        <div className="space-y-1">
                          {violations.map((violation, index) => (
                            <div key={index} className="flex items-start gap-2 text-xs">
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E24B4A]/10 text-[10px] font-medium text-[#E24B4A]">{index + 1}</div>
                              <div className="text-foreground">{violation}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {hasMitigation && (
                      <div className="space-y-2">
                        {(api.mitigation_steps || []).map((step) => (
                          <div key={step.step} className="flex gap-3 text-xs">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E24B4A]/10 text-[10px] font-medium text-[#E24B4A]">{step.step}</div>
                            <div>
                              <div className="text-foreground">{step.action}</div>
                              {step.finding && (
                                <div className="text-[10px] text-muted-foreground">{step.finding}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {api.mitigation_recommendation && (
                      <div className={`mt-3 rounded-lg border-l-2 p-3 ${
                        api.mitigation_recommendation.includes("Block") ? "border-l-spectre-zombie bg-spectre-zombie-bg/30" : "border-l-spectre-active bg-spectre-active-bg/30"
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground">{api.mitigation_recommendation}</span>
                          {api.mitigation_confidence && (
                            <span className="rounded-full bg-spectre-active-bg px-2 py-0.5 text-[10px] font-medium text-spectre-active">
                              {api.mitigation_confidence}% confidence
                            </span>
                          )}
                        </div>
                        {api.mitigation_detail && (
                          <p className="text-[10px] text-muted-foreground">{api.mitigation_detail}</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-[11px] text-muted-foreground">
                    No mitigation workflow was generated for this endpoint.
                  </div>
                )}
              </div>
            )}

            {activeTab === "evidence" && (
              <div className="space-y-5">
                <div>
                  <h3 className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Traffic history</h3>
                  <div className="rounded-xl border border-border bg-background p-3 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={api.traffic_history || []} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                        <XAxis dataKey="month" tick={{ fill: theme === "dark" ? "#8B8FA8" : "#6B6B6B", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: theme === "dark" ? "#8B8FA8" : "#6B6B6B", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: theme === "dark" ? "#131929" : "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="calls" radius={[3, 3, 0, 0]}>
                          {(api.traffic_history || []).map((entry, index: number) => (
                            <Cell key={index} fill={entry.calls > 0 ? chartColors.active : chartColors.zero} opacity={entry.calls > 0 ? 1 : 0.3} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {api.state === "zombie" && api.last_seen && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      No traffic for {Math.floor((Date.now() - new Date(api.last_seen).getTime()) / 86400000)} days
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">How this API was found</h3>
                  <div className="rounded-lg bg-input border border-input-border p-3 font-mono text-[11px] text-muted-foreground">
                    {api.raw_context}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      { label: "in_gateway", value: api.in_gateway },
                      { label: "in_repo", value: api.in_repo },
                      { label: "seen_in_traffic", value: api.seen_in_traffic },
                    ].map((chip) => (
                      <span key={chip.label} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                        chip.value ? "bg-spectre-active-bg text-spectre-active" : "bg-spectre-zombie-bg text-spectre-zombie"
                      }`}>
                        {chip.value ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                        {chip.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-card p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
            {inQueue ? (
                <button disabled className="flex-1 rounded-lg bg-muted py-2.5 text-sm text-muted-foreground">In decommission queue ✓</button>
            ) : (
                <button onClick={() => onAddToDecomm(api.id)} className="flex-1 rounded-lg border border-spectre-zombie/30 py-2.5 text-sm font-medium text-spectre-zombie hover:bg-spectre-zombie-bg transition-colors">
                  Add to decommission queue
                </button>
            )}
              <button
                onClick={() => setActiveTab("agent")}
                className="flex-1 rounded-lg border border-spectre-shadow/30 py-2.5 text-sm font-medium text-spectre-shadow hover:bg-spectre-shadow-bg transition-colors"
              >
                Investigate with agent
              </button>
              <button
                onClick={() => onMarkReviewed(api.id)}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Mark as reviewed
              </button>
            </div>
          </div>
        </div>
    </div>
  );
};

export default EndpointModal;
