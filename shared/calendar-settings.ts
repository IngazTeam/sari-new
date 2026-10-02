import { z } from "zod";
import { bookingReadId } from "./booking-read";
export const calendarDisconnectInput = z
  .object({
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export const calendarSettingsView = z
  .object({
    actorId: bookingReadId,
    merchantId: bookingReadId,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    hasIntegration: z.boolean(),
    active: z.boolean(),
    oauthReady: z.boolean(),
    state: z.enum([
      "unlinked",
      "credentials_invalid",
      "oauth_disabled",
      "needs_destination",
      "configured",
    ]),
    calendarId: z.string().nullable(),
    lastSync: z.string().datetime().nullable(),
    retainedAppointments: z.number().int().nonnegative().safe(),
  })
  .strict();
export type CalendarSettingsView = z.infer<typeof calendarSettingsView>;
