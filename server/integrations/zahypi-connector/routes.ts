import { createHash } from "node:crypto";

import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { resolveSariTaskType } from "../../ai/task-catalog";
import { activationVerifier as defaultActivationVerifier } from "./activation-verifier";
import {
  activateConnectorCredential,
  completeConnectorReceipt,
  ConnectorConflictError,
  getActiveConnectorCredential,
  reserveConnectorReceipt,
} from "./repository";
import {
  authenticateConnectorRequest,
  connectorSignature,
  ConnectorProtocolError,
} from "./protocol";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const receiptText = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const generation = z.number().int().min(0).max(1_000);
const taskType = z.string().regex(/^sari\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const uniqueStrings = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).min(1).max(max)
  .refine((items) => new Set(items).size === items.length, "Values must be unique");

const bootstrapSchema = z.strictObject({
  protocol: z.literal("zahypi.project-bootstrap.v1"),
  operation: z.literal("bootstrap"),
  credential_generation: generation,
  activation_id: z.string().uuid(),
  project_slug: z.literal("sari"),
  gateway_base_url: z.string().url().max(512),
  api_key: z.string().min(16).max(512),
  api_key_prefix: z.string().min(1).max(16),
  scopes: uniqueStrings(receiptText, 100),
  task_types: uniqueStrings(taskType, 100),
  task_types_hash: hashSchema,
  activation_evidence_hash: hashSchema,
});

const verifySchema = z.strictObject({
  protocol: z.literal("zahypi.project-verify.v1"),
  operation: z.literal("verify"),
  credential_generation: generation,
  activation_id: z.string().uuid(),
  project_slug: z.literal("sari"),
  task_types_hash: hashSchema,
  activation_evidence_hash: hashSchema,
});

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function receiptId(bodyHash: string, operation: "bootstrap" | "verify"): string {
  return `${operation}-${bodyHash.slice(0, 24)}`;
}

function signedJsonResponse(
  response: Response,
  status: number,
  body: Record<string, unknown>,
  secret: string,
  timestamp: string,
): void {
  const raw = Buffer.from(JSON.stringify(body));
  response
    .status(status)
    .type("application/json")
    .set("X-ZahyPi-Connector-Timestamp", timestamp)
    .set("X-ZahyPi-Connector-Signature", connectorSignature(secret, timestamp, raw))
    .send(raw);
}

function errorDetails(error: unknown): { status: number; body: { status: "error"; code: string } } {
  if (error instanceof ConnectorProtocolError) {
    return { status: error.status, body: { status: "error", code: error.code } };
  }
  if (error instanceof ConnectorConflictError || (error instanceof Error && /conflict/i.test(error.message))) {
    return { status: 409, body: { status: "error", code: "CONNECTOR_CONFLICT" } };
  }
  if (error instanceof z.ZodError || (error instanceof Error && /task type|task hash|generation|scope|base url|prefix/i.test(error.message))) {
    return { status: 422, body: { status: "error", code: "CONNECTOR_REQUEST_INVALID" } };
  }
  return { status: 503, body: { status: "error", code: "CONNECTOR_UNAVAILABLE" } };
}

async function errorResponse(
  response: Response,
  error: unknown,
  repository: ConnectorRepositoryBoundary,
  reservedReceiptId: number | null,
): Promise<void> {
  const details = errorDetails(error);
  if (reservedReceiptId !== null) {
    try {
      await repository.completeConnectorReceipt({
        receiptId: reservedReceiptId,
        responseStatus: details.status,
        response: details.body,
      });
    } catch {
      // The original protocol failure remains the safest response if persistence is unavailable.
    }
  }
  response.status(details.status).json(details.body);
}

type ConnectorRepositoryBoundary = {
  activateConnectorCredential: typeof activateConnectorCredential;
  getActiveConnectorCredential: typeof getActiveConnectorCredential;
  reserveConnectorReceipt: typeof reserveConnectorReceipt;
  completeConnectorReceipt: typeof completeConnectorReceipt;
};

export function createZahyPiConnectorRouter({
  repository = {
    activateConnectorCredential,
    getActiveConnectorCredential,
    reserveConnectorReceipt,
    completeConnectorReceipt,
  },
  activationVerifier = defaultActivationVerifier,
  signingSecret = () => process.env.SARI_BOOTSTRAP_SECRET?.trim() || "",
  nowSeconds = () => Math.floor(Date.now() / 1_000),
  rateLimit: enableRateLimit = true,
}: {
  repository?: ConnectorRepositoryBoundary;
  activationVerifier?: Pick<typeof defaultActivationVerifier, "verify">;
  signingSecret?: () => string;
  nowSeconds?: () => number;
  rateLimit?: boolean;
} = {}) {
  const router = express.Router();
  if (enableRateLimit) {
    router.use(rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
    }));
  }
  router.use(express.raw({ type: "application/json", limit: "64kb" }));

  async function authenticate(request: Request) {
    return authenticateConnectorRequest({
      headers: request.headers,
      rawBody: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      secret: signingSecret(),
      nowSeconds: nowSeconds(),
    });
  }

  router.post("/bootstrap", async (request, response) => {
    let reservedReceiptId: number | null = null;
    try {
      const authenticated = await authenticate(request);
      const body = bootstrapSchema.parse(authenticated.body);
      const gatewayUrl = new URL(body.gateway_base_url);
      if (gatewayUrl.protocol !== "https:" || gatewayUrl.username || gatewayUrl.password) {
        throw new Error("Connector base URL must use HTTPS without credentials");
      }
      if (!body.api_key.startsWith(body.api_key_prefix)) throw new Error("Connector API key prefix mismatch");
      if (!body.scopes.includes("jobs:read") || !body.scopes.includes("jobs:write")) {
        throw new Error("Connector scopes must include jobs read and write");
      }
      for (const name of body.task_types) {
        if (resolveSariTaskType(name).taskType !== name) throw new Error("Connector task type must be canonical");
      }
      if (canonicalHash([...body.task_types].sort()) !== body.task_types_hash) {
        throw new Error("Connector task hash mismatch");
      }

      const reservation = await repository.reserveConnectorReceipt({
        projectId: body.project_slug,
        action: "bootstrap",
        idempotencyKey: authenticated.idempotencyKey,
        bodyHash: authenticated.bodyHash,
      });
      if (reservation.kind === "replay") {
        signedJsonResponse(
          response,
          reservation.responseStatus,
          reservation.response,
          signingSecret(),
          String(nowSeconds()),
        );
        return;
      }
      if (reservation.kind === "in_progress") {
        response.status(409).json({ status: "error", code: "CONNECTOR_IN_PROGRESS" });
        return;
      }
      reservedReceiptId = reservation.receiptId;

      await repository.activateConnectorCredential({
        projectId: body.project_slug,
        generation: body.credential_generation,
        apiKey: body.api_key,
        baseUrl: body.gateway_base_url,
        model: process.env.ZAHYPI_DEFAULT_MODEL?.trim() || "qwen-local",
        taskTypes: body.task_types,
      });
      const result = {
        status: "configured",
        protocol: body.protocol,
        operation: body.operation,
        credential_generation: body.credential_generation,
        activation_id: body.activation_id,
        project_slug: body.project_slug,
        task_types_hash: body.task_types_hash,
        activation_evidence_hash: body.activation_evidence_hash,
        receipt_id: receiptId(authenticated.bodyHash, "bootstrap"),
      };
      await repository.completeConnectorReceipt({
        receiptId: reservation.receiptId,
        responseStatus: 200,
        response: result,
      });
      reservedReceiptId = null;
      signedJsonResponse(response, 200, result, signingSecret(), String(nowSeconds()));
    } catch (error) {
      await errorResponse(response, error, repository, reservedReceiptId);
    }
  });

  router.post("/verify", async (request, response) => {
    let reservedReceiptId: number | null = null;
    try {
      const authenticated = await authenticate(request);
      const body = verifySchema.parse(authenticated.body);
      const credential = await repository.getActiveConnectorCredential(body.project_slug);
      if (!credential
        || credential.generation !== body.credential_generation
        || credential.taskTypesHash !== body.task_types_hash) {
        throw new ConnectorConflictError("Connector activation state does not match verification request");
      }
      const reservation = await repository.reserveConnectorReceipt({
        projectId: body.project_slug,
        action: "verify",
        idempotencyKey: authenticated.idempotencyKey,
        bodyHash: authenticated.bodyHash,
      });
      if (reservation.kind === "replay") {
        signedJsonResponse(
          response,
          reservation.responseStatus,
          reservation.response,
          signingSecret(),
          String(nowSeconds()),
        );
        return;
      }
      if (reservation.kind === "in_progress") {
        response.status(409).json({ status: "error", code: "CONNECTOR_IN_PROGRESS" });
        return;
      }
      reservedReceiptId = reservation.receiptId;

      const evidence = await activationVerifier.verify({
        credential,
        activationId: body.activation_id,
        generation: body.credential_generation,
      });
      const result = {
        status: "verified",
        protocol: body.protocol,
        operation: body.operation,
        credential_generation: body.credential_generation,
        activation_id: body.activation_id,
        project_slug: body.project_slug,
        task_types_hash: body.task_types_hash,
        activation_evidence_hash: body.activation_evidence_hash,
        api_reachable: true,
        smoke_passed: true,
        receipt_id: receiptId(authenticated.bodyHash, "verify"),
        ...evidence,
      };
      await repository.completeConnectorReceipt({
        receiptId: reservation.receiptId,
        responseStatus: 200,
        response: result,
      });
      reservedReceiptId = null;
      signedJsonResponse(response, 200, result, signingSecret(), String(nowSeconds()));
    } catch (error) {
      await errorResponse(response, error, repository, reservedReceiptId);
    }
  });

  return router;
}

export default createZahyPiConnectorRouter();
