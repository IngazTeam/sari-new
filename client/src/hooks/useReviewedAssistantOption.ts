import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { z } from "zod";
import type { assistantOptionInput } from "@shared/assistant-options";

/** The page must remount for a confirmed account/store identity. */
export function useReviewedAssistantOption<T>(
  kind: "language" | "takeover",
  read: (value: Record<string, any>) => T,
  input: (draft: T, revision: string) => z.infer<typeof assistantOptionInput>
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
  const [draft, setDraft] = useState<T | null>(null);
  const [base, setBase] = useState<T | null>(null);
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<{ draft: T; revision: string } | null>(
    null
  );
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
  async function save() {
    if (locked.current || !canManage || !draft || !revision || conflict) return;
    locked.current = true;
    setBusy(true);
    setError(false);
    try {
      const saved = await mutation.mutateAsync(input(draft, revision));
      if (!alive.current) return;
      const next = read(saved);
      setDraft(next);
      setBase(next);
      setRevision(saved.optionRevisions[kind]);
      toast.success(t("assistantOptionUx.saved"));
      void utils.botSettings.get.invalidate().catch(() => {});
    } catch (failure) {
      if (alive.current) {
        if (
          (failure as { data?: { code?: string } })?.data?.code === "CONFLICT"
        ) {
          setConflict(true);
          setLatest(null);
        } else setError(true);
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function loadReview() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(false);
    try {
      const fresh = await query.refetch();
      if (!alive.current) return;
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
      if (alive.current) setError(true);
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
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
    save,
    loadReview,
    dirty: JSON.stringify(draft) !== JSON.stringify(base),
    acceptReview(next: T) {
      if (!latest || !canManage || busy) return;
      setDraft(next);
      setBase(latest.draft);
      setRevision(latest.revision);
      setConflict(false);
      setLatest(null);
      setError(false);
    },
  };
}
