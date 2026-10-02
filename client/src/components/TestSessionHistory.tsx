import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SavedTestSessionList } from "@shared/test-feedback-workspace";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function TestSessionHistory({
  open,
  onOpenChange,
  onSelect,
  merchantId,
  currentId,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(id: number): void;
  merchantId: number;
  currentId: number | null;
}) {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const api = useRef(utils);
  api.current = utils;
  const [data, setData] = useState<SavedTestSessionList | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0),
    lock = useRef(false),
    failedCursor = useRef<number | undefined>(undefined);
  async function load(beforeId?: number) {
    if (lock.current) return;
    lock.current = true;
    const token = generation.current;
    setBusy(true);
    setFailed(false);
    failedCursor.current = beforeId;
    try {
      const result = await api.current.testSari.listSessions.fetch({
        beforeId,
        limit: 20,
      });
      if (result.merchantId !== merchantId) throw Error("Unexpected tenant");
      if (token !== generation.current) return;
      setData(previous =>
        beforeId && previous
          ? {
              ...result,
              items: [
                ...previous.items,
                ...result.items.filter(
                  item => !previous.items.some(old => old.id === item.id)
                ),
              ],
            }
          : result
      );
    } catch {
      if (token === generation.current) setFailed(true);
    } finally {
      if (token === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    generation.current++;
    lock.current = false;
    setData(null);
    setFailed(false);
    setBusy(false);
    if (open) void load();
    return () => {
      generation.current++;
      lock.current = false;
    };
  }, [open, merchantId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ts-dialog"
        closeLabel={t("testSariPage.closeDialog")}
      >
        <DialogHeader>
          <DialogTitle>{t("testSariPage.savedSessions")}</DialogTitle>
          <DialogDescription>
            {t("testSariPage.savedSessionsHint")}
          </DialogDescription>
        </DialogHeader>
        {failed && (
          <div role="alert" className="space-y-2">
            <p>{t("testSariPage.historyFailed")}</p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void load(failedCursor.current)}
            >
              {t("testSariPage.retry")}
            </Button>
          </div>
        )}
        {busy && <p role="status">{t("testSariPage.loadingHistory")}</p>}
        {data && !data.items.length && <p>{t("testSariPage.noSessions")}</p>}
        <ul className="space-y-2">
          {data?.items.map(item => (
            <li key={item.id}>
              <Button
                variant="outline"
                className="h-auto min-h-14 w-full min-w-0 justify-between gap-3 whitespace-normal text-start"
                disabled={item.id === currentId || busy}
                onClick={() => onSelect(item.id)}
              >
                <span>
                  {t("testSariPage.sessionNumber", { id: item.id })}
                  <span className="block text-xs text-muted-foreground">
                    {new Date(item.startedAt).toLocaleString(
                      i18n?.language || "ar"
                    )}
                  </span>
                </span>
                <span className="text-xs">
                  {t("testSariPage.messageCount", { count: item.messageCount })}
                  {item.hasDeal && (
                    <span className="block">{t("testSariPage.dealDone")}</span>
                  )}
                  {item.id === currentId && (
                    <span className="block">
                      {t("testSariPage.currentSession")}
                    </span>
                  )}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {data?.nextCursor && !failed && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void load(data.nextCursor!)}
          >
            {t("testSariPage.moreSessions")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
