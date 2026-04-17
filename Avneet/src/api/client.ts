const DEFAULT_BASE_URL = "http://localhost:8000";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  return (await res.json()) as T;
}

export type QueueAction = "approve" | "dismiss";

export function getHealth(init?: RequestInit): Promise<{ status: string }> {
  return fetchJson("/health", init);
}

export function getOnboarding(init?: RequestInit): Promise<Record<string, unknown>> {
  return fetchJson("/api/onboarding", init);
}

export function postOnboarding(body: Record<string, unknown>, init?: RequestInit): Promise<{ status: string }> {
  return fetchJson("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}

export function getInventory(init?: RequestInit): Promise<unknown[]> {
  return fetchJson("/api/inventory", init);
}

export function getQueue(init?: RequestInit): Promise<unknown[]> {
  return fetchJson("/api/queue", init);
}

export function postQueueAction(endpoint: string, action: QueueAction, init?: RequestInit): Promise<{ endpoint: string; status: string }> {
  const encoded = encodeURIComponent(endpoint);
  return fetchJson(`/api/queue/${encoded}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
    ...init,
  });
}

export function getGraph(init?: RequestInit): Promise<Record<string, unknown>> {
  return fetchJson("/api/graph", init);
}
