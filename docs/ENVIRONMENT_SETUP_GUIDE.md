# 🔐 دليل إعداد المتغيرات البيئية لـ Sari

## 📋 نظرة عامة

هذا الدليل يشرح كيفية الحصول على جميع المفاتيح والمتغيرات البيئية المطلوبة لتشغيل مشروع Sari على Digital Ocean.

---

## ✅ المتغيرات المطلوبة (إجبارية)

### 1. قاعدة البيانات - DATABASE_URL

**الحصول على المفتاح:**

#### الخيار 1: Digital Ocean Managed Database (موصى به)
1. اذهب إلى [Digital Ocean Databases](https://cloud.digitalocean.com/databases)
2. اضغط **Create Database**
3. اختر **MySQL** أو **PostgreSQL**
4. اختر الخطة المناسبة (Basic $15/month)
5. بعد الإنشاء، اذهب إلى **Connection Details**
6. انسخ **Connection String**

**مثال:**
```
DATABASE_URL=mysql://doadmin:password@db-mysql-nyc3-12345.ondigitalocean.com:25060/defaultdb?ssl-mode=REQUIRED
```

#### الخيار 2: TiDB Cloud (مجاني)
1. اذهب إلى [TiDB Cloud](https://tidbcloud.com/)
2. سجل حساب جديد
3. أنشئ Cluster جديد (Free Tier)
4. احصل على Connection String من Dashboard

---

### 2. JWT Secret - JWT_SECRET

**تم توليده تلقائياً في ملف `.env.production`**

⚠️ **مهم جداً:** لا تشارك هذا المفتاح مع أحد!

إذا أردت توليد مفتاح جديد:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

### 3. Green API (WhatsApp) - GREEN_API_INSTANCE_ID & GREEN_API_TOKEN

**الحصول على المفتاح:**

1. اذهب إلى [Green API](https://green-api.com/)
2. سجل حساب جديد
3. اذهب إلى **Console** → **Create Instance**
4. اختر خطة مناسبة (Developer $10/month)
5. بعد الإنشاء، ستجد:
   - **Instance ID** (مثل: 7105411382)
   - **API Token** (مثل: abc123def456...)

**إعداد Webhook:**
1. في لوحة Green API، اذهب إلى **Settings**
2. في **Webhook URL**، أدخل:
   ```
   https://sary.live/api/webhooks/greenapi
   ```
3. فعّل **Incoming Messages** و **Outgoing Messages**

**مثال:**
```
GREEN_API_INSTANCE_ID=7105411382
GREEN_API_TOKEN=abc123def456ghi789jkl012mno345
```

---

### 4. OpenAI API - OPENAI_API_KEY

**الحصول على المفتاح:**

1. اذهب إلى [OpenAI Platform](https://platform.openai.com/)
2. سجل دخول أو أنشئ حساب
3. اذهب إلى [API Keys](https://platform.openai.com/api-keys)
4. اضغط **Create new secret key**
5. أعط المفتاح اسم مثل "Sari Production"
6. انسخ المفتاح فوراً (لن يظهر مرة أخرى!)

**التكلفة:**
- $5 رصيد مجاني للحسابات الجديدة
- GPT-4o: ~$0.005 لكل 1000 رسالة
- Whisper: ~$0.006 لكل دقيقة صوت

**مثال:**
```
OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678stu901
```

---

### 5. Tap Payments - TAP_SECRET_KEY & TAP_PUBLIC_KEY

**الحصول على المفتاح:**

1. اذهب إلى [Tap Payments](https://tap.company/)
2. سجل حساب تاجر
3. أكمل التحقق من الهوية (KYC)
4. اذهب إلى **Developers** → **API Keys**
5. ستجد:
   - **Test Secret Key** (للتجربة)
   - **Live Secret Key** (للإنتاج)
   - **Test Public Key**
   - **Live Public Key**

**للتجربة (Test Mode):**
```
TAP_SECRET_KEY=sk_test_abc123def456ghi789
TAP_PUBLIC_KEY=pk_test_xyz789uvw456rst123
```

**للإنتاج (Live Mode):**
```
TAP_SECRET_KEY=sk_live_abc123def456ghi789
TAP_PUBLIC_KEY=pk_live_xyz789uvw456rst123
```

⚠️ **مهم:** استخدم Test Keys أولاً للتجربة!

---

### 6. SMTP2GO (البريد الإلكتروني) - SMTP2GO_API_KEY

**الحصول على المفتاح:**

1. اذهب إلى [SMTP2GO](https://www.smtp2go.com/)
2. سجل حساب جديد (1,000 رسالة مجاناً شهرياً)
3. اذهب إلى **Settings** → **API Keys**
4. اضغط **Add API Key**
5. أعط المفتاح اسم مثل "Sari Production"
6. انسخ المفتاح

**مثال:**
```
SMTP2GO_API_KEY=api-abc123def456ghi789jkl012
SMTP_FROM=noreply@sary.live
```

⚠️ **مهم:** تأكد من التحقق من الدومين (Domain Verification) في SMTP2GO

---

## 🔄 المتغيرات الاختيارية (للميزات المتقدمة)

### 7. Google OAuth (تسجيل دخول بجوجل)

**الحصول على المفتاح:**

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/)
2. أنشئ مشروع جديد أو اختر مشروع موجود
3. فعّل **Google+ API**
4. اذهب إلى **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. اختر **Web application**
6. أضف **Authorized redirect URIs**:
   ```
   https://sary.live/api/auth/google/callback
   ```
7. انسخ **Client ID** و **Client Secret**

**مثال:**
```
GOOGLE_CLIENT_ID=123456789012-abc123def456.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456ghi789
```

---

### 8. Google Calendar API (حجز المواعيد)

**الحصول على المفتاح:**

1. في نفس مشروع Google Cloud
2. فعّل **Google Calendar API**
3. أنشئ **OAuth 2.0 Client ID** جديد
4. أضف **Authorized redirect URIs**:
   ```
   https://sary.live/api/auth/google-calendar/callback
   ```

**مثال:**
```
GOOGLE_CALENDAR_CLIENT_ID=123456789012-calendar.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-calendar123
```

---

### 9. Google Sheets API (التقارير التلقائية)

**الحصول على المفتاح:**

1. في نفس مشروع Google Cloud
2. فعّل **Google Sheets API**
3. أنشئ **OAuth 2.0 Client ID** جديد
4. أضف **Authorized redirect URIs**:
   ```
   https://sary.live/api/auth/google-sheets/callback
   ```

**مثال:**
```
GOOGLE_SHEETS_CLIENT_ID=123456789012-sheets.apps.googleusercontent.com
GOOGLE_SHEETS_CLIENT_SECRET=GOCSPX-sheets123
```

---

## 📝 ملف .env.production النهائي

بعد الحصول على جميع المفاتيح، يجب أن يبدو ملفك هكذا:

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

## 🚀 خطوات النشر على Digital Ocean

### 1. إعداد Droplet

```bash
# SSH إلى الخادم
ssh root@your-server-ip

# تثبيت Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# تثبيت pnpm
npm install -g pnpm

# تثبيت PM2
npm install -g pm2
```

### 2. رفع المشروع

```bash
# استنساخ المشروع
git clone https://github.com/your-username/sari.git
cd sari

# نسخ ملف البيئة
cp .env.production .env

# تثبيت الحزم
pnpm install

# تطبيق Migrations
pnpm db:push

# بناء المشروع
pnpm build

# تشغيل المشروع
pm2 start ecosystem.config.cjs
pm2 save
```

### 3. إعداد Nginx

```bash
# تثبيت Nginx
apt-get install -y nginx

# إنشاء ملف التكوين
nano /etc/nginx/sites-available/sari
```

**محتوى الملف:**
```nginx
server {
    listen 80;
    server_name sary.live www.sary.live;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# تفعيل الموقع
ln -s /etc/nginx/sites-available/sari /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# تثبيت SSL (Let's Encrypt)
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d sary.live -d www.sary.live
```

---

## 🔍 التحقق من الإعداد

### اختبار قاعدة البيانات
```bash
pnpm db:push
```

### اختبار OpenAI
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### اختبار Green API
```bash
curl "https://api.green-api.com/waInstance$GREEN_API_INSTANCE_ID/getStateInstance/$GREEN_API_TOKEN"
```

### اختبار Tap Payments
```bash
curl https://api.tap.company/v2/charges \
  -H "Authorization: Bearer $TAP_SECRET_KEY" \
  -H "Content-Type: application/json"
```

---

## 💰 ملخص التكاليف الشهرية

| الخدمة | التكلفة | ملاحظات |
|--------|---------|---------|
| Digital Ocean Droplet | $12-24 | حسب الحجم |
| Digital Ocean Database | $15 | Basic Plan |
| Green API | $10 | Developer Plan |
| OpenAI API | $5-50 | حسب الاستخدام |
| Tap Payments | مجاني | عمولة 2.5% على المعاملات |
| SMTP2GO | مجاني | حتى 1000 رسالة/شهر |
| **الإجمالي** | **$42-99** | + عمولات المعاملات |

---

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع ملف `docs/DEPLOYMENT_FORGE.md`
2. تحقق من السجلات: `pm2 logs`
3. تحقق من حالة الخدمات: `pm2 status`

---

## ⚠️ تحذيرات أمنية

1. ✅ **لا ترفع** ملف `.env` على GitHub
2. ✅ **احتفظ** بنسخة احتياطية آمنة من جميع المفاتيح
3. ✅ **غيّر** JWT_SECRET بعد أي اختراق محتمل
4. ✅ **استخدم** Test Keys أولاً قبل Live Keys
5. ✅ **فعّل** Firewall على Digital Ocean

---

تم إعداد هذا الدليل بواسطة فريق Sari 🚀
