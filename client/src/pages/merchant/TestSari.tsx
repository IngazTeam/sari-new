import { TestSessionHistory } from "@/components/TestSessionHistory";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readTestSessionReference,
  rememberTestSessionReference,
} from "@/lib/test-session-reference";
import { TestSariSession, loadedTestFeedback } from "@/lib/test-sari-session";
import { cacheTestWorkspaceDraft, readTestWorkspaceDraft, testDraftEpoch } from "@/lib/test-workspace-draft";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { testDealValue } from "@shared/test-sari-workspace";
import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Bot,
  Send,
  RotateCcw,
  User,
  Loader2,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface Scenario {
  id: string;
  title: string;
  description: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export default function TestSari() {
  return (
    <KnowledgeWorkspaceScope slot="test-sari-session">
      {key => <TestSariWorkspace key={key} scopeKey={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function TestSariWorkspace({ scopeKey }: { scopeKey: string }) {
  const { t, i18n } = useTranslation();
  const merchantId = Number(scopeKey.split(":")[1]);
  const [epoch] = useState(knowledgeCacheEpoch);
  const [draftEpoch] = useState(testDraftEpoch);
  const [initialReference] = useState(() => readTestSessionReference(scopeKey));
  const [initialDraft] = useState(() => readTestWorkspaceDraft(scopeKey, initialReference));
  const [storageFailed, setStorageFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<number | null>(null);
  const initialized = useRef(false);
  const loadingOlder = useRef(false);

  const EXAMPLE_SCENARIOS: Scenario[] = [
    {
      id: "price-inquiry",
      title: t("testSariPage.scenarioPriceTitle"),
      description: t("testSariPage.scenarioPriceDesc"),
      messages: [{ role: "user", content: "مرحباً، كم سعر الساعة الذكية؟" }],
    },
    {
      id: "product-search",
      title: t("testSariPage.scenarioSearchTitle"),
      description: t("testSariPage.scenarioSearchDesc"),
      messages: [{ role: "user", content: "عندك عطور رجالية؟" }],
    },
    {
      id: "order-inquiry",
      title: t("testSariPage.scenarioOrderTitle"),
      description: t("testSariPage.scenarioOrderDesc"),
      messages: [{ role: "user", content: "كيف أطلب؟ وكم يستغرق التوصيل؟" }],
    },
    {
      id: "greeting",
      title: t("testSariPage.scenarioGreetingTitle"),
      description: t("testSariPage.scenarioGreetingDesc"),
      messages: [
        { role: "user", content: "السلام عليكم، أول مرة أتعامل معكم" },
      ],
    },
    {
      id: "recommendations",
      title: t("testSariPage.scenarioRecommendTitle"),
      description: t("testSariPage.scenarioRecommendDesc"),
      messages: [{ role: "user", content: "أبغى هدية لصديقي، شو تقترح؟" }],
    },
    {
      id: "complaint",
      title: t("testSariPage.scenarioComplaintTitle"),
      description: t("testSariPage.scenarioComplaintDesc"),
      messages: [
        { role: "user", content: "المنتج اللي طلبته ما وصل، شو السالفة؟" },
      ],
    },
    {
      id: "multi-turn",
      title: t("testSariPage.scenarioMultiTitle"),
      description: t("testSariPage.scenarioMultiDesc"),
      messages: [
        { role: "user", content: "مرحباً" },
        {
          role: "assistant",
          content:
            "أهلاً وسهلاً! أنا ساري، مساعدك الشخصي 😊 كيف أقدر أساعدك اليوم؟",
        },
        { role: "user", content: "عندك ساعات ذكية؟" },
      ],
    },
  ];

  const [inputMessage, setInputMessage] = useState(initialDraft?.message ?? "");
  const [dealValue, setDealValue] = useState(initialDraft?.dealValue ?? "");
  const [dealError, setDealError] = useState(false);
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [scenarioId, setScenarioId] = useState(initialDraft?.scenarioId ?? "");
  const [pendingReset, setPendingReset] = useState<string | null>(null);
  const selectedScenario = EXAMPLE_SCENARIOS.find(s => s.id === scenarioId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const create = trpc.testSari.createConversation.useMutation();
  const save = trpc.testSari.saveMessage.useMutation();
  const send = trpc.testSari.sendMessage.useMutation();
  const deal = trpc.testSari.markAsDeal.useMutation();
  const rate = trpc.testSari.rateReply.useMutation();
  const utils = trpc.useUtils();
  const operations = useRef({ create, save, send, deal, rate, utils });
  operations.current = { create, save, send, deal, rate, utils };
  const [session] = useState(
    () =>
      new TestSariSession({
        create: input => operations.current.create.mutateAsync(input),
        save: input => operations.current.save.mutateAsync(input),
        send: input => operations.current.send.mutateAsync(input),
        deal: input => operations.current.deal.mutateAsync(input),
        rate: input => operations.current.rate.mutateAsync(input),
        readRating: input =>
          operations.current.utils.testSari.feedback.fetch(input),
        transcript: input =>
          operations.current.utils.testSari.transcript.fetch(input),
      })
  );
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const { messages, busy, error, deal: savedDeal, ratingHistory } = state;
  const hasDeal = !!savedDeal;
  const isTyping = busy && send.isPending;
  const disabled = busy || !!error;
  const ratings = loadedTestFeedback(messages);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initialReference) void session.restore(initialReference, merchantId);
  }, [session, initialReference, merchantId]);
  useEffect(() => {
    cacheTestWorkspaceDraft(scopeKey, {
      conversationId: state.conversationId ?? initialReference,
      message: inputMessage, dealValue, scenarioId,
    }, draftEpoch);
  }, [scopeKey, draftEpoch, initialReference, state.conversationId, inputMessage, dealValue, scenarioId]);
  useEffect(() => {
    if (state.conversationId)
      setStorageFailed(
        !rememberTestSessionReference(scopeKey, state.conversationId, epoch)
      );
  }, [state.conversationId, scopeKey, epoch]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (inputMessage.trim() || busy || error) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inputMessage, busy, error]);
  const openSession = async (id: number) => {
    if (await session.restore(id, merchantId)) {
      setInputMessage("");
      setScenarioId("");
      setDealValue("");
      setDealError(false);
      setPendingOpen(null);
    }
  };
  const requestOpen = (id: number) => {
    setShowHistory(false);
    if (inputMessage.trim() || messages.length || error) setPendingOpen(id);
    else void openSession(id);
  };
  const loadOlder = async () => {
    const viewport = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    const height = viewport?.scrollHeight ?? 0,
      top = viewport?.scrollTop ?? 0;
    loadingOlder.current = true;
    await session.loadOlder(merchantId);
    requestAnimationFrame(() => {
      if (viewport) viewport.scrollTop = top + viewport.scrollHeight - height;
      loadingOlder.current = false;
    });
  };
  const handleSendMessage = async () => {
    if (disabled || !inputMessage.trim()) return;
    if (!state.conversationId && !(await session.start())) return;
    const pending = session.send(inputMessage);
    setInputMessage("");
    await pending;
  };
  const replaceSession = async (id: string) => {
    if (await session.start()) {
      const scenario = EXAMPLE_SCENARIOS.find(item => item.id === id);
      setInputMessage(
        scenario ? scenario.messages[scenario.messages.length - 1].content : ""
      );
      setDealValue("");
      setDealError(false);
      setScenarioId(id);
      setShowDealDialog(false);
      setPendingReset(null);
      toast.success(t("testSariPage.resetSuccess"));
    }
  };
  const requestReset = (id: string) => {
    if (busy) return;
    if (messages.length || inputMessage.trim() || error) setPendingReset(id);
    else void replaceSession(id);
  };
  const handleMarkAsDeal = async () => {
    const value = Number(dealValue);
    if (!dealValue.trim() || !testDealValue.safeParse(value).success) {
      setDealError(true);
      return;
    }
    setDealError(false);
    if (await session.markDeal(value)) {
      setShowDealDialog(false);
      setDealValue("");
      toast.success(
        t("testSariPage.dealRecorded", {
          value: session.snapshot().deal?.value.toFixed(2),
        })
      );
    }
  };
  const handleRetry = async () => {
    const failed = state.error;
    if (await session.retry()) {
      if (failed === "restore" && pendingOpen !== null) {
        setPendingOpen(null);
        setInputMessage("");
        setScenarioId("");
      }
      if (failed === "session" && pendingReset !== null) {
        setPendingReset(null);
        setInputMessage("");
        setScenarioId("");
      }
      if (failed === "deal") {
        setShowDealDialog(false);
        setDealValue("");
      }
    }
  };
  const handleRating = async (id: string, rating: "positive" | "negative") => {
    if (await session.rate(id, rating))
      toast.success(t("testSariPage.ratingSaved"));
  };
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (viewport && !loadingOlder.current)
      viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isTyping]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 p-3 sm:p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold">{t("testSariPage.title")}</h1>
            <p className="text-muted-foreground mt-2">
              {t("testSariPage.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setShowHistory(true)}
            >
              {t("testSariPage.savedSessions")}
            </Button>
            <Button
              onClick={() => requestReset("")}
              variant="outline"
              disabled={busy}
            >
              <RotateCcw className="h-4 w-4 ml-2" />
              {t("testSariPage.reset")}
            </Button>
          </div>
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {busy
          ? t("testSariPage.savingStatus")
          : error
            ? t("testSariPage.attentionStatus")
            : state.conversationId
              ? t("testSariPage.readyStatus")
              : t("testSariPage.readyToStart")}
      </div>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="min-w-0 text-sm">
            {state.forbidden
              ? t("testSariPage.accessDenied")
              : error === "restore" || error === "older"
                ? t("testSariPage.historyFailed")
                : error === "rating"
                  ? t(
                      state.ratingConflict
                        ? "testSariPage.ratingConflict"
                        : "testSariPage.ratingFailed"
                    )
                  : error === "session"
                    ? t("testSariPage.sessionFailed")
                    : error === "deal"
                      ? t("testSariPage.saveDealFailed")
                      : error === "reply"
                        ? t("testSariPage.replyFailed")
                        : t("testSariPage.messageSaveFailed")}
          </p>
          <Button
            variant="outline"
            disabled={busy || state.forbidden}
            onClick={
              state.ratingConflict
                ? () => void session.reviewRating()
                : handleRetry
            }
          >
            {t(
              state.ratingConflict
                ? "testSariPage.reviewRating"
                : "testSariPage.retry"
            )}
          </Button>
        </div>
      )}
      {state.ratingSuperseded && (
        <p role="status" className="rounded-2xl border p-4 text-sm">
          {t("testSariPage.ratingSuperseded")}
        </p>
      )}
      {storageFailed && (
        <p role="status" className="text-sm">
          {t("testSariPage.storageUnavailable")}
        </p>
      )}
      {(inputMessage.trim() || dealValue.trim()) && (
        <p className="text-sm text-muted-foreground">{t("testSariPage.draftMemoryHint")}</p>
      )}

      <Card className="flex min-w-0 flex-col gap-0 overflow-hidden rounded-2xl py-0">
        <CardHeader className="border-b bg-muted/50 p-3 [.border-b]:pb-3">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Bot className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{t("testSariPage.sariAI")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("testSariPage.sariDesc")}
              </p>
            </div>
          </div>
        </CardHeader>

        <ScrollArea
          className={
            messages.length
              ? "h-[min(34dvh,340px)] min-h-[180px] p-3 sm:p-4"
              : "p-3 sm:p-4"
          }
          ref={scrollRef}
        >
          <div className="space-y-4">
            {state.nextCursor && (
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => void loadOlder()}
              >
                {t("testSariPage.olderMessages")}
              </Button>
            )}
            {state.restored && (
              <p className="text-xs text-muted-foreground">
                {t("testSariPage.loadedMessages", {
                  loaded: messages.filter(m => m.savedId).length,
                  total: Math.max(
                    state.totalMessages,
                    messages.filter(m => m.savedId).length
                  ),
                })}
              </p>
            )}
            {messages.length === 0 && (
              <p className="rounded-2xl bg-muted p-4 text-sm leading-7">
                {t("testSariPage.welcomeMsg")}
              </p>
            )}
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex min-w-0 flex-col gap-1 max-w-[85%]">
                  <div
                    className={`rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {message.content}
                    </p>
                    {message.role === "assistant" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t(
                          message.source === "guardrail"
                            ? "testSariPage.guardrailSource"
                            : message.source === "model"
                              ? "testSariPage.modelSource"
                              : "testSariPage.unknownSource"
                        )}
                        {message.historyTruncated
                          ? ` · ${t("testSariPage.contextTruncated")}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {message.timestamp.toLocaleTimeString(
                        i18n?.language || "ar",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                    {message.role === "assistant" &&
                      message.source !== "guardrail" &&
                      message.id !== "welcome" && (
                        <TooltipProvider>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={disabled}
                                  className={`h-11 w-11 p-0 ${
                                    message.rating === "positive"
                                      ? "text-green-600 bg-green-100 dark:bg-green-900/30"
                                      : "text-muted-foreground hover:text-green-600"
                                  }`}
                                  onClick={() =>
                                    handleRating(message.id, "positive")
                                  }
                                  aria-label={t(
                                    "merchantUx.actions.positiveFeedback"
                                  )}
                                  aria-pressed={message.rating === "positive"}
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("testSariPage.helpfulResponse")}</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={disabled}
                                  className={`h-11 w-11 p-0 ${
                                    message.rating === "negative"
                                      ? "text-red-600 bg-red-100 dark:bg-red-900/30"
                                      : "text-muted-foreground hover:text-red-600"
                                  }`}
                                  onClick={() =>
                                    handleRating(message.id, "negative")
                                  }
                                  aria-label={t(
                                    "merchantUx.actions.negativeFeedback"
                                  )}
                                  aria-pressed={message.rating === "negative"}
                                >
                                  <ThumbsDown className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("testSariPage.unhelpfulResponse")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      )}
                  </div>
                </div>
                {message.role === "user" && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10">
                      <User className="h-4 w-4 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              maxLength={2000}
              aria-label={t("testSariPage.typePlaceholder")}
              placeholder={t("testSariPage.typePlaceholder")}
              disabled={disabled}
              className="min-w-0 flex-1 text-base"
            />
            <Button
              type="button"
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || disabled}
              aria-label={t("merchantUx.actions.sendMessage")}
              className="h-11 min-w-11 shrink-0"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {" "}
        <Dialog
          open={showDealDialog}
          onOpenChange={open => {
            if (!busy) setShowDealDialog(open);
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant={hasDeal ? "default" : "outline"}
              disabled={
                hasDeal ||
                !state.conversationId ||
                disabled ||
                !messages.some(
                  m => m.role === "assistant" && m.source !== "guardrail"
                )
              }
              className={hasDeal ? "bg-green-600 hover:bg-green-700" : ""}
            >
              <CheckCircle2 className="h-4 w-4 ml-2" />
              {hasDeal
                ? t("testSariPage.dealDone")
                : t("testSariPage.dealButton")}
            </Button>
          </DialogTrigger>
          <DialogContent
            closeLabel={t("testSariPage.closeDialog")}
            showCloseButton={!busy}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>{t("testSariPage.dealDialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("testSariPage.dealDialogDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="dealValue">
                  {t("testSariPage.dealValueLabel")}
                </Label>
                <Input
                  id="dealValue"
                  type="number"
                  placeholder={t("testSariPage.dealValuePlaceholder")}
                  value={dealValue}
                  onChange={e => {
                    setDealValue(e.target.value);
                    setDealError(false);
                  }}
                  disabled={busy || !!error}
                  aria-invalid={dealError}
                  aria-describedby={dealError ? "deal-value-error" : undefined}
                  inputMode="decimal"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                />
                {dealError && (
                  <p
                    id="deal-value-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {t("testSariPage.invalidDealValue")}
                  </p>
                )}
                {error === "deal" && (
                  <div role="alert" className="space-y-2 text-sm">
                    <p>{t("testSariPage.saveDealFailed")}</p>
                    <Button
                      variant="outline"
                      disabled={busy || state.forbidden}
                      onClick={handleRetry}
                    >
                      {t("testSariPage.retry")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setShowDealDialog(false)}
              >
                {t("testSariPage.cancel")}
              </Button>
              <Button disabled={disabled} onClick={handleMarkAsDeal}>
                {t("testSariPage.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {hasDeal && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {t("testSariPage.dealAgreed", {
              value: savedDeal?.value.toFixed(2),
            })}
          </div>
        )}
      </div>
      <details className="rounded-2xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          {t("testSariPage.tryExamples")}
        </summary>
        <div className="mt-3">
          {" "}
          <div className="flex flex-wrap items-center gap-3 bg-muted/50 p-4 rounded-2xl border">
            <Sparkles className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {t("testSariPage.tryExamples")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("testSariPage.chooseScenario")}
              </p>
            </div>
            <Select
              value={scenarioId}
              disabled={busy}
              onValueChange={requestReset}
            >
              <SelectTrigger
                aria-label={t("testSariPage.scenarioLabel")}
                className="w-full sm:w-[250px]"
              >
                <SelectValue placeholder={t("testSariPage.selectScenario")} />
              </SelectTrigger>
              <SelectContent>
                {EXAMPLE_SCENARIOS.map(scenario => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{scenario.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {scenario.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedScenario && selectedScenario.messages.length > 1 && (
            <details className="rounded-2xl border p-4 text-sm">
              <summary className="cursor-pointer font-medium">
                {t("testSariPage.scenarioPreview")}
              </summary>
              <p className="my-3 text-muted-foreground">
                {t("testSariPage.scenarioPreviewHint")}
              </p>
              <ol className="space-y-2">
                {selectedScenario.messages.map((message, index) => (
                  <li key={index} className="rounded-lg bg-muted p-3">
                    {message.content}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </details>
      <details className="rounded-2xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          {t("testSariPage.testingDetails")}
        </summary>
        <div className="space-y-3 pt-3 text-muted-foreground">
          {state.restored && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("testSariPage.restoredHint")}
            </p>
          )}
          <p>{t("testSariPage.testingScope")}</p>
          <p>{t("testSariPage.contextLimit")}</p>
          <p>{t("testSariPage.tipDesc")}</p>
          <p>{t("testSariPage.nextStepDesc")}</p>
        </div>
      </details>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{t("testSariPage.ratingStatsTitle")}</CardTitle>
          <CardDescription>
            {t("testSariPage.loadedRatingScope")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {[
              [t("testSariPage.positiveRatings"), ratings.positive],
              [t("testSariPage.negativeRatings"), ratings.negative],
              [
                t("testSariPage.satisfactionRate"),
                ratings.positive + ratings.negative
                  ? Math.round(
                      (ratings.positive /
                        (ratings.positive + ratings.negative)) *
                        100
                    ) + "%"
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl bg-muted p-3">
                <dt className="break-words">{label}</dt>
                <dd className="mt-2 text-xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {ratings.positive + ratings.negative === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("testSariPage.noRatingsYet")}
            </p>
          )}
          {!!ratingHistory.length && (
            <details>
              <summary className="cursor-pointer text-sm">
                {t("testSariPage.satisfactionTrend")}
              </summary>
              <p className="my-2 text-sm text-muted-foreground">
                {t("testSariPage.satisfactionTrendDesc")}
              </p>
              <ol className="space-y-2 text-sm">
                {ratingHistory.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap justify-between gap-2 border-b py-2"
                  >
                    <span>
                      #{index + 1} ·{" "}
                      {item.timestamp.toLocaleTimeString(
                        i18n?.language || "ar"
                      )}
                    </span>
                    <span>
                      {item.positive} {t("testSariPage.positive")} ·{" "}
                      {item.negative} {t("testSariPage.negative")} ·{" "}
                      {item.satisfactionRate === null
                        ? "—"
                        : item.satisfactionRate + "%"}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </CardContent>
      </Card>
      <TestSessionHistory
        open={showHistory}
        onOpenChange={setShowHistory}
        onSelect={requestOpen}
        merchantId={merchantId}
        currentId={state.conversationId}
      />
      <Dialog
        open={pendingOpen !== null}
        onOpenChange={open => {
          if (!open && !busy) {
            session.cancelRestore();
            setPendingOpen(null);
          }
        }}
      >
        <DialogContent
          closeLabel={t("testSariPage.closeDialog")}
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>{t("testSariPage.openSessionTitle")}</DialogTitle>
            <DialogDescription>
              {t("testSariPage.openSessionHint")}
            </DialogDescription>
          </DialogHeader>
          {error === "restore" && (
            <p role="alert">{t("testSariPage.historyFailed")}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                session.cancelRestore();
                setPendingOpen(null);
              }}
            >
              {t("testSariPage.cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (pendingOpen !== null) void openSession(pendingOpen);
              }}
            >
              {t("testSariPage.openSessionConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div>
        <Dialog
          open={pendingReset !== null}
          onOpenChange={open => {
            if (!open && !busy) setPendingReset(null);
          }}
        >
          <DialogContent
            closeLabel={t("testSariPage.closeDialog")}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>{t("testSariPage.replaceTitle")}</DialogTitle>
              <DialogDescription>
                {t("testSariPage.replaceHint")}
              </DialogDescription>
            </DialogHeader>
            {error === "session" && (
              <p role="alert" className="text-sm text-destructive">
                {t("testSariPage.sessionFailed")}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => setPendingReset(null)}
              >
                {t("testSariPage.cancel")}
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={busy}
                onClick={() => {
                  if (pendingReset !== null) void replaceSession(pendingReset);
                }}
              >
                {t(
                  busy
                    ? "testSariPage.savingStatus"
                    : "testSariPage.replaceConfirm"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
