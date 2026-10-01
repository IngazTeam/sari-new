import { useEffect, useRef, useState } from "react";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import {
  VirtualAgentReview,
  type TeamReview,
} from "@/components/merchant/VirtualAgentReview";
import { agentDraft } from "@shared/virtual-agent-review";
import {
  discardVirtualTeamDraft,
  readVirtualTeamDraft,
  writeVirtualTeamDraft,
} from "@/lib/virtual-team-draft";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  virtualTeamSaveInput,
  virtualTeamSaveReceipt,
  type VirtualTeamSaveInput,
  type VirtualTeamSaveReceipt,
} from "@shared/virtual-team-save";
import {
  AssistantReplyPreview,
  type PreviewSelection,
} from "@/components/merchant/AssistantReplyPreview";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Pencil,
  Trash2,
  Save,
  Sparkles,
  X,
  Clock,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AgentAvatar, AVATAR_OPTIONS } from "@/components/AgentAvatars";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import {
  emptyVirtualAgent,
  parseAgentKeywords,
  validateVirtualAgent,
  virtualAgentTones,
  type VirtualAgentDraft,
} from "../../../../shared/virtual-agent-form";

import {
  agentLocalTime,
  moveAgentIds,
  isAgentOnShift,
} from "@shared/virtual-agent-routing";

export default function VirtualTeamPage() {
  return (
    <KnowledgeWorkspaceScope slot="virtual-team">
      {key => <VirtualTeamWorkspace key={key} scopeKey={key} />}
    </KnowledgeWorkspaceScope>
  );
}

export function VirtualTeamWorkspace({ scopeKey }: { scopeKey: string }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const query = trpc.virtualAgents.listReview.useQuery();
  type Agent = NonNullable<typeof query.data>["agents"][number];
  const alive = useRef(true);
  const cacheEpoch = useRef(knowledgeCacheEpoch());
  const [recovery, setRecovery] = useState(() =>
    readVirtualTeamDraft(scopeKey)
  );
  const [storageFailed, setStorageFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState<VirtualTeamSaveInput | undefined>();
  const [saveReceipt, setSaveReceipt] = useState<VirtualTeamSaveReceipt | null>(
    null
  );
  const [receiptState, setReceiptState] = useState<
    "idle" | "missing" | "error"
  >("idle");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptLock = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [revision, setRevision] = useState("");
  const [base, setBase] = useState<VirtualAgentDraft>({ ...emptyVirtualAgent });
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<TeamReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [deleteRevision, setDeleteRevision] = useState("");
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<VirtualAgentDraft>({ ...emptyVirtualAgent });
  const [keywords, setKeywords] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof validateVirtualAgent>>(
    {}
  );
  const [tab, setTab] = useState<"identity" | "routing">("identity");
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [filter, setFilter] = useState("");
  const [saveError, setSaveError] = useState(false);
  const saveLock = useRef(false);
  const initialDraft = useRef("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [routingMessage, setRoutingMessage] = useState("");
  const [routingTime, setRoutingTime] = useState(agentLocalTime);
  const [preview, setPreview] = useState<{
    selection: PreviewSelection;
    question?: string;
    name?: string;
  } | null>(null);
  const previewBusy = useRef(false);
  const reorder = trpc.virtualAgents.reorder.useMutation({
    onSuccess: () => {
      if (!alive.current) return;
      void query.refetch();
      toast.success(t("virtualTeamUx.reordered"));
    },
    onError: () => {
      if (alive.current) setActionError(true);
    },
  });
  const saved = (value: unknown, submittedInput = attempt) => {
    if (!alive.current || cacheEpoch.current !== knowledgeCacheEpoch()) return;
    const parsed = virtualTeamSaveReceipt.safeParse(value);
    if (
      !submittedInput ||
      !parsed.success ||
      parsed.data.actorId !== Number(scopeKey.split(":")[0]) ||
      parsed.data.merchantId !== submittedInput.merchantId ||
      parsed.data.requestId !== submittedInput.requestId ||
      parsed.data.reviewedRevision !== submittedInput.expectedRevision ||
      parsed.data.operation !==
        (submittedInput.editing === null ? "create" : "update") ||
      (submittedInput.editing !== null &&
        parsed.data.personaId !== submittedInput.editing)
    ) {
      setReceiptState("error");
      return;
    }
    const removed = discardVirtualTeamDraft(scopeKey, cacheEpoch.current);
    setRecovery(removed ? { state: "missing" } : { state: "unavailable" });
    setSaveReceipt(parsed.data);
    setAttempt(undefined);
    setSubmitted(false);
    void utils.virtualAgents.listReview.invalidate();
    void utils.virtualAgents.list.invalidate();
    setOpen(false);
    setSaveError(false);
    toast.success(t("virtualTeamUx.saved"));
  };
  const failed = (error?: { data?: { code?: string } | null }) => {
    if (!alive.current || cacheEpoch.current !== knowledgeCacheEpoch()) return;
    if (error?.data?.code === "CONFLICT") {
      cacheDraft(false);
      setAttempt(undefined);
      setRestored(false);
      setSubmitted(false);
      setConflict(true);
      setReview(null);
    } else {
      setSaveError(true);
      if (
        ["BAD_REQUEST", "FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(
          error?.data?.code ?? ""
        )
      ) {
        cacheDraft(false);
        setSubmitted(false);
        setAttempt(undefined);
      }
    }
  };
  const saveReviewed = trpc.virtualAgents.saveReviewed.useMutation({
    onSuccess: (result, input) => saved(result, input),
    onError: failed,
    onSettled: () => {
      saveLock.current = false;
    },
  });
  const remove = trpc.virtualAgents.delete.useMutation({
    onSuccess: () => {
      if (!alive.current) return;
      setDeleting(null);
      void query.refetch();
      toast.success(t("virtualTeamUx.deleted"));
    },
    onError: () => {
      if (alive.current) {
        setDeleting(null);
        setActionError(true);
      }
    },
  });
  const seed = trpc.virtualAgents.seedTemplates.useMutation({
    onSuccess: () => {
      if (!alive.current) return;
      void query.refetch();
    },
    onError: () => {
      if (alive.current) setActionError(true);
    },
  });
  const busy = saveReviewed.isPending || reviewBusy || receiptBusy;
  const agents = query.data?.agents || [];
  const canManage = !!query.data?.canManage && !query.isError && !actionError;
  const canPreview = !!query.data?.canManage && !query.isError;
  const dirty =
    JSON.stringify(form) !== initialDraft.current || !!keywords.trim();
  function cacheDraft(
    wasSubmitted = submitted,
    currentForm = form,
    currentKeywords = keywords,
    currentAttempt = attempt
  ) {
    const ok = writeVirtualTeamDraft(
      scopeKey,
      {
        editing,
        revision,
        base,
        form: currentForm,
        keywords: currentKeywords,
        tab,
        submitted: wasSubmitted,
        ...(wasSubmitted && currentAttempt ? { attempt: currentAttempt } : {}),
      },
      cacheEpoch.current
    );
    setStorageFailed(!ok);
    return ok;
  }
  useEffect(() => {
    if (open && revision && (dirty || submitted)) cacheDraft();
  }, [
    open,
    revision,
    dirty,
    submitted,
    form,
    keywords,
    tab,
    base,
    editing,
    scopeKey,
    attempt,
  ]);
  useEffect(() => {
    if (!open || (!dirty && !submitted) || !storageFailed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty, submitted, storageFailed]);
  function restoreDraft() {
    if (recovery.state !== "ready" || !canManage) return;
    const value = recovery.value;
    setEditing(value.editing);
    setRevision(value.revision);
    setBase(value.base);
    setForm(value.form);
    setKeywords(value.keywords);
    setTab(value.tab);
    setSubmitted(value.submitted);
    setAttempt(value.attempt);
    setReceiptState("idle");
    initialDraft.current = JSON.stringify(value.base);
    setErrors({});
    setSaveError(false);
    setRestored(true);
    setConflict(!value.submitted);
    setReview(null);
    setReviewError(false);
    setConfirmDiscard(false);
    setOpen(true);
    setRecovery({ state: "missing" });
  }
  function discardDraft() {
    const removed = discardVirtualTeamDraft(scopeKey, cacheEpoch.current);
    setStorageFailed(!removed);
    setRecovery(removed ? { state: "missing" } : { state: "unavailable" });
    setSubmitted(false);
    setAttempt(undefined);
    setReceiptState("idle");
  }
  async function recoverSave() {
    if (
      !attempt ||
      receiptLock.current ||
      saveLock.current ||
      !canManage ||
      cacheEpoch.current !== knowledgeCacheEpoch()
    )
      return;
    receiptLock.current = true;
    setReceiptBusy(true);
    setReceiptState("idle");
    try {
      const result = await utils.virtualAgents.getSaveReceipt.fetch(
        {
          merchantId: attempt.merchantId,
          requestId: attempt.requestId,
        },
        { staleTime: 0 }
      );
      if (!alive.current || cacheEpoch.current !== knowledgeCacheEpoch())
        return;
      if (result) saved(result, attempt);
      else setReceiptState("missing");
    } catch {
      if (alive.current && cacheEpoch.current === knowledgeCacheEpoch())
        setReceiptState("error");
    } finally {
      receiptLock.current = false;
      if (alive.current) setReceiptBusy(false);
    }
  }
  function retrySave() {
    if (
      !attempt ||
      receiptState !== "missing" ||
      busy ||
      saveLock.current ||
      receiptLock.current ||
      !canManage ||
      cacheEpoch.current !== knowledgeCacheEpoch()
    )
      return;
    saveLock.current = true;
    setReceiptState("idle");
    setSaveError(false);
    saveReviewed.mutate(attempt);
  }
  async function loadReview() {
    if (reviewBusy) return;
    setReviewBusy(true);
    setReviewError(false);
    try {
      const result = await query.refetch();
      if (!alive.current) return;
      if (result.error || !result.data) throw Error("unavailable");
      setReview(result.data);
    } catch {
      if (alive.current) setReviewError(true);
    } finally {
      if (alive.current) setReviewBusy(false);
    }
  }
  async function refreshActions() {
    setReviewBusy(true);
    try {
      const result = await query.refetch();
      if (alive.current && !result.error && result.data) setActionError(false);
    } catch {
      /* Keep actions blocked until a successful explicit refresh. */
    } finally {
      if (alive.current) setReviewBusy(false);
    }
  }
  const validRoutingTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(routingTime);
  const routingAvailable = validRoutingTime
    ? agents.filter(
        agent =>
          agent.isActive &&
          isAgentOnShift(agent.shiftStart, agent.shiftEnd, routingTime)
      ).length
    : 0;
  function edit(agent?: Agent) {
    if (!canManage || !query.data) return;
    if (recovery.state !== "missing") {
      document.getElementById("persona-draft-recovery")?.focus();
      return;
    }
    setSubmitted(false);
    setAttempt(undefined);
    setReceiptState("idle");
    setStorageFailed(false);
    setRestored(false);
    setRevision(query.data.revision);
    setConflict(false);
    setReview(null);
    setReviewError(false);
    setEditing(agent?.id ?? null);
    setKeywords("");
    setErrors({});
    setSaveError(false);
    setTab("identity");
    const initial: VirtualAgentDraft = agent
      ? agentDraft(agent)
      : { ...emptyVirtualAgent, triggerKeywords: [] };
    setForm(initial);
    setBase(initial);
    initialDraft.current = JSON.stringify(initial);
    setConfirmDiscard(false);
    setOpen(true);
  }
  const set = <K extends keyof VirtualAgentDraft>(
    key: K,
    value: VirtualAgentDraft[K]
  ) => {
    setForm(old => ({ ...old, [key]: value }));
    setErrors(old => ({ ...old, [key]: undefined }));
    setSaveError(false);
  };
  function addKeyword() {
    const word = keywords.trim();
    if (!word) return;
    const next = parseAgentKeywords([...form.triggerKeywords, word]);
    if (JSON.stringify(next).length > 2000) {
      setErrors(old => ({ ...old, triggerKeywords: "keywords" }));
      return;
    }
    set("triggerKeywords", next);
    setKeywords("");
  }
  function save() {
    if (
      saveLock.current ||
      submitted ||
      conflict ||
      !canManage ||
      !revision ||
      reviewBusy ||
      cacheEpoch.current !== knowledgeCacheEpoch()
    )
      return;
    const draft = {
      ...form,
      triggerKeywords: parseAgentKeywords([
        ...form.triggerKeywords,
        keywords.trim(),
      ]),
    };
    const next = validateVirtualAgent(draft);
    setErrors(next);
    setSaveError(false);
    const first = Object.keys(next)[0];
    if (first) {
      setTab(
        ["shiftStart", "triggerKeywords"].includes(first)
          ? "routing"
          : "identity"
      );
      requestAnimationFrame(() =>
        document.getElementById(`agent-${first}`)?.focus()
      );
      return;
    }
    let input: VirtualTeamSaveInput;
    try {
      input = virtualTeamSaveInput.parse({
        merchantId: Number(scopeKey.split(":")[1]),
        requestId: crypto.randomUUID(),
        editing,
        expectedRevision: revision,
        draft,
      });
    } catch {
      setSaveError(true);
      return;
    }
    setForm(input.draft);
    setKeywords("");
    if (!cacheDraft(true, input.draft, "", input)) {
      cacheDraft(false, input.draft, "");
      setSaveError(true);
      return;
    }
    setAttempt(input);
    setReceiptState("idle");
    setSubmitted(true);
    saveLock.current = true;
    saveReviewed.mutate(input);
  }
  function closeEditor() {
    if (saveLock.current || receiptLock.current) return;
    if (
      submitted ||
      JSON.stringify(form) !== initialDraft.current ||
      keywords.trim()
    )
      setConfirmDiscard(true);
    else setOpen(false);
  }
  const error = (key: keyof VirtualAgentDraft) =>
    errors[key] ? (
      <p
        id={`agent-${key}-error`}
        role="alert"
        className="text-sm text-destructive"
      >
        {t(
          errors[key] === "required"
            ? "virtualTeamUx.required"
            : errors[key] === "tooLong"
              ? "virtualTeamUx.tooLong"
              : errors[key] === "schedule"
                ? "virtualTeamUx.schedule"
                : "virtualTeamUx.keywords"
        )}
      </p>
    ) : null;
  const field = (key: "name" | "role" | "department") => (
    <div className="space-y-2">
      <Label htmlFor={`agent-${key}`}>
        {t(
          key === "name"
            ? "virtualTeamUx.name"
            : key === "role"
              ? "virtualTeamUx.role"
              : "virtualTeamUx.department"
        )}
        {key !== "department" ? " *" : ""}
      </Label>
      <Input
        id={`agent-${key}`}
        autoComplete="off"
        value={form[key]}
        maxLength={100}
        required={key !== "department"}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `agent-${key}-error` : undefined}
        onChange={e => set(key, e.target.value)}
      />
      {error(key)}
    </div>
  );
  if (query.isLoading)
    return (
      <p role="status" className="p-8">
        {t("virtualTeamUx.loading")}
      </p>
    );
  if (query.isError && !open && !query.data)
    return <WorkspaceState kind="error" onRetry={() => void query.refetch()} />;
  return (
    <div className="mx-auto max-w-6xl space-y-6 py-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("virtualTeamUx.eyebrow")}
          </p>
          <h1 className="text-2xl font-bold">{t("virtualTeamUx.title")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {t("virtualTeamUx.description")}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => edit()}
          disabled={!canManage || agents.length >= 10}
        >
          <Plus className="size-4" />
          {t("virtualTeamUx.new")}
        </Button>
      </header>
      {saveReceipt && (
        <section
          role="status"
          className="space-y-2 rounded-xl border bg-muted/30 p-4"
        >
          <h2 className="font-semibold">{t("virtualTeamReceiptUx.saved")}</h2>
          <p className="text-sm">{t("virtualTeamReceiptUx.savedHint")}</p>
          <p className="text-sm">
            {t("virtualTeamReceiptUx.reference")}{" "}
            <bdi className="break-all">{saveReceipt.requestId}</bdi>
          </p>
        </section>
      )}
      {recovery.state !== "missing" && !open && (
        <section
          id="persona-draft-recovery"
          tabIndex={-1}
          role="status"
          className="space-y-3 rounded-xl border bg-muted/30 p-4"
        >
          <h2 className="font-semibold">
            {t(
              recovery.state === "ready" && recovery.value.submitted
                ? "virtualTeamReceiptUx.recoveryTitle"
                : "virtualTeamDraftUx.title"
            )}
          </h2>
          <p>
            {t(
              recovery.state === "ready"
                ? recovery.value.submitted
                  ? "virtualTeamReceiptUx.recoveryFound"
                  : "virtualTeamDraftUx.found"
                : "virtualTeamDraftUx.unavailable"
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {recovery.state === "ready" && (
              <Button
                type="button"
                disabled={!canManage}
                onClick={restoreDraft}
              >
                {t("virtualTeamDraftUx.restore")}
              </Button>
            )}
            {recovery.state === "unavailable" && (
              <Button
                type="button"
                disabled={!canManage}
                onClick={() => {
                  setRecovery({ state: "missing" });
                  setStorageFailed(true);
                }}
              >
                {t("virtualTeamDraftUx.continueWithoutStorage")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={discardDraft}>
              {t("virtualTeamDraftUx.discard")}
            </Button>
          </div>
        </section>
      )}
      {(actionError || query.isError) && (
        <div role="alert" className="space-y-3 rounded-xl border p-4">
          <p>{t("virtualTeamReview.actionChanged")}</p>
          <Button
            type="button"
            variant="outline"
            disabled={reviewBusy}
            onClick={() => void refreshActions()}
          >
            {t("virtualTeamReview.refresh")}
          </Button>
        </div>
      )}
      {query.data && !query.data.canManage && (
        <p className="text-sm text-muted-foreground">
          {t("virtualTeamReview.readOnly")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <Badge variant="secondary">
          {agents.length} / 10 {t("virtualTeamUx.personas")}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {agents.filter(a => a.isActive).length} {t("virtualTeamUx.active")}
        </span>
        <Link
          className="ms-auto text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/merchant/bot-settings"
        >
          {t("virtualTeamUx.assistantSettings")}
        </Link>
        <Link
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/merchant/test-sari"
        >
          {t("virtualTeamUx.test")}
        </Link>
      </div>
      {agents.length > 0 && (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="agent-search">{t("virtualTeamUx.search")}</Label>
          <Input
            id="agent-search"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      )}
      {!agents.length ? (
        <Card>
          <CardContent className="space-y-4 py-12 text-center">
            <Sparkles className="mx-auto size-8 text-primary" />
            <h2 className="text-xl font-semibold">
              {t("virtualTeamUx.empty")}
            </h2>
            <p className="text-muted-foreground">
              {t("virtualTeamUx.templatesDescription")}
            </p>
            <Button
              type="button"
              onClick={() =>
                query.data &&
                seed.mutate({ expectedRevision: query.data.revision })
              }
              disabled={!canManage || seed.isPending}
            >
              {seed.isPending
                ? t("virtualTeamUx.loading")
                : t("virtualTeamUx.templates")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents
            .filter(a =>
              `${a.name} ${a.role} ${a.department || ""}`.includes(filter)
            )
            .map(agent => (
              <Card key={agent.id} className="flex flex-col">
                <div className="flex items-center gap-2 px-5 pt-4">
                  <span className="text-xs text-muted-foreground flex-1">
                    {t("virtualTeamUx.order")}{" "}
                    {agents.findIndex(a => a.id === agent.id) + 1}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("virtualTeamUx.moveUp", { name: agent.name })}
                    disabled={
                      !canManage ||
                      reorder.isPending ||
                      agents[0]?.id === agent.id
                    }
                    onClick={() =>
                      reorder.mutate({
                        expectedRevision: query.data!.revision,
                        orderedIds: moveAgentIds(
                          agents.map(a => a.id),
                          agent.id,
                          -1
                        ),
                      })
                    }
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("virtualTeamUx.moveDown", {
                      name: agent.name,
                    })}
                    disabled={
                      !canManage ||
                      reorder.isPending ||
                      agents[agents.length - 1]?.id === agent.id
                    }
                    onClick={() =>
                      reorder.mutate({
                        expectedRevision: query.data!.revision,
                        orderedIds: moveAgentIds(
                          agents.map(a => a.id),
                          agent.id,
                          1
                        ),
                      })
                    }
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <AgentAvatar avatar={agent.avatarEmoji || "default"} />
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words font-semibold">
                        {agent.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {agent.role}
                      </p>
                    </div>
                    {!!agent.isDefault && (
                      <Star
                        className="size-4 text-primary"
                        aria-label={t("virtualTeamUx.default")}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={agent.isActive ? "secondary" : "outline"}>
                      {t(
                        agent.isActive
                          ? "virtualTeamUx.active"
                          : "virtualTeamUx.paused"
                      )}
                    </Badge>
                    <Badge variant="outline">
                      {t(
                        agent.tone === "friendly"
                          ? "virtualTeamUx.tones.friendly"
                          : agent.tone === "professional"
                            ? "virtualTeamUx.tones.professional"
                            : agent.tone === "casual"
                              ? "virtualTeamUx.tones.casual"
                              : agent.tone === "empathetic"
                                ? "virtualTeamUx.tones.empathetic"
                                : "virtualTeamUx.tones.persuasive"
                      )}
                    </Badge>
                    {agent.department && (
                      <Badge variant="outline">{agent.department}</Badge>
                    )}
                  </div>
                  <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {agent.personalityPrompt}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="size-4" />
                    {agent.shiftStart && agent.shiftEnd ? (
                      <span dir="ltr">
                        {agent.shiftStart} – {agent.shiftEnd}
                      </span>
                    ) : (
                      t("virtualTeamUx.always")
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {parseAgentKeywords(agent.triggerKeywords)
                      .slice(0, 4)
                      .map(k => (
                        <Badge key={k} variant="outline">
                          {k}
                        </Badge>
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button
                      type="button"
                      className="min-h-11"
                      variant="outline"
                      aria-label={t("personaPreviewUx.testNamed", {
                        name: agent.name,
                      })}
                      disabled={!canPreview}
                      onClick={() =>
                        setPreview({
                          selection: { mode: "manual", agentId: agent.id },
                          name: agent.name,
                        })
                      }
                    >
                      {t("personaPreviewUx.test")}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      variant="outline"
                      onClick={() => edit(agent)}
                      disabled={!canManage}
                      aria-label={`${t("virtualTeamUx.edit")} ${agent.name}`}
                    >
                      <Pencil className="size-4" />
                      {t("virtualTeamUx.edit")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        remove.reset();
                        setDeleteRevision(query.data!.revision);
                        setDeleting(agent);
                      }}
                      disabled={!canManage}
                      aria-label={`${t("virtualTeamUx.delete")} ${agent.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          {filter &&
            !agents.some(a =>
              `${a.name} ${a.role} ${a.department || ""}`.includes(filter)
            ) && <p role="status">{t("virtualTeamUx.noResults")}</p>}
        </div>
      )}
      <section className="rounded-xl border bg-muted/30 p-5">
        <h2 className="font-semibold">{t("virtualTeamUx.how")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("virtualTeamUx.howDescription")}
        </p>
      </section>
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">{t("virtualTeamUx.routingPreview")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("virtualTeamUx.routingPreviewHelp")}
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div>
              <Label htmlFor="routing-message">
                {t("virtualTeamUx.customerMessage")}
              </Label>
              <Input
                id="routing-message"
                value={routingMessage}
                maxLength={500}
                onChange={e => setRoutingMessage(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="routing-time">
                {t("virtualTeamUx.riyadhTime")}
              </Label>
              <Input
                id="routing-time"
                type="time"
                value={routingTime}
                aria-invalid={!validRoutingTime}
                aria-describedby={
                  !validRoutingTime ? "routing-time-error" : undefined
                }
                onChange={e => setRoutingTime(e.target.value)}
              />
              {!validRoutingTime && (
                <p
                  id="routing-time-error"
                  role="alert"
                  className="mt-1 text-xs text-destructive"
                >
                  {t("personaPreviewUx.validTime")}
                </p>
              )}
            </div>
          </div>
          <p role="status" className="rounded-xl bg-muted p-4">
            {routingAvailable
              ? t("personaPreviewUx.availableCount", {
                  count: routingAvailable,
                })
              : t("virtualTeamUx.noAvailablePersona")}
          </p>
          <Button
            type="button"
            className="min-h-11"
            disabled={
              !canPreview ||
              !routingAvailable ||
              !routingMessage.trim() ||
              !/^([01]\d|2[0-3]):[0-5]\d$/.test(routingTime)
            }
            onClick={() =>
              setPreview({
                selection: { mode: "automatic", time: routingTime },
                question: routingMessage,
              })
            }
          >
            {t("personaPreviewUx.testRouting")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("personaPreviewUx.routingHelp")}
          </p>
        </CardContent>
      </Card>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!value) closeEditor();
        }}
      >
        <DialogContent
          closeLabel={t("testSariPage.closeDialog")}
          className="mw-team-dialog mw-persona-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="border-b p-5 pe-12 text-start">
            <DialogTitle>
              {t(editing !== null ? "virtualTeamUx.edit" : "virtualTeamUx.new")}
            </DialogTitle>
            <DialogDescription>
              {t("virtualTeamUx.formDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={e => {
              e.preventDefault();
              save();
            }}
          >
            <div
              className="grid min-w-0 grid-cols-2 gap-2 border-b px-3 py-3 sm:px-5"
              aria-label={t("virtualTeamUx.sections")}
            >
              {(["identity", "routing"] as const).map(value => (
                <Button
                  key={value}
                  type="button"
                  className="h-auto min-h-11 min-w-0 whitespace-normal px-2"
                  variant={tab === value ? "secondary" : "ghost"}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {t(
                    value === "identity"
                      ? "virtualTeamUx.identity"
                      : "virtualTeamUx.routing"
                  )}
                </Button>
              ))}
            </div>
            <fieldset
              disabled={busy || submitted}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5"
            >
              {conflict && (
                <div className="mb-5 space-y-3">
                  <p role="alert" className="text-sm">
                    {t(
                      restored
                        ? "virtualTeamDraftUx.reviewRequired"
                        : "virtualTeamReview.changed"
                    )}
                  </p>
                  {reviewError && (
                    <p role="alert" className="text-sm text-destructive">
                      {t("virtualTeamReview.loadFailed")}
                    </p>
                  )}
                  {!review && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={reviewBusy}
                      onClick={() => void loadReview()}
                    >
                      {t("virtualTeamReview.load")}
                    </Button>
                  )}
                  {review && (
                    <VirtualAgentReview
                      key={review.revision}
                      latest={review}
                      editing={editing}
                      base={base}
                      draft={form}
                      onApply={(merged, latest) => {
                        setForm(merged);
                        setBase(latest);
                        setRevision(review.revision);
                        initialDraft.current = JSON.stringify(latest);
                        setConflict(false);
                        setRestored(false);
                        setReview(null);
                        setErrors({});
                      }}
                    />
                  )}
                </div>
              )}
              {tab === "identity" ? (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {field("name")}
                    {field("role")}
                  </div>
                  {field("department")}
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer py-1 text-sm font-medium">
                      {t("virtualTeamUx.avatar")} ·{" "}
                      {AVATAR_OPTIONS.includes(
                        form.avatarEmoji as (typeof AVATAR_OPTIONS)[number]
                      )
                        ? t(
                            form.avatarEmoji === "support"
                              ? "virtualTeamUx.avatars.support"
                              : form.avatarEmoji === "sales"
                                ? "virtualTeamUx.avatars.sales"
                                : form.avatarEmoji === "reception"
                                  ? "virtualTeamUx.avatars.reception"
                                  : form.avatarEmoji === "manager"
                                    ? "virtualTeamUx.avatars.manager"
                                    : form.avatarEmoji === "tech"
                                      ? "virtualTeamUx.avatars.tech"
                                      : form.avatarEmoji === "marketing"
                                        ? "virtualTeamUx.avatars.marketing"
                                        : form.avatarEmoji === "consultant"
                                          ? "virtualTeamUx.avatars.consultant"
                                          : form.avatarEmoji === "creative"
                                            ? "virtualTeamUx.avatars.creative"
                                            : form.avatarEmoji === "analyst"
                                              ? "virtualTeamUx.avatars.analyst"
                                              : form.avatarEmoji === "hr"
                                                ? "virtualTeamUx.avatars.hr"
                                                : form.avatarEmoji === "finance"
                                                  ? "virtualTeamUx.avatars.finance"
                                                  : "virtualTeamUx.avatars.default"
                          )
                        : t("virtualTeamUx.currentAvatar")}
                    </summary>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {AVATAR_OPTIONS.map(avatar => (
                        <button
                          key={avatar}
                          type="button"
                          aria-pressed={form.avatarEmoji === avatar}
                          onClick={() => set("avatarEmoji", avatar)}
                          className={`flex flex-col items-center gap-2 rounded-xl border p-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${form.avatarEmoji === avatar ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}
                        >
                          <AgentAvatar avatar={avatar} size="sm" />
                          {t(
                            avatar === "support"
                              ? "virtualTeamUx.avatars.support"
                              : avatar === "sales"
                                ? "virtualTeamUx.avatars.sales"
                                : avatar === "reception"
                                  ? "virtualTeamUx.avatars.reception"
                                  : avatar === "manager"
                                    ? "virtualTeamUx.avatars.manager"
                                    : avatar === "tech"
                                      ? "virtualTeamUx.avatars.tech"
                                      : avatar === "marketing"
                                        ? "virtualTeamUx.avatars.marketing"
                                        : avatar === "consultant"
                                          ? "virtualTeamUx.avatars.consultant"
                                          : avatar === "creative"
                                            ? "virtualTeamUx.avatars.creative"
                                            : avatar === "analyst"
                                              ? "virtualTeamUx.avatars.analyst"
                                              : avatar === "hr"
                                                ? "virtualTeamUx.avatars.hr"
                                                : avatar === "finance"
                                                  ? "virtualTeamUx.avatars.finance"
                                                  : "virtualTeamUx.avatars.default"
                          )}
                        </button>
                      ))}
                    </div>
                  </details>
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">
                      {t("virtualTeamUx.tone")}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {virtualAgentTones.map(tone => (
                        <Button
                          key={tone}
                          type="button"
                          variant={form.tone === tone ? "secondary" : "outline"}
                          aria-pressed={form.tone === tone}
                          onClick={() => set("tone", tone)}
                        >
                          {t(
                            tone === "friendly"
                              ? "virtualTeamUx.tones.friendly"
                              : tone === "professional"
                                ? "virtualTeamUx.tones.professional"
                                : tone === "casual"
                                  ? "virtualTeamUx.tones.casual"
                                  : tone === "empathetic"
                                    ? "virtualTeamUx.tones.empathetic"
                                    : "virtualTeamUx.tones.persuasive"
                          )}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="space-y-2">
                    <Label htmlFor="agent-personalityPrompt">
                      {t("virtualTeamUx.instructions")} *
                    </Label>
                    <p
                      id="agent-prompt-help"
                      className="text-xs leading-relaxed text-muted-foreground"
                    >
                      {t("virtualTeamUx.instructionsHelp")}
                    </p>
                    <Textarea
                      id="agent-personalityPrompt"
                      rows={5}
                      maxLength={2000}
                      value={form.personalityPrompt}
                      aria-invalid={!!errors.personalityPrompt}
                      aria-describedby={`agent-prompt-help${errors.personalityPrompt ? " agent-personalityPrompt-error" : ""}`}
                      onChange={e => set("personalityPrompt", e.target.value)}
                    />
                    <p className="text-end text-xs text-muted-foreground">
                      {form.personalityPrompt.length} / 2000
                    </p>
                    {error("personalityPrompt")}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="agent-triggerKeywords">
                      {t("virtualTeamUx.keywordsLabel")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("virtualTeamUx.keywordsHelp")}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        id="agent-triggerKeywords"
                        value={keywords}
                        maxLength={100}
                        aria-invalid={!!errors.triggerKeywords}
                        onChange={e => setKeywords(e.target.value)}
                        onKeyDown={e => {
                          if (
                            e.key === "Enter" &&
                            !e.nativeEvent.isComposing &&
                            e.keyCode !== 229
                          ) {
                            e.preventDefault();
                            addKeyword();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addKeyword}
                      >
                        {t("virtualTeamUx.add")}
                      </Button>
                    </div>
                    {error("triggerKeywords")}
                    <div className="flex flex-wrap gap-2">
                      {form.triggerKeywords.map(k => (
                        <Badge key={k} variant="secondary" className="gap-2">
                          {k}
                          <button
                            type="button"
                            className="p-2"
                            aria-label={`${t("virtualTeamUx.delete")} ${k}`}
                            onClick={() =>
                              set(
                                "triggerKeywords",
                                form.triggerKeywords.filter(v => v !== k)
                              )
                            }
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <fieldset className="space-y-3 rounded-xl border p-4">
                    <legend className="px-1 text-sm font-medium">
                      {t("virtualTeamUx.hours")}
                    </legend>
                    <p className="text-sm text-muted-foreground">
                      {t("virtualTeamUx.hoursHelp")}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="agent-shiftStart">
                          {t("virtualTeamUx.from")}
                        </Label>
                        <Input
                          id="agent-shiftStart"
                          type="time"
                          dir="ltr"
                          value={form.shiftStart}
                          aria-invalid={!!errors.shiftStart}
                          aria-describedby={
                            errors.shiftStart
                              ? "agent-shiftStart-error"
                              : undefined
                          }
                          onChange={e => set("shiftStart", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="agent-shiftEnd">
                          {t("virtualTeamUx.to")}
                        </Label>
                        <Input
                          id="agent-shiftEnd"
                          type="time"
                          dir="ltr"
                          value={form.shiftEnd}
                          onChange={e => set("shiftEnd", e.target.value)}
                        />
                      </div>
                    </div>
                    {error("shiftStart")}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        set("shiftStart", "");
                        set("shiftEnd", "");
                      }}
                    >
                      {t("virtualTeamUx.clearHours")}
                    </Button>
                  </fieldset>
                  <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
                    <div>
                      <Label htmlFor="agent-default">
                        {t("virtualTeamUx.default")}
                      </Label>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("virtualTeamUx.defaultHelp")}
                      </p>
                    </div>
                    <Switch
                      id="agent-default"
                      checked={form.isDefault}
                      onCheckedChange={v => set("isDefault", v)}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
                    <div>
                      <Label htmlFor="agent-active">
                        {t("virtualTeamUx.enabled")}
                      </Label>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("virtualTeamUx.enabledHelp")}
                      </p>
                    </div>
                    <Switch
                      id="agent-active"
                      checked={form.isActive}
                      onCheckedChange={v => set("isActive", v)}
                    />
                  </div>
                </div>
              )}
            </fieldset>
            <DialogFooter className="max-h-[45dvh] shrink-0 overflow-y-auto border-t bg-card p-4">
              <div className="w-full space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t("virtualTeamDraftUx.retention")}
                </p>
                {storageFailed && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("virtualTeamReceiptUx.storageRequired")}
                  </p>
                )}
                {submitted && !busy && (
                  <p role="alert" className="text-sm">
                    {t(
                      attempt
                        ? "virtualTeamReceiptUx.unconfirmed"
                        : "virtualTeamDraftUx.unconfirmed"
                    )}
                  </p>
                )}
                {submitted && !busy && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canManage}
                    onClick={() => {
                      if (attempt) void recoverSave();
                      else {
                        setConflict(true);
                        void loadReview();
                      }
                    }}
                  >
                    {t(
                      attempt
                        ? "virtualTeamReceiptUx.recover"
                        : "virtualTeamDraftUx.reviewSaved"
                    )}
                  </Button>
                )}
                {receiptBusy && (
                  <p role="status" className="text-sm">
                    {t("virtualTeamReceiptUx.reading")}
                  </p>
                )}
                {submitted && receiptState === "error" && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("virtualTeamReceiptUx.readFailed")}
                  </p>
                )}
                {submitted && attempt && receiptState === "missing" && (
                  <div className="space-y-2 text-sm">
                    <p role="status">{t("virtualTeamReceiptUx.missing")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !canManage}
                      onClick={retrySave}
                    >
                      {t("virtualTeamReceiptUx.retry")}
                    </Button>
                  </div>
                )}
                {confirmDiscard && (
                  <div
                    role="alert"
                    className="space-y-2 rounded-xl border bg-muted p-3 text-sm"
                  >
                    <p>
                      {t(
                        submitted
                          ? "virtualTeamReceiptUx.discardHint"
                          : "personaPreviewUx.discardHint"
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => setConfirmDiscard(false)}
                      >
                        {t("personaPreviewUx.keepEditing")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => {
                          cacheDraft();
                          setRecovery(readVirtualTeamDraft(scopeKey));
                          setOpen(false);
                          setConfirmDiscard(false);
                        }}
                      >
                        {t("virtualTeamDraftUx.keep")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-h-11"
                        onClick={() => {
                          discardDraft();
                          setOpen(false);
                          setConfirmDiscard(false);
                        }}
                      >
                        {t("personaPreviewUx.discard")}
                      </Button>
                    </div>
                  </div>
                )}
                {saveError && !submitted && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("virtualTeamUx.saveFailed")}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t("virtualTeamUx.requiredHint")}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={closeEditor}
                    >
                      {t("virtualTeamUx.cancel")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={busy || submitted || conflict || !canManage}
                    >
                      <Save className="size-4" />
                      {t(
                        reviewBusy
                          ? "virtualTeamUx.loading"
                          : busy
                            ? "virtualTeamUx.saving"
                            : "virtualTeamUx.save"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={v => {
          if (!v && !remove.isPending) setDeleting(null);
        }}
      >
        <DialogContent
          className="mw-team-dialog"
          closeLabel={t("testSariPage.closeDialog")}
        >
          <DialogHeader>
            <DialogTitle>
              {t("virtualTeamUx.deleteTitle")} {deleting?.name}
            </DialogTitle>
            <DialogDescription>
              {t("virtualTeamUx.deleteHelp")}
            </DialogDescription>
          </DialogHeader>
          {remove.isError && (
            <p role="alert" className="text-destructive">
              {t("virtualTeamUx.saveFailed")}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setDeleting(null)}
            >
              {t("virtualTeamUx.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || !canManage}
              onClick={() =>
                deleting &&
                remove.mutate({
                  id: deleting.id,
                  expectedRevision: deleteRevision,
                })
              }
            >
              {t(
                remove.isPending
                  ? "virtualTeamUx.saving"
                  : "virtualTeamUx.delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={preview !== null}
        onOpenChange={open => {
          if (!open && !previewBusy.current) setPreview(null);
        }}
      >
        <DialogContent
          closeLabel={t("testSariPage.closeDialog")}
          className="mw-team-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
          onInteractOutside={event => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {t("personaPreviewUx.title")}
              {preview?.name ? ` · ${preview.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {t("personaPreviewUx.savedOnly")}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <AssistantReplyPreview
              key={JSON.stringify(preview.selection)}
              enabled={canPreview}
              selection={preview.selection}
              initialQuestion={preview.question}
              onBusyChange={busy => {
                previewBusy.current = busy;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
