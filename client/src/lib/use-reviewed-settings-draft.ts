import { useEffect, useRef, useState } from "react";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
type Snapshot = {
  revision: string | null;
  values: Record<string, unknown> | null;
  canManage: boolean;
};
export function useReviewedSettingsDraft<T extends Snapshot>({
  query,
  parse,
  validate,
  write,
  verify,
  cache,
}: {
  query: {
    data?: unknown;
    error?: unknown;
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => Promise<{ data?: unknown; error?: unknown }>;
  };
  parse: (data: unknown) => T | null;
  validate: (
    input: unknown
  ) =>
    | { success: true; data: any }
    | { success: false; error: { issues: { path: PropertyKey[] }[] } };
  write: (input: any) => Promise<unknown>;
  verify: (
    result: unknown,
    desired: Record<string, unknown>
  ) => { changed: boolean; workspace: T } | null;
  cache: (snapshot: T) => void;
}) {
  const data = query.error ? null : parse(query.data);
  const [base, setBase] = useState<T | null>(null),
    [draft, setDraft] = useState<Record<string, unknown> | null>(null),
    [issues, setIssues] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [blocked, setBlocked] = useState(false),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    mounted = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    submitted = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const alive = () =>
    mounted.current && epoch.current === knowledgeCacheEpoch();
  const adopt = (value: T) => {
    setBase(value);
    setDraft(value.values ? { ...value.values } : null);
    setBlocked(false);
    setIssues([]);
    submitted.current = null;
  };
  useEffect(() => {
    if (data && !base) adopt(data);
  }, [data, base]);
  const dirty = !!base && JSON.stringify(draft) !== JSON.stringify(base.values),
    remoteChanged = !!data && !!base && data.revision !== base.revision;
  useEffect(() => {
    if (!dirty && !blocked) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, blocked]);
  const reload = async (checkOnly = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await query.refetch();
      if (!alive()) return;
      const value = result.error ? null : parse(result.data);
      if (!value) throw Error("unavailable");
      if (
        checkOnly &&
        (!submitted.current ||
          !value.values ||
          Object.entries(submitted.current).some(
            ([key, v]) => value.values![key] !== v
          ))
      ) {
        setNotice("different");
        setBlocked(true);
        return;
      }
      adopt(value);
      setNotice(checkOnly ? "verified" : "");
    } catch {
      if (alive()) {
        setNotice("failedRead");
        setBlocked(true);
      }
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  };
  const save = async () => {
    if (
      lock.current ||
      blocked ||
      !data?.canManage ||
      !base?.revision ||
      !draft ||
      remoteChanged ||
      query.isFetching ||
      !dirty
    )
      return;
    const input = validate({ ...draft, expectedRevision: base.revision });
    if (!input.success) {
      setIssues(input.error.issues.map(i => String(i.path[0])));
      setNotice("invalid");
      return;
    }
    const { expectedRevision: _, ...desired } = input.data;
    lock.current = true;
    setBusy(true);
    setNotice("");
    setIssues([]);
    submitted.current = desired;
    try {
      const result = await write(input.data);
      if (!alive()) return;
      const checked = verify(result, desired);
      if (!checked) throw Error("unverified");
      cache(checked.workspace);
      adopt(checked.workspace);
      setNotice(checked.changed ? "saved" : "noChanges");
    } catch (error) {
      if (alive()) {
        setBlocked(true);
        setNotice(
          ["CONFLICT", "FORBIDDEN", "UNAUTHORIZED"].includes(
            (error as any)?.data?.code
          )
            ? "conflict"
            : "uncertain"
        );
      }
    } finally {
      lock.current = false;
      if (alive()) setBusy(false);
    }
  };
  return {
    data,
    base,
    draft,
    dirty,
    remoteChanged,
    issues,
    notice,
    blocked,
    busy,
    reload,
    save,
    loading: query.isLoading || (!base && !!data),
    disabled:
      busy || blocked || remoteChanged || !data?.canManage || query.isFetching,
    change: (key: string, value: unknown) => {
      setDraft(previous => ({ ...previous, [key]: value }));
      setIssues(previous => previous.filter(k => k !== key));
      setNotice("");
    },
  };
}
