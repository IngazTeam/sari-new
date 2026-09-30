import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { setupTemplateHours } from "@shared/setup-template";
import { setupTextValue } from "@/lib/setup-field-validation";

export default function WorkingHoursFields({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const valid = setupTemplateHours.safeParse(value === undefined ? {} : value);
  const days: Record<string, string> = {
    saturday: t("setupTemplateUx.saturday"),
    sunday: t("setupTemplateUx.sunday"),
    monday: t("setupTemplateUx.monday"),
    tuesday: t("setupTemplateUx.tuesday"),
    wednesday: t("setupTemplateUx.wednesday"),
    thursday: t("setupTemplateUx.thursday"),
    friday: t("setupTemplateUx.friday"),
  };
  const data =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  const supported =
    Object.keys(data).every(key => key in days) &&
    Object.values(data).every(
      day => day && typeof day === "object" && !Array.isArray(day)
    );
  if (
    !supported ||
    (value !== undefined &&
      (value === null || typeof value !== "object" || Array.isArray(value)))
  )
    return (
      <div id="workingHours" tabIndex={-1} role="alert" className="space-y-3">
        <p>{t("setupFieldUx.hoursUnreadable")}</p>
        <details>
          <summary>{t("setupCatalogUx.originalData")}</summary>
          <pre className="ms-raw-field" dir="ltr">
            {JSON.stringify(value, null, 2)}
          </pre>
        </details>
        <Button variant="outline" onClick={() => onChange({})}>
          {t("setupFieldUx.resetHours")}
        </Button>
      </div>
    );
  const update = (key: string, patch: Record<string, unknown>) =>
    onChange({
      ...data,
      [key]: {
        isOpen: false,
        open: "09:00",
        close: "17:00",
        ...data[key],
        ...patch,
      },
    });
  return (
    <div id="workingHours" tabIndex={-1} className="space-y-3">
      <p>{t("setupFieldUx.hoursHelp")}</p>
      {Object.entries(days).map(([key, label]) => {
        const day = data[key],
          status =
            day?.isOpen === true
              ? "open"
              : day?.isOpen === false
                ? "closed"
                : "unspecified";
        const issues = valid.success
          ? []
          : valid.error.issues.filter(issue => issue.path[0] === key);
        return (
          <div className="ms-hours-row" key={key}>
            <label>
              {label}
              <select
                aria-label={t("setupFieldUx.dayStatus", { day: label })}
                value={status}
                onChange={e => {
                  if (e.target.value === "unspecified") {
                    const next = { ...data };
                    delete next[key];
                    onChange(next);
                  } else update(key, { isOpen: e.target.value === "open" });
                }}
              >
                <option value="unspecified">
                  {t("setupFieldUx.unspecified")}
                </option>
                <option value="open">{t("setupFieldUx.open")}</option>
                <option value="closed">{t("setupTemplateUx.closed")}</option>
              </select>
            </label>
            {status === "open" && (
              <>
                <label>
                  {t("setupFieldUx.opens")}
                  <input
                    type="time"
                    dir="ltr"
                    value={setupTextValue(day.open)}
                    aria-label={t("setupFieldUx.dayOpen", { day: label })}
                    aria-invalid={issues.some(
                      issue => issue.path[1] === "open"
                    )}
                    onChange={e => update(key, { open: e.target.value })}
                  />
                </label>
                <label>
                  {t("setupFieldUx.closes")}
                  <input
                    type="time"
                    dir="ltr"
                    value={setupTextValue(day.close)}
                    aria-label={t("setupFieldUx.dayClose", { day: label })}
                    aria-invalid={issues.some(
                      issue => issue.path[1] === "close"
                    )}
                    onChange={e => update(key, { close: e.target.value })}
                  />
                </label>
              </>
            )}
            {issues.length > 0 && (
              <p role="alert">
                {t("setupFieldUx.hoursError")}{" "}
                <Button
                  variant="ghost"
                  onClick={() =>
                    update(key, {
                      open: "09:00",
                      close: "17:00",
                      isOpen: status === "open",
                    })
                  }
                >
                  {t("setupFieldUx.resetDay", { day: label })}
                </Button>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
