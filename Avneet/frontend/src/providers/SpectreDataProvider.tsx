import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DISCOVERED_APIS,
  SERVICE_CONTEXT,
  ONBOARDING_ANSWERS,
} from "@/data/mockData";
import { getGraph, getHealth, getInventory, getOnboarding, getQueue } from "@/api/client";
import type { ApiEndpointUI, DecommissionQueueItem, GraphResponse, OnboardingAnswers, ServiceContext } from "@/types/spectre";

export type SpectreDataMode = "auto" | "live" | "mock";
export type SpectreResolvedMode = "live" | "mock";

export interface SpectreDataValue {
  mode: SpectreDataMode;
  resolvedMode: SpectreResolvedMode;
  loading: boolean;
  error: string | null;
  inventory: ApiEndpointUI[];
  decommissionQueue: DecommissionQueueItem[];
  graph: GraphResponse;
  serviceContext: ServiceContext[];
  onboarding: OnboardingAnswers | Record<string, unknown>;
  refresh: () => Promise<void>;
}

const MODE: SpectreDataMode = import.meta.env.VITE_SPECTRE_DATA_MODE || "auto";
const LIVE_TIMEOUT_MS: number = Number(import.meta.env.VITE_SPECTRE_LIVE_TIMEOUT_MS) || 900;
const MODE_OVERRIDE_KEY = "spectre_data_mode_override";

function getPreferredMode(): SpectreDataMode {
  if (typeof window === "undefined") return MODE;
  const stored = window.localStorage.getItem(MODE_OVERRIDE_KEY);
  if (stored === "mock" || stored === "live") return stored;
  return MODE;
}

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function toDecommissionQueue(queueRecords: unknown[]): DecommissionQueueItem[] {
  const now = new Date().toISOString();
  return (queueRecords || []).map((ep) => {
    const record = (ep && typeof ep === "object") ? (ep as Record<string, unknown>) : {};
    const rawStatus = record["queue_status"];
    const status = rawStatus === "approve" ? "approved" : rawStatus || "pending";
    return {
      api_id: String(record["id"] || ""),
      status: (status === "approved" ? "approved" : status === "dismiss" ? "dismiss" : "pending") as DecommissionQueueItem["status"],
      added_at: String(record["queue_added_at"] || now),
    };
  });
}

function normalizeOnboarding(data: Record<string, unknown> | OnboardingAnswers): OnboardingAnswers {
  const criticalService = typeof data["critical_service"] === "string"
    ? String(data["critical_service"])
    : typeof data["critical_service_description"] === "string"
      ? String(data["critical_service_description"])
      : "";

  return {
    system_type: String(data["system_type"] || ""),
    data_handled: Array.isArray(data["data_handled"]) ? (data["data_handled"] as string[]) : [],
    regulations: Array.isArray(data["regulations"]) ? (data["regulations"] as string[]) : [],
    critical_service: criticalService,
    api_consumers: Array.isArray(data["api_consumers"]) ? (data["api_consumers"] as string[]) : [],
  };
}

function buildImportanceQueue(inventoryRecords: ApiEndpointUI[]): DecommissionQueueItem[] {
  const now = new Date().toISOString();
  return inventoryRecords
    .filter((ep) => {
      const importanceScore = ep.importance_score || 0;
      const hasAgentFix = Boolean(ep.technical_fix || ep.recommended_action);
      const hasFindings = Boolean((ep.owasp_flags || []).length || ep.violations);
      const riskyState = ["rogue", "shadow", "zombie"].includes(ep.state);
      return importanceScore >= 70 || (hasAgentFix && (hasFindings || riskyState));
    })
    .sort((a, b) => (b.priority_score || b.importance_score || 0) - (a.priority_score || a.importance_score || 0))
    .map((ep) => ({
      api_id: String(ep.id || ep.path || ""),
      status: "pending",
      added_at: now,
    }));
}

const SpectreDataContext = createContext<SpectreDataValue | null>(null);

export function SpectreDataProvider({ children }: { children: React.ReactNode }) {
  const initialMode = getPreferredMode();
  const [resolvedMode, setResolvedMode] = useState<SpectreResolvedMode>(initialMode === "live" ? "live" : "mock");
  const [loading, setLoading] = useState<boolean>(initialMode !== "mock");
  const [error, setError] = useState<string | null>(null);

  const [inventory, setInventory] = useState<ApiEndpointUI[]>(
    initialMode === "live" ? [] : (DISCOVERED_APIS as ApiEndpointUI[])
  );
  const [decommissionQueue, setDecommissionQueue] = useState<DecommissionQueueItem[]>(
    initialMode === "live" ? [] : buildImportanceQueue(DISCOVERED_APIS as ApiEndpointUI[])
  );
  const [graph, setGraph] = useState<GraphResponse>(
    initialMode === "live"
      ? { nodes: [], edges: [], summary: {}, service_context: [] }
      : { nodes: [], edges: [], summary: {}, service_context: SERVICE_CONTEXT as ServiceContext[] }
  );
  const [onboarding, setOnboarding] = useState<OnboardingAnswers | Record<string, unknown>>(
    initialMode === "live" ? {} : normalizeOnboarding(ONBOARDING_ANSWERS as Record<string, unknown>)
  );

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyMockState = () => {
    setResolvedMode("mock");
    setLoading(false);
    setError(null);
    setInventory(DISCOVERED_APIS as ApiEndpointUI[]);
    setDecommissionQueue(buildImportanceQueue(DISCOVERED_APIS as ApiEndpointUI[]));
    setGraph({ nodes: [], edges: [], summary: {}, service_context: SERVICE_CONTEXT as ServiceContext[] });
    setOnboarding(normalizeOnboarding(ONBOARDING_ANSWERS as Record<string, unknown>));
  };

  const refresh = async (): Promise<void> => {
    const preferredMode = getPreferredMode();

    if (preferredMode === "mock") {
      applyMockState();
      return;
    }

    setLoading(true);
    setError(null);

    const { signal, cancel } = withTimeoutSignal(LIVE_TIMEOUT_MS);
    try {
      await getHealth({ signal });

      const [inv, q, g, ob] = await Promise.all([
        getInventory({ signal }),
        getQueue({ signal }),
        getGraph({ signal }),
        getOnboarding({ signal }).catch(() => (preferredMode === "live" ? {} : ONBOARDING_ANSWERS)),
      ]);
      cancel();
      if (!mounted.current) return;

      setResolvedMode("live");
      setInventory((Array.isArray(inv) ? (inv as ApiEndpointUI[]) : []) as ApiEndpointUI[]);
      setDecommissionQueue(toDecommissionQueue(Array.isArray(q) ? (q as unknown[]) : []));
      setGraph((g || { nodes: [], edges: [], summary: {}, service_context: [] }) as GraphResponse);
      setOnboarding(normalizeOnboarding((ob || ONBOARDING_ANSWERS) as Record<string, unknown>));
      setLoading(false);
    } catch (e: unknown) {
      cancel();

      const message = e instanceof Error ? e.message : "Failed to load live data";
      if (preferredMode === "live") {
        if (mounted.current) {
          setResolvedMode("live");
          setError(message);
          setInventory([]);
          setDecommissionQueue([]);
          setGraph({ nodes: [], edges: [], summary: {}, service_context: [] });
          setLoading(false);
        }
        return;
      }

      // auto => fall back to mock (and stay usable)
      if (mounted.current) {
        applyMockState();
      }
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serviceContext = useMemo(() => {
    const ctx = graph?.service_context;
    return Array.isArray(ctx) ? (ctx as ServiceContext[]) : (SERVICE_CONTEXT as ServiceContext[]);
  }, [graph]);

  const value: SpectreDataValue = useMemo(
    () => ({
      mode: getPreferredMode(),
      resolvedMode,
      loading,
      error,
      inventory,
      decommissionQueue,
      graph,
      serviceContext,
      onboarding,
      refresh,
    }),
    [resolvedMode, loading, error, inventory, decommissionQueue, graph, serviceContext, onboarding]
  );

  return <SpectreDataContext.Provider value={value}>{children}</SpectreDataContext.Provider>;
}

export function useSpectreData(): SpectreDataValue {
  const ctx = useContext(SpectreDataContext);
  if (!ctx) throw new Error("useSpectreData must be used within SpectreDataProvider");
  return ctx;
}
