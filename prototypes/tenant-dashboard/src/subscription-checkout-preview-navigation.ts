import { toast } from "sonner";
export function openSubscriptionCheckout(_url: string) {
  toast.info(
    new URLSearchParams(location.search).get("lang") === "en"
      ? "Payment handoff simulated. No charge was created."
      : "تمت محاكاة الانتقال للدفع دون إنشاء عملية تحصيل."
  );
}
