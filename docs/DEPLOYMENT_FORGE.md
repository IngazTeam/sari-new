# دليل نشر ساري على Digital Ocean باستخدام Laravel Forge

## المتطلبات الأساسية

- حساب Digital Ocean
- حساب Laravel Forge
- Node.js 18+ و npm
- قاعدة بيانات MySQL/TiDB

---

## الخطوة 1: إعداد قاعدة البيانات

### خيار 1: استخدام Digital Ocean Managed Database

1. افتح Digital Ocean Dashboard
2. اذهب إلى **Databases** → **Create Database Cluster**
3. اختر **MySQL 8**
4. اختر الـ Region الأقرب لك
5. اختر الخطة المناسبة (Basic $15/month كافي للبداية)
6. انتظر حتى يتم إنشاء الـ Database

### الحصول على Connection String:

```
mysql://doadmin:PASSWORD@db-mysql-xxx.ondigitalocean.com:25060/defaultdb?ssl-mode=REQUIRED
```

### خيار 2: استخدام TiDB Cloud (مجاني)

1. سجل في https://tidbcloud.com
2. أنشئ Serverless Cluster
3. احصل على Connection String من Dashboard

---

## الخطوة 2: متغيرات البيئة المطلوبة

أنشئ ملف `.env` في مجلد المشروع على السيرفر وأضف المتغيرات التالية:

```bash
# ========================================
# Application Settings
# ========================================
NODE_ENV=production
PORT=3000

# ========================================
# Database Configuration (مطلوب)
# ========================================
DATABASE_URL=mysql://user:password@host:port/database?ssl={"rejectUnauthorized":true}

# ========================================
# Authentication (مطلوب)
# ========================================
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-random

# ========================================
# OpenAI API (مطلوب للذكاء الاصطناعي)
# ========================================
# احصل على المفتاح من: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-api-key

# ========================================
# Green API - WhatsApp (مطلوب)
# ========================================
# احصل على البيانات من: https://green-api.com
GREEN_API_INSTANCE_ID=your-instance-id
GREEN_API_TOKEN=your-api-token

# ========================================
# Tap Payments (مطلوب للدفع)
# ========================================
# احصل على المفاتيح من: https://dashboard.tap.company
TAP_SECRET_KEY=sk_live_your-tap-secret-key
VITE_TAP_PUBLIC_KEY=pk_live_your-tap-public-key

# ========================================
# SMTP2GO - البريد الإلكتروني (مطلوب)
# ========================================
# احصل على المفتاح من: https://app.smtp2go.com/settings/api_keys
SMTP2GO_API_KEY=api-your-smtp2go-api-key
SMTP_FROM=noreply@your-domain.com
```

### كيفية توليد JWT_SECRET:

```bash
# على Linux/Mac
openssl rand -base64 32

# أو استخدم أي مولد عشوائي
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## الخطوة 3: إعداد Laravel Forge

### 3.1 إنشاء الموقع

1. في Forge، اذهب إلى السيرفر الخاص بك
2. اضغط **New Site**
3. أدخل الدومين: `sari.yourdomain.com`
4. اختر **Static HTML / Nuxt.js / Node.js**
5. اضغط **Add Site**

### 3.2 ربط Repository

1. اذهب إلى الموقع → **Git Repository**
2. اختر **GitHub** وربط الـ Repository
3. اختر Branch: `main`
4. **لا تفعل** Install Composer Dependencies
5. اضغط **Install Repository**

### 3.3 إعداد Environment Variables

1. اذهب إلى **Environment**
2. انسخ جميع المتغيرات من الخطوة 2 أعلاه
3. اضغط **Save**

---

## الخطوة 4: إعداد Build & Deploy

### 4.1 تحديث Deploy Script

اذهب إلى **Deployments** → **Deploy Script** واستبدله بالتالي:

```bash
cd /home/forge/sari.yourdomain.com

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build the application
npm run build

# Run database migrations
npm run db:push

# Restart the application
pm2 restart sari || pm2 start npm --name "sari" -- run start
```

### 4.2 إعداد PM2

اتصل بالسيرفر عبر SSH وشغل:

```bash
# تثبيت PM2 globally
npm install -g pm2

# الدخول لمجلد المشروع
cd /home/forge/sari.yourdomain.com

# تثبيت Dependencies
npm install

# بناء المشروع
npm run build

# تشغيل قاعدة البيانات (أول مرة فقط)
npm run db:push

# تشغيل التطبيق
pm2 start npm --name "sari" -- run start

# حفظ إعدادات PM2
pm2 save

# تفعيل التشغيل التلقائي عند إعادة تشغيل السيرفر
pm2 startup
```

---

## الخطوة 5: إعداد Nginx

### 5.1 تحديث Nginx Configuration

في Forge، اذهب إلى الموقع → **Files** → **Edit Nginx Configuration**

استبدل المحتوى بالتالي:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sari.yourdomain.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sari.yourdomain.com;
    
    ssl_certificate /etc/nginx/ssl/sari.yourdomain.com/server.crt;
    ssl_certificate_key /etc/nginx/ssl/sari.yourdomain.com/server.key;
    
    # Proxy to Node.js app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket support for hot reload (development only)
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 5.2 تفعيل SSL

1. اذهب إلى **SSL**
2. اختر **LetsEncrypt**
3. اضغط **Obtain Certificate**

---

## الخطوة 6: إعداد Green API Webhook

بعد نشر الموقع، يجب إعداد Webhook لاستقبال رسائل WhatsApp:

1. اذهب إلى https://console.green-api.com
2. اختر الـ Instance الخاص بك
3. اذهب إلى **Webhooks**
4. أضف Webhook URL:
   ```
   https://sari.yourdomain.com/api/webhooks/greenapi
   ```
5. فعّل:
   - ✅ Incoming Message Webhook
   - ✅ Outgoing Message Webhook
   - ✅ State Instance Changed Webhook

---

## الخطوة 7: إنشاء حساب Admin

بعد نشر الموقع، أنشئ حساب Admin:

### خيار 1: من خلال قاعدة البيانات

```sql
-- أولاً، سجل حساب عادي من الموقع
-- ثم حدّث الدور إلى admin
UPDATE users SET role = 'admin' WHERE email = 'your-email@domain.com';
```

### خيار 2: استخدام الحسابات التجريبية

الحسابات التجريبية الافتراضية:
- **Admin**: admin@sari.sa / admin123
- **Merchant**: merchant@sari.sa / merchant123

---

## الخطوة 8: التحقق من النشر

### 8.1 فحص حالة التطبيق

```bash
# على السيرفر
pm2 status
pm2 logs sari
```

### 8.2 فحص الـ Endpoints

```bash
# فحص الصفحة الرئيسية
curl https://sari.yourdomain.com

# فحص API
curl https://sari.yourdomain.com/api/trpc/auth.me
```

---

## استكشاف الأخطاء

### مشكلة: التطبيق لا يعمل

```bash
# فحص logs
pm2 logs sari --lines 100

# إعادة تشغيل
pm2 restart sari
```

### مشكلة: قاعدة البيانات لا تتصل

```bash
# تأكد من DATABASE_URL صحيح
# تأكد من SSL مفعل
# جرب الاتصال يدوياً
mysql -h host -u user -p database
```

### مشكلة: Webhook لا يعمل

1. تأكد من URL صحيح
2. تأكد من SSL مفعل
3. فحص logs:
   ```bash
   pm2 logs sari | grep webhook
   ```

---

## الأوامر المفيدة

```bash
# تحديث التطبيق
cd /home/forge/sari.yourdomain.com
git pull origin main
npm install
npm run build
pm2 restart sari

# فحص حالة PM2
pm2 status
pm2 logs sari
pm2 monit

# إعادة تشغيل Nginx
sudo systemctl restart nginx

# فحص Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## الدعم

إذا واجهت أي مشاكل، تواصل معنا:
- البريد: support@sari.sa
- الموقع: https://sari.sa/support
