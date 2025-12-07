# دليل تشغيل منصة ساري في الإنتاج

## نظرة عامة

هذا الدليل يوضح كيفية تشغيل منصة **ساري** في بيئة الإنتاج الفعلية مع نظام الدفع الإلكتروني عبر Tap Payments.

---

## ✅ الحالة الحالية

النظام **جاهز للإنتاج الفعلي** مع:

- ✅ مفاتيح Tap Payments الإنتاجية مُفعّلة (من ENV)
- ✅ نظام Webhook مع التحقق من التوقيع (HMAC SHA256)
- ✅ معالجة أخطاء محسّنة مع logging شامل
- ✅ تحديث تلقائي للاشتراكات بعد الدفع
- ✅ إنشاء فواتير PDF وإرسالها عبر البريد
- ✅ إشعارات تلقائية للمدير

---

## 🔑 المفاتيح المطلوبة

### 1. Tap Payments (مُفعّل حالياً)

```env
TAP_SECRET_KEY=sk_live_xxxxx          # مفتاح سري (Backend)
VITE_TAP_PUBLIC_KEY=pk_live_xxxxx    # مفتاح عام (Frontend)
```

**الحصول على المفاتيح:**
1. سجل دخول إلى [Tap Dashboard](https://dashboard.tap.company)
2. اذهب إلى Settings → API Keys
3. انسخ Live Keys (وليس Test Keys)

### 2. OpenAI API (للرد الآلي)

```env
OPENAI_API_KEY=sk-xxxxx
```

**الحصول على المفتاح:**
1. سجل دخول إلى [OpenAI Platform](https://platform.openai.com)
2. اذهب إلى API Keys
3. أنشئ مفتاح جديد

### 3. Green API (للواتساب)

```env
GREEN_API_INSTANCE_ID=xxxxx
GREEN_API_TOKEN=xxxxx
```

**الحصول على المفاتيح:**
1. سجل دخول إلى [Green API](https://green-api.com)
2. أنشئ Instance جديد
3. انسخ Instance ID و Token

### 4. البريد الإلكتروني (لإرسال الفواتير)

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@sari.sa
```

**ملاحظة:** إذا كنت تستخدم Gmail، استخدم App Password وليس كلمة المرور العادية.

---

## 🔗 تسجيل Webhook في Tap

**خطوات التسجيل:**

1. **احصل على Webhook URL:**
   ```
   https://your-domain.com/api/webhooks/tap
   ```
   
   أو في بيئة التطوير:
   ```
   https://3000-i2p6cd0zb6qb4wcyphorn-356c60d6.manus-asia.computer/api/webhooks/tap
   ```

2. **سجل في Tap Dashboard:**
   - اذهب إلى [Tap Dashboard](https://dashboard.tap.company)
   - Settings → Webhooks
   - أضف Webhook جديد
   - الصق URL أعلاه
   - فعّل الأحداث التالية:
     * `charge.succeeded` - عند نجاح الدفع
     * `charge.failed` - عند فشل الدفع
     * `charge.refunded` - عند استرجاع المبلغ

3. **احفظ Webhook Secret:**
   - بعد الحفظ، ستحصل على Webhook Secret
   - أضفه إلى ENV:
   ```env
   TAP_WEBHOOK_SECRET=whsec_xxxxx
   ```

---

## 🧪 اختبار النظام

### 1. اختبار تسجيل الدخول

**حسابات تجريبية:**
```
Admin:
- البريد: admin@sari.sa
- كلمة المرور: admin123

Merchant:
- البريد: merchant@sari.sa
- كلمة المرور: merchant123
```

### 2. اختبار الدفع

**خطوات الاختبار:**

1. سجل دخول كتاجر
2. اذهب إلى "الاشتراكات"
3. اختر باقة واضغط "ترقية"
4. أكمل عملية الدفع عبر Tap

**بطاقات اختبار Tap:**
```
رقم البطاقة: 4111 1111 1111 1111
تاريخ الانتهاء: أي تاريخ مستقبلي
CVV: أي 3 أرقام
```

**ملاحظة:** في الإنتاج، استخدم بطاقات حقيقية فقط.

### 3. اختبار Webhook

**التحقق من استقبال Webhook:**

1. بعد الدفع، تحقق من logs:
   ```bash
   # في terminal السيرفر
   [Tap Webhook] Received event: charge.succeeded
   [Tap Webhook] Signature verified successfully
   [Tap Webhook] Payment verified for merchant ID: X
   ```

2. تحقق من قاعدة البيانات:
   - جدول `payments`: يجب أن يحتوي على سجل جديد بحالة `completed`
   - جدول `subscriptions`: يجب أن يتم تحديث الاشتراك
   - جدول `invoices`: يجب أن يتم إنشاء فاتورة جديدة

3. تحقق من البريد الإلكتروني:
   - يجب أن يصل للتاجر بريد يحتوي على الفاتورة PDF

---

## 📊 مراقبة النظام

### Logs مهمة

**في server/payment/tap.ts:**
```
[Tap Payment] Creating charge for merchant X, amount: Y SAR
[Tap Payment] Charge created successfully: chr_xxxxx
[Tap Payment] Request completed in Xms
```

**في server/webhooks/tap.ts:**
```
[Tap Webhook] Received event: charge.succeeded
[Tap Webhook] Signature verified successfully
[Tap Webhook] Payment verified for merchant ID: X
[Tap Webhook] Subscription updated successfully
[Tap Webhook] Invoice created and sent
```

### معالجة الأخطاء

**أخطاء شائعة:**

1. **Webhook Signature Invalid:**
   - تأكد من `TAP_WEBHOOK_SECRET` صحيح
   - تأكد من استخدام `req.rawBody` في التحقق

2. **Charge Creation Failed:**
   - تأكد من `TAP_SECRET_KEY` صحيح
   - تأكد من أن المبلغ أكبر من 0
   - تأكد من أن العملة SAR

3. **Email Not Sent:**
   - تأكد من إعدادات البريد الإلكتروني صحيحة
   - تأكد من App Password إذا كنت تستخدم Gmail

---

## 🔒 الأمان

### التحقق من التوقيع

النظام يتحقق تلقائياً من توقيع Webhook باستخدام HMAC SHA256:

```typescript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');

if (signature !== receivedSignature) {
  throw new Error('Invalid signature');
}
```

### تشفير كلمات المرور

جميع كلمات المرور مشفرة باستخدام bcrypt:

```typescript
const hashedPassword = await bcrypt.hash(password, 10);
```

---

## 📈 الباقات الحالية

| الباقة | السعر | الرسائل النصية | الرسائل الصوتية |
|--------|-------|----------------|-----------------|
| المبتدئ | 99 ريال | 1,000 | غير محدود |
| الاحترافي | 299 ريال | 5,000 | غير محدود |
| المؤسسات | 999 ريال | 20,000 | غير محدود |

**ملاحظة:** الأسعار شاملة ضريبة القيمة المضافة (15%)

---

## 🚀 النشر

### على Replit

1. تأكد من جميع ENV variables مضافة
2. اضغط "Run" لتشغيل السيرفر
3. سجل Webhook URL في Tap Dashboard

### على خادم خاص

1. انسخ المشروع:
   ```bash
   git clone <repository-url>
   cd sari
   ```

2. ثبت Dependencies:
   ```bash
   pnpm install
   ```

3. أضف ENV variables في `.env`

4. شغل Migration:
   ```bash
   pnpm db:push
   ```

5. شغل السيرفر:
   ```bash
   pnpm start
   ```

---

## 📞 الدعم

في حالة وجود مشاكل:

1. تحقق من Logs في terminal
2. تحقق من قاعدة البيانات
3. تحقق من Tap Dashboard → Webhooks → Logs
4. تحقق من البريد الإلكتروني للفواتير

---

## ✅ Checklist قبل الإطلاق

- [ ] جميع ENV variables مضافة
- [ ] Tap Webhook مسجل في Dashboard
- [ ] اختبار دفع تجريبي ناجح
- [ ] Webhook يعمل بشكل صحيح
- [ ] الفواتير تُرسل عبر البريد
- [ ] الإشعارات تعمل للمدير
- [ ] جميع الصفحات تعمل بدون أخطاء
- [ ] النظام يعمل على HTTPS

---

## 🎉 الإطلاق

بعد إكمال جميع الخطوات أعلاه، النظام جاهز للإطلاق الفعلي!

**روابط مهمة:**
- Landing Page: `https://your-domain.com`
- Login: `https://your-domain.com/login`
- Signup: `https://your-domain.com/signup`
- Admin Dashboard: `https://your-domain.com/admin/dashboard`
- Merchant Dashboard: `https://your-domain.com/merchant/dashboard`

---

**آخر تحديث:** ديسمبر 2025
