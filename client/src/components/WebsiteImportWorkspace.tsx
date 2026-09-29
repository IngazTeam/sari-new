import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useWebsiteImportCopy } from "@/hooks/useWebsiteImportCopy";
import type { WebsiteImportCopy } from "@/locales/website-import";
import {
  importReadInput,
  type ImportRead,
  type ImportChoices,
} from "../../../shared/website-import";
import { pageUrlInput } from "../../../shared/knowledge-page-intake";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import {
  knowledgeCacheEpoch,
  readKnowledgeAttempt,
  rememberKnowledgeAttempt,
  forgetKnowledgeAttempt,
} from "@/lib/knowledge-workspace-cache";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
const initialChoices = (): ImportChoices => ({
  productsAction: "skip",
  pagesAction: "skip",
  faqsAction: "skip",
  applyContactInfo: false,
});
export function WebsiteImportWorkspace() {
  return (
    <KnowledgeWorkspaceScope slot="website-import">
      {key => <Workspace key={key} scope={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function Rows({
  rows,
  title,
  c,
}: {
  rows: Record<string, unknown>[];
  title: string;
  c: WebsiteImportCopy;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  const selected = rows.slice(page * 5, page * 5 + 5);
  return (
    <section className="min-w-0 space-y-3" aria-label={title}>
      <h4 className="font-semibold">
        {title} ({rows.length})
      </h4>
      {!rows.length && (
        <p className="text-sm text-muted-foreground">{c.empty}</p>
      )}
      {selected.map((row, i) => (
        <article
          key={i}
          className="min-w-0 rounded-xl border p-3 space-y-2 [overflow-wrap:anywhere]"
        >
          <h5 className="font-medium">
            {String(
              row.name ||
                row.question ||
                row.title ||
                row.url ||
                ("phone" in row || "phones" in row
                  ? c.contact
                  : `#${row.id || page * 5 + i + 1}`)
            )}
          </h5>
          {row.price !== undefined && (
            <p dir="ltr" className="text-start">
              {row.priceUnit === "minor"
                ? Number(row.price) / 100
                : String(row.price)}{" "}
              {String(row.currency || "")}{" "}
              {row.priceUnit === "unverified" ? "(?)" : ""}
            </p>
          )}
          {[
            "description",
            "answer",
            "content",
            "url",
            "productUrl",
            "phone",
            "phones",
            "address",
            "emails",
            "whatsappNumber",
          ].map(key =>
            String(row[key] ?? "") ? (
              String(row[key]).length > 320 ? (
                <details key={key}>
                  <summary className="cursor-pointer py-2 text-sm">
                    {c.fullText} · {String(row[key]).length}
                  </summary>
                  <p
                    tabIndex={0}
                    aria-label={c.fullText}
                    className="max-h-64 overflow-auto whitespace-pre-wrap text-sm"
                  >
                    {String(row[key])}
                  </p>
                </details>
              ) : (
                <p key={key} className="whitespace-pre-wrap text-sm">
                  {
                    (
                      {
                        phone: c.contactPhone,
                        phones: c.contactPhone,
                        address: c.contactAddress,
                        emails: c.contactEmails,
                        whatsappNumber: c.contactWhatsapp,
                      } as Record<string, string>
                    )[key]
                  }{" "}
                  {String(row[key])}
                </p>
              )
            ) : null
          )}
          <details>
            <summary className="cursor-pointer py-2 text-sm">
              {c.details}
            </summary>
            <pre
              dir="ltr"
              className="max-w-full whitespace-pre-wrap break-words text-xs"
            >
              {JSON.stringify(row, null, 2)}
            </pre>
          </details>
        </article>
      ))}
      {rows.length > 5 && (
        <nav aria-label={title} className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {c.previous}
          </Button>
          <span>
            {page + 1}/{Math.ceil(rows.length / 5)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * 5 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            {c.next}
          </Button>
        </nav>
      )}
    </section>
  );
}
function Workspace({ scope }: { scope: string }) {
  const { i18n } = useTranslation();
  const dateTime = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat(
      i18n.language.startsWith("ar") ? "ar-SA" : "en-US",
      {
        calendar: "gregory",
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(date);
  };
  const c = useWebsiteImportCopy(),
    utils = trpc.useUtils();
  const access = trpc.analysis.importAccess.useQuery(undefined, {
    retry: false,
  });
  const prepare = trpc.analysis.previewImport.useMutation(),
    apply = trpc.analysis.applyImport.useMutation(),
    refresh = trpc.analysis.refreshImport.useMutation();
  const [url, setUrl] = useState(""),
    [id, setId] = useState<string | null>(null),
    [result, setResult] = useState<ImportRead | null>(null);
  const [ack, setAck] = useState(false),
    [extractAck, setExtractAck] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [choices, setChoices] = useState(initialChoices);
  const alive = useRef(true),
    gate = useRef(false),
    epoch = useRef(knowledgeCacheEpoch());
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  const canManage =
    !!access.data?.canManage && !access.error && !access.isLoading;
  const review = result?.state === "review" ? result.review : null;
  const chosen =
    choices.applyContactInfo ||
    [choices.productsAction, choices.pagesAction, choices.faqsAction].some(
      v => v !== "skip"
    );
  const message = (e: unknown) => {
    const value = e as { data?: { code?: string }; message?: string };
    return value.data?.code === "CONFLICT"
      ? c.conflict
      : ["PAYLOAD_TOO_LARGE", "TOO_MANY_REQUESTS"].includes(
            value.data?.code || ""
          ) || value.message?.includes("LIMIT")
        ? c.limit
        : c.error;
  };
  const resolve = async (reference: string, rebase = false) => {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setAck(false);
    setError("");
    setBlocked(true);
    try {
      const data = rebase
        ? await refresh.mutateAsync({ previewId: reference })
        : await utils.analysis.importReview.fetch(
            { previewId: reference },
            { staleTime: 0 }
          );
      if (current()) {
        setResult(data);
        setBlocked(false);
        if ("receipt" in data) {
          void utils.sariBrain.invalidate();
          void utils.analysis.invalidate();
        }
      }
    } catch (e) {
      if (current()) setError(message(e));
    } finally {
      gate.current = false;
      if (current()) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    try {
      const linked = importReadInput.safeParse({
        previewId: new URLSearchParams(window.location.search).get(
          "importReview"
        ),
      });
      const previous = linked.success
        ? linked.data.previewId
        : readKnowledgeAttempt(scope);
      if (previous) {
        setId(previous);
        void resolve(previous);
      } else setBusy(false);
    } catch {
      setBusy(false);
    }
    return () => {
      alive.current = false;
    };
  }, [scope]);
  const preview = async () => {
    if (gate.current || !canManage || !extractAck) return;
    const normalized = pageUrlInput.safeParse({
      url: /^https?:\/\//i.test(url.trim())
        ? url.trim()
        : `https://${url.trim()}`,
    });
    if (!normalized.success || normalized.data.url.length > 500) {
      setError(c.invalid);
      return;
    }
    gate.current = true;
    setBusy(true);
    setError("");
    setAck(false);
    setExtractAck(false);
    setChoices(initialChoices());
    try {
      const data = await prepare.mutateAsync({
        websiteUrl: normalized.data.url,
        acknowledged: true,
      });
      if (!current()) return;
      setResult(data);
      setExtractAck(false);
      if (data.state === "review") {
        setId(data.review.previewId);
        try {
          rememberKnowledgeAttempt(scope, data.review.previewId, epoch.current);
        } catch {
          /* The in-memory review remains usable; the ID is shown for recovery. */
        }
      }
    } catch (e) {
      if (current()) setError(message(e));
    } finally {
      gate.current = false;
      if (current()) setBusy(false);
    }
  };
  const save = async () => {
    if (gate.current || !canManage || !review || !ack || blocked || !chosen)
      return;
    gate.current = true;
    setBusy(true);
    setAck(false);
    setError("");
    try {
      const data = await apply.mutateAsync({
        previewId: review.previewId,
        expectedRevision: review.revision,
        choices,
        acknowledged: true,
      });
      if (!current()) return;
      setResult(data);
      void utils.sariBrain.invalidate();
      void utils.analysis.invalidate();
      void utils.products.invalidate();
    } catch (e) {
      if (current()) {
        setError(message(e));
        setBlocked(true);
      }
    } finally {
      gate.current = false;
      if (current()) setBusy(false);
    }
  };
  const reset = () => {
    if (busy) return;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("importReview");
    window.history.replaceState(null, "", cleanUrl);
    setId(null);
    setResult(null);
    setAck(false);
    setExtractAck(false);
    setChoices(initialChoices());
    setError("");
    setBlocked(false);
    try {
      forgetKnowledgeAttempt(scope, id);
    } catch {
      /* Unavailable storage does not block a fresh preview. */
    }
  };
  return (
    <section className="space-y-4 min-w-0" aria-label={c.title}>
      {access.error ? (
        <div role="alert">
          <p>{c.permissionError}</p>
          <Button variant="outline" onClick={() => void access.refetch()}>
            {c.refresh}
          </Button>
        </div>
      ) : !access.isLoading && !canManage ? (
        <p>{c.readOnly}</p>
      ) : null}
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 p-3">
          {error}
        </p>
      )}
      {!id && (
        <div className="space-y-4 rounded-2xl border p-4">
          <p>{c.previewHelp}</p>
          <label className="block space-y-2">
            <span>{c.url}</span>
            <Input
              value={url}
              dir="ltr"
              type="url"
              maxLength={500}
              placeholder="https://example.com"
              disabled={busy}
              onChange={e => {
                setUrl(e.target.value);
                setExtractAck(false);
              }}
            />
          </label>
          <label className="flex items-start gap-3">
            <input
              className="mt-1 size-5 shrink-0"
              type="checkbox"
              checked={extractAck}
              disabled={busy || !canManage}
              onChange={e => setExtractAck(e.target.checked)}
            />
            <span>{c.extractionAck}</span>
          </label>
          <Button
            disabled={busy || !extractAck || !canManage || !url.trim()}
            onClick={() => void preview()}
          >
            {busy ? c.extracting : c.extract}
          </Button>
        </div>
      )}
      {id && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a className="break-all underline" href={`?importReview=${id}`}>
            {c.resume}
          </a>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void resolve(id)}
          >
            {c.readReceipt}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={reset}>
            {c.newPreview}
          </Button>
          <p className="w-full text-muted-foreground">{c.recoveryHelp}</p>
        </div>
      )}
      {busy && id && <p role="status">{c.preparing}</p>}
      {result &&
        (result.state === "expired" || result.state === "not_found") && (
          <p role="alert">{c.expired}</p>
        )}
      {result && "receipt" in result && (
        <div
          role="status"
          className="rounded-2xl border bg-primary/5 p-4 space-y-3"
        >
          <h3 className="text-lg font-semibold">
            {result.state === "applied" ? c.saved : c.changed}
          </h3>
          <dl className="grid grid-cols-2 gap-3">
            {(
              [
                [c.resultProducts, result.receipt.savedProducts],
                [c.resultPages, result.receipt.savedPages],
                [c.resultFaqs, result.receipt.savedFaqs],
                [c.resultSections, result.receipt.pausedSections],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd className="text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <time dateTime={result.receipt.appliedAt}>
            {dateTime(result.receipt.appliedAt)}
          </time>
        </div>
      )}
      {review && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
            <p className="break-all" dir="ltr">
              {review.proposal.websiteUrl}
            </p>
            <p>
              {c.expires}:{" "}
              <time dateTime={review.expiresAt}>
                {dateTime(review.expiresAt)}
              </time>
            </p>
            <p>{c.caution}</p>
            <details>
              <summary className="cursor-pointer py-2">{c.effects}</summary>
              <p>{c.mergeHelp}</p>
              <p>{c.replaceHelp}</p>
              <p>{c.websiteInfoEffect}</p>
            </details>
            {!!review.warnings.length && (
              <details>
                <summary className="cursor-pointer py-2">
                  {c.warnings} ({review.warnings.length})
                </summary>
                {review.warnings.map((w, i) => (
                  <p key={i} className="text-sm break-words">
                    {w === "IMPORT_ESTIMATES"
                      ? c.partialExtraction
                      : w.startsWith("IMPORT_PAGE_LINK_ONLY|")
                        ? c.linkOnly + " " + w.split("|").slice(1).join("|")
                        : w}
                  </p>
                ))}
              </details>
            )}
          </div>
          {(["products", "pages", "faqs"] as const).map(kind => (
            <section
              key={kind}
              className="rounded-2xl border p-4 space-y-4 min-w-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{c[kind]}</h3>
                <label className="min-w-0">
                  <span className="sr-only">{c[kind]}</span>
                  <select
                    aria-label={c[kind]}
                    className="w-full max-w-full min-h-11 border rounded-lg bg-background px-3"
                    disabled={busy || !canManage || blocked}
                    value={choices[`${kind}Action`]}
                    onChange={e => {
                      setAck(false);
                      setChoices({
                        ...choices,
                        [`${kind}Action`]: e.target.value,
                      });
                    }}
                  >
                    <option value="skip">{c.skip}</option>
                    <option value="merge">{c.merge}</option>
                    <option value="replace">{c.replace}</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Rows c={c} title={c.current} rows={review.current[kind]} />
                <Rows
                  c={c}
                  title={c.proposed}
                  rows={review.proposal[kind] as Record<string, unknown>[]}
                />
              </div>
            </section>
          ))}
          <section className="space-y-3 rounded-2xl border p-4">
            <h3 className="text-lg font-semibold">{c.contact}</h3>
            <p>{c.contactHelp}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <Rows c={c} title={c.current} rows={[review.current.merchant]} />
              <Rows
                c={c}
                title={c.proposed}
                rows={[review.proposal.contactInfo || {}]}
              />
            </div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={choices.applyContactInfo}
                disabled={busy || !canManage || blocked}
                onChange={e => {
                  setAck(false);
                  setChoices({
                    ...choices,
                    applyContactInfo: e.target.checked,
                  });
                }}
              />
              <span>{c.contactChoice}</span>
            </label>
          </section>
          <details className="rounded-2xl border p-4">
            <summary className="cursor-pointer py-2">
              {c.sections} ({review.current.sections.length}) · {c.variants} (
              {review.current.variants.length})
            </summary>
            <div className="grid gap-4 lg:grid-cols-2">
              <Rows c={c} title={c.sections} rows={review.current.sections} />
              <Rows c={c} title={c.variants} rows={review.current.variants} />
            </div>
          </details>
          <div className="rounded-2xl border bg-background p-4 space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={ack}
                disabled={busy || blocked || !canManage}
                onChange={e => setAck(e.target.checked)}
              />
              <span>{c.ack}</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || blocked || !canManage || !ack || !chosen}
                onClick={() => void save()}
              >
                {busy ? c.saving : c.save}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !canManage}
                onClick={() => void resolve(review.previewId, true)}
              >
                {c.refresh}
              </Button>
            </div>
            {!chosen && (
              <p className="text-sm text-muted-foreground">{c.choose}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
