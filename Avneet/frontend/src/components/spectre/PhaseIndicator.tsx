import { Check } from "lucide-react";

interface PhaseIndicatorProps {
  currentPhase: number;
}

const phases = [
  { step: 1, label: "Discovery Agent" },
  { step: 2, label: "Classifier" },
  { step: 3, label: "AI Layer" },
];

const PhaseIndicator = ({ currentPhase }: PhaseIndicatorProps) => {
  return (
    <div className="flex items-center justify-center gap-1 py-6">
      {phases.map((phase, i) => {
        const isActive = phase.step === currentPhase;
        const isDone = phase.step < currentPhase;
        return (
          <div key={phase.step} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                  isActive
                    ? "bg-foreground text-background"
                    : isDone
                    ? "bg-spectre-active-bg text-spectre-active"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : phase.step}
              </div>
              <span
                className={`text-xs ${
                  isActive ? "text-foreground font-medium" : isDone ? "text-spectre-active" : "text-muted-foreground"
                }`}
              >
                {phase.label}
              </span>
            </div>
            {i < phases.length - 1 && (
              <div className={`mx-3 h-px w-10 ${isDone ? "bg-spectre-active/40" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PhaseIndicator;
