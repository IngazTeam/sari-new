import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { AssistantOptionReview } from "@/components/merchant/AssistantOptionReview";
import { useReviewedAssistantOption } from "@/hooks/useReviewedAssistantOption";
import {
  takeoverDraft,
  takeoverDraftSchema,
  takeoverExpiry,
  type TakeoverDraft,
} from "@shared/assistant-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const input = (draft: TakeoverDraft, expectedRevision: string) => ({
  kind: "takeover" as const,
  draft,
  expectedRevision,
});
export default function HumanTakeoverSettings() {
  return (
    <KnowledgeWorkspaceScope slot="human-takeover">
      {key => <TakeoverWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function TakeoverWorkspace() {
  const { t } = useTranslation();
  const form = useReviewedAssistantOption("takeover", takeoverDraft, input);
  const [page, setPage] = useState(1),
    [invalid, setInvalid] = useState(false);
  const listing = trpc.botSettings.takeoverWorkspace.useQuery(
    { page },
    { refetchInterval: 15000 }
  );
  if (!form.draft || !form.base)
    return form.query.isError ? (
      <WorkspaceState kind="error" onRetry={() => void form.query.refetch()} />
    ) : (
      <p role="status">{t("common.loading")}</p>
    );
  const draft = form.draft;
  const labels = {
    takeoverTimeoutMinutes: t("takeoverWorkspaceUx.timeout"),
    takeoverCommandsEnabled: t("humanTakeoverPage.enableCommands"),
  };
  const display = (key: keyof TakeoverDraft, value: number | boolean) =>
    key === "takeoverTimeoutMinutes"
      ? t("takeoverWorkspaceUx.minutes", { count: Number(value) })
      : t(value ? "virtualTeamReview.yes" : "virtualTeamReview.no");
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t("humanTakeoverPage.title")}</h1>
        <p className="max-w-3xl text-muted-foreground">
          {t("takeoverWorkspaceUx.intro")}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("takeoverWorkspaceUx.dashboardTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7">
            {t("takeoverWorkspaceUx.dashboardHelp")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("takeoverWorkspaceUx.whatsappTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7">
            {listing.data
              ? t("takeoverWorkspaceUx.whatsappHelp", {
                  hours: listing.data.directReplyHours,
                })
              : t("takeoverWorkspaceUx.rulesUnavailable")}
          </CardContent>
        </Card>
      </div>
      <p className="rounded-xl border bg-muted/30 p-4 text-sm leading-7">
        {t("takeoverWorkspaceUx.resumeHelp")}
      </p>
      {!form.canManage && (
        <p role="note" className="rounded-xl border p-4 text-sm">
          {t("virtualTeamReview.readOnly")}
        </p>
      )}
      {form.query.isError && (
        <WorkspaceState
          kind="error"
          inline
          onRetry={() => void form.query.refetch()}
        />
      )}
      <form
        noValidate
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          if (!takeoverDraftSchema.safeParse(draft).success) {
            setInvalid(true);
            document.getElementById("takeover-minutes")?.focus();
            return;
          }
          setInvalid(false);
          void form.save();
        }}
      >
        <fieldset
          disabled={!form.canManage || form.busy}
          className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6"
        >
          <legend className="px-2 font-semibold">
            {t("humanTakeoverPage.settingsTitle")}
          </legend>
          <div className="max-w-lg space-y-3">
            <Label htmlFor="takeover-minutes">
              {labels.takeoverTimeoutMinutes}
            </Label>
            <p
              id="takeover-minutes-help"
              className="text-sm text-muted-foreground"
            >
              {t("takeoverWorkspaceUx.timeoutHelp")}
            </p>
            <Input
              id="takeover-minutes"
              type="number"
              min={5}
              max={120}
              step={1}
              value={
                Number.isFinite(draft.takeoverTimeoutMinutes)
                  ? draft.takeoverTimeoutMinutes
                  : ""
              }
              aria-invalid={invalid}
              aria-describedby={
                invalid ? "takeover-minutes-error" : "takeover-minutes-help"
              }
              onChange={e => {
                form.setDraft({
                  ...draft,
                  takeoverTimeoutMinutes:
                    e.target.value === "" ? NaN : Number(e.target.value),
                });
                setInvalid(false);
              }}
            />
            {invalid && (
              <p
                id="takeover-minutes-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {t("takeoverWorkspaceUx.invalidMinutes")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {[5, 15, 30, 60, 120].map(minutes => (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  key={minutes}
                  aria-pressed={draft.takeoverTimeoutMinutes === minutes}
                  onClick={() => {
                    form.setDraft({
                      ...draft,
                      takeoverTimeoutMinutes: minutes,
                    });
                    setInvalid(false);
                  }}
                >
                  {t("takeoverWorkspaceUx.minutes", { count: minutes })}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Label htmlFor="takeover-commands">
                {labels.takeoverCommandsEnabled}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("takeoverWorkspaceUx.commandsHelp")}
              </p>
            </div>
            <Switch
              id="takeover-commands"
              checked={draft.takeoverCommandsEnabled}
              onCheckedChange={checked =>
                form.setDraft({ ...draft, takeoverCommandsEnabled: checked })
              }
            />
          </div>
          {draft.takeoverCommandsEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 rounded-xl border p-3">
                <h2 className="text-sm font-semibold">
                  {t("takeoverWorkspaceUx.pause")}
                </h2>
                <p>سأتولى المحادثة</p>
                <p dir="ltr" className="text-start">
                  I'll take over
                </p>
                <p className="text-xs text-muted-foreground">
                  {listing.data
                    ? t("takeoverWorkspaceUx.manualLimit", {
                        hours: listing.data.manualMaxHours,
                      })
                    : t("takeoverWorkspaceUx.rulesUnavailable")}
                </p>
              </div>
              <div className="space-y-2 rounded-xl border p-3">
                <h2 className="text-sm font-semibold">
                  {t("takeoverWorkspaceUx.resume")}
                </h2>
                <p>يسعدنا خدمتكم</p>
                <p dir="ltr" className="text-start">
                  Glad to help
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("takeoverWorkspaceUx.commandVisibility")}
                </p>
              </div>
            </div>
          )}
        </fieldset>
        <details className="rounded-xl border p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">
            {t("takeoverWorkspaceUx.legacyTitle")}
          </summary>
          <p className="text-sm text-muted-foreground">
            {t("takeoverWorkspaceUx.legacyHelp")}
          </p>
          <p className="mt-3 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {form.query.data?.takeoverResumeMessage ||
              t("virtualTeamReview.empty")}
          </p>
        </details>
        {form.conflict && (
          <div className="space-y-3 rounded-xl border p-4">
            <p role="alert">{t("assistantOptionUx.conflict")}</p>
            {!form.latest && (
              <Button
                type="button"
                variant="outline"
                disabled={form.busy}
                onClick={() => void form.loadReview()}
              >
                {t("virtualTeamReview.load")}
              </Button>
            )}
            {form.latest && (
              <AssistantOptionReview
                key={form.latest.revision}
                base={form.base}
                draft={draft}
                latest={form.latest.draft}
                labels={labels}
                display={display}
                disabled={!form.canManage || form.busy}
                onApply={form.acceptReview}
              />
            )}
          </div>
        )}
        {form.error && (
          <p role="alert" className="text-sm text-destructive">
            {t("assistantOptionUx.failed")}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p role="status" className="text-sm text-muted-foreground">
            {t(
              form.dirty
                ? "assistantOptionUx.unsaved"
                : "assistantSectionsUx.saved"
            )}
          </p>
          <Button
            type="submit"
            className="min-h-11"
            disabled={
              !form.canManage || form.busy || form.conflict || !form.dirty
            }
          >
            {t(form.busy ? "common.loading" : "humanTakeoverPage.saveSettings")}
          </Button>
        </div>
      </form>
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {t("humanTakeoverPage.activeConversations")}
          </h2>
          <Button
            type="button"
            variant="outline"
            disabled={listing.isFetching}
            onClick={() => void listing.refetch()}
          >
            {t("takeoverWorkspaceUx.refresh")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("takeoverWorkspaceUx.listHelp")}
        </p>
        {listing.isError ? (
          <WorkspaceState
            kind="error"
            inline
            onRetry={() => void listing.refetch()}
          />
        ) : listing.isLoading || !listing.data ? (
          <p role="status">{t("common.loading")}</p>
        ) : (
          <>
            <p className="text-sm">
              {t("takeoverWorkspaceUx.total", { count: listing.data.total })}
            </p>
            {!listing.data.rows.length ? (
              <p className="py-5 text-muted-foreground">
                {t(
                  listing.data.total
                    ? "takeoverWorkspaceUx.emptyPage"
                    : "humanTakeoverPage.noActiveConversations"
                )}
              </p>
            ) : (
              <ul className="space-y-3">
                {listing.data.rows.map(row => {
                  const status = takeoverExpiry(row.humanExpiresAt, Date.now());
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium [overflow-wrap:anywhere]">
                          {row.customerName || row.customerPhone}
                        </p>
                        <p
                          dir="ltr"
                            className="text-start text-sm text-muted-foreground [overflow-wrap:anywhere]"
                        >
                          {row.customerPhone}
                        </p>
                        <p className="mt-2 text-sm">
                          {row.permanentSilence
                            ? t("takeoverWorkspaceUx.silenced")
                            : status.state === "timed"
                              ? t("takeoverWorkspaceUx.remaining", {
                                  count: status.minutes,
                                })
                              : status.state === "waiting"
                                ? t("takeoverWorkspaceUx.awaitingRelease")
                                : status.state === "unknown"
                                  ? t("takeoverWorkspaceUx.unknownExpiry")
                                  : t("takeoverWorkspaceUx.manual")}
                        </p>
                      </div>
                      <Link
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                        href={`/merchant/conversations?phone=${encodeURIComponent(row.customerPhone)}`}
                      >
                        {t("takeoverWorkspaceUx.openConversation")}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || listing.isFetching}
                onClick={() => setPage(page - 1)}
              >
                {t("common.previous")}
              </Button>
              <span className="text-sm">
                {t("takeoverWorkspaceUx.page", {
                  page,
                  total: Math.max(1, Math.ceil(listing.data.total / 10)),
                })}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page * 10 >= listing.data.total || listing.isFetching}
                onClick={() => setPage(page + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
