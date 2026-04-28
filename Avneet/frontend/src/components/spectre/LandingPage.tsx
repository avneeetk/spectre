import { ArrowRight, Search, Shield, BarChart3, Zap, Activity, Lock, GitBranch, Network, Sparkles } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import Reveal from "./Reveal";
import OrbitVisual from "./OrbitVisual";

interface LandingPageProps {
  onStart: () => void;
}

const LandingPage = ({ onStart }: LandingPageProps) => {
  const stats = [
    { value: "57%", label: "of orgs breached via APIs" },
    { value: "109%", label: "YoY rise in API attacks" },
    { value: "$6.2M", label: "avg. API breach cost" },
    { value: "<3min", label: "mean time to detect" },
  ];

  const crisisFlow = [
    { title: "API deployed", desc: "New endpoint goes live" },
    { title: "Shadow API emerges", desc: "Undocumented, unmonitored" },
    { title: "Attacker discovers", desc: "Automated reconnaissance" },
    { title: "Data breach", desc: "Compliance + customer fallout" },
  ];

  const stateCards = [
    { state: "Active", color: "bg-spectre-active-bg text-spectre-active", desc: "Documented, owned, monitored", example: "GET /v1/auth/token" },
    { state: "Shadow", color: "bg-spectre-shadow-bg text-spectre-shadow", desc: "Live traffic, not in any gateway", example: "POST /api/admin/reset" },
    { state: "Zombie", color: "bg-spectre-zombie-bg text-spectre-zombie", desc: "Abandoned 90+ days, still reachable", example: "GET /v1/accounts/export" },
    { state: "Rogue", color: "bg-spectre-rogue-bg text-spectre-rogue", desc: "Conflicts with known endpoints, no auth", example: "POST /v1/payments/process" },
  ];

  const pillars = [
    {
      tag: "Discovery",
      icon: Search,
      title: "Find every API. Even the ones nobody remembers.",
      desc: "Continuous discovery across gateways, code repos, network traffic and container metadata. Shadow, zombie and rogue APIs surface in minutes.",
      points: ["Gateway configs (Kong, Nginx)", "Python & Node.js AST scanning", "Live traffic mirroring", "Docker & K8s manifests"],
    },
    {
      tag: "Risk Intelligence",
      icon: BarChart3,
      title: "Know your riskiest APIs.",
      desc: "Two scores, side by side. Technical risk from OWASP API Top 10 checks. Importance from your business context and service dependency graph.",
      points: ["OWASP API2, API4, API8, API9 checks", "Centrality from traffic graph", "Business-weighted prioritisation", "Per-API confidence scoring"],
    },
    {
      tag: "Agentic Mitigation",
      icon: Sparkles,
      title: "Detect. Analyse. Recommend. Autonomously.",
      desc: "An AI mitigation agent investigates each flagged endpoint step by step - traffic history, callers, replacements, OWASP guidance - then drafts the exact action.",
      points: ["Step-by-step reasoning", "Confidence-rated plans", "Block, remove or review", "Decommission queue workflow"],
    },
  ];

  const compliance = ["OWASP API Top 10", "PCI DSS 4.0", "GDPR", "SOC 2", "HIPAA", "ISO 27001"];

  const useCases = [
    { label: "Fintech", text: "A zombie payment API with no auth is a compliance violation and a fraud surface." },
    { label: "Healthcare", text: "A shadow endpoint touching patient records is a HIPAA breach waiting to happen." },
    { label: "SaaS", text: "After every migration, deprecated APIs accumulate. SPECTRE finds them before attackers do." },
  ];

  const steps = [
    { n: "01", icon: GitBranch, title: "Connect", desc: "Point SPECTRE at your gateway configs, code repos, network interface and Docker socket. Runs entirely inside your infrastructure." },
    { n: "02", icon: Network, title: "Discover", desc: "Every API mapped - including shadow, zombie and rogue endpoints across all four sources." },
    { n: "03", icon: Shield, title: "Govern", desc: "Risk scores, AI explanations and an agent-driven mitigation plan tell you what to fix first and exactly how." },
  ];

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      {/* Top nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#E24B4A] text-white text-[11px] font-medium">SP</div>
            <span className="text-sm font-medium tracking-tight">SPECTRE</span>
            <span className="ml-3 hidden md:inline text-[11px] uppercase tracking-[0.14em] text-muted-foreground">API Threat Classification & Governance</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#how" className="hidden md:inline text-xs text-muted-foreground hover:text-foreground transition-colors">How it works</a>
            <a href="#pillars" className="hidden md:inline text-xs text-muted-foreground hover:text-foreground transition-colors">Platform</a>
            {/* <a href="#compliance" className="hidden md:inline text-xs text-muted-foreground hover:text-foreground transition-colors">Compliance</a> */}
            <ThemeToggle />
            <button
              onClick={onStart}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#E24B4A] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-all"
            >
              Start scanning
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        {/* animated orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full blur-3xl animate-orb-float"
          style={{ background: "radial-gradient(circle, #E24B4A 0%, transparent 70%)", opacity: 0.18 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-20 -left-32 h-[380px] w-[380px] rounded-full blur-3xl animate-orb-float-slow"
          style={{ background: "radial-gradient(circle, hsl(var(--spectre-shadow)) 0%, transparent 70%)", opacity: 0.12 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-40 -right-32 h-[420px] w-[420px] rounded-full blur-3xl animate-orb-float"
          style={{ background: "radial-gradient(circle, hsl(var(--spectre-active)) 0%, transparent 70%)", opacity: 0.10, animationDelay: "4s" }}
        />

        {/* drifting grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.08] animate-grid-drift"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            color: "currentColor",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, black 30%, transparent 75%)",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground animate-fade-in" style={{ animationDelay: "0ms" }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#E24B4A] opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#E24B4A]" />
            </span>
            API Security Posture Management
          </div>

          <h1 className="mt-8 text-5xl md:text-7xl tracking-[-0.04em] leading-[0.95] font-medium text-foreground">
            <span className="block text-[#E24B4A] animate-fade-in-up" style={{ animationDelay: "100ms" }}>API Security.</span>
            <span className="block animate-fade-in-up" style={{ animationDelay: "250ms" }}>Discover. Classify. Govern</span>
            <span className="block text-muted-foreground/70 animate-fade-in-up" style={{ animationDelay: "400ms" }}>every endpoint.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-xl text-base text-muted-foreground leading-relaxed animate-fade-in-up" style={{ animationDelay: "550ms" }}>
            SPECTRE scans your gateways, repositories and live traffic to surface every API - then ranks them by technical risk and business importance, with an AI agent recommending exactly what to do next.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3 animate-fade-in-up" style={{ animationDelay: "700ms" }}>
            <button
              onClick={onStart}
              className="group relative inline-flex items-center gap-2 rounded-full bg-[#E24B4A] px-6 py-3 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] transition-all hover:shadow-[0_8px_30px_-8px_rgba(226,75,74,0.6)] hover:-translate-y-0.5"
            >
              Start scanning
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-accent transition-all hover:-translate-y-0.5"
            >
              See how it works
            </a>
          </div>

          <p className="mt-5 text-[11px] text-muted-foreground animate-fade-in" style={{ animationDelay: "900ms" }}>No cloud required · runs inside your infrastructure · OWASP API Top 10 coverage</p>

          {/* stat strip */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px rounded-xl border border-border bg-border overflow-hidden">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className="bg-background px-5 py-6 text-left animate-fade-in-up hover:bg-accent/40 transition-colors"
                style={{ animationDelay: `${1000 + i * 120}ms` }}
              >
                <div className="text-2xl md:text-3xl tracking-tight text-foreground font-medium">{s.value}</div>
                <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTINUOUS DISCOVERY - orbital visual */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            color: "currentColor",
            maskImage: "radial-gradient(ellipse 60% 70% at 50% 50%, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 50% 50%, black 30%, transparent 80%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#E24B4A] mb-3">Continuous discovery</div>
              <h2 className="text-3xl md:text-5xl tracking-[-0.03em] leading-[1.05] font-medium">
                No API stays hidden.
              </h2>
              <p className="mt-5 max-w-md text-sm md:text-base text-muted-foreground leading-relaxed">
                Continuous discovery across cloud, microservices and third-party integrations. SPECTRE maps every endpoint into orbit - known, shadow, zombie or rogue - so nothing escapes inventory.
              </p>

              <ul className="mt-8 space-y-3 text-sm">
                <li className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--spectre-active))", boxShadow: "0 0 12px hsl(var(--spectre-active))" }} />
                  <span className="text-foreground font-medium">Active</span>
                  <span className="text-muted-foreground text-xs">Documented and monitored</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--spectre-shadow))", boxShadow: "0 0 12px hsl(var(--spectre-shadow))" }} />
                  <span className="text-foreground font-medium">Shadow</span>
                  <span className="text-muted-foreground text-xs">Live traffic, not in any registry</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--spectre-zombie))", boxShadow: "0 0 12px hsl(var(--spectre-zombie))" }} />
                  <span className="text-foreground font-medium">Zombie</span>
                  <span className="text-muted-foreground text-xs">Abandoned 90+ days, still reachable</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--spectre-rogue))", boxShadow: "0 0 12px hsl(var(--spectre-rogue))" }} />
                  <span className="text-foreground font-medium">Rogue</span>
                  <span className="text-muted-foreground text-xs">Conflicts with known endpoints, no auth</span>
                </li>
              </ul>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="flex items-center justify-center">
              <OrbitVisual />
            </div>
          </Reveal>
        </div>
      </section>

      {/* THE CRISIS */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#E24B4A] mb-3">The API crisis</div>
          <h2 className="text-3xl md:text-4xl tracking-tight font-medium max-w-2xl">
            Most breaches today start with an API nobody was watching.
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground leading-relaxed">
            Shadow endpoints, deprecated routes left running, services with no owner. The path from "oversight" to "incident" is shorter than most teams realise.
          </p>

          <Reveal>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-3">
              {crisisFlow.map((s, i) => (
                <div
                  key={s.title}
                  className="relative rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-[#E24B4A]/40 hover:shadow-[0_8px_30px_-12px_rgba(226,75,74,0.25)] animate-fade-in-up"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Stage {i + 1}</div>
                  <div className="mt-2 text-sm font-medium text-foreground">{s.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{s.desc}</div>
                  {i < crisisFlow.length - 1 && (
                    <ArrowRight className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                  )}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOUR STATES */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">Classification</div>
          <h2 className="text-3xl md:text-4xl tracking-tight font-medium max-w-2xl">Every API falls into one of four states.</h2>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground leading-relaxed">
            SPECTRE classifies each endpoint based on traffic, documentation, ownership and gateway presence - so the response is always specific.
          </p>

          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stateCards.map((card, i) => (
              <Reveal key={card.state} delay={i * 100}>
                <div className={`rounded-xl p-5 ${card.color} transition-transform hover:-translate-y-1 hover:scale-[1.02] cursor-default`}>
                  <div className="text-sm font-medium mb-1">{card.state}</div>
                  <p className="text-[11px] opacity-80 mb-4 leading-relaxed">{card.desc}</p>
                  <code className="text-[10px] opacity-60 font-mono break-all">{card.example}</code>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section id="pillars" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">Platform</div>
          <h2 className="text-3xl md:text-4xl tracking-tight font-medium max-w-2xl">Three layers, one continuous loop.</h2>

          <div className="mt-12 space-y-3">
            {pillars.map((p, i) => (
              <Reveal key={p.tag} delay={i * 120}>
                <div className="group grid grid-cols-1 md:grid-cols-12 gap-6 rounded-xl border border-border bg-card p-6 md:p-8 transition-all hover:border-[#E24B4A]/40 hover:shadow-[0_12px_40px_-16px_rgba(226,75,74,0.25)]">
                  <div className="md:col-span-4">
                    <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#E24B4A]">
                      <p.icon className="h-3 w-3 transition-transform group-hover:scale-125 group-hover:rotate-6" />
                      {p.tag}
                    </div>
                    <h3 className="mt-3 text-xl tracking-tight font-medium leading-snug">{p.title}</h3>
                  </div>
                  <div className="md:col-span-8">
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                    <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-xs text-foreground">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-[#E24B4A] shrink-0" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">How it works</div>
          <h2 className="text-3xl md:text-4xl tracking-tight font-medium max-w-2xl">Three steps. Total API visibility.</h2>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-3">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 150}>
                <div className="group relative rounded-xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-[#E24B4A]/40 h-full">
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Step {s.n}</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background transition-all group-hover:border-[#E24B4A]/60 group-hover:rotate-6">
                      <s.icon className="h-3.5 w-3.5 text-[#E24B4A]" />
                    </div>
                  </div>
                  <div className="text-base font-medium text-foreground">{s.title}</div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                  {i < steps.length - 1 && (
                    <ArrowRight className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* COMPLIANCE */}
      {/* <section id="compliance" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">Compliance</div>
          <h2 className="text-3xl md:text-4xl tracking-tight font-medium max-w-2xl">Map findings to the frameworks you already report on.</h2>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground leading-relaxed">
            Onboard once with your business context - SPECTRE tags every API against the regulations that apply to your environment.
          </p>

          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-px rounded-xl border border-border bg-border overflow-hidden">
            {compliance.map((c, i) => (
              <div
                key={c}
                className="bg-card px-4 py-5 text-center transition-colors hover:bg-accent animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="text-xs font-medium text-foreground">{c}</div>
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* WHY IT MATTERS */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">Why it matters</div>
          <h2 className="text-3xl md:text-4xl tracking-tight font-medium max-w-2xl">Different industries. Same blind spot.</h2>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3">
            {useCases.map((uc, i) => (
              <Reveal key={uc.label} delay={i * 120}>
                <div className="rounded-xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-[#E24B4A]/40 h-full">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[#E24B4A] mb-3">{uc.label}</div>
                  <p className="text-sm text-foreground leading-relaxed">{uc.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="text-3xl md:text-5xl tracking-tight font-medium leading-tight">
              Every unmanaged API <span className="text-[#E24B4A]">is an open door.</span>
            </h2>
            <p className="mt-5 text-sm text-muted-foreground max-w-md mx-auto">
              Run your first scan in under a minute. SPECTRE stays inside your infrastructure - nothing leaves your network.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={onStart}
                className="group inline-flex items-center gap-2 rounded-full bg-[#E24B4A] px-6 py-3 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(226,75,74,0.6)]"
              >
                Start scanning
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <a
                href="#pillars"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-accent transition-all hover:-translate-y-0.5"
              >
                Explore the platform
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10">
        <div className="mx-auto max-w-5xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E24B4A] text-white text-[10px] font-medium">SP</div>
            <span className="text-xs text-muted-foreground">SPECTRE - open-source API governance, built for security engineers and developers.</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Lock className="h-3 w-3" /> Self-hosted</span>
            <span className="inline-flex items-center gap-1.5"><Activity className="h-3 w-3" /> OWASP API Top 10</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-3 w-3" /> Agentic mitigation</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
