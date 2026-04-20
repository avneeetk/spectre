import { useState } from "react";
import { ArrowRight, ArrowLeft, Server, Code, Wifi, Container } from "lucide-react";
import { SCAN_CONFIG } from "@/data/mockData";
import NavBar from "./NavBar";

interface ScanConfigProps {
  onContinue: () => void;
  onBack: () => void;
}

const ScanConfig = ({ onContinue, onBack }: ScanConfigProps) => {
  const [envName, setEnvName] = useState(SCAN_CONFIG.environment_name);
  const [gatewayPath, setGatewayPath] = useState(SCAN_CONFIG.gateway_config_path);
  const [repoPath, setRepoPath] = useState(SCAN_CONFIG.repo_path);
  const [networkInterface, setNetworkInterface] = useState(SCAN_CONFIG.network_interface);
  const [dockerSocket, setDockerSocket] = useState(SCAN_CONFIG.docker_socket);
  const [toggles, setToggles] = useState([true, true, true, true]);
  const [scanDepth, setScanDepth] = useState<"quick" | "full">("full");

  const scanSources = [
    { icon: Server, label: "Gateway scan", desc: "Reads Kong and Nginx config files. Finds all officially registered routes." },
    { icon: Code, label: "Code repository scan", desc: "Scans Python and Node.js source files. Finds routes that exist in code but not in the gateway." },
    { icon: Wifi, label: "Network traffic proxy", desc: "Observes live API calls. Finds shadow APIs receiving traffic that appear nowhere else." },
    { icon: Container, label: "Container metadata", desc: "Reads Docker Compose and Kubernetes manifests. Finds services with exposed ports." },
  ];

  const toggle = (i: number) => setToggles((t) => t.map((v, j) => (j === i ? !v : v)));

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <div className="mx-auto max-w-[520px] px-6 py-8">
        <button onClick={onBack} className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>

        <div className="mb-2 text-xs text-muted-foreground">Step 1 of 2</div>
        <h1 className="mb-8 text-xl font-medium tracking-tight text-foreground">Configure your scan</h1>

        {/* Environment */}
        <div className="mb-8 rounded-xl border border-border bg-card p-5">
          <label className="mb-1.5 block text-xs text-muted-foreground">Environment name</label>
          <input
            type="text"
            value={envName}
            onChange={(e) => setEnvName(e.target.value)}
            className="mb-4 w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm text-foreground outline-none"
          />
          <div className="space-y-3 rounded-lg bg-input border border-input-border p-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Gateway config path</label>
              <input
                type="text"
                value={gatewayPath}
                onChange={(e) => setGatewayPath(e.target.value)}
                className="w-full rounded-md bg-background border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Repository path</label>
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                className="w-full rounded-md bg-background border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Network interface</label>
                <input
                  type="text"
                  value={networkInterface}
                  onChange={(e) => setNetworkInterface(e.target.value)}
                  className="w-full rounded-md bg-background border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Docker socket</label>
                <input
                  type="text"
                  value={dockerSocket}
                  onChange={(e) => setDockerSocket(e.target.value)}
                  className="w-full rounded-md bg-background border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            SPECTRE runs inside your infrastructure and reads these paths directly.
          </p>
        </div>

        {/* Scan sources */}
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Scan sources</h2>
          <div className="space-y-1.5">
            {scanSources.map((src, i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <src.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">{src.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">{src.desc}</div>
                  </div>
                </div>
                <div className={`h-5 w-9 rounded-full transition-colors shrink-0 ml-3 ${toggles[i] ? "bg-[#E24B4A]" : "bg-muted"} relative`}>
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${toggles[i] ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Scan depth */}
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Scan depth</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setScanDepth("quick")}
              className={`rounded-xl border p-4 text-left transition-all ${
                scanDepth === "quick" ? "border-[#E24B4A] border-[1.5px]" : "border-border bg-card"
              }`}
            >
              <div className="text-sm font-medium text-foreground mb-0.5">Quick scan</div>
              <div className="text-[11px] text-muted-foreground mb-2">~30 seconds</div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">Gateway config + Code repositories. Does not observe live traffic.</div>
              <div className="mt-2 text-[10px] text-muted-foreground">Best for: Initial assessment</div>
            </button>
            <button
              onClick={() => setScanDepth("full")}
              className={`rounded-xl border p-4 text-left transition-all relative ${
                scanDepth === "full" ? "border-[#E24B4A] border-[1.5px]" : "border-border bg-card"
              }`}
            >
              <span className="absolute top-3 right-3 rounded-full bg-[#E24B4A]/10 px-2 py-0.5 text-[10px] font-medium text-[#E24B4A]">Recommended</span>
              <div className="text-sm font-medium text-foreground mb-0.5">Full scan</div>
              <div className="text-[11px] text-muted-foreground mb-2">~2-3 minutes</div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">All 4 sources — including shadow APIs in live traffic and container services.</div>
              <div className="mt-2 text-[10px] text-muted-foreground">Best for: Complete governance audit</div>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </button>
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScanConfig;
