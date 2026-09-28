import { useState } from "react";
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
  virtualAgentPayload,
  virtualAgentTones,
  type VirtualAgentDraft,
} from "../../../../shared/virtual-agent-form";

import {
  agentLocalTime,
  moveAgentIds,
  selectVirtualAgent,
} from "@shared/virtual-agent-routing";

export default function VirtualTeamPage() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const query = trpc.virtualAgents.list.useQuery();
  type Agent = NonNullable<typeof query.data>[number];
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
  const [routingMessage, setRoutingMessage] = useState("");
  const [routingTime, setRoutingTime] = useState(agentLocalTime);
  const reorder = trpc.virtualAgents.reorder.useMutation({
    onSuccess: () => {
      void query.refetch();
      toast.success(t("virtualTeamUx.reordered"));
    },
    onError: () => toast.error(t("virtualTeamUx.reorderFailed")),
  });
  const saved = () => {
    void utils.virtualAgents.list.invalidate();
    setOpen(false);
    setSaveError(false);
    toast.success(t("virtualTeamUx.saved"));
  };
  const failed = () => setSaveError(true);
  const create = trpc.virtualAgents.create.useMutation({
    onSuccess: saved,
    onError: failed,
  });
  const update = trpc.virtualAgents.update.useMutation({
    onSuccess: saved,
    onError: failed,
  });
  const remove = trpc.virtualAgents.delete.useMutation({
    onSuccess: () => {
      setDeleting(null);
      void query.refetch();
      toast.success(t("virtualTeamUx.deleted"));
    },
  });
  const seed = trpc.virtualAgents.seedTemplates.useMutation({
    onSuccess: () => {
      void query.refetch();
    },
    onError: () => toast.error(t("virtualTeamUx.saveFailed")),
  });
  const busy = create.isPending || update.isPending;
  const agents = query.data || [];
  const routingPreview = selectVirtualAgent(
    agents,
    routingMessage,
    routingTime
  );
  function edit(agent?: Agent) {
    setEditing(agent?.id ?? null);
    setKeywords("");
    setErrors({});
    setSaveError(false);
    setTab("identity");
    setForm(
      agent
        ? {
            name: agent.name,
            role: agent.role,
            department: agent.department || "",
            personalityPrompt: agent.personalityPrompt,
            tone: agent.tone,
            avatarEmoji: agent.avatarEmoji || "default",
            isDefault: Boolean(agent.isDefault),
            isActive: Boolean(agent.isActive),
            triggerKeywords: parseAgentKeywords(agent.triggerKeywords),
            shiftStart: agent.shiftStart || "",
            shiftEnd: agent.shiftEnd || "",
          }
        : { ...emptyVirtualAgent, triggerKeywords: [] }
    );
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
    const payload = virtualAgentPayload(draft);
    // null explicitly removes an existing shift; undefined leaves it unchanged.
    if (editing !== null)
      update.mutate({
        id: editing,
        ...payload,
        isActive: draft.isActive,
        shiftStart: draft.shiftStart || null,
        shiftEnd: draft.shiftEnd || null,
      });
    else
      create.mutate({
        ...payload,
        shiftStart: draft.shiftStart || undefined,
        shiftEnd: draft.shiftEnd || undefined,
      });
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
  if (query.isError)
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
          disabled={agents.length >= 10}
        >
          <Plus className="size-4" />
          {t("virtualTeamUx.new")}
        </Button>
      </header>
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
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
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
                    disabled={reorder.isPending || agents[0]?.id === agent.id}
                    onClick={() =>
                      reorder.mutate({
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
                      reorder.isPending ||
                      agents[agents.length - 1]?.id === agent.id
                    }
                    onClick={() =>
                      reorder.mutate({
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
                      className="flex-1"
                      variant="outline"
                      onClick={() => edit(agent)}
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
                        setDeleting(agent);
                      }}
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
                onChange={e => setRoutingTime(e.target.value)}
              />
            </div>
          </div>
          <p role="status" className="rounded-xl bg-muted p-4">
            {routingPreview ? (
              <>
                <strong>{routingPreview.agent.name}</strong> ·{" "}
                {t(
                  routingPreview.reason === "keyword"
                    ? "virtualTeamUx.matchKeyword"
                    : routingPreview.reason === "default"
                      ? "virtualTeamUx.matchDefault"
                      : "virtualTeamUx.matchOrder"
                )}
              </>
            ) : (
              t("virtualTeamUx.noAvailablePersona")
            )}
          </p>
        </CardContent>
      </Card>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="mw-persona-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
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
              className="flex gap-2 border-b px-5 py-3"
              aria-label={t("virtualTeamUx.sections")}
            >
              {(["identity", "routing"] as const).map(value => (
                <Button
                  key={value}
                  type="button"
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
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
                          if (e.key === "Enter") {
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
                  {editing !== null && (
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
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="border-t bg-card p-4">
              <div className="w-full space-y-3">
                {saveError && (
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
                      onClick={() => setOpen(false)}
                    >
                      {t("virtualTeamUx.cancel")}
                    </Button>
                    <Button type="submit" disabled={busy}>
                      <Save className="size-4" />
                      {t(busy ? "virtualTeamUx.saving" : "virtualTeamUx.save")}
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
        <DialogContent>
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
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate({ id: deleting.id })}
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
    </div>
  );
}
