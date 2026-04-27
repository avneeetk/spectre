import { useEffect, useMemo, useState } from "react";
import { Brain, ChevronDown, ChevronRight, ExternalLink, GitBranch, Moon, RotateCcw, ShieldAlert, Sun, Target, Zap } from "lucide-react";
import { SCAN_CONFIG } from "@/data/mockData";
import { postQueueAction } from "@/api/client";
import { useTheme } from "@/hooks/useTheme";
import { useSpectreData } from "@/providers/SpectreDataProvider";
import type { ApiEndpointUI, DecommissionQueueItem, ServiceContext } from "@/types/spectre";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import EndpointModal from "./EndpointModal";
import KnowledgeGraphTab from "./KnowledgeGraphTab";
import KnowledgeGraphPreview from "./KnowledgeGraphPreview";

interface DashboardProps {
  onNewScan: () => void;
}

type Api = ApiEndpointUI;
type Insight = {
  id: string;
  title: string;
  explanation: string;
  apis: Api[];
};

const statePriority: Record<string, number> = { rogue: 120, shadow: 95, zombie: 85, active: 10 };
const stateOrder = ["rogue", "zombie", "shadow", "active"];

const truncate = (text: string | null | undefined, length = 118) => {
  if (!text) return "AI found no critical narrative for this endpoint.";
  return text.length > length ? `${text.slice(0, length)}…` : text;
};

const getRiskScore = (api: Api) => {
  const authPenalty = api.auth_detected ? 0 : 18;
  const trafficBoost = api.seen_in_traffic ? 12 : 0;
  const flagBoost = api.owasp_flags.length * 7;
  return statePriority[api.state] + api.importance_score * 1.15 + api.technical_score + authPenalty + trafficBoost + flagBoost;
};

const getSeverityTone = (api: Api) => {
  if (api.state === "zombie") return "border-l-spectre-zombie bg-spectre-zombie-bg/30";
  if (api.state === "shadow") return "border-l-spectre-shadow bg-spectre-shadow-bg/30";
  if (api.state === "rogue") return "border-l-spectre-rogue bg-spectre-rogue-bg/30";
  return "border-l-spectre-active bg-spectre-active-bg/20";
};

const getScoreTone = (score: number) => {
  if (score >= 80) return "text-spectre-zombie";
  if (score >= 55) return "text-spectre-rogue";
  return "text-spectre-active";
};

const getScoreBar = (score: number) => {
  if (score >= 80) return "bg-spectre-zombie";
  if (score >= 55) return "bg-spectre-rogue";
  return "bg-spectre-active";
};

const getRecommendationLabel = (api: Api) => {
  if (api.state === "rogue") return "Secure / block now";
  if (api.state === "shadow") return "Investigate origin";
  if (api.state === "zombie") return api.importance_score > 70 ? "Review then remove" : "Remove";
  return "Monitor";
};

const getConfidenceLabel = (api: Api) => {
  if (api.confidence >= 0.9) return "High";
  if (api.confidence >= 0.75) return "Medium";
  return "Low";
};

const formatTimeAgo = (dateStr?: string | null) => {
  if (!dateStr) return "Unknown";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  return `${Math.max(1, Math.floor(diff / 3600000))}h ago`;
};

const Dashboard = ({ onNewScan }: DashboardProps) => {
  const { theme, toggleTheme } = useTheme();
  const { inventory, decommissionQueue: initialQueue, serviceContext, resolvedMode, loading, error, refresh } = useSpectreData();
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null);
  const [modalApiId, setModalApiId] = useState<string | null>(null);
  const [decommQueue, setDecommQueue] = useState<DecommissionQueueItem[]>([]);
  const [activeTab, setActiveTab] = useState<"inventory" | "graph">("inventory");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [focusInsight, setFocusInsight] = useState<string | null>(null);
  const [envLabel, setEnvLabel] = useState<string>(SCAN_CONFIG.environment_name);

  useEffect(() => {
    setDecommQueue((initialQueue || []).map((item) => ({ ...item })));
  }, [initialQueue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (resolvedMode !== "live") {
      setEnvLabel(SCAN_CONFIG.environment_name);
      return;
    }
    const stored = window.localStorage.getItem("spectre_env_name") || window.localStorage.getItem("spectre_repo_url");
    setEnvLabel(stored || "Live scan");
  }, [resolvedMode]);

  useEffect(() => {
    if (!inventory.length) {
      setSelectedApiId(null);
      return;
    }

    setSelectedApiId((current) => {
      if (current && inventory.some((api) => api.id === current)) return current;
      return inventory.find((api) => api.state !== "active")?.id || inventory[0].id;
    });
  }, [inventory]);

  const prioritizedApis = useMemo(() => {
    return [...inventory].sort((a, b) => getRiskScore(b) - getRiskScore(a));
  }, [inventory]);

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { total: inventory.length, active: 0, zombie: 0, shadow: 0, rogue: 0 };
    inventory.forEach((api) => {
      counts[api.state] = (counts[api.state] || 0) + 1;
    });
    return counts;
  }, [inventory]);

  const insights = useMemo<Insight[]>(() => {
    const sensitiveUnauthed = inventory.filter((api) => !api.auth_detected && ["critical", "high"].includes((api.data_sensitivity || "").toLowerCase()));
    const highZombie = inventory.filter((api) => api.state === "zombie" && api.importance_score >= 70);
    const unmanagedLive = inventory.filter((api) => ["shadow", "rogue"].includes(api.state) && api.seen_in_traffic);

    return [
      {
        id: "unauthenticated-sensitive",
        title: "Unauthenticated sensitive endpoints",
        explanation: "AI sees high-value routes that can return production data without a verified auth boundary.",
        apis: sensitiveUnauthed,
      },
      {
        id: "high-zombie",
        title: "High-importance zombie APIs",
        explanation: "Dormant routes still carry business context and should be removed or re-owned before rediscovery.",
        apis: highZombie,
      },
      {
        id: "unmanaged-live",
        title: "Unmanaged APIs receiving traffic",
        explanation: "Shadow or rogue endpoints are active in production but missing from the gateway and inventory path.",
        apis: unmanagedLive,
      },
    ];
  }, [inventory]);

  const queueApis = useMemo(() => {
    const base = focusInsight ? insights.find((insight) => insight.id === focusInsight)?.apis || prioritizedApis : prioritizedApis;
    return base.slice(0, 10);
  }, [focusInsight, insights, prioritizedApis]);

  const alerts = useMemo(() => prioritizedApis.filter((api) => api.state !== "active").slice(0, 5), [prioritizedApis]);

  // Check for incomplete discovery paths
  const incompleteDiscovery = useMemo(() => {
    const barePaths = inventory.filter(api => {
      const path = api.path || api.endpoint;
      return path && ['/', '/me', '/{id}', '/health'].includes(path);
    });
    return barePaths.length > 0;
  }, [inventory]);

  const actionItems = useMemo(() => {
    return decommQueue
      .map((item) => ({ ...item, api: inventory.find((api) => api.id === item.api_id) }))
      .filter((item): item is DecommissionQueueItem & { api: Api } => Boolean(item.api))
      .sort((a, b) => getRiskScore(b.api) - getRiskScore(a.api));
  }, [decommQueue, inventory]);

  const selectedApi = useMemo(() => {
    return inventory.find((api) => api.id === selectedApiId) || prioritizedApis[0] || null;
  }, [inventory, prioritizedApis, selectedApiId]);

  const modalApi = modalApiId ? inventory.find((api) => api.id === modalApiId) || null : null;
  const topRisk = prioritizedApis[0] || null;
  const selectedService = selectedApi ? serviceContext.find((service) => service.service_name === selectedApi.service_name) : null;

  const syncQueueAction = async (apiId: string, action: "approve" | "dismiss" | "pending") => {
    if (resolvedMode !== "live") return;
    await postQueueAction(apiId, action).catch(() => null);
    await refresh();
  };

  const handleApprove = async (apiId: string) => {
    setDecommQueue((queue) => queue.map((item) => (item.api_id === apiId ? { ...item, status: "approved" } : item)));
    await syncQueueAction(apiId, "approve");
  };

  const handleIgnore = async (apiId: string) => {
    setDecommQueue((queue) => queue.filter((item) => item.api_id !== apiId));
    await syncQueueAction(apiId, "dismiss");
  };

  const handleAddToQueue = async (apiId: string) => {
    setDecommQueue((queue) => (
      queue.some((item) => item.api_id === apiId)
        ? queue
        : [...queue, { api_id: apiId, status: "pending", added_at: new Date().toISOString() }]
    ));
    await syncQueueAction(apiId, "pending");
  };

  const handleMarkReviewed = async (apiId: string) => {
    setDecommQueue((queue) => queue.filter((item) => item.api_id !== apiId));
    setModalApiId((current) => (current === apiId ? null : current));
    await syncQueueAction(apiId, "dismiss");
  };

  const handleSelect = (apiId: string) => {
    setSelectedApiId(apiId);
    setFocusInsight(null);
  };

  const handleViewAffected = (insight: Insight) => {
    setFocusInsight(insight.id);
    if (insight.apis[0]) setSelectedApiId(insight.apis[0].id);
  };

  if (activeTab === "graph") {
    return (
      <div className="min-h-screen animate-spectre-fade-in">
        <nav className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[10px] font-medium">SP</div>
            <span className="text-sm font-medium text-foreground tracking-tight">SPECTRE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setActiveTab("inventory")} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">Command center</button>
            <button className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">Knowledge graph</button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={onNewScan} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted">
              <RotateCcw className="h-3 w-3" /> New scan
            </button>
          </div>
        </nav>
        <KnowledgeGraphTab
          apis={inventory}
          serviceContext={serviceContext}
          onSelectApi={(id) => {
            setSelectedApiId(id);
            setModalApiId(id);
          }}
        />
        {modalApi && selectedApi && (
          <EndpointModal
            api={modalApi}
            serviceContext={serviceContext}
            decommQueue={decommQueue}
            onClose={() => setModalApiId(null)}
            onAddToDecomm={handleAddToQueue}
            onMarkReviewed={handleMarkReviewed}
          />
        )}
      </div>
    );
  }

  if (loading && !inventory.length) {
    return (
      <div className="min-h-screen bg-background">
        <nav className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[10px] font-medium">SP</div>
            <span className="text-sm font-medium text-foreground tracking-tight">SPECTRE</span>
          </div>
        </nav>
        <main className="mx-auto max-w-[1480px] p-5">
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading live dashboard data…</div>
        </main>
      </div>
    );
  }

  if (!selectedApi || !topRisk) {
    return (
      <div className="min-h-screen bg-background">
        <nav className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[10px] font-medium">SP</div>
            <span className="text-sm font-medium text-foreground tracking-tight">SPECTRE</span>
          </div>
          <button onClick={onNewScan} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted">
            <RotateCcw className="h-3 w-3" /> New scan
          </button>
        </nav>
        <main className="mx-auto max-w-[1480px] p-5">
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {error ? `Backend unavailable: ${error}` : "No APIs are available yet. Run a scan to populate the dashboard."}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen animate-spectre-fade-in bg-background">
      <nav className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[10px] font-medium">SP</div>
          <span className="text-sm font-medium text-foreground tracking-tight">SPECTRE</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">Command center</button>
          <button onClick={() => setActiveTab("graph")} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">Knowledge graph</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${resolvedMode === "live" && !error ? "bg-spectre-active animate-spectre-pulse" : "bg-spectre-rogue"}`} />
            <span className="text-[11px] text-muted-foreground">{resolvedMode === "live" ? (error ? "Live (error)" : "Live") : "Demo"}</span>
          </div>
          <div className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">{envLabel}</div>
          <button onClick={toggleTheme} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => refresh()} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted">
            Refresh
          </button>
          <button onClick={onNewScan} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted">
            <RotateCcw className="h-3 w-3" /> New scan
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-[1480px] space-y-4 p-5">
        {error && (
          <div className="rounded-xl border border-spectre-rogue/20 bg-spectre-rogue-bg/40 px-4 py-3 text-sm text-spectre-rogue">
            Live data is partially unavailable: {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
          <button
            onClick={() => {
              setSelectedApiId(topRisk.id);
              setModalApiId(topRisk.id);
            }}
            className={`group relative overflow-hidden rounded-xl border border-border border-l-[4px] ${getSeverityTone(topRisk)} bg-card p-5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/10 animate-spectre-glow`}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Critical decision
              </div>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">{getRecommendationLabel(topRisk)}</span>
            </div>
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <MethodBadge method={topRisk.method} />
                  <code className="truncate font-mono text-lg text-foreground">{topRisk.path}</code>
                  <StateBadge state={topRisk.state} large />
                </div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{truncate(topRisk.ai_summary, 210)}</p>
              </div>
              <div className="grid w-full shrink-0 grid-cols-2 gap-2 xl:w-44">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-[10px] text-muted-foreground">Importance</div>
                  <div className={`text-3xl font-medium tabular-nums ${getScoreTone(topRisk.importance_score)}`}>{topRisk.importance_score}</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-[10px] text-muted-foreground">Technical</div>
                  <div className={`text-3xl font-medium tabular-nums ${getScoreTone(topRisk.technical_score)}`}>{topRisk.technical_score}</div>
                </div>
              </div>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4">
            {stateOrder.map((state) => (
              <button key={state} onClick={() => setFocusInsight(null)} className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50">
                <div className="mb-2 flex items-center justify-between">
                  <StateBadge state={state} />
                  <span className="text-[10px] text-muted-foreground">APIs</span>
                </div>
                <div className="text-3xl font-medium tabular-nums text-foreground">{stateCounts[state] || 0}</div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={state === "active" ? "h-full bg-spectre-active" : state === "zombie" ? "h-full bg-spectre-zombie" : state === "shadow" ? "h-full bg-spectre-shadow" : "h-full bg-spectre-rogue"}
                    style={{ width: `${((stateCounts[state] || 0) / Math.max(stateCounts.total, 1)) * 100}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.15fr_0.9fr]">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-foreground">Prioritized API risk queue</h2>
                <p className="text-[11px] text-muted-foreground">Ranked by state, importance, technical risk, traffic, auth, and OWASP flags.</p>
              </div>
              {focusInsight && <button onClick={() => setFocusInsight(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Clear focus</button>}
            </div>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {queueApis.map((api, index) => {
                const selected = selectedApi.id === api.id;
                return (
                  <button
                    key={api.id}
                    onClick={() => handleSelect(api.id)}
                    onDoubleClick={() => setModalApiId(api.id)}
                    className={`w-full rounded-lg border border-l-[3px] bg-background p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/10 ${getSeverityTone(api)} ${selected ? "ring-2 ring-primary/20" : "border-border"}`}
                  >
                    <div className="mb-2 flex items-start gap-2">
                      <span className="mt-0.5 w-5 text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-1.5">
                          <MethodBadge method={api.method} />
                          <code className="truncate font-mono text-xs text-foreground">{api.path}</code>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span>{api.service_name}</span>
                          <StateBadge state={api.state} />
                        </div>
                      </div>
                      <span className={`rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums ${getScoreTone(api.importance_score)}`}>{api.importance_score}</span>
                    </div>
                    <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{truncate(api.ai_summary || api.ai_next_step, 105)}</p>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full transition-all duration-700 ${getScoreBar(api.technical_score)}`} style={{ width: `${api.technical_score}%` }} />
                      </div>
                      <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">{api.technical_score}</span>
                      <div className="flex gap-1">
                        {api.owasp_flags.slice(0, 2).map((flag) => (
                          <span key={flag} className="rounded bg-spectre-zombie-bg px-1 py-0.5 text-[9px] text-spectre-zombie">{flag}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium text-foreground">AI Risk Intelligence</h2>
              </div>
              <button onClick={() => setModalApiId(selectedApi.id)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                Open modal <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <MethodBadge method={selectedApi.method} />
                <code className="font-mono text-sm text-foreground">{selectedApi.path}</code>
                <StateBadge state={selectedApi.state} />
              </div>
              <p className="text-sm leading-6 text-foreground">{truncate(selectedApi.ai_summary, 260)}</p>
              <div className="mt-3 rounded-lg border-l-2 border-l-primary bg-muted/40 p-3">
                <div className="mb-1 text-[11px] font-medium text-foreground">Recommended action</div>
                <p className="text-xs leading-5 text-muted-foreground">{selectedApi.ai_next_step || getRecommendationLabel(selectedApi)}</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-border bg-card p-2">
                  <div className="text-[10px] text-muted-foreground">Importance</div>
                  <div className={`font-medium tabular-nums ${getScoreTone(selectedApi.importance_score)}`}>{selectedApi.importance_score}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2">
                  <div className="text-[10px] text-muted-foreground">OWASP flags</div>
                  <div className="font-medium tabular-nums text-foreground">{selectedApi.owasp_flags.length}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2">
                  <div className="text-[10px] text-muted-foreground">Confidence</div>
                  <div className="font-medium text-foreground">{getConfidenceLabel(selectedApi)}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              {insights.map((insight) => (
                <button key={insight.id} onClick={() => handleViewAffected(insight)} className="rounded-lg border border-border bg-background p-3 text-left transition-all hover:-translate-y-0.5 hover:bg-muted/30">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium leading-4 text-foreground">{insight.title}</span>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{insight.apis.length}</span>
                  </div>
                  <p className="line-clamp-3 text-[10px] leading-4 text-muted-foreground">{insight.explanation}</p>
                  <div className="mt-2 text-[10px] text-primary">View affected APIs</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-spectre-active" />
                <h2 className="text-sm font-medium text-foreground">Live alerts</h2>
                <span className="text-[10px] text-muted-foreground">websocket</span>
              </div>
              <div className="max-h-[232px] space-y-2 overflow-y-auto pr-1">
                {alerts.map((api) => (
                  <div key={api.id} className={`rounded-lg border border-border border-l-[3px] ${getSeverityTone(api)} bg-background p-3`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-[11px] text-foreground">{api.path}</code>
                      <span className={`text-[11px] font-medium tabular-nums ${getScoreTone(api.importance_score)}`}>{api.importance_score}</span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">AI: {truncate(api.ai_summary || api.ai_next_step, 95)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{formatTimeAgo(api.last_seen)}</span>
                      <button onClick={() => { setSelectedApiId(api.id); setModalApiId(api.id); }} className="text-[10px] text-primary hover:text-foreground">Go to API</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium text-foreground">Recommended Actions</h2>
              </div>
              <div className="max-h-[244px] space-y-2 overflow-y-auto pr-1">
                {actionItems.map((item) => {
                  const api = item.api;
                  const approved = item.status === "approved";
                  return (
                    <div key={item.api_id} className={`rounded-lg border border-border bg-background p-3 transition-opacity ${approved ? "opacity-45" : ""}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <code className="truncate font-mono text-[11px] text-foreground">{api.path}</code>
                        <StateBadge state={api.state} />
                      </div>
                      <div className="mb-2 rounded-md bg-muted/50 p-2 text-[10px] leading-4 text-muted-foreground">AI recommends: {truncate(api.ai_next_step, 112)}</div>
                      <div className="mb-2 flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Confidence: <span className="text-foreground">{getConfidenceLabel(api)}</span></span>
                        <span className="text-primary">{getRecommendationLabel(api)}</span>
                      </div>
                      {!approved && (
                        <div className="flex gap-1.5">
                          <button onClick={() => handleApprove(item.api_id)} className="rounded-md border border-spectre-active/30 px-2 py-1 text-[10px] text-spectre-active hover:bg-spectre-active-bg">Approve</button>
                          <button onClick={() => setModalApiId(api.id)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted">Investigate</button>
                          <button onClick={() => handleIgnore(item.api_id)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted">Ignore</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-spectre-shadow" />
                <h2 className="text-sm font-medium text-foreground">Knowledge Graph Context</h2>
              </div>
              <button onClick={() => setActiveTab("graph")} className="text-[11px] text-muted-foreground hover:text-foreground">View full graph →</button>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.85fr]">
              <KnowledgeGraphPreview apis={inventory} serviceContext={serviceContext} />
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="mb-2 text-[11px] text-muted-foreground">Selected service</div>
                <div className="mb-1 text-sm font-medium text-foreground">{selectedApi.service_name}</div>
                <p className="mb-3 text-[11px] leading-4 text-muted-foreground">Dependency context changes urgency when a risky endpoint sits close to customer data, payments, or identity flows.</p>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Centrality</span><span className="font-medium text-foreground">{(selectedService?.centrality_score || selectedApi.centrality_score || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Dependents</span><span className="font-medium text-foreground">{selectedService?.dependent_services.length || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Criticality</span><span className="font-medium capitalize text-foreground">{selectedService?.criticality || "unknown"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Regulatory</span><span className="font-medium uppercase text-foreground">{selectedApi.regulatory_scope?.join(", ") || "none"}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <button onClick={() => setInventoryOpen((open) => !open)} className="flex w-full items-center justify-between p-4 text-left">
              <div>
                <h2 className="text-sm font-medium text-foreground">Full API Inventory</h2>
                <p className="text-[11px] text-muted-foreground">Secondary table view with AI summaries and high-risk row highlighting.</p>
              </div>
              {inventoryOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${inventoryOpen ? "max-h-[360px] border-t border-border" : "max-h-0"}`}>
              <div className="max-h-[340px] overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">API</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">State</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">AI summary</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Importance</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prioritizedApis.map((api) => (
                      <tr key={api.id} onClick={() => { setSelectedApiId(api.id); setModalApiId(api.id); }} className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30 ${getRiskScore(api) > 220 ? "bg-spectre-zombie-bg/20" : ""}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <MethodBadge method={api.method} />
                            <code className="font-mono text-foreground">{api.path}</code>
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{api.service_name}</div>
                        </td>
                        <td className="px-3 py-2"><StateBadge state={api.state} /></td>
                        <td className="max-w-[320px] px-3 py-2 text-muted-foreground"><span className="line-clamp-1">{truncate(api.ai_summary || api.ai_next_step, 130)}</span></td>
                        <td className={`px-3 py-2 text-right font-medium tabular-nums ${getScoreTone(api.importance_score)}`}>{api.importance_score}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{api.seen_in_traffic ? "Live" : formatTimeAgo(api.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>

      {modalApi && (
        <EndpointModal
          api={modalApi}
          serviceContext={serviceContext}
          decommQueue={decommQueue}
          onClose={() => setModalApiId(null)}
          onAddToDecomm={handleAddToQueue}
          onMarkReviewed={handleMarkReviewed}
        />
      )}
    </div>
  );
};

export default Dashboard;
