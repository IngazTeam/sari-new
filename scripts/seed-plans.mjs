import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../drizzle/schema.ts';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

async function seedPlans() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection, { schema, mode: 'default' });

  console.log('🌱 Seeding plans...');

  const plans = [
    {
      name: 'Starter',
      nameAr: 'المبتدئ',
      priceMonthly: 99,
      conversationLimit: 100,
      voiceMessageLimit: 50,
      features: 'مثالية للمتاجر الصغيرة التي تبدأ رحلتها في التجارة الإلكترونية',
      isActive: true,
    },
    {
      name: 'Professional',
      nameAr: 'الاحترافي',
      priceMonthly: 299,
      conversationLimit: 500,
      voiceMessageLimit: 200,
      features: 'للمتاجر المتوسطة التي تحتاج إلى مزيد من المرونة والتحليلات',
      isActive: true,
    },
    {
      name: 'Enterprise',
      nameAr: 'المؤسسات',
      priceMonthly: 999,
      conversationLimit: -1, // Unlimited
      voiceMessageLimit: -1, // Unlimited
      features: 'للمتاجر الكبيرة والمؤسسات التي تحتاج إلى حلول غير محدودة',
      isActive: true,
    },
  ];

  for (const plan of plans) {
    await db.insert(schema.plans).values(plan);
    console.log(`✅ Created plan: ${plan.nameAr}`);
  }

  console.log('✅ Plans seeded successfully!');
  await connection.end();
}

seedPlans().catch((error) => {
  console.error('❌ Error seeding plans:', error);
  process.exit(1);
});
