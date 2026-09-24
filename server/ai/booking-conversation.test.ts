import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  llm: vi.fn(),
  prepare: vi.fn(),
  accept: vi.fn(),
}));
vi.mock("../db/connection", () => ({
  getPool: async () => ({ execute: mocks.query }),
}));
vi.mock("./openai", () => ({ callGPT4: mocks.llm }));
vi.mock("./booking-agreements", async original => ({
  ...(await original<typeof import("./booking-agreements")>()),
  prepareBookingAgreement: mocks.prepare,
  acceptBookingAgreement: mocks.accept,
}));
import { handleBookingConversation } from "./booking-conversation";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
const input = {
  merchantId: 1,
  conversationId: 2,
  incomingMessageId: 4,
  customerPhone: "966500000085",
  message: "أريد موعد استشارة",
};
let stored: string, quote: any, prior: string;
beforeEach(() => {
  vi.clearAllMocks();
  stored = input.message;
  quote = null;
  prior = "";
  mocks.query.mockImplementation(async (sql: string) => [
    sql.includes("JOIN messages")
      ? [{ content: stored }]
      : sql.includes("FROM conversation_booking_agreements")
        ? quote
          ? [quote]
          : []
        : sql.includes("FROM ai_interaction_jobs")
          ? [{ reply_text: prior }]
          : sql.includes("FROM services")
            ? [{ id: 7, name: "استشارة" }]
            : [],
  ]);
  mocks.prepare.mockResolvedValue({ kind: "offer", text: "persisted offer" });
  mocks.accept.mockResolvedValue({ kind: "booking", text: "pending booking" });
  mocks.llm.mockResolvedValue(
    JSON.stringify({
      serviceId: 7,
      staffId: null,
      bookingDate: "2026-12-20",
      startTime: "10:00",
    })
  );
});
describe("booking conversation consent routing", () => {
  it("proposes typed selection without creating or accepting a booking", async () => {
    expect(await handleBookingConversation(input)).toBe("persisted offer");
    expect(mocks.prepare).toHaveBeenCalledWith(input, {
      serviceId: 7,
      staffId: null,
      bookingDate: "2026-12-20",
      startTime: "10:00",
    });
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("uses persisted text rather than caller-supplied consent", async () => {
    stored = "مرحبا";
    expect(
      await handleBookingConversation({ ...input, message: "نعم" })
    ).toBeNull();
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.llm).not.toHaveBeenCalled();
  });
  it.each(["نعم", "لا تحجز"])(
    "routes %s to the saved latest offer without model interpretation",
    async message => {
      stored = message;
      quote = { id: 3, state: "proposed", source_message_id: 1 };
      prior = "ملخص [BA-3]";
      expect(await handleBookingConversation({ ...input, message })).toBe(
        "pending booking"
      );
      expect(mocks.accept).toHaveBeenCalledWith({ ...input, message }, 3);
      expect(mocks.llm).not.toHaveBeenCalled();
    }
  );
  it("does not bind yes to an older booking after a different question", async () => {
    stored = "نعم";
    quote = { id: 3, state: "proposed" };
    prior = "ملخص شراء [Q-5]";
    expect(
      await handleBookingConversation({ ...input, message: stored })
    ).toBeNull();
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("replays the same consent source without asking the model to book again", async () => {
    stored = "نعم";
    quote = {
      id: 3,
      state: "accepted",
      consent_message_id: input.incomingMessageId,
    };
    expect(await handleBookingConversation({ ...input, message: stored })).toBe(
      "pending booking"
    );
    expect(mocks.llm).not.toHaveBeenCalled();
  });
  it.each([
    "not json",
    "{}",
    '{"serviceId":null,"staffId":null,"bookingDate":null,"startTime":null}',
    '{"serviceId":7,"staffId":null,"bookingDate":"2026-02-30","startTime":"10:00"}',
    '{"serviceId":7,"staffId":null,"bookingDate":"2026-12-20","startTime":"10:00","price":1}',
  ])("does not write from incomplete or injected extraction: %s", async raw => {
    mocks.llm.mockResolvedValue(raw);
    expect(await handleBookingConversation(input)).toBeTruthy();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("asks for clarification when service date or time is missing", async () => {
    mocks.llm.mockResolvedValue(
      '{"serviceId":7,"staffId":null,"bookingDate":null,"startTime":"10:00"}'
    );
    expect(await handleBookingConversation(input)).toContain("حدد الخدمة");
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("does not execute an unowned incoming source", async () => {
    mocks.query.mockResolvedValue([[]]);
    expect(await handleBookingConversation(input)).toBeNull();
    expect(mocks.llm).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("requires configured fixed-price services before extraction", async () => {
    const original = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("FROM services") ? [[]] : original(sql)
    );
    expect(await handleBookingConversation(input)).toContain("مراجعة النشاط");
    expect(mocks.llm).not.toHaveBeenCalled();
  });
  it("marks uncertain effects without blind retry or a false no-booking claim", async () => {
    stored = "نعم";
    quote = { id: 3, state: "proposed" };
    prior = "ملخص [BA-3]";
    mocks.accept.mockRejectedValue(Error("private SQL lost ack"));
    const ctx: InboundExecution = {
      id: 1,
      merchantId: 1,
      instanceId: 1,
      token: "fixture",
      eventKey: "fixture",
      partitionKey: "fixture",
      sendOrdinal: 0,
      assertOwned: vi.fn().mockResolvedValue(undefined),
    };
    const reply = await withInboundExecution(ctx, () =>
      handleBookingConversation({ ...input, message: stored })
    );
    expect(reply).toContain("مراجعة النشاط");
    expect(reply).not.toContain("private");
    expect(ctx.uncertainEffect).toBe(true);
    expect(mocks.accept).toHaveBeenCalledOnce();
    expect(mocks.llm).not.toHaveBeenCalled();
  });
  it("does not execute after losing worker ownership", async () => {
    stored = "نعم";
    quote = { id: 3, state: "proposed" };
    prior = "ملخص [BA-3]";
    const ctx: InboundExecution = {
      id: 1,
      merchantId: 1,
      instanceId: 1,
      token: "fixture",
      eventKey: "fixture",
      partitionKey: "fixture",
      sendOrdinal: 0,
      assertOwned: vi.fn().mockRejectedValue(Error("lost lease")),
    };
    await withInboundExecution(ctx, () =>
      handleBookingConversation({ ...input, message: stored })
    );
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});
