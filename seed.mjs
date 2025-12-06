import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { plans } from './drizzle/schema.ts';
import dotenv from 'dotenv';

// تحميل المتغيرات البيئية
dotenv.config();

async function seed() {
  console.log('🌱 Starting seed process...');

  try {
    // الاتصال بقاعدة البيانات
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const db = drizzle(connection);

    console.log('✅ Connected to database');

    // إضافة الباقات الثلاث
    console.log('📦 Inserting subscription plans...');
    
    await db.insert(plans).values([
      {
        name: 'B1',
        nameAr: 'الباقة الأساسية',
        priceMonthly: 90,
        conversationLimit: 150,
        voiceMessageLimit: 50,
        features: JSON.stringify([
          '150 محادثة شهرياً',
          '50 رسالة صوتية',
          'دعم فني عبر البريد',
          'تقارير أساسية'
        ]),
        isActive: true
      },
      {
        name: 'B2',
        nameAr: 'باقة النمو',
        priceMonthly: 230,
        conversationLimit: 600,
        voiceMessageLimit: -1, // unlimited
        features: JSON.stringify([
          '600 محادثة شهرياً',
          'رسائل صوتية غير محدودة',
          'دعم فني عبر الواتساب',
          'تقارير متقدمة',
          'إحصائيات تفصيلية'
        ]),
        isActive: true
      },
      {
        name: 'B3',
        nameAr: 'الباقة الاحترافية',
        priceMonthly: 845,
        conversationLimit: 2000,
        voiceMessageLimit: -1, // unlimited
        features: JSON.stringify([
          '2000 محادثة شهرياً',
          'رسائل صوتية غير محدودة',
          'دعم فني ذو أولوية (24/7)',
          'تقارير متقدمة وتحليلات AI',
          'API مخصص',
          'تدريب مخصص للفريق',
          'مدير حساب مخصص'
        ]),
        isActive: true
      }
    ]);

    console.log('✅ Plans inserted successfully');
    console.log('');
    console.log('📊 Subscription Plans:');
    console.log('  - B1 (الباقة الأساسية): 90 ريال/شهر - 150 محادثة');
    console.log('  - B2 (باقة النمو): 230 ريال/شهر - 600 محادثة');
    console.log('  - B3 (الباقة الاحترافية): 845 ريال/شهر - 2000 محادثة');
    console.log('');
    console.log('🎉 Seed completed successfully!');

    await connection.end();
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
