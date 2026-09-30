import { randomUUID } from "node:crypto";
import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const m = vi.hoisted(() => ({ provider: vi.fn(), limit: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: m.provider }));
vi.mock("./api/distributed-rate-limit", () => ({
  reserveApiRateLimit: m.limit,
}));
import {
  startProductFileAdvice,
  readProductFileAdvice,
  ProductFileAdviceLimit,
} from "./product-file-advice-requests";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
} from "./product-editor";
import { productFileAdviceReceipt } from "../shared/product-file-advice";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
const reply = () => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          businessType: "products",
          mapping: [],
          summary: {
            text: "Review coffee sales positioning",
            evidence: [{ row: 2, column: 0, quote: "Coffee" }],
          },
          sellingTips: [],
          crossSellSuggestions: [],
        }),
      },
    },
  ],
});
const input = (requestId = randomUUID()) => ({
  requestId,
  reviewed: true,
  file: {
    format: "csv",
    fileName: "products.csv",
    currency: "SAR",
    csvData: "name,price\nCoffee,12.34",
  },
});
describe.skipIf(!process.env.DATABASE_URL)(
  "durable product file advice on disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const start = (data: unknown = input()) =>
      startProductFileAdvice(owner.merchantId, owner.userId, data);
    const read = (requestId: string) =>
      readProductFileAdvice(owner.merchantId, owner.userId, { requestId });
    beforeEach(async () => {
      vi.resetAllMocks();
      m.limit.mockResolvedValue({ allowed: true });
      m.provider.mockResolvedValue(reply());
      owner = await createDisposableMerchant("file-advice91");
      other = await createDisposableMerchant("advice91-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("stores one scoped response and replays it without parsing or calling a provider again", async () => {
      const data = input(),
        r = await start(data);
      expect(productFileAdviceReceipt.safeParse(r).success).toBe(true);
      expect(r.state).toBe("completed");
      expect(await start(data)).toEqual(r);
      expect(await read(data.requestId)).toEqual(r);
      expect(m.provider).toHaveBeenCalledTimes(1);
      expect(m.limit).toHaveBeenCalledTimes(1);
      const rows = await q(
        "SELECT * FROM product_file_advice_requests WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty("file");
      expect(rows[0]).not.toHaveProperty("source");
      for (const [table, column] of [
        ["products", "merchantId"],
        ["merchant_knowledge_docs", "merchant_id"],
      ])
        expect(
          Number(
            (
              await q(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`, [
                owner.merchantId,
              ])
            )[0].n
          )
        ).toBe(0);
      expect(m.provider.mock.calls[0][0]).toMatchObject({
        merchantId: owner.merchantId,
        taskType: "sari.catalog.file-extraction",
      });
    });
    it("reserves before provider dispatch and makes concurrent same-ID calls read the pending attempt", async () => {
      let release!: (value: any) => void;
      m.provider.mockImplementation(async () => {
        expect(
          (
            await q(
              "SELECT state FROM product_file_advice_requests WHERE merchant_id=?",
              [owner.merchantId]
            )
          )[0].state
        ).toBe("processing");
        return new Promise(resolve => {
          release = resolve;
        });
      });
      const data = input(),
        pending = start(data);
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      try {
        expect((await start(data)).state).toBe("processing");
        await expect(
          start({ ...data, file: { ...data.file, currency: "USD" } })
        ).rejects.toBeInstanceOf(ProductEditorConflict);
        expect(m.provider).toHaveBeenCalledTimes(1);
      } finally {
        release(reply());
        await pending;
      }
    });
    it("does not rerun an uncertain provider request under the same UUID", async () => {
      m.provider.mockRejectedValue(Error("connection lost"));
      const data = input(),
        r = await start(data);
      expect(r).toMatchObject({
        state: "uncertain",
        failure: "provider_unknown",
        result: null,
      });
      expect(await start(data)).toEqual(r);
      expect(m.provider).toHaveBeenCalledTimes(1);
    });
    it("retains invalid output as a failed attempt without saving generated claims", async () => {
      m.provider.mockResolvedValue({
        choices: [
          {
            message: {
              content:
                '{"items":[{"name":"invented","price":0}],"salesProficiency":99}',
            },
          },
        ],
      });
      const data = input(),
        r = await start(data);
      expect(r).toMatchObject({
        state: "failed",
        failure: "invalid_result",
        result: null,
      });
      expect(await start(data)).toEqual(r);
      expect(m.provider).toHaveBeenCalledTimes(1);
    });
    it("bounds active analysis and changes an expired pending status to uncertain without automatic takeover", async () => {
      let release!: (value: any) => void;
      m.provider.mockImplementation(
        () =>
          new Promise(resolve => {
            release = resolve;
          })
      );
      const data = input(),
        pending = start(data);
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      try {
        await expect(start()).rejects.toBeInstanceOf(ProductFileAdviceLimit);
        await q(
          "UPDATE product_file_advice_requests SET lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE merchant_id=?",
          [owner.merchantId]
        );
        expect((await read(data.requestId)).state).toBe("uncertain");
        expect((await start(data)).state).toBe("uncertain");
        expect(m.provider).toHaveBeenCalledTimes(1);
      } finally {
        release(reply());
        await pending;
      }
      expect((await read(data.requestId)).state).toBe("completed");
    });
    it("isolates tenant and actor ownership even for another manager in the same tenant", async () => {
      const data = input();
      await start(data);
      await expect(
        readProductFileAdvice(other.merchantId, other.userId, {
          requestId: data.requestId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readProductFileAdvice(owner.merchantId, other.userId, {
          requestId: data.requestId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await expect(
        startProductFileAdvice(owner.merchantId, other.userId, data)
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      expect(m.provider).toHaveBeenCalledTimes(1);
    });
    it("authorizes before spreadsheet processing and does not return results after access is revoked", async () => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        startProductFileAdvice(owner.merchantId, other.userId, {
          ...input(),
          file: {
            format: "xlsx",
            fileName: "bad.xlsx",
            currency: "SAR",
            fileBase64: "bad!",
          },
        })
      ).rejects.toBeInstanceOf(ProductEditorForbidden);
      expect(m.provider).not.toHaveBeenCalled();
      m.provider.mockImplementation(async () => {
        await q(
          "UPDATE users SET account_status='deletion_pending' WHERE id=?",
          [owner.userId]
        );
        return reply();
      });
      const data = input();
      await expect(start(data)).rejects.toBeInstanceOf(ProductEditorForbidden);
      await q("UPDATE users SET account_status='active' WHERE id=?", [
        owner.userId,
      ]);
      expect((await read(data.requestId)).state).toBe("completed");
      expect(m.provider).toHaveBeenCalledTimes(1);
    });
    it("does not reserve or dispatch after a rate limit denial", async () => {
      m.limit.mockResolvedValue({ allowed: false });
      await expect(start()).rejects.toBeInstanceOf(ProductFileAdviceLimit);
      expect(m.provider).not.toHaveBeenCalled();
      expect(
        await q(
          "SELECT id FROM product_file_advice_requests WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
    });
    it("does not dispatch when reservation commit acknowledgement is lost", async () => {
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      let calls = 0;
      const spy = vi
        .spyOn(pool, "getConnection")
        .mockImplementation(async () => {
          const connection = await get();
          calls++;
          if (calls !== 2) return connection;
          return new Proxy(connection, {
            get(target, prop) {
              if (prop === "commit")
                return async () => {
                  await target.commit();
                  throw Error("Lost acknowledgement");
                };
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        });
      const data = input();
      try {
        await expect(start(data)).rejects.toThrow("Lost acknowledgement");
      } finally {
        spy.mockRestore();
      }
      expect(m.provider).not.toHaveBeenCalled();
      expect((await read(data.requestId)).state).toBe("processing");
      expect((await start(data)).state).toBe("processing");
      expect(m.provider).not.toHaveBeenCalled();
    });
    it("rejects corrupted persisted results instead of showing them as completed", async () => {
      const data = input();
      await start(data);
      await q(
        "UPDATE product_file_advice_requests SET result_digest=REPEAT('f',64) WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(read(data.requestId)).rejects.toThrow(
        "Invalid advice result digest"
      );
      expect(m.provider).toHaveBeenCalledTimes(1);
    });
  }
);
