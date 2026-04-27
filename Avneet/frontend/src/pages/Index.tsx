import { useState, useCallback } from "react";
import LandingPage from "@/components/spectre/LandingPage";
import ScanConfig from "@/components/spectre/ScanConfig";
import OnboardingFlow from "@/components/spectre/OnboardingFlow";
import DiscoveryPhase from "@/components/spectre/DiscoveryPhase";
import ClassificationPhase from "@/components/spectre/ClassificationPhase";
import AIAnalysisPhase from "@/components/spectre/AIAnalysisPhase";
import Dashboard from "@/components/spectre/Dashboard";

type Screen = "landing" | "config" | "onboarding" | "discovery" | "classification" | "analysis" | "dashboard";

interface ScanResult {
  repo_url: string;
  scan_id: string;
  timestamp: string;
  endpoints: any[];
  total: number;
  sources: Record<string, number>;
}

const Index = () => {
  const [screen, setScreen] = useState<Screen>("landing");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const goTo = useCallback((s: Screen) => setScreen(s), []);

  const handleScanComplete = useCallback((data: ScanResult) => {
    setScanResult(data);
    goTo("discovery");
  }, [goTo]);

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      {screen === "landing" && <LandingPage onStart={() => goTo("onboarding")} />}
      {screen === "onboarding" && (
        <OnboardingFlow 
          onStartScan={() => goTo("config")} 
          onBack={() => goTo("landing")} 
        />
      )}
      {screen === "config" && (
        <ScanConfig
          onContinue={handleScanComplete}
          onBack={() => goTo("onboarding")}
        />
      )}
      {screen === "discovery" && <DiscoveryPhase onComplete={() => goTo("classification")} />}
      {screen === "classification" && <ClassificationPhase onComplete={() => goTo("analysis")} />}
      {screen === "analysis" && <AIAnalysisPhase onComplete={() => goTo("dashboard")} />}
      {screen === "dashboard" && <Dashboard onNewScan={() => goTo("landing")} />}
    </div>
  );
};

export default Index;
