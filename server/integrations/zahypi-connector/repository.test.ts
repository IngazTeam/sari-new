import { describe, expect, it } from "vitest";

import {
  ConnectorConflictError,
  createZahyPiConnectorRepository,
  type ConnectorCredentialRow,
  type ConnectorReceiptRow,
  type ZahyPiConnectorStore,
  type ZahyPiConnectorTransaction,
} from "./repository";

class MemoryConnectorStore implements ZahyPiConnectorStore {
  credentials: ConnectorCredentialRow[] = [];
  receipts: ConnectorReceiptRow[] = [];
  private nextCredentialId = 1;
  private nextReceiptId = 1;

  async transaction<T>(callback: (tx: ZahyPiConnectorTransaction) => Promise<T>): Promise<T> {
    const tx: ZahyPiConnectorTransaction = {
      lockCredentials: async (projectId) => this.credentials
        .filter((row) => row.projectId === projectId)
        .sort((left, right) => right.generation - left.generation),
      insertCredential: async (row) => {
        const inserted = { ...row, id: this.nextCredentialId++ };
        this.credentials.push(inserted);
        return inserted;
      },
      supersedeActiveCredentials: async (projectId, supersededAt) => {
        for (const row of this.credentials) {
          if (row.projectId === projectId && row.status === "active") {
            row.status = "superseded";
            row.supersededAt = supersededAt;
          }
        }
      },
      lockReceipt: async (projectId, action, idempotencyKey) => this.receipts.find((row) =>
        row.projectId === projectId
          && row.action === action
          && row.idempotencyKey === idempotencyKey,
      ) ?? null,
      insertReceipt: async (row) => {
        const inserted = { ...row, id: this.nextReceiptId++ };
        this.receipts.push(inserted);
        return inserted;
      },
      completeReceipt: async (id, completedAt, responseStatus, responseJson) => {
        const receipt = this.receipts.find((row) => row.id === id);
        if (!receipt) throw new Error("receipt not found");
        receipt.status = "completed";
        receipt.completedAt = completedAt;
        receipt.responseStatus = responseStatus;
        receipt.responseJson = responseJson;
      },
    };
    return callback(tx);
  }
}

function repositoryFixture() {
  const store = new MemoryConnectorStore();
  const repository = createZahyPiConnectorRepository({
    store,
    seal: (value) => `sealed:${value}`,
    unseal: (value) => {
      if (!value.startsWith("sealed:")) throw new Error("Unable to decrypt stored credential");
      return value.slice("sealed:".length);
    },
    now: () => new Date("2026-08-29T12:00:00.000Z"),
  });
  return { repository, store };
}

const activation = {
  projectId: "sari",
  generation: 1,
  apiKey: "zk_sari_demo_key_001",
  baseUrl: "https://api.zahypi.test/v1",
  model: "qwen-local",
  taskTypes: ["sari.sentiment", "sari.reply"],
};

describe("ZahyPi connector repository", () => {
  it("stores an encrypted key and returns only a safe activation summary", async () => {
    const { repository, store } = repositoryFixture();

    const summary = await repository.activateConnectorCredential(activation);

    expect(store.credentials).toHaveLength(1);
    expect(store.credentials[0].apiKeyCiphertext).toBe("sealed:zk_sari_demo_key_001");
    expect(store.credentials[0].taskTypesJson).toBe('["sari.reply","sari.sentiment"]');
    expect(summary).toMatchObject({
      projectId: "sari",
      generation: 1,
      status: "active",
      taskTypes: ["sari.reply", "sari.sentiment"],
      apiKeyPrefix: "zk_sari_",
      replayed: false,
    });
    expect(summary).not.toHaveProperty("apiKey");
    expect(summary).not.toHaveProperty("apiKeyCiphertext");
  });

  it("supersedes the previous generation and rejects downgrades", async () => {
    const { repository, store } = repositoryFixture();
    await repository.activateConnectorCredential(activation);
    await repository.activateConnectorCredential({
      ...activation,
      generation: 2,
      apiKey: "zk_sari_demo_key_002",
    });

    expect(store.credentials.map((row) => [row.generation, row.status])).toEqual([
      [1, "superseded"],
      [2, "active"],
    ]);
    await expect(repository.activateConnectorCredential(activation)).rejects.toThrow(
      ConnectorConflictError,
    );
  });

  it("accepts an exact generation replay and rejects a conflicting replay", async () => {
    const { repository } = repositoryFixture();
    await repository.activateConnectorCredential(activation);

    await expect(repository.activateConnectorCredential(activation)).resolves.toMatchObject({
      generation: 1,
      replayed: true,
    });
    await expect(repository.activateConnectorCredential({
      ...activation,
      model: "different-model",
    })).rejects.toThrow(ConnectorConflictError);
  });

  it("decrypts an active credential only at the internal runtime boundary", async () => {
    const { repository } = repositoryFixture();
    await repository.activateConnectorCredential(activation);

    await expect(repository.getActiveConnectorCredential("sari")).resolves.toMatchObject({
      apiKey: "zk_sari_demo_key_001",
      generation: 1,
    });
    const summary = await repository.getActiveConnectorCredentialSummary("sari");
    expect(summary).not.toHaveProperty("apiKey");
    expect(summary).not.toHaveProperty("apiKeyCiphertext");
  });

  it("fails closed when stored credential ciphertext cannot be decrypted", async () => {
    const { repository, store } = repositoryFixture();
    await repository.activateConnectorCredential(activation);
    store.credentials[0].apiKeyCiphertext = "tampered";

    await expect(repository.getActiveConnectorCredential("sari")).rejects.toThrow(
      "Unable to decrypt stored credential",
    );
  });

  it("replays a completed receipt only when the signed body hash is identical", async () => {
    const { repository } = repositoryFixture();
    const reservation = await repository.reserveConnectorReceipt({
      projectId: "sari",
      action: "bootstrap",
      idempotencyKey: "bootstrap-generation-1",
      bodyHash: "a".repeat(64),
    });
    expect(reservation.kind).toBe("reserved");
    if (reservation.kind !== "reserved") throw new Error("expected reservation");

    await repository.completeConnectorReceipt({
      receiptId: reservation.receiptId,
      responseStatus: 200,
      response: { success: true, generation: 1 },
    });

    await expect(repository.reserveConnectorReceipt({
      projectId: "sari",
      action: "bootstrap",
      idempotencyKey: "bootstrap-generation-1",
      bodyHash: "a".repeat(64),
    })).resolves.toEqual({
      kind: "replay",
      responseStatus: 200,
      response: { generation: 1, success: true },
    });

    await expect(repository.reserveConnectorReceipt({
      projectId: "sari",
      action: "bootstrap",
      idempotencyKey: "bootstrap-generation-1",
      bodyHash: "b".repeat(64),
    })).rejects.toThrow(ConnectorConflictError);
  });

  it("persists non-secret credential generation metadata in connector receipts", async () => {
    const { repository } = repositoryFixture();
    const reservation = await repository.reserveConnectorReceipt({
      projectId: "sari",
      action: "bootstrap",
      idempotencyKey: "bootstrap-generation-metadata-1",
      bodyHash: "c".repeat(64),
    });
    if (reservation.kind !== "reserved") throw new Error("expected reservation");

    await repository.completeConnectorReceipt({
      receiptId: reservation.receiptId,
      responseStatus: 200,
      response: {
        credential_generation: 1,
        operation: "bootstrap",
        status: "configured",
      },
    });

    await expect(repository.reserveConnectorReceipt({
      projectId: "sari",
      action: "bootstrap",
      idempotencyKey: "bootstrap-generation-metadata-1",
      bodyHash: "c".repeat(64),
    })).resolves.toEqual({
      kind: "replay",
      responseStatus: 200,
      response: {
        credential_generation: 1,
        operation: "bootstrap",
        status: "configured",
      },
    });
  });

  it("rejects secret credential fields from connector receipts", async () => {
    const { repository } = repositoryFixture();
    const reservation = await repository.reserveConnectorReceipt({
      projectId: "sari",
      action: "bootstrap",
      idempotencyKey: "bootstrap-secret-rejection-1",
      bodyHash: "d".repeat(64),
    });
    if (reservation.kind !== "reserved") throw new Error("expected reservation");

    await expect(repository.completeConnectorReceipt({
      receiptId: reservation.receiptId,
      responseStatus: 200,
      response: { api_key: "must-not-be-persisted" },
    })).rejects.toThrow("Connector receipt cannot store credential fields");
  });
});
