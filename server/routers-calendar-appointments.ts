import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure } from "./_core/trpc";
import {
  appointmentCreationSchema,
  appointmentCancellationSchema,
  appointmentAvailabilitySchema,
} from "../shared/appointment-creation";
import {
  bookCalendarAppointment,
  cancelCalendarAppointment,
} from "./appointment-calendar";
import { getCalendarAvailability } from "./calendar-availability";

export const calendarAppointmentProcedures = {
  bookAppointment: permissionProcedure("orders.manage")
    .input(appointmentCreationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await bookCalendarAppointment({
          ...input,
          merchantId: ctx.merchantId,
        });
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "تعذر إتمام الحجز؛ راجع قائمة المواعيد والتوفر قبل إعادة المحاولة.",
        });
      }
    }),
  cancelAppointment: permissionProcedure("orders.manage")
    .input(appointmentCancellationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await cancelCalendarAppointment(ctx.merchantId, input);
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "تعذر تأكيد الإلغاء؛ راجع الموعد ومزامنة التقويم. يظل الموعد محجوزًا حتى تأكيد الإلغاء.",
        });
      }
    }),
  getAvailableSlots: merchantProcedure
    .input(appointmentAvailabilitySchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getCalendarAvailability(ctx.merchantId, input);
      } catch {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "تعذر التحقق من توفر الخدمة والموظف والتقويم.",
        });
      }
    }),
};
