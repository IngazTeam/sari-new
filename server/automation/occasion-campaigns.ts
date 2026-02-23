/**
 * Occasion Campaigns Automation System
 * 
 * Automatically detects special occasions (Ramadan, Eid, National Day, etc.)
 * and sends promotional campaigns with discount codes to customers.
 */

import * as db from '../db';
import { sendTextMessage } from '../whatsapp';

// Occasion types
export type OccasionType =
  | 'ramadan'
  | 'eid_fitr'
  | 'eid_adha'
  | 'national_day'
  | 'new_year'
  | 'hijri_new_year';

// Occasion dates (Hijri dates are approximate and should be adjusted yearly)
const OCCASION_DATES: Record<OccasionType, { start: string; end: string; discountPercent: number }> = {
  ramadan: { start: '03-01', end: '03-29', discountPercent: 20 }, // Approximate Ramadan dates
  eid_fitr: { start: '03-30', end: '04-03', discountPercent: 25 }, // Eid Al-Fitr (4 days)
  eid_adha: { start: '06-15', end: '06-19', discountPercent: 25 }, // Eid Al-Adha (approximate)
  national_day: { start: '09-23', end: '09-23', discountPercent: 23 }, // Saudi National Day
  new_year: { start: '01-01', end: '01-01', discountPercent: 15 }, // Gregorian New Year
  hijri_new_year: { start: '07-19', end: '07-19', discountPercent: 15 }, // Hijri New Year (approximate)
};

// Occasion names in Arabic
const OCCASION_NAMES: Record<OccasionType, string> = {
  ramadan: 'رمضان المبارك',
  eid_fitr: 'عيد الفطر المبارك',
  eid_adha: 'عيد الأضحى المبارك',
  national_day: 'اليوم الوطني السعودي',
  new_year: 'رأس السنة الميلادية',
  hijri_new_year: 'رأس السنة الهجرية',
};

/**
 * Detect current occasion based on today's date
 */
export function detectCurrentOccasion(): { type: OccasionType; name: string; discountPercent: number } | null {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${month}-${day}`;

  for (const [type, dates] of Object.entries(OCCASION_DATES)) {
    if (isDateInRange(todayStr, dates.start, dates.end)) {
      return {
        type: type as OccasionType,
        name: OCCASION_NAMES[type as OccasionType],
        discountPercent: dates.discountPercent,
      };
    }
  }

  return null;
}

/**
 * Check if a date is within a range
 */
function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/**
 * Generate a unique discount code for an occasion
 */
export async function generateOccasionDiscount(
  merchantId: number,
  occasionType: OccasionType,
  discountPercent: number
): Promise<string> {
  const prefix = getOccasionPrefix(occasionType);
  const year = new Date().getFullYear();
  const { randomInt } = await import('crypto');
  const random = randomInt(10000).toString().padStart(4, '0');
  const code = `${prefix}${year}${random}`;

  // Create discount code in database
  await db.createDiscountCode({
    merchantId,
    code,
    type: 'percentage',
    value: discountPercent,
    maxUses: 100, // Limited to 100 uses per occasion
    isActive: true,
    expiresAt: getOccasionEndDate(occasionType),
  });

  return code;
}

/**
 * Get occasion prefix for discount code
 */
function getOccasionPrefix(occasionType: OccasionType): string {
  const prefixes: Record<OccasionType, string> = {
    ramadan: 'RAMADAN',
    eid_fitr: 'EIDFITR',
    eid_adha: 'EIDADHA',
    national_day: 'NATIONAL',
    new_year: 'NEWYEAR',
    hijri_new_year: 'HIJRI',
  };
  return prefixes[occasionType];
}

/**
 * Get occasion end date
 */
function getOccasionEndDate(occasionType: OccasionType): Date {
  const dates = OCCASION_DATES[occasionType];
  const [month, day] = dates.end.split('-').map(Number);
  const year = new Date().getFullYear();
  return new Date(year, month - 1, day, 23, 59, 59);
}

/**
 * Generate occasion campaign message
 */
export function generateOccasionMessage(
  occasionName: string,
  customerName: string | null,
  discountCode: string,
  discountPercent: number,
  businessName: string
): string {
  const greeting = customerName ? `مرحباً ${customerName}!` : 'مرحباً!';

  return `${greeting}

🎉 *${occasionName}* 🎉

بمناسبة ${occasionName}، يسرنا في ${businessName} أن نقدم لك عرضاً خاصاً:

✨ *خصم ${discountPercent}%* على جميع منتجاتنا!

🎁 استخدم كود الخصم: *${discountCode}*

⏰ العرض محدود ولفترة محدودة فقط!

📦 تسوق الآن واستمتع بأفضل العروض

نتمنى لك ${occasionName} سعيداً! 🌙✨`;
}

/**
 * Send occasion campaign to all customers
 */
export async function sendOccasionCampaign(
  merchantId: number,
  occasionType: OccasionType,
  occasionName: string,
  discountCode: string,
  discountPercent: number
): Promise<number> {
  // Get merchant info
  const merchant = await db.getMerchantById(merchantId);
  if (!merchant) {
    console.error(`Merchant ${merchantId} not found`);
    return 0;
  }

  // Get WhatsApp connection
  const connection = await db.getWhatsappConnectionByMerchantId(merchantId);
  if (!connection || connection.status !== 'connected') {
    console.error(`WhatsApp not connected for merchant ${merchantId}`);
    return 0;
  }

  // Get all unique customer phones from conversations
  const conversations = await db.getConversationsByMerchantId(merchantId);
  const phoneSet = new Set<string>();
  conversations.forEach(c => phoneSet.add(c.customerPhone));
  const uniquePhones = Array.from(phoneSet);

  let successCount = 0;

  // Send message to each customer
  for (const phone of uniquePhones) {
    try {
      // Get customer name from conversation
      const conversation = conversations.find(c => c.customerPhone === phone);
      const customerName = conversation?.customerName || null;

      // Generate message
      const message = generateOccasionMessage(
        occasionName,
        customerName,
        discountCode,
        discountPercent,
        merchant.businessName
      );

      // Send via WhatsApp
      const result = await sendTextMessage(phone, message);

      if (result.success) {
        successCount++;
      }

      // Random delay between 3-6 seconds to avoid spam detection
      const delay = Math.floor(Math.random() * 3000) + 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`Failed to send occasion message to ${phone}:`, error);
    }
  }

  return successCount;
}

/**
 * Check and send occasion campaigns for all merchants
 * This function should be called daily via Cron Job
 */
export async function checkAndSendOccasionCampaigns(): Promise<void> {
  console.log('[Occasion Campaigns] Checking for current occasion...');

  // Detect current occasion
  const occasion = detectCurrentOccasion();
  if (!occasion) {
    console.log('[Occasion Campaigns] No occasion detected for today');
    return;
  }

  console.log(`[Occasion Campaigns] Detected: ${occasion.name} (${occasion.type})`);

  // Get all active merchants
  const merchants = await db.getAllMerchants();
  const activeMerchants = merchants.filter(m => m.status === 'active');

  console.log(`[Occasion Campaigns] Processing ${activeMerchants.length} active merchants`);

  const year = new Date().getFullYear();

  for (const merchant of activeMerchants) {
    try {
      // Check if campaign already sent this year
      const existingCampaign = await db.getOccasionCampaignByTypeAndYear(
        merchant.id,
        occasion.type,
        year
      );

      if (existingCampaign) {
        if (existingCampaign.status === 'sent') {
          console.log(`[Occasion Campaigns] Campaign already sent for merchant ${merchant.id}`);
          continue;
        }

        if (!existingCampaign.enabled) {
          console.log(`[Occasion Campaigns] Campaign disabled for merchant ${merchant.id}`);
          continue;
        }
      }

      // Create campaign record if doesn't exist
      let campaignId: number;
      if (!existingCampaign) {
        const newCampaign = await db.createOccasionCampaign({
          merchantId: merchant.id,
          occasionType: occasion.type,
          year,
          enabled: true,
          discountPercentage: occasion.discountPercent,
          status: 'pending',
        });

        if (!newCampaign) {
          console.error(`Failed to create campaign for merchant ${merchant.id}`);
          continue;
        }

        campaignId = newCampaign.id;
      } else {
        campaignId = existingCampaign.id;
      }

      // Generate discount code
      const discountCode = await generateOccasionDiscount(
        merchant.id,
        occasion.type,
        occasion.discountPercent
      );

      // Update campaign with discount code
      await db.updateOccasionCampaign(campaignId, {
        discountCode,
      });

      // Send campaign
      console.log(`[Occasion Campaigns] Sending campaign for merchant ${merchant.id}...`);
      const recipientCount = await sendOccasionCampaign(
        merchant.id,
        occasion.type,
        occasion.name,
        discountCode,
        occasion.discountPercent
      );

      // Mark as sent
      await db.markOccasionCampaignSent(campaignId, recipientCount);

      console.log(`[Occasion Campaigns] Campaign sent to ${recipientCount} customers for merchant ${merchant.id}`);
    } catch (error) {
      console.error(`[Occasion Campaigns] Error processing merchant ${merchant.id}:`, error);

      // Mark campaign as failed
      const existingCampaign = await db.getOccasionCampaignByTypeAndYear(
        merchant.id,
        occasion.type,
        year
      );

      if (existingCampaign) {
        await db.updateOccasionCampaign(existingCampaign.id, {
          status: 'failed',
        });
      }
    }
  }

  console.log('[Occasion Campaigns] Finished processing all merchants');
}

/**
 * Get upcoming occasions (next 30 days)
 */
export function getUpcomingOccasions(): Array<{ type: OccasionType; name: string; date: string; daysUntil: number }> {
  const today = new Date();
  const upcoming: Array<{ type: OccasionType; name: string; date: string; daysUntil: number }> = [];

  for (const [type, dates] of Object.entries(OCCASION_DATES)) {
    const [month, day] = dates.start.split('-').map(Number);
    const year = today.getFullYear();
    const occasionDate = new Date(year, month - 1, day);

    // If occasion has passed this year, check next year
    if (occasionDate < today) {
      occasionDate.setFullYear(year + 1);
    }

    const daysUntil = Math.ceil((occasionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 30 && daysUntil >= 0) {
      upcoming.push({
        type: type as OccasionType,
        name: OCCASION_NAMES[type as OccasionType],
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        daysUntil,
      });
    }
  }

  return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}
