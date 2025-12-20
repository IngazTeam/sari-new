# 🚀 دليل النشر على Digital Ocean

## 📋 المتطلبات الأساسية

قبل البدء، تأكد من:
- ✅ حساب Digital Ocean نشط
- ✅ دومين خاص (مثل: sary.live)
- ✅ جميع المفاتيح من `ENVIRONMENT_SETUP_GUIDE.md`

---

## 🎯 الخطوة 1: إنشاء Droplet

1. اذهب إلى [Digital Ocean](https://cloud.digitalocean.com/)
2. اضغط **Create** → **Droplets**
3. اختر:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($12/month - 2GB RAM)
   - **Datacenter:** اختر الأقرب لعملائك
   - **Authentication:** SSH Key (موصى به)
4. اضغط **Create Droplet**

---

## 🎯 الخطوة 2: إنشاء قاعدة البيانات

1. اذهب إلى **Databases** → **Create Database**
2. اختر:
   - **Engine:** MySQL 8
   - **Plan:** Basic ($15/month)
   - **Datacenter:** نفس Droplet
3. بعد الإنشاء:
   - اذهب إلى **Connection Details**
   - انسخ **Connection String**
   - أضفه إلى `.env.production` كـ `DATABASE_URL`

---

## 🎯 الخطوة 3: إعداد الخادم

### 3.1 الاتصال بالخادم

```bash
ssh root@your-droplet-ip
```

### 3.2 تثبيت Node.js 22

```bash
# تحديث النظام
apt update && apt upgrade -y

# تثبيت Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# التحقق من التثبيت
node --version  # يجب أن يظهر v22.x.x
npm --version
```

### 3.3 تثبيت pnpm و PM2

```bash
# تثبيت pnpm
npm install -g pnpm

# تثبيت PM2 (لإدارة العمليات)
npm install -g pm2

# التحقق
pnpm --version
pm2 --version
```

### 3.4 تثبيت Git

```bash
apt-get install -y git
git --version
```

---

## 🎯 الخطوة 4: رفع المشروع

### 4.1 استنساخ المشروع

```bash
# الانتقال إلى المجلد الرئيسي
cd /var/www

# استنساخ المشروع (استبدل بالرابط الخاص بك)
git clone https://github.com/your-username/sari.git
cd sari
```

### 4.2 إعداد ملف البيئة

```bash
# نسخ ملف البيئة
cp .env.production .env

# تحرير الملف وإضافة المفاتيح
nano .env
```

**أدخل جميع المفاتيح من `ENVIRONMENT_SETUP_GUIDE.md`:**
- DATABASE_URL
- JWT_SECRET
- GREEN_API_INSTANCE_ID
- GREEN_API_TOKEN
- OPENAI_API_KEY
- TAP_SECRET_KEY
- TAP_PUBLIC_KEY
- SMTP2GO_API_KEY
- وغيرها...

اضغط `Ctrl+X` ثم `Y` ثم `Enter` للحفظ.

### 4.3 تثبيت الحزم

```bash
pnpm install
```

### 4.4 إعداد قاعدة البيانات

```bash
# تطبيق Schema على قاعدة البيانات
pnpm db:push

# التحقق من النجاح
# يجب أن ترى: ✓ Schema pushed successfully
```

### 4.5 بناء المشروع

```bash
pnpm build
```

### 4.6 تشغيل المشروع

```bash
# تشغيل بواسطة PM2
pm2 start ecosystem.config.cjs

# حفظ الإعدادات للتشغيل التلقائي عند إعادة التشغيل
pm2 save
pm2 startup

# التحقق من الحالة
pm2 status
pm2 logs
```

---

## 🎯 الخطوة 5: إعداد Nginx (Reverse Proxy)

### 5.1 تثبيت Nginx

```bash
apt-get install -y nginx
```

### 5.2 إنشاء ملف التكوين

```bash
nano /etc/nginx/sites-available/sari
```

**أدخل التكوين التالي:**

```nginx
server {
    listen 80;
    server_name sary.live www.sary.live;

    # Increase timeouts for long-running requests
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;

    # Increase buffer sizes
    client_max_body_size 50M;
    client_body_buffer_size 128k;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support for real-time features
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

اضغط `Ctrl+X` ثم `Y` ثم `Enter` للحفظ.

### 5.3 تفعيل الموقع

```bash
# إنشاء رابط رمزي
ln -s /etc/nginx/sites-available/sari /etc/nginx/sites-enabled/

# اختبار التكوين
nginx -t

# إعادة تشغيل Nginx
systemctl restart nginx

# التحقق من الحالة
systemctl status nginx
```

---

## 🎯 الخطوة 6: إعداد SSL (HTTPS)

### 6.1 تثبيت Certbot

```bash
apt-get install -y certbot python3-certbot-nginx
```

### 6.2 الحصول على شهادة SSL

```bash
certbot --nginx -d sary.live -d www.sary.live
```

**اتبع التعليمات:**
1. أدخل بريدك الإلكتروني
2. اقبل شروط الخدمة
3. اختر ما إذا كنت تريد إعادة توجيه HTTP إلى HTTPS (موصى به: نعم)

### 6.3 التجديد التلقائي

```bash
# اختبار التجديد
certbot renew --dry-run

# Certbot يضيف cron job تلقائياً للتجديد
```

---

## 🎯 الخطوة 7: إعداد Firewall

```bash
# تفعيل UFW
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable

# التحقق من الحالة
ufw status
```

---

## 🎯 الخطوة 8: ربط الدومين

1. اذهب إلى مزود الدومين الخاص بك (Namecheap, GoDaddy, etc.)
2. أضف **A Records**:
   ```
   Type: A
   Name: @
   Value: your-droplet-ip
   TTL: Automatic

   Type: A
   Name: www
   Value: your-droplet-ip
   TTL: Automatic
   ```
3. انتظر 5-30 دقيقة للانتشار

---

## ✅ التحقق من النشر

### 1. اختبار الموقع

افتح المتصفح واذهب إلى:
```
https://sary.live
```

يجب أن ترى صفحة تسجيل الدخول.

### 2. اختبار API

```bash
curl https://sary.live/api/health
```

يجب أن ترى:
```json
{"status":"ok"}
```

### 3. فحص السجلات

```bash
# سجلات PM2
pm2 logs

# سجلات Nginx
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

---

## 🔄 التحديثات المستقبلية

عندما تريد تحديث المشروع:

```bash
# SSH إلى الخادم
ssh root@your-droplet-ip

# الانتقال إلى المشروع
cd /var/www/sari

# سحب آخر التحديثات
git pull origin main

# تثبيت الحزم الجديدة (إن وجدت)
pnpm install

# تطبيق migrations الجديدة (إن وجدت)
pnpm db:push

# إعادة البناء
pnpm build

# إعادة تشغيل PM2
pm2 restart all

# التحقق
pm2 status
pm2 logs
```

---

## 🐛 حل المشاكل الشائعة

### المشكلة: الموقع لا يعمل

```bash
# فحص حالة PM2
pm2 status
pm2 logs

# فحص حالة Nginx
systemctl status nginx
nginx -t

# فحص المنافذ
netstat -tulpn | grep :3000
netstat -tulpn | grep :80
```

### المشكلة: خطأ في قاعدة البيانات

```bash
# التحقق من الاتصال
pnpm db:push

# فحص السجلات
pm2 logs --lines 100
```

### المشكلة: SSL لا يعمل

```bash
# التحقق من الشهادة
certbot certificates

# تجديد يدوي
certbot renew

# إعادة تشغيل Nginx
systemctl restart nginx
```

### المشكلة: نفاد الذاكرة

```bash
# زيادة حجم Droplet من لوحة Digital Ocean
# أو تقليل استهلاك الذاكرة:

# في ecosystem.config.cjs، أضف:
max_memory_restart: '500M'

# ثم أعد التشغيل
pm2 restart all
```

---

## 📊 المراقبة والصيانة

### مراقبة الأداء

```bash
# حالة الخادم
htop

# استخدام القرص
df -h

# استخدام الذاكرة
free -h

# حالة PM2
pm2 monit
```

### النسخ الاحتياطي

```bash
# نسخ احتياطي لقاعدة البيانات (من Digital Ocean Dashboard)
# اذهب إلى Database → Backups → Create Backup

# نسخ احتياطي للمشروع
cd /var/www
tar -czf sari-backup-$(date +%Y%m%d).tar.gz sari/
```

---

## 💰 التكاليف المتوقعة

| الخدمة | التكلفة الشهرية |
|--------|-----------------|
| Digital Ocean Droplet (2GB) | $12 |
| Digital Ocean Database | $15 |
| Green API | $10 |
| OpenAI API | $5-50 (حسب الاستخدام) |
| Tap Payments | مجاني + 2.5% عمولة |
| SMTP2GO | مجاني (حتى 1000 رسالة) |
| **الإجمالي** | **$42-87/شهر** |

---

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع ملف `ENVIRONMENT_SETUP_GUIDE.md`
2. فحص السجلات: `pm2 logs`
3. فحص حالة الخدمات: `pm2 status`
4. فحص Nginx: `nginx -t`

---

## ✨ الخطوات التالية

بعد النشر الناجح:
1. ✅ اختبر جميع الميزات
2. ✅ أنشئ حساب مسؤول
3. ✅ اربط حساب WhatsApp Business
4. ✅ اختبر المحادثات مع العملاء
5. ✅ راقب السجلات والأداء

---

تهانينا! 🎉 مشروع Sari الآن يعمل على Digital Ocean!
