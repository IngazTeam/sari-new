import { TRPCError } from '@trpc/server';
import { merchantProcedure } from './_core/trpc';
import { bookingReadIdentity, bookingListInput, bookingServiceInput, bookingCustomerInput, bookingStatsInput, bookingAvailabilityInput, bookingSlotsInput } from '../shared/booking-read';
import { getBookingById, getBookingsByMerchant, getBookingsByService, getBookingsByCustomer, getBookingStats, getServiceById, getStaffMemberById, checkBookingConflict, getAvailableTimeSlots } from './db';

// The mounted and standalone routers share the same validation and selected-store authority.
async function read<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Booking data unavailable' });
  }
}
async function references(merchantId: number, input: { serviceId?: number; staffId?: number }, active = false) {
  if (input.serviceId !== undefined) {
    const service = await getServiceById(input.serviceId);
    if (!service || service.merchantId !== merchantId || active && service.isActive !== 1)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
  }
  if (input.staffId !== undefined) {
    const staff = await getStaffMemberById(input.staffId);
    if (!staff || staff.merchantId !== merchantId || active && staff.isActive !== 1)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
  }
}
export const bookingReadProcedures = {
  getById: merchantProcedure.input(bookingReadIdentity).query(({ ctx, input }) => read(async () => {
    const booking = await getBookingById(input.bookingId, ctx.merchantId);
    if (!booking || booking.merchantId !== ctx.merchantId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
    return { booking };
  })),
  list: merchantProcedure.input(bookingListInput).query(({ ctx, input }) => read(async () => {
    await references(ctx.merchantId, input);
    return { bookings: await getBookingsByMerchant(ctx.merchantId, input) };
  })),
  getByService: merchantProcedure.input(bookingServiceInput).query(({ ctx, input }) => read(async () => {
    await references(ctx.merchantId, input);
    return { bookings: await getBookingsByService(input.serviceId, ctx.merchantId, input) };
  })),
  getByCustomer: merchantProcedure.input(bookingCustomerInput).query(({ ctx, input }) => read(async () => ({
    bookings: await getBookingsByCustomer(ctx.merchantId, input.customerPhone),
  }))),
  getStats: merchantProcedure.input(bookingStatsInput).query(({ ctx, input }) => read(async () => {
    await references(ctx.merchantId, input);
    return { stats: await getBookingStats(ctx.merchantId, input) };
  })),
  checkAvailability: merchantProcedure.input(bookingAvailabilityInput).query(({ ctx, input }) => read(async () => {
    await references(ctx.merchantId, input, true);
    const hasConflict = await checkBookingConflict(input.serviceId, input.staffId ?? null, input.bookingDate, input.startTime, input.endTime, undefined, ctx.merchantId);
    return { available: !hasConflict };
  })),
  getAvailableSlots: merchantProcedure.input(bookingSlotsInput).query(({ ctx, input }) => read(async () => {
    await references(ctx.merchantId, input, true);
    return { slots: await getAvailableTimeSlots(input.serviceId, input.date, input.staffId, ctx.merchantId) };
  })),
};
