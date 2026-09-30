import { useEffect } from "react";
import { calculateQuotation } from "@shared/quotation-mutations";
import {
  quotationFormInput,
  type QuotationForm,
} from "@/lib/quotation-editor-cache";
import { quotationDisplay } from "@/lib/quotation-display";
export function QuotationEditor({
  form,
  onChange,
  errors,
  disabled,
  t,
  language,
}: {
  form: QuotationForm;
  onChange: (v: QuotationForm) => void;
  errors: Record<string, boolean>;
  disabled: boolean;
  t: (key: string) => string;
  language: string;
}) {
  const f = quotationDisplay(t, language),
    parsed = quotationFormInput(form, "11111111-1111-4111-8111-111111111111");
  const totals = parsed.success
    ? calculateQuotation(parsed.data.items, parsed.data.taxBasisPoints)
    : null;
  useEffect(() => {
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`qt-${first}`)?.focus();
  }, [errors]);
  const fieldError = (path: string) =>
    path === "customerPhone"
      ? t("quotationWorkspace.invalidPhone")
      : path.endsWith(".name")
        ? t("quotationWorkspace.requiredItem")
        : path.endsWith(".quantity")
          ? t("quotationWorkspace.invalidQuantity")
          : path.endsWith(".unitPrice")
            ? t("quotationWorkspace.invalidPrice")
            : path === "taxBasisPoints"
              ? t("quotationWorkspace.invalidTax")
              : path === "validDays"
                ? t("quotationWorkspace.invalidDays")
                : t("quotationWorkspace.invalidField");
  const field = (
    path: string,
    label: string,
    value: string,
    change: (value: string) => void,
    options: {
      maxLength?: number;
      inputMode?: "decimal" | "numeric" | "tel";
      dir?: "ltr" | "auto";
    } = {}
  ) => (
    <label htmlFor={`qt-${path}`}>
      {label}
      <input
        id={`qt-${path}`}
        value={value}
        onChange={e => change(e.target.value)}
        {...options}
        disabled={disabled}
        aria-invalid={!!errors[path]}
        aria-describedby={errors[path] ? `qt-${path}-error` : undefined}
      />
      {errors[path] && (
        <span className="qt-field-error" id={`qt-${path}-error`}>
          {fieldError(path)}
        </span>
      )}
    </label>
  );
  return (
    <div className="qt-editor-fields">
      <p className="qt-note">{t("quotationWorkspace.draftNote")}</p>
      <div className="qt-editor-grid">
        {field(
          "customerName",
          t("quotationWorkspace.customerOptional"),
          form.customerName,
          v => onChange({ ...form, customerName: v }),
          { maxLength: 255, dir: "auto" }
        )}
        {field(
          "customerPhone",
          t("quotationWorkspace.phoneOptional"),
          form.customerPhone,
          v => onChange({ ...form, customerPhone: v }),
          { maxLength: 16, inputMode: "tel", dir: "ltr" }
        )}
      </div>
      {form.items.map((item, i) => (
        <fieldset key={i} disabled={disabled}>
          <legend>
            {t("quotationWorkspace.item")} {f.number(i + 1)}
          </legend>
          <div className="qt-item-heading">
            <span>{t("quotationWorkspace.itemHint")}</span>
            {form.items.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...form,
                    items: form.items.filter((_, j) => j !== i),
                  })
                }
                aria-label={`${t("quotationWorkspace.removeItem")} ${i + 1}`}
              >
                {t("quotationWorkspace.removeItem")}
              </button>
            )}
          </div>
          {field(
            `items.${i}.name`,
            t("quotationWorkspace.itemName"),
            item.name,
            v =>
              onChange({
                ...form,
                items: form.items.map((x, j) =>
                  j === i ? { ...x, name: v } : x
                ),
              }),
            { maxLength: 500, dir: "auto" }
          )}
          {field(
            `items.${i}.description`,
            t("quotationWorkspace.description"),
            item.description,
            v =>
              onChange({
                ...form,
                items: form.items.map((x, j) =>
                  j === i ? { ...x, description: v } : x
                ),
              }),
            { maxLength: 1000, dir: "auto" }
          )}
          <div className="qt-editor-grid">
            {field(
              `items.${i}.quantity`,
              t("quotationWorkspace.quantity"),
              item.quantity,
              v =>
                onChange({
                  ...form,
                  items: form.items.map((x, j) =>
                    j === i ? { ...x, quantity: v } : x
                  ),
                }),
              { maxLength: 12, inputMode: "decimal", dir: "ltr" }
            )}
            {field(
              `items.${i}.unitPrice`,
              t("quotationWorkspace.unitPrice"),
              item.unitPrice,
              v =>
                onChange({
                  ...form,
                  items: form.items.map((x, j) =>
                    j === i ? { ...x, unitPrice: v } : x
                  ),
                }),
              { maxLength: 14, inputMode: "decimal", dir: "ltr" }
            )}
          </div>
          {totals && (
            <p>
              {t("quotationWorkspace.lineTotal")}:{" "}
              {f.money(Math.round(totals.items[i].total * 100), form.currency)}
            </p>
          )}
        </fieldset>
      ))}
      {errors.items && (
        <p role="alert" className="qt-field-error">
          {t("quotationWorkspace.itemLimit")}
        </p>
      )}
      <button
        type="button"
        disabled={disabled || form.items.length >= 50}
        onClick={() =>
          onChange({
            ...form,
            items: [
              ...form.items,
              { name: "", description: "", quantity: "1", unitPrice: "0" },
            ],
          })
        }
      >
        {t("quotationWorkspace.addItem")} ({form.items.length}/50)
      </button>
      <div className="qt-editor-grid">
        <label htmlFor="qt-currency">
          {t("quotationWorkspace.currency")}
          <select
            id="qt-currency"
            value={form.currency}
            disabled={disabled}
            onChange={e =>
              onChange({ ...form, currency: e.target.value as "SAR" | "USD" })
            }
          >
            <option value="SAR">SAR</option>
            <option value="USD">USD</option>
          </select>
        </label>
        {field(
          "taxBasisPoints",
          t("quotationWorkspace.taxPercent"),
          form.tax,
          v => onChange({ ...form, tax: v }),
          { maxLength: 6, inputMode: "decimal", dir: "ltr" }
        )}
        {field(
          "validDays",
          t("quotationWorkspace.validDays"),
          form.validDays,
          v => onChange({ ...form, validDays: v }),
          { maxLength: 3, inputMode: "numeric", dir: "ltr" }
        )}
      </div>
      <dl className="qt-totals">
        <div>
          <dt>{t("quotationWorkspace.subtotal")}</dt>
          <dd>{f.money(totals?.subtotalMinor ?? null, form.currency)}</dd>
        </div>
        <div>
          <dt>{t("quotationWorkspace.tax")}</dt>
          <dd>{f.money(totals?.taxMinor ?? null, form.currency)}</dd>
        </div>
        <div>
          <dt>{t("quotationWorkspace.total")}</dt>
          <dd>{f.money(totals?.totalMinor ?? null, form.currency)}</dd>
        </div>
      </dl>
    </div>
  );
}
