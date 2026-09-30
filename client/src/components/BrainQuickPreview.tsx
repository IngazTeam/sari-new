import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { MessageSquare, Loader2, Send } from "lucide-react";
import {
  brainPreviewInput,
  brainPreviewResult,
  type BrainPreviewResult,
} from "@shared/brain-preview";
import { trpc } from "@/lib/trpc";
import {
  cacheKnowledgeDraft,
  discardKnowledgeDraft,
  knowledgeCacheEpoch,
  readKnowledgeDraft,
} from "@/lib/knowledge-workspace-cache";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

export function BrainQuickPreview() {
  const mutation = trpc.sariBrain.testSari.useMutation({ retry: false });
  return (
    <KnowledgeWorkspaceScope slot="brain-quick-preview">
      {scopeKey => (
        <BrainQuickPreviewView
          key={scopeKey}
          scopeKey={scopeKey}
          send={mutation.mutateAsync}
        />
      )}
    </KnowledgeWorkspaceScope>
  );
}

export function BrainQuickPreviewView({
  scopeKey,
  send,
}: {
  scopeKey: string;
  send: (input: { question: string }) => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation();
  const [question, setQuestion] = useState(
    () => readKnowledgeDraft(scopeKey)?.content ?? ""
  );
  const [result, setResult] = useState<BrainPreviewResult | null>(null);
  const [error, setError] = useState<"failed" | "forbidden" | "rate" | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const locked = useRef(false),
    mounted = useRef(true),
    epoch = useRef(knowledgeCacheEpoch());
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (question)
      cacheKnowledgeDraft(
        scopeKey,
        { name: "", content: question, type: "custom" },
        epoch.current
      );
    else discardKnowledgeDraft(scopeKey);
  }, [question, scopeKey]);
  const tooLong = question.trim().length > 500;
  const invalid = tooLong || (attempted && !question.trim());
  async function ask() {
    if (locked.current || epoch.current !== knowledgeCacheEpoch()) return;
    setAttempted(true);
    const parsed = brainPreviewInput.safeParse({ question });
    if (!parsed.success) {
      editor.current?.focus();
      return;
    }
    locked.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = brainPreviewResult.parse(await send(parsed.data));
      if (data.question !== parsed.data.question)
        throw Error("Unexpected preview question");
      if (mounted.current && epoch.current === knowledgeCacheEpoch())
        setResult(data);
    } catch (failure) {
      if (mounted.current && epoch.current === knowledgeCacheEpoch()) {
        const code = (failure as { data?: { code?: string } })?.data?.code;
        setError(
          code === "FORBIDDEN" || code === "UNAUTHORIZED"
            ? "forbidden"
            : code === "TOO_MANY_REQUESTS"
              ? "rate"
              : "failed"
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const examples = [
    t("brainPreviewUx.prices"),
    t("brainPreviewUx.services"),
    t("brainPreviewUx.location"),
    t("brainPreviewUx.order"),
  ];
  return (
    <Card dir={i18n.dir()} className="min-w-0">
      <CardHeader className="space-y-3">
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <MessageSquare
              className="h-5 w-5 text-primary shrink-0"
              aria-hidden="true"
            />
            {t("brainPreviewUx.title")}
          </h2>
        </CardTitle>
        <CardDescription className="leading-6">
          {t("brainPreviewUx.scope")}
        </CardDescription>
        <p className="text-sm text-muted-foreground">
          {t("brainPreviewUx.usage")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            void ask();
          }}
          aria-busy={busy}
        >
          <Label htmlFor="brain-preview-question">
            {t("brainPreviewUx.question")}
          </Label>
          <Textarea
            ref={editor}
            id="brain-preview-question"
            dir="auto"
            className="min-h-28 text-base md:text-base [overflow-wrap:anywhere]"
            disabled={busy}
            value={question}
            aria-invalid={invalid}
            aria-describedby={`brain-preview-hint${invalid ? " brain-preview-error" : ""}`}
            onChange={e => {
              setQuestion(e.target.value);
              setAttempted(false);
            }}
            onKeyDown={e => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                if (!e.repeat) void ask();
              }
            }}
          />
          <p id="brain-preview-hint" className="text-xs text-muted-foreground">
            {t("brainPreviewUx.hint", { count: question.trim().length })}
          </p>
          {invalid && (
            <p
              id="brain-preview-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {t(
                tooLong ? "brainPreviewUx.tooLong" : "brainPreviewUx.required"
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex-1 min-w-48">
              {t("brainPreviewUx.draft")}
            </p>
            <Button
              type="submit"
              className="min-h-11 whitespace-normal"
              disabled={
                busy || tooLong || !question.trim() || error === "forbidden"
              }
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              {t(
                error === "failed"
                  ? "brainPreviewUx.generateAgain"
                  : "brainPreviewUx.ask"
              )}
            </Button>
          </div>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer min-h-11 flex items-center">
              {t("brainPreviewUx.examples")}
            </summary>
            <p className="text-xs text-muted-foreground mb-3">
              {t("brainPreviewUx.examplesHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              {examples.map(example => (
                <Button
                  key={example}
                  type="button"
                  variant="outline"
                  className="min-h-11 h-auto whitespace-normal"
                  disabled={busy || !!question.trim()}
                  onClick={() => {
                    if (locked.current) return;
                    setQuestion(example);
                    setAttempted(false);
                    editor.current?.focus();
                  }}
                >
                  {example}
                </Button>
              ))}
            </div>
          </details>
        </form>
        <p role="status" className="text-sm text-muted-foreground">
          {busy
            ? t("brainPreviewUx.preparing")
            : t("brainPreviewUx.independent")}
        </p>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 p-4 text-sm leading-6"
          >
            {t(
              error === "forbidden"
                ? "brainPreviewUx.forbidden"
                : error === "rate"
                  ? "brainPreviewUx.rate"
                  : "brainPreviewUx.failed"
            )}
          </div>
        )}
        {result && (
          <section
            className="space-y-3 rounded-xl border p-4 min-w-0"
            aria-label={t("brainPreviewUx.result")}
          >
            <h3 className="font-semibold">{t("brainPreviewUx.result")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("brainPreviewUx.asked")}
            </p>
            <p
              dir="auto"
              className="rounded-lg bg-muted p-3 whitespace-pre-wrap [overflow-wrap:anywhere]"
            >
              {result.question}
            </p>
            <p className="text-sm font-medium text-primary">
              {t(
                result.source === "guardrail"
                  ? "brainPreviewUx.guardrail"
                  : "brainPreviewUx.model"
              )}
            </p>
            <p
              dir="auto"
              className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]"
            >
              {result.answer}
            </p>
            <p className="text-xs text-muted-foreground leading-6">
              {t("brainPreviewUx.evidence")}
            </p>
          </section>
        )}
        <Button
          asChild
          variant="outline"
          className="min-h-11 h-auto whitespace-normal"
        >
          <Link
            href="/merchant/test-sari"
            onClick={e => {
              if (locked.current) e.preventDefault();
            }}
            aria-disabled={busy}
          >
            {t("brainPreviewUx.openSession")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
