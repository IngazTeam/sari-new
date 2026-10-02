import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { readAppointmentReminders } from "./appointment-reminders";
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
import { appointmentSlotsView, appointmentRequestView, appointmentReceiptView } from '../shared/appointment-workspace';

export const calendarAppointmentProcedures = {
  getReminderReview: permissionProcedure("orders.manage")
    .input(
      z.object({ appointmentId: z.number().int().positive().safe() }).strict()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await readAppointmentReminders(
          ctx.merchantId,
          input.appointmentId
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message: "تعذر قراءة حالة التذكيرات؛ راجع صلاحياتك وحالة الموعد.",
        });
      }
    }),
  bookAppointment: permissionProcedure("orders.manage")
    .input(appointmentCommandSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { requestId, ...fields } = input;
        const result = await bookCalendarAppointment(
          {
            ...fields,
            merchantId: ctx.merchantId,
          },
          { requestId, actorUserId: ctx.user.id }
        );
        if(result.requestId!==requestId)throw Error('Appointment request mismatch');
        return appointmentReceiptView.parse({...result,actorId:ctx.user.id,merchantId:ctx.merchantId,checkedAt:new Date().toISOString()});
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
        const result = await readAppointmentCreationRequest(ctx.merchantId, {
          ...input,
          actorUserId: ctx.user.id,
        });
        if(result.requestId!==input.requestId)throw Error('Appointment request mismatch');
        return appointmentRequestView.parse({...result,actorId:ctx.user.id,merchantId:ctx.merchantId,checkedAt:new Date().toISOString()});
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
        const result=await getCalendarAvailability(ctx.merchantId,input);
        return appointmentSlotsView.parse({...result,selection:input,actorId:ctx.user.id,merchantId:ctx.merchantId,checkedAt:new Date().toISOString()});
      } catch {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "تعذر التحقق من توفر الخدمة والموظف والتقويم.",
        });
      }
    }),
};
