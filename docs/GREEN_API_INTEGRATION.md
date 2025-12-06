# 📱 دليل تكامل Green API - مشروع Sari

## نظرة عامة

يستخدم مشروع Sari Green API للاتصال بالواتساب وإرسال/استقبال الرسائل. هذا الدليل يشرح كيفية التكامل الكامل.

---

## 1️⃣ الحصول على Green API Credentials

### الخطوات:
1. اذهب إلى [Green API](https://green-api.com/)
2. سجل حساب جديد
3. احصل على:
   - `instanceId`: معرف النسخة الخاص بك
   - `apiToken`: رمز API الخاص بك

### تخزين Credentials:
```typescript
// في جدول whatsappConnections
{
  merchantId: 1,
  instanceId: "1101234567",
  apiToken: "abc123def456...",
  status: "pending"
}
```

---

## 2️⃣ ربط الواتساب عبر QR Code

### API Endpoint:
```typescript
// في server/routers.ts
whatsapp: router({
  getQRCode: protectedProcedure
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input, ctx }) => {
      const connection = await getWhatsappConnectionByMerchantId(input.merchantId);
      
      if (!connection) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // استدعاء Green API للحصول على QR Code
      const response = await fetch(
        `https://api.green-api.com/waInstance${connection.instanceId}/qr/${connection.apiToken}`,
        { method: 'GET' }
      );

      const data = await response.json();
      
      // حفظ QR Code في قاعدة البيانات
      await updateWhatsappConnection(connection.id, {
        qrCode: data.message,
        status: 'pending'
      });

      return { qrCode: data.message };
    }),
});
```

### Frontend Implementation:
```tsx
// في client/src/pages/merchant/WhatsAppConnect.tsx
import { trpc } from '@/lib/trpc';
import QRCode from 'qrcode.react';

export function WhatsAppConnect() {
  const { data, isLoading } = trpc.whatsapp.getQRCode.useQuery({ 
    merchantId: currentMerchantId 
  });

  return (
    <div>
      {data?.qrCode && (
        <QRCode value={data.qrCode} size={256} />
      )}
    </div>
  );
}
```

---

## 3️⃣ التحقق من حالة الاتصال

### API Endpoint:
```typescript
checkStatus: protectedProcedure
  .input(z.object({ merchantId: z.number() }))
  .query(async ({ input }) => {
    const connection = await getWhatsappConnectionByMerchantId(input.merchantId);
    
    if (!connection) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const response = await fetch(
      `https://api.green-api.com/waInstance${connection.instanceId}/getStateInstance/${connection.apiToken}`
    );

    const data = await response.json();
    
    // تحديث حالة الاتصال
    const status = data.stateInstance === 'authorized' ? 'connected' : 'disconnected';
    
    await updateWhatsappConnection(connection.id, {
      status,
      lastConnected: status === 'connected' ? new Date() : connection.lastConnected
    });

    return { status, phoneNumber: data.phoneNumber };
  }),
```

---

## 4️⃣ استقبال الرسائل (Webhook)

### إعداد Webhook:
```typescript
// في server/_core/index.ts
app.post('/api/webhook/whatsapp/:merchantId', async (req, res) => {
  const { merchantId } = req.params;
  const webhookData = req.body;

  // معالجة الرسالة الواردة
  if (webhookData.typeWebhook === 'incomingMessageReceived') {
    const messageData = webhookData.messageData;
    
    // البحث عن المحادثة أو إنشاء واحدة جديدة
    let conversation = await getConversationByMerchantAndPhone(
      Number(merchantId),
      messageData.chatId
    );

    if (!conversation) {
      conversation = await createConversation({
        merchantId: Number(merchantId),
        customerPhone: messageData.chatId,
        customerName: messageData.senderName,
        status: 'active'
      });
    }

    // حفظ الرسالة
    const message = await createMessage({
      conversationId: conversation.id,
      direction: 'incoming',
      messageType: messageData.typeMessage === 'textMessage' ? 'text' : 'voice',
      content: messageData.textMessageData?.textMessage || '',
      voiceUrl: messageData.audioMessageData?.downloadUrl,
      isProcessed: false
    });

    // معالجة الرسالة بواسطة AI (سيتم شرحه في دليل OpenAI)
    await processMessageWithAI(message.id, conversation.id, Number(merchantId));
  }

  res.json({ success: true });
});
```

### تفعيل Webhook في Green API:
```typescript
// استدعاء مرة واحدة عند ربط الواتساب
async function setupWebhook(instanceId: string, apiToken: string, merchantId: number) {
  const webhookUrl = `https://your-domain.com/api/webhook/whatsapp/${merchantId}`;
  
  await fetch(
    `https://api.green-api.com/waInstance${instanceId}/setSettings/${apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl,
        webhookUrlToken: '',
        incomingWebhook: 'yes',
        outgoingWebhook: 'yes'
      })
    }
  );
}
```

---

## 5️⃣ إرسال الرسائل النصية

### API Endpoint:
```typescript
sendMessage: protectedProcedure
  .input(z.object({
    merchantId: z.number(),
    phoneNumber: z.string(),
    message: z.string()
  }))
  .mutation(async ({ input }) => {
    const connection = await getWhatsappConnectionByMerchantId(input.merchantId);
    
    if (!connection || connection.status !== 'connected') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'WhatsApp not connected' });
    }

    // إرسال الرسالة عبر Green API
    const response = await fetch(
      `https://api.green-api.com/waInstance${connection.instanceId}/sendMessage/${connection.apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: input.phoneNumber,
          message: input.message
        })
      }
    );

    const data = await response.json();
    
    return { success: true, messageId: data.idMessage };
  }),
```

---

## 6️⃣ إرسال الصور

### API Endpoint:
```typescript
sendImage: protectedProcedure
  .input(z.object({
    merchantId: z.number(),
    phoneNumber: z.string(),
    imageUrl: z.string(),
    caption: z.string().optional()
  }))
  .mutation(async ({ input }) => {
    const connection = await getWhatsappConnectionByMerchantId(input.merchantId);
    
    if (!connection || connection.status !== 'connected') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED' });
    }

    const response = await fetch(
      `https://api.green-api.com/waInstance${connection.instanceId}/sendFileByUrl/${connection.apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: input.phoneNumber,
          urlFile: input.imageUrl,
          fileName: 'product.jpg',
          caption: input.caption || ''
        })
      }
    );

    const data = await response.json();
    
    return { success: true, messageId: data.idMessage };
  }),
```

---

## 7️⃣ التأخير الزمني العشوائي (محاكاة البشر)

### Implementation:
```typescript
// دالة مساعدة للتأخير
function randomDelay(min: number = 3000, max: number = 6000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// استخدامها قبل إرسال الرسالة
async function sendMessageWithDelay(
  instanceId: string,
  apiToken: string,
  phoneNumber: string,
  message: string
) {
  // إرسال حالة "يكتب..."
  await fetch(
    `https://api.green-api.com/waInstance${instanceId}/sendTyping/${apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: phoneNumber })
    }
  );

  // انتظار عشوائي
  await randomDelay(3000, 6000);

  // إرسال الرسالة
  await fetch(
    `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: phoneNumber,
        message
      })
    }
  );
}
```

---

## 8️⃣ إعادة الاتصال التلقائي

### Implementation:
```typescript
// في server/_core/whatsappMonitor.ts
import { getAllMerchants, getWhatsappConnectionByMerchantId, updateWhatsappConnection } from '../db';

export async function monitorWhatsAppConnections() {
  const merchants = await getAllMerchants();

  for (const merchant of merchants) {
    const connection = await getWhatsappConnectionByMerchantId(merchant.id);
    
    if (!connection) continue;

    try {
      const response = await fetch(
        `https://api.green-api.com/waInstance${connection.instanceId}/getStateInstance/${connection.apiToken}`
      );

      const data = await response.json();
      
      if (data.stateInstance === 'authorized') {
        if (connection.status !== 'connected') {
          await updateWhatsappConnection(connection.id, {
            status: 'connected',
            lastConnected: new Date(),
            errorMessage: null
          });
        }
      } else {
        await updateWhatsappConnection(connection.id, {
          status: 'disconnected',
          errorMessage: 'Connection lost, please reconnect'
        });
      }
    } catch (error) {
      await updateWhatsappConnection(connection.id, {
        status: 'error',
        errorMessage: error.message
      });
    }
  }
}

// تشغيل المراقبة كل 5 دقائق
setInterval(monitorWhatsAppConnections, 5 * 60 * 1000);
```

---

## 9️⃣ معالجة الأخطاء

### Error Handling:
```typescript
async function safeGreenAPICall(url: string, options: RequestInit) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Green API Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Green API] Error:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to communicate with WhatsApp'
    });
  }
}
```

---

## 🔟 الخلاصة

### الخطوات الأساسية:
1. ✅ الحصول على Green API credentials
2. ✅ إنشاء سجل في جدول `whatsappConnections`
3. ✅ عرض QR Code للتاجر
4. ✅ مراقبة حالة الاتصال
5. ✅ إعداد Webhook لاستقبال الرسائل
6. ✅ إرسال الرسائل والصور
7. ✅ إضافة تأخير عشوائي
8. ✅ مراقبة وإعادة الاتصال التلقائي

### Resources:
- [Green API Documentation](https://green-api.com/docs/)
- [Green API Postman Collection](https://green-api.com/docs/postman/)
