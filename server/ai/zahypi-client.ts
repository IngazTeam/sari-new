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
  const state = circuitStates.get(key) ?? { failures: 0, openedAt: 0 };
  state.failures += 1;
  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) state.openedAt = Date.now();
  circuitStates.set(key, state);
}

export function zahyPiEnabled(): boolean {
  return process.env.ZAHYPI_ENABLED?.trim().toLowerCase() === "true";
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

  const allowedOrigins = (
    process.env.ZAHYPI_ALLOWED_ORIGINS || "https://api.zahypi.com"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
  if (!allowedOrigins.includes(url.origin)) {
    throw new Error("ZAHYPI_BASE_URL must use an approved origin");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  if (normalizedPath !== "/v1") {
    throw new Error("ZAHYPI_BASE_URL must end with /v1");
  }
  return `${url.origin}/v1`;
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
  const merchantValid = typeof context.merchantId === "number"
    ? Number.isFinite(context.merchantId) && context.merchantId > 0
    : typeof context.merchantId === "string" && context.merchantId.trim().length > 0;
  const userValid = context.userId === undefined
    || (typeof context.userId === "number" && Number.isFinite(context.userId) && context.userId > 0)
    || (typeof context.userId === "string" && context.userId.trim().length > 0);
  if (!merchantValid || !userValid || typeof context.taskType !== "string" || !context.taskType.trim()) {
    throw new Error("ZahyPi tenant context is required");
  }
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
): Promise<ZahyPiChatResult> {
  const body = await requestZahyPiCompletion({
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1_000,
  }, context, options.timeoutMs, options.maxAttempts);
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
): Promise<ZahyPiCompletionResponse> {
  const resolvedContext = context ?? getZahyPiRequestContext();
  assertValidContext(resolvedContext);
  const baseUrl = validateZahyPiBaseUrl(process.env.ZAHYPI_BASE_URL);
  const apiKey = process.env.ZAHYPI_API_KEY?.trim();
  const projectId = process.env.ZAHYPI_PROJECT_ID?.trim() || "sari";
  const model = process.env.ZAHYPI_DEFAULT_MODEL?.trim() || "qwen-local";
  if (!apiKey) {
    throw new Error("ZAHYPI_API_KEY is required when ZahyPi is enabled");
  }
  const circuitKey = `${projectId}:merchant:${resolvedContext.merchantId}`;
  if (!canAttemptCircuit(circuitKey)) {
    throw new Error("ZahyPi circuit breaker is open");
  }

  const traceId = randomUUID();
  const maxAttempts = Math.max(1, Math.min(requestedMaxAttempts, 3));
  const timeoutBudgetMs = Math.max(1, requestedTimeoutMs);
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
          "X-ZahyPi-Tenant": `merchant:${resolvedContext.merchantId}`,
          ...(resolvedContext.userId === undefined
            ? {}
            : { "X-ZahyPi-User": String(resolvedContext.userId) }),
          "X-Trace-Id": traceId,
          "Idempotency-Key": traceId,
          "X-Task-Type": resolvedContext.taskType,
          "X-Data-Classification": "red",
          "X-External-Processing": "deny",
        },
        body: JSON.stringify({ ...payload, model }),
        signal: controller.signal,
      });

      if (response.ok) {
        const parsed = parseCompletionResponse(await response.json());
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
