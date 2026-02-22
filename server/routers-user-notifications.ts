/**
 * User Notifications Router Module
 * Handles basic user notification CRUD (list, unread count, mark as read, delete)
 * 
 * NOTE: This is separate from routers-notifications.ts which handles
 * push notifications, scheduled reports, and WhatsApp auto-notifications.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const userNotificationsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        return await db.getNotificationsByUserId(ctx.user.id);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
        return await db.getUnreadNotificationsCount(ctx.user.id);
    }),

    markAsRead: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            return await db.markNotificationAsRead(input.id, ctx.user.id);
        }),

    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
        return await db.markAllNotificationsAsRead(ctx.user.id);
    }),

    delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            return await db.deleteNotification(input.id, ctx.user.id);
        }),
});

export type UserNotificationsRouter = typeof userNotificationsRouter;
