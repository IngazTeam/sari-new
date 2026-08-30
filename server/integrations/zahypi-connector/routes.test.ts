import type { Server } from "node:http";
import { createHash } from "node:crypto";

import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { connectorSignature } from "./protocol";
import { createZahyPiConnectorRouter } from "./routes";

const signingSecret = "sari-connector-signing-secret-at-least-32-bytes";
const nowSeconds = 1_788_019_200;
const activationId = "11111111-1111-4111-8111-111111111111";
const taskTypesHash = createHash("sha256").update(JSON.stringify(["sari.reply"])).digest("hex");
const evidenceHash = "b".repeat(64);
const listeners: Server[] = [];

const repository = {
  activateConnectorCredential: vi.fn(),
  getActiveConnectorCredential: vi.fn(),
  reserveConnectorReceipt: vi.fn(),
  completeConnectorReceipt: vi.fn(),
};
const activationVerifier = { verify: vi.fn() };

async function withConnectorServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  const router = createZahyPiConnectorRouter({
    repository,
    activationVerifier,
    signingSecret: () => signingSecret,
    nowSeconds: () => nowSeconds,
    rateLimit: false,
  });
  app.use("/zahypi", router);
  app.use("/api/zahypi", router);
  app.use(express.json());

  const listener = await new Promise<Server>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  listeners.push(listener);
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("test listener did not bind");
  await run(`http://127.0.0.1:${address.port}`);
}

function bootstrapPayload() {
  return {
    protocol: "zahypi.project-bootstrap.v1",
    operation: "bootstrap",
    credential_generation: 1,
    activation_id: activationId,
    project_slug: "sari",
    gateway_base_url: "https://api.zahypi.test/v1",
    api_key: "zk_sari_demo_key_001",
    api_key_prefix: "zk_sari_",
    scopes: ["jobs:read", "jobs:write", "sari:reply"],
    task_types: ["sari.reply"],
    task_types_hash: taskTypesHash,
    activation_evidence_hash: evidenceHash,
  };
}

async function signedPost(baseUrl: string, path: string, body: string, operation: string) {
  const timestamp = String(nowSeconds);
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ZahyPi-Connector-Timestamp": timestamp,
      "X-ZahyPi-Connector-Signature": connectorSignature(signingSecret, timestamp, Buffer.from(body)),
      "Idempotency-Key": `${activationId}:${operation}:g1`,
    },
    body,
  });
}

async function signedResponseBody(response: Response): Promise<Record<string, unknown>> {
  const timestamp = response.headers.get("x-zahypi-connector-timestamp");
  const signature = response.headers.get("x-zahypi-connector-signature");
  const raw = Buffer.from(await response.arrayBuffer());

  expect(timestamp).toBe(String(nowSeconds));
  expect(signature).toBe(connectorSignature(signingSecret, timestamp!, raw));
  return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.reserveConnectorReceipt.mockResolvedValue({ kind: "reserved", receiptId: 9 });
  repository.activateConnectorCredential.mockResolvedValue({
    projectId: "sari",
    generation: 1,
    taskTypesHash,
  });
  repository.completeConnectorReceipt.mockResolvedValue(undefined);
  repository.getActiveConnectorCredential.mockResolvedValue({
    projectId: "sari",
    generation: 1,
    apiKey: "zk_sari_demo_key_001",
    taskTypes: ["sari.reply"],
    taskTypesHash,
  });
  activationVerifier.verify.mockResolvedValue({
    job_id: "22222222-2222-4222-8222-222222222222",
    trace_id: "activation-trace-1",
    run_manifest_id: "33333333-3333-4333-8333-333333333333",
    route: "qwen-core",
    duration_ms: 120,
    usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
  });
});

afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => new Promise<void>((resolve, reject) =>
    listener.close((error) => error ? reject(error) : resolve()),
  )));
});

describe("ZahyPi connector HTTP routes", () => {
  it("stores a signed bootstrap and returns only protocol evidence", async () => {
    await withConnectorServer(async (baseUrl) => {
      const response = await signedPost(
        baseUrl,
        "/zahypi/bootstrap",
        JSON.stringify(bootstrapPayload()),
        "bootstrap",
      );
      const body = await signedResponseBody(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        status: "configured",
        protocol: "zahypi.project-bootstrap.v1",
        operation: "bootstrap",
        credential_generation: 1,
        activation_id: activationId,
        project_slug: "sari",
        task_types_hash: taskTypesHash,
        activation_evidence_hash: evidenceHash,
      });
      expect(JSON.stringify(body)).not.toContain("zk_sari_demo_key_001");
      expect(repository.activateConnectorCredential).toHaveBeenCalledWith(expect.objectContaining({
        projectId: "sari",
        generation: 1,
        apiKey: "zk_sari_demo_key_001",
        taskTypes: ["sari.reply"],
      }));
      expect(repository.completeConnectorReceipt).toHaveBeenCalledOnce();
    });
  });

  it("rejects unknown bootstrap fields and a mismatched task hash", async () => {
    await withConnectorServer(async (baseUrl) => {
      const invalid = { ...bootstrapPayload(), unexpected: true };
      const unknownField = await signedPost(
        baseUrl,
        "/api/zahypi/bootstrap",
        JSON.stringify(invalid),
        "bootstrap",
      );
      expect(unknownField.status).toBe(422);

      const wrongHash = await signedPost(
        baseUrl,
        "/zahypi/bootstrap",
        JSON.stringify({ ...bootstrapPayload(), task_types_hash: "c".repeat(64) }),
        "bootstrap",
      );
      expect(wrongHash.status).toBe(422);
      expect(repository.activateConnectorCredential).not.toHaveBeenCalled();
    });
  });

  it("rejects unsigned or duplicate-key requests before repository access", async () => {
    await withConnectorServer(async (baseUrl) => {
      const unsigned = await fetch(`${baseUrl}/zahypi/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bootstrapPayload()),
      });
      expect(unsigned.status).toBe(401);

      const valid = JSON.stringify(bootstrapPayload());
      const duplicate = valid.replace('"operation":"bootstrap"', '"operation":"bootstrap","operation":"verify"');
      const duplicateResponse = await signedPost(baseUrl, "/zahypi/bootstrap", duplicate, "bootstrap");
      expect(duplicateResponse.status).toBe(400);
      expect(repository.activateConnectorCredential).not.toHaveBeenCalled();
    });
  });

  it("verifies the exact active generation through a real-job verifier boundary", async () => {
    await withConnectorServer(async (baseUrl) => {
      const payload = {
        protocol: "zahypi.project-verify.v1",
        operation: "verify",
        credential_generation: 1,
        activation_id: activationId,
        project_slug: "sari",
        task_types_hash: taskTypesHash,
        activation_evidence_hash: evidenceHash,
      };
      const response = await signedPost(baseUrl, "/zahypi/verify", JSON.stringify(payload), "verify");
      const body = await signedResponseBody(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        status: "verified",
        api_reachable: true,
        smoke_passed: true,
        credential_generation: 1,
        job_id: "22222222-2222-4222-8222-222222222222",
        run_manifest_id: "33333333-3333-4333-8333-333333333333",
      });
      expect(activationVerifier.verify).toHaveBeenCalledWith(expect.objectContaining({
        activationId,
        generation: 1,
      }));
    });
  });

  it("returns a stored exact replay and rejects a conflicting idempotency key", async () => {
    await withConnectorServer(async (baseUrl) => {
      repository.reserveConnectorReceipt.mockResolvedValueOnce({
        kind: "replay",
        responseStatus: 200,
        response: { status: "configured", receipt_id: "receipt-replay" },
      });
      const replay = await signedPost(
        baseUrl,
        "/zahypi/bootstrap",
        JSON.stringify(bootstrapPayload()),
        "bootstrap",
      );
      expect(replay.status).toBe(200);
      expect(await signedResponseBody(replay)).toEqual({ status: "configured", receipt_id: "receipt-replay" });

      repository.reserveConnectorReceipt.mockRejectedValueOnce(new Error("conflict"));
      const conflict = await signedPost(
        baseUrl,
        "/zahypi/bootstrap",
        JSON.stringify(bootstrapPayload()),
        "bootstrap",
      );
      expect(conflict.status).toBe(409);
    });
  });
});
