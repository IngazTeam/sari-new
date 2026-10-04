import {
  usageQuota,
  usageWorkspaceSchema,
} from "../../../shared/usage-workspace";
import type { ServiceMode } from "./service-preview-model";
export function usagePreviewSnapshot(
  merchantId: number,
  actorId: number,
  mode: ServiceMode
) {
  const empty = mode === "empty",
    legacy = mode === "legacy",
    second = merchantId === 270;
  const unknown = empty || legacy || mode === "unavailable-reference";
  const checkedAt = "2026-10-04T12:00:00.000Z";
  const history = [
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
  ].map((month, i) => ({
    month,
    campaigns: empty ? 0 : i + (second ? 2 : 1),
    outgoingMessages: empty ? 0 : (i + 1) * (second ? 17 : 39),
  }));
  return usageWorkspaceSchema.parse({
    actorId,
    merchantId,
    checkedAt,
    timezone: "UTC",
    subscription: {
      state: empty
        ? "none"
        : mode === "unavailable-reference"
          ? "ambiguous"
          : legacy
            ? "unknown"
            : "active",
      id: empty || mode === "unavailable-reference" ? null : 41,
      planId: unknown ? null : 10,
      nameAr: unknown ? null : second ? "مثال مدار" : "مثال نواة",
      nameEn: unknown ? null : second ? "Madar sample" : "Nawa sample",
      billingCycle: unknown ? null : "monthly",
      startDate: empty ? null : "2026-10-01T00:00:00.000Z",
      endDate: empty ? null : "2026-11-01T00:00:00.000Z",
      lastResetAt: unknown ? null : "2026-10-01T00:00:00.000Z",
      limitsSource: unknown ? "unknown" : "plan",
    },
    quotas: {
      conversations: usageQuota(
        unknown ? null : second ? 120 : 85,
        unknown ? null : 100
      ),
      messages: usageQuota(unknown ? null : 230, unknown ? null : -1),
      voiceMessages: usageQuota(unknown ? null : 0, unknown ? null : 0),
    },
    resources: {
      customers: usageQuota(
        empty ? 0 : second ? 390 : 240,
        unknown ? null : 300
      ),
      whatsappNumbers: usageQuota(empty ? 0 : 1, unknown ? null : 2),
      products: usageQuota(empty ? 0 : second ? 32 : 734, null),
    },
    activity: {
      ...history[5],
      from: "2026-10-01T00:00:00.000Z",
      to: checkedAt,
    },
    history,
  });
}
