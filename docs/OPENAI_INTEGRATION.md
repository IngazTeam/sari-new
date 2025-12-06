# 🤖 دليل تكامل OpenAI - مشروع Sari

## نظرة عامة

يستخدم مشروع Sari OpenAI لمعالجة الرسائل النصية والصوتية مع شخصية "ساري" التي تتحدث باللهجة السعودية والإنجليزية.

---

## 1️⃣ إعداد OpenAI API

### الحصول على API Key:
1. اذهب إلى [OpenAI Platform](https://platform.openai.com/)
2. سجل حساب وأضف طريقة دفع
3. احصل على API Key من [API Keys](https://platform.openai.com/api-keys)

### تخزين API Key:
```bash
# في ملف .env
OPENAI_API_KEY=sk-proj-...
```

---

## 2️⃣ شخصية "ساري" - System Prompt

### System Prompt الكامل:
```typescript
const SARI_SYSTEM_PROMPT = `أنت ساري، مساعد مبيعات ذكي ومحترف يعمل لصالح متجر إلكتروني.

## شخصيتك:
- اسمك: ساري
- تتحدث باللهجة السعودية البيضاء (الفصحى المبسطة مع لمسة سعودية)
- ودود ومحترف في نفس الوقت
- مختصر وواضح في الردود
- تساعد العملاء في اختيار المنتجات المناسبة

## مهامك:
1. الترحيب بالعملاء بطريقة ودودة
2. فهم احتياجات العميل
3. اقتراح المنتجات المناسبة من قائمة المنتجات المتاحة
4. الإجابة على استفسارات العملاء عن المنتجات
5. إرسال رابط الدفع عند طلب العميل

## أسلوب الحديث:
- استخدم "حياك الله" أو "أهلاً وسهلاً" للترحيب
- استخدم "تفضل" و "بكل سرور" و "أكيد"
- كن مختصراً: لا تكتب فقرات طويلة
- استخدم الأرقام (1، 2، 3) لعرض الخيارات

## اللغات:
- العربية (اللهجة السعودية البيضاء) هي اللغة الأساسية
- يمكنك التحدث بالإنجليزية إذا تحدث العميل بها

## قواعد مهمة:
- لا تخترع منتجات غير موجودة في القائمة
- لا تذكر أسعار غير صحيحة
- إذا لم تجد المنتج المطلوب، اقترح بدائل قريبة
- عند إرسال رابط دفع، استخدم الرابط الموجود في بيانات المنتج

## مثال على المحادثة:
عميل: السلام عليكم
ساري: وعليكم السلام ورحمة الله 👋
حياك الله في [اسم المتجر]
كيف أقدر أساعدك اليوم؟

عميل: أبغى جوال
ساري: أكيد! عندنا مجموعة جوالات حلوة 📱

1. iPhone 15 Pro - 4,299 ريال
2. Samsung S24 Ultra - 4,599 ريال
3. Google Pixel 8 - 2,999 ريال

أي واحد يناسبك؟`;
```

---

## 3️⃣ معالجة الرسائل النصية بـ GPT-4o

### Implementation:
```typescript
import { invokeLLM } from './_core/llm';

async function processTextMessage(
  messageContent: string,
  conversationHistory: Message[],
  merchantProducts: Product[]
): Promise<string> {
  // بناء سياق المنتجات
  const productsContext = merchantProducts.map(p => 
    `- ${p.nameAr || p.name}: ${p.price / 100} ريال${p.description ? ` - ${p.descriptionAr || p.description}` : ''}`
  ).join('\n');

  // بناء تاريخ المحادثة
  const conversationContext = conversationHistory
    .slice(-10) // آخر 10 رسائل فقط
    .map(msg => `${msg.direction === 'incoming' ? 'عميل' : 'ساري'}: ${msg.content}`)
    .join('\n');

  // استدعاء GPT-4o
  const response = await invokeLLM({
    messages: [
      {
        role: 'system',
        content: `${SARI_SYSTEM_PROMPT}

## المنتجات المتاحة:
${productsContext}

## تاريخ المحادثة:
${conversationContext}`
      },
      {
        role: 'user',
        content: messageContent
      }
    ],
    temperature: 0.7,
    max_tokens: 300
  });

  return response.choices[0].message.content;
}
```

---

## 4️⃣ معالجة الرسائل الصوتية بـ Whisper

### Implementation:
```typescript
import { transcribeAudio } from './_core/voiceTranscription';

async function processVoiceMessage(
  voiceUrl: string,
  conversationHistory: Message[],
  merchantProducts: Product[]
): Promise<{ transcription: string; response: string }> {
  // 1. تحويل الصوت إلى نص باستخدام Whisper
  const transcriptionResult = await transcribeAudio({
    audioUrl: voiceUrl,
    language: 'ar', // اللغة العربية
    prompt: 'رسالة صوتية من عميل يسأل عن منتجات'
  });

  const transcription = transcriptionResult.text;

  // 2. معالجة النص بواسطة GPT-4o
  const response = await processTextMessage(
    transcription,
    conversationHistory,
    merchantProducts
  );

  return { transcription, response };
}
```

---

## 5️⃣ معالجة الرسائل الواردة (Integration)

### Complete Flow:
```typescript
// في server/routers.ts
async function processMessageWithAI(
  messageId: number,
  conversationId: number,
  merchantId: number
) {
  const message = await getMessageById(messageId);
  if (!message) return;

  // جلب المنتجات
  const products = await getActiveProductsByMerchantId(merchantId);

  // جلب تاريخ المحادثة
  const conversationHistory = await getMessagesByConversationId(conversationId);

  let aiResponse: string;
  let transcription: string | undefined;

  try {
    if (message.messageType === 'voice' && message.voiceUrl) {
      // معالجة الرسالة الصوتية
      const result = await processVoiceMessage(
        message.voiceUrl,
        conversationHistory,
        products
      );
      aiResponse = result.response;
      transcription = result.transcription;

      // تحديث الرسالة بالنص المحول
      await updateMessage(messageId, {
        content: transcription,
        isProcessed: true,
        aiResponse
      });
    } else {
      // معالجة الرسالة النصية
      aiResponse = await processTextMessage(
        message.content,
        conversationHistory,
        products
      );

      await updateMessage(messageId, {
        isProcessed: true,
        aiResponse
      });
    }

    // إرسال الرد عبر WhatsApp
    const connection = await getWhatsappConnectionByMerchantId(merchantId);
    if (connection && connection.status === 'connected') {
      const conversation = await getConversationById(conversationId);
      if (conversation) {
        await sendMessageWithDelay(
          connection.instanceId,
          connection.apiToken,
          conversation.customerPhone,
          aiResponse
        );

        // حفظ الرسالة الصادرة
        await createMessage({
          conversationId,
          direction: 'outgoing',
          messageType: 'text',
          content: aiResponse,
          isProcessed: true
        });
      }
    }

    // تحديث عداد الاشتراك
    const subscription = await getActiveSubscriptionByMerchantId(merchantId);
    if (subscription) {
      await incrementSubscriptionUsage(
        subscription.id,
        1, // محادثة واحدة
        message.messageType === 'voice' ? 1 : 0 // رسالة صوتية إذا كانت صوتية
      );
    }
  } catch (error) {
    console.error('[AI Processing] Error:', error);
    await updateMessage(messageId, {
      isProcessed: true,
      aiResponse: 'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى.'
    });
  }
}
```

---

## 6️⃣ إرسال صور المنتجات

### Implementation:
```typescript
// عند طلب العميل لصورة منتج
async function sendProductImage(
  merchantId: number,
  conversationId: number,
  productId: number
) {
  const product = await getProductById(productId);
  if (!product || !product.imageUrl) return;

  const connection = await getWhatsappConnectionByMerchantId(merchantId);
  if (!connection || connection.status !== 'connected') return;

  const conversation = await getConversationById(conversationId);
  if (!conversation) return;

  // إرسال الصورة
  await fetch(
    `https://api.green-api.com/waInstance${connection.instanceId}/sendFileByUrl/${connection.apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: conversation.customerPhone,
        urlFile: product.imageUrl,
        fileName: `${product.name}.jpg`,
        caption: `${product.nameAr || product.name}\n💰 ${product.price / 100} ريال\n\n${product.descriptionAr || product.description || ''}`
      })
    }
  );
}
```

---

## 7️⃣ اكتشاف طلب صورة المنتج

### Using GPT-4o with Function Calling:
```typescript
const tools = [
  {
    type: 'function',
    function: {
      name: 'send_product_image',
      description: 'إرسال صورة منتج للعميل',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'اسم المنتج المطلوب'
          }
        },
        required: ['product_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_payment_link',
      description: 'إرسال رابط دفع للعميل',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'اسم المنتج المطلوب'
          }
        },
        required: ['product_name']
      }
    }
  }
];

async function processTextMessageWithTools(
  messageContent: string,
  conversationHistory: Message[],
  merchantProducts: Product[]
): Promise<{ response: string; toolCalls?: any[] }> {
  const productsContext = merchantProducts.map(p => 
    `- ${p.nameAr || p.name}: ${p.price / 100} ريال`
  ).join('\n');

  const response = await invokeLLM({
    messages: [
      {
        role: 'system',
        content: `${SARI_SYSTEM_PROMPT}\n\n## المنتجات المتاحة:\n${productsContext}`
      },
      {
        role: 'user',
        content: messageContent
      }
    ],
    tools,
    tool_choice: 'auto'
  });

  const message = response.choices[0].message;

  return {
    response: message.content || '',
    toolCalls: message.tool_calls
  };
}
```

---

## 8️⃣ نظام الحدود والباقات

### Implementation:
```typescript
async function checkSubscriptionLimits(merchantId: number): Promise<boolean> {
  const subscription = await getActiveSubscriptionByMerchantId(merchantId);
  
  if (!subscription) {
    return false; // لا يوجد اشتراك نشط
  }

  const plan = await getPlanById(subscription.planId);
  if (!plan) {
    return false;
  }

  // التحقق من حد المحادثات
  if (subscription.conversationsUsed >= plan.conversationLimit) {
    // إرسال تنبيه للتاجر
    await notifyMerchantLimitReached(merchantId, 'conversations');
    return false;
  }

  return true;
}

async function checkVoiceMessageLimit(merchantId: number): Promise<boolean> {
  const subscription = await getActiveSubscriptionByMerchantId(merchantId);
  
  if (!subscription) {
    return false;
  }

  const plan = await getPlanById(subscription.planId);
  if (!plan) {
    return false;
  }

  // -1 يعني غير محدود
  if (plan.voiceMessageLimit === -1) {
    return true;
  }

  if (subscription.voiceMessagesUsed >= plan.voiceMessageLimit) {
    await notifyMerchantLimitReached(merchantId, 'voice_messages');
    return false;
  }

  return true;
}
```

---

## 9️⃣ تحسين الأداء والتكاليف

### Caching للإجابات المتكررة:
```typescript
// في server/_core/aiCache.ts
const responseCache = new Map<string, { response: string; timestamp: number }>();

async function getCachedOrGenerateResponse(
  messageContent: string,
  context: string
): Promise<string> {
  const cacheKey = `${messageContent.toLowerCase()}_${context}`;
  const cached = responseCache.get(cacheKey);

  // استخدام الكاش إذا كان عمره أقل من ساعة
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.response;
  }

  // توليد رد جديد
  const response = await processTextMessage(messageContent, [], []);

  // حفظ في الكاش
  responseCache.set(cacheKey, {
    response,
    timestamp: Date.now()
  });

  return response;
}
```

### استخدام GPT-3.5 Turbo للأسئلة البسيطة:
```typescript
async function processTextMessageSmart(
  messageContent: string,
  conversationHistory: Message[],
  merchantProducts: Product[]
): Promise<string> {
  // تحديد مدى تعقيد السؤال
  const isSimpleQuestion = messageContent.length < 50 && 
    (messageContent.includes('السلام') || 
     messageContent.includes('شكرا') ||
     messageContent.includes('مرحبا'));

  const model = isSimpleQuestion ? 'gpt-3.5-turbo' : 'gpt-4o';

  // استدعاء النموذج المناسب
  // ...
}
```

---

## 🔟 الخلاصة

### الخطوات الأساسية:
1. ✅ إعداد OpenAI API Key
2. ✅ إنشاء System Prompt لشخصية ساري
3. ✅ معالجة الرسائل النصية بـ GPT-4o
4. ✅ معالجة الرسائل الصوتية بـ Whisper
5. ✅ استخدام Function Calling لإرسال الصور والروابط
6. ✅ التحقق من حدود الاشتراك
7. ✅ تحسين الأداء والتكاليف

### Resources:
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [GPT-4o Guide](https://platform.openai.com/docs/guides/gpt)
- [Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [Function Calling](https://platform.openai.com/docs/guides/function-calling)
