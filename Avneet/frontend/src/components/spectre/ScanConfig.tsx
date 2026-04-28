import { useState } from "react";
import { ArrowRight, ArrowLeft, Github, Sparkles, ChevronDown, Shield, Server, Code, Wifi, Container } from "lucide-react";
import { DISCOVERED_APIS, SCAN_CONFIG } from "@/data/mockData";
import { refreshInventory } from "@/api/client";
import { useSpectreData } from "@/providers/SpectreDataProvider";
import NavBar from "./NavBar";

const MODE_OVERRIDE_KEY = "spectre_data_mode_override";

const FEATURED_REPOS = [
  // {
  //   name: "FastAPI + Nginx Proxy Example",
  //   desc: "Python APIs behind Nginx reverse proxy (proxy_pass routes)",
  //   url: "https://github.com/santibreo/fastapi-nginx-example",
  //   highlight: "Best for end-to-end API discovery"
  // },
  // {
  //   name: "Nginx Docker Reverse Proxy",
  //   desc: "Dynamic routing using nginx proxy_pass and containers",
  //   url: "https://github.com/nginx-proxy/nginx-proxy",
  //   highlight: "Best for gateway + container exposure"
  // },
  {
    name: "FastAPI Microservices with Kong",
    desc: "Multiple Python services behind Kong API gateway",
    url: "https://github.com/EmrhT/fastapi-microservices-with-kong-api-gateway-on-k8s",
    highlight: "Best for gateway + service mapping"
  },
  {
    name: "Full Stack FastAPI Template",
    desc: "Production-ready FastAPI backend with multiple routes",
    url: "https://github.com/fastapi/full-stack-fastapi-template",
    highlight: "Best for route extraction (Python APIs)"
  }
];

interface ScanResult {
  repo_url: string;
  scan_id: string;
  timestamp: string;
  endpoints: any[];
  total: number;
  sources: Record<string, number>;
}

interface ScanConfigProps {
  onContinue: (scanData: ScanResult) => void;
  onBack: () => void;
}

const ScanConfig = ({ onContinue, onBack }: ScanConfigProps) => {
  const { onboarding } = useSpectreData();
  const [repoUrl, setRepoUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Advanced config state
  const [envName, setEnvName] = useState(SCAN_CONFIG.environment_name);
  const [gatewayPath, setGatewayPath] = useState(SCAN_CONFIG.gateway_config_path);
  const [repoPath, setRepoPath] = useState(SCAN_CONFIG.repo_path);
  const [networkInterface, setNetworkInterface] = useState(SCAN_CONFIG.network_interface);
  const [dockerSocket, setDockerSocket] = useState(SCAN_CONFIG.docker_socket);
  const [toggles, setToggles] = useState([true, true, false, false]);
  const trimmedRepoUrl = repoUrl.trim();
  const trimmedEnvName = envName.trim();
  const useMockDemo = !trimmedRepoUrl;

  const scanSources = [
    { icon: Server, label: "Gateway scan", desc: "Kong and Nginx configs", tag: "Source of truth" },
    { icon: Code, label: "Code scan", desc: "Python and Node.js source files", tag: "Recommended" },
    { icon: Wifi, label: "Traffic proxy", desc: "Live API call observation", tag: "Advanced" },
    { icon: Container, label: "Containers", desc: "Docker and Kubernetes manifests", tag: "Advanced" },
  ];

  const onboardingReady = Boolean(
    onboarding &&
    typeof onboarding === "object" &&
    onboarding["system_type"] &&
    Array.isArray(onboarding["regulations"]) &&
    onboarding["regulations"].length > 0 &&
    Array.isArray(onboarding["api_consumers"]) &&
    onboarding["api_consumers"].length > 0 &&
    onboarding["critical_service"]
  );

  const toggle = (i: number) => setToggles((t) => t.map((v, j) => (j === i ? !v : v)));

  const handleScan = async () => {
    setError("");

    if (!onboardingReady) {
      setError("Complete onboarding before starting a scan");
      return;
    }

    if (!trimmedRepoUrl && !trimmedEnvName) {
      setError("Add an environment name or repository URL to continue");
      return;
    }

    setLoading(true);
    try {
      if (typeof window !== "undefined") {
        if (trimmedRepoUrl) {
          window.localStorage.setItem("spectre_repo_url", trimmedRepoUrl);
          window.localStorage.setItem(MODE_OVERRIDE_KEY, "live");
        } else {
          window.localStorage.removeItem("spectre_repo_url");
          window.localStorage.setItem(MODE_OVERRIDE_KEY, "mock");
        }
        window.localStorage.setItem("spectre_env_name", trimmedEnvName || "Mock Demo Environment");
      }

      if (useMockDemo) {
        const mockEndpoints = DISCOVERED_APIS;
        onContinue({
          repo_url: "",
          scan_id: `mock-${Date.now()}`,
          timestamp: new Date().toISOString(),
          endpoints: mockEndpoints,
          total: mockEndpoints.length,
          sources: {},
        });
        return;
      }

      const data = await refreshInventory({
        repo_url: trimmedRepoUrl,
        environment_name: trimmedEnvName || trimmedRepoUrl,
        gateway_config_path: gatewayPath,
        repo_path: repoPath,
        network_interface: networkInterface,
        docker_socket: dockerSocket,
        scan_sources: {
          gateway: toggles[0],
          repo: toggles[1],
          traffic: toggles[2],
          container: toggles[3],
        },
      });
      
      // Store scan metadata
      const scanResult = {
        repo_url: trimmedRepoUrl,
        scan_id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        endpoints: data.inventory || [],
        total: data.scan?.total || data.inventory?.length || 0,
        sources: data.scan?.sources || {}
      };

      onContinue(scanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        {/* Header */}
        <button 
          onClick={onBack} 
          className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        <h1 className="text-xl font-medium mb-2 text-foreground">
          Scan your APIs instantly
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Onboarding is complete. Paste a GitHub repository or leave it blank and run the mock demo from the advanced environment settings.
        </p>
        {!onboardingReady && (
          <div className="mb-5 rounded-lg border border-[#E24B4A]/20 bg-[#E24B4A]/[0.06] p-3 text-[11px] text-[#A43A37]">
            Business context is required before scan because importance, regulation, and graph-based priority now drive the dashboard.
          </div>
        )}
       

        {/* MAIN ACTION: GitHub Scan */}
        <div className="rounded-xl border border-border bg-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Github className="h-5 w-5 text-foreground" />
            <span className="text-sm font-medium text-foreground">GitHub Repository</span>
          </div>
          <input
            type="text"
            placeholder="Optional: https://github.com/org/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="w-full rounded-lg bg-input border border-input-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#E24B4A]/50 mb-3"
          />
          <div className="mb-3 text-[11px] text-muted-foreground">
            Leave this empty to run the bundled mock demo using the environment name from Advanced configuration.
          </div>
          {error && (
            <div className="mb-3 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded">
              {error}
            </div>
          )}
          <button
            onClick={handleScan}
            disabled={loading || !onboardingReady}
            className="w-full rounded-lg bg-[#E24B4A] py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {useMockDemo ? "Loading demo..." : "Scanning..."}
              </>
            ) : (
              trimmedRepoUrl ? "Start Scan" : "Run Demo"
            )}
          </button>
        </div>

        {/* FEATURED REPOS */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 text-l text-foreground">
            <Sparkles className="h-3 w-3"  />
            Try with real-world systems
          </div>
          <div className="grid grid-cols-2 gap-3">
            {FEATURED_REPOS.map((repo) => (
              <button
                key={repo.name}
                onClick={() => setRepoUrl(repo.url)}
                className="text-left rounded-lg border border-border bg-card p-3 hover:border-[#E24B4A]/40 hover:bg-muted/20 transition-all"
              >
                <div className="text-sm text-foreground mb-0.5">{repo.name}</div>
                <div className="text-[11px] text-muted-foreground mb-1">
                  {repo.desc}
                </div>
                <div className="text-[10px] text-[#E24B4A]">
                  {repo.highlight}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* WHAT WE DETECT */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 mb-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
            <Shield className="h-4 w-4 text-[#E24B4A]" />
            What we detect
          </div>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-amber-500">●</span>
              <span>Zombie APIs not in gateway</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">●</span>
              <span>Shadow APIs from traffic analysis</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500">●</span>
              <span>Exposed container services</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500">●</span>
              <span>Missing authentication routes</span>
            </li>
          </ul>
        </div>

        {/* ADVANCED (COLLAPSIBLE) */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          Advanced configuration
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              showAdvanced ? "rotate-180" : ""
            }`}
          />
        </button>
        {showAdvanced && (
          <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-5">
            {/* Environment */}
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Environment name</label>
              <input
                type="text"
                value={envName}
                onChange={(e) => setEnvName(e.target.value)}
                className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm text-foreground outline-none"
              />
            </div>

            {/* Paths */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Gateway config path</label>
                <input
                  type="text"
                  value={gatewayPath}
                  onChange={(e) => setGatewayPath(e.target.value)}
                  className="w-full rounded-md bg-input border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Repository path</label>
                <input
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  className="w-full rounded-md bg-input border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>
            </div>

            {/* Network & Docker */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Network interface</label>
                <input
                  type="text"
                  value={networkInterface}
                  onChange={(e) => setNetworkInterface(e.target.value)}
                  className="w-full rounded-md bg-input border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Docker socket</label>
                <input
                  type="text"
                  value={dockerSocket}
                  onChange={(e) => setDockerSocket(e.target.value)}
                  className="w-full rounded-md bg-input border border-input-border px-2.5 py-2 font-mono text-[11px] text-foreground outline-none"
                />
              </div>
            </div>

            {/* Scan Sources */}
            <div>
              <h3 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Detection layers</h3>
              <div className="space-y-2">
                {scanSources.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-2">
                      <src.icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{src.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            src.tag === "Source of truth" ? "bg-emerald-500/10 text-emerald-500" :
                            src.tag === "Recommended" ? "bg-[#E24B4A]/10 text-[#E24B4A]" :
                            "bg-muted text-muted-foreground"
                          }`}>{src.tag}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{src.desc}</div>
                      </div>
                    </div>
                    <div className={`h-4 w-8 rounded-full transition-colors ${toggles[i] ? "bg-[#E24B4A]" : "bg-muted"} relative`}>
                      <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${toggles[i] ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              SPECTRE runs inside your infrastructure and reads these paths directly.
            </p>
          </div>
        )}

        {/* FOOTER */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </button>
          <button
            onClick={handleScan}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Scanning..." : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScanConfig;
