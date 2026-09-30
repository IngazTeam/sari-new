import {
  sheetsSettingsChange,
  sheetsDisconnect,
  sheetsSettingsView,
  type SheetsSettingsView,
} from "../../../shared/sheets-settings";
import {
  sheetsSetupInput,
  sheetsSetupRead,
  sheetsSetupAcknowledge,
  sheetsSetupAttempt,
  sheetsSetupTabs,
} from "../../../shared/sheets-setup";
import { importPreviewId } from "./import-model";
export const settingsPreviewScope = `${importPreviewId}:${importPreviewId}:sheets-settings`;
export const settingsModes = {
  unlinked: "قبل ربط الحساب",
  needsDestination: "حساب مربوط بلا ملف",
  ready: "وجهة جاهزة",
  oauthDisabled: "تعطيل إعداد Google",
  invalid: "بيانات ربط غير صالحة",
  loading: "تحميل",
  offline: "دون اتصال",
  readError: "فشل القراءة",
  forbidden: "دون صلاحية",
  session: "انتهاء الجلسة",
  wrongTenant: "نطاق مختلف",
  lostReply: "إنشاء ناجح وفقد الرد",
  created: "إيصال يحتاج استعادة",
  uncertain: "نتيجة غير مؤكدة",
  dispatching: "طلب ما زال جاريًا",
  detached: "تغير الربط بعد الإنشاء",
  oldReceipt: "إيصال لوجهة سابقة",
  rejected: "رفض قبل الإرسال",
  conflict: "تغير الإعدادات قبل الحفظ",
  saveLostReply: "حفظ ناجح وفقد الرد",
  disconnectLostReply: "فصل ناجح وفقد الرد",
  malformed: "رد قراءة غير صالح",
} as const;
export type SettingsMode = keyof typeof settingsModes;
type Attempt = ReturnType<typeof sheetsSetupAttempt.parse>;
const flags = () => ({
  sendDailyReports: false,
  sendWeeklyReports: false,
  sendMonthlyReports: false,
});
const id = "11111111-1111-4111-8111-111111111111";
const error = (code = "CONFLICT") =>
  Object.assign(Error("Local simulation"), { data: { code } });
export class SheetsSettingsStore {
  mode: SettingsMode = "unlinked";
  version = 1;
  starts = 0;
  saves = 0;
  disconnects = 0;
  oauth = 0;
  private settings: SheetsSettingsView;
  private attempt: Attempt | null = null;
  files = new Map<string, typeof sheetsSetupTabs>();
  constructor(private changed: () => void = () => {}) {
    this.settings = this.initial();
  }
  private digest = () => this.version.toString(16).padStart(64, "0");
  private initial(): SheetsSettingsView {
    return {
      merchantId: importPreviewId,
      actorId: importPreviewId,
      digest: this.digest(),
      hasIntegration: false,
      isConnected: false,
      oauthReady: true,
      state: "unlinked",
      reports: flags(),
    };
  }
  private notify = () => {
    this.settings.digest = this.digest();
    this.changed();
  };
  reset = () => {
    this.mode = "unlinked";
    this.version++;
    this.settings = this.initial();
    this.attempt = null;
    this.starts = this.saves = this.disconnects = this.oauth = 0;
    this.files.clear();
    this.notify();
  };
  setMode = (mode: SettingsMode) => {
    if (!(mode in settingsModes)) return;
    this.reset();
    this.mode = mode;
    if (!["unlinked", "oauthDisabled"].includes(mode))
      this.settings = {
        ...this.settings,
        hasIntegration: true,
        isConnected: true,
        state: "needs_destination",
      };
    if (
      [
        "ready",
        "conflict",
        "saveLostReply",
        "disconnectLostReply",
        "oldReceipt",
      ].includes(mode)
    ) {
      this.settings.state = "ready";
      this.settings.spreadsheetId = "local-settings-current";
      this.files.set("local-settings-current", sheetsSetupTabs);
    }
    if (mode === "oauthDisabled") this.settings.oauthReady = false;
    if (mode === "invalid") {
      this.settings.state = "credentials_invalid";
      this.settings.isConnected = false;
    }
    if (
      [
        "created",
        "uncertain",
        "dispatching",
        "detached",
        "rejected",
        "oldReceipt",
      ].includes(mode)
    ) {
      this.attempt = this.makeAttempt(
        id,
        mode === "oldReceipt" ? "completed" : (mode as Attempt["state"])
      );
      if (this.attempt.spreadsheetId)
        this.files.set(this.attempt.spreadsheetId, sheetsSetupTabs);
    }
    this.notify();
  };
  private access = () => {
    const codes: Partial<Record<SettingsMode, string>> = {
      forbidden: "FORBIDDEN",
      session: "UNAUTHORIZED",
      readError: "INTERNAL_SERVER_ERROR",
    };
    if (codes[this.mode]) throw error(codes[this.mode]);
  };
  status = () => {
    this.access();
    return structuredClone({
      ...this.settings,
      merchantId:
        this.mode === "wrongTenant" ? importPreviewId + 1 : importPreviewId,
      ...(this.mode === "malformed" ? { digest: "invalid" } : {}),
    });
  };
  read = () => {
    this.access();
    return structuredClone(this.attempt);
  };
  refresh = async () => {
    this.changed();
  };
  private checked = (digest: string) => {
    this.access();
    if (this.mode === "wrongTenant" || digest !== this.settings.digest)
      throw error();
  };
  begin = async () => {
    this.access();
    if (!this.settings.oauthReady) throw error();
    this.oauth++;
    this.changed();
    return {
      authorizationUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?state=local-preview-only",
    };
  };
  finishConnect = () => {
    this.version++;
    this.settings = {
      ...this.initial(),
      hasIntegration: true,
      isConnected: true,
      state: "needs_destination",
    };
    this.notify();
  };
  private makeAttempt(requestId: string, state: Attempt["state"]): Attempt {
    const at = new Date().toISOString(),
      confirmed = ["created", "completed", "detached"].includes(state),
      spreadsheetId = confirmed ? "local-settings-created" : null;
    return sheetsSetupAttempt.parse({
      merchantId: importPreviewId,
      actorId: importPreviewId,
      createdBy: importPreviewId,
      requestId,
      state,
      startedAt: at,
      finishedAt: ["preparing", "dispatching"].includes(state) ? null : at,
      canAcknowledge: ["uncertain", "detached"].includes(state),
      reason:
        state === "uncertain"
          ? "unconfirmed"
          : state === "detached"
            ? "changed"
            : state === "rejected"
              ? "authentication"
              : null,
      spreadsheetId,
      receipt: confirmed
        ? { requestId, spreadsheetId, templateVersion: 1, confirmedAt: at }
        : null,
    });
  }
  start = async (raw: unknown) => {
    const input = sheetsSetupInput.parse(raw);
    this.access();
    if (this.attempt?.requestId === input.requestId) return this.read()!;
    this.checked(input.expectedDigest);
    if (
      this.settings.state !== "needs_destination" ||
      (this.attempt &&
        ["preparing", "dispatching", "uncertain", "created"].includes(
          this.attempt.state
        ))
    )
      throw error();
    this.starts++;
    this.attempt = this.makeAttempt(input.requestId, "completed");
    this.settings.spreadsheetId = this.attempt.spreadsheetId!;
    this.settings.state = "ready";
    this.files.set(this.attempt.spreadsheetId!, sheetsSetupTabs);
    this.version++;
    this.notify();
    if (this.mode === "lostReply") throw error("BAD_GATEWAY");
    return this.read()!;
  };
  recover = async (raw: unknown) => {
    const input = sheetsSetupRead.required().parse(raw);
    this.access();
    if (
      !this.attempt ||
      this.attempt.requestId !== input.requestId ||
      this.attempt.state !== "created"
    )
      throw error();
    this.attempt.state = "completed";
    this.settings.state = "ready";
    this.settings.spreadsheetId = this.attempt.spreadsheetId!;
    this.version++;
    this.notify();
    return this.read()!;
  };
  acknowledge = async (raw: unknown) => {
    const input = sheetsSetupAcknowledge.parse(raw);
    this.access();
    if (
      !this.attempt ||
      this.attempt.requestId !== input.requestId ||
      !this.attempt.canAcknowledge
    )
      throw error();
    this.attempt.state = "acknowledged";
    this.attempt.canAcknowledge = false;
    this.notify();
    return this.read()!;
  };
  save = async (raw: unknown) => {
    const input = sheetsSettingsChange.parse(raw);
    this.checked(input.expectedDigest);
    if (this.mode === "conflict") {
      this.version++;
      this.notify();
      throw error();
    }
    if (
      Object.values(input.changes).some(Boolean) &&
      this.settings.state !== "ready"
    )
      throw error();
    this.settings.reports = { ...this.settings.reports, ...input.changes };
    this.saves++;
    this.version++;
    this.notify();
    if (this.mode === "saveLostReply") throw error("BAD_GATEWAY");
    return {
      success: true as const,
      ...sheetsSettingsView.parse(this.status()),
    };
  };
  disconnect = async (raw: unknown) => {
    const input = sheetsDisconnect.parse(raw);
    this.checked(input.expectedDigest);
    this.disconnects++;
    this.version++;
    this.settings = this.initial();
    this.notify();
    if (this.mode === "disconnectLostReply") throw error("BAD_GATEWAY");
    return { success: true as const, ...this.status() };
  };
}
