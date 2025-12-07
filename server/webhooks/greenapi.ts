import * as db from '../db';
import { parseWebhookMessage, sendTextMessage } from '../whatsapp';
import { processIncomingMessage } from '../ai';

interface WebhookResult {
  success: boolean;
  message: string;
}

/**
 * معالجة Webhook من Green API
 */
export async function handleGreenAPIWebhook(webhookData: any): Promise<WebhookResult> {
  try {
    // تحليل الرسالة الواردة
    const incomingMessage = parseWebhookMessage(webhookData);
    
    if (!incomingMessage || incomingMessage.type !== 'text') {
      console.log('[Green API Webhook] Skipping non-text message');
      return {
        success: true,
        message: 'Non-text message skipped'
      };
    }

    const customerPhone = incomingMessage.from;
    const messageText = incomingMessage.message || '';

    console.log(`[Green API Webhook] Processing message from ${customerPhone}: ${messageText}`);

    // البحث عن المحادثة الموجودة
    // أولاً نحتاج لمعرفة merchantId من رقم الواتساب
    const whatsappConnection = await db.getWhatsappConnectionByPhone(customerPhone);
    
    if (!whatsappConnection) {
      console.error(`[Green API Webhook] No WhatsApp connection found for phone ${customerPhone}`);
      return {
        success: false,
        message: 'No WhatsApp connection found'
      };
    }

    let conversation = await db.getConversationByCustomerPhone(whatsappConnection.merchantId, customerPhone);
    
    if (!conversation) {
      // إنشاء محادثة جديدة
      const newConv = await db.createConversation({
        merchantId: whatsappConnection.merchantId,
        customerPhone,
        customerName: customerPhone, // يمكن تحديثه لاحقاً
        status: 'active',
        lastMessageAt: new Date(),
      });
      
      if (!newConv) {
        throw new Error('Failed to create conversation');
      }
      
      conversation = newConv;
    }

    // حفظ الرسالة الواردة
    await db.createMessage({
      conversationId: conversation.id,
      direction: 'incoming',
      content: messageText,
      messageType: 'text',
      isProcessed: false,
    });

    // تحديث آخر رسالة في المحادثة
    await db.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
    });

    // توليد رد تلقائي باستخدام AI
    const aiResponse = await processIncomingMessage(
      conversation.merchantId,
      conversation.id,
      customerPhone,
      messageText
    );

    if (aiResponse) {
      // إرسال الرد عبر WhatsApp
      const sendResult = await sendTextMessage(customerPhone, aiResponse);
      
      if (sendResult.success) {
        console.log(`[Green API Webhook] AI response sent successfully to ${customerPhone}`);
      } else {
        console.error(`[Green API Webhook] Failed to send AI response: ${sendResult.error}`);
      }
    }

    return {
      success: true,
      message: 'Message processed successfully'
    };

  } catch (error: any) {
    console.error('[Green API Webhook] Error processing webhook:', error);
    return {
      success: false,
      message: error.message || 'Unknown error'
    };
  }
}
