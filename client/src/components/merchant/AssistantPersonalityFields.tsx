import { useTranslation } from "react-i18next";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantSettingsDraft } from "@shared/assistant-settings-draft";

type Fields = Pick<
  AssistantSettingsDraft,
  "style" | "emojiUsage" | "personalityInstructions" | "brandVoice"
>;
export function AssistantPersonalityFields({
  value,
  onChange,
}: {
  value: Fields;
  onChange: (fields: Partial<Fields>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistantPersonalityUx.title")}</CardTitle>
        <CardDescription>{t("assistantPersonalityUx.help")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="personalityStyle">
              {t("assistantPersonalityUx.style")}
            </Label>
            <select
              id="personalityStyle"
              className="w-full min-h-11 rounded-md border bg-background px-3 text-base"
              value={value.style}
              onChange={e =>
                onChange({ style: e.target.value as Fields["style"] })
              }
              aria-describedby="personalityStyle-help"
            >
              <option value="saudi_dialect">
                {t("assistantPersonalityUx.saudi")}
              </option>
              <option value="formal_arabic">
                {t("assistantPersonalityUx.formal")}
              </option>
              <option value="english">
                {t("assistantPersonalityUx.english")}
              </option>
              <option value="bilingual">
                {t("assistantPersonalityUx.bilingual")}
              </option>
            </select>
            <p
              id="personalityStyle-help"
              className="text-sm text-muted-foreground"
            >
              {t("assistantPersonalityUx.languageHelp")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="personalityEmoji">
              {t("assistantPersonalityUx.emoji")}
            </Label>
            <select
              id="personalityEmoji"
              className="w-full min-h-11 rounded-md border bg-background px-3 text-base"
              value={value.emojiUsage}
              onChange={e =>
                onChange({ emojiUsage: e.target.value as Fields["emojiUsage"] })
              }
            >
              <option value="none">{t("assistantPersonalityUx.none")}</option>
              <option value="minimal">
                {t("assistantPersonalityUx.minimal")}
              </option>
              <option value="moderate">
                {t("assistantPersonalityUx.moderate")}
              </option>
              <option value="frequent">
                {t("assistantPersonalityUx.frequent")}
              </option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brandVoice">
            {t("assistantPersonalityUx.brand")}
          </Label>
          <Textarea
            id="brandVoice"
            dir="auto"
            className="min-h-28 text-base"
            rows={3}
            maxLength={2000}
            value={value.brandVoice}
            onChange={e => onChange({ brandVoice: e.target.value })}
            aria-describedby="brandVoice-help"
          />
          <p id="brandVoice-help" className="text-sm text-muted-foreground">
            {t("assistantPersonalityUx.brandHelp")}
          </p>
          <p className="text-xs text-muted-foreground">
            {value.brandVoice.length} / 2000
          </p>
        </div>
        <details
          className="rounded-xl border p-3"
          open={value.personalityInstructions ? true : undefined}
        >
          <summary className="min-h-11 cursor-pointer font-medium">
            {t("assistantPersonalityUx.instructions")}
          </summary>
          <div className="mt-3 space-y-2">
            <Label htmlFor="personalityInstructions">
              {t("assistantPersonalityUx.instructions")}
            </Label>
            <Textarea
              id="personalityInstructions"
              dir="auto"
              rows={4}
              className="text-base"
              maxLength={2000}
              value={value.personalityInstructions}
              onChange={e =>
                onChange({ personalityInstructions: e.target.value })
              }
              aria-describedby="personalityInstructions-help"
            />
            <p
              id="personalityInstructions-help"
              className="text-sm text-muted-foreground"
            >
              {t("assistantPersonalityUx.instructionsHelp")}
            </p>
            <p className="text-xs text-muted-foreground">
              {value.personalityInstructions.length} / 2000
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
