import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function AssistantOptionReview<
  T extends Record<string, string | number | boolean>,
>({
  draft,
  base,
  latest,
  labels,
  display,
  onApply,
  disabled,
}: {
  draft: T;
  base: T;
  latest: T;
  labels: Record<keyof T, string>;
  display: (key: keyof T, value: T[keyof T]) => string;
  onApply: (draft: T) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [choices, setChoices] = useState<Record<string, "mine" | "saved">>({});
  const keys = Object.keys(latest) as (keyof T)[];
  const conflicts = keys.filter(
    key =>
      draft[key] !== base[key] &&
      latest[key] !== base[key] &&
      draft[key] !== latest[key]
  );
  return (
    <section
      aria-label={t("assistantOptionUx.review")}
      className="space-y-4 rounded-xl border p-4"
    >
      <h2 className="font-semibold">{t("assistantOptionUx.review")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("assistantOptionUx.reviewHelp")}
      </p>
      {keys.map(key => (
        <fieldset
          key={String(key)}
          className="min-w-0 space-y-2 rounded-lg border p-3"
        >
          <legend className="px-1 text-sm font-semibold">{labels[key]}</legend>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {t("virtualTeamReview.saved")}
              <br />
              {display(key, latest[key])}
            </p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {t("virtualTeamReview.mine")}
              <br />
              {display(key, draft[key])}
            </p>
          </div>
          {conflicts.includes(key) && (
            <div className="flex flex-wrap gap-3">
              {(["saved", "mine"] as const).map(choice => (
                <label
                  key={choice}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`option-review-${String(key)}`}
                    checked={choices[String(key)] === choice}
                    onChange={() =>
                      setChoices(old => ({ ...old, [key]: choice }))
                    }
                  />
                  {t(
                    choice === "mine"
                      ? "virtualTeamReview.chooseMine"
                      : "virtualTeamReview.chooseSaved"
                  )}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      <Button
        type="button"
        disabled={disabled || conflicts.some(key => !choices[String(key)])}
        onClick={() => {
          const merged = { ...latest };
          for (const key of keys)
            if (draft[key] !== base[key] && choices[String(key)] !== "saved")
              Object.assign(merged, { [key]: draft[key] });
          onApply(merged);
        }}
      >
        {t("virtualTeamReview.applyReview")}
      </Button>
    </section>
  );
}
