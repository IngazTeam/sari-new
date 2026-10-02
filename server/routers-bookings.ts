import { router } from './_core/trpc';
import { bookingCreationProcedure } from './routers-booking-creation';
import { bookingOperationProcedures } from './routers-booking-operations';
import { bookingReadProcedures } from './routers-booking-reads';

/** Shared reads and operations; payment reconciliation remains mounted in the main router. */
export const bookingsRouter = router({
  create: bookingCreationProcedure,
  ...bookingReadProcedures,
  ...bookingOperationProcedures,
});
export type BookingsRouter = typeof bookingsRouter;
