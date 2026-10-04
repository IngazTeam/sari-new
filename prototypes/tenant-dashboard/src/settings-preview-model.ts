import {
  merchantProfileFields,
  merchantProfileSave,
  merchantProfileWorkspace,
  type MerchantProfileWorkspace,
} from "../../../shared/merchant-profile-workspace";
import {
  selfProfileWorkspace,
  selfProfileRename,
} from "../../../shared/self-profile-workspace";
import { setupResetInput } from "../../../shared/setup-progress";
import type { ServiceMode } from "./service-preview-model";
export const settingsPreviewQueries = [
  "merchants.profileWorkspace",
  "auth.selfProfileWorkspace",
  "setupWizard.getProgress",
] as const;
export const settingsPreviewMutations = [
  "merchants.profileSaveReviewed",
  "auth.renameReviewed",
  "auth.emailVerification.sendVerificationEmail",
  "setupWizard.resetWizard",
] as const;
export class SettingsPreviewStore {
  writes = 0;
  private profileVersion = 0;
  private accountVersion = 0;
  private setupVersion = 0;
  private completed = true;
  private values: MerchantProfileWorkspace["values"];
  private accountName: string | null;
  private email: string | null;
  constructor(
    readonly actorId: number,
    readonly merchantId: number,
    private mode: () => ServiceMode
  ) {
    this.values = {
      businessName: merchantId === 269 ? "متجر نواة" : "متجر المدار",
      phone: "",
      autoReplyEnabled: true,
      timezone: "Asia/Riyadh",
      logoUrl: null,
    };
    this.accountName = merchantId === 269 ? "أحمد" : "سارة";
    this.email = "account-" + actorId + "@example.test";
    if (mode() === "legacy") {
      this.values = { ...this.values, timezone: null, autoReplyEnabled: null };
      this.accountName = null;
      this.email = null;
    }
  }
  private revision(kind: number, version: number) {
    return [this.actorId, this.merchantId, kind, version, 0, 0, 0, 0]
      .map(n => n.toString(16).padStart(8, "0"))
      .join("");
  }
  read(name: string) {
    if (name === "auth.selfProfileWorkspace")
      return selfProfileWorkspace.parse({
        actorId: this.actorId,
        name: this.accountName,
        email: this.email,
        emailVerified: this.email ? false : null,
        revision: this.revision(2, this.accountVersion),
      });
    if (name === "setupWizard.getProgress") {
      if (this.mode() === "readonly") throw { data: { code: "FORBIDDEN" } };
      return {
        actorId: this.actorId,
        merchantId: this.merchantId,
        digest: this.revision(3, this.setupVersion),
        revision: this.setupVersion,
        currency: "SAR",
        currentStep: this.completed ? 10 : 1,
        completedSteps: JSON.stringify(
          this.completed ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : []
        ),
        wizardData: "{}",
        isCompleted: this.completed ? 1 : 0,
        draftUnreadable: false,
      };
    }
    const canView = this.mode() !== "readonly";
    return merchantProfileWorkspace.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      canView,
      canManage: canView,
      values: canView ? this.values : null,
      revision: canView ? this.revision(1, this.profileVersion) : null,
      invalidFields: canView
        ? Object.entries(this.values!)
            .filter(([k, v]) => k !== "logoUrl" && v === null)
            .map(([k]) => k)
        : [],
    });
  }
  mutate(name: string, input: unknown) {
    if (name === "auth.emailVerification.sendVerificationEmail") {
      if (!this.email) throw { data: { code: "BAD_REQUEST" } };
      this.writes++;
      return {
        success: true,
        alreadyVerified: false,
        message: "Local delivery accepted",
      };
    }
    if (name === "auth.renameReviewed") {
      const parsed = selfProfileRename.parse(input);
      if (parsed.expectedRevision !== this.revision(2, this.accountVersion))
        throw { data: { code: "CONFLICT" } };
      const changed = this.accountName !== parsed.name;
      if (changed) {
        this.accountName = parsed.name;
        this.accountVersion++;
        this.writes++;
      }
      return { changed, workspace: this.read("auth.selfProfileWorkspace") };
    }
    if (this.mode() === "readonly") throw { data: { code: "FORBIDDEN" } };
    if (name === "setupWizard.resetWizard") {
      const parsed = setupResetInput.parse(input);
      if (parsed.expectedDigest !== this.revision(3, this.setupVersion))
        throw { data: { code: "CONFLICT" } };
      this.setupVersion++;
      this.completed = false;
      this.writes++;
      return this.read("setupWizard.getProgress");
    }
    const { expectedRevision, ...fields } = merchantProfileSave.parse(input);
    if (expectedRevision !== this.revision(1, this.profileVersion))
      throw { data: { code: "CONFLICT" } };
    const changed = merchantProfileFields
      .keyof()
      .options.some(k => this.values![k] !== fields[k]);
    if (changed) {
      this.values = fields;
      this.profileVersion++;
      this.writes++;
    }
    return { changed, workspace: this.read("merchants.profileWorkspace") };
  }
}
