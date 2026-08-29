import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 64_000;
const MAX_CLOCK_SKEW_SECONDS = 300;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

export class ConnectorProtocolError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ConnectorProtocolError";
  }
}

export function connectorSignature(secret: string, timestamp: string, raw: Buffer): string {
  return `v1=${createHmac("sha256", secret).update(timestamp).update("\n").update(raw).digest("hex")}`;
}

type HeaderBag = Record<string, string | string[] | undefined>;

function header(headers: HeaderBag, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function strictJsonObject(rawBody: Buffer): Record<string, unknown> {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new ConnectorProtocolError("Connector body is not valid UTF-8 JSON", 400, "INVALID_JSON");
  }

  let index = 0;
  const whitespace = /\s/;

  function skipWhitespace() {
    while (index < source.length && whitespace.test(source[index])) index++;
  }

  function parseString(): string {
    const start = index;
    if (source[index] !== '"') throw new Error("string expected");
    index++;
    let escaped = false;
    while (index < source.length) {
      const character = source[index++];
      if (!escaped && character === '"') {
        return JSON.parse(source.slice(start, index)) as string;
      }
      if (!escaped && character === "\\") escaped = true;
      else escaped = false;
    }
    throw new Error("unterminated string");
  }

  function parseValue(depth: number): unknown {
    if (depth > 64) throw new Error("maximum JSON depth exceeded");
    skipWhitespace();
    const character = source[index];
    if (character === "{") return parseObject(depth + 1);
    if (character === "[") return parseArray(depth + 1);
    if (character === '"') return parseString();

    const remainder = source.slice(index);
    for (const [token, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (remainder.startsWith(token)) {
        index += token.length;
        return value;
      }
    }
    const number = remainder.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      index += number[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new Error("invalid number");
      return value;
    }
    throw new Error("invalid JSON value");
  }

  function parseObject(depth: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const keys = new Set<string>();
    index++;
    skipWhitespace();
    if (source[index] === "}") {
      index++;
      return result;
    }
    while (index < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) {
        throw new ConnectorProtocolError(`Duplicate JSON key: ${key}`, 400, "DUPLICATE_JSON_KEY");
      }
      keys.add(key);
      skipWhitespace();
      if (source[index++] !== ":") throw new Error("colon expected");
      result[key] = parseValue(depth);
      skipWhitespace();
      const delimiter = source[index++];
      if (delimiter === "}") return result;
      if (delimiter !== ",") throw new Error("object delimiter expected");
    }
    throw new Error("unterminated object");
  }

  function parseArray(depth: number): unknown[] {
    const result: unknown[] = [];
    index++;
    skipWhitespace();
    if (source[index] === "]") {
      index++;
      return result;
    }
    while (index < source.length) {
      result.push(parseValue(depth));
      skipWhitespace();
      const delimiter = source[index++];
      if (delimiter === "]") return result;
      if (delimiter !== ",") throw new Error("array delimiter expected");
    }
    throw new Error("unterminated array");
  }

  try {
    const parsed = parseValue(0);
    skipWhitespace();
    if (index !== source.length || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("root object required");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ConnectorProtocolError) throw error;
    throw new ConnectorProtocolError("Connector body is invalid JSON", 400, "INVALID_JSON");
  }
}

export function authenticateConnectorRequest({
  headers,
  rawBody,
  secret,
  nowSeconds = Math.floor(Date.now() / 1_000),
}: {
  headers: HeaderBag;
  rawBody: Buffer;
  secret: string;
  nowSeconds?: number;
}): {
  body: Record<string, unknown>;
  idempotencyKey: string;
  bodyHash: string;
} {
  if (header(headers, "content-type").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ConnectorProtocolError("Connector content type must be application/json", 415, "UNSUPPORTED_MEDIA_TYPE");
  }
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new ConnectorProtocolError("Connector body is required", 400, "BODY_REQUIRED");
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    throw new ConnectorProtocolError("Connector body is too large", 413, "BODY_TOO_LARGE");
  }
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new ConnectorProtocolError("Connector signing secret is unavailable", 503, "SIGNING_SECRET_UNAVAILABLE");
  }

  const timestamp = header(headers, "x-zahypi-connector-timestamp");
  if (!/^\d{10}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
    throw new ConnectorProtocolError("Connector timestamp is invalid or stale", 401, "INVALID_TIMESTAMP");
  }
  const provided = header(headers, "x-zahypi-connector-signature");
  const expected = connectorSignature(secret, timestamp, rawBody);
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new ConnectorProtocolError("Connector signature is invalid", 401, "INVALID_SIGNATURE");
  }

  const idempotencyKey = header(headers, "idempotency-key");
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new ConnectorProtocolError("Connector idempotency key is invalid", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  return {
    body: strictJsonObject(rawBody),
    idempotencyKey,
    bodyHash: createHash("sha256").update(rawBody).digest("hex"),
  };
}
