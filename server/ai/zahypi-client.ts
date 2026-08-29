import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type ZahyPiMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

export type ZahyPiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ZahyPiChatResult = {
  content: string;
  model: string;
  usage?: ZahyPiUsage;
};

type ChatOptions = {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxAttempts?: number;
};

export type ZahyPiRuntimeConfig = {
  provider: "openai" | "zahypi";
  apiKey: string;
  baseUrl: string;
  projectId: string;
  model: string;
  source: "connector" | "database" | "environment" | "override";
};

export type ZahyPiRequestContext = {
  merchantId: number | string;
  userId?: number | string;
  taskType: string;
};

export type ZahyPiCompletionResponse = {
  id: string;
  object?: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "system" | "user" | "assistant" | "tool" | "function";
      content: string | ZahyPiContentPart[] | null;
      tool_calls?: ZahyPiToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: ZahyPiUsage;
};

type ZahyPiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | {
    type: "file_url";
    file_url: {
      url: string;
      mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
    };
  };

type ZahyPiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const requestContext = new AsyncLocalStorage<ZahyPiRequestContext>();

class ZahyPiResponseValidationError extends Error {}

type CircuitState = { failures: number; openedAt: number };

const circuitStates = new Map<string, CircuitState>();
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 60_000;
const MAX_CIRCUIT_STATES = 10_000;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 120_000;
const RUNTIME_CONFIG_CACHE_TTL_MS = 60_000;
let runtimeConfigCache: { value: ZahyPiRuntimeConfig; expiresAt: number } | null = null;

function canAttemptCircuit(key: string): boolean {
  const state = circuitStates.get(key);
  if (!state || state.failures < CIRCUIT_FAILURE_THRESHOLD) return true;
  if (Date.now() - state.openedAt < CIRCUIT_COOLDOWN_MS) return false;
  circuitStates.delete(key);
  return true;
}

function recordCircuitSuccess(key: string): void {
  circuitStates.delete(key);
}

function recordCircuitFailure(key: string): void {
  if (!circuitStates.has(key) && circuitStates.size >= MAX_CIRCUIT_STATES) {
    const oldestKey = circuitStates.keys().next().value;
    if (typeof oldestKey === "string") circuitStates.delete(oldestKey);
  }
  const state = circuitStates.get(key) ?? { failures: 0, openedAt: 0 };
  state.failures += 1;
  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) state.openedAt = Date.now();
  circuitStates.set(key, state);
}

export function zahyPiEnabled(): boolean {
  return process.env.ZAHYPI_ENABLED?.trim().toLowerCase() === "true";
}

function environmentRuntimeConfig(): ZahyPiRuntimeConfig {
  return {
    provider: zahyPiEnabled() ? "zahypi" : "openai",
    apiKey: process.env.ZAHYPI_API_KEY?.trim() || "",
    baseUrl: process.env.ZAHYPI_BASE_URL?.trim() || "https://api.zahypi.com/v1",
    projectId: process.env.ZAHYPI_PROJECT_ID?.trim() || "sari",
    model: process.env.ZAHYPI_DEFAULT_MODEL?.trim() || "qwen-local",
    source: "environment",
  };
}

export async function resolveZahyPiRuntimeConfig(
  override?: Omit<ZahyPiRuntimeConfig, "source">,
): Promise<ZahyPiRuntimeConfig> {
  if (override) return { ...override, source: "override" };
  if (runtimeConfigCache && runtimeConfigCache.expiresAt > Date.now()) {
    return runtimeConfigCache.value;
  }

  let value: ZahyPiRuntimeConfig;
  try {
    const { getZahyPiRuntimeConfig } = await import("../db_ai_settings");
    value = await getZahyPiRuntimeConfig();
  } catch (error) {
    console.warn("[ZahyPi] Failed to resolve stored settings, using env fallback:", error);
    value = environmentRuntimeConfig();
  }
  runtimeConfigCache = {
    value,
    expiresAt: Date.now() + RUNTIME_CONFIG_CACHE_TTL_MS,
  };
  return value;
}

export async function zahyPiTextGenerationEnabled(): Promise<boolean> {
  return (await resolveZahyPiRuntimeConfig()).provider === "zahypi";
}

export function clearZahyPiRuntimeConfigCache(): void {
  runtimeConfigCache = null;
}

export function runWithZahyPiContext<T>(
  context: ZahyPiRequestContext,
  operation: () => Promise<T>,
): Promise<T> {
  assertValidContext(context);
  return requestContext.run(context, operation);
}

export function getOptionalZahyPiRequestContext(): ZahyPiRequestContext | undefined {
  return requestContext.getStore();
}

export function getZahyPiRequestContext(): ZahyPiRequestContext {
  const context = getOptionalZahyPiRequestContext();
  if (!context) throw new Error("ZahyPi tenant context is required");
  return context;
}

export function validateZahyPiBaseUrl(rawValue?: string): string {
  const value = rawValue?.trim();
  if (!value) throw new Error("ZAHYPI_BASE_URL is required");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ZAHYPI_BASE_URL must be a valid HTTPS URL");
  }

  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error("ZAHYPI_BASE_URL must be a credential-free HTTPS URL");
  }

  const allowedOrigins = parseAllowedOrigins(
    process.env.ZAHYPI_ALLOWED_ORIGINS || "https://api.zahypi.com",
  );
  if (!allowedOrigins.includes(url.origin)) {
    throw new Error("ZAHYPI_BASE_URL must use an approved origin");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  if (normalizedPath !== "/v1") {
    throw new Error("ZAHYPI_BASE_URL must end with /v1");
  }
  return `${url.origin}/v1`;
}

function parseAllowedOrigins(rawValue: string): string[] {
  const origins = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0) {
    throw new Error("ZAHYPI_ALLOWED_ORIGINS must contain at least one HTTPS origin");
  }

  return origins.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("ZAHYPI_ALLOWED_ORIGINS must contain valid HTTPS origins");
    }
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
    ) {
      throw new Error("ZAHYPI_ALLOWED_ORIGINS must contain credential-free HTTPS origins");
    }
    return url.origin;
  });
}

function isUsage(value: unknown): value is ZahyPiUsage {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return ["prompt_tokens", "completion_tokens", "total_tokens"]
    .every((key) => isNonNegativeInteger(usage[key]));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0;
}

function assertValidContext(context: ZahyPiRequestContext): void {
  const merchantValid = isSafeContextIdentifier(context.merchantId);
  const userValid = context.userId === undefined
    || isSafeContextIdentifier(context.userId);
  const taskTypeValid = typeof context.taskType === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(context.taskType.trim());
  if (!merchantValid || !userValid || !taskTypeValid) {
    throw new Error("ZahyPi tenant context is required");
  }
}

function isSafeContextIdentifier(value: number | string): boolean {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.trim());
}

function normalizeHeaderIdentifier(value: string, envName: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error(`${envName} contains invalid characters`);
  }
  return normalized;
}

function assertSafeApiKey(value: string): void {
  if (value.length > 512 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new Error("ZAHYPI_API_KEY contains invalid characters");
  }
}

function normalizeModel(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(normalized)) {
    throw new Error("ZAHYPI_DEFAULT_MODEL contains invalid characters");
  }
  return normalized;
}

function isRole(value: unknown): value is ZahyPiCompletionResponse["choices"][number]["message"]["role"] {
  return ["system", "user", "assistant", "tool", "function"].includes(String(value));
}

function isContentPart(value: unknown): value is ZahyPiContentPart {
  if (!value || typeof value !== "object") return false;
  const part = value as Record<string, unknown>;
  if (part.type === "text") return typeof part.text === "string";
  if (part.type === "image_url") {
    const image = part.image_url as Record<string, unknown> | undefined;
    return Boolean(image)
      && typeof image?.url === "string"
      && (image.detail === undefined || ["auto", "low", "high"].includes(String(image.detail)));
  }
  if (part.type === "file_url") {
    const file = part.file_url as Record<string, unknown> | undefined;
    return Boolean(file)
      && typeof file?.url === "string"
      && (
        file.mime_type === undefined
        || ["audio/mpeg", "audio/wav", "application/pdf", "audio/mp4", "video/mp4"]
          .includes(String(file.mime_type))
      );
  }
  return false;
}

function isToolCall(value: unknown): value is ZahyPiToolCall {
  if (!value || typeof value !== "object") return false;
  const call = value as Record<string, unknown>;
  const fn = call.function as Record<string, unknown> | undefined;
  return typeof call.id === "string"
    && call.type === "function"
    && Boolean(fn)
    && typeof fn?.name === "string"
    && typeof fn?.arguments === "string";
}

function parseCompletionResponse(value: unknown): ZahyPiCompletionResponse {
  if (!value || typeof value !== "object") {
    throw new ZahyPiResponseValidationError("ZahyPi returned an invalid response");
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.id !== "string"
    || !isNonNegativeInteger(body.created)
    || typeof body.model !== "string"
    || !Array.isArray(body.choices)
    || body.choices.length === 0
    || (body.usage !== undefined && !isUsage(body.usage))
  ) {
    throw new ZahyPiResponseValidationError("ZahyPi returned an invalid response");
  }

  for (const rawChoice of body.choices) {
    if (!rawChoice || typeof rawChoice !== "object") {
      throw new ZahyPiResponseValidationError("ZahyPi returned an invalid response");
    }
    const choice = rawChoice as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    const toolCalls = message?.tool_calls;
    const validToolCalls = toolCalls === undefined
      || (Array.isArray(toolCalls) && toolCalls.every(isToolCall));
    const validContent = typeof message?.content === "string"
      || (Array.isArray(message?.content) && message.content.every(isContentPart))
      || (message?.content === null && Array.isArray(toolCalls) && toolCalls.length > 0);
    if (
      !isNonNegativeInteger(choice.index)
      || !message
      || !isRole(message.role)
      || !validContent
      || !validToolCalls
      || (choice.finish_reason !== null && typeof choice.finish_reason !== "string")
    ) {
      throw new ZahyPiResponseValidationError("ZahyPi returned an invalid response");
    }
  }

  return {
    id: body.id as string,
    ...(typeof body.object === "string" ? { object: body.object } : {}),
    created: body.created as number,
    model: body.model as string,
    choices: (body.choices as Array<Record<string, unknown>>).map((rawChoice) => {
      const message = rawChoice.message as Record<string, unknown>;
      return {
        index: rawChoice.index as number,
        message: {
          role: message.role as ZahyPiCompletionResponse["choices"][number]["message"]["role"],
          content: message.content as string | ZahyPiContentPart[] | null,
          ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls as ZahyPiToolCall[] } : {}),
        },
        finish_reason: rawChoice.finish_reason as string | null,
      };
    }),
    ...(body.usage === undefined ? {} : { usage: body.usage as ZahyPiUsage }),
  };
}

async function readBoundedJsonResponse(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ZahyPiResponseValidationError("ZahyPi response exceeds the size limit");
  }
  if (!response.body) {
    throw new ZahyPiResponseValidationError("ZahyPi returned an invalid response");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw new ZahyPiResponseValidationError("ZahyPi response exceeds the size limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ZahyPiResponseValidationError("ZahyPi returned an invalid response");
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function requestZahyPiChat(
  messages: ZahyPiMessage[],
  options: ChatOptions,
  context?: ZahyPiRequestContext,
  runtimeConfig?: Omit<ZahyPiRuntimeConfig, "source">,
): Promise<ZahyPiChatResult> {
  const body = await requestZahyPiCompletion({
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1_000,
  }, context, options.timeoutMs, options.maxAttempts, runtimeConfig);
  const content = body.choices[0]?.message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("ZahyPi returned an empty response");
  }

  return {
    content: content.trim(),
    model: body.model,
    usage: body.usage,
  };
}

export async function requestZahyPiCompletion(
  payload: Record<string, unknown>,
  context?: ZahyPiRequestContext,
  requestedTimeoutMs = 30_000,
  requestedMaxAttempts = 3,
  runtimeConfigOverride?: Omit<ZahyPiRuntimeConfig, "source">,
): Promise<ZahyPiCompletionResponse> {
  const resolvedContext = context ?? getZahyPiRequestContext();
  assertValidContext(resolvedContext);
  const runtimeConfig = await resolveZahyPiRuntimeConfig(runtimeConfigOverride);
  const baseUrl = validateZahyPiBaseUrl(runtimeConfig.baseUrl);
  const apiKey = runtimeConfig.apiKey.trim();
  const projectId = normalizeHeaderIdentifier(
    runtimeConfig.projectId,
    "ZAHYPI_PROJECT_ID",
  );
  const model = normalizeModel(runtimeConfig.model);
  if (!apiKey) {
    throw new Error("ZAHYPI_API_KEY is required when ZahyPi is enabled");
  }
  assertSafeApiKey(apiKey);
  const merchantHeader = String(resolvedContext.merchantId).trim();
  const userHeader = resolvedContext.userId === undefined
    ? undefined
    : String(resolvedContext.userId).trim();
  const taskType = resolvedContext.taskType.trim();
  const circuitKey = `${projectId}:merchant:${merchantHeader}`;
  if (!canAttemptCircuit(circuitKey)) {
    throw new Error("ZahyPi circuit breaker is open");
  }

  const traceId = randomUUID();
  const maxAttempts = Number.isFinite(requestedMaxAttempts)
    ? Math.max(1, Math.min(Math.trunc(requestedMaxAttempts), 3))
    : 1;
  const timeoutBudgetMs = Number.isFinite(requestedTimeoutMs)
    ? Math.max(1, Math.min(Math.trunc(requestedTimeoutMs), MAX_TIMEOUT_MS))
    : 30_000;
  let requestBody: string;
  try {
    requestBody = JSON.stringify({ ...payload, model });
  } catch {
    throw new Error("ZahyPi request payload is not serializable");
  }
  if (Buffer.byteLength(requestBody, "utf8") > MAX_REQUEST_BYTES) {
    throw new Error("ZahyPi request exceeds the size limit");
  }
  const deadline = Date.now() + timeoutBudgetMs;
  let finalError: Error | undefined;
  let circuitFailure = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      finalError = new Error(`ZahyPi timeout after ${timeoutBudgetMs / 1_000}s`);
      circuitFailure = true;
      break;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remainingMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-ZahyPi-Project": projectId,
          "X-ZahyPi-Tenant": `merchant:${merchantHeader}`,
          ...(userHeader === undefined
            ? {}
            : { "X-ZahyPi-User": userHeader }),
          "X-Trace-Id": traceId,
          "Idempotency-Key": traceId,
          "X-Task-Type": taskType,
          "X-Data-Classification": "red",
          "X-External-Processing": "deny",
        },
        body: requestBody,
        signal: controller.signal,
        redirect: "error",
      });

      if (response.ok) {
        const parsed = parseCompletionResponse(await readBoundedJsonResponse(response));
        recordCircuitSuccess(circuitKey);
        return parsed;
      }

      finalError = new Error(`ZahyPi request failed with status ${response.status}`);
      circuitFailure = isTransientStatus(response.status);
      if (!circuitFailure) break;
    } catch (error) {
      finalError = error instanceof Error && error.name === "AbortError"
        ? new Error(`ZahyPi timeout after ${timeoutBudgetMs / 1_000}s`)
        : error instanceof Error ? error : new Error("ZahyPi request failed");
      circuitFailure = true;
      if (error instanceof ZahyPiResponseValidationError) break;
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < maxAttempts) {
      const remainingAfterAttempt = deadline - Date.now();
      if (remainingAfterAttempt <= 0) break;
      await sleep(Math.min(
        250 * (2 ** (attempt - 1)),
        Math.floor(remainingAfterAttempt / 2),
      ));
    }
  }

  if (circuitFailure) recordCircuitFailure(circuitKey);
  throw finalError ?? new Error("ZahyPi request failed");
}
