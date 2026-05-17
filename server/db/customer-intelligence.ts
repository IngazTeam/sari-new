/**
 * Customer Intelligence — Phase 2 of Adaptive Sales Engine
 * 
 * Builds persistent customer profiles that accumulate across conversations.
 * Enables: "أهلاً أبو عبدالله! كيف الجهاز معاك؟"
 */

import * as db from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CustomerProfile {
  id?: number;
  merchantId: number;
  customerPhone: string;
  displayName: string | null;
  nickname: string | null;           // "أبو عبدالله" — only if child name was mentioned
  childName: string | null;          // extracted from conversation
  preferences: Record<string, any>; // { priceConscious: true, prefersQuality: false }
  painPoints: string[];              // ["اشتكى من التأخير", "سأل عن الضمان"]
  purchaseHistory: string[];         // last 10 products
  totalSpent: number;
  totalConversations: number;
  sentimentAvg: string;              // overall sentiment
  customerTier: CustomerTier;
  lastObjection: string | null;      // "price" | "delivery" | "quality"
  lastSeenAt: Date;
  createdAt: Date;
}

export type CustomerTier = 'new' | 'returning' | 'loyal' | 'vip' | 'at_risk';


// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Get or create customer profile. Called once at conversation start.
 */
export async function getOrCreateProfile(
  merchantId: number,
  customerPhone: string,
  customerName?: string
): Promise<CustomerProfile> {
  const pool = await db.getPool();
  if (!pool) return buildDefaultProfile(merchantId, customerPhone, customerName);

  const [rows] = await pool.execute(
    `SELECT * FROM customer_profiles WHERE merchant_id = ? AND customer_phone = ?`,
    [merchantId, customerPhone]
  );

  const existing = (rows as any[])[0];
  if (existing) {
    // Update last seen + increment conversations
    await pool.execute(
      `UPDATE customer_profiles SET last_seen_at = NOW(), total_conversations = total_conversations + 1
       WHERE id = ?`,
      [existing.id]
    );
    return mapRow(existing);
  }

  // Create new profile
  const [result] = await pool.execute(
    `INSERT INTO customer_profiles (merchant_id, customer_phone, display_name, total_conversations)
     VALUES (?, ?, ?, 1)`,
    [merchantId, customerPhone, customerName || null]
  );

  return {
    ...buildDefaultProfile(merchantId, customerPhone, customerName),
    id: (result as any).insertId,
  };
}

/**
 * Update profile at end of conversation (fire-and-forget).
 */
export async function updateProfile(
  merchantId: number,
  customerPhone: string,
  updates: Partial<Pick<CustomerProfile, 
    'displayName' | 'nickname' | 'childName' | 'preferences' | 'painPoints' | 
    'sentimentAvg' | 'lastObjection' | 'customerTier'
  >>
): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.displayName !== undefined) { setClauses.push('display_name = ?'); values.push(updates.displayName); }
  if (updates.nickname !== undefined) { setClauses.push('nickname = ?'); values.push(updates.nickname); }
  if (updates.childName !== undefined) { setClauses.push('child_name = ?'); values.push(updates.childName); }
  if (updates.preferences !== undefined) { setClauses.push('preferences = ?'); values.push(JSON.stringify(updates.preferences)); }
  if (updates.painPoints !== undefined) { setClauses.push('pain_points = ?'); values.push(JSON.stringify(updates.painPoints)); }
  if (updates.sentimentAvg !== undefined) { setClauses.push('sentiment_avg = ?'); values.push(updates.sentimentAvg); }
  if (updates.lastObjection !== undefined) { setClauses.push('last_objection = ?'); values.push(updates.lastObjection); }
  if (updates.customerTier !== undefined) { setClauses.push('customer_tier = ?'); values.push(updates.customerTier); }

  if (setClauses.length === 0) return;

  values.push(merchantId, customerPhone);
  await pool.execute(
    `UPDATE customer_profiles SET ${setClauses.join(', ')} WHERE merchant_id = ? AND customer_phone = ?`,
    values
  );
}

/**
 * Record a purchase to the customer's history.
 */
export async function recordPurchase(
  merchantId: number,
  customerPhone: string,
  productName: string,
  amount: number
): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;

  // Get current history
  const [rows] = await pool.execute(
    `SELECT purchase_history, total_spent FROM customer_profiles WHERE merchant_id = ? AND customer_phone = ?`,
    [merchantId, customerPhone]
  );
  
  const existing = (rows as any[])[0];
  if (!existing) return;

  let history: string[] = [];
  try { history = JSON.parse(existing.purchase_history || '[]'); } catch { history = []; }
  history.push(productName);
  if (history.length > 10) history = history.slice(-10); // Keep last 10

  const newTotal = Number(existing.total_spent || 0) + amount;
  const newTier = classifyTier(history.length, newTotal);

  await pool.execute(
    `UPDATE customer_profiles SET purchase_history = ?, total_spent = ?, customer_tier = ?
     WHERE merchant_id = ? AND customer_phone = ?`,
    [JSON.stringify(history), newTotal, newTier, merchantId, customerPhone]
  );
}

// ═══════════════════════════════════════════════════════════════
// Tier Classification
// ═══════════════════════════════════════════════════════════════

export function classifyTier(purchaseCount: number, totalSpent: number): CustomerTier {
  if (totalSpent >= 5000 || purchaseCount >= 10) return 'vip';
  if (totalSpent >= 1000 || purchaseCount >= 3) return 'loyal';
  if (purchaseCount >= 1) return 'returning';
  return 'new';
}

/**
 * Build a short context string for GPT injection.
 */
// SEC-SALES-02: Sanitize customer data before prompt injection
function sanitizeProfileData(text: string): string {
  if (!text) return '';
  return text.normalize('NFKC')
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/override\s+(system|all|your)/gi, '[filtered]')
    .replace(/act\s+as\s+(a|an)?/gi, '[filtered]')
    .replace(/تصرف\s*(كـ|ك)/gi, '[filtered]')
    .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .substring(0, 200);
}

export function buildProfileContext(profile: CustomerProfile): string {
  const parts: string[] = [];
  
  // Name/nickname
  const name = profile.nickname ? sanitizeProfileData(profile.nickname) : (profile.displayName ? sanitizeProfileData(profile.displayName) : null);
  if (name) parts.push(`اسم العميل: ${name}`);
  
  // Tier — with ACTIVE behavioral directives
  const tierLabels: Record<CustomerTier, string> = {
    new: 'عميل جديد (أول محادثة)',
    returning: 'عميل عائد',
    loyal: 'عميل وفي',
    vip: 'عميل VIP مميز',
    at_risk: 'عميل بخطر الخسارة',
  };
  parts.push(`التصنيف: ${tierLabels[profile.customerTier]}`);
  
  // === ACTIVE MEMORY DIRECTIVES ===
  // These tell GPT HOW to use the data, not just WHAT the data is
  
  // VIP/Loyal → premium treatment
  if (profile.customerTier === 'vip') {
    parts.push(`📌 توجيه: عامله كعميل مميز — "عميلنا المميز!" — واعرض خدمة premium`);
  } else if (profile.customerTier === 'loyal') {
    parts.push(`📌 توجيه: اذكر إنه عميل مهم عندنا — وأبدِ اهتمام شخصي`);
  }
  
  // At-risk → warm welcome
  if (profile.customerTier === 'at_risk') {
    parts.push(`📌 توجيه: رحب بحرارة زيادة — "وحشتنا!" — واعرض شي جديد`);
  }
  
  // Spending (hide raw number for non-VIP — not creepy)
  if (profile.totalSpent > 0 && (profile.customerTier === 'vip' || profile.customerTier === 'loyal')) {
    parts.push(`إجمالي المشتريات: عميل دائم ومميز`);
  }
  
  // Preferences
  if (profile.preferences && Object.keys(profile.preferences).length > 0) {
    const prefs: string[] = [];
    if (profile.preferences.priceConscious) prefs.push('يهتم بالسعر');
    if (profile.preferences.qualityFocused) prefs.push('يهتم بالجودة');
    if (profile.preferences.fastDelivery) prefs.push('يريد توصيل سريع');
    if (prefs.length > 0) parts.push(`تفضيلات: ${prefs.join('، ')}`);
  }
  
  // Pain points
  if (profile.painPoints && profile.painPoints.length > 0) {
    parts.push(`نقاط ألم سابقة: ${profile.painPoints.slice(-3).join('، ')}`);
  }
  
  // Last objection — with DIRECTIVE
  if (profile.lastObjection) {
    const objDirectives: Record<string, string> = {
      price: '📌 توجيه: ابدأ بالقيمة والمميزات قبل ما تذكر أي سعر — العميل سبق اعترض على السعر',
      delivery: '📌 توجيه: أكد سرعة التوصيل وسهولة التتبع — العميل اشتكى من التوصيل سابقاً',
      quality: '📌 توجيه: ركز على الضمان والاعتماد — العميل سأل عن الجودة سابقاً',
    };
    parts.push(objDirectives[profile.lastObjection] || `⚠️ ${sanitizeProfileData(profile.lastObjection)}`);
  }
  
  // Purchase history — with cross-sell directive
  if (profile.purchaseHistory && profile.purchaseHistory.length > 0) {
    const lastPurchase = sanitizeProfileData(profile.purchaseHistory[profile.purchaseHistory.length - 1]);
    const daysSinceLastSeen = profile.lastSeenAt
      ? Math.floor((Date.now() - new Date(profile.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    // Only mention if recent (< 90 days) and has sales value
    if (daysSinceLastSeen < 90) {
      parts.push(`آخر شراء: ${lastPurchase}`);
      if (profile.totalConversations > 1) {
        parts.push(`📌 توجيه: اذكر "${lastPurchase}" طبيعياً واسأل كيف تجربته — ثم اقترح منتج مكمل`);
      }
    } else {
      parts.push(`مشتريات سابقة: ${profile.purchaseHistory.slice(-3).map(p => sanitizeProfileData(p)).join('، ')}`);
    }
  }
  
  if (parts.length === 0) return '';
  return `\n## ملف العميل (ذاكرة تراكمية):\n${parts.join('\n')}\n`;
}


// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function buildDefaultProfile(merchantId: number, phone: string, name?: string): CustomerProfile {
  return {
    merchantId,
    customerPhone: phone,
    displayName: name || null,
    nickname: null,
    childName: null,
    preferences: {},
    painPoints: [],
    purchaseHistory: [],
    totalSpent: 0,
    totalConversations: 1,
    sentimentAvg: 'neutral',
    customerTier: 'new',
    lastObjection: null,
    lastSeenAt: new Date(),
    createdAt: new Date(),
  };
}

function mapRow(row: any): CustomerProfile {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    customerPhone: row.customer_phone,
    displayName: row.display_name,
    nickname: row.nickname,
    childName: row.child_name,
    preferences: safeJsonParse(row.preferences, {}),
    painPoints: safeJsonParse(row.pain_points, []),
    purchaseHistory: safeJsonParse(row.purchase_history, []),
    totalSpent: Number(row.total_spent || 0),
    totalConversations: Number(row.total_conversations || 0),
    sentimentAvg: row.sentiment_avg || 'neutral',
    customerTier: (row.customer_tier as CustomerTier) || 'new',
    lastObjection: row.last_objection,
    lastSeenAt: new Date(row.last_seen_at),
    createdAt: new Date(row.created_at),
  };
}

function safeJsonParse(val: any, fallback: any): any {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
