import {z} from 'zod';
import {router,permissionProcedure} from './_core/trpc';
import {generateSuggestionsInput,customReplyInput,improveReplyInput} from '../shared/reply-suggestions';
import {generateReplySuggestions,generateCustomConversationReply,improveConversationReply} from './reply-suggestions';

export const aiSuggestionsRouter=router({
  generateSuggestions:permissionProcedure('conversations.reply').input(generateSuggestionsInput).mutation(({ctx,input})=>
    generateReplySuggestions(ctx.merchantId,ctx.user.id,input.conversationId,input.context)),
  generateCustomReply:permissionProcedure('conversations.reply').input(customReplyInput).mutation(({ctx,input})=>
    generateCustomConversationReply(ctx.merchantId,ctx.user.id,input.conversationId,input.instruction)),
  improveReply:permissionProcedure('conversations.reply').input(improveReplyInput).mutation(({ctx,input})=>
    improveConversationReply(ctx.merchantId,input)),
  // اقتراحات سريعة مبنية على نوع الرسالة
  getQuickSuggestions: permissionProcedure('conversations.read')
    .input(z.object({
      messageType: z.enum([
        'greeting', // تحية
        'product_inquiry', // استفسار عن منتج
        'price_inquiry', // استفسار عن السعر
        'order_status', // حالة الطلب
        'complaint', // شكوى
        'thanks', // شكر
        'goodbye', // وداع
        'general', // عام
      ]),
    }).strict())
    .query(async ({ input }) => {
      const quickReplies: Record<string, Array<{ text: string; emoji: string }>> = {
        greeting: [
          { text: 'أهلاً وسهلاً! كيف أقدر أساعدك؟', emoji: '👋' },
          { text: 'مرحباً! تفضل كيف أخدمك؟', emoji: '😊' },
          { text: 'هلا والله! شلون أقدر أساعدك؟', emoji: '🌟' },
        ],
        product_inquiry: [
          { text: 'أي منتج تقصد حتى أتحقق من تفاصيله؟', emoji: '🔎' },
          { text: 'أرسل اسم المنتج أو صورته لأراجع توفره', emoji: '📦' },
          { text: 'أي لون أو مقاس تبحث عنه؟', emoji: '🎨' },
        ],
        price_inquiry: [
          { text: 'أي منتج تريد معرفة سعره؟', emoji: '💰' },
          { text: 'ما الكمية المطلوبة حتى أراجع السعر؟', emoji: '🔎' },
          { text: 'خلني أتحقق من السعر الحالي والتفاصيل', emoji: '📋' },
        ],
        order_status: [
          { text: 'ممكن رقم الطلب حتى أراجع حالته؟', emoji: '🔎' },
          { text: 'أرسل رقم التتبع إن كان متوفرًا لديك', emoji: '📦' },
          { text: 'خلني أتحقق من تفاصيل طلبك أولًا', emoji: '📋' },
        ],
        complaint: [
          { text: 'نعتذر جداً عن الإزعاج. خلني أحل المشكلة', emoji: '🙏' },
          { text: 'آسفين على هالموقف. ممكن توضح ما حدث؟', emoji: '💬' },
          { text: 'شكراً على ملاحظتك. راح نتابع الموضوع', emoji: '📝' },
        ],
        thanks: [
          { text: 'العفو! نورتنا 🌹', emoji: '🌹' },
          { text: 'شكراً لك! ننتظرك دايماً', emoji: '💜' },
          { text: 'تسلم! نتشرف بخدمتك', emoji: '🙏' },
        ],
        goodbye: [
          { text: 'مع السلامة! ننتظرك مرة ثانية', emoji: '👋' },
          { text: 'الله يسعدك! تشرفنا', emoji: '💫' },
          { text: 'في أمان الله! لا تتردد تراسلنا', emoji: '🌟' },
        ],
        general: [
          { text: 'تفضل، كيف أقدر أساعدك؟', emoji: '💬' },
          { text: 'أنا هنا لخدمتك', emoji: '🤝' },
          { text: 'لو عندك أي سؤال، تفضل', emoji: '❓' },
        ],
      };

      return {
        suggestions: quickReplies[input.messageType] || quickReplies.general,
      };
    }),
});

export default aiSuggestionsRouter;
