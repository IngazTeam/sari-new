import { z } from "zod";
export const bookingConsentAttestationSchema = z
  .object({
    agreementId: z.number().int().positive().safe(),
    evidence: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export type BookingConsentAttestation = z.infer<
  typeof bookingConsentAttestationSchema
>;
export type BookingConsentMessage = {
  id: number;
  text: string;
  at: string;
  truncated: boolean;
};
export type BookingConsentReview = {
  state: "none" | "ready" | "blocked";
  reason:
    | "missing"
    | "integrity"
    | "source"
    | "terms"
    | "refused"
    | "unavailable"
    | "truncated"
    | null;
  agreementId: number | null;
  evidence: string | null;
  offerText: string | null;
  source: BookingConsentMessage | null;
  consent: BookingConsentMessage | null;
  latest: BookingConsentMessage | null;
  refusal: BookingConsentMessage | null;
  terms: {
    serviceName: string;
    staffName: string | null;
    bookingDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    amountMinor: number;
    currency: "SAR";
  } | null;
};
