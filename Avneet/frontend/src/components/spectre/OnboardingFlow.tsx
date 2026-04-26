import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import NavBar from "./NavBar";
import { useToast } from "@/hooks/use-toast";
import { postOnboarding } from "@/api/client";
import { useSpectreData } from "@/providers/SpectreDataProvider";

interface OnboardingFlowProps {
  onStartScan: () => void;
  onBack: () => void;
}

type QuestionId = "system_type" | "data_handled" | "regulations" | "critical_service" | "api_consumers";

interface TileOption {
  value: string;
  label: string;
}

const QUESTIONS: {
  id: QuestionId;
  question: string;
  subtitle?: string;
  type: "single" | "multi" | "textarea";
  options?: TileOption[];
}[] = [
  {
    id: "system_type",
    question: "What kind of system are you scanning?",
    type: "single",
    options: [
      { value: "fintech", label: "Fintech / banking" },
      { value: "healthcare", label: "Healthcare" },
      { value: "ecommerce", label: "E-commerce / retail" },
      { value: "saas", label: "SaaS / enterprise" },
      { value: "government", label: "Government / public sector" },
      { value: "other", label: "Other" },
    ],
  },
  {
    id: "data_handled",
    question: "What does your system handle?",
    subtitle: "Select everything that applies",
    type: "multi",
    options: [
      { value: "financial_transactions", label: "Financial transactions" },
      { value: "customer_personal_data", label: "Customer personal data" },
      { value: "authentication_identity", label: "Authentication and identity" },
      { value: "medical_health", label: "Medical or health records" },
      { value: "internal_operations", label: "Internal operations only" },
      { value: "third_party", label: "Third-party integrations" },
    ],
  },
  {
    id: "regulations",
    question: "What regulations does your system fall under?",
    subtitle: "Select all that apply — or None if uncertain",
    type: "multi",
    options: [
      { value: "pci", label: "PCI-DSS" },
      { value: "hipaa", label: "HIPAA" },
      { value: "gdpr", label: "GDPR" },
      { value: "soc2", label: "SOC 2" },
      { value: "iso27001", label: "ISO 27001" },
      { value: "none", label: "None / Unsure" },
    ],
  },
  {
    id: "critical_service",
    question: "In a few words, what does your most critical service do?",
    subtitle: "This helps SPECTRE understand your business context",
    type: "textarea",
  },
  {
    id: "api_consumers",
    question: "Who consumes your APIs?",
    subtitle: "Select all that apply",
    type: "multi",
    options: [
      { value: "public_internet", label: "Public internet users" },
      { value: "mobile_apps", label: "Mobile applications" },
      { value: "partner_apis", label: "Partner APIs" },
      { value: "internal_services", label: "Internal services only" },
      { value: "admin_ops", label: "Admin and operations teams" },
      { value: "third_party_vendors", label: "Third-party vendors" },
    ],
  },
];

const defaultAnswers: Record<QuestionId, string | string[]> = {
  system_type: "",
  data_handled: [],
  regulations: [],
  critical_service: "",
  api_consumers: [],
};

const SUMMARY_LABELS: Record<QuestionId, string> = {
  system_type: "System type",
  data_handled: "Data handled",
  regulations: "Regulations",
  critical_service: "Critical service",
  api_consumers: "API consumers",
};

const OnboardingFlow = ({ onStartScan, onBack }: OnboardingFlowProps) => {
  const { refresh } = useSpectreData();
  const [step, setStep] = useState(0); // 0-4 = questions, 5 = summary
  const [answers, setAnswers] = useState<Record<QuestionId, string | string[]>>({ ...defaultAnswers });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const totalQ = QUESTIONS.length;
  const isSummary = step === totalQ;
  const currentQ = !isSummary ? QUESTIONS[step] : null;

  const handleSingleSelect = (value: string) => {
    if (!currentQ) return;
    setAnswers((prev) => ({ ...prev, [currentQ.id]: value }));
  };

  const handleMultiSelect = (value: string) => {
    if (!currentQ) return;
    const current = (answers[currentQ.id] as string[]) || [];

    if (currentQ.id === "regulations") {
      if (value === "none") {
        setAnswers((prev) => ({ ...prev, [currentQ.id]: ["none"] }));
        return;
      }
      const filtered = current.filter((v) => v !== "none");
      if (filtered.includes(value)) {
        setAnswers((prev) => ({ ...prev, [currentQ.id]: filtered.filter((v) => v !== value) }));
      } else {
        setAnswers((prev) => ({ ...prev, [currentQ.id]: [...filtered, value] }));
      }
      return;
    }

    if (current.includes(value)) {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: current.filter((v) => v !== value) }));
    } else {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: [...current, value] }));
    }
  };

  const handleTextChange = (value: string) => {
    if (!currentQ) return;
    if (value.length <= 200) {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: value }));
    }
  };

  const canContinue = () => {
    if (!currentQ) return true;
    const val = answers[currentQ.id];
    if (currentQ.type === "single") return !!val;
    if (currentQ.type === "multi") return Array.isArray(val) && val.length > 0;
    if (currentQ.type === "textarea") return typeof val === "string" && val.length >= 10;
    return true;
  };

  const goNext = () => {
    if (step < totalQ) setStep(step + 1);
  };

  const goPrev = () => {
    if (step > 0) setStep(step - 1);
    else onBack();
  };

  const goToQuestion = (idx: number) => setStep(idx);

  const getDisplayValue = (id: QuestionId): string => {
    const val = answers[id];
    const q = QUESTIONS.find((qq) => qq.id === id);
    if (typeof val === "string") return val;
    if (Array.isArray(val) && q?.options) {
      return val.map((v) => q.options!.find((o) => o.value === v)?.label || v).join(" · ");
    }
    return "";
  };

  const handleSubmitOnboarding = async () => {
    setIsSubmitting(true);
    
    try {
      const result = await postOnboarding(answers as Record<string, unknown>);
      
      if (result.status === "ok") {
        toast({
          title: "Success",
          description: "Onboarding data saved successfully",
        });
        await refresh();
        onStartScan();
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (error) {
      console.error("Error submitting onboarding:", error);
      toast({
        title: "Error",
        description: "Failed to save onboarding data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen animate-spectre-fade-in">
      <NavBar />
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        {/* Progress bar */}
        <div className="mb-2 h-0.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-[#E24B4A] transition-all duration-500"
            style={{ width: `${((isSummary ? totalQ : step) / totalQ) * 100}%` }}
          />
        </div>
        <div className="mb-8 flex items-center justify-between">
          <button onClick={goPrev} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>
          <span className="text-xs text-muted-foreground">
            {isSummary ? "Summary" : `Question ${step + 1} of ${totalQ}`}
          </span>
        </div>

        {/* Question screens */}
        {!isSummary && currentQ && (
          <div className="animate-spectre-fade-in" key={currentQ.id}>
            <div className="text-[11px] font-medium text-[#E24B4A] mb-2">Q{step + 1}</div>
            <h2 className="text-2xl font-medium tracking-tight text-foreground mb-2">{currentQ.question}</h2>
            {currentQ.subtitle && <p className="text-sm text-muted-foreground mb-8">{currentQ.subtitle}</p>}
            {!currentQ.subtitle && <div className="mb-8" />}

            {/* Tile options */}
            {currentQ.type !== "textarea" && currentQ.options && (
              <div className="grid grid-cols-2 gap-2.5 mb-10">
                {currentQ.options.map((opt) => {
                  const isSelected = currentQ.type === "single"
                    ? answers[currentQ.id] === opt.value
                    : (answers[currentQ.id] as string[])?.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => currentQ.type === "single" ? handleSingleSelect(opt.value) : handleMultiSelect(opt.value)}
                      className={`relative rounded-xl border p-4 text-left text-sm transition-all ${
                        isSelected
                          ? "border-[#E24B4A] border-[1.5px] bg-[#E24B4A]/5"
                          : "border-border bg-card hover:border-foreground/20"
                      }`}
                    >
                      <span className="text-foreground">{opt.label}</span>
                      {isSelected && currentQ.type === "multi" && (
                        <div className="absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#E24B4A]">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Textarea */}
            {currentQ.type === "textarea" && (
              <div className="mb-10">
                <textarea
                  value={answers[currentQ.id] as string}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder="e.g. processes customer payments and manages bank account balances"
                  className="w-full rounded-xl border border-input-border bg-input p-4 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none h-32 focus:ring-1 focus:ring-ring"
                />
                <div className="mt-1 text-right text-[11px] text-muted-foreground">
                  {(answers[currentQ.id] as string).length} / 200
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={goNext}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip this question →
              </button>
              <button
                onClick={goNext}
                disabled={!canContinue()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Summary screen */}
        {isSummary && (
          <div className="animate-spectre-fade-in">
            <h2 className="text-2xl font-medium tracking-tight text-foreground mb-2">
              Here is what SPECTRE knows about your system
            </h2>
            <p className="text-sm text-muted-foreground mb-8">Review your answers before starting the scan.</p>

            <div className="space-y-1 mb-10">
              {QUESTIONS.map((q, i) => (
                <div key={q.id} className="flex items-start justify-between rounded-xl border border-border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground mb-0.5">{SUMMARY_LABELS[q.id]}</div>
                    <div className="text-sm text-foreground">{getDisplayValue(q.id)}</div>
                  </div>
                  <button
                    onClick={() => goToQuestion(i)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-3 shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>

            <p className="mb-6 text-[11px] text-muted-foreground">
              These answers are used to compute importance scores for your APIs after discovery. They are not sent anywhere outside your environment.
            </p>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(totalQ - 1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Edit answers
              </button>
              <button
                onClick={handleSubmitOnboarding}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E24B4A] px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Saving..." : "Start scan"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow;
