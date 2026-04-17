import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Sun, Moon } from "lucide-react";
import { SCAN_CONFIG } from "@/data/mockData";
import { useTheme } from "@/hooks/useTheme";
import StateBadge from "./StateBadge";
import MethodBadge from "./MethodBadge";
import EndpointModal from "./EndpointModal";
import KnowledgeGraphTab from "./KnowledgeGraphTab";
import KnowledgeGraphPreview from "./KnowledgeGraphPreview";
import { useSpectreData } from "@/providers/SpectreDataProvider";
import { postQueueAction } from "@/api/client";
import type { ApiEndpointUI, DecommissionQueueItem } from "@/types/spectre";

interface DashboardProps {
  onNewScan: () => void;
}

const Dashboard = ({ onNewScan }: DashboardProps) => {
  const { theme, toggleTheme } = useTheme();
  const { inventory, decommissionQueue: initialQueue, serviceContext, resolvedMode, loading, error, refresh } = useSpectreData();
  const [filter, setFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"technical" | "importance">("importance");
  const [selectedApi, setSelectedApi] = useState<string | null>(null);
  const [decommQueue, setDecommQueue] = useState<DecommissionQueueItem[]>([]);
  const [activeTab, setActiveTab] = useState<"inventory" | "graph">("inventory");

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { total: inventory.length };
    inventory.forEach((a) => { counts[a.state] = (counts[a.state] || 0) + 1; });
    return counts;
  }, [inventory]);

  useEffect(() => {
    setDecommQueue((initialQueue || []).map((d) => ({ ...d })));
  }, [initialQueue]);

  const filteredApis = useMemo(() => {
    const apis = filter === "all" ? [...inventory] : inventory.filter((a) => a.state === filter);
    apis.sort((a, b) => sortBy === "importance" ? b.importance_score - a.importance_score : b.technical_score - a.technical_score);
    return apis;
  }, [filter, sortBy, inventory]);

  const alerts = useMemo(() => {
    return [...inventory].filter((a) => a.state !== "active").sort((a, b) => b.importance_score - a.importance_score).slice(0, 5);
  }, [inventory]);

  const decommItems = useMemo(() => {
    return decommQueue.map((d) => ({ ...d, api: inventory.find((a) => a.id === d.api_id) }));
  }, [decommQueue, inventory]);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 30) return `${Math.floor(days / 30)}mo ago`;
    if (days > 0) return `${days}d ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  const getAlertDesc = (api: ApiEndpointUI) => {
    if (api.state === "zombie") return `No traffic since ${new Date(api.last_seen).toLocaleString("en", { month: "long", year: "numeric" })}`;
    if (api.state === "shadow") return "Receiving traffic — not in any gateway or spec";
    if (api.state === "rogue") return "Conflicts with known endpoint — no authentication";
    return "";
  };

  const handleApprove = async (apiId: string) => {
    setDecommQueue((q) => q.map((d) => (d.api_id === apiId ? { ...d, status: "approved" } : d)));
    if (resolvedMode === "live") {
      await postQueueAction(apiId, "approve").catch(() => null);
      await refresh();
    }
  };
  const handleDismiss = async (apiId: string) => {
    setDecommQueue((q) => q.filter((d) => d.api_id !== apiId));
    if (resolvedMode === "live") {
      await postQueueAction(apiId, "dismiss").catch(() => null);
      await refresh();
    }
  };

  const selectedApiData = selectedApi ? inventory.find((a) => a.id === selectedApi) : null;

  const scoreColor = (score: number) => score > 70 ? "text-spectre-zombie" : score > 40 ? "text-spectre-rogue" : "text-spectre-active";

  const statCards = [
    { label: "Total", key: "total", textColor: "text-foreground", barColor: "bg-foreground/20" },
    { label: "Active", key: "active", textColor: "text-spectre-active", barColor: "bg-spectre-active" },
    { label: "Zombie", key: "zombie", textColor: "text-spectre-zombie", barColor: "bg-spectre-zombie" },
    { label: "Shadow", key: "shadow", textColor: "text-spectre-shadow", barColor: "bg-spectre-shadow" },
    { label: "Rogue", key: "rogue", textColor: "text-spectre-rogue", barColor: "bg-spectre-rogue" },
  ];

  // Knowledge graph full view
  if (activeTab === "graph") {
    return (
      <div className="min-h-screen animate-spectre-fade-in">
        <nav className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#E24B4A] text-white text-[10px] font-medium">SP</div>
            <span className="text-sm font-medium text-foreground tracking-tight">SPECTRE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setActiveTab("inventory")} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Inventory</button>
            <button className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">Knowledge graph</button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={onNewScan} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors">
              <RotateCcw className="h-3 w-3" /> New scan
            </button>
          </div>
        </nav>
        <KnowledgeGraphTab apis={inventory} serviceContext={serviceContext} onSelectApi={(id) => { setSelectedApi(id); }} />
        {selectedApiData && (
          <EndpointModal
            api={selectedApiData}
            serviceContext={serviceContext}
            decommQueue={decommQueue}
            onClose={() => setSelectedApi(null)}
            onAddToDecomm={(id) => setDecommQueue((q) => [...q, { api_id: id, status: "pending", added_at: new Date().toISOString() }])}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      {/* Top nav */}
      <nav className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#E24B4A] text-white text-[10px] font-medium">SP</div>
          <span className="text-sm font-medium text-foreground tracking-tight">SPECTRE</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">Inventory</button>
          <button onClick={() => setActiveTab("graph")} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Knowledge graph</button>
        </div>
          <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-spectre-pulse" />
            <span className="text-[11px] text-muted-foreground">
              {resolvedMode === "live" ? (error ? "Live (error)" : "Live") : "Demo"}
            </span>
          </div>
          <div className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">{SCAN_CONFIG.environment_name}</div>
          <button onClick={toggleTheme} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => refresh()} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors">
            Refresh
          </button>
          <button onClick={onNewScan} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors">
            <RotateCcw className="h-3 w-3" /> New scan
          </button>
        </div>
      </nav>

      {loading && (
        <div className="p-6 max-w-[1400px] mx-auto text-sm text-muted-foreground">
          Loading inventory…
        </div>
      )}
      {!loading && error && (
        <div className="p-6 max-w-[1400px] mx-auto text-sm text-spectre-rogue">
          Backend unavailable: {error}
        </div>
      )}

      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-5 gap-2.5">
          {statCards.map(({ label, key, textColor, barColor }) => {
            const isActive = (filter === key || (filter === "all" && key === "total"));
            return (
              <button
                key={key}
                onClick={() => setFilter(key === "total" ? "all" : key)}
                className={`rounded-xl border bg-card p-4 text-left transition-all ${
                  isActive ? `border-current ${textColor}` : "border-border hover:border-foreground/15"
                }`}
                style={isActive && key !== "total" ? { borderWidth: "1.5px" } : undefined}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
                <div className={`text-2xl font-medium tabular-nums ${textColor}`}>{stateCounts[key] || 0}</div>
                <div className="mt-2 h-0.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${((stateCounts[key] || 0) / (stateCounts.total || 1)) * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Section A: Table + Alerts */}
        <div className="flex gap-5 mb-6">
          <div className="w-[65%]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-1">
                {["all", "active", "zombie", "shadow", "rogue"].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
                    filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}>{f}</button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["technical", "importance"] as const).map((s) => (
                  <button key={s} onClick={() => setSortBy(s)} className={`rounded-lg px-2 py-1 text-[11px] transition-colors ${
                    sortBy === s ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>↕ {s.charAt(0).toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Method</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Endpoint</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">State</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Technical</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Importance</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">OWASP</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApis.map((api) => {
                    const isRecent = api.seen_in_traffic && (Date.now() - new Date(api.last_seen).getTime()) < 86400000 * 2;
                    return (
                      <tr key={api.id} onClick={() => setSelectedApi(api.id)} className="border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/20">
                        <td className="px-3 py-2"><MethodBadge method={api.method} /></td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-foreground">{api.path}</div>
                          <div className="text-[10px] text-muted-foreground">{api.service_name}</div>
                        </td>
                        <td className="px-3 py-2"><StateBadge state={api.state} /></td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${api.technical_score > 70 ? "bg-spectre-zombie" : api.technical_score > 40 ? "bg-spectre-rogue" : "bg-spectre-active"}`} style={{ width: `${api.technical_score}%` }} />
                            </div>
                            <span className="tabular-nums text-muted-foreground w-5 text-right">{api.technical_score}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${api.importance_score > 70 ? "bg-spectre-zombie" : api.importance_score > 40 ? "bg-spectre-rogue" : "bg-spectre-active"}`} style={{ width: `${api.importance_score}%` }} />
                            </div>
                            <span className={`tabular-nums font-medium w-5 text-right ${scoreColor(api.importance_score)}`}>{api.importance_score}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-0.5">
                            {api.owasp_flags.length ? api.owasp_flags.map((f) => (
                              <span key={f} className="rounded bg-spectre-zombie-bg px-1 py-0.5 text-[9px] font-medium text-spectre-zombie">{f}</span>
                            )) : <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isRecent ? <span className="text-spectre-active font-medium">Active</span> : <span className="text-muted-foreground">{formatTimeAgo(api.last_seen)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Alerts - ISOLATED PANEL */}
          <div className="w-[35%]">
            <div className="rounded-xl border border-border bg-card p-4 h-full">
              <div className="mb-4 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-spectre-pulse" />
                <span className="text-sm font-medium text-foreground">Live alerts</span>
                <span className="text-[10px] text-muted-foreground">websocket</span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[400px]">
                {alerts.map((api) => {
                  const borderColor = api.state === "zombie" ? "border-l-spectre-zombie" : api.state === "shadow" ? "border-l-spectre-shadow" : "border-l-spectre-rogue";
                  return (
                    <div key={api.id} className={`rounded-lg border border-border border-l-[3px] ${borderColor} bg-background p-3`}>
                      <div className="mb-0.5 font-mono text-[11px] text-foreground truncate">{api.path}</div>
                      <p className="text-[11px] text-muted-foreground">{getAlertDesc(api)}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/60">{formatTimeAgo(api.last_seen)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Section B: Decomm + Graph preview */}
        <div className="flex gap-5">
          <div className="w-[60%]">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Decommission queue</span>
                <span className="rounded-full bg-spectre-rogue-bg px-2 py-0.5 text-[10px] font-medium text-spectre-rogue">
                  {decommQueue.filter((d) => d.status === "pending").length} pending
                </span>
              </div>
              <div className="space-y-2">
                {decommItems.map((item) => {
                  if (!item.api) return null;
                  const approved = item.status === "approved";
                  return (
                    <div key={item.api_id} className={`rounded-lg border border-border bg-background p-3 transition-opacity ${approved ? "opacity-40" : ""}`}>
                      <div className={`mb-1 flex items-center gap-2 ${approved ? "line-through" : ""}`}>
                        <span className="font-mono text-[11px] text-foreground">{item.api.path}</span>
                        <StateBadge state={item.api.state} />
                        <span className={`ml-auto text-xs font-medium tabular-nums ${scoreColor(item.api.importance_score)}`}>{item.api.importance_score}</span>
                      </div>
                      <div className="mb-1.5 flex gap-0.5">
                        {item.api.owasp_flags.map((f) => (
                          <span key={f} className="rounded bg-spectre-zombie-bg px-1 py-0.5 text-[9px] text-spectre-zombie">{f}</span>
                        ))}
                      </div>
                      {item.api.ai_next_step && (
                        <p className="mb-2 text-[10px] text-muted-foreground">
                          {item.api.ai_next_step.length > 90 ? item.api.ai_next_step.slice(0, 90) + "…" : item.api.ai_next_step}
                        </p>
                      )}
                      {!approved && (
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleApprove(item.api_id); }} className="rounded-lg border border-spectre-zombie/30 px-3 py-1 text-[10px] font-medium text-spectre-zombie hover:bg-spectre-zombie-bg transition-colors">
                            Approve removal
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDismiss(item.api_id); }} className="rounded-lg border border-border px-3 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors">
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="w-[40%]">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Service dependency graph</span>
              </div>
              <p className="mb-3 text-[10px] text-muted-foreground">Based on your business context and traffic data</p>
              <KnowledgeGraphPreview apis={inventory} serviceContext={serviceContext} />
              <button
                onClick={() => setActiveTab("graph")}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View full graph →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedApiData && (
        <EndpointModal
          api={selectedApiData}
          serviceContext={serviceContext}
          decommQueue={decommQueue}
          onClose={() => setSelectedApi(null)}
          onAddToDecomm={(id) => setDecommQueue((q) => [...q, { api_id: id, status: "pending", added_at: new Date().toISOString() }])}
        />
      )}
    </div>
  );
};

export default Dashboard;
