import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { useTranslation } from "react-i18next";
import {
  setupProfileDraft,
  setupProfileIssues,
  setupTextValue,
} from "@/lib/setup-field-validation";
import WorkingHoursFields from "./WorkingHoursFields";
interface BasicInfoStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  focusField?: string | null;
}
export default function BasicInfoStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  focusField,
}: BasicInfoStepProps) {
  const { t } = useTranslation();
  const data = setupProfileDraft(wizardData),
    issues = setupProfileIssues(wizardData);
  const [touched, setTouched] = useState<string[]>([]),
    [submitted, setSubmitted] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    if (!focusField) return;
    setSubmitted(true);
    setDetailsOpen(true);
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(
          focusField === "businessType" ? "business-type-title" : focusField
        )
        ?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [focusField]);
  const messages: Record<string, string> = {
    businessType: t("setupFieldUx.businessTypeError"),
    businessName: t("setupFieldUx.nameError"),
    phone: t("setupWorkspace.phoneInvalid"),
    address: t("setupFieldUx.addressError"),
    description: t("setupFieldUx.descriptionError"),
    workingHoursType: t("setupFieldUx.hoursTypeError"),
    workingHours: t("setupFieldUx.hoursError"),
  };
  const touch = (key: string) =>
    setTouched(old => (old.includes(key) ? old : [...old, key]));
  const error = (key: keyof typeof data) =>
    issues.includes(key) &&
    (submitted ||
      touched.includes(key) ||
      (data[key] != null &&
        typeof data[key] !== "string" &&
        key !== "workingHours"));
  const original = (key: keyof typeof data) =>
    data[key] != null &&
    typeof data[key] !== "string" &&
    key !== "workingHours" ? (
      <details>
        <summary>{t("setupCatalogUx.originalData")}</summary>
        <pre className="ms-raw-field" dir="ltr">
          {JSON.stringify(data[key], null, 2)}
        </pre>
        <Button
          variant="outline"
          onClick={() => updateWizardData({ [key]: "" })}
        >
          {t("setupFieldUx.clearInvalid")}
        </Button>
      </details>
    ) : null;
  const message = (key: keyof typeof data) =>
    error(key) ? (
      <p id={`${key}-error`} role="alert" className="ms-field-error">
        {messages[key]}
      </p>
    ) : null;
  const change = (key: string, value: unknown) => {
    touch(key);
    updateWizardData({ [key]: value });
  };
  const next = () => {
    setSubmitted(true);
    if (issues.length) {
      setDetailsOpen(true);
      requestAnimationFrame(() =>
        document
          .getElementById(
            issues[0] === "businessType" ? "business-type-title" : issues[0]
          )
          ?.focus()
      );
      return;
    }
    goToNextStep();
  };
  return (
    <div className="space-y-6">
      {issues.includes("businessType") && (
        <p role="alert">{messages.businessType}</p>
      )}
      <div className="space-y-2">
        <Label htmlFor="businessName">
          {t("wizardBasicInfoStepPage.text0")}
        </Label>
        <Input
          id="businessName"
          autoComplete="organization"
          value={setupTextValue(data.businessName)}
          required
          aria-invalid={error("businessName")}
          aria-describedby={
            error("businessName") ? "businessName-error" : undefined
          }
          onBlur={() => touch("businessName")}
          onChange={e => change("businessName", e.target.value)}
        />
        {message("businessName")}
        {original("businessName")}
      </div>
      <div className="space-y-2" onBlurCapture={() => touch("phone")}>
        <Label htmlFor="phone">{t("wizardBasicInfoStepPage.text2")}</Label>
        <PhoneInput
          id="phone"
          value={setupTextValue(data.phone)}
          onChange={value => change("phone", value)}
          ariaInvalid={error("phone")}
          ariaDescribedBy={error("phone") ? "phone-error" : undefined}
          required
          error={error("phone")}
          autoComplete="tel-national"
        />
        {message("phone")}
        {original("phone")}
        <p className="text-xs text-muted-foreground">
          {t("basicInfoStep.auto_1")}
        </p>
      </div>
      <details
        className="ms-details"
        open={detailsOpen}
        onToggle={e => setDetailsOpen(e.currentTarget.open)}
      >
        <summary>{t("setupWorkspace.moreDetails")}</summary>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="address">
              {t("wizardBasicInfoStepPage.text3")}
            </Label>
            <Input
              id="address"
              value={setupTextValue(data.address)}
              aria-invalid={error("address")}
              aria-describedby={error("address") ? "address-error" : undefined}
              onBlur={() => touch("address")}
              onChange={e => change("address", e.target.value)}
            />
            {message("address")}
            {original("address")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">
              {t("wizardBasicInfoStepPage.text5")}
            </Label>
            <Textarea
              id="description"
              rows={3}
              value={setupTextValue(data.description)}
              aria-invalid={error("description")}
              aria-describedby={
                error("description") ? "description-error" : undefined
              }
              onBlur={() => touch("description")}
              onChange={e => change("description", e.target.value)}
            />
            {message("description")}
            {original("description")}
          </div>
          <label className="ms-catalog-field">
            {t("wizardBasicInfoStepPage.text7")}
            <select
              id="workingHoursType"
              value={setupTextValue(data.workingHoursType)}
              aria-invalid={error("workingHoursType")}
              onChange={e => change("workingHoursType", e.target.value)}
            >
              {!["24_7", "weekdays", "custom"].includes(
                setupTextValue(data.workingHoursType)
              ) && (
                <option value={setupTextValue(data.workingHoursType)}>
                  {t("setupFieldUx.chooseHours")}
                </option>
              )}
              <option value="24_7">{t("setupApprovalUx.alwaysOpen")}</option>
              <option value="weekdays">{t("setupApprovalUx.weekdays")}</option>
              <option value="custom">{t("setupApprovalUx.customHours")}</option>
            </select>
          </label>
          {message("workingHoursType")}
          {(data.workingHoursType === "custom" ||
            issues.includes("workingHours")) && (
            <WorkingHoursFields
              value={data.workingHours}
              onChange={value => change("workingHours", value)}
            />
          )}
        </div>
      </details>
      <div className="ms-actions">
        <Button size="lg" onClick={next}>
          {t("basicInfoStep.auto_3")}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
