export type ApiState = "active" | "shadow" | "zombie" | "rogue" | "unknown";

export interface OwaspCheck {
  passed: boolean;
  detail: string;
}

export interface ApiEndpointUI {
  id: string;
  method: string;
  path: string;
  endpoint?: string;
  service_name: string;
  state: ApiState;
  last_seen?: string | null;
  last_seen_days_ago?: number | null;
  confidence: number;
  owasp_flags: string[];
  owasp_checks: Record<string, OwaspCheck>;
  technical_score: number;
  importance_score: number;
  base_importance_score?: number | null;
  priority_score?: number | null;
  priority_rank?: number | null;
  importance_reason?: string[] | null;
  importance_summary?: string | null;
  priority_reason?: string | null;
  priority_reason_lines?: string[] | null;
  priority_summary?: string | null;
  why_this_matters?: string | null;
  business_impact?: string | null;
  business_tags?: string[] | null;
  impact_summary?: string | null;
  blast_radius_services?: number | null;
  blast_radius_reason?: string | null;
  onboarding_context?: {
    domain?: string;
    regulation?: string;
    impact?: string;
  } | null;
  owner_team?: string | null;
  domain?: string | null;
  data_sensitivity?: string | null;
  is_external_facing?: boolean | null;
  regulatory_scope?: string[] | null;

  sources?: string[];
  in_repo?: boolean;
  in_gateway?: boolean;
  seen_in_traffic?: boolean;
  auth_detected?: boolean;
  auth_present?: boolean;
  auth_type?: string;
  status_codes?: number[];
  tags?: string[];
  raw_context?: string;
  also_found_in_conflict_with?: string | null;
  centrality_score?: number;
  traffic_history?: { month: string; calls: number }[];
  severity?: "Critical" | "High" | "Medium" | "Low" | null;
  action_type?: "decommission" | "register" | "harden" | "review" | null;
  risk_summary?: string | null;
  ai_summary?: string | null;
  ai_next_step?: string | null;
  violations?: string | string[] | null;
  technical_fix?: string | null;
  state_reason?: string | null;
  m2_data_sensitivity?: string | null;
  m2_sensitivity_score?: number | null;
  m2_risk_score?: number | null;
  m2_risk_factors?: string[] | null;
  m2_owasp_failures?: unknown[] | null;
  mitigation_steps?: { step: number; action: string; finding: string }[];
  mitigation_recommendation?: string;
  mitigation_detail?: string;
  mitigation_confidence?: number;
}

export interface ServiceContext {
  service_name: string;
  criticality: "critical" | "high" | "medium" | "low";
  centrality_score: number;
  importance_score?: number;
  dependent_services: string[];
  depends_on: string[];
  handles_customer_data?: boolean;
  processes_payments?: boolean;
  is_public_facing?: boolean;
  regulatory_scope?: string[];
}

export interface GraphNodeData {
  id: string;
  api_id?: string;
  label: string;
  method?: string;
  path?: string;
  service?: string;
  service_name?: string;
  state?: string;
  relation_count?: number;
  centrality?: number;
  technical_score?: number;
  importance_score?: number;
  owasp_flags?: string[];
  resource_family?: string;
  summary?: string | null;
  colour?: string;
  size?: number;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  relation?: string;
  reason?: string;
  impact?: string;
  inferred?: boolean;
}

export interface GraphResponse {
  nodes: Array<{ data: GraphNodeData }>;
  edges: Array<{ data: GraphEdgeData }>;
  summary: Record<string, unknown>;
  service_context: ServiceContext[];
}

export interface DecommissionQueueItem {
  api_id: string;
  status: "pending" | "approved" | "dismiss";
  added_at: string;
}

export interface OnboardingAnswers {
  system_type: string;
  data_handled: string[];
  regulations: string[];
  critical_service: string;
  api_consumers: string[];
}
