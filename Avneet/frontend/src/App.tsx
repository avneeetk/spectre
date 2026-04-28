import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/useTheme";
import { SpectreDataProvider } from "@/providers/SpectreDataProvider";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <SpectreDataProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/landing" element={<Index />} />
            <Route path="/onboarding" element={<Index />} />
            <Route path="/config" element={<Index />} />
            <Route path="/discovery" element={<Index />} />
            <Route path="/classification" element={<Index />} />
            <Route path="/analysis" element={<Index />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </HashRouter>
        </TooltipProvider>
      </SpectreDataProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
