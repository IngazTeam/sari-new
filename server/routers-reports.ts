/**
 * Reports Router Module
 * Handles sales, customers, and conversations reports with real DB queries
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getMerchantByUserId, getDb } from './db';
import { orders, conversations, messages, products } from '../drizzle/schema';
import { eq, and, gte, sql, count, desc } from 'drizzle-orm';

/**
 * Calculate the start date for a given period
 */
function getPeriodStartDate(period: 'day' | 'week' | 'month' | 'year'): Date {
    const now = new Date();
    switch (period) {
        case 'day':
            now.setHours(0, 0, 0, 0);
            return now;
        case 'week':
            now.setDate(now.getDate() - 7);
            return now;
        case 'month':
            now.setMonth(now.getMonth() - 1);
            return now;
        case 'year':
            now.setFullYear(now.getFullYear() - 1);
            return now;
    }
}

function formatDateForDB(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

export const reportsRouter = router({
    // Get sales report — real data from orders table
    getSalesReport: protectedProcedure
        .input(z.object({
            period: z.enum(['day', 'week', 'month', 'year']),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const db = await getDb();
            if (!db) {
                return { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, conversionRate: 0, growth: 0, topProducts: [] };
            }

            const periodStart = getPeriodStartDate(input.period);
            const periodStartStr = formatDateForDB(periodStart);

            // Current period stats
            const [stats] = await db.select({
                totalOrders: count(),
                totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
                averageOrderValue: sql<number>`COALESCE(AVG(${orders.totalAmount}), 0)`,
            })
            .from(orders)
            .where(and(
                eq(orders.merchantId, merchant.id),
                gte(orders.createdAt, periodStartStr),
            ));

            // Previous period for growth calculation
            const prevPeriodStart = new Date(periodStart);
            const periodMs = Date.now() - periodStart.getTime();
            prevPeriodStart.setTime(prevPeriodStart.getTime() - periodMs);
            const prevPeriodStartStr = formatDateForDB(prevPeriodStart);

            const [prevStats] = await db.select({
                totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
            })
            .from(orders)
            .where(and(
                eq(orders.merchantId, merchant.id),
                gte(orders.createdAt, prevPeriodStartStr),
                sql`${orders.createdAt} < ${periodStartStr}`,
            ));

            const prevRevenue = Number(prevStats?.totalRevenue || 0);
            const currentRevenue = Number(stats?.totalRevenue || 0);
            const growth = prevRevenue > 0
                ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100)
                : 0;

            // Conversations that led to orders (conversion rate)
            const [convStats] = await db.select({
                totalConversations: count(),
            })
            .from(conversations)
            .where(and(
                eq(conversations.merchantId, merchant.id),
                gte(conversations.createdAt, periodStartStr),
            ));

            const totalConvs = Number(convStats?.totalConversations || 0);
            const totalOrds = Number(stats?.totalOrders || 0);
            const conversionRate = totalConvs > 0
                ? Math.round((totalOrds / totalConvs) * 100)
                : 0;

            // Top products (from order items — items is a JSON text field)
            // Return basic stats since items parsing is complex
            const topProductsList = await db.select({
                id: products.id,
                name: products.name,
                price: products.price,
            })
            .from(products)
            .where(eq(products.merchantId, merchant.id))
            .orderBy(desc(products.updatedAt))
            .limit(5);

            return {
                totalRevenue: currentRevenue,
                totalOrders: totalOrds,
                averageOrderValue: Math.round(Number(stats?.averageOrderValue || 0)),
                conversionRate,
                growth,
                topProducts: topProductsList,
            };
        }),

    // Get customers report — real data from conversations table
    getCustomersReport: protectedProcedure
        .input(z.object({
            period: z.enum(['day', 'week', 'month', 'year']),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const db = await getDb();
            if (!db) {
                return { totalCustomers: 0, newCustomers: 0, activeCustomers: 0, retentionRate: 0, topCustomers: [] };
            }

            const periodStart = getPeriodStartDate(input.period);
            const periodStartStr = formatDateForDB(periodStart);

            // Total unique customers (by phone) — all time
            const [totalStats] = await db.select({
                totalCustomers: sql<number>`COUNT(DISTINCT ${conversations.customerPhone})`,
            })
            .from(conversations)
            .where(eq(conversations.merchantId, merchant.id));

            // New customers this period
            const [newStats] = await db.select({
                newCustomers: sql<number>`COUNT(DISTINCT ${conversations.customerPhone})`,
            })
            .from(conversations)
            .where(and(
                eq(conversations.merchantId, merchant.id),
                gte(conversations.createdAt, periodStartStr),
            ));

            // Active customers (with messages in this period)
            const [activeStats] = await db.select({
                activeCustomers: sql<number>`COUNT(DISTINCT ${conversations.customerPhone})`,
            })
            .from(conversations)
            .where(and(
                eq(conversations.merchantId, merchant.id),
                eq(conversations.status, 'active'),
                gte(conversations.lastMessageAt, periodStartStr),
            ));

            const total = Number(totalStats?.totalCustomers || 0);
            const active = Number(activeStats?.activeCustomers || 0);
            const retentionRate = total > 0 ? Math.round((active / total) * 100) : 0;

            // Top customers by spending
            const topCustomers = await db.select({
                customerPhone: conversations.customerPhone,
                customerName: conversations.customerName,
                totalSpent: conversations.totalSpent,
                purchaseCount: conversations.purchaseCount,
            })
            .from(conversations)
            .where(and(
                eq(conversations.merchantId, merchant.id),
                sql`${conversations.totalSpent} > 0`,
            ))
            .orderBy(desc(conversations.totalSpent))
            .limit(5);

            return {
                totalCustomers: total,
                newCustomers: Number(newStats?.newCustomers || 0),
                activeCustomers: active,
                retentionRate,
                topCustomers,
            };
        }),

    // Get conversations report — real data from conversations/messages tables
    getConversationsReport: protectedProcedure
        .input(z.object({
            period: z.enum(['day', 'week', 'month', 'year']),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const db = await getDb();
            if (!db) {
                return { totalConversations: 0, averageResponseTime: 0, satisfactionRate: 0, conversionRate: 0, topTopics: [] };
            }

            const periodStart = getPeriodStartDate(input.period);
            const periodStartStr = formatDateForDB(periodStart);

            // Total conversations in period
            const [convStats] = await db.select({
                totalConversations: count(),
            })
            .from(conversations)
            .where(and(
                eq(conversations.merchantId, merchant.id),
                gte(conversations.createdAt, periodStartStr),
            ));

            // Total messages in period (for AI response stats)
            const [msgStats] = await db.select({
                totalMessages: count(),
                aiResponses: sql<number>`SUM(CASE WHEN ${messages.direction} = 'outgoing' AND ${messages.aiResponse} IS NOT NULL THEN 1 ELSE 0 END)`,
            })
            .from(messages)
            .innerJoin(conversations, eq(messages.conversationId, conversations.id))
            .where(and(
                eq(conversations.merchantId, merchant.id),
                gte(messages.createdAt, periodStartStr),
            ));

            // Conversations that led to purchases
            const [purchaseConvs] = await db.select({
                withPurchase: sql<number>`COUNT(DISTINCT ${conversations.id})`,
            })
            .from(conversations)
            .where(and(
                eq(conversations.merchantId, merchant.id),
                gte(conversations.createdAt, periodStartStr),
                sql`${conversations.purchaseCount} > 0`,
            ));

            const totalConvs = Number(convStats?.totalConversations || 0);
            const withPurchase = Number(purchaseConvs?.withPurchase || 0);
            const conversionRate = totalConvs > 0
                ? Math.round((withPurchase / totalConvs) * 100)
                : 0;

            // Satisfaction rate placeholder (based on sentiment analysis if available)
            const satisfactionRate = 0; // TODO: Integrate with sentimentAnalysis table when enough data

            return {
                totalConversations: totalConvs,
                averageResponseTime: 0, // TODO: Calculate from message timestamps when enough data
                satisfactionRate,
                conversionRate,
                topTopics: [], // TODO: Aggregate from keywordAnalysis table
            };
        }),
});

export type ReportsRouter = typeof reportsRouter;
