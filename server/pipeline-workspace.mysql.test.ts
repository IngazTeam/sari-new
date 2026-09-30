import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readPipelineWorkspace } from "./pipeline-workspace";
import type { PipelineInput } from "../shared/pipeline-workspace";
describe.skipIf(!process.env.DATABASE_URL)("pipeline evidence in MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const now = new Date("2026-09-30T10:00:00Z"),
    inside = "2026-09-29 12:00:00";
  const run = async (sql: string, args: any[] = []) => {
    const [r] = await (await getPool())!.execute<any>(sql, args);
    return Number(r.insertId);
  };
  const read = (input: Partial<PipelineInput> = {}) =>
    readPipelineWorkspace(
      owner.merchantId,
      { queue: "ready", page: 1, pageSize: 20, ...input },
      now
    );
  const conversation = (
    stage: string | null,
    options: {
      merchant?: number;
      at?: string | null;
      reason?: string | null;
      phone?: string;
      message?: string;
    } = {}
  ) =>
    run(
      "INSERT INTO conversations (merchantId,customerPhone,customerName,deal_stage,lastMessageAt,loss_reason,lastMessage,stalled_since) VALUES (?,?,'Local',?,?,?,?, '2020-01-01 00:00:00')",
      [
        options.merchant ?? owner.merchantId,
        options.phone ?? "local",
        stage,
        options.at === undefined ? inside : options.at,
        options.reason ?? null,
        options.message ?? "fixture",
      ]
    );
  const escalation = (merchant: number, id: number, status = "pending") =>
    run(
      "INSERT INTO sari_escalation_queue (merchant_id,conversation_id,customer_phone,question,status) VALUES (?,?,'local','fixture',?)",
      [merchant, id, status]
    );
  beforeEach(async () => {
    owner = await createDisposableMerchant("pipeline");
    other = await createDisposableMerchant("pipeline-other");
  });
  afterEach(async () =>
    cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
  );
  afterAll(closeDb);
  it("returns actual empty samples and explicit unmeasured claims", async () => {
    const d = await read();
    expect(d.total).toBe(0);
    expect(d.list.items).toEqual([]);
    expect(d.list.totalPages).toBe(0);
    expect(d.outcomes.paidStageShare).toBeNull();
    expect(d.values.map(v => v.currency)).toEqual(["SAR", "USD"]);
    expect(Object.values(d.unmeasured).every(v => v === null)).toBe(true);
  });
  it("keeps every stored stage including unknown and isolates the tenant", async () => {
    for (const stage of [
      "new",
      "interested",
      "qualified",
      "ready",
      "payment_link_sent",
      "purchased",
      "paid",
      "lost",
      "payment_failed",
      null,
      "unexpected",
      "PAID",
    ])
      await conversation(stage);
    await conversation("paid", { merchant: other.merchantId });
    const d = await read({ queue: "all" });
    expect(d.total).toBe(12);
    expect(d.stages.reduce((s, r) => s + r.count, 0)).toBe(12);
    expect(d.stages.find(r => r.stage === "unknown")?.count).toBe(3);
    expect(d.list.items).toHaveLength(12);
    expect(
      (await read({ queue: "stage", stage: "unknown" })).list.items
    ).toHaveLength(3);
    expect(
      (await read({ queue: "stage", stage: "purchased" })).list.total
    ).toBe(1);
  });
  it("matches ready/stalled boundaries and excludes future activity from time windows", async () => {
    const a = await conversation("ready");
    await conversation("ready", { at: "2026-09-28 10:00:00" });
    await conversation("ready", { at: "2026-10-01 00:00:00" });
    const b = await conversation("qualified", { at: "2026-09-28 09:59:59" });
    await conversation("qualified", { at: "2026-09-28 10:00:00" });
    await conversation("interested", {
      at: "2026-09-27 00:00:00",
      reason: "price",
    });
    const d = await read();
    expect(d.queues.ready).toBe(1);
    expect(d.list.items.map(r => r.id)).toEqual([a]);
    const stalled = await read({ queue: "stalled" });
    expect(stalled.queues.stalled).toBe(1);
    expect(stalled.list.items.map(r => r.id)).toEqual([b]);
  });
  it("counts owned conversations with open escalations once and rejects crossed ownership", async () => {
    const own = await conversation("ready"),
      foreign = await conversation("ready", { merchant: other.merchantId }),
      closed = await conversation("new");
    await escalation(owner.merchantId, own);
    await escalation(owner.merchantId, own, "notified");
    await escalation(owner.merchantId, foreign);
    await escalation(other.merchantId, closed);
    await escalation(owner.merchantId, closed, "answered");
    const d = await read({ queue: "needs-human" });
    expect(d.queues["needs-human"]).toBe(1);
    expect(d.list.total).toBe(1);
    expect(d.list.items.map(r => r.id)).toEqual([own]);
  });
  it("paginates deterministic records without a silent ten-item cap", async () => {
    const ids = [];
    for (let i = 0; i < 23; i++)
      ids.push(await conversation("payment_link_sent"));
    const one = await read({ queue: "pending" }),
      two = await read({ queue: "pending", page: 2 });
    expect(one.list.total).toBe(23);
    expect(one.list.totalPages).toBe(2);
    expect(one.list.items.map(r => r.id)).toEqual(
      ids.slice().reverse().slice(0, 20)
    );
    expect(two.list.items.map(r => r.id)).toEqual(
      ids.slice().reverse().slice(20)
    );
    expect((await read({ queue: "pending", page: 3 })).list.items).toEqual([]);
  });
  it("measures current stage by last activity, not the stale stalled timestamp", async () => {
    await conversation("paid");
    await conversation("purchased");
    await conversation("paid", { at: "2026-09-23 10:00:00" }); // previous week inclusive end
    await conversation("paid", { at: "2026-09-23 10:00:01" }); // current week inclusive start
    await conversation("paid", { at: "2026-09-01 10:00:00" }); // inside last 30d
    await conversation("paid", { at: "2026-08-31 10:00:00" }); // just outside 30d
    await conversation("lost", { reason: "price" });
    await conversation("lost", { reason: null });
    await conversation("qualified", { reason: "trust" });
    await conversation("lost", {
      reason: "delivery",
      at: "2026-10-01 10:00:00",
    });
    const d = await read({ queue: "lost" });
    expect(d.outcomes).toMatchObject({
      paid: 4,
      lost: 2,
      currentWeekPaid: 2,
      previousWeekPaid: 1,
    });
    expect(d.outcomes.paidStageShare).toBeCloseTo((100 * 4) / 6);
    expect(d.losses).toEqual([
      { reason: "price", count: 1, share: 50 },
      { reason: "unknown", count: 1, share: 50 },
    ]);
    expect(d.list.total).toBe(2);
  });
  it("separates valid marked-paid order amounts from settlement and unknown units", async () => {
    const order = (
      merchant: number,
      currency: string,
      amount: number,
      status = "pending",
      payment = "paid",
      at = inside
    ) =>
      run(
        "INSERT INTO orders (merchantId,customerName,customerPhone,items,totalAmount,status,payment_status,currency,createdAt) VALUES (?,'Local','local','[]',?,?,?,?,?)",
        [merchant, amount, status, payment, currency, at]
      );
    await order(owner.merchantId, "SAR", 12500);
    await order(owner.merchantId, "USD", 2200);
    await order(owner.merchantId, "SAR", -2);
    await order(owner.merchantId, "SAR", 90000, "cancelled");
    await order(owner.merchantId, "SAR", 50000, "pending", "unpaid");
    await order(other.merchantId, "SAR", 60000);
    await order(
      owner.merchantId,
      "SAR",
      70000,
      "pending",
      "paid",
      "2026-10-01 00:00:00"
    );
    const d = await read();
    expect(d.values).toEqual([
      { currency: "SAR", count: 1, totalMinor: 12500, excludedAmounts: 1 },
      { currency: "USD", count: 1, totalMinor: 2200, excludedAmounts: 0 },
    ]);
    expect(d.unmeasured.settledRevenue).toBeNull();
  });
  it("returns bounded previews with explicit truncation and nullable payment dates", async () => {
    await conversation("new", { message: "أ".repeat(400) });
    const d = await read({ queue: "all" });
    expect(d.list.items[0].preview).toHaveLength(300);
    expect(d.list.items[0].previewTruncated).toBe(true);
    expect(d.list.items[0].lastMessageAt).toBe("2026-09-29T12:00:00.000Z");
    expect(d.list.items[0].paymentLinkSentAt).toBeNull();
    expect(d.list.items[0]).not.toHaveProperty("lastMessage");
  });
});
