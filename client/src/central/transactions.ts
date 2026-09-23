import { renderPlanLimits } from "./plan-features";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";
import {
  centralHref,
  type CentralLanguage,
} from "../../../shared/central/catalog";
import { escapeHtml as e } from "../../../shared/central/render";
import { icon } from "../../../shared/central/icons";
import {
  PAYMENT_LINK_ID_PATTERN,
  TAP_CHARGE_ID_PATTERN,
} from "../../../shared/subscription-payment-status";

export function safeCheckoutReturn(
  value: string | null,
  lang: CentralLanguage
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://sary.live");
    if (
      url.origin !== "https://sary.live" ||
      !/^\/subscribe(?:\/[1-9][0-9]*)?$/.test(url.pathname)
    )
      return null;
    const billing =
      url.searchParams.get("billing") === "yearly" ? "yearly" : "monthly";
    return centralHref(url.pathname + "?billing=" + billing, lang);
  } catch {
    return null;
  }
}
export async function wireTransactions(
  root: HTMLElement,
  lang: CentralLanguage,
  api: TRPCClient<AppRouter>
) {
  const box = root.querySelector<HTMLElement>("#transaction-content");
  if (!box) return;
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en),
    href = (p: string) => centralHref(p, lang);
  const feedback = root.querySelector<HTMLElement>("#form-feedback")!;
  const fail = (text: string) => {
    feedback.innerHTML = `<div class="inline-notice error" role="alert">${e(text)}</div>`;
    feedback.focus();
  };
  const path = location.pathname,
    params = new URLSearchParams(location.search);
  const price = (n: number, currency: string) =>
    `${new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${e(currency)}`;
  const redirect = (value: string) => {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("Invalid payment URL");
    location.assign(url.href);
  };
  const input = (
    name: string,
    label: string,
    type = "text",
    optional = false
  ) =>
    `<label class="page-field"><span>${label}</span><input name="${name}" type="${type}" ${optional ? "" : "required"} ${type === "tel" ? 'minlength="9" maxlength="20" dir="ltr"' : type === "email" ? 'maxlength="255" dir="ltr"' : 'minlength="2" maxlength="120"'} autocomplete="${type === "tel" ? "tel" : type === "email" ? "email" : "name"}"></label>`;
  if (path.startsWith("/subscribe")) {
    try {
      const plans = await api.subscriptionPlans.listPlans.query();
      if (!plans.length) {
        box.textContent = t(
          "لا توجد باقات منشورة حاليًا. تواصل مع فريق الدعم.",
          "No plans are currently published. Contact support."
        );
        return;
      }
      const requested = path.split("/")[2];
      let selected = requested
        ? plans.find(p => String(p.id) === requested)
        : plans[0];
      if (!selected) {
        box.innerHTML = `<p>${t("الباقة غير متاحة. اختر من الباقات الحالية.", "This plan is unavailable. Choose a current plan.")}</p><a class="button green" href="${href("/pricing")}">${t("الباقات", "See plans")}</a>`;
        return;
      }
      let billing: "monthly" | "yearly" =
        params.get("billing") === "yearly" ? "yearly" : "monthly";
      let user: Awaited<ReturnType<typeof api.auth.me.query>> = null;
      try {
        user = await api.auth.me.query();
      } catch {
        /* Checkout stays behind a sign-in prompt. */
      }
      const attempts = new Map<string, string>();
      const render = () => {
        const p = selected!,
          amount = Number(
            billing === "monthly" ? p.monthlyPrice : p.yearlyPrice
          );
        const target = href("/subscribe/" + p.id + "?billing=" + billing);
        root
          .querySelectorAll<HTMLAnchorElement>("[data-language-switch]")
          .forEach(a => {
            a.href = centralHref(
              "/subscribe/" + p.id + "?billing=" + billing,
              lang === "ar" ? "en" : "ar"
            );
          });
        box.innerHTML = `<h2>${t("راجع اختيارك", "Review your choice")}</h2><label class="page-field"><span>${t("الباقة", "Plan")}</span><select id="subscribe-plan">${plans.map(x => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${e(lang === "ar" ? x.name : x.nameEn || "Plan " + x.id)}</option>`).join("")}</select></label><label class="page-field"><span>${t("دورة الفوترة", "Billing period")}</span><select id="subscribe-period"><option value="monthly" ${billing === "monthly" ? "selected" : ""}>${t("شهري", "Monthly")}</option><option value="yearly" ${billing === "yearly" ? "selected" : ""}>${t("سنوي", "Yearly")}</option></select></label><div class="checkout-total"><strong>${price(amount, p.currency)}</strong><span>/ ${billing === "monthly" ? t("شهر", "month") : t("سنة", "year")}</span></div><p>${e(lang === "ar" ? p.description : p.descriptionEn || "")}</p>${renderPlanLimits(p, lang)}<p class="small-note">${t("راجع تفاصيل بوابة الدفع قبل التأكيد. لا يتم الخصم لمجرد عرض هذه الصفحة.", "Review the provider’s checkout details before confirmation. Viewing this page does not charge you.")}</p>${user ? `<button class="button green full" id="start-checkout">${t("المتابعة إلى بوابة الدفع", "Continue to payment")}${icon("arrow-up-left", "directional")}</button>` : `<div class="inline-notice">${t("سجّل الدخول أو أنشئ حسابًا لإكمال الاشتراك.", "Sign in or create an account to continue your subscription.")}</div><a class="button green full" href="${e(href("/login?next=" + encodeURIComponent(target)))}">${t("تسجيل الدخول", "Sign in")}</a><a class="text-link" href="${e(href("/signup?next=" + encodeURIComponent(target)))}">${t("إنشاء حساب", "Create an account")}</a>`}`;
        root
          .querySelector<HTMLSelectElement>("#subscribe-plan")!
          .addEventListener("change", ev => {
            selected = plans.find(
              x => String(x.id) === (ev.target as HTMLSelectElement).value
            )!;
            history.replaceState(
              null,
              "",
              href("/subscribe/" + selected.id + "?billing=" + billing)
            );
            render();
          });
        root
          .querySelector<HTMLSelectElement>("#subscribe-period")!
          .addEventListener("change", ev => {
            billing = (ev.target as HTMLSelectElement).value as
              | "monthly"
              | "yearly";
            history.replaceState(
              null,
              "",
              href("/subscribe/" + p.id + "?billing=" + billing)
            );
            render();
          });
        root
          .querySelector<HTMLButtonElement>("#start-checkout")
          ?.addEventListener("click", async ev => {
            const b = ev.currentTarget as HTMLButtonElement;
            b.disabled = true;
            const key = p.id + ":" + billing;
            const checkoutAttemptId = attempts.get(key) || crypto.randomUUID();
            attempts.set(key, checkoutAttemptId);
            try {
              const result =
                await api.subscriptionSignup.createSubscriptionWithPayment.mutate(
                  { planId: p.id, billingCycle: billing, checkoutAttemptId }
                );
              if (!result.paymentUrl) throw new Error("No payment URL");
              redirect(result.paymentUrl);
            } catch {
              fail(
                t(
                  "تعذر بدء الدفع. حاول مجددًا أو تواصل مع الدعم.",
                  "We could not start checkout. Retry or contact support."
                )
              );
              b.disabled = false;
            }
          });
      };
      render();
    } catch {
      box.innerHTML = `<p>${t("تعذر تحميل تفاصيل الاشتراك الحالية.", "Current subscription details could not be loaded.")}</p><a class="button outline" href="${href("/pricing")}">${t("العودة للباقات", "Back to plans")}</a>`;
    }
    return;
  }
  if (/^\/pay\/[^/]+$/.test(path) || path === "/pay") {
    const linkId = path.split("/")[2] || "";
    if (!PAYMENT_LINK_ID_PATTERN.test(linkId)) {
      box.textContent = t(
        "رابط الدفع غير صالح. اطلب رابطًا جديدًا من المتجر.",
        "The payment link is invalid. Ask the store for a new one."
      );
      return;
    }
    try {
      const link = await api.payments.getPublicLink.query({ linkId });
      if (!link.available) {
        box.textContent = t(
          "رابط الدفع غير متاح أو انتهت صلاحيته. اطلب رابطًا جديدًا من المتجر.",
          "This payment link is unavailable or expired. Ask the store for a new one."
        );
        return;
      }
      const attempt = crypto.randomUUID();
      box.innerHTML = `<h2>${e(link.title)}</h2><p>${e(link.description || "")}</p><div class="checkout-total"><strong>${price(link.amount / 100, link.currency)}</strong></div><form id="order-checkout">${input("customerName", t("الاسم", "Name"))}${input("customerPhone", t("رقم الجوال السعودي", "Saudi mobile number"), "tel")}${input("customerEmail", t("البريد الإلكتروني (اختياري)", "Email address (optional)"), "email", true)}<button class="button green full" type="submit">${t("المتابعة إلى الدفع", "Continue to payment")}</button></form><p class="small-note">${t("تُدخل بيانات البطاقة لدى بوابة الدفع. ساري لا يحفظ رقم بطاقتك كاملًا.", "Enter card details with the payment provider. Sary does not store your full card number.")}</p>`;
      root
        .querySelector<HTMLFormElement>("#order-checkout")!
        .addEventListener("submit", async ev => {
          ev.preventDefault();
          const form = ev.currentTarget as HTMLFormElement,
            b = form.querySelector("button")!;
          if (b.disabled) return;
          b.disabled = true;
          const values = new FormData(form);
          try {
            const result = await api.payments.checkoutLink.mutate({
              linkId,
              checkoutAttemptId: attempt,
              customerName: String(values.get("customerName")),
              customerPhone: String(values.get("customerPhone")),
              customerEmail:
                String(values.get("customerEmail") || "") || undefined,
            });
            redirect(result.paymentUrl);
          } catch {
            fail(
              t(
                "تعذر بدء الدفع. راجع البيانات وحاول مجددًا أو تواصل مع المتجر.",
                "Checkout could not start. Check the details, retry or contact the store."
              )
            );
            b.disabled = false;
          }
        });
    } catch {
      box.textContent = t(
        "تعذر فتح رابط الدفع. تحقق من الرابط أو تواصل مع المتجر.",
        "The payment link could not be opened. Check it or contact the store."
      );
    }
    return;
  }
  const chargeId = params.get("tap_id") || "",
    linkId = path.startsWith("/pay/") ? path.split("/")[2] : undefined;
  if (
    !TAP_CHARGE_ID_PATTERN.test(chargeId) ||
    (linkId && !PAYMENT_LINK_ID_PATTERN.test(linkId))
  ) {
    box.innerHTML = `<span class="auth-state-icon">${icon("x")}</span><h2>${t("رابط التحقق غير صالح.", "The verification link is invalid.")}</h2><p>${t("تحقق من رابط العودة أو تواصل مع الدعم. لا يمكن استنتاج نجاح الدفع من عنوان الصفحة.", "Check the return link or contact support. The page address alone cannot confirm payment.")}</p>`;
    return;
  }
  let polls = 0,
    finished = false,
    inFlight = false,
    timer: number | undefined;
  const renderStatus = (
    kind: "success" | "failure" | "waiting" | "timeout" | "error"
  ) => {
    box.innerHTML = `<span class="auth-state-icon">${icon(kind === "success" ? "check" : kind === "failure" ? "x" : "rotate")}</span><h2>${kind === "success" ? t("اكتملت العملية.", "The transaction is confirmed.") : kind === "failure" ? t("لم تكتمل العملية.", "The transaction did not complete.") : t("الدفع قيد التأكيد.", "Payment is being confirmed.")}</h2><p>${kind === "success" ? t("تم تسجيل الحالة المؤكدة في النظام.", "The confirmed status has been recorded by the platform.") : kind === "failure" ? t("راجع الطلب أو تواصل مع الدعم قبل المحاولة مجددًا.", "Review the request or contact support before trying again.") : kind === "timeout" ? t("ما زلنا ننتظر تأكيد مزوّد الدفع. احتفظ بالإيصال وتواصل مع الدعم قبل إعادة الدفع.", "We are still waiting for the provider’s confirmation. Keep your receipt and contact support before paying again.") : kind === "error" ? t("تعذر تحديث الحالة مؤقتًا. سنحاول مجددًا، فلا تعد الدفع الآن.", "The status is temporarily unavailable. We will retry; do not pay again now.") : t("ننتظر تأكيد القبض من مزوّد الدفع؛ الحجز المبدئي وحده لا يعني اكتمال الدفع.", "We are waiting for the provider to confirm capture. An initial authorisation alone does not confirm payment.")}</p><a class="text-link" href="${path === "/payment/callback" ? "/merchant/dashboard" : href("/support")}">${path === "/payment/callback" ? t("العودة للحساب", "Return to account") : t("تواصل مع الدعم", "Contact support")}</a>`;
  };
  const poll = async () => {
    if (finished || document.hidden || inFlight) return;
    inFlight = true;
    polls++;
    try {
      const result =
        path === "/payment/callback"
          ? await api.payment.getPaymentCallbackStatus.query({
              tap_id: chargeId,
            })
          : linkId
            ? await api.payments.getPublicLinkPaymentStatus.query({
                linkId,
                chargeId,
              })
            : await api.payments.getPublicChargeStatus.query({ chargeId });
      if (result.status === "captured" || result.status === "completed") {
        finished = true;
        renderStatus("success");
      } else if (result.status === "failed") {
        finished = true;
        renderStatus("failure");
      } else renderStatus(polls >= 30 ? "timeout" : "waiting");
    } catch {
      renderStatus(polls >= 30 ? "timeout" : "error");
    } finally {
      inFlight = false;
    }
    if (polls >= 30) finished = true;
    if (!finished) timer = window.setTimeout(() => void poll(), 2000);
  };
  document.addEventListener("visibilitychange", () => {
    if (timer) clearTimeout(timer);
    if (!document.hidden && !finished) void poll();
  });
  window.addEventListener(
    "pagehide",
    () => {
      finished = true;
      if (timer) clearTimeout(timer);
    },
    { once: true }
  );
  await poll();
}
