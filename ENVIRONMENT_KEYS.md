# 🔑 ملخص سريع: المفاتيح المطلوبة للنشر

## ✅ المفاتيح الإجبارية (يجب الحصول عليها)

### 1. قاعدة البيانات
```bash
DATABASE_URL=mysql://user:pass@host:port/database
```
**احصل عليه من:**
- [Digital Ocean Databases](https://cloud.digitalocean.com/databases) ($15/شهر)
- أو [TiDB Cloud](https://tidbcloud.com/) (مجاني)

---

### 2. JWT Secret (تم توليده تلقائياً)
```bash
JWT_SECRET=bf89fb8befa0b2ccb14d46582fe653c372e1db9ef52bebb961d93db7f8c3bd738000b36bd4d572405096dd1e47d3f9bc646ed090407e82a271e073699d99e88e
```
✅ **جاهز للاستخدام** - موجود في `.env.production`

---

### 3. Green API (WhatsApp)
```bash
GREEN_API_INSTANCE_ID=7105411382
GREEN_API_TOKEN=abc123def456...
```
**احصل عليه من:** [Green API](https://green-api.com/) ($10/شهر)

**خطوات:**
1. سجل حساب
2. أنشئ Instance جديد
3. انسخ Instance ID و API Token
4. في Settings → Webhook URL: `https://sary.live/api/webhooks/greenapi`

---

### 4. OpenAI API
```bash
OPENAI_API_KEY=sk-proj-abc123def456...
```
**احصل عليه من:** [OpenAI Platform](https://platform.openai.com/api-keys)

**خطوات:**
1. سجل دخول
2. اذهب إلى API Keys
3. اضغط Create new secret key
4. انسخ المفتاح فوراً

**التكلفة:** $5 مجاناً + ~$0.005 لكل 1000 رسالة

---

### 5. Tap Payments
```bash
TAP_SECRET_KEY=sk_test_abc123...
TAP_PUBLIC_KEY=pk_test_xyz789...
```
**احصل عليه من:** [Tap Payments](https://tap.company/)

**خطوات:**
1. سجل حساب تاجر
2. أكمل KYC
3. اذهب إلى Developers → API Keys
4. استخدم Test Keys أولاً للتجربة

---

### 6. SMTP2GO (البريد الإلكتروني)
```bash
SMTP2GO_API_KEY=api-abc123...
SMTP_FROM=noreply@sary.live
```
**احصل عليه من:** [SMTP2GO](https://www.smtp2go.com/) (1000 رسالة مجاناً)

**خطوات:**
1. سجل حساب
2. اذهب إلى Settings → API Keys
3. اضغط Add API Key
4. تحقق من الدومين (Domain Verification)

---

## 🔄 المفاتيح الاختيارية (للميزات المتقدمة)

### Google OAuth (تسجيل دخول بجوجل)
```bash
GOOGLE_CLIENT_ID=123456...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...
```
**احصل عليه من:** [Google Cloud Console](https://console.cloud.google.com/)

---

### Google Calendar API (حجز المواعيد)
```bash
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...
```

---

### Google Sheets API (التقارير)
```bash
GOOGLE_SHEETS_CLIENT_ID=...
GOOGLE_SHEETS_CLIENT_SECRET=...
```

---

## 📝 ملف .env.production النهائي

بعد الحصول على جميع المفاتيح، ضعها في `/var/www/sari/.env`:

```bash
# قاعدة البيانات
DATABASE_URL=mysql://doadmin:PASS@db-mysql-nyc3-12345.ondigitalocean.com:25060/sari

# الأمان
JWT_SECRET=bf89fb8befa0b2ccb14d46582fe653c372e1db9ef52bebb961d93db7f8c3bd738000b36bd4d572405096dd1e47d3f9bc646ed090407e82a271e073699d99e88e

# التطبيق
NODE_ENV=production
PORT=3000
VITE_APP_TITLE=Sari - AI Sales Agent
VITE_APP_LOGO=/sari-logo.png

# Green API
GREEN_API_INSTANCE_ID=7105411382
GREEN_API_TOKEN=abc123def456ghi789

# OpenAI
OPENAI_API_KEY=sk-proj-abc123def456

# Tap Payments
TAP_SECRET_KEY=sk_live_abc123def456
TAP_PUBLIC_KEY=pk_live_xyz789uvw456

# SMTP2GO
SMTP2GO_API_KEY=api-abc123def456
SMTP_FROM=noreply@sary.live

# معلومات المالك
OWNER_NAME=Your Name
OWNER_EMAIL=your-email@example.com

# URLs
VITE_APP_URL=https://sary.live
API_URL=https://sary.live/api
```

---

## 🚀 خطوات النشر السريعة

```bash
# 1. SSH إلى الخادم
ssh root@your-droplet-ip

# 2. استنساخ المشروع
cd /var/www
git clone https://github.com/your-username/sari.git
cd sari

# 3. نسخ وتحرير ملف البيئة
cp .env.production .env
nano .env  # أدخل جميع المفاتيح

# 4. تثبيت وبناء
pnpm install
pnpm db:push
pnpm build

# 5. تشغيل
pm2 start ecosystem.config.cjs
pm2 save
```

---

## 📚 للمزيد من التفاصيل

- **دليل كامل للمفاتيح:** `docs/ENVIRONMENT_SETUP_GUIDE.md`
- **دليل النشر الكامل:** `docs/DIGITAL_OCEAN_DEPLOYMENT.md`

---

## 💰 التكاليف الشهرية

| الخدمة | التكلفة |
|--------|---------|
| Digital Ocean (Droplet + DB) | $27 |
| Green API | $10 |
| OpenAI API | $5-50 |
| Tap Payments | مجاني + 2.5% عمولة |
| SMTP2GO | مجاني |
| **الإجمالي** | **$42-87** |

---

تم إعداده بواسطة فريق Sari 🚀
