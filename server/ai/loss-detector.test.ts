import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), project: vi.fn() }));
vi.mock("../db", () => ({ getPool: async () => ({ execute: mocks.execute }) }));
vi.mock("../db/schema-readiness", () => ({
  assertRuntimeSchema: async () => {},
}));
vi.mock("./contextual-sales-loss", () => ({
  recordContextualSalesLoss: mocks.project,
}));
import { detectLostDeals } from "./loss-detector";

describe("bounded loss recovery fairness", () => {
  it("reaches a later merchant after a full batch of invalid or quota-blocked sources, then wraps for retries", async () => {
    const candidates = Array.from({ length: 201 }, (_, i) => ({
      id: i + 1,
      merchantId: i === 200 ? 2 : 1,
      customerPhone: "synthetic",
      incoming_message_id: i + 1,
    }));
    const cursors: number[] = [];
    mocks.execute.mockImplementation(async (sql: string, args: any[]) => {
      if (!sql.startsWith("SELECT c.id")) return [{ affectedRows: 0 }];
      cursors.push(args[0]);
      return [
        candidates
          .filter((row) => row.incoming_message_id > args[0])
          .slice(0, 200),
      ];
    });
    mocks.project.mockImplementation(async (input) => {
      if (input.merchantId === 1)
        throw Error("Synthetic evidence or quota failure");
      return {
        ...input,
        sourceMessageId: input.incomingMessageId,
        reason: "other",
        basis: "interpreted_customer_decline",
      };
    });
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await detectLostDeals()).toEqual([]);
      expect(await detectLostDeals()).toEqual([
        expect.objectContaining({ merchantId: 2, conversationId: 201 }),
      ]);
      expect(await detectLostDeals()).toEqual([]);
      expect(cursors).toEqual([0, 200, 0]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("Synthetic");
    } finally {
      log.mockRestore();
    }
  });
  it("projects each candidate with its own tenant and source, and exposes only accepted evidence", async () => {
    vi.clearAllMocks();
    const rows = [
      {
        id: 81,
        merchantId: 20,
        customerPhone: "synthetic-a",
        incoming_message_id: 201,
      },
      {
        id: 82,
        merchantId: 21,
        customerPhone: "synthetic-b",
        incoming_message_id: 202,
      },
    ];
    mocks.execute.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT c.id") ? [rows] : [{ affectedRows: 0 }],
    );
    mocks.project
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        merchantId: 21,
        conversationId: 82,
        sourceMessageId: 202,
        reason: "other",
      });
    expect(await detectLostDeals()).toEqual([
      {
        merchantId: 21,
        conversationId: 82,
        sourceMessageId: 202,
        reason: "other",
      },
    ]);
    expect(mocks.project.mock.calls).toEqual([
      [
        {
          merchantId: 20,
          conversationId: 81,
          customerPhone: "synthetic-a",
          incomingMessageId: 201,
        },
      ],
      [
        {
          merchantId: 21,
          conversationId: 82,
          customerPhone: "synthetic-b",
          incomingMessageId: 202,
        },
      ],
    ]);
    const updates = mocks.execute.mock.calls
      .map((call) => call[0])
      .filter((sql) => sql.startsWith("UPDATE"));
    expect(updates).toHaveLength(2);
    for (const sql of updates) {
      expect(sql).toMatch(/SET c\.stalled_since=/);
      expect(sql).not.toMatch(/SET[^]*?(?:deal_stage|loss_reason)\s*=/);
    }
  });
});
