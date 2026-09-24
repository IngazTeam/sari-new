import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure } from "./_core/trpc";
import {
  appointmentCancellationSchema,
  appointmentAvailabilitySchema,
} from "../shared/appointment-creation";
import {
  bookCalendarAppointment,
  cancelCalendarAppointment,
} from "./appointment-calendar";
import { getCalendarAvailability } from "./calendar-availability";
import {
  appointmentCommandSchema,
  appointmentRequestLookupSchema,
} from "../shared/appointment-request";
import { readAppointmentCreationRequest } from "./appointment-creation-requests";

export const calendarAppointmentProcedures = {
  bookAppointment: permissionProcedure("orders.manage")
    .input(appointmentCommandSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { requestId, ...fields } = input;
        return await bookCalendarAppointment(
          {
            ...fields,
            merchantId: ctx.merchantId,
          },
          { requestId, actorUserId: ctx.user.id }
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "تعذر تأكيد نتيجة الحجز؛ تحقق من الطلب بمعرفه الأصلي قبل إعادة المحاولة.",
        });
      }
    }),
  getBookingRequest: permissionProcedure("orders.manage")
    .input(appointmentRequestLookupSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await readAppointmentCreationRequest(ctx.merchantId, {
          ...input,
          actorUserId: ctx.user.id,
        });
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "تعذر قراءة نتيجة طلب الحجز؛ راجع صلاحياتك وحالة الموعد.",
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
