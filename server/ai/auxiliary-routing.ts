import {
  AUXILIARY_AI_ROUTES,
  type AuxiliaryAiCapability,
} from "../../shared/ai-capabilities";
import { getOpenAiApiKey } from "../db_ai_settings";
import { resolveZahyPiRuntimeConfig } from "./zahypi-client";

export class AiAuxiliaryRoutingError extends Error {
  constructor(
    readonly code:
      | "disabled"
      | "unsupported_model"
      | "credentials_unavailable"
      | "credentials_changed"
  ) {
    super(`AI auxiliary capability ${code}`);
    this.name = "AiAuxiliaryRoutingError";
  }
}
export type AuxiliaryAiRoute = Readonly<{
  capability: AuxiliaryAiCapability;
  provider: "openai";
  model: string;
  apiKey: string;
}>;

/** Text-provider selection never implies that ZahyPi implements audio/embeddings. */
export async function resolveAuxiliaryAiRoute(
  capability: AuxiliaryAiCapability,
  requestedModel?: string,
  refresh = false
): Promise<AuxiliaryAiRoute> {
  if (!(await resolveZahyPiRuntimeConfig(undefined, { refresh })).enabled)
    throw new AiAuxiliaryRoutingError("disabled");
  const contract = AUXILIARY_AI_ROUTES[capability];
  if (requestedModel !== undefined && requestedModel !== contract.model)
    throw new AiAuxiliaryRoutingError("unsupported_model");
  let apiKey: string;
  try {
    apiKey = await getOpenAiApiKey();
  } catch {
    throw new AiAuxiliaryRoutingError("credentials_unavailable");
  }
  if (!apiKey) throw new AiAuxiliaryRoutingError("credentials_unavailable");
  return Object.freeze({
    capability,
    provider: contract.provider,
    model: contract.model,
    apiKey,
  });
}

/** Recheck after media download and the budget reservation, just before upload. */
export async function assertAuxiliaryAiRouteCurrent(
  route: AuxiliaryAiRoute
): Promise<void> {
  const current = await resolveAuxiliaryAiRoute(
    route.capability,
    route.model,
    true
  );
  if (current.apiKey !== route.apiKey)
    throw new AiAuxiliaryRoutingError("credentials_changed");
}
