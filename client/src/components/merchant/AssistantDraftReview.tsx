import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  compareAssistantDraft,
  type AssistantDraftField,
  type AssistantSettingsDraft,
} from "@shared/assistant-settings-draft";
import { parseAgentKeywords } from "@shared/virtual-agent-form";

export function AssistantDraftReview({
  base,
  draft,
  latest,
  onApply,
  onClose,
}: {
  base: AssistantSettingsDraft;
  draft: AssistantSettingsDraft;
  latest: AssistantSettingsDraft;
  onApply: (merged: AssistantSettingsDraft) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const labels = {
    autoReplyEnabled: t("botSettingsPage.enableAutoReply"),
    workingHoursEnabled: t("botSettingsPage.enableWorkingHours"),
    workingHoursStart: t("botSettingsPage.startTime"),
    workingHoursEnd: t("botSettingsPage.endTime"),
    workingDays: t("botSettingsPage.workingDays"),
    welcomeMessage: t("botSettingsPage.welcomeMessage"),
    outOfHoursMessage: t("botSettingsPage.outOfHoursMessage"),
    responseDelay: t("botSettingsPage.responseDelay"),
    maxResponseLength: t("botSettingsPage.maxResponseLength"),
    tone: t("botSettingsPage.tone"),
    style: t("assistantPersonalityUx.style"),
    emojiUsage: t("assistantPersonalityUx.emoji"),
    personalityInstructions: t("assistantPersonalityUx.instructions"),
    brandVoice: t("assistantPersonalityUx.brand"),
    language: t("botSettingsPage.language"),
    customInstructions: t("assistantSettingsReviewUx.instructionsTitle"),
    groupMode: t("assistantSettingsReviewUx.groupsTitle"),
    groupKeywords: t("assistantSettingsReviewUx.keywords"),
    groupRedirectMessage: t("assistantSettingsReviewUx.privateMessage"),
  };
  const id = useId();
  const [choices, setChoices] = useState<
    Partial<Record<AssistantDraftField, "mine" | "latest">>
  >({});
  const { merged, conflicts } = compareAssistantDraft(base, draft, latest);
  const format = (
    field: AssistantDraftField,
    value: AssistantSettingsDraft[AssistantDraftField]
  ) => {
    if (typeof value === "boolean")
      return t(
        value ? "assistantDraftUx.enabled" : "assistantDraftUx.disabled"
      );
    if (value === "" || value === null) return t("assistantDraftUx.empty");
    if (field === "groupKeywords")
      return (
        parseAgentKeywords(String(value)).join("، ") ||
        t("assistantDraftUx.empty")
      );
    if (field === "workingDays") {
      const names = [
        t("botSettingsPage.sunday"),
        t("botSettingsPage.monday"),
        t("botSettingsPage.tuesday"),
        t("botSettingsPage.wednesday"),
        t("botSettingsPage.thursday"),
        t("botSettingsPage.friday"),
        t("botSettingsPage.saturday"),
      ];
      return String(value)
        .split(",")
        .map(day => names[Number(day)] ?? day)
        .join("، ");
    }
    if (field === "groupMode")
      return (
        (
          {
            disabled: t("assistantSettingsReviewUx.groupOff"),
            mention_only: t("assistantSettingsReviewUx.groupMention"),
            keyword_only: t("assistantSettingsReviewUx.groupKeywords"),
            private_redirect: t("assistantSettingsReviewUx.groupPrivate"),
          } as Record<string, string>
        )[String(value)] || String(value)
      );
    if (field === "tone")
      return (
        (
          {
            friendly: t("botSettingsPage.toneFriendly"),
            professional: t("botSettingsPage.toneProfessional"),
            casual: t("botSettingsPage.toneCasual"),
            enthusiastic: t("assistantPersonalityUx.enthusiastic"),
          } as Record<string, string>
        )[String(value)] || String(value)
      );
    if (field === "style")
      return (
        (
          {
            saudi_dialect: t("assistantPersonalityUx.saudi"),
            formal_arabic: t("assistantPersonalityUx.formal"),
            english: t("assistantPersonalityUx.english"),
            bilingual: t("assistantPersonalityUx.bilingual"),
          } as Record<string, string>
        )[String(value)] || String(value)
      );
    if (field === "emojiUsage")
      return (
        (
          {
            none: t("assistantPersonalityUx.none"),
            minimal: t("assistantPersonalityUx.minimal"),
            moderate: t("assistantPersonalityUx.moderate"),
            frequent: t("assistantPersonalityUx.frequent"),
          } as Record<string, string>
        )[String(value)] || String(value)
      );
    return String(value);
  };
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="merchant-workspace mw-form-dialog max-w-2xl max-h-[85dvh]"
        closeLabel={t("common.close")}
      >
        <DialogHeader>
          <DialogTitle>{t("assistantDraftUx.reviewTitle")}</DialogTitle>
          <DialogDescription>
            {t("assistantDraftUx.reviewHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto space-y-4 p-1">
          <p className="text-sm text-muted-foreground">
            {t(
              conflicts.length
                ? "assistantDraftUx.chooseEach"
                : "assistantDraftUx.autoMerge"
            )}
          </p>
          {conflicts.map(field => (
            <fieldset
              key={field}
              className="min-w-0 rounded-xl border p-3 space-y-2"
            >
              <legend className="px-2 font-semibold">{labels[field]}</legend>
              {(["mine", "latest"] as const).map(choice => (
                <label
                  key={choice}
                  className={`block cursor-pointer rounded-lg border p-3 ${choices[field] === choice ? "border-primary bg-primary/5" : ""}`}
                >
                  <span className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name={`${id}-${field}`}
                      checked={choices[field] === choice}
                      onChange={() =>
                        setChoices(old => ({ ...old, [field]: choice }))
                      }
                    />
                    <span className="font-medium">
                      {t(
                        choice === "mine"
                          ? "assistantDraftUx.mine"
                          : "assistantDraftUx.latest"
                      )}
                    </span>
                  </span>
                  <span
                    dir="auto"
                    className="block max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm"
                  >
                    {format(field, (choice === "mine" ? draft : latest)[field])}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("assistantDraftUx.keepEditing")}
          </Button>
          <Button
            type="button"
            disabled={conflicts.some(field => !choices[field])}
            onClick={() => {
              for (const field of conflicts)
                if (choices[field] === "latest")
                  Object.assign(merged, { [field]: latest[field] });
              onApply(merged);
            }}
          >
            {t("assistantDraftUx.applyReview")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
