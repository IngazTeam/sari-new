import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import { beginCalendarOAuth } from "./calendar-oauth";
import { guardCalendarOAuth } from "./calendar-oauth-api";
import { readCalendarSettings, disconnectCalendar } from "./calendar-settings";
import { calendarDisconnectInput } from "../shared/calendar-settings";
export const calendarConnectionProcedures = {
  beginOAuth: permissionProcedure("integrations.manage").mutation(({ ctx }) => {
    if (!ctx.session?.sessionId)
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "calendar_oauth:session",
      });
    return guardCalendarOAuth(() =>
      beginCalendarOAuth({
        merchantId: ctx.merchantId,
        userId: ctx.user.id,
        sessionId: ctx.session!.sessionId,
      })
    );
  }),
  settings: permissionProcedure("integrations.manage").query(({ ctx }) => {
    if (!ctx.session?.sessionId)
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "calendar_oauth:session",
      });
    return guardCalendarOAuth(() =>
      readCalendarSettings({
        merchantId: ctx.merchantId,
        userId: ctx.user.id,
        sessionId: ctx.session!.sessionId,
      })
    );
  }),
  disconnect: permissionProcedure("integrations.manage")
    .input(calendarDisconnectInput)
    .mutation(({ ctx, input }) => {
      if (!ctx.session?.sessionId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "calendar_oauth:session",
        });
      return guardCalendarOAuth(() =>
        disconnectCalendar(
          {
            merchantId: ctx.merchantId,
            userId: ctx.user.id,
            sessionId: ctx.session!.sessionId,
          },
          input
        )
      );
    }),
};
