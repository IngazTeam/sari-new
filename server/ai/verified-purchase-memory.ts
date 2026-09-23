import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { classifyTier } from '../db/customer-intelligence';

/** Runs INSIDE the payment transaction. The canonical payment is the only authority.
 * This is a derived customer-memory projection, not a second financial ledger.
 * An event with no verified conversation link updates purchase history without attributing a sales strategy.
 */
export async function projectTapPurchaseMemory(connection: PoolConnection, input: {
  merchantId: number; paymentId: number; conversationId?: number;
}): Promise<void> {
  const [payments] = await connection.execute<RowDataPacket[]>(`SELECT p.id, p.status,
    COALESCE(o.customerPhone, b.customer_phone) AS customer_phone,
    COALESCE(o.customerName, b.customer_name) AS customer_name
    FROM order_payments p
    LEFT JOIN orders o ON o.id = p.order_id AND o.merchantId = p.merchant_id
    LEFT JOIN bookings b ON b.id = p.booking_id AND b.merchant_id = p.merchant_id
    WHERE p.id = ? AND p.merchant_id = ? AND p.status IN ('captured', 'refunded')`, [input.paymentId, input.merchantId]);
  const payment = payments[0];
  if (!payment?.customer_phone) throw new Error('Verified purchase owner unavailable');
  const phone = String(payment.customer_phone);
  const [counts] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) AS count FROM conversations WHERE merchantId = ? AND customerPhone = ?', [input.merchantId, phone]);
  await connection.execute(`INSERT INTO customer_profiles (merchant_id, customer_phone, display_name, total_conversations)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(customer_profiles.id)`,
  [input.merchantId, phone, payment.customer_name || null, Number(counts[0].count)]);
  // Lock the customer projection so concurrent payments for different orders cannot lose an update.
  const [profiles] = await connection.execute<RowDataPacket[]>(`SELECT id, purchase_history, total_spent, preferences,
    verified_purchase_count FROM customer_profiles WHERE merchant_id = ? AND customer_phone = ? FOR UPDATE`, [input.merchantId, phone]);
  const profile = profiles[0];
  if (!profile) throw new Error('Verified purchase profile unavailable');
  const outcome = payment.status === 'captured' ? 'purchase_completed' : 'purchase_refunded';
  const [existingEvents] = await connection.execute<RowDataPacket[]>(`SELECT id FROM ai_purchase_outcomes
    WHERE merchant_id = ? AND payment_id = ? AND outcome_type = ?`, [input.merchantId, payment.id, outcome]);
  if (existingEvents.length) return;

  let conversationId: number | null = null;
  if (input.conversationId) {
    const [conversations] = await connection.execute<RowDataPacket[]>(`SELECT id FROM conversations
      WHERE id = ? AND merchantId = ? AND customerPhone = ?`, [input.conversationId, input.merchantId, phone]);
    // Wrong/legacy metadata must never write another customer's memory or attribute a win.
    conversationId = conversations[0]?.id || null;
  }
  const [event] = await connection.execute<any>(`INSERT INTO ai_purchase_outcomes
    (merchant_id, profile_id, payment_id, conversation_id, outcome_type)
    VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(ai_purchase_outcomes.id)`,
  [input.merchantId, profile.id, payment.id, conversationId, outcome]);

  const [purchases] = await connection.execute<RowDataPacket[]>(`SELECT p.id, p.amount, p.currency,
    o.items, s.name AS service_name FROM order_payments p
    LEFT JOIN orders o ON o.id = p.order_id AND o.merchantId = p.merchant_id
    LEFT JOIN bookings b ON b.id = p.booking_id AND b.merchant_id = p.merchant_id
    LEFT JOIN services s ON s.id = b.service_id AND s.merchant_id = b.merchant_id
    WHERE p.merchant_id = ? AND p.status = 'captured'
      AND COALESCE(o.customerPhone, b.customer_phone) = ? ORDER BY p.id`, [input.merchantId, phone]);
  const totals: Record<string, number> = {};
  const names: string[] = [];
  for (const purchase of purchases) {
    const amount = Number(purchase.amount);
    const currency = String(purchase.currency);
    if (!Number.isSafeInteger(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid canonical purchase money');
    totals[currency] = (totals[currency] || 0) + amount;
    if (!Number.isSafeInteger(totals[currency])) throw new Error('Purchase aggregation overflow');
    let items: unknown;
    try { items = typeof purchase.items === 'string' ? JSON.parse(purchase.items) : purchase.items; } catch { items = []; }
    if (Array.isArray(items)) {
      for (const item of items) if (typeof item?.name === 'string') names.push(item.name.slice(0, 200));
    } else if (purchase.service_name) names.push(String(purchase.service_name).slice(0, 200));
  }
  let preferences: Record<string, unknown> = {};
  try { preferences = typeof profile.preferences === 'string' ? JSON.parse(profile.preferences) : profile.preferences || {}; } catch { /* preserve empty */ }
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
  if (!profile.verified_purchase_count && !preferences._legacyPurchaseMemory && (Number(profile.total_spent) || profile.purchase_history)) {
    // Retain previously unverified values for review instead of silently losing them.
    preferences._legacyPurchaseMemory = { history: profile.purchase_history, totalSpent: profile.total_spent };
  }
  preferences._purchaseMemory = { source: 'canonical_tap_payments', lastOutcomeId: event.insertId,
    currencyTotalsUnit: 'minor', includesRefunds: true };
  // The legacy scalar is SAR only. Different currencies stay separate, never added together.
  const sarMajor = (totals.SAR || 0) / 100;
  await connection.execute(`UPDATE customer_profiles SET purchase_history = ?, verified_purchase_count = ?,
    verified_spend_by_currency = ?, total_spent = ?, customer_tier = ?, preferences = ?, memory_version = memory_version + 1
    WHERE id = ? AND merchant_id = ?`, [JSON.stringify(names.slice(-10)), purchases.length, JSON.stringify(totals),
    sarMajor.toFixed(2), classifyTier(purchases.length, sarMajor), JSON.stringify(preferences), profile.id, input.merchantId]);

  if (conversationId) {
    await connection.execute(`INSERT INTO sari_learning_signals
      (merchant_id, conversation_id, signal_type, signal_weight, context_summary, source_key)
      VALUES (?, ?, ?, 1.00, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(sari_learning_signals.id)`,
    [input.merchantId, conversationId, outcome,
      JSON.stringify({ schemaVersion: 1, source: 'tap', paymentId: payment.id, outcome, attribution: 'verified_payment_only' }),
      `tap:${payment.id}:${outcome}`]);
    if (payment.status === 'captured') {
      await connection.execute("UPDATE conversations SET deal_stage = 'paid' WHERE id = ? AND merchantId = ?", [conversationId, input.merchantId]);
      await connection.execute(`UPDATE sales_followups SET cancelled_at = NOW(), cancel_reason = 'purchase_completed'
        WHERE merchant_id = ? AND conversation_id = ? AND sent_at IS NULL AND cancelled_at IS NULL`, [input.merchantId, conversationId]);
    }
  }
}
