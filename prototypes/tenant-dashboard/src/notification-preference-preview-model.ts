import {
  defaultNotificationPreferences,
  notificationPreferenceSave,
  notificationPreferenceWorkspace,
  type NotificationPreferenceWorkspace,
} from "../../../shared/notification-preferences-workspace";
import type { ServiceMode } from "./service-preview-model";
export const preferencePreviewQueries = [
  "notificationPreferences.workspace",
] as const;
export const preferencePreviewMutations = [
  "notificationPreferences.saveReviewed",
] as const;
export class PreferencePreviewStore {
  writes = 0;
  private version = 0;
  private saved = false;
  private values: NotificationPreferenceWorkspace["values"];
  constructor(
    readonly actorId: number,
    readonly merchantId: number,
    private mode: () => ServiceMode
  ) {
    this.saved = mode() !== "empty";
    this.values = {
      ...defaultNotificationPreferences,
      instantNotifications: true,
      batchNotifications: false,
      batchInterval: 30,
      ...(mode() === "legacy"
        ? { quietHoursStart: null, batchInterval: null }
        : {}),
    };
  }
  read() {
    return notificationPreferenceWorkspace.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      canManage: this.mode() !== "readonly",
      revision: [this.actorId, this.merchantId, this.version, 0, 0, 0, 0, 0]
        .map(n => n.toString(16).padStart(8, "0"))
        .join(""),
      status: !this.saved
        ? "default"
        : Object.values(this.values!).some(v => v === null)
          ? "invalid"
          : "saved",
      storedRecords: this.saved ? 1 : 0,
      values: this.values,
      invalidFields: Object.entries(this.values!)
        .filter(([, v]) => v === null)
        .map(([k]) => k),
      quietHoursTimeZone: "Asia/Riyadh",
      quietHoursBehavior: "suppressed_not_queued",
      quietHoursBypass: "whatsapp_disconnect",
      batchingAvailable: false,
      instantToggleApplied: false,
    });
  }
  mutate(input: unknown) {
    const { expectedRevision, ...fields } =
        notificationPreferenceSave.parse(input),
      before = this.read();
    if (!before.canManage) throw { data: { code: "FORBIDDEN" } };
    if (expectedRevision !== before.revision)
      throw { data: { code: "CONFLICT" } };
    const changed =
      !this.saved ||
      Object.entries(fields).some(([k, v]) => (this.values as any)[k] !== v);
    if (changed) {
      this.values = { ...this.values!, ...fields };
      this.saved = true;
      this.version++;
      this.writes++;
    }
    return { changed, workspace: this.read() };
  }
}
