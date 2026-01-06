import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import * as db from './db';

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const smartNotificationsRouter = router({
  // إرسال إشعارات نهاية الفترة التجريبية
  sendTrialEndingNotifications: adminProcedure.mutation(async () => {
    const merchants = await db.getAllMerchants();
    const notifications = [];
    const now = Date.now();
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

    for (const merchant of merchants) {
      const subscription = await db.getMerchantActiveSubscription(merchant.id);
      
      if (!subscription || subscription.status !== 'trial') continue;

      const trialEndsAt = new Date(subscription.trialEndsAt!).getTime();
      const timeUntilEnd = trialEndsAt - now;

      // إرسال إشعار قبل 3 أيام من نهاية التجربة
      if (timeUntilEnd > 0 && timeUntilEnd <= threeDaysInMs) {
        const daysLeft = Math.ceil(timeUntilEnd / (24 * 60 * 60 * 1000));
        
        const notification = await db.createNotification({
          userId: merchant.userId,
          type: 'warning',
          title: 'انتهاء الفترة التجريبية قريباً',
          message: `ستنتهي فترتك التجريبية خلال ${daysLeft} أيام. قم بالترقية الآن للاستمرار في استخدام جميع المزايا.`,
          link: '/merchant/subscription-plans',
        });
        
        notifications.push(notification);
      }
    }

    return {
      success: true,
      count: notifications.length,
      notifications,
    };
  }),

  // إرسال إشعارات عند وصول 90% من الحدود
  sendUsageLimitNotifications: adminProcedure.mutation(async () => {
    const merchants = await db.getAllMerchants();
    const notifications = [];

    for (const merchant of merchants) {
      const subscription = await db.getMerchantActiveSubscription(merchant.id);
      if (!subscription) continue;

      const plan = await db.getPlanById(subscription.planId);
      if (!plan) continue;

      const usage = await db.getMerchantCurrentUsage(merchant.id);
      if (!usage) continue;

      const limits = [
        {
          name: 'المحادثات',
          current: usage.conversationsUsed,
          limit: plan.conversationLimit,
          link: '/merchant/conversations',
        },
        {
          name: 'الرسائل الصوتية',
          current: usage.voiceMessagesUsed,
          limit: plan.voiceMessageLimit,
          link: '/merchant/conversations',
        },
        {
          name: 'الحملات',
          current: usage.campaignsUsed,
          limit: plan.campaignLimit,
          link: '/merchant/campaigns',
        },
        {
          name: 'المنتجات',
          current: usage.productsUsed,
          limit: plan.productLimit,
          link: '/merchant/products',
        },
      ];

      for (const item of limits) {
        // تجاهل الحدود غير المحدودة
        if (item.limit === -1) continue;

        const percentage = (item.current / item.limit) * 100;

        // إرسال إشعار عند الوصول إلى 90%
        if (percentage >= 90 && percentage < 100) {
          const notification = await db.createNotification({
            userId: merchant.userId,
            type: 'warning',
            title: `اقتراب من حد ${item.name}`,
            message: `لقد استخدمت ${percentage.toFixed(0)}% من حد ${item.name} الخاص بك (${item.current}/${item.limit}). قم بالترقية لزيادة الحد.`,
            link: item.link,
          });
          
          notifications.push(notification);
        }
        
        // إرسال إشعار عند الوصول إلى 100%
        if (percentage >= 100) {
          const notification = await db.createNotification({
            userId: merchant.userId,
            type: 'error',
            title: `وصلت إلى حد ${item.name}`,
            message: `لقد وصلت إلى الحد الأقصى لـ ${item.name} (${item.limit}). قم بالترقية الآن للاستمرار.`,
            link: '/merchant/subscription-plans',
          });
          
          notifications.push(notification);
        }
      }
    }

    return {
      success: true,
      count: notifications.length,
      notifications,
    };
  }),

  // جدولة الإشعارات التلقائية (يتم استدعاؤها من cron job)
  scheduleSmartNotifications: adminProcedure.mutation(async () => {
    // إرسال إشعارات نهاية الفترة التجريبية
    const trialNotifications = await smartNotificationsRouter.createCaller({
      user: { id: 1, role: 'admin' } as any,
    }).sendTrialEndingNotifications();

    // إرسال إشعارات حدود الاستخدام
    const usageNotifications = await smartNotificationsRouter.createCaller({
      user: { id: 1, role: 'admin' } as any,
    }).sendUsageLimitNotifications();

    return {
      success: true,
      trialNotifications: trialNotifications.count,
      usageNotifications: usageNotifications.count,
      total: trialNotifications.count + usageNotifications.count,
    };
  }),

  // الحصول على إحصائيات الإشعارات
  getNotificationStats: adminProcedure.query(async () => {
    const merchants = await db.getAllMerchants();
    let trialEndingSoon = 0;
    let usageAbove90 = 0;
    let usageAt100 = 0;

    for (const merchant of merchants) {
      const subscription = await db.getMerchantActiveSubscription(merchant.id);
      
      if (subscription && subscription.status === 'trial' && subscription.trialEndsAt) {
        const now = Date.now();
        const trialEndsAt = new Date(subscription.trialEndsAt).getTime();
        const timeUntilEnd = trialEndsAt - now;
        const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

        if (timeUntilEnd > 0 && timeUntilEnd <= threeDaysInMs) {
          trialEndingSoon++;
        }
      }

      if (subscription) {
        const plan = await db.getPlanById(subscription.planId);
        const usage = await db.getMerchantCurrentUsage(merchant.id);

        if (plan && usage) {
          const limits = [
            { current: usage.conversationsUsed, limit: plan.conversationLimit },
            { current: usage.voiceMessagesUsed, limit: plan.voiceMessageLimit },
            { current: usage.campaignsUsed, limit: plan.campaignLimit },
            { current: usage.productsUsed, limit: plan.productLimit },
          ];

          for (const item of limits) {
            if (item.limit === -1) continue;
            const percentage = (item.current / item.limit) * 100;
            
            if (percentage >= 90 && percentage < 100) {
              usageAbove90++;
            }
            if (percentage >= 100) {
              usageAt100++;
            }
          }
        }
      }
    }

    return {
      trialEndingSoon,
      usageAbove90,
      usageAt100,
      totalPending: trialEndingSoon + usageAbove90 + usageAt100,
    };
  }),
});
