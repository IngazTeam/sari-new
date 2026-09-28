import { createHash } from "node:crypto";
import { assistantSettingsDraft } from "../shared/assistant-settings-draft";

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
