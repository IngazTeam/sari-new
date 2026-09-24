/** Routing supported by Sari's adapters, not a claim of live model certification. */
export const AI_CAPABILITY_MANIFEST_VERSION = 1;
export const AUXILIARY_AI_ROUTES = Object.freeze({
  transcription: Object.freeze({
    provider: "openai" as const,
    model: "whisper-1",
    maxFileBytes: 16 * 1024 * 1024,
  }),
  embedding: Object.freeze({
    provider: "openai" as const,
    model: "text-embedding-3-small",
    dimensions: 1536,
    maxInputCharacters: 30000,
  }),
});
export type AuxiliaryAiCapability = keyof typeof AUXILIARY_AI_ROUTES;
export type AiCredentialStatus = "configured" | "missing" | "unreadable";
export type AiCapabilityState = AiCredentialStatus | "disabled";
export type AiCapabilityManifest = {
  version: number;
  mode: "openai" | "mixed";
  enabled: boolean;
  rows: Array<{
    capability: "text" | "structured" | AuxiliaryAiCapability;
    provider: "openai" | "zahypi";
    model: string;
    state: AiCapabilityState;
  }>;
};
export function buildAiCapabilityManifest(input: {
  enabled: boolean;
  textProvider: "openai" | "zahypi";
  textModel: string;
  openaiCredential: AiCredentialStatus;
  zahypiCredential: AiCredentialStatus;
}): AiCapabilityManifest {
  const textState =
    input.textProvider === "zahypi"
      ? input.zahypiCredential
      : input.openaiCredential;
  return {
    version: AI_CAPABILITY_MANIFEST_VERSION,
    enabled: input.enabled,
    mode: input.textProvider === "zahypi" ? "mixed" : "openai",
    rows: [
      ...(["text", "structured"] as const).map(capability => ({
        capability,
        provider: input.textProvider,
        model: input.textModel,
        state: input.enabled ? textState : ("disabled" as const),
      })),
      ...(["transcription", "embedding"] as const).map(capability => ({
        capability,
        provider: AUXILIARY_AI_ROUTES[capability].provider,
        model: AUXILIARY_AI_ROUTES[capability].model,
        state: input.enabled ? input.openaiCredential : ("disabled" as const),
      })),
    ],
  };
}
