import {
  paymentSettingsDefaults,
  paymentSettingsWorkspace,
  paymentSettingsSave,
  paymentSettingsReview,
  paymentSettingsSaveResult,
  paymentSettingsProbeResult,
  type PaymentSettingsWorkspace,
} from "../../../shared/payment-settings-workspace";
import type { ServiceMode } from "./service-preview-model";
export class PaymentSettingsPreviewStore {
  writes = 0;
  private version = 0;
  private present = true;
  private verified = false;
  private key: string | null = "sk_test_preview_only";
  private values: NonNullable<PaymentSettingsWorkspace["values"]>;
  constructor(
    readonly actorId: number,
    readonly merchantId: number,
    private mode: () => ServiceMode
  ) {
    this.values = {
      ...paymentSettingsDefaults,
      tapPublicKey: "pk_test_preview_" + merchantId,
    };
    if (mode() === "empty") {
      this.present = false;
      this.key = null;
      this.values = { ...paymentSettingsDefaults };
    }
    if (mode() === "legacy") {
      this.values = {
        ...this.values,
        tapEnabled: null,
        tapTestMode: null,
        defaultCurrency: null,
      };
      this.key = "invalid";
    }
  }
  private revision() {
    return [this.actorId, this.merchantId, 463, this.version, 0, 0, 0, 0]
      .map(v => v.toString(16).padStart(8, "0"))
      .join("");
  }
  read() {
    const canView = this.mode() !== "readonly",
      invalidFields = Object.entries(this.values)
        .filter(([, v]) => v === null)
        .map(([k]) => k);
    const secretState =
      this.key === "invalid" ? "invalid" : this.key ? "stored" : "missing";
    if (secretState === "invalid") invalidFields.push("secret");
    const keysMatchMode =
      secretState === "stored" &&
      this.values.tapTestMode !== null &&
      !!this.key?.startsWith(
        this.values.tapTestMode ? "sk_test_" : "sk_live_"
      ) &&
      !!this.values.tapPublicKey?.startsWith(
        this.values.tapTestMode ? "pk_test_" : "pk_live_"
      );
    return paymentSettingsWorkspace.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      canView,
      canManage: canView,
      revision: canView ? this.revision() : null,
      state: !canView
        ? "restricted"
        : !this.present
          ? "missing"
          : invalidFields.length
            ? "invalid"
            : "saved",
      storedRecords: canView && this.present ? 1 : 0,
      values: canView ? this.values : null,
      secretState: canView ? secretState : null,
      keysMatchMode: canView && keysMatchMode,
      verified: canView && this.verified,
      verifiedAt: canView && this.verified ? "2026-10-04T12:00:00.000Z" : null,
      ready:
        canView &&
        this.verified &&
        this.values.tapEnabled === true &&
        this.values.defaultCurrency === "SAR",
      invalidFields: canView ? invalidFields : [],
      automaticLinkDeliveryAvailable: false,
      customMessageApplied: false,
    });
  }
  mutate(name: string, input: unknown) {
    if (this.mode() === "readonly") throw { data: { code: "FORBIDDEN" } };
    if (name === "merchantPayments.probeReviewed") {
      const parsed = paymentSettingsReview.parse(input);
      if (parsed.expectedRevision !== this.revision())
        throw { data: { code: "CONFLICT" } };
      if (!this.read().keysMatchMode) throw { data: { code: "BAD_REQUEST" } };
      this.verified = this.mode() !== "credentials-invalid";
      this.version++;
      this.writes++;
      return paymentSettingsProbeResult.parse({
        outcome: this.verified ? "verified" : "rejected",
        workspace: this.read(),
      });
    }
    const parsed = paymentSettingsSave.parse(input);
    if (parsed.expectedRevision !== this.revision())
      throw { data: { code: "CONFLICT" } };
    const key =
      parsed.secret.action === "replace"
        ? parsed.secret.value
        : parsed.secret.action === "clear"
          ? null
          : this.key;
    if (
      parsed.tapEnabled &&
      (!key?.startsWith(parsed.tapTestMode ? "sk_test_" : "sk_live_") ||
        !parsed.tapPublicKey)
    )
      throw { data: { code: "BAD_REQUEST" } };
    const credentialsChanged =
      key !== this.key ||
      parsed.tapPublicKey !== this.values.tapPublicKey ||
      parsed.tapTestMode !== this.values.tapTestMode;
    const changed =
      !this.present ||
      credentialsChanged ||
      parsed.tapEnabled !== this.values.tapEnabled ||
      parsed.defaultCurrency !== this.values.defaultCurrency ||
      (!parsed.tapEnabled && this.verified);
    if (changed) {
      this.key = key;
      this.present = true;
      this.values = {
        ...this.values,
        tapEnabled: parsed.tapEnabled,
        tapPublicKey: parsed.tapPublicKey,
        tapTestMode: parsed.tapTestMode,
        defaultCurrency: parsed.defaultCurrency,
      };
      if (credentialsChanged || !parsed.tapEnabled) this.verified = false;
      this.version++;
      this.writes++;
    }
    return paymentSettingsSaveResult.parse({ changed, workspace: this.read() });
  }
}
