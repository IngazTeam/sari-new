/**
 * User Notifications Router Module
 * Handles basic user notification CRUD (list, unread count, mark as read, delete)
 * 
 * NOTE: This is separate from routers-notifications.ts which handles
 * push notifications, scheduled reports, and WhatsApp auto-notifications.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  deleteNotification,
  getNotificationsByUserId,
  getUnreadNotificationsCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from './db';

export const userNotificationsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        return await getNotificationsByUserId(ctx.user.id);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
        return await getUnreadNotificationsCount(ctx.user.id);
    }),

    markAsRead: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            return await markNotificationAsRead(input.id, ctx.user.id);
        }),

    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
        return await markAllNotificationsAsRead(ctx.user.id);
    }),

    delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            return await deleteNotification(input.id, ctx.user.id);
        }),
});

export type UserNotificationsRouter = typeof userNotificationsRouter;
