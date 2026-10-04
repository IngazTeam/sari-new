import {
  subscriptionBillingSchema,
  billingHistoryInput,
  billingHistorySchema,
  billingTypes,
  billingStates,
} from "../../../shared/subscription-billing-workspace";
import { usageQuota } from "../../../shared/usage-workspace";
import type { ServiceMode } from "./service-preview-model";
export class SubscriptionBillingPreviewStore {
  private cancelled = false;
  constructor(
    private actorId: number,
    private merchantId: number,
    private now: string,
    private mode: () => ServiceMode
  ) {}
  summary() {
    const mode = this.mode(),
      legacy = mode === "legacy",
      blank = mode === "empty" || mode === "unavailable-reference";
    const state =
      mode === "empty"
        ? "none"
        : mode === "unavailable-reference"
          ? "ambiguous"
          : this.cancelled
            ? "cancelled"
            : legacy
              ? "unknown"
              : "active";
    return subscriptionBillingSchema.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      canManage: mode !== "readonly",
      canReadPayments: mode !== "readonly",
      checkedAt: this.now,
      timezone: "UTC",
      state,
      subscription: blank
        ? null
        : {
            id: 41,
            planId: 10,
            nameAr: this.merchantId === 269 ? "مثال نواة" : "مثال مدار",
            nameEn: this.merchantId === 269 ? "Nawa sample" : "Madar sample",
            recordedStatus: this.cancelled ? "cancelled" : "active",
            billingCycle: "monthly",
            startDate: new Date(
              Date.parse(this.now) - 3 * 86400000
            ).toISOString(),
            endDate: legacy
              ? null
              : new Date(Date.parse(this.now) + 27 * 86400000).toISOString(),
            lastResetAt: this.now,
            cancelledAt: this.cancelled ? this.now : null,
            daysRemaining: legacy || this.cancelled ? null : 27,
            limitsSource: legacy ? "unknown" : "plan",
            quotas: {
              conversations: usageQuota(
                legacy ? null : 85,
                legacy ? null : 100
              ),
              messages: usageQuota(230, -1),
              voiceMessages: usageQuota(0, 0),
            },
            resources: {
              customers: usageQuota(null, 999999, true),
              whatsappNumbers: usageQuota(null, 2, true),
            },
          },
    });
  }
  history(raw: unknown) {
    if (this.mode() === "readonly") throw { data: { code: "FORBIDDEN" } };
    const input = billingHistoryInput.parse(raw),
      all =
        this.mode() === "empty"
          ? []
          : Array.from({ length: 31 }, (_, i) => ({
              id: 100 + this.merchantId * 100 - i,
              type: billingTypes[i % 5],
              status: billingStates[i % 4],
              amountMinor:
                this.mode() === "legacy" ? null : i === 0 ? 0 : 9990 + i * 100,
              currency: "SAR" as const,
              createdAt: this.now,
              paidAt: i % 4 === 1 ? this.now : null,
              refundedAt: i % 4 === 3 ? this.now : null,
            }));
    const filtered = all.filter(
        r =>
          (input.beforeId === null || r.id < input.beforeId) &&
          (input.status === "all" || r.status === input.status) &&
          (input.type === "all" || r.type === input.type)
      ),
      rows = filtered.slice(0, input.pageSize);
    return billingHistorySchema.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      checkedAt: this.now,
      timezone: "UTC",
      input,
      rows,
      nextBeforeId:
        filtered.length > input.pageSize ? rows[rows.length - 1].id : null,
    });
  }
  cancel(input: any) {
    if (
      this.summary().state !== "active" ||
      input?.expectedSubscriptionId !== 41 ||
      Object.keys(input).length !== 1
    )
      throw { data: { code: "CONFLICT" } };
    this.cancelled = true;
    return { success: true };
  }
}
