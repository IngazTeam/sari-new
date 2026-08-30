import { createHash } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import {
  zahyPiConnectorCredentials,
  zahyPiConnectorReceipts,
} from "../../../drizzle/schema_zahypi_connector";
import { decryptSecret, encryptSecret } from "../../security/secrets";

export type ConnectorAction = "bootstrap" | "verify";
export type ConnectorCredentialStatus = "active" | "superseded" | "revoked";
export type ConnectorReceiptStatus = "pending" | "completed";

export type ConnectorCredentialRow = {
  id: number;
  projectId: string;
  generation: number;
  baseUrl: string;
  model: string;
  apiKeyCiphertext: string;
  apiKeyHash: string;
  apiKeyPrefix: string;
  taskTypesJson: string;
  taskTypesHash: string;
  status: ConnectorCredentialStatus;
  activatedAt: Date;
  supersededAt: Date | null;
  createdAt: Date;
};

export type ConnectorReceiptRow = {
  id: number;
  projectId: string;
  action: ConnectorAction;
  idempotencyKey: string;
  bodyHash: string;
  status: ConnectorReceiptStatus;
  responseStatus: number | null;
  responseJson: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

type NewConnectorCredentialRow = Omit<ConnectorCredentialRow, "id">;
type NewConnectorReceiptRow = Omit<ConnectorReceiptRow, "id">;

export interface ZahyPiConnectorTransaction {
  lockCredentials(projectId: string): Promise<ConnectorCredentialRow[]>;
  insertCredential(row: NewConnectorCredentialRow): Promise<ConnectorCredentialRow>;
  supersedeActiveCredentials(projectId: string, supersededAt: Date): Promise<void>;
  lockReceipt(
    projectId: string,
    action: ConnectorAction,
    idempotencyKey: string,
  ): Promise<ConnectorReceiptRow | null>;
  insertReceipt(row: NewConnectorReceiptRow): Promise<ConnectorReceiptRow>;
  completeReceipt(
    id: number,
    completedAt: Date,
    responseStatus: number,
    responseJson: string,
  ): Promise<void>;
}

export interface ZahyPiConnectorStore {
  transaction<T>(callback: (tx: ZahyPiConnectorTransaction) => Promise<T>): Promise<T>;
}

export type ConnectorActivationInput = {
  projectId: string;
  generation: number;
  apiKey: string;
  baseUrl: string;
  model: string;
  taskTypes: readonly string[];
};

export type ConnectorCredentialSummary = {
  projectId: string;
  generation: number;
  baseUrl: string;
  model: string;
  apiKeyPrefix: string;
  taskTypes: string[];
  taskTypesHash: string;
  status: ConnectorCredentialStatus;
  activatedAt: Date;
  replayed: boolean;
};

export type ActiveConnectorCredential = Omit<ConnectorCredentialSummary, "replayed"> & {
  apiKey: string;
};

export type ReceiptReservation =
  | { kind: "reserved"; receiptId: number }
  | { kind: "in_progress" }
  | { kind: "replay"; responseStatus: number; response: Record<string, unknown> };

export class ConnectorConflictError extends Error {
  readonly code = "ZAHYPI_CONNECTOR_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ConnectorConflictError";
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalTaskTypes(taskTypes: readonly string[]): string[] {
  const canonical = Array.from(
    new Set(taskTypes.map((taskType) => taskType.trim())),
  ).sort();
  if (canonical.length === 0 || canonical.some((taskType) => !/^sari\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(taskType))) {
    throw new Error("Connector task types must contain valid sari.* names");
  }
  return canonical;
}

function validateActivation(input: ConnectorActivationInput): void {
  if (input.projectId !== "sari") throw new Error("Connector project must be sari");
  if (!Number.isSafeInteger(input.generation) || input.generation < 0 || input.generation > 1_000) {
    throw new Error("Connector generation must be an integer between 0 and 1000");
  }
  if (input.apiKey.length < 16 || input.apiKey.length > 512) {
    throw new Error("Connector API key length is invalid");
  }
  const baseUrl = new URL(input.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Connector base URL must use HTTPS");
  if (!input.model.trim() || input.model.length > 128) throw new Error("Connector model is invalid");
}

function taskTypesFromRow(row: ConnectorCredentialRow): string[] {
  const parsed = JSON.parse(row.taskTypesJson);
  if (!Array.isArray(parsed) || parsed.some((taskType) => typeof taskType !== "string")) {
    throw new Error("Stored connector task types are invalid");
  }
  return parsed;
}

function summaryFromRow(row: ConnectorCredentialRow, replayed: boolean): ConnectorCredentialSummary {
  return {
    projectId: row.projectId,
    generation: row.generation,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKeyPrefix: row.apiKeyPrefix,
    taskTypes: taskTypesFromRow(row),
    taskTypesHash: row.taskTypesHash,
    status: row.status,
    activatedAt: row.activatedAt,
    replayed,
  };
}

function stableResponseJson(response: Record<string, unknown>): string {
  const sensitiveKey = /(?:api.?key|authorization|credential|secret|token)/i;
  const safeCredentialMetadata = new Set(["credential_generation"]);

  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => {
        if (!safeCredentialMetadata.has(key) && sensitiveKey.test(key)) {
          throw new Error("Connector receipt cannot store credential fields");
        }
        return [key, normalize(child)];
      }));
  }

  const json = JSON.stringify(normalize(response));
  if (Buffer.byteLength(json) > 32_768) throw new Error("Connector receipt response is too large");
  return json;
}

export function createZahyPiConnectorRepository({
  store,
  seal,
  unseal,
  now = () => new Date(),
}: {
  store: ZahyPiConnectorStore;
  seal: (value: string) => string;
  unseal: (value: string) => string;
  now?: () => Date;
}) {
  async function activateConnectorCredential(
    input: ConnectorActivationInput,
  ): Promise<ConnectorCredentialSummary> {
    validateActivation(input);
    const taskTypes = canonicalTaskTypes(input.taskTypes);
    const taskTypesJson = JSON.stringify(taskTypes);
    const apiKeyHash = hash(input.apiKey);

    return store.transaction(async (tx) => {
      const credentials = await tx.lockCredentials(input.projectId);
      const newest = credentials[0];
      const sameGeneration = credentials.find((row) => row.generation === input.generation);

      if (newest && input.generation < newest.generation) {
        throw new ConnectorConflictError("Connector generation downgrade rejected");
      }
      if (sameGeneration) {
        const exact = sameGeneration.apiKeyHash === apiKeyHash
          && sameGeneration.baseUrl === input.baseUrl
          && sameGeneration.model === input.model
          && sameGeneration.taskTypesJson === taskTypesJson;
        if (!exact) throw new ConnectorConflictError("Connector generation replay conflicts with stored state");
        return summaryFromRow(sameGeneration, true);
      }

      const activatedAt = now();
      await tx.supersedeActiveCredentials(input.projectId, activatedAt);
      const inserted = await tx.insertCredential({
        projectId: input.projectId,
        generation: input.generation,
        baseUrl: input.baseUrl,
        model: input.model.trim(),
        apiKeyCiphertext: seal(input.apiKey),
        apiKeyHash,
        apiKeyPrefix: input.apiKey.slice(0, 8),
        taskTypesJson,
        taskTypesHash: hash(taskTypesJson),
        status: "active",
        activatedAt,
        supersededAt: null,
        createdAt: activatedAt,
      });
      return summaryFromRow(inserted, false);
    });
  }

  async function getActiveConnectorCredential(
    projectId: string,
  ): Promise<ActiveConnectorCredential | null> {
    return store.transaction(async (tx) => {
      const active = (await tx.lockCredentials(projectId)).find((row) => row.status === "active");
      if (!active) return null;
      const summary = summaryFromRow(active, false);
      const { replayed: _replayed, ...safeSummary } = summary;
      return { ...safeSummary, apiKey: unseal(active.apiKeyCiphertext) };
    });
  }

  async function getActiveConnectorCredentialSummary(
    projectId: string,
  ): Promise<Omit<ConnectorCredentialSummary, "replayed"> | null> {
    const credential = await getActiveConnectorCredential(projectId);
    if (!credential) return null;
    const { apiKey: _apiKey, ...summary } = credential;
    return summary;
  }

  async function reserveConnectorReceipt(input: {
    projectId: string;
    action: ConnectorAction;
    idempotencyKey: string;
    bodyHash: string;
  }): Promise<ReceiptReservation> {
    if (!/^[a-f0-9]{64}$/.test(input.bodyHash)) throw new Error("Receipt body hash is invalid");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) {
      throw new Error("Receipt idempotency key is invalid");
    }

    return store.transaction(async (tx) => {
      const existing = await tx.lockReceipt(input.projectId, input.action, input.idempotencyKey);
      if (existing) {
        if (existing.bodyHash !== input.bodyHash) {
          throw new ConnectorConflictError("Idempotency key was already used with a different body");
        }
        if (existing.status === "pending") return { kind: "in_progress" };
        if (!existing.responseJson || !existing.responseStatus) {
          throw new Error("Completed connector receipt is incomplete");
        }
        return {
          kind: "replay",
          responseStatus: existing.responseStatus,
          response: JSON.parse(existing.responseJson) as Record<string, unknown>,
        };
      }

      const createdAt = now();
      const receipt = await tx.insertReceipt({
        projectId: input.projectId,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
        bodyHash: input.bodyHash,
        status: "pending",
        responseStatus: null,
        responseJson: null,
        createdAt,
        completedAt: null,
      });
      return { kind: "reserved", receiptId: receipt.id };
    });
  }

  async function completeConnectorReceipt(input: {
    receiptId: number;
    responseStatus: number;
    response: Record<string, unknown>;
  }): Promise<void> {
    if (!Number.isInteger(input.responseStatus) || input.responseStatus < 200 || input.responseStatus > 599) {
      throw new Error("Receipt response status is invalid");
    }
    const responseJson = stableResponseJson(input.response);
    await store.transaction((tx) => tx.completeReceipt(
      input.receiptId,
      now(),
      input.responseStatus,
      responseJson,
    ));
  }

  return {
    activateConnectorCredential,
    getActiveConnectorCredential,
    getActiveConnectorCredentialSummary,
    reserveConnectorReceipt,
    completeConnectorReceipt,
  };
}

async function createDefaultStore(): Promise<ZahyPiConnectorStore> {
  const { getDb } = await import("../../db");
  const db = await getDb();
  if (!db) throw new Error("Database is required for ZahyPi connector state");

  return {
    transaction: (callback) => db.transaction(async (transaction) => callback({
      lockCredentials: async (projectId) => transaction
        .select()
        .from(zahyPiConnectorCredentials)
        .where(eq(zahyPiConnectorCredentials.projectId, projectId))
        .orderBy(desc(zahyPiConnectorCredentials.generation))
        .for("update") as unknown as ConnectorCredentialRow[],
      insertCredential: async (row) => {
        const [identity] = await transaction.insert(zahyPiConnectorCredentials).values(row).$returningId();
        return { ...row, id: Number(identity.id) };
      },
      supersedeActiveCredentials: async (projectId, supersededAt) => {
        await transaction.update(zahyPiConnectorCredentials)
          .set({ status: "superseded", supersededAt })
          .where(and(
            eq(zahyPiConnectorCredentials.projectId, projectId),
            eq(zahyPiConnectorCredentials.status, "active"),
          ));
      },
      lockReceipt: async (projectId, action, idempotencyKey) => {
        const [receipt] = await transaction.select()
          .from(zahyPiConnectorReceipts)
          .where(and(
            eq(zahyPiConnectorReceipts.projectId, projectId),
            eq(zahyPiConnectorReceipts.action, action),
            eq(zahyPiConnectorReceipts.idempotencyKey, idempotencyKey),
          ))
          .limit(1)
          .for("update");
        return receipt as ConnectorReceiptRow | undefined ?? null;
      },
      insertReceipt: async (row) => {
        const [identity] = await transaction.insert(zahyPiConnectorReceipts).values(row).$returningId();
        return { ...row, id: Number(identity.id) };
      },
      completeReceipt: async (id, completedAt, responseStatus, responseJson) => {
        await transaction.update(zahyPiConnectorReceipts)
          .set({ status: "completed", completedAt, responseStatus, responseJson })
          .where(eq(zahyPiConnectorReceipts.id, id));
      },
    })),
  };
}

async function defaultRepository() {
  return createZahyPiConnectorRepository({
    store: await createDefaultStore(),
    seal: (value) => encryptSecret(value),
    unseal: (value) => decryptSecret(value),
  });
}

export async function activateConnectorCredential(input: ConnectorActivationInput) {
  return (await defaultRepository()).activateConnectorCredential(input);
}

export async function getActiveConnectorCredential(projectId = "sari") {
  return (await defaultRepository()).getActiveConnectorCredential(projectId);
}

export async function getActiveConnectorCredentialSummary(projectId = "sari") {
  return (await defaultRepository()).getActiveConnectorCredentialSummary(projectId);
}

export async function reserveConnectorReceipt(input: Parameters<
  ReturnType<typeof createZahyPiConnectorRepository>["reserveConnectorReceipt"]
>[0]) {
  return (await defaultRepository()).reserveConnectorReceipt(input);
}

export async function completeConnectorReceipt(input: Parameters<
  ReturnType<typeof createZahyPiConnectorRepository>["completeConnectorReceipt"]
>[0]) {
  return (await defaultRepository()).completeConnectorReceipt(input);
}
