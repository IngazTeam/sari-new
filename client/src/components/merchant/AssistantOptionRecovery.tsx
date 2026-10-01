import { useTranslation } from "react-i18next";
import type { AssistantOptionDraftRead } from "@/lib/assistant-option-draft";
import { Button } from "@/components/ui/button";

export function AssistantOptionRecovery({
  recovery,
  storageFailed,
  submitted,
  canRestore,
  onRestore,
  onDiscard,
}: {
  recovery: AssistantOptionDraftRead | null;
  storageFailed: boolean;
  submitted: boolean;
  canRestore: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {recovery && (
        <section
          className="space-y-3 rounded-xl border bg-card p-4"
          aria-label={t("assistantOptionDraftUx.title")}
        >
          <h2 className="font-semibold">{t("assistantOptionDraftUx.title")}</h2>
          <p className="text-sm leading-7">
            {t(
              recovery.state === "ready"
                ? recovery.value.submitted
                  ? "assistantOptionDraftUx.pendingFound"
                  : "assistantOptionDraftUx.found"
                : "assistantOptionDraftUx.unreadable"
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            {recovery.state === "ready" && (
              <Button
                type="button"
                className="h-auto min-h-11 whitespace-normal"
                disabled={!canRestore}
                onClick={onRestore}
              >
                {t("assistantOptionDraftUx.restore")}
              </Button>
            )}
            <Button
              type="button"
              className="h-auto min-h-11 whitespace-normal"
              variant="outline"
              onClick={onDiscard}
            >
              {t("assistantOptionDraftUx.discard")}
            </Button>
          </div>
        </section>
      )}
      {submitted && !recovery && (
        <p role="alert" className="rounded-xl border p-4 text-sm leading-7">
          {t("assistantOptionDraftUx.uncertain")}
        </p>
      )}
      {storageFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("assistantOptionDraftUx.storageFailed")}
        </p>
      )}
      {!recovery && (
        <p className="text-xs leading-6 text-muted-foreground">
          {t("assistantOptionDraftUx.privacy")}
        </p>
      )}
    </>
  );
}
