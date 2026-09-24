import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Check,
  ArrowRight,
  ChevronDown,
  Sparkles,
  CircleAlert,
  LayoutDashboard,
} from "lucide-react";
import {
  LanguageSwitcher,
  useLanguageDirection,
} from "@/components/LanguageSwitcher";
import { toast } from "sonner";
import "@/styles/merchant-workspace.css";
import "@/styles/merchant-setup.css";

// Import step components
import BusinessTypeStep from "./setup-wizard/BusinessTypeStep";
import TemplatesStep from "./setup-wizard/TemplatesStep";
import BasicInfoStep from "./setup-wizard/BasicInfoStep";
import WebsiteStep from "./setup-wizard/WebsiteStep";
import ProductsServicesStep from "./setup-wizard/ProductsServicesStep";
import PersonalityStep from "./setup-wizard/PersonalityStep";
import LanguageStep from "./setup-wizard/LanguageStep";
import CompleteStep from "./setup-wizard/CompleteStep";
import { useTranslation } from "react-i18next";

import {
  SETUP_STAGE_ENDS,
  setupStageForStep,
  setupStageAvailable,
  completedSetupStage,
} from "@/lib/merchant-setup-navigation";

const TOTAL_STEPS = 10;

function parseJsonArray(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (step): step is number =>
            Number.isInteger(step) && step >= 1 && step <= TOTAL_STEPS
        )
      : [];
  } catch {
    return [];
  }
}

function parseWizardData(
  value: string | null | undefined
): Record<string, any> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function toMinorUnits(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

const OPTIONAL_STAGES = [1];

export default function SetupWizard() {
  const { t } = useTranslation();
  const direction = useLanguageDirection();
  const [, setLocation] = useLocation();
  // Using sonner toast
  const [currentStep, setCurrentStep] = useState(3);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [wizardData, setWizardData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [catalogMode, setCatalogMode] = useState<
    "items" | "website" | "templates"
  >("items");
  const stage = setupStageForStep(currentStep);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const wizardDataRef = useRef<Record<string, any>>({});
  const utils = trpc.useUtils();
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingSavesRef = useRef(0);

  // Load progress
  const {
    data: progress,
    isLoading: loadingProgress,
    isFetching: fetchingProgress,
    isError: progressError,
    refetch,
  } = trpc.setupWizard.getProgress.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });
  const saveProgressMutation = trpc.setupWizard.saveProgress.useMutation();
  const completeSetupMutation = trpc.setupWizard.completeSetup.useMutation();

  // Load saved progress
  useEffect(() => {
    if (fetchingProgress) return;
    if (progress && !progress.isCompleted && !hydratedRef.current) {
      hydratedRef.current = true;
      const restoredData = parseWizardData(progress.wizardData);
      setCurrentStep(
        Math.min(TOTAL_STEPS, Math.max(1, progress.currentStep || 1))
      );
      setCompletedSteps(parseJsonArray(progress.completedSteps));
      setWizardData(restoredData);
      wizardDataRef.current = restoredData;
    } else if (progress?.isCompleted) {
      // Already completed, redirect to dashboard
      setLocation("/merchant/dashboard");
    }
  }, [progress, fetchingProgress]);

  // Serialize writes so an older debounced draft cannot overwrite a newer stage.
  const saveProgress = useCallback(
    (data?: {
      step?: number;
      completed?: number[];
      wData?: Record<string, any>;
    }) => {
      const snapshot = {
        currentStep: data?.step ?? currentStep,
        completedSteps: data?.completed ?? completedSteps,
        wizardData: data?.wData ?? wizardDataRef.current,
      };
      pendingSavesRef.current += 1;
      setIsSaving(true);
      const save = saveQueueRef.current.then(async () => {
        try {
          await saveProgressMutation.mutateAsync(snapshot);
          if (snapshot.wizardData === wizardDataRef.current) {
            setLastSaved(new Date());
            dirtyRef.current = false;
          }
          setSaveError(false);
          return true;
        } catch (error) {
          console.error("Failed to save progress:", error);
          setSaveError(true);
          return false;
        } finally {
          pendingSavesRef.current -= 1;
          setIsSaving(pendingSavesRef.current > 0);
        }
      });
      saveQueueRef.current = save;
      return save;
    },
    [currentStep, completedSteps, saveProgressMutation]
  );

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydratedRef.current || !dirtyRef.current || isLoading) return;
    saveTimerRef.current = setTimeout(() => {
      saveProgress();
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [wizardData, currentStep, isLoading]);

  // Update wizard data
  const updateWizardData = (stepData: Record<string, any>) => {
    // Keep the ref synchronous so an immediate "next" click persists the
    // exact reviewed values even when React batches the state render.
    const next = { ...wizardDataRef.current, ...stepData };
    wizardDataRef.current = next;
    dirtyRef.current = true;
    setWizardData(next);
    setLastSaved(null);
  };

  useEffect(() => {
    setStepsOpen(false);
    if (!loadingProgress) stepHeadingRef.current?.focus();
  }, [stage, loadingProgress]);

  // Keep saved progress compatible with existing ten-step drafts.
  const goToNextStep = () => {
    if (stage >= SETUP_STAGE_ENDS.length - 1) return;
    const completed = completedSetupStage(stage, completedSteps);
    const nextStep = SETUP_STAGE_ENDS[stage + 1];
    setCompletedSteps(completed);
    setCurrentStep(nextStep);
    setCatalogMode("items");
    saveProgress({ step: nextStep, completed });
  };

  const goToStep = (targetStep: number) => {
    const targetStage = setupStageForStep(targetStep);
    if (!setupStageAvailable(targetStage, completedSteps) || isLoading) return;
    const step = SETUP_STAGE_ENDS[targetStage];
    setCurrentStep(step);
    setCatalogMode(targetStep === 4 ? "website" : "items");
    saveProgress({ step });
  };

  const goToPreviousStep = () => {
    if (stage > 0) goToStep(SETUP_STAGE_ENDS[stage - 1]);
  };

  const skipStep = goToNextStep;

  // Complete setup
  const completeSetup = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsLoading(true);
    try {
      // Final confirmation follows any pending draft writes.
      if (!(await saveProgress())) return;
      const latestWizardData = wizardDataRef.current;
      const products = Array.isArray(latestWizardData.products)
        ? latestWizardData.products
        : [];
      const services = Array.isArray(latestWizardData.services)
        ? latestWizardData.services
        : [];
      await completeSetupMutation.mutateAsync({
        businessType: latestWizardData.businessType || "store",
        businessName: latestWizardData.businessName || "",
        phone: latestWizardData.phone || "",
        address: latestWizardData.address || "",
        description: latestWizardData.description || "",
        workingHoursType: latestWizardData.workingHoursType || "24_7",
        workingHours: latestWizardData.workingHours,
        botTone: latestWizardData.botTone || "friendly",
        botLanguage: latestWizardData.botLanguage || "ar",
        welcomeMessage: latestWizardData.welcomeMessage || "",
        products: products
          .filter((p: any) => p?.name?.trim())
          .map((p: any) => ({
            name: p.name,
            description: p.description || "",
            priceMinor: toMinorUnits(p.price),
            currency: p.currency || "SAR",
            imageUrl: p.imageUrl || "",
            productUrl: p.productUrl || "",
            category: p.category || "",
          })),
        services: services
          .filter((s: any) => s?.name?.trim())
          .map((s: any) => ({
            name: s.name,
            description: s.description || "",
            priceMinor: toMinorUnits(s.price),
          })),
        websiteAnalysis:
          latestWizardData.websiteAnalysis?.confirmed &&
          latestWizardData.websiteAnalysis?.websiteUrl
            ? {
                websiteUrl: latestWizardData.websiteAnalysis.websiteUrl,
                platform:
                  latestWizardData.websiteAnalysis.platform || "unknown",
              }
            : undefined,
      });

      await Promise.all([
        utils.merchants.getCurrent.invalidate(),
        utils.merchants.getOnboardingStatus.invalidate(),
        utils.products.list.invalidate(),
        utils.services.list.invalidate(),
      ]);
      toast.success(t("setupWizardPage.text10"));

      setLocation("/merchant/dashboard");
    } catch (error: any) {
      toast.error(
        error?.data?.code === "BAD_REQUEST"
          ? error.message
          : t("setupWorkspace.completeFailed")
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingProgress || !hydratedRef.current || progressError) {
    return (
      <div
        className="merchant-workspace merchant-setup ms-loading"
        dir={direction}
      >
        <div role={progressError ? "alert" : "status"}>
          {progressError ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          <h1>
            {t(
              progressError
                ? "setupWorkspace.loadFailed"
                : "setupWorkspace.loading"
            )}
          </h1>
          {progressError && (
            <Button onClick={() => refetch()}>
              {t("setupWorkspace.retry")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // The review screen is not completion; only completeSetup confirms that.
  const progressPercentage =
    (SETUP_STAGE_ENDS.slice(0, -1).filter(step => completedSteps.includes(step))
      .length /
      SETUP_STAGE_ENDS.length) *
    100;

  // Render current step component
  const renderStep = () => {
    const stepProps = {
      wizardData,
      updateWizardData,
      goToNextStep,
      skipStep,
    };

    switch (stage) {
      case 0:
        return (
          <>
            <BusinessTypeStep {...stepProps} compact />
            <BasicInfoStep {...stepProps} />
          </>
        );
      case 1:
        return (
          <>
            <div
              className="ms-catalog-modes"
              role="group"
              aria-label={t("setupWorkspace.catalogMethod")}
            >
              <Button
                variant={catalogMode === "items" ? "default" : "outline"}
                aria-pressed={catalogMode === "items"}
                onClick={() => setCatalogMode("items")}
              >
                {t("setupWorkspace.manual")}
              </Button>
              <Button
                variant={catalogMode === "website" ? "default" : "outline"}
                aria-pressed={catalogMode === "website"}
                onClick={() => setCatalogMode("website")}
              >
                {t("setupWorkspace.website")}
              </Button>
              <Button
                variant={catalogMode === "templates" ? "default" : "outline"}
                aria-pressed={catalogMode === "templates"}
                onClick={() => setCatalogMode("templates")}
              >
                {t("setupWorkspace.template")}
              </Button>
            </div>
            {catalogMode === "items" && <ProductsServicesStep {...stepProps} />}
            {catalogMode === "website" && (
              <WebsiteStep
                {...stepProps}
                goToNextStep={() => setCatalogMode("items")}
                skipStep={() => setCatalogMode("items")}
              />
            )}
            {catalogMode === "templates" && (
              <TemplatesStep
                {...stepProps}
                goToNextStep={() => setCatalogMode("items")}
                skipStep={() => setCatalogMode("items")}
              />
            )}
          </>
        );
      case 2:
        return (
          <>
            <PersonalityStep {...stepProps} compact />
            <LanguageStep {...stepProps} compact />
          </>
        );
      case 3:
        return (
          <CompleteStep
            {...stepProps}
            goToStep={goToStep}
            completeSetup={completeSetup}
            isLoading={isLoading}
          />
        );
      default:
        return null;
    }
  };

  const titles = [
    t("setupWorkspace.businessTitle"),
    t("setupWorkspace.catalogTitle"),
    t("setupWorkspace.assistantTitle"),
    t("setupWorkspace.reviewTitle"),
  ];
  const descriptions = [
    t("setupWorkspace.businessDescription"),
    t("setupWorkspace.catalogDescription"),
    t("setupWorkspace.assistantDescription"),
    t("setupWorkspace.reviewDescription"),
  ];

  const leaveSetup = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (await saveProgress()) setLocation("/merchant/dashboard");
  };

  return (
    <div className="merchant-workspace merchant-setup" dir={direction}>
      <a href="#setup-main" className="mw-skip">
        {t("setupWorkspace.skipToContent")}
      </a>
      <header className="ms-topbar">
        <div className="mw-brand ms-brand">
          <span className="mw-brand-mark">
            <Sparkles aria-hidden="true" />
          </span>
          <span>
            <strong>{t("setupWorkspace.brand")}</strong>
            <small>{t("setupWorkspace.tagline")}</small>
          </span>
        </div>
        <div className="ms-topbar-actions">
          <LanguageSwitcher variant="compact" />
          <Button
            variant="outline"
            onClick={leaveSetup}
            disabled={isSaving || isLoading}
          >
            <LayoutDashboard aria-hidden="true" />
            {t("setupWorkspace.explore")}
          </Button>
        </div>
      </header>

      <div className="ms-layout">
        <aside className="ms-sidebar">
          <div className="ms-roadmap-intro">
            <span className="ms-eyebrow">{t("setupWorkspace.eyebrow")}</span>
            <h2>{t("setupWorkspace.roadmapTitle")}</h2>
            <p>{t("setupWorkspace.roadmapDescription")}</p>
          </div>
          <div className="ms-progress">
            <div>
              <span>
                {t("setupWorkspace.stepOf", {
                  current: stage + 1,
                  total: SETUP_STAGE_ENDS.length,
                })}
              </span>
              <strong>{Math.round(progressPercentage)}%</strong>
            </div>
            <Progress
              value={progressPercentage}
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("setupWorkspace.progressLabel")}
            />
          </div>
          <button
            type="button"
            className="ms-steps-toggle"
            aria-expanded={stepsOpen}
            aria-controls="setup-steps"
            onClick={() => setStepsOpen(open => !open)}
          >
            <span>{titles[stage]}</span>
            <span>
              {t("setupWorkspace.showSteps")}
              <ChevronDown aria-hidden="true" />
            </span>
          </button>
          <nav
            id="setup-steps"
            className="ms-steps"
            data-open={stepsOpen}
            aria-label={t("setupWorkspace.stepsLabel")}
          >
            <ol>
              {titles.map((title, index) => {
                const step = SETUP_STAGE_ENDS[index];
                const completed = completedSteps.includes(step);
                const available = setupStageAvailable(index, completedSteps);
                return (
                  <li key={step}>
                    <button
                      type="button"
                      onClick={() => goToStep(step)}
                      disabled={!available || isLoading}
                      aria-current={index === stage ? "step" : undefined}
                    >
                      <span className="ms-step-number" aria-hidden="true">
                        {completed && index !== stage ? <Check /> : index + 1}
                      </span>
                      <span className="ms-step-title">
                        {title}
                        {OPTIONAL_STAGES.includes(index) && (
                          <small>{t("setupWorkspace.optional")}</small>
                        )}
                      </span>
                      {completed && (
                        <span className="sr-only">
                          {t("setupWorkspace.completed")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="ms-sidebar-note">
            <Sparkles aria-hidden="true" />
            <p>{t("setupWorkspace.laterHint")}</p>
          </div>
        </aside>

        <main id="setup-main" className="ms-main" tabIndex={-1}>
          <div className="ms-step-meta">
            <span className="ms-eyebrow">
              {t("setupWorkspace.stepOf", {
                current: stage + 1,
                total: SETUP_STAGE_ENDS.length,
              })}
            </span>
            <div className="ms-save-status" role="status" aria-live="polite">
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  {t("setupWizardPage.text13")}
                </>
              ) : saveError ? (
                <>
                  <CircleAlert aria-hidden="true" />
                  <span>{t("setupWorkspace.saveFailed")}</span>
                  <button type="button" onClick={() => saveProgress()}>
                    {t("setupWorkspace.retry")}
                  </button>
                </>
              ) : lastSaved ? (
                <>
                  <Check aria-hidden="true" />
                  {t("setupWizardPage.text14")}
                </>
              ) : (
                <span>{t("setupWorkspace.autosave")}</span>
              )}
            </div>
          </div>
          <div className="ms-heading">
            <h1 ref={stepHeadingRef} tabIndex={-1}>
              {titles[stage]}
            </h1>
            <p>{descriptions[stage]}</p>
          </div>
          <section
            className="ms-panel"
            aria-label={titles[stage]}
            aria-busy={isLoading}
          >
            <fieldset disabled={isLoading} className="ms-step-content min-w-0">
              {renderStep()}
            </fieldset>
          </section>
          <footer className="ms-footer">
            {stage > 0 && (
              <Button
                variant="ghost"
                onClick={goToPreviousStep}
                disabled={isLoading}
              >
                <ArrowRight className="ms-back-arrow" aria-hidden="true" />
                {t("setupWizard.auto_0")}
              </Button>
            )}
            <p>{t("setupWorkspace.reviewHint")}</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
