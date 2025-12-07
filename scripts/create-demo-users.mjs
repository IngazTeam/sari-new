import { drizzle } from "drizzle-orm/mysql2";
import bcrypt from "bcryptjs";
import { users, merchants, subscriptions, plans } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL);

async function createDemoUsers() {
  console.log("🔧 Creating demo users...");

  // Hash passwords
  const adminPassword = await bcrypt.hash("admin123", 10);
  const merchantPassword = await bcrypt.hash("merchant123", 10);

  try {
    // 1. Create Admin user
    console.log("Creating admin user...");
    const adminResult = await db.insert(users).values({
      openId: "demo-admin-" + Date.now(),
      name: "مدير النظام",
      email: "admin@sari.sa",
      password: adminPassword,
      loginMethod: "email",
      role: "admin",
      lastSignedIn: new Date(),
    });
    console.log("✅ Admin user created:", adminResult);

    // 2. Create Merchant user
    console.log("Creating merchant user...");
    const merchantUserResult = await db.insert(users).values({
      openId: "demo-merchant-" + Date.now(),
      name: "تاجر تجريبي",
      email: "merchant@sari.sa",
      password: merchantPassword,
      loginMethod: "email",
      role: "user",
      lastSignedIn: new Date(),
    });
    
    const merchantUserId = merchantUserResult[0].insertId;
    console.log("✅ Merchant user created with ID:", merchantUserId);

    // 3. Get or create B1 plan
    let b1Plan = await db.select().from(plans).where(eq(plans.name, "B1")).limit(1);
    let planId;
    
    if (b1Plan.length === 0) {
      console.log("Creating B1 plan...");
      const planResult = await db.insert(plans).values({
        name: "B1",
        nameAr: "الباقة الأساسية",
        priceMonthly: 90,
        conversationLimit: 150,
        voiceMessageLimit: 50,
        features: JSON.stringify(["150 محادثة شهرياً", "50 رسالة صوتية", "دعم فني أساسي"]),
        isActive: true,
      });
      planId = planResult[0].insertId;
      console.log("✅ B1 plan created with ID:", planId);
    } else {
      planId = b1Plan[0].id;
      console.log("✅ Using existing B1 plan with ID:", planId);
    }

    // 4. Create merchant profile
    console.log("Creating merchant profile...");
    const merchantResult = await db.insert(merchants).values({
      userId: merchantUserId,
      businessName: "متجر تجريبي",
      phone: "+966501234567",
      status: "active",
    });
    
    const merchantId = merchantResult[0].insertId;
    console.log("✅ Merchant profile created with ID:", merchantId);

    // 5. Create subscription for merchant
    console.log("Creating subscription...");
    const subscriptionResult = await db.insert(subscriptions).values({
      merchantId: merchantId,
      planId: planId,
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      conversationsUsed: 0,
      voiceMessagesUsed: 0,
    });
    console.log("✅ Subscription created:", subscriptionResult);

    // Update merchant with subscription ID
    await db.update(merchants)
      .set({ subscriptionId: subscriptionResult[0].insertId })
      .where(eq(merchants.id, merchantId));

    console.log("\n✅ Demo users created successfully!");
    console.log("\n📧 Login credentials:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("👑 Admin:");
    console.log("   Email: admin@sari.sa");
    console.log("   Password: admin123");
    console.log("\n🏪 Merchant:");
    console.log("   Email: merchant@sari.sa");
    console.log("   Password: merchant123");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (error) {
    console.error("❌ Error creating demo users:", error);
    process.exit(1);
  }

  process.exit(0);
}

createDemoUsers();
