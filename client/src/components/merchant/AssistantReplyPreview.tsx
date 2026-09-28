import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import type { PreviewReply } from "@shared/test-sari-workspace";

export type PreviewSelection =
  | { mode: "store" }
  | { mode: "manual"; agentId: number }
  | { mode: "automatic"; time: string };
type Result = PreviewReply & {
  persona?: {
    id: number;
    name: string;
    role: string;
    isActive: boolean;
    reason: "manual" | "keyword" | "default" | "order";
  };
  time?: string | null;
};

/** Mount with a key when selection changes. No customer messages or settings writes. */
export function AssistantReplyPreview({
  selection,
  initialQuestion = "",
  onBusyChange,
}: {
  selection: PreviewSelection;
  initialQuestion?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const quick = trpc.ai.chat.useMutation();
  const persona = trpc.virtualAgents.preview.useMutation();
  const [question, setQuestion] = useState(initialQuestion);
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const send = async () => {
    if (lock.current || !question.trim() || question.trim().length > 2000)
      return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    setResult(null);
    const message = question.trim();
    setSubmitted(message);
    try {
      setResult(
        selection.mode === "store"
          ? await quick.mutateAsync({ message })
          : await persona.mutateAsync({ ...selection, message })
      );
    } catch (failure) {
      setError(
        (failure as { data?: { code?: string } })?.data?.code ||
          "INTERNAL_SERVER_ERROR"
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <div className="min-w-0 space-y-4" data-assistant-reply-preview>
      <p className="text-sm leading-6 text-muted-foreground">
        {t("personaPreviewUx.scope")}
      </p>
      {selection.mode === "automatic" && (
        <p className="text-sm">
          {t("personaPreviewUx.routingTime", { time: selection.time })}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="saved-preview-question">
          {t("sariPlayground.question")}
        </Label>
        <Textarea
          id="saved-preview-question"
          ref={editor}
          value={question}
          maxLength={2000}
          disabled={busy}
          aria-describedby="saved-preview-hint"
          className="min-h-28 text-base md:text-base [overflow-wrap:anywhere]"
          onChange={event => {
            setQuestion(event.target.value);
            setError(null);
          }}
          onKeyDown={event => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <p id="saved-preview-hint" className="text-xs text-muted-foreground">
          {t("sariPlayground.inputHint", { count: question.length })}
        </p>
      </div>
      <Button
        type="button"
        className="min-h-11"
        disabled={busy || !question.trim()}
        onClick={() => void send()}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        {t(busy ? "sariPlayground.preparing" : "sariPlayground.ask")}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {busy
          ? t("sariPlayground.preparing")
          : t("personaPreviewUx.independent")}
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm"
        >
          {t(
            error === "FORBIDDEN"
              ? "testSariPage.accessDenied"
              : error === "NOT_FOUND"
                ? "personaPreviewUx.missing"
                : error === "PRECONDITION_FAILED"
                  ? "personaPreviewUx.unavailable"
                  : error === "TOO_MANY_REQUESTS"
                    ? "personaPreviewUx.rateLimit"
                    : "testSariPage.replyFailed"
          )}
        </div>
      )}
      {result && (
        <section
          className="min-w-0 space-y-3 rounded-xl border bg-muted/30 p-4"
          aria-label={t("personaPreviewUx.result")}
        >
          {result.persona && (
            <div className="space-y-1">
              <p className="font-semibold [overflow-wrap:anywhere]">
                {result.persona.name} · {result.persona.role}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  result.persona.reason === "manual"
                    ? "personaPreviewUx.manual"
                    : result.persona.reason === "keyword"
                      ? "virtualTeamUx.matchKeyword"
                      : result.persona.reason === "default"
                        ? "virtualTeamUx.matchDefault"
                        : "virtualTeamUx.matchOrder"
                )}
                {!result.persona.isActive
                  ? ` · ${t("personaPreviewUx.paused")}`
                  : ""}
              </p>
            </div>
          )}
          <p className="text-xs font-medium text-muted-foreground">
            {t("personaPreviewUx.testedQuestion")}
          </p>
          <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
            {submitted}
          </p>
          <p className="border-t pt-3 text-xs font-medium text-primary">
            {t(
              result.source === "guardrail"
                ? "testSariPage.guardrailSource"
                : "testSariPage.modelSource"
            )}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
            {result.response}
          </p>
        </section>
      )}
    </div>
  );
}
