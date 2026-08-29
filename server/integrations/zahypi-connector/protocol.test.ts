import { describe, expect, it } from "vitest";

import {
  ConnectorProtocolError,
  authenticateConnectorRequest,
  connectorSignature,
} from "./protocol";

const secret = "sari-connector-signing-secret-at-least-32-bytes";
const timestamp = "1788019200";
const rawBody = Buffer.from('{"operation":"bootstrap","generation":1}');

function headers(overrides: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-zahypi-connector-timestamp": timestamp,
    "x-zahypi-connector-signature": connectorSignature(secret, timestamp, rawBody),
    "idempotency-key": "activation-demo:bootstrap:g1",
    ...overrides,
  };
}

describe("ZahyPi connector protocol", () => {
  it("authenticates the exact signed bytes and returns a bounded parsed object", () => {
    expect(authenticateConnectorRequest({
      headers: headers(),
      rawBody,
      secret,
      nowSeconds: Number(timestamp) + 30,
    })).toMatchObject({
      body: { operation: "bootstrap", generation: 1 },
      idempotencyKey: "activation-demo:bootstrap:g1",
    });
  });

  it("rejects a stale timestamp or a signature over different bytes", () => {
    expect(() => authenticateConnectorRequest({
      headers: headers(),
      rawBody,
      secret,
      nowSeconds: Number(timestamp) + 301,
    })).toThrow(ConnectorProtocolError);

    expect(() => authenticateConnectorRequest({
      headers: headers(),
      rawBody: Buffer.from('{"operation":"verify","generation":1}'),
      secret,
      nowSeconds: Number(timestamp),
    })).toThrow(/signature/i);
  });

  it("rejects duplicate JSON keys at any nesting depth", () => {
    const duplicate = Buffer.from('{"operation":"bootstrap","nested":{"value":1,"value":2}}');
    const duplicateHeaders = headers({
      "x-zahypi-connector-signature": connectorSignature(secret, timestamp, duplicate),
    });

    expect(() => authenticateConnectorRequest({
      headers: duplicateHeaders,
      rawBody: duplicate,
      secret,
      nowSeconds: Number(timestamp),
    })).toThrow(/duplicate/i);
  });

  it("rejects non-JSON content and bodies larger than 64,000 bytes", () => {
    expect(() => authenticateConnectorRequest({
      headers: headers({ "content-type": "text/plain" }),
      rawBody,
      secret,
      nowSeconds: Number(timestamp),
    })).toThrow(/content type/i);

    const oversized = Buffer.alloc(64_001, 0x20);
    expect(() => authenticateConnectorRequest({
      headers: headers({
        "x-zahypi-connector-signature": connectorSignature(secret, timestamp, oversized),
      }),
      rawBody: oversized,
      secret,
      nowSeconds: Number(timestamp),
    })).toThrow(/too large/i);
  });
});
