import { createHash } from "node:crypto";
import { assistantSettingsDraft } from "../shared/assistant-settings-draft";
import { takeoverDraft } from "../shared/assistant-options";

export function assistantOptionRevision(
  settings: Record<string, any>,
  kind: "language" | "takeover"
) {
  const draft =
    kind === "language"
      ? { language: settings.language ?? "ar" }
      : takeoverDraft(settings);
  return createHash("sha256")
    .update(JSON.stringify({ merchantId: settings.merchantId, kind, draft }))
    .digest("hex");
}

export function botSettingsFormRevision(settings: Record<string, any>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        merchantId: settings.merchantId,
        ...assistantSettingsDraft(settings),
      })
    )
    .digest("hex");
}
export class AssistantSettingsConflictError extends Error {
  constructor() {
    super("Assistant settings changed; review the latest version");
    this.name = "AssistantSettingsConflictError";
  }
}
