import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  Plus,
  Trash2,
  Package,
  Briefcase,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SETUP_CATALOG_LIMIT,
  setupCatalogDraft,
  setupWebUrl,
} from "@shared/setup-catalog";

interface ProductsServicesStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  skipStep: () => void;
}
type Kind = "products" | "services";
type Field =
  | "name"
  | "price"
  | "description"
  | "currency"
  | "category"
  | "imageUrl"
  | "productUrl";
const isRow = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fieldText = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

export default function ProductsServicesStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
}: ProductsServicesStepProps) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<{
    kind: Kind;
    index: number | null;
    value: unknown;
  } | null>(null);
  const catalog = setupCatalogDraft.safeParse(wizardData);
  const issues = catalog.success ? [] : catalog.error.issues;
  const rowsFor = (kind: Kind): unknown[] =>
    Array.isArray(wizardData[kind]) ? wizardData[kind] : [];
  const hasInvalidContainer = (kind: Kind) =>
    wizardData[kind] !== undefined && !Array.isArray(wizardData[kind]);
  const count = catalog.success
    ? catalog.data.products.length + catalog.data.services.length
    : 0;
  const setRows = (kind: Kind, rows: unknown[]) =>
    updateWizardData({ [kind]: rows });
  const add = (kind: Kind) => {
    const rows = rowsFor(kind);
    if (hasInvalidContainer(kind) || rows.length >= SETUP_CATALOG_LIMIT) return;
    if (removed?.kind === kind && removed.index === null) setRemoved(null);
    setRows(kind, [
      ...rows,
      { id: crypto.randomUUID(), name: "", price: "", description: "" },
    ]);
  };
  const remove = (kind: Kind, index: number | null) => {
    const rows = rowsFor(kind);
    setRemoved({
      kind,
      index,
      value: index === null ? wizardData[kind] : rows[index],
    });
    setRows(
      kind,
      index === null ? [] : rows.filter((_, rowIndex) => rowIndex !== index)
    );
    setTouched(new Set());
  };
  const undo = () => {
    if (!removed) return;
    const rows = [...rowsFor(removed.kind)];
    if (removed.index !== null && rows.length >= SETUP_CATALOG_LIMIT) return;
    if (removed.index === null)
      updateWizardData({ [removed.kind]: removed.value });
    else {
      rows.splice(removed.index, 0, removed.value);
      setRows(removed.kind, rows);
    }
    setRemoved(null);
  };
  const update = (kind: Kind, index: number, field: Field, value: string) => {
    setRows(
      kind,
      rowsFor(kind).map((row, rowIndex) =>
        rowIndex === index && isRow(row) ? { ...row, [field]: value } : row
      )
    );
  };
  const proceed = () => {
    setAttempted(true);
    if (!catalog.success) {
      queueMicrotask(() =>
        root.current
          ?.querySelector<HTMLElement>("[data-catalog-errors]")
          ?.focus()
      );
      return;
    }
    if (count) goToNextStep();
    else skipStep();
  };
  const renderRow = (raw: unknown, kind: Kind, index: number) => {
    const title = t(
      kind === "products"
        ? "setupCatalogUx.productNumber"
        : "setupCatalogUx.serviceNumber",
      { number: index + 1 }
    );
    if (!isRow(raw))
      return (
        <section className="ms-catalog-item" key={index} aria-label={title}>
          <h3>{title}</h3>
          <p role="alert">{t("setupCatalogUx.invalidRow")}</p>
          <details className="ms-details">
            <summary>{t("setupCatalogUx.originalData")}</summary>
            <pre>{JSON.stringify(raw, null, 2)}</pre>
          </details>
          <Button variant="outline" onClick={() => remove(kind, index)}>
            {t("setupCatalogUx.removeInvalid")}
          </Button>
        </section>
      );
    const rowIssues = issues.filter(
      issue => issue.path[0] === kind && issue.path[1] === index
    );
    const fieldError = (field: Field) =>
      rowIssues.some(issue => issue.path[2] === field);
    const idFor = (field: Field) => `setup-${kind}-${index}-${field}`;
    const showError = (field: Field) =>
      fieldError(field) && (attempted || touched.has(idFor(field)));
    const optionalError = [
      "description",
      "category",
      "imageUrl",
      "productUrl",
    ].some(field => showError(field as Field));
    const fields = (field: Field, multiline = false) => {
      const id = idFor(field);
      const label = {
        name: t("setupCatalogUx.name"),
        price: t("setupCatalogUx.price"),
        description: t("setupCatalogUx.description"),
        category: t("setupCatalogUx.category"),
        imageUrl: t("setupCatalogUx.imageUrl"),
        productUrl: t("setupCatalogUx.productUrl"),
        currency: t("setupCatalogUx.currency"),
      }[field];
      const maxLength = {
        name: 255,
        price: 32,
        description: 5000,
        category: 100,
        imageUrl: 500,
        productUrl: 500,
        currency: 3,
      }[field];
      const error = {
        name: t("setupCatalogUx.nameError"),
        price: t("setupCatalogUx.priceError"),
        description: t("setupCatalogUx.descriptionError"),
        category: t("setupCatalogUx.categoryError"),
        imageUrl: t("setupCatalogUx.urlError"),
        productUrl: t("setupCatalogUx.urlError"),
        currency: t("setupCatalogUx.currencyError"),
      }[field];
      const props = {
        id,
        value: fieldText(raw[field]),
        maxLength,
        "aria-invalid": showError(field),
        "aria-describedby":
          [
            showError(field) ? `${id}-error` : "",
            field === "price" ? "setup-price-hint" : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        onBlur: () => setTouched(previous => new Set(previous).add(id)),
        onChange: (
          event: ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >
        ) => update(kind, index, field, event.target.value),
      };
      return (
        <div className="ms-catalog-field">
          <Label htmlFor={id}>
            {label}
            {field === "name" || field === "price" ? " *" : ""}
          </Label>
          {field === "currency" ? (
            <select
              {...props}
              value={
                raw.currency === undefined ? "SAR" : fieldText(raw.currency)
              }
            >
              {!["SAR", "USD", undefined].includes(
                raw.currency as string | undefined
              ) && (
                <option value={fieldText(raw.currency)}>
                  {t("setupCatalogUx.invalidCurrency", {
                    value: fieldText(raw.currency),
                  })}
                </option>
              )}
              <option value="SAR">{t("setupCatalogUx.sar")}</option>
              <option value="USD">{t("setupCatalogUx.usd")}</option>
            </select>
          ) : multiline ? (
            <Textarea {...props} rows={2} />
          ) : (
            <Input
              {...props}
              type="text"
              inputMode={
                field === "price"
                  ? "decimal"
                  : field.endsWith("Url")
                    ? "url"
                    : "text"
              }
              dir={
                field === "price" || field.endsWith("Url") ? "ltr" : undefined
              }
              placeholder={field === "price" ? "0.00" : undefined}
            />
          )}
          {showError(field) && (
            <p className="ms-field-error" id={`${id}-error`}>
              {error}
            </p>
          )}
        </div>
      );
    };
    const imageUrl = setupWebUrl.safeParse(raw.imageUrl);
    return (
      <section className="ms-catalog-item" key={index} aria-label={title}>
        <header>
          <h3>{title}</h3>
          <Button
            variant="ghost"
            onClick={() => remove(kind, index)}
            aria-label={t("merchantUx.actions.removeNamed", {
              name: fieldText(raw.name) || title,
            })}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </header>
        {fields("name")}
        <div className="ms-catalog-price">
          {fields("price")}
          {kind === "products" ? (
            fields("currency")
          ) : (
            <p>{t("setupCatalogUx.sar")}</p>
          )}
        </div>
        <details className="ms-details" open={optionalError || undefined}>
          <summary>{t("setupCatalogUx.more")}</summary>
          {fields("description", true)}
          {kind === "products" && (
            <>
              {fields("category")}
              {fields("productUrl")}
              {fields("imageUrl")}
              {imageUrl.success && imageUrl.data && (
                <img
                  src={imageUrl.data}
                  alt={fieldText(raw.name)}
                  width={64}
                  height={64}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="ms-catalog-image"
                />
              )}
            </>
          )}
        </details>
      </section>
    );
  };
  return (
    <div ref={root} className="ms-catalog-entry">
      <p>{t("setupCatalogUx.intro")}</p>
      <p id="setup-price-hint" className="text-sm text-muted-foreground">
        {t("setupCatalogUx.priceHint")}
      </p>
      {attempted && !catalog.success && (
        <div
          className="ms-catalog-error"
          role="alert"
          tabIndex={-1}
          data-catalog-errors
        >
          {t("setupCatalogUx.reviewInvalid")}
        </div>
      )}
      {removed && (
        <div role="status" className="ms-catalog-undo">
          <span>{t("setupCatalogUx.removed")}</span>
          <Button
            variant="ghost"
            onClick={undo}
            disabled={
              removed.index !== null &&
              rowsFor(removed.kind).length >= SETUP_CATALOG_LIMIT
            }
          >
            <Undo2 aria-hidden="true" />
            {t("setupCatalogUx.undo")}
          </Button>
        </div>
      )}
      {(["products", "services"] as const).map(kind => {
        const rows = rowsFor(kind);
        const chosen =
          wizardData.businessType === "both" ||
          (kind === "products"
            ? wizardData.businessType !== "services"
            : wizardData.businessType === "services");
        if (!chosen && !rows.length && !hasInvalidContainer(kind)) return null;
        const Icon = kind === "products" ? Package : Briefcase;
        return (
          <section
            className="ms-catalog-group"
            key={kind}
            aria-labelledby={`setup-${kind}-title`}
          >
            <header>
              <h2 id={`setup-${kind}-title`}>
                <Icon aria-hidden="true" />
                {t(
                  kind === "products"
                    ? "setupCatalogUx.products"
                    : "setupCatalogUx.services"
                )}{" "}
                <small>
                  {rows.length}/{SETUP_CATALOG_LIMIT}
                </small>
              </h2>
              <Button
                variant="outline"
                onClick={() => add(kind)}
                disabled={
                  hasInvalidContainer(kind) ||
                  rows.length >= SETUP_CATALOG_LIMIT
                }
              >
                <Plus aria-hidden="true" />
                {t(
                  kind === "products"
                    ? "setupCatalogUx.addProduct"
                    : "setupCatalogUx.addService"
                )}
              </Button>
            </header>
            {!chosen && (
              <p className="text-sm text-muted-foreground">
                {t("setupCatalogUx.retained")}
              </p>
            )}
            {hasInvalidContainer(kind) ? (
              <div className="ms-catalog-error" role="alert">
                <p>{t("setupCatalogUx.invalidRows")}</p>
                <details className="ms-details">
                  <summary>{t("setupCatalogUx.originalData")}</summary>
                  <pre>{JSON.stringify(wizardData[kind], null, 2)}</pre>
                </details>
                <Button variant="outline" onClick={() => remove(kind, null)}>
                  {t("setupCatalogUx.clearInvalid")}
                </Button>
              </div>
            ) : rows.length ? (
              rows.map((row, index) => renderRow(row, kind, index))
            ) : (
              <p className="ms-catalog-empty">{t("setupCatalogUx.empty")}</p>
            )}
            {rows.length >= SETUP_CATALOG_LIMIT && (
              <p role="status">
                {t("setupCatalogUx.limit", { limit: SETUP_CATALOG_LIMIT })}
              </p>
            )}
          </section>
        );
      })}
      <div className="ms-actions">
        <Button size="lg" onClick={proceed}>
          {t(
            catalog.success && count === 0
              ? "setupCatalogUx.later"
              : "setupCatalogUx.next"
          )}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
