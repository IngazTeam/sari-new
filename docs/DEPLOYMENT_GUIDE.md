# 🚀 دليل النشر والتشغيل - مشروع Sari

## نظرة عامة

هذا الدليل يشرح كيفية نشر مشروع Sari على سيرفر VPS (DigitalOcean, AWS, Hetzner، إلخ).

---

## 1️⃣ متطلبات السيرفر

### المواصفات الموصى بها:
- **CPU:** 2 cores أو أكثر
- **RAM:** 4GB أو أكثر
- **Storage:** 20GB SSD أو أكثر
- **OS:** Ubuntu 22.04 LTS
- **Network:** اتصال إنترنت مستقر

### البرامج المطلوبة:
- Node.js 22.x
- MySQL 8.0 أو أعلى
- Nginx (للـ Reverse Proxy)
- PM2 (لإدارة العمليات)
- Git

---

## 2️⃣ إعداد السيرفر

### تحديث النظام:
```bash
sudo apt update
sudo apt upgrade -y
```

### تثبيت Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### تثبيت pnpm:
```bash
npm install -g pnpm
```

### تثبيت MySQL:
```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### إنشاء قاعدة البيانات:
```bash
sudo mysql -u root -p

CREATE DATABASE sari_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sari_user'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON sari_db.* TO 'sari_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### تثبيت PM2:
```bash
sudo npm install -g pm2
```

### تثبيت Nginx:
```bash
sudo apt install -y nginx
```

---

## 3️⃣ رفع الكود على السيرفر

### استخدام Git:
```bash
cd /var/www
sudo git clone https://github.com/your-username/sari.git
cd sari
```

### أو رفع الملفات يدوياً:
```bash
# على جهازك المحلي
cd /home/ubuntu/sari
tar -czf sari.tar.gz .

# رفع الملف إلى السيرفر
scp sari.tar.gz user@your-server-ip:/var/www/

# على السيرفر
cd /var/www
tar -xzf sari.tar.gz
mv sari-extracted sari
```

---

## 4️⃣ إعداد المتغيرات البيئية

### إنشاء ملف .env:
```bash
cd /var/www/sari
nano .env
```

### محتوى ملف .env:
```env
# Database
DATABASE_URL=mysql://sari_user:your_strong_password@localhost:3306/sari_db

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Green API (سيتم إضافتها لاحقاً من لوحة التحكم)
# GREEN_API_INSTANCE_ID=
# GREEN_API_TOKEN=

# JWT Secret
JWT_SECRET=your_very_long_random_secret_key_here

# OAuth (Manus)
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
VITE_APP_ID=your_app_id
OWNER_OPEN_ID=your_owner_open_id
OWNER_NAME=Your Name

# Built-in Forge API
BUILT_IN_FORGE_API_URL=https://forge.manus.im
BUILT_IN_FORGE_API_KEY=your_forge_api_key
VITE_FRONTEND_FORGE_API_KEY=your_frontend_forge_key
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.im

# App Settings
VITE_APP_TITLE=Sari - AI Sales Agent
VITE_APP_LOGO=/logo.png

# Node Environment
NODE_ENV=production
PORT=3000
```

---

## 5️⃣ تثبيت Dependencies وبناء المشروع

### تثبيت Dependencies:
```bash
cd /var/www/sari
pnpm install
```

### تطبيق Migrations:
```bash
pnpm db:push
```

### بناء المشروع:
```bash
pnpm build
```

---

## 6️⃣ إعداد PM2

### إنشاء ملف ecosystem.config.js:
```bash
nano ecosystem.config.js
```

### محتوى الملف:
```javascript
module.exports = {
  apps: [{
    name: 'sari',
    script: 'dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

### إنشاء مجلد Logs:
```bash
mkdir -p logs
```

### تشغيل التطبيق:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### التحقق من الحالة:
```bash
pm2 status
pm2 logs sari
```

---

## 7️⃣ إعداد Nginx

### إنشاء ملف Configuration:
```bash
sudo nano /etc/nginx/sites-available/sari
```

### محتوى الملف:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for real-time features
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Increase upload size for CSV files
    client_max_body_size 10M;
}
```

### تفعيل الموقع:
```bash
sudo ln -s /etc/nginx/sites-available/sari /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 8️⃣ إعداد SSL (HTTPS)

### تثبيت Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### الحصول على شهادة SSL:
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

### التجديد التلقائي:
```bash
sudo certbot renew --dry-run
```

---

## 9️⃣ إعداد Firewall

### تفعيل UFW:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 🔟 إعداد Backup التلقائي

### إنشاء سكريبت Backup:
```bash
sudo nano /usr/local/bin/sari-backup.sh
```

### محتوى السكريبت:
```bash
#!/bin/bash

# Variables
BACKUP_DIR="/var/backups/sari"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="sari_db"
DB_USER="sari_user"
DB_PASS="your_strong_password"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
mysqldump -u $DB_USER -p$DB_PASS $DB_NAME | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup files
tar -czf $BACKUP_DIR/files_$DATE.tar.gz /var/www/sari

# Delete old backups (keep last 7 days)
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
```

### جعل السكريبت قابل للتنفيذ:
```bash
sudo chmod +x /usr/local/bin/sari-backup.sh
```

### إضافة Cron Job:
```bash
sudo crontab -e
```

### إضافة السطر التالي (Backup يومي الساعة 2 صباحاً):
```
0 2 * * * /usr/local/bin/sari-backup.sh >> /var/log/sari-backup.log 2>&1
```

---

## 1️⃣1️⃣ إعداد Monitoring

### تثبيت Monit:
```bash
sudo apt install -y monit
```

### إعداد Monit:
```bash
sudo nano /etc/monit/conf.d/sari
```

### محتوى الملف:
```
check process sari with pidfile /var/www/sari/.pm2/pids/sari-0.pid
    start program = "/usr/bin/pm2 start /var/www/sari/ecosystem.config.js"
    stop program = "/usr/bin/pm2 stop sari"
    if failed host localhost port 3000 protocol http
        with timeout 10 seconds
        then restart
    if 5 restarts within 5 cycles then timeout
```

### تشغيل Monit:
```bash
sudo systemctl enable monit
sudo systemctl start monit
sudo monit status
```

---

## 1️⃣2️⃣ إضافة البيانات الأولية (Seed Data)

### إنشاء سكريبت Seed:
```bash
nano seed.mjs
```

### محتوى السكريبت:
```javascript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { plans } from './drizzle/schema.ts';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// إضافة الباقات الثلاث
await db.insert(plans).values([
  {
    name: 'B1',
    nameAr: 'الباقة الأساسية',
    priceMonthly: 90,
    conversationLimit: 150,
    voiceMessageLimit: 50,
    features: JSON.stringify(['150 محادثة', '50 رسالة صوتية', 'دعم فني']),
    isActive: true
  },
  {
    name: 'B2',
    nameAr: 'باقة النمو',
    priceMonthly: 230,
    conversationLimit: 600,
    voiceMessageLimit: -1, // unlimited
    features: JSON.stringify(['600 محادثة', 'رسائل صوتية غير محدودة', 'دعم فني', 'تقارير متقدمة']),
    isActive: true
  },
  {
    name: 'B3',
    nameAr: 'الباقة الاحترافية',
    priceMonthly: 845,
    conversationLimit: 2000,
    voiceMessageLimit: -1, // unlimited
    features: JSON.stringify(['2000 محادثة', 'رسائل صوتية غير محدودة', 'دعم فني ذو أولوية', 'تقارير متقدمة', 'API مخصص']),
    isActive: true
  }
]);

console.log('Seed data inserted successfully!');
await connection.end();
```

### تشغيل السكريبت:
```bash
node seed.mjs
```

---

## 1️⃣3️⃣ التحديثات المستقبلية

### سير العمل:
```bash
# على السيرفر
cd /var/www/sari
git pull origin main
pnpm install
pnpm db:push
pnpm build
pm2 restart sari
```

---

## 1️⃣4️⃣ استكشاف الأخطاء

### التحقق من Logs:
```bash
# PM2 logs
pm2 logs sari

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# MySQL logs
sudo tail -f /var/log/mysql/error.log
```

### إعادة تشغيل الخدمات:
```bash
# PM2
pm2 restart sari

# Nginx
sudo systemctl restart nginx

# MySQL
sudo systemctl restart mysql
```

---

## 1️⃣5️⃣ الخلاصة

### الخطوات الأساسية:
1. ✅ إعداد السيرفر وتثبيت البرامج المطلوبة
2. ✅ إنشاء قاعدة البيانات
3. ✅ رفع الكود وإعداد المتغيرات البيئية
4. ✅ بناء المشروع وتشغيله بـ PM2
5. ✅ إعداد Nginx كـ Reverse Proxy
6. ✅ تفعيل SSL بـ Certbot
7. ✅ إعداد Firewall والـ Backup
8. ✅ إضافة البيانات الأولية

### Resources:
- [DigitalOcean Tutorials](https://www.digitalocean.com/community/tutorials)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
