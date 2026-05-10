/**
 * سكربت إضافة باقات ساري AI الثلاث
 * 
 * الاستخدام:
 * 1. محلياً: npx tsx server/scripts/seed-plans.ts
 * 2. مع DATABASE_URL مخصص: DATABASE_URL="mysql://user:pass@host:3306/db" npx tsx server/scripts/seed-plans.ts
 * 3. أو عبر الـ API مباشرة باستخدام curl (انظر الأسفل)
 */

// Load .env first
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

if (!process.env.DATABASE_URL) {
  try {
    const __dir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(__dir, '../../.env');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

import mysql from 'mysql2/promise';

const PLANS = [
  {
    name: 'Starter',
    nameAr: 'البداية',
    priceMonthly: 199,
    conversationLimit: 500,
    voiceMessageLimit: 50,
    features: 'بوت مبيعات ذكي,ردود تلقائية 24/7,كتالوج المنتجات (100),استيراد Excel/CSV,تحليل الموقع الإلكتروني,أسئلة شائعة ذكية,لوحة تحكم',
  },
  {
    name: 'Business',
    nameAr: 'الأعمال',
    priceMonthly: 499,
    conversationLimit: 2000,
    voiceMessageLimit: 200,
    features: 'كل ميزات البداية,حملات تسويقية واتساب,ربط سلة + زد,أوامر شراء عبر الشات,Google Sheets مزامنة,أكواد خصم ذكية,إدارة العملاء,تقارير أسبوعية,سلات مهجورة (استرداد),إشعارات الطلبات,تحليلات متقدمة,منتجات (500)',
  },
  {
    name: 'Enterprise',
    nameAr: 'الشركات',
    priceMonthly: 999,
    conversationLimit: 99999,
    voiceMessageLimit: 1000,
    features: 'كل ميزات الأعمال,محادثات غير محدودة,حملات المناسبات التلقائية,نظام الولاء والمكافآت,ربط WooCommerce,ربط Calendly,شخصية بوت مخصصة,ردود سريعة مخصصة,تحليل المنافسين,روابط دفع مباشرة,تقارير Google Sheets,إدارة الموظفين والخدمات,منتجات غير محدودة,دعم أولوية',
  },
];

async function seedPlans() {
  const dbUrlStr = process.env.DATABASE_URL;
  if (!dbUrlStr) {
    console.error('❌ DATABASE_URL غير موجود');
    process.exit(1);
  }

  console.log('\n🚀 بدء إضافة الباقات...');
  console.log(`📡 جاري الاتصال بـ: ${dbUrlStr.replace(/:[^:@]*@/, ':****@')}\n`);

  const dbUrl = new URL(dbUrlStr);
  const sslParam = dbUrl.searchParams.get('ssl');

  const connection = await mysql.createConnection({
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port) || 3306,
    user: dbUrl.username,
    password: dbUrl.password ? decodeURIComponent(dbUrl.password) : '',
    database: dbUrl.pathname.slice(1),
    ...(sslParam ? { ssl: JSON.parse(sslParam) } : {}),
  });

  console.log('[DB] ✅ متصل\n');

  for (const plan of PLANS) {
    try {
      const [result] = await connection.execute(
        'INSERT INTO plans (name, nameAr, priceMonthly, conversationLimit, voiceMessageLimit, features) VALUES (?, ?, ?, ?, ?, ?)',
        [plan.name, plan.nameAr, plan.priceMonthly, plan.conversationLimit, plan.voiceMessageLimit, plan.features]
      );
      const insertId = (result as any).insertId;
      console.log(`✅ ${plan.nameAr} (${plan.name}) — ${plan.priceMonthly} ر.س/شهر — ID: ${insertId}`);
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log(`⚠️  ${plan.nameAr} (${plan.name}) — موجودة مسبقاً`);
      } else {
        console.error(`❌ خطأ في ${plan.nameAr}:`, error.message);
      }
    }
  }

  console.log('\n✅ تم الانتهاء!');
  await connection.end();
  process.exit(0);
}

seedPlans().catch(err => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});
