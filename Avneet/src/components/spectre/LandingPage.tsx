import { ArrowRight, Search, Shield, BarChart3 } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

interface LandingPageProps {
  onStart: () => void;
}

const LandingPage = ({ onStart }: LandingPageProps) => {
  const stateCards = [
    { state: "Active", color: "bg-spectre-active-bg text-spectre-active", desc: "Documented, owned, monitored", example: "GET /v1/auth/token" },
    { state: "Shadow", color: "bg-spectre-shadow-bg text-spectre-shadow", desc: "Live traffic, not in any gateway", example: "POST /api/admin/reset" },
    { state: "Zombie", color: "bg-spectre-zombie-bg text-spectre-zombie", desc: "Abandoned 90+ days, still reachable", example: "GET /v1/accounts/export" },
    { state: "Rogue", color: "bg-spectre-rogue-bg text-spectre-rogue", desc: "Conflicts with known endpoints, no auth", example: "POST /v1/payments/process" },
  ];

  const steps = [
    { icon: Search, title: "Scan", desc: "Connect SPECTRE to your gateway configs, code repos, and network. It finds every API — including ones nobody knows about." },
    { icon: Shield, title: "Classify", desc: "Each API is classified as Active, Shadow, Zombie, or Rogue based on traffic, documentation, and ownership." },
    { icon: BarChart3, title: "Govern", desc: "Risk scores, AI explanations, and a mitigation agent tell you what to fix first and exactly how." },
  ];

  const useCases = [
    { label: "Fintech", text: "A zombie payment API with no auth is a compliance violation and a fraud surface." },
    { label: "Healthcare", text: "A shadow endpoint touching patient records is a HIPAA breach waiting to happen." },
    { label: "SaaS", text: "After every migration, deprecated APIs accumulate. SPECTRE finds them before attackers do." },
  ];

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      {/* Theme toggle top-right */}
      <div className="flex justify-end px-6 py-3">
        <ThemeToggle />
      </div>

      {/* Hero */}
      <div className="mx-auto max-w-2xl px-6 pt-16 pb-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E24B4A] text-white text-sm font-medium">
            SP
          </div>
          <h1 className="text-4xl font-medium tracking-tight text-foreground">SPECTRE</h1>
        </div>
        <p className="mb-4 text-lg text-muted-foreground">API Threat Classification and Governance Platform</p>
        <p className="mb-10 text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
          Discover every API in your infrastructure. Classify what is zombie, shadow, or rogue. Understand what matters to your business. Act before it is too late.
        </p>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Start scanning
          <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-4 text-xs text-muted-foreground">No cloud required · runs inside your infrastructure</p>
      </div>

      {/* How it works */}
      <div className="mx-auto max-w-3xl px-6 pb-20">
        <div className="grid grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <div key={i} className="relative text-center">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card">
                <step.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-sm font-medium text-foreground">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              {i < 2 && (
                <div className="absolute top-5 -right-3 hidden lg:block">
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Four states */}
      <div className="mx-auto max-w-3xl px-6 pb-20">
        <div className="grid grid-cols-4 gap-3">
          {stateCards.map((card) => (
            <div key={card.state} className={`rounded-xl p-4 ${card.color}`}>
              <div className="text-sm font-medium mb-1">{card.state}</div>
              <p className="text-[11px] opacity-80 mb-3">{card.desc}</p>
              <code className="text-[10px] opacity-60 font-mono">{card.example}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Why it matters */}
      <div className="mx-auto max-w-3xl px-6 pb-20">
        <div className="grid grid-cols-3 gap-4">
          {useCases.map((uc) => (
            <div key={uc.label} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{uc.label}</div>
              <p className="text-xs text-foreground leading-relaxed">{uc.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border py-12 text-center">
        <p className="mb-4 text-xs text-muted-foreground">SPECTRE is an open-source API governance platform. Built for security engineers and developers.</p>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Start scanning
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
