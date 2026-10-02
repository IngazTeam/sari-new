import { calendarConnectionProcedures } from "./routers-calendar-connection";
import { calendarReconciliationProcedures } from "./routers-calendar-reconciliation";
import { calendarAppointmentProcedures } from "./routers-calendar-appointments";
/**
 * Calendar Router Module
 * Handles Google Calendar integration
 *
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { router } from "./_core/trpc";

export const calendarRouter = router({
  ...calendarConnectionProcedures,

  ...calendarAppointmentProcedures,

  ...calendarReconciliationProcedures,
});

export type CalendarRouter = typeof calendarRouter;
