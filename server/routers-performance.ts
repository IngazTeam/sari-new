import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import {
  getMerchantById,
  getMessageStats,
  getOrdersByMerchantId,
  getRepeatCustomersCount,
} from './db';
import { z } from 'zod';

export const performanceRouter = router({
  getPerformanceMetrics: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant || merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      // Get message statistics
      const messageStats = await getMessageStats(merchant.id, startDate, endDate);
      const prevMessageStats = await getMessageStats(
        merchant.id,
        new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime())),
        startDate
      );

      // Calculate metrics
      const totalMessages = messageStats?.totalMessages || 0;
      const prevTotalMessages = prevMessageStats?.totalMessages || 0;
      const messageChange = prevTotalMessages > 0 ? ((totalMessages - prevTotalMessages) / prevTotalMessages) * 100 : 0;

      const responseTime = messageStats?.avgResponseTime || 0;
      const prevResponseTime = prevMessageStats?.avgResponseTime || 0;
      const responseTimeChange = prevResponseTime > 0 ? ((responseTime - prevResponseTime) / prevResponseTime) * 100 : 0;

      // Get orders
      const orders = await getOrdersByMerchantId(merchant.id, startDate, endDate);
      const conversionRate = totalMessages > 0 ? (orders.length / totalMessages) * 100 : 0;
      
      const prevOrders = await getOrdersByMerchantId(
        merchant.id,
        new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime())),
        startDate
      );
      const prevConversionRate = prevTotalMessages > 0 ? (prevOrders.length / prevTotalMessages) * 100 : 0;
      const conversionRateChange = prevConversionRate > 0 ? ((conversionRate - prevConversionRate) / prevConversionRate) * 100 : 0;

      // Customer satisfaction
      const uniqueCustomers = messageStats?.uniqueCustomers || 0;
      const repeatCustomers = await getRepeatCustomersCount(merchant.id, startDate, endDate);
      const customerSatisfaction = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
      
      const prevUniqueCustomers = prevMessageStats?.uniqueCustomers || 0;
      const prevRepeatCustomers = await getRepeatCustomersCount(
        merchant.id,
        new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime())),
        startDate
      );
      const prevCustomerSatisfaction = prevUniqueCustomers > 0 ? (prevRepeatCustomers / prevUniqueCustomers) * 100 : 0;
      const customerSatisfactionChange = prevCustomerSatisfaction > 0 ? ((customerSatisfaction - prevCustomerSatisfaction) / prevCustomerSatisfaction) * 100 : 0;

      // Order fulfillment rate
      const completedOrders = orders.filter(o => o.status === 'completed').length;
      const orderFulfillmentRate = orders.length > 0 ? (completedOrders / orders.length) * 100 : 0;
      
      const prevCompletedOrders = prevOrders.filter(o => o.status === 'completed').length;
      const prevOrderFulfillmentRate = prevOrders.length > 0 ? (prevCompletedOrders / prevOrders.length) * 100 : 0;
      const orderFulfillmentRateChange = prevOrderFulfillmentRate > 0 ? ((orderFulfillmentRate - prevOrderFulfillmentRate) / prevOrderFulfillmentRate) * 100 : 0;

      // Repeat purchase rate
      const repeatPurchaseRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
      const prevRepeatPurchaseRate = prevUniqueCustomers > 0 ? (prevRepeatCustomers / prevUniqueCustomers) * 100 : 0;
      const repeatPurchaseRateChange = prevRepeatPurchaseRate > 0 ? ((repeatPurchaseRate - prevRepeatPurchaseRate) / prevRepeatPurchaseRate) * 100 : 0;

      // Financial metrics
      const revenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const prevRevenue = prevOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

      // Cost and ROI
      const cost = merchant.monthlySubscriptionCost || 0;
      const netProfit = revenue - cost;
      const roi = cost > 0 ? (netProfit / cost) * 100 : 0;
      const prevCost = cost;
      const prevNetProfit = prevRevenue - prevCost;
      const prevRoi = prevCost > 0 ? (prevNetProfit / prevCost) * 100 : 0;
      const roiChange = prevRoi > 0 ? ((roi - prevRoi) / prevRoi) * 100 : 0;

      return {
        totalMessages,
        messageChange,
        responseTime,
        responseTimeChange,
        conversionRate,
        conversionRateChange,
        customerSatisfaction,
        customerSatisfactionChange,
        orderFulfillmentRate,
        orderFulfillmentRateChange,
        repeatPurchaseRate,
        repeatPurchaseRateChange,
        totalRevenue: revenue,
        revenueChange,
        totalCost: cost,
        netProfit,
        roi,
        roiChange,
        uniqueCustomers,
        repeatCustomers,
        totalOrders: orders.length,
        completedOrders,
      };
    }),
});
