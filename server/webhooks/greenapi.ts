import * as db from '../db';
import { parseWebhookMessage, sendTextMessage } from '../whatsapp';
import { processIncomingMessage } from '../ai';
import { 
  isOrderRequest, 
  parseOrderMessage, 
  createOrderFromChat,
  generateOrderConfirmationMessage,
  generateGiftOrderConfirmationMessage 
} from '../automation/order-from-chat';

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

    // فحص إذا كانت الرسالة طلب شراء
    const isOrder = await isOrderRequest(messageText);
    
    if (isOrder) {
      console.log(`[Green API Webhook] Order request detected from ${customerPhone}`);
      
      try {
        // تحليل الطلب
        const parsedOrder = await parseOrderMessage(messageText, conversation.merchantId);
        
        if (parsedOrder && parsedOrder.products.length > 0) {
          // إنشاء الطلب (مع تمرير الرسالة لاكتشاف كودات الخصم)
          const orderResult = await createOrderFromChat(
            conversation.merchantId,
            customerPhone,
            conversation.customerName || customerPhone,
            parsedOrder,
            messageText // تمرير الرسالة لاكتشاف كودات الخصم
          );
          
          if (orderResult) {
            // الحصول على تفاصيل الطلب
            const order = await db.getOrderById(orderResult.orderId);
            if (order) {
              const items = JSON.parse(order.items);
              
              // توليد رسالة التأكيد
              const confirmationMessage = order.isGift
                ? generateGiftOrderConfirmationMessage(
                    order.orderNumber || '',
                    order.giftRecipientName || '',
                    items,
                    order.totalAmount,
                    orderResult.paymentUrl || '',
                    orderResult.discountInfo
                  )
                : generateOrderConfirmationMessage(
                    order.orderNumber || '',
                    items,
                    order.totalAmount,
                    orderResult.paymentUrl || '',
                    orderResult.discountInfo
                  );
              
              // إرسال رسالة التأكيد
              const sendResult = await sendTextMessage(customerPhone, confirmationMessage);
              
              if (sendResult.success) {
                console.log(`[Green API Webhook] Order confirmation sent to ${customerPhone}`);
                
                // حفظ رسالة التأكيد
                await db.createMessage({
                  conversationId: conversation.id,
                  direction: 'outgoing',
                  content: confirmationMessage,
                  messageType: 'text',
                  isProcessed: true,
                });
              }
              
              return {
                success: true,
                message: 'Order created and confirmation sent'
              };
            }
          } else {
            // فشل إنشاء الطلب
            const errorMessage = 'عذراً، لم نتمكن من إنشاء طلبك. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.';
            await sendTextMessage(customerPhone, errorMessage);
          }
        } else {
          // لم نتمكن من فهم الطلب
          const clarificationMessage = 'أهلاً بك! 👋\n\nلم أتمكن من فهم طلبك بشكل كامل. هل يمكنك توضيح:\n\n1️⃣ المنتجات المطلوبة\n2️⃣ الكمية\n3️⃣ العنوان (إن أمكن)\n\nمثال: "أبي جوال آيفون عدد 2 وسماعة بلوتوث عدد 1"';
          await sendTextMessage(customerPhone, clarificationMessage);
        }
      } catch (error) {
        console.error('[Green API Webhook] Error processing order:', error);
        const errorMessage = 'عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.';
        await sendTextMessage(customerPhone, errorMessage);
      }
    } else {
      // رسالة عادية - معالجة بالذكاء الاصطناعي
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
