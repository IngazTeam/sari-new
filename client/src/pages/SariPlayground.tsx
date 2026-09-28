import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Bot, Loader2, Send, RotateCcw } from "lucide-react";
import type { PreviewReply } from "@shared/test-sari-workspace";

interface Turn {
  question: string;
  result?: PreviewReply;
}
export default function SariPlayground() {
  const { t, i18n } = useTranslation();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"failed" | "forbidden" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const locked = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const chat = trpc.ai.chat.useMutation();
  const execute = async (question: string, retry = false) => {
    if (locked.current || !question.trim() || question.trim().length > 2000)
      return;
    locked.current = true;
    setBusy(true);
    setError(null);
    if (!retry) {
      setTurns(previous => [...previous, { question: question.trim() }]);
      setInput("");
    }
    try {
      const result = await chat.mutateAsync({ message: question.trim() });
      setTurns(previous =>
        previous.map((turn, index) =>
          index === previous.length - 1 ? { ...turn, result } : turn
        )
      );
    } catch (failure) {
      setError(
        (failure as { data?: { code?: string } })?.data?.code === "FORBIDDEN"
          ? "forbidden"
          : "failed"
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const examples = [
    t("sariPlayground.greetingExample"),
    t("sariPlayground.productsExample"),
    t("sariPlayground.shippingExample"),
  ];
  return (
    <div
      className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-3 sm:p-6"
      dir={i18n?.dir()}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">{t("sariPlayground.title")}</h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("sariPlayground.scope")}
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="min-h-11 whitespace-normal"
        >
          <Link href="/merchant/test-sari">
            {t("sariPlayground.openSession")}
          </Link>
        </Button>
      </header>
      <Card className="space-y-4 p-4 sm:p-5">
        <div
          className="flex flex-wrap gap-2"
          aria-label={t("sariPlayground.examplesTitle")}
        >
          {examples.map(query => (
            <Button
              type="button"
              key={query}
              variant="outline"
              className="h-auto min-h-11 whitespace-normal text-start"
              disabled={busy || !!error}
              onClick={() => {
                setInput(query);
                editor.current?.focus();
              }}
            >
              {query}
            </Button>
          ))}
        </div>
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault();
            if (!error) void execute(input);
          }}
        >
          <Label htmlFor="quick-preview-question">
            {t("sariPlayground.question")}
          </Label>
          <Textarea
            ref={editor}
            id="quick-preview-question"
            value={input}
            onChange={event => setInput(event.target.value)}
            disabled={busy || !!error}
            maxLength={2000}
            aria-describedby="quick-preview-hint"
            className="min-h-28 text-base [overflow-wrap:anywhere] md:text-base"
            onKeyDown={event => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                if (!error) void execute(input);
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              id="quick-preview-hint"
              className="text-xs text-muted-foreground"
            >
              {t("sariPlayground.inputHint", { count: input.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy || (!turns.length && !input)}
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("sariPlayground.clear")}
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                disabled={busy || !!error || !input.trim()}
              >
                {busy ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {t("sariPlayground.ask")}
              </Button>
            </div>
          </div>
        </form>
      </Card>
      <div role="status" className="text-sm text-muted-foreground">
        {busy
          ? t("sariPlayground.preparing")
          : error
            ? t("testSariPage.attentionStatus")
            : t("sariPlayground.independent")}
      </div>
      {error && (
        <Card role="alert" className="space-y-3 border-destructive/40 p-4">
          <p className="text-sm">
            {t(
              error === "forbidden"
                ? "testSariPage.accessDenied"
                : "testSariPage.replyFailed"
            )}
          </p>
          {error !== "forbidden" && (
            <Button
              type="button"
              className="min-h-11"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void execute(turns[turns.length - 1].question, true)
              }
            >
              {t("testSariPage.retry")}
            </Button>
          )}
        </Card>
      )}
      <section
        className="space-y-3"
        aria-label={t("sariPlayground.results")}
        aria-busy={busy}
      >
        {turns.length > 0 && (
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="min-w-0 rounded-lg border bg-card p-3">
              <dt>{t("sariPlayground.questionCount")}</dt>
              <dd className="mt-1 text-xl font-semibold">{turns.length}</dd>
            </div>
            <div className="min-w-0 rounded-lg border bg-card p-3">
              <dt>{t("sariPlayground.replyCount")}</dt>
              <dd className="mt-1 text-xl font-semibold">
                {turns.filter(turn => turn.result).length}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg border bg-card p-3">
              <dt>{t("sariPlayground.totalCount")}</dt>
              <dd className="mt-1 text-xl font-semibold">
                {turns.length + turns.filter(turn => turn.result).length}
              </dd>
            </div>
          </dl>
        )}
        {!turns.length && (
          <Card className="p-6 text-center text-muted-foreground">
            <Bot className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
            <p>{t("sariPlayground.empty")}</p>
          </Card>
        )}
        {turns.map((turn, index) => (
          <Card key={index} className="min-w-0 overflow-hidden">
            <div className="space-y-2 bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {t("sariPlayground.questionNumber", { count: index + 1 })}
              </p>
              <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                {turn.question}
              </p>
            </div>
            <div className="space-y-2 p-4">
              <p className="text-xs font-medium text-primary">
                {turn.result
                  ? t(
                      turn.result.source === "guardrail"
                        ? "testSariPage.guardrailSource"
                        : "testSariPage.modelSource"
                    )
                  : t(
                      busy
                        ? "sariPlayground.preparing"
                        : "sariPlayground.noReply"
                    )}
              </p>
              {turn.result && (
                <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                  {turn.result.response}
                </p>
              )}
            </div>
          </Card>
        ))}
      </section>
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent
          closeLabel={t("testSariPage.closeDialog")}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{t("sariPlayground.clearTitle")}</DialogTitle>
            <DialogDescription>
              {t("sariPlayground.clearHint")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setConfirmReset(false)}
            >
              {t("testSariPage.cancel")}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                if (locked.current) return;
                setTurns([]);
                setInput("");
                setError(null);
                setConfirmReset(false);
              }}
            >
              {t("sariPlayground.clear")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
