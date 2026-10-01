import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { z } from "zod";
import type { assistantOptionInput } from "@shared/assistant-options";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readAssistantOptionDraft,
  writeAssistantOptionDraft,
  discardAssistantOptionDraft,
  restoreAssistantOptionForm,
} from "@/lib/assistant-option-draft";

/** The page must remount for a confirmed account/store identity. */
export function useReviewedAssistantOption<T>(
  kind: "language" | "takeover",
  read: (value: Record<string, any>) => T,
  input: (draft: T, revision: string) => z.infer<typeof assistantOptionInput>,
  scope: string
) {
  const { t } = useTranslation();
  const merchant = trpc.merchants.getCurrent.useQuery();
  const query = trpc.botSettings.get.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const utils = trpc.useUtils();
  const mutation = trpc.botSettings.updateOption.useMutation();
  const alive = useRef(true),
    locked = useRef(false);
  const epoch = useRef(knowledgeCacheEpoch());
  const [recovery, setRecovery] = useState(() => {
    const saved = readAssistantOptionDraft(scope, kind);
    return saved.state === "missing" ? null : saved;
  });
  const [storageFailed, setStorageFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<T | null>(null);
  const [base, setBase] = useState<T | null>(null);
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<{ draft: T; revision: string } | null>(
    null
  );
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      query.data?.merchantId === merchant.data?.id &&
      query.data?.optionRevisions?.[kind] &&
      !query.isError &&
      draft === null
    ) {
      const next = read(query.data);
      setDraft(next);
      setBase(next);
      setRevision(query.data.optionRevisions[kind]);
    }
  }, [query.data, query.isError, merchant.data?.id, draft, kind, read]);
  const canManage =
    !!query.data?.canManage &&
    !query.isError &&
    query.data?.merchantId === merchant.data?.id;
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  function remember(form: T, baseline: T, version: string, sent: boolean) {
    const persisted = writeAssistantOptionDraft(
      scope,
      kind,
      { form, base: baseline, revision: version, submitted: sent },
      epoch.current
    );
    setStorageFailed(!persisted);
    return persisted;
  }
  useEffect(() => {
    if (!draft || !base || !revision || recovery || !canManage || !current())
      return;
    if (dirty || submitted) remember(draft, base, revision, submitted);
    else if (!discardAssistantOptionDraft(scope, epoch.current))
      setStorageFailed(true);
  }, [
    draft,
    base,
    revision,
    recovery,
    canManage,
    dirty,
    submitted,
    scope,
    kind,
  ]);
  useEffect(() => {
    if (!(busy || (storageFailed && (dirty || submitted)))) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, storageFailed, dirty, submitted]);
  async function save() {
    if (
      locked.current ||
      !current() ||
      !canManage ||
      !draft ||
      !base ||
      !revision ||
      conflict ||
      recovery ||
      submitted
    )
      return;
    if (!remember(draft, base, revision, true)) return;
    setSubmitted(true);
    locked.current = true;
    setBusy(true);
    setError(false);
    try {
      const saved = await mutation.mutateAsync(input(draft, revision));
      if (!current()) return;
      if (
        saved.merchantId !== merchant.data?.id ||
        !/^[a-f0-9]{64}$/.test(saved.optionRevisions?.[kind] || "")
      )
        throw Error("Invalid save response");
      const next = read(saved);
      setDraft(next);
      setBase(next);
      setRevision(saved.optionRevisions[kind]);
      setSubmitted(false);
      setStorageFailed(!discardAssistantOptionDraft(scope, epoch.current));
      toast.success(t("assistantOptionUx.saved"));
      void utils.botSettings.get.invalidate().catch(() => {});
    } catch (failure) {
      if (current()) {
        const code = (failure as { data?: { code?: string } })?.data?.code;
        const definitive = [
          "CONFLICT",
          "BAD_REQUEST",
          "FORBIDDEN",
          "UNAUTHORIZED",
          "NOT_FOUND",
        ].includes(code || "");
        if (definitive) {
          setSubmitted(false);
          remember(draft, base, revision, false);
        }
        // Network errors do not prove that the server rejected the write.
        // Fetch and review current settings before making another decision.
        setConflict(true);
        setLatest(null);
        if (
          (failure as { data?: { code?: string } })?.data?.code === "CONFLICT"
        ) {
          setConflict(true);
          setLatest(null);
        } else setError(true);
      }
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }
  async function loadReview() {
    if (locked.current || !current() || recovery) return;
    locked.current = true;
    setBusy(true);
    setError(false);
    try {
      const fresh = await query.refetch();
      if (!current()) return;
      if (
        fresh.error ||
        fresh.data?.merchantId !== merchant.data?.id ||
        !fresh.data?.optionRevisions?.[kind]
      )
        throw Error("Unavailable");
      setLatest({
        draft: read(fresh.data),
        revision: fresh.data.optionRevisions[kind],
      });
    } catch {
      if (current()) setError(true);
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }
  return {
    query,
    draft,
    base,
    setDraft,
    busy,
    error,
    conflict,
    latest,
    canManage,
    recovery,
    storageFailed,
    submitted,
    editingDisabled: busy || !canManage || !!recovery || submitted,
    restore() {
      if (recovery?.state !== "ready" || !canManage || busy || !current())
        return;
      const value = recovery.value;
      setDraft(restoreAssistantOptionForm(value) as T);
      setBase(value.base as T);
      setRevision(value.revision);
      setSubmitted(value.submitted);
      setStorageFailed(!recovery.persisted);
      setConflict(true);
      setLatest(null);
      setRecovery(null);
    },
    discardRecovery() {
      if (busy || !current()) return;
      if (!discardAssistantOptionDraft(scope, epoch.current)) {
        setStorageFailed(true);
        return;
      }
      setRecovery(null);
      setStorageFailed(false);
    },
    save,
    loadReview,
    dirty,
    acceptReview(next: T) {
      if (!latest || !canManage || busy || !current()) return;
      setDraft(next);
      setBase(latest.draft);
      setRevision(latest.revision);
      setConflict(false);
      setLatest(null);
      setError(false);
      setSubmitted(false);
    },
  };
}
