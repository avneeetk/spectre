import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LandingPage from "@/components/spectre/LandingPage";
import ScanConfig from "@/components/spectre/ScanConfig";
import OnboardingFlow from "@/components/spectre/OnboardingFlow";
import DiscoveryPhase from "@/components/spectre/DiscoveryPhase";
import ClassificationPhase from "@/components/spectre/ClassificationPhase";
import AIAnalysisPhase from "@/components/spectre/AIAnalysisPhase";
import Dashboard from "@/components/spectre/Dashboard";

type Screen = "landing" | "config" | "onboarding" | "discovery" | "classification" | "analysis" | "dashboard";
const SCREEN_PATHS: Record<Screen, string> = {
  landing: "/landing",
  onboarding: "/onboarding",
  config: "/config",
  discovery: "/discovery",
  classification: "/classification",
  analysis: "/analysis",
  dashboard: "/dashboard",
};

const PATH_SCREENS: Record<string, Screen> = {
  "/": "landing",
  "/landing": "landing",
  "/onboarding": "onboarding",
  "/config": "config",
  "/discovery": "discovery",
  "/classification": "classification",
  "/analysis": "analysis",
  "/dashboard": "dashboard",
};

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const screen = PATH_SCREENS[location.pathname] || "landing";
  const goTo = useCallback((nextScreen: Screen) => {
    navigate(SCREEN_PATHS[nextScreen]);
  }, [navigate]);

  const handleScanComplete = useCallback(() => {
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
