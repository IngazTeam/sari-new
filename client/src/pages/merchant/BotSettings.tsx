import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { AssistantDraftReview } from "@/components/merchant/AssistantDraftReview";
import { AssistantPersonalityFields } from "@/components/merchant/AssistantPersonalityFields";
import {
  assistantSettingsDraft,
  type AssistantSettingsDraft,
} from "@shared/assistant-settings-draft";
import {
  assistantDraftKey,
  cacheAssistantDraft,
  readAssistantDraft,
  discardAssistantDraft,
  type CachedAssistantDraft,
  assistantDraftEpoch,
} from "@/lib/assistant-draft-cache";
import { AssistantReplyPreview } from "@/components/merchant/AssistantReplyPreview";
import { parseWorkingDays, toggleWorkingDay } from "@shared/bot-working-days";
import { getWorkingScheduleErrors } from "@shared/bot-working-schedule";
import { CheckoutMarginPolicySettings } from "@/components/CheckoutMarginPolicySettings";
import { DiscountPolicySettings } from "@/components/DiscountPolicySettings";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Clock,
  MessageSquare,
  Zap,
  Save,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  Eye,
  Send,
  Users,
  AtSign,
  KeyRound,
  ArrowUpRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  BOT_TEMPLATE_DEFINITIONS,
  resolveTemplate,
} from "@/constants/botTemplates";

import { parseAgentKeywords } from "@shared/virtual-agent-form";

export default function BotSettings() {
  return (
    <KnowledgeWorkspaceScope slot="assistant-settings">
      {scope => <BotSettingsWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}

export function BotSettingsWorkspace({ scope }: { scope: string }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [activeSection, setActiveSection] = useState("basics");

  const initialized = useRef(false);
  const saveLock = useRef(false);
  const alive = useRef(true),
    epoch = useRef(assistantDraftEpoch());
  const [scopeUserId, scopeMerchantId] = scope.split(":").map(Number);
  const current = () =>
    alive.current && epoch.current === assistantDraftEpoch();
  const [submitted, setSubmitted] = useState(false),
    [pending, setPending] = useState(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [reviewSchedule, setReviewSchedule] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [baseline, setBaseline] = useState<AssistantSettingsDraft | null>(null);
  const [revision, setRevision] = useState<string>();
  const [restorable, setRestorable] = useState<CachedAssistantDraft | null>(
    null
  );
  const [conflict, setConflict] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewFailed, setReviewFailed] = useState(false);
  const [latestReview, setLatestReview] = useState<{
    draft: AssistantSettingsDraft;
    revision: string;
  } | null>(null);
  const reviewLock = useRef(false);
  const authQuery = trpc.auth.me.useQuery();

  // Get current settings
  const settingsQuery = trpc.botSettings.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const { data: settings, isLoading } = settingsQuery;
  const canManage =
    !!settings?.canManage &&
    !settingsQuery.isError &&
    !authQuery.isError &&
    settings.merchantId === scopeMerchantId &&
    authQuery.data?.id === scopeUserId;
  const { data: responseStatus } = trpc.botSettings.shouldRespond.useQuery();
  const shouldRespond =
    responseStatus?.merchantId === scopeMerchantId ? responseStatus : undefined;
  const draftKey =
    settings?.merchantId === scopeMerchantId &&
    authQuery.data?.id === scopeUserId
      ? assistantDraftKey(scopeUserId, scopeMerchantId)
      : undefined;

  // Update mutation
  const updateMutation = trpc.botSettings.update.useMutation({
    onSuccess: (result, submitted) => {
      if (!current()) return;
      if (
        result.merchantId !== scopeMerchantId ||
        !/^[a-f0-9]{64}$/.test(result.formRevision || "")
      ) {
        setSubmitted(true);
        setSaveFailed(false);
        setConflict(true);
        setLatestReview(null);
        return;
      }
      setSubmitted(false);
      setSaveFailed(false);
      const saved = assistantSettingsDraft(submitted);
      setBaseline(saved);
      setRevision(result.formRevision);
      setConflict(false);
      setSavedSnapshot(JSON.stringify(saved));
      toast.success(t("botSettingsPage.saveSuccess"));
      utils.botSettings.get.invalidate();
      utils.botSettings.shouldRespond.invalidate();
    },
    onError: error => {
      if (!current()) return;
      const definitive = [
        "CONFLICT",
        "BAD_REQUEST",
        "FORBIDDEN",
        "UNAUTHORIZED",
        "NOT_FOUND",
      ].includes(error.data?.code || "");
      setSubmitted(!definitive);
      if (!definitive) {
        setConflict(true);
        setLatestReview(null);
        setSaveFailed(false);
        return;
      }
      if (error.data?.code === "CONFLICT") {
        setConflict(true);
        toast.error(t("assistantDraftUx.conflict"));
        return;
      }
      setSaveFailed(true);
      toast.error(t("assistantSaveUx.failed"));
    },
    onSettled: () => {
      saveLock.current = false;
      if (current()) setPending(false);
    },
  });

  // Send test message mutation
  const sendTestMutation = trpc.botSettings.sendTestMessage.useMutation({
    onSuccess: (data: any) => {
      if (!current()) return;
      toast.success(data.message);
    },
    onError: (error: any) => {
      if (!current()) return;
      toast.error(error.message);
    },
  });

  // Form state
  const [formData, setFormData] = useState({
    autoReplyEnabled: true,
    workingHoursEnabled: false,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    workingDays: "1,2,3,4,5",
    welcomeMessage: "",
    outOfHoursMessage: "",
    responseDelay: 2,
    maxResponseLength: 200,
    tone: "friendly" as AssistantSettingsDraft["tone"],
    style: "saudi_dialect" as AssistantSettingsDraft["style"],
    emojiUsage: "moderate" as AssistantSettingsDraft["emojiUsage"],
    personalityInstructions: "",
    brandVoice: "",
    language: "ar" as "ar" | "en" | "fr" | "tr" | "es" | "it" | "both",
    // Custom Instructions
    customInstructions: "",
  });

  // Group settings state
  const [groupMode, setGroupMode] = useState<
    "disabled" | "mention_only" | "keyword_only" | "private_redirect"
  >("disabled");
  const [groupKeywords, setGroupKeywords] = useState<string[]>([]);
  const [groupRedirectMessage, setGroupRedirectMessage] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const applyDraft = (draft: AssistantSettingsDraft) => {
    const {
      groupMode: mode,
      groupKeywords: words,
      groupRedirectMessage: redirect,
      customInstructions,
      ...fields
    } = draft;
    setFormData({ ...fields, customInstructions: customInstructions || "" });
    setGroupMode(mode);
    setGroupKeywords(parseAgentKeywords(words));
    setGroupRedirectMessage(redirect);
    setKeywordInput("");
  };

  // Do not initialize from an old query-cache snapshot on return navigation.
  useEffect(() => {
    if (
      settings &&
      draftKey &&
      current() &&
      !settingsQuery.isError &&
      !settingsQuery.isFetching &&
      !initialized.current
    ) {
      initialized.current = true;
      const loaded = assistantSettingsDraft(settings);
      applyDraft(loaded);
      setBaseline(loaded);
      setRevision(settings.formRevision);
      setSavedSnapshot(JSON.stringify(loaded));
      setRestorable(readAssistantDraft(draftKey));
    }
  }, [settings, draftKey, settingsQuery.isFetching]);

  const currentDraft = assistantSettingsDraft({
    ...formData,
    groupMode,
    groupKeywords: JSON.stringify(
      parseAgentKeywords([...groupKeywords, keywordInput])
    ),
    groupRedirectMessage,
    customInstructions: formData.customInstructions || null,
  });
  const currentSnapshot = JSON.stringify(currentDraft);

  useLayoutEffect(() => {
    if (
      !initialized.current ||
      !draftKey ||
      !baseline ||
      !revision ||
      restorable ||
      !current()
    )
      return;
    if (currentSnapshot === savedSnapshot && !submitted)
      discardAssistantDraft(draftKey);
    else
      cacheAssistantDraft(draftKey, {
        base: baseline,
        draft: currentDraft,
        revision,
        section: activeSection,
        submitted,
      });
  }, [
    currentSnapshot,
    savedSnapshot,
    draftKey,
    baseline,
    revision,
    restorable,
    activeSection,
    submitted,
  ]);

  const reviewLatest = async () => {
    if (reviewLock.current || saveLock.current || !current()) return;
    reviewLock.current = true;
    setReviewLoading(true);
    setReviewFailed(false);
    try {
      const result = await settingsQuery.refetch();
      if (!current()) return;
      if (
        result.error ||
        result.data?.merchantId !== scopeMerchantId ||
        !/^[a-f0-9]{64}$/.test(result.data?.formRevision || "")
      )
        throw Error("Unavailable");
      setLatestReview({
        draft: assistantSettingsDraft(result.data),
        revision: result.data.formRevision,
      });
    } catch {
      if (current()) setReviewFailed(true);
    } finally {
      reviewLock.current = false;
      if (current()) setReviewLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !canManage ||
      !current() ||
      saveLock.current ||
      submitted ||
      restorable ||
      conflict ||
      !revision ||
      reviewLoading ||
      latestReview
    )
      return;
    setSaveFailed(false);
    setReviewSchedule(true);
    const errors = getWorkingScheduleErrors(formData);
    if (Object.keys(errors).length) {
      setActiveSection("schedule");
      const id = errors.workingHoursStart
        ? "startTime"
        : errors.workingHoursEnd
          ? "endTime"
          : "workingDays";
      requestAnimationFrame(() => document.getElementById(id)?.focus());
      return;
    }
    saveLock.current = true;
    setSubmitted(true);
    setPending(true);
    if (draftKey && baseline)
      cacheAssistantDraft(draftKey, {
        base: baseline,
        draft: currentDraft,
        revision,
        section: activeSection,
        submitted: true,
      });
    const words = parseAgentKeywords([...groupKeywords, keywordInput]);
    setGroupKeywords(words);
    setKeywordInput("");
    updateMutation.mutate({
      ...currentDraft,
      expectedRevision: revision,
    } as any);
  };

  const scheduleErrors = reviewSchedule
    ? getWorkingScheduleErrors(formData)
    : {};

  const handleWorkingDayToggle = (day: number) => {
    setFormData(old => ({
      ...old,
      workingDays: toggleWorkingDay(old.workingDays, day),
    }));
  };

  const isWorkingDay = (day: number) => {
    return parseWorkingDays(formData.workingDays).includes(day);
  };

  const weekDays = [
    { value: 0, label: t("botSettingsPage.sunday") },
    { value: 1, label: t("botSettingsPage.monday") },
    { value: 2, label: t("botSettingsPage.tuesday") },
    { value: 3, label: t("botSettingsPage.wednesday") },
    { value: 4, label: t("botSettingsPage.thursday") },
    { value: 5, label: t("botSettingsPage.friday") },
    { value: 6, label: t("botSettingsPage.saturday") },
  ];

  if ((settingsQuery.isError || authQuery.isError) && !initialized.current)
    return (
      <WorkspaceState
        kind="error"
        onRetry={() => {
          void settingsQuery.refetch();
          void authQuery.refetch();
        }}
      />
    );
  if (isLoading || !initialized.current) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center">{t("botSettingsPage.loading")}</div>
      </div>
    );
  }

  // Templates resolved from constants
  const allTemplates = BOT_TEMPLATE_DEFINITIONS.map(def =>
    resolveTemplate(def, t)
  );
  const generalTemplates = allTemplates.filter(
    tpl => tpl.category === "general"
  );
  const industryTemplates = allTemplates.filter(
    tpl => tpl.category === "industry"
  );

  const applyTemplate = (template: (typeof allTemplates)[0]) => {
    if (!canManage || restorable || latestReview || reviewLoading || submitted)
      return;
    setFormData({
      ...formData,
      ...template.settings,
    });
    toast.success(
      t("botSettingsPage.templateApplied", { name: template.name })
    );
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          {t("botSettingsPage.title")}
        </h1>
        <p className="text-muted-foreground">{t("botSettingsPage.subtitle")}</p>
      </div>

      {restorable && (
        <Alert className="my-4">
          <AlertDescription className="space-y-3">
            <p>
              {t(
                restorable.submitted
                  ? "assistantSettingsScopeUx.pendingFound"
                  : "assistantDraftUx.restoreHelp"
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canManage}
                onClick={() => {
                  if (!canManage || !current()) return;
                  applyDraft(restorable.draft);
                  setBaseline(restorable.base);
                  setSavedSnapshot(JSON.stringify(restorable.base));
                  setRevision(restorable.revision);
                  setSubmitted(Boolean(restorable.submitted));
                  setConflict(
                    Boolean(restorable.submitted) ||
                      restorable.revision !== settings?.formRevision
                  );
                  setActiveSection(restorable.section);
                  setRestorable(null);
                }}
              >
                {t("assistantDraftUx.restore")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (draftKey) discardAssistantDraft(draftKey);
                  setRestorable(null);
                }}
              >
                {t("assistantDraftUx.discard")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {conflict && (
        <Alert className="my-4" role="alert">
          <AlertDescription className="space-y-3">
            <p>
              {t(
                submitted
                  ? "assistantSettingsScopeUx.uncertain"
                  : "assistantDraftUx.conflict"
              )}
            </p>
            <Button
              type="button"
              onClick={() => void reviewLatest()}
              disabled={reviewLoading}
            >
              {t(
                reviewLoading
                  ? "assistantDraftUx.loading"
                  : "assistantDraftUx.reviewLatest"
              )}
            </Button>
            {reviewFailed && (
              <p role="alert">{t("assistantDraftUx.reviewFailed")}</p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {latestReview && baseline && (
        <AssistantDraftReview
          key={latestReview.revision}
          base={baseline}
          draft={currentDraft}
          latest={latestReview.draft}
          onClose={() => setLatestReview(null)}
          onApply={merged => {
            if (!canManage || !current()) return;
            applyDraft(merged);
            setBaseline(latestReview.draft);
            setSavedSnapshot(JSON.stringify(latestReview.draft));
            setRevision(latestReview.revision);
            setConflict(false);
            setSaveFailed(false);
            setLatestReview(null);
            setSubmitted(false);
          }}
        />
      )}

      <nav
        className="flex flex-wrap gap-2 rounded-xl border bg-card p-2"
        aria-label={t("botSettingsPage.title")}
      >
        {["basics", "schedule", "groups", "sales", "preview"].map(section => (
          <Button
            type="button"
            key={section}
            variant={activeSection === section ? "secondary" : "ghost"}
            aria-pressed={activeSection === section}
            onClick={() => setActiveSection(section)}
          >
            {t(
              section === "basics"
                ? "assistantSectionsUx.basics"
                : section === "schedule"
                  ? "assistantSectionsUx.schedule"
                  : section === "groups"
                    ? "assistantSectionsUx.groups"
                    : section === "sales"
                      ? "assistantSectionsUx.sales"
                      : "assistantSectionsUx.preview"
            )}
          </Button>
        ))}
      </nav>
      {/* Templates Section */}
      <details
        className="rounded-xl border bg-card p-4"
        hidden={activeSection !== "basics"}
      >
        <summary className="cursor-pointer py-2 font-medium">
          {t("botSettingsPage.templatesTitle")}
        </summary>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t("botSettingsPage.templatesTitle")}
            </CardTitle>
            <CardDescription>
              {t("botSettingsPage.templatesDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* General Templates */}
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t("botSettingsPage.generalTemplates")}
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                {generalTemplates.map(template => (
                  <Card
                    key={template.id}
                    className={`border-2 transition-colors ${formData.tone === template.settings.tone ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="text-3xl mb-2">{template.icon}</div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {/* Live example */}
                      <div className="p-3 rounded-lg bg-muted/50 text-sm">
                        <p className="text-xs text-muted-foreground mb-1 font-semibold">
                          {t("assistantSettingsReviewUx.styleExample")}
                        </p>
                        {template.settings.tone === "professional" && (
                          <p className="text-foreground leading-relaxed">
                            {t("assistantSettingsReviewUx.professionalExample")}
                          </p>
                        )}
                        {template.settings.tone === "friendly" && (
                          <p className="text-foreground leading-relaxed">
                            {t("assistantSettingsReviewUx.friendlyExample")}
                          </p>
                        )}
                        {template.settings.tone === "casual" && (
                          <p className="text-foreground leading-relaxed">
                            {t("assistantSettingsReviewUx.casualExample")}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={
                          formData.tone === template.settings.tone
                            ? "default"
                            : "outline"
                        }
                        className="w-full"
                        onClick={() => applyTemplate(template)}
                        disabled={
                          !canManage || Boolean(restorable) || reviewLoading
                        }
                      >
                        {t("assistantSettingsReviewUx.applyToDraft")}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Separator />

            {/* Industry Templates */}
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t("botSettingsPage.industryTemplates")}
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                {industryTemplates.map(template => (
                  <Card
                    key={template.id}
                    className="border-2 hover:border-primary/50 transition-colors"
                  >
                    <CardHeader className="pb-3">
                      <div className="text-3xl mb-2">{template.icon}</div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => applyTemplate(template)}
                        disabled={
                          !canManage || Boolean(restorable) || reviewLoading
                        }
                      >
                        {t("botSettingsPage.text0")}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </details>

      {/* Status Alert */}
      {shouldRespond && (
        <Alert
          className="mb-6"
          variant={shouldRespond.shouldRespond ? "default" : "destructive"}
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {shouldRespond.shouldRespond ? (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <strong>{t("botSettingsPage.botActive")}</strong> -{" "}
                {t("botSettingsPage.botActiveDesc")}
              </span>
            ) : (
              <span>
                <strong>{t("botSettingsPage.botStopped")}</strong> -{" "}
                {shouldRespond.reason === "Auto-reply is disabled"
                  ? t("botSettingsPage.reasonDisabled")
                  : shouldRespond.reason === "Outside working hours"
                    ? t("botSettingsPage.reasonOutsideHours")
                    : t("botSettingsPage.reasonOutsideDays")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground" role="status">
        {pending
          ? t("botSettingsPage.saving")
          : submitted
            ? t("assistantOptionDraftUx.statusUnconfirmed")
            : savedSnapshot && currentSnapshot !== savedSnapshot
              ? t("assistantDraftUx.unsaved")
              : t("assistantSectionsUx.saved")}
      </p>
      {!canManage && (
        <p role="note" className="rounded-xl border p-4 text-sm">
          {t("virtualTeamReview.readOnly")}
        </p>
      )}
      <form
        onSubmit={handleSubmit}
        className="space-y-6"
        onInvalidCapture={event => {
          const input = event.target as HTMLInputElement;
          const section = input.closest<HTMLElement>("[data-assistant-section]")
            ?.dataset.assistantSection;
          if (section) {
            setActiveSection(section);
            requestAnimationFrame(() => input.focus());
          }
        }}
      >
        <fieldset
          disabled={
            !canManage ||
            Boolean(restorable) ||
            reviewLoading ||
            (submitted && !pending)
          }
          className="contents"
        >
          {/* Auto-Reply Toggle */}
          <section
            hidden={activeSection !== "basics"}
            data-assistant-section="basics"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  {t("botSettingsPage.autoReplyTitle")}
                </CardTitle>
                <CardDescription>
                  {t("botSettingsPage.autoReplyDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoReply">
                      {t("botSettingsPage.enableAutoReply")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("botSettingsPage.enableAutoReplyDesc")}
                    </p>
                  </div>
                  <Switch
                    id="autoReply"
                    checked={formData.autoReplyEnabled}
                    onCheckedChange={checked =>
                      setFormData({ ...formData, autoReplyEnabled: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Working Hours */}
          <section
            hidden={activeSection !== "schedule"}
            data-assistant-section="schedule"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t("botSettingsPage.workingHoursTitle")}
                </CardTitle>
                <CardDescription>
                  {t("botSettingsPage.workingHoursDesc")}
                  <span className="block mt-2">
                    {t("setupHoursUx.replyScope")}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="workingHours">
                      {t("botSettingsPage.enableWorkingHours")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("botSettingsPage.enableWorkingHoursDesc")}
                    </p>
                  </div>
                  <Switch
                    id="workingHours"
                    checked={formData.workingHoursEnabled}
                    onCheckedChange={checked =>
                      setFormData({ ...formData, workingHoursEnabled: checked })
                    }
                  />
                </div>

                {(formData.workingHoursEnabled ||
                  Object.keys(scheduleErrors).length > 0) && (
                  <>
                    <Separator />

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startTime">
                          {t("botSettingsPage.startTime")}
                        </Label>
                        <Input
                          id="startTime"
                          type="time"
                          className="min-h-11 text-base"
                          aria-invalid={Boolean(
                            scheduleErrors.workingHoursStart
                          )}
                          aria-describedby={
                            scheduleErrors.workingHoursStart
                              ? "startTime-error"
                              : undefined
                          }
                          value={formData.workingHoursStart}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              workingHoursStart: e.target.value,
                            })
                          }
                        />
                        {scheduleErrors.workingHoursStart && (
                          <p
                            id="startTime-error"
                            className="text-sm text-destructive"
                            role="alert"
                          >
                            {t("assistantSaveUx.time")}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endTime">
                          {t("botSettingsPage.endTime")}
                        </Label>
                        <Input
                          id="endTime"
                          type="time"
                          className="min-h-11 text-base"
                          aria-invalid={Boolean(scheduleErrors.workingHoursEnd)}
                          aria-describedby={
                            scheduleErrors.workingHoursEnd
                              ? "endTime-error"
                              : undefined
                          }
                          value={formData.workingHoursEnd}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              workingHoursEnd: e.target.value,
                            })
                          }
                        />
                        {scheduleErrors.workingHoursEnd && (
                          <p
                            id="endTime-error"
                            className="text-sm text-destructive"
                            role="alert"
                          >
                            {t(
                              scheduleErrors.workingHoursEnd ===
                                "differentTimes"
                                ? "assistantSaveUx.differentTimes"
                                : "assistantSaveUx.time"
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label id="workingDays-label">
                        {t("botSettingsPage.workingDays")}
                      </Label>
                      <div
                        id="workingDays"
                        role="group"
                        tabIndex={-1}
                        aria-labelledby="workingDays-label"
                        aria-invalid={Boolean(scheduleErrors.workingDays)}
                        aria-describedby={
                          scheduleErrors.workingDays
                            ? "workingDays-error"
                            : "workingDays-hint"
                        }
                        className="flex flex-wrap gap-2"
                      >
                        {weekDays.map(day => (
                          <Button
                            key={day.value}
                            type="button"
                            aria-pressed={isWorkingDay(day.value)}
                            variant={
                              isWorkingDay(day.value) ? "default" : "outline"
                            }
                            className="min-h-11"
                            onClick={() => handleWorkingDayToggle(day.value)}
                          >
                            {day.label}
                          </Button>
                        ))}
                      </div>
                      {scheduleErrors.workingDays && (
                        <p
                          id="workingDays-error"
                          className="text-sm text-destructive"
                          role="alert"
                        >
                          {t("assistantSaveUx.days")}
                        </p>
                      )}
                      <p
                        id="workingDays-hint"
                        className="text-sm text-muted-foreground"
                      >
                        {t(
                          formData.workingDays === ""
                            ? "assistantSaveUx.emptyWeek"
                            : "botSettingsPage.clickDayToggle"
                        )}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Messages */}
          <section
            hidden={activeSection !== "schedule"}
            data-assistant-section="schedule"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {t("botSettingsPage.messagesTitle")}
                </CardTitle>
                <CardDescription>
                  {t("botSettingsPage.messagesDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="welcomeMessage">
                    {t("botSettingsPage.welcomeMessage")}
                  </Label>
                  <Textarea
                    id="welcomeMessage"
                    placeholder={t("botSettingsPage.welcomeMessagePlaceholder")}
                    value={formData.welcomeMessage}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        welcomeMessage: e.target.value,
                      })
                    }
                    rows={3}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("botSettingsPage.welcomeMessageDesc")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="outOfHoursMessage">
                    {t("botSettingsPage.outOfHoursMessage")}
                  </Label>
                  <Textarea
                    id="outOfHoursMessage"
                    placeholder={t(
                      "botSettingsPage.outOfHoursMessagePlaceholder"
                    )}
                    value={formData.outOfHoursMessage}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        outOfHoursMessage: e.target.value,
                      })
                    }
                    rows={3}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("botSettingsPage.outOfHoursMessageDesc")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* AI Behavior */}
          <section
            hidden={activeSection !== "basics"}
            data-assistant-section="basics"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  {t("botSettingsPage.aiBehaviorTitle")}
                </CardTitle>
                <CardDescription>
                  {t("botSettingsPage.aiBehaviorDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tone">{t("botSettingsPage.tone")}</Label>
                    <Select
                      value={formData.tone}
                      onValueChange={(value: AssistantSettingsDraft["tone"]) =>
                        setFormData({ ...formData, tone: value })
                      }
                    >
                      <SelectTrigger id="tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">
                          {t("botSettingsPage.toneFriendly")}
                        </SelectItem>
                        <SelectItem value="professional">
                          {t("botSettingsPage.toneProfessional")}
                        </SelectItem>
                        <SelectItem value="casual">
                          {t("botSettingsPage.toneCasual")}
                        </SelectItem>
                        <SelectItem value="enthusiastic">
                          {t("assistantPersonalityUx.enthusiastic")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">
                      {t("botSettingsPage.language")}
                    </Label>
                    <Select
                      value={formData.language}
                      onValueChange={(value: "ar" | "en" | "both") =>
                        setFormData({ ...formData, language: value })
                      }
                    >
                      <SelectTrigger id="language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ar">
                          {t("botSettingsPage.langArabic")}
                        </SelectItem>
                        <SelectItem value="en">
                          {t("botSettingsPage.langEnglish")}
                        </SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="tr">Türkçe</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="it">Italiano</SelectItem>
                        <SelectItem value="both">
                          {t("botSettingsPage.langBoth")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="responseDelay">
                      {t("botSettingsPage.responseDelay")}
                    </Label>
                    <Input
                      id="responseDelay"
                      type="number"
                      min={1}
                      max={10}
                      value={formData.responseDelay}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          responseDelay: parseInt(e.target.value),
                        })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      {t("botSettingsPage.responseDelayDesc")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxLength">
                      {t("botSettingsPage.maxResponseLength")}
                    </Label>
                    <Input
                      id="maxLength"
                      type="number"
                      min={50}
                      max={500}
                      value={formData.maxResponseLength}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          maxResponseLength: parseInt(e.target.value),
                        })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      {t("botSettingsPage.maxResponseLengthDesc")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section
            hidden={activeSection !== "basics"}
            data-assistant-section="personality"
            className="mt-4"
          >
            <AssistantPersonalityFields
              value={formData}
              onChange={fields => setFormData(old => ({ ...old, ...fields }))}
            />
          </section>

          {/* Draft copy and saved-model testing are explicitly separate. */}
          <section
            hidden={activeSection !== "preview"}
            data-assistant-section="preview"
            className="space-y-4"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" aria-hidden="true" />
                  {t("assistantSettingsReviewUx.draftTitle")}
                </CardTitle>
                <CardDescription>
                  {t("assistantSettingsReviewUx.draftHelp")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!formData.autoReplyEnabled ? (
                  <p role="status" className="rounded-xl bg-muted p-4 text-sm">
                    {t("assistantSettingsReviewUx.replyOff")}
                  </p>
                ) : (
                  <>
                    <div className="rounded-xl border p-4">
                      <h3 className="mb-2 text-sm font-medium">
                        {t("botSettingsPage.welcomeMessage")}
                      </h3>
                      <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                        {formData.welcomeMessage ||
                          t("botSettingsPage.previewDefaultWelcome")}
                      </p>
                    </div>
                    {formData.workingHoursEnabled ? (
                      <div className="rounded-xl border bg-muted/30 p-4">
                        <h3 className="mb-2 text-sm font-medium">
                          {t("botSettingsPage.previewOutsideHours")}
                        </h3>
                        <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                          {formData.outOfHoursMessage ||
                            t("botSettingsPage.previewDefaultOutOfHours")}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("assistantSettingsReviewUx.scheduleOff")}
                      </p>
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("assistantSettingsReviewUx.noQualityScore")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  {t("assistantSettingsReviewUx.savedTitle")}
                </CardTitle>
                <CardDescription>
                  {t("personaPreviewUx.savedOnly")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {savedSnapshot !== currentSnapshot && (
                  <p
                    role="note"
                    className="rounded-xl border bg-muted p-3 text-sm"
                  >
                    {t("assistantSettingsReviewUx.unsavedPreview")}
                  </p>
                )}
                <AssistantReplyPreview
                  key={draftKey}
                  enabled={canManage}
                  selection={{ mode: "store" }}
                />
              </CardContent>
            </Card>
          </section>

          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>{t("botSettingsPage.note")}</strong>{" "}
              {t("botSettingsPage.infoNote")}
            </AlertDescription>
          </Alert>

          {/* Smart Groups Card */}
          <section
            hidden={activeSection !== "groups"}
            data-assistant-section="groups"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary text-white">
                    <Users className="h-4 w-4" />
                  </div>
                  {t("assistantSettingsReviewUx.groupsTitle")}
                </CardTitle>
                <CardDescription>
                  {t("assistantSettingsReviewUx.groupsHelp")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    value: "disabled",
                    icon: "🔴",
                    label: t("assistantSettingsReviewUx.groupOff"),
                    desc: t("assistantSettingsReviewUx.groupOffHelp"),
                  },
                  {
                    value: "mention_only",
                    icon: "🟡",
                    label: t("merchantUx.groupConversation.mention"),
                    desc: t("merchantUx.groupConversation.mentionHelp"),
                  },
                  {
                    value: "keyword_only",
                    icon: "🟢",
                    label: t("merchantUx.groupConversation.topics"),
                    desc: t("merchantUx.groupConversation.topicsHelp"),
                  },
                  {
                    value: "private_redirect",
                    icon: "🔵",
                    label: t("merchantUx.groupConversation.private"),
                    desc: t("merchantUx.groupConversation.privateHelp"),
                  },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={groupMode === opt.value}
                    onClick={() => setGroupMode(opt.value as any)}
                    className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                      groupMode === opt.value
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-muted hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{opt.icon}</span>
                      <div>
                        <p className="font-semibold">{opt.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {opt.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Keywords Input — shown when keyword_only */}
                {groupMode === "keyword_only" && (
                  <div className="space-y-3 p-4 rounded-xl bg-muted/50 animate-in slide-in-">
                    <Label
                      htmlFor="bot-group-keyword"
                      className="font-semibold flex items-center gap-2"
                    >
                      <KeyRound className="h-4 w-4" />
                      {t("merchantUx.groupConversation.topicsLabel")}
                    </Label>
                    <div className="flex flex-wrap gap-2 min-h-[40px]">
                      {groupKeywords.map((kw, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-sm flex items-center gap-1 px-3 py-1"
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={() =>
                              setGroupKeywords(prev =>
                                prev.filter((_, idx) => idx !== i)
                              )
                            }
                            aria-label={t("merchantUx.actions.removeNamed", {
                              name: kw,
                            })}
                            className="hover:text-destructive ml-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="bot-group-keyword"
                        value={keywordInput}
                        onChange={e => setKeywordInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && keywordInput.trim()) {
                            e.preventDefault();
                            setGroupKeywords(prev => [
                              ...prev,
                              keywordInput.trim(),
                            ]);
                            setKeywordInput("");
                          }
                        }}
                        placeholder={t(
                          "merchantUx.groupConversation.topicPlaceholder"
                        )}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (keywordInput.trim()) {
                            setGroupKeywords(prev => [
                              ...prev,
                              keywordInput.trim(),
                            ]);
                            setKeywordInput("");
                          }
                        }}
                      >
                        {t("merchantUx.groupConversation.addTopic")}
                      </Button>
                    </div>
                  </div>
                )}

                {groupMode === "private_redirect" && (
                  <p className="rounded-xl border p-4 leading-7">
                    {t("merchantUx.groupConversation.privateNote")}
                  </p>
                )}
                <p className="text-sm text-muted-foreground leading-7">
                  {t("merchantUx.groupConversation.scope")}
                </p>
                <p className="text-sm text-muted-foreground leading-7">
                  {t("merchantUx.groupConversation.continuity")}
                </p>
              </CardContent>
            </Card>
          </section>

          <section
            hidden={activeSection !== "sales"}
            data-assistant-section="sales"
          >
            <DiscountPolicySettings />
          </section>
          <section
            hidden={activeSection !== "sales"}
            data-assistant-section="sales"
          >
            <CheckoutMarginPolicySettings />
          </section>

          {/* Custom Instructions — Campaign & Sales Rules */}
          <section
            hidden={activeSection !== "groups"}
            data-assistant-section="groups"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t("assistantSettingsReviewUx.instructionsTitle")}
                </CardTitle>
                <CardDescription>
                  {t("assistantSettingsReviewUx.instructionsHelp")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customInstructions">
                    {t("assistantSectionsUx.instructionsLabel")}
                  </Label>
                  <Textarea
                    id="customInstructions"
                    value={formData.customInstructions}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        customInstructions: e.target.value.substring(0, 2000),
                      })
                    }
                    placeholder={t(
                      "assistantSectionsUx.instructionsPlaceholder"
                    )}
                    maxLength={2000}
                    className="min-h-[180px] text-right"
                    dir="rtl"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t("assistantSectionsUx.instructionsHelp")}
                    </p>
                    <span
                      className={`text-xs ${formData.customInstructions.length > 1800 ? "text-red-500" : "text-muted-foreground"}`}
                    >
                      {formData.customInstructions.length} / 2000
                    </span>
                  </div>
                </div>

                {formData.customInstructions.trim().length > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted border border-border">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>{t("assistantSectionsUx.instructionsDraft")}</p>
                      <p>{t("assistantSettingsReviewUx.clearInstructions")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <p className="text-sm text-muted-foreground">
            {t("assistantSectionsUx.saveScope")}
          </p>
          {/* Action Buttons */}
          <p
            className="text-xs text-muted-foreground"
            hidden={activeSection === "sales"}
          >
            {t("assistantSettingsReviewUx.testSavedHint")}
          </p>
          {saveFailed && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {t("assistantSaveUx.failed")}
            </p>
          )}
          <div
            className="mw-assistant-savebar sticky bottom-3 z-10 flex flex-wrap justify-between items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
            hidden={activeSection === "sales"}
          >
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => canManage && sendTestMutation.mutate()}
              disabled={
                !canManage ||
                sendTestMutation.isPending ||
                savedSnapshot !== currentSnapshot ||
                updateMutation.isPending ||
                pending ||
                submitted
              }
            >
              <Send className="h-4 w-4 ml-2" />
              {sendTestMutation.isPending
                ? t("botSettingsPage.sendingTest")
                : t("assistantSettingsReviewUx.sendWhatsApp")}
            </Button>

            <Button
              type="submit"
              size="lg"
              disabled={
                !canManage ||
                updateMutation.isPending ||
                pending ||
                submitted ||
                conflict ||
                !revision
              }
            >
              <Save className="h-4 w-4 ml-2" />
              {updateMutation.isPending
                ? t("botSettingsPage.saving")
                : t("botSettingsPage.saveSettings")}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
