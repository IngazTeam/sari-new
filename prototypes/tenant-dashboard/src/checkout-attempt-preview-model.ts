import { readCheckoutCheckpoint, checkoutCheckpointKey } from "../../../client/src/lib/subscription-checkout-recovery";
import {
  checkoutAttemptLookup,
  checkoutAttemptSchema,
  type CheckoutAttempt,
} from "../../../shared/subscription-checkout-attempt";
import { checkoutPreview } from "./plan-catalog-preview-model";
import type { ServiceMode } from "./service-preview-model";

/** Simulated records only, stored separately from the app's browser checkpoint. */
export class CheckoutAttemptPreviewStore {
  private records = new Map<string, CheckoutAttempt>();
  constructor(
    private actorId: number,
    private merchantId: number
  ) {}
  private key(id: string) {
    return `sari.preview.checkout-record.v1:${this.actorId}:${this.merchantId}:${id}`;
  }
  read(input: unknown, mode?: ServiceMode) {
    const { checkoutAttemptId } = checkoutAttemptLookup.parse(input);
    let row = this.records.get(checkoutAttemptId);
    if (!row && typeof window !== "undefined") {
      const raw = window.localStorage.getItem(this.key(checkoutAttemptId));
      if (raw) row = checkoutAttemptSchema.parse(JSON.parse(raw));
    }
    if (
      row &&
      (row.actorId !== this.actorId ||
        row.merchantId !== this.merchantId ||
        row.checkoutAttemptId !== checkoutAttemptId)
    )
      throw Error("Invalid simulated record");
    const now = new Date().toISOString();
    return checkoutAttemptSchema.parse(
      row
        ? {
            ...row,
            checkedAt: now,
            ...(mode === "capture-review"
              ? { state: "requires_review", recordedCheckoutUrl: null, linkExpiresAt: null }
              : {}),
            ...(row.linkExpiresAt &&
            Date.parse(row.linkExpiresAt) <= Date.parse(now)
              ? { recordedCheckoutUrl: null, linkExpiresAt: null }
              : {}),
          }
        : {
            actorId: this.actorId,
            merchantId: this.merchantId,
            checkoutAttemptId,
            checkedAt: now,
            found: false,
            transactionId: null,
            state: "not_found",
            planId: null,
            billingCycle: null,
            amountMinor: null,
            currency: null,
            recordedCheckoutUrl: null,
            linkExpiresAt: null,
          }
    );
  }
  save(input: any, mode: ServiceMode) {
    const old = this.read({ checkoutAttemptId: input.checkoutAttemptId });
    if (old.found) return old;
    const quote = checkoutPreview(this.merchantId, this.actorId, "normal", {
      planId: input.planId ?? input.newPlanId,
      billingCycle: input.billingCycle ?? input.newBillingCycle,
    });
    const row = checkoutAttemptSchema.parse({
      ...old,
      found: true,
      transactionId: 41,
      state: mode === "capture-review" ? "requires_review" : "pending",
      planId: quote.planId,
      billingCycle: quote.billingCycle,
      currency: quote.currency,
      amountMinor: quote.chargeMinor,
      recordedCheckoutUrl:
        mode === "uncertain-save" || mode === "capture-review"
          ? null
          : "https://sandbox.payments.tap.company/preview-only",
      linkExpiresAt:
        mode === "uncertain-save" || mode === "capture-review"
          ? null
          : new Date(Date.now() + 600000).toISOString(),
    });
    this.records.set(row.checkoutAttemptId, row);
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        this.key(row.checkoutAttemptId),
        JSON.stringify(row)
      );
    return row;
  }
}

export function resetCheckoutPreview(actorId: number, merchantId: number) {
  const saved = readCheckoutCheckpoint(actorId, merchantId);
  if (saved.kind === "saved") window.localStorage.removeItem(`sari.preview.checkout-record.v1:${actorId}:${merchantId}:${saved.checkpoint.checkoutAttemptId}`);
  window.localStorage.removeItem(checkoutCheckpointKey(actorId, merchantId));
}
