import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  capture: vi.fn(),
  create: vi.fn(),
  notify: vi.fn(),
  ai: vi.fn(),
}));
vi.mock("../db/learning", () => ({
  captureSignal: m.capture,
  createEscalation: m.create,
}));
vi.mock("../db", () => ({
  getMerchantById: async () => ({ escalationPhones: "[]" }),
  getWhatsAppInstancesByMerchantId: async () => [],
}));
vi.mock("../_core/notificationService", () => ({ sendNotification: m.notify }));
vi.mock("./openai", () => ({ callGPT4: m.ai }));
import {
  captureMerchantCorrection,
  captureOutcomeSignal,
} from "./learning-engine";
import { handleSmartEscalation } from "./smart-escalation";
beforeEach(() => {
  vi.resetAllMocks();
  m.create.mockResolvedValue(42);
  m.notify.mockResolvedValue(undefined);
});
describe("operational events are not semantic learning verdicts", () => {
  it.each([
    "شكرًا لك، أرسلت التفاصيل",
    "تم تجهيز الطلب وإرساله",
    "تصحيح: راجع سياسة المتجر قبل التأكيد",
  ])(
    "does not promote unanchored merchant text to a correction: %s",
    async merchantMessage => {
      await captureMerchantCorrection({
        merchantId: 1,
        conversationId: 2,
        lastBotMessage: "رد سابق",
        merchantMessage,
      });
      expect(m.capture).not.toHaveBeenCalled();
      expect(m.ai).not.toHaveBeenCalled();
    }
  );
  it.each([
    [0, false],
    [1, false],
    [2, false],
    [5, false],
    [50, false],
    [50, true],
  ] as const)(
    "does not infer an outcome from %i messages and escalated=%s",
    async (messageCount, wasEscalated) => {
      await captureOutcomeSignal({
        merchantId: 1,
        conversationId: 2,
        messageCount,
        wasEscalated,
      });
      expect(m.capture).not.toHaveBeenCalled();
      expect(m.ai).not.toHaveBeenCalled();
    }
  );
  it.each([
    "أريد الموظف لإكمال التعاقد",
    "أحتاج تأكيد موعد التوصيل",
    "لدي سؤال عن تفاصيل الخدمة",
  ])(
    "preserves escalation and notification without inferring a knowledge gap: %s",
    async customerQuestion => {
      const input = {
        merchantId: 1,
        conversationId: 2,
        customerPhone: "966500000082",
        incomingMessageId: 3,
        customerQuestion,
        botResponse: "سأراجع الطلب مع الفريق",
      };
      expect(await handleSmartEscalation(input)).toMatchObject({
        escalationId: 42,
        notified: true,
      });
      expect(m.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 1,
          conversationId: 2,
          incomingMessageId: 3,
          question: customerQuestion,
        })
      );
      expect(m.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 1,
          metadata: expect.objectContaining({ escalationId: 42 }),
        })
      );
      expect(m.capture).not.toHaveBeenCalled();
      expect(m.ai).not.toHaveBeenCalled();
    }
  );
  it.each(["unavailable", "error"])(
    "does not manufacture learning when escalation storage is %s",
    async failure => {
      if (failure === "error")
        m.create.mockRejectedValue(Error("synthetic storage failure"));
      else m.create.mockResolvedValue(null);
      expect(
        await handleSmartEscalation({
          merchantId: 1,
          conversationId: 2,
          customerPhone: "966500000082",
          incomingMessageId: 3,
          customerQuestion: "تأكيد طلب",
        })
      ).toMatchObject({ escalationId: null, notified: false });
      expect(m.notify).not.toHaveBeenCalled();
      expect(m.capture).not.toHaveBeenCalled();
    }
  );
});
