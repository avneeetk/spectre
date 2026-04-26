import { useState } from "react";
import { ArrowRight, Shield } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import StateBadge from "./StateBadge";
import NavBar from "./NavBar";
import { useSpectreData } from "@/providers/SpectreDataProvider";
import type { ApiEndpointUI } from "@/types/spectre";

interface AIAnalysisPhaseProps {
  onComplete: () => void;
}

const AIAnalysisPhase = ({ onComplete }: AIAnalysisPhaseProps) => {
  const { inventory, serviceContext, loading } = useSpectreData();
  const topServices = [...(serviceContext || [])].slice(0, 4);
  const flaggedApis = (inventory || []).filter((a) => a.mitigation_steps && a.mitigation_steps.length > 0);
  const [showMitigation, setShowMitigation] = useState(false);
  const [selectedApi, setSelectedApi] = useState(flaggedApis[0] || null);

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <PhaseIndicator currentPhase={3} />
      <div className="mx-auto max-w-[800px] px-6">
        <h2 className="text-xl font-medium tracking-tight text-foreground mb-1">
          AI Risk Analysis Complete
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Analyzed {inventory?.length || 0} APIs using business context + service dependencies
        </p>

        {/* Top Services Table */}
        {topServices.length > 0 && (
          <div className="mb-8 rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Highest Priority Services
              </h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Service</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Criticality</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Centrality</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Importance</th>
                </tr>
              </thead>
              <tbody>
                {topServices.map((svc) => (
                  <tr key={svc.service_name} className="border-b border-border/50">
                    <td className="px-4 py-2 font-mono text-foreground">{svc.service_name}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{svc.criticality}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{svc.centrality_score?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">{svc.importance_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mitigation Section */}
        {flaggedApis.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Shield className="inline h-3.5 w-3.5 mr-1" />
                {flaggedApis.length} APIs Require Mitigation
              </h3>
              <button
                onClick={() => setShowMitigation(!showMitigation)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showMitigation ? "Hide details" : "View details"}
              </button>
            </div>

            {showMitigation && (
              <div className="space-y-3">
                {flaggedApis.map((api) => (
                  <div key={api.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="font-mono text-sm text-foreground">{api.path || api.endpoint}</span>
                      <StateBadge state={api.state} />
                    </div>

                    {api.mitigation_steps && api.mitigation_steps.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {api.mitigation_steps.map((s: NonNullable<ApiEndpointUI['mitigation_steps']>[number]) => (
                          <div key={s.step} className="flex items-start gap-2">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E24B4A]/10 text-[10px] font-medium text-[#E24B4A]">
                              {s.step}
                            </div>
                            <div>
                              <span className="text-sm text-foreground">{s.action}</span>
                              <p className="text-xs text-muted-foreground">{s.finding}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {api.mitigation_recommendation && (
                      <div className="rounded-lg border-l-2 border-l-spectre-active bg-spectre-active-bg/30 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{api.mitigation_recommendation}</span>
                          <span className="rounded-full bg-spectre-active-bg px-2 py-0.5 text-[10px] font-medium text-spectre-active">
                            {api.mitigation_confidence}% confidence
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manual proceed button */}
        <div className="flex justify-center mt-8">
          <button
            onClick={onComplete}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
          >
            View full results
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAnalysisPhase;
