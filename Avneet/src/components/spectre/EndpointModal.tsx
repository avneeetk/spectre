import { X, Check, Star } from "lucide-react";
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
}

const OWASP_NAMES: Record<string, string> = {
  API2: "Broken Authentication",
  API4: "Unrestricted Resource Consumption",
  API8: "Security Misconfiguration",
  API9: "Improper Inventory Management",
};

const EndpointModal = ({ api, serviceContext, decommQueue, onClose, onAddToDecomm }: EndpointModalProps) => {
  const { theme } = useTheme();
  const inQueue = decommQueue.some((d) => d.api_id === api.id);
  const scoreColor = (score: number) => score > 70 ? "text-spectre-zombie" : score > 40 ? "text-spectre-rogue" : "text-spectre-active";
  const serviceCtx = serviceContext.find((s) => s.service_name === api.service_name);
  const isAtRisk = api.state !== "active";
  const hasMitigation = api.mitigation_steps && api.mitigation_steps.length > 0;

  const chartColors = {
    active: theme === "dark" ? "#9FE1CB" : "#085041",
    zero: theme === "dark" ? "#2a2f3e" : "#e0e0e0",
  };

  return (
    <>
      <div className={`fixed inset-0 z-40 ${theme === "dark" ? "bg-black/70" : "bg-black/55"}`} onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[680px] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card animate-spectre-scale-in" style={{ borderRadius: 12 }}>
          {/* Header */}
          <div className="sticky top-0 z-10 border-b border-border bg-card p-5" style={{ borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
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
                  {api.sources.map((s: string) => (
                    <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground capitalize">{s}</span>
                  ))}
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {/* Section 1 — Scores */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground mb-1">Technical risk</div>
                <div className={`text-3xl font-medium tabular-nums ${scoreColor(api.technical_score)}`}>{api.technical_score}</div>
                <div className="text-[10px] text-muted-foreground mt-1">OWASP security analysis · M2</div>
                <div className="mt-1 text-[10px] text-muted-foreground">{api.owasp_flags.length} flags raised</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground mb-1">Importance score</div>
                <div className={`text-3xl font-medium tabular-nums ${scoreColor(api.importance_score)}`}>{api.importance_score}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Business context + graph centrality · M4</div>
                {serviceCtx && (
                  <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                    <div>Service criticality: <span className="text-foreground capitalize">{serviceCtx.criticality}</span></div>
                    <div>Dependent services: <span className="text-foreground">{serviceCtx.dependent_services.length}</span></div>
                    <div>Graph centrality: <span className="text-foreground">{serviceCtx.centrality_score.toFixed(2)}</span></div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Section 2 — OWASP */}
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

            <div className="h-px bg-border" />

            {/* Section 3 — Traffic */}
            <div>
              <h3 className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Traffic history</h3>
              <div className="rounded-xl border border-border bg-background p-3 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={api.traffic_history} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                    <XAxis dataKey="month" tick={{ fill: theme === "dark" ? "#8B8FA8" : "#6B6B6B", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: theme === "dark" ? "#8B8FA8" : "#6B6B6B", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: theme === "dark" ? "#131929" : "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="calls" radius={[3, 3, 0, 0]}>
                      {api.traffic_history.map((entry, i: number) => (
                        <Cell key={i} fill={entry.calls > 0 ? chartColors.active : chartColors.zero} opacity={entry.calls > 0 ? 1 : 0.3} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {api.state === "zombie" && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  No traffic for {Math.floor((Date.now() - new Date(api.last_seen).getTime()) / 86400000)} days
                </p>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Section 4 — Mitigation agent */}
            {isAtRisk && hasMitigation && (
              <>
                <div>
                  <h3 className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mitigation agent analysis</h3>
                  <div className="space-y-2">
                    {api.mitigation_steps.map((s) => (
                      <div key={s.step} className="flex gap-3 text-xs">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E24B4A]/10 text-[10px] font-medium text-[#E24B4A]">{s.step}</div>
                        <div>
                          <div className="text-foreground">{s.action}</div>
                          <div className="text-[10px] text-muted-foreground">{s.finding}</div>
                        </div>
                      </div>
                    ))}
                  </div>
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
                <div className="h-px bg-border" />
              </>
            )}

            {/* Section 5 — Discovery context */}
            <div>
              <h3 className="mb-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">How this API was found</h3>
              <div className="rounded-lg bg-input border border-input-border p-3 font-mono text-[11px] text-muted-foreground">
                {api.raw_context}
              </div>
              <div className="mt-2 flex gap-1.5">
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

            <div className="h-px bg-border" />

            {/* Section 6 — AI summary */}
            <div>
              {api.ai_summary ? (
                <div className="space-y-2">
                  <div className="rounded-lg border-l-2 border-l-spectre-shadow bg-background p-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{api.ai_summary}</p>
                  </div>
                  {api.ai_next_step && (
                    <div className="rounded-lg border-l-2 border-l-spectre-active bg-background p-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">{api.ai_next_step}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No AI summary available for this endpoint.</p>
              )}

              {api.technical_fix && (
                <div className="mt-3 rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Technical fix</div>
                  <pre className="whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                    {api.technical_fix}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 border-t border-border bg-card p-4 flex gap-2" style={{ borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
            {inQueue ? (
              <button disabled className="flex-1 rounded-lg bg-muted py-2.5 text-sm text-muted-foreground">In decommission queue ✓</button>
            ) : (
              <button onClick={() => onAddToDecomm(api.id)} className="flex-1 rounded-lg border border-spectre-zombie/30 py-2.5 text-sm font-medium text-spectre-zombie hover:bg-spectre-zombie-bg transition-colors">
                Add to decommission queue
              </button>
            )}
            <button className="flex-1 rounded-lg border border-spectre-shadow/30 py-2.5 text-sm font-medium text-spectre-shadow hover:bg-spectre-shadow-bg transition-colors">
              Investigate with agent
            </button>
            <button className="flex-1 rounded-lg border border-border py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors">
              Mark as reviewed
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default EndpointModal;
