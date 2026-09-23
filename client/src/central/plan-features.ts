import type { CentralLanguage } from "../../../shared/central/catalog";
import { escapeHtml } from "../../../shared/central/render";
import { icon } from "../../../shared/central/icons";

type PlanLimits = {
  maxCustomers: number;
  maxWhatsAppNumbers: number;
  conversationLimit: number;
  messageLimit: number;
  voiceMessageLimit: number;
};

/** Use published numeric limits, with the same labels in both locales. */
export function renderPlanLimits(
  plan: PlanLimits,
  lang: CentralLanguage
): string {
  const labels: [keyof PlanLimits, string, string][] = [
    ["maxCustomers", "العملاء", "Customers"],
    ["maxWhatsAppNumbers", "أرقام واتساب", "WhatsApp numbers"],
    ["conversationLimit", "المحادثات", "Conversations"],
    ["messageLimit", "الرسائل", "Messages"],
    ["voiceMessageLimit", "الرسائل الصوتية", "Voice messages"],
  ];
  const number = new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US");
  return `<ul class="plan-features">${labels
    .flatMap(([key, ar, en]) => {
      const value = plan[key];
      if (!Number.isFinite(value)) return [];
      const limit =
        value < 0
          ? lang === "ar"
            ? "غير محدود"
            : "Unlimited"
          : number.format(value);
      return [
        `<li>${icon("check")}<span>${lang === "ar" ? ar : en}: ${escapeHtml(limit)}</span></li>`,
      ];
    })
    .join("")}</ul>`;
}
