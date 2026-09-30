import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readProductWorkspaceCache,
  saveProductWorkspaceCache,
  clearProductWorkspaceCache,
} from "@/lib/product-workspace-cache";
import {
  productDeleteReviewSchema,
  productDeleteWriteInput,
  productDeleteReceipt,
} from "@shared/product-delete";
import { formatProductPrice } from "@shared/product-money";
import {
  ProductPending,
  ProductHeading,
  productDefinitiveError,
} from "./ProductWorkspaceView";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import type { z } from "zod";
type Attempt = z.infer<typeof productDeleteWriteInput>;
export function ProductDeleteWorkspace({
  scope,
  ids,
  canManage,
  back,
  completed,
}: {
  scope: string;
  ids: number[];
  canManage: boolean;
  back: () => void;
  completed: () => void;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils(),
    [actorId, merchantId] = scope.split(":").map(Number);
  const [attempt, setAttempt] = useState<Attempt | null>(null),
    [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [notice, setNotice] = useState("");
  const sortedIds = [...ids].sort((a, b) => a - b),
    identity = JSON.stringify(sortedIds),
    alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    lock = useRef(false),
    attemptRef = useRef(attempt);
  const query = trpc.products.editor.deleteReview.useQuery(
      { ids: sortedIds },
      { retry: false, staleTime: 0, refetchOnMount: "always" }
    ),
    mutation = trpc.products.editor.deleteWrite.useMutation(),
    parsed = productDeleteReviewSchema.safeParse(query.data);
  const data =
      parsed.success &&
      parsed.data.merchantId === merchantId &&
      JSON.stringify(parsed.data.selection.ids) === identity &&
      JSON.stringify(parsed.data.items.map(row => row.id)) === identity
        ? parsed.data
        : null,
    ready =
      !!data &&
      !query.error &&
      !query.isFetching &&
      !query.isLoading &&
      query.fetchStatus !== "paused";
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  function load() {
    try {
      const value = readProductWorkspaceCache(scope);
      if (
        value &&
        (value.kind !== "delete" ||
          JSON.stringify(value.attempt.ids) !== identity)
      )
        throw Error("Deletion scope changed");
      const pending = value?.kind === "delete" ? value.attempt : null;
      attemptRef.current = pending;
      setAttempt(pending);
      setLoaded(true);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [scope, identity]);
  useEffect(() => {
    setReviewed(false);
  }, [query.dataUpdatedAt, data?.digest]);
  useEffect(() => {
    if (!attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [attempt]);
  function accept(raw: unknown, input: Attempt) {
    const receipt = productDeleteReceipt.parse(raw);
    if (
      receipt.merchantId !== merchantId ||
      receipt.actorId !== actorId ||
      receipt.requestId !== input.requestId ||
      receipt.digest !== input.expectedDigest ||
      JSON.stringify(receipt.ids) !== JSON.stringify(input.ids)
    )
      throw Error("Deletion receipt mismatch");
    try {
      clearProductWorkspaceCache(scope, epoch.current);
    } catch (error) {
      setStorageError(true);
      throw error;
    }
    completed();
  }
  async function send(input: Attempt) {
    if (!current() || lock.current || !loaded || storageError || !canManage)
      return;
    if (!attemptRef.current && (!ready || !data?.canDelete || !reviewed))
      return;
    if (
      attemptRef.current &&
      JSON.stringify(input) !== JSON.stringify(attemptRef.current)
    )
      return;
    try {
      saveProductWorkspaceCache(
        scope,
        { kind: "delete", attempt: input },
        epoch.current
      );
    } catch {
      setStorageError(true);
      return;
    }
    attemptRef.current = input;
    setAttempt(input);
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await mutation.mutateAsync(input);
      if (current()) accept(result, input);
    } catch (error) {
      if (current() && productDefinitiveError(error)) {
        try {
          clearProductWorkspaceCache(scope, epoch.current);
          attemptRef.current = null;
          setAttempt(null);
        } catch {
          setStorageError(true);
        }
        setReviewed(false);
        setNotice(t("productWorkspaceUx.deleteRejected"));
        void query.refetch();
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  async function recover() {
    const input = attemptRef.current;
    if (!input || !current() || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await utils.products.editor.deleteReceipt.fetch(
        { requestId: input.requestId },
        { staleTime: 0 }
      );
      if (current()) {
        if (result) accept(result, input);
        else setNotice(t("productWorkspaceUx.noReceipt"));
      }
    } catch {
      if (current()) setNotice(t("productWorkspaceUx.recoveryFailed"));
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  return (
    <section className="pw-workspace">
      <header className="pw-header">
        <div>
          <ProductHeading>
            {t("productWorkspaceUx.deleteReview")}
          </ProductHeading>
          <p>{t("productWorkspaceUx.deleteHint")}</p>
        </div>
        <button type="button" disabled={busy} onClick={back}>
          {t("productWorkspaceUx.back")}
        </button>
      </header>
      {notice && (
        <p className="pw-notice" role="status">
          {notice}
        </p>
      )}
      {storageError && (
        <section className="pw-notice" role="alert">
          <p>{t("productWorkspaceUx.storageError")}</p>
          <button type="button" onClick={load}>
            {t("productWorkspaceUx.retry")}
          </button>
        </section>
      )}
      {attempt && (
        <ProductPending
          busy={busy}
          canRetry={canManage && !storageError}
          recover={() => void recover()}
          retry={() => void send(attempt)}
        />
      )}
      {!ready ? (
        <WorkspaceState
          inline
          kind={
            query.fetchStatus === "paused"
              ? "offline"
              : query.error
                ? workspaceFailureKind(query.error)
                : query.isLoading || query.isFetching
                  ? "loading"
                  : "error"
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <p>
            {t("productWorkspaceUx.selectedCount", {
              count: data!.items.length,
            })}
          </p>
          <ul className="pw-delete-list">
            {data!.items.map(row => (
              <li className="pw-panel" key={row.id}>
                <h2>{row.name}</h2>
                <p>
                  {formatProductPrice(
                    row,
                    i18n.language?.startsWith("en") ? "en-US" : "ar-SA",
                    t("productWorkspaceUx.priceReview")
                  )}
                </p>
                <p>
                  {t("productWorkspaceUx.childCounts", {
                    variants: row.variants,
                    options: row.options,
                  })}
                </p>
                {row.locked && (
                  <p className="pw-error">{t("productWorkspaceUx.locked")}</p>
                )}
                {Object.values(row.references).some(count => count > 0) && (
                  <div className="pw-notice">
                    <p>{t("productWorkspaceUx.referencesBlocked")}</p>
                    <dl className="pw-reference-counts">
                      {row.references.rewards > 0 && (
                        <div>
                          <dt>{t("productWorkspaceUx.rewardLinks")}</dt>
                          <dd>{row.references.rewards}</dd>
                        </div>
                      )}
                      {row.references.comparisons > 0 && (
                        <div>
                          <dt>{t("productWorkspaceUx.comparisonLinks")}</dt>
                          <dd>{row.references.comparisons}</dd>
                        </div>
                      )}
                      {row.references.reviews > 0 && (
                        <div>
                          <dt>{t("productWorkspaceUx.reviewLinks")}</dt>
                          <dd>{row.references.reviews}</dd>
                        </div>
                      )}
                      {row.references.promotions > 0 && (
                        <div>
                          <dt>{t("productWorkspaceUx.promotionLinks")}</dt>
                          <dd>{row.references.promotions}</dd>
                        </div>
                      )}
                      {row.references.unreadablePromotions > 0 && (
                        <div>
                          <dt>
                            {t("productWorkspaceUx.unreadablePromotionLinks")}
                          </dt>
                          <dd>{row.references.unreadablePromotions}</dd>
                        </div>
                      )}
                      {row.references.foreignDetails > 0 && (
                        <div>
                          <dt>{t("productWorkspaceUx.foreignDetails")}</dt>
                          <dd>{row.references.foreignDetails}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!data!.canDelete && (
            <p className="pw-notice">
              {data!.canManage
                ? t("productWorkspaceUx.archiveInstead")
                : t("productWorkspaceUx.viewer")}
            </p>
          )}
          <label className="pw-check">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!!attempt || busy || !data!.canDelete || !canManage}
              onChange={event => setReviewed(event.target.checked)}
            />
            {t("productWorkspaceUx.reviewDeleteConsent")}
          </label>
          <div className="pw-actions">
            <button
              type="button"
              className="pw-danger"
              disabled={
                !reviewed ||
                !!attempt ||
                busy ||
                storageError ||
                !data!.canDelete ||
                !canManage
              }
              onClick={() =>
                void send(
                  productDeleteWriteInput.parse({
                    ids: sortedIds,
                    expectedDigest: data!.digest,
                    requestId: crypto.randomUUID(),
                    reviewed: true,
                  })
                )
              }
            >
              {busy
                ? t("productWorkspaceUx.deleting")
                : t("productWorkspaceUx.confirmDelete")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
