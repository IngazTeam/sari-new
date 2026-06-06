/**
 * Action Selector — Multi-Action Decision Engine
 * 
 * After generating a text response, determines the BEST supplementary action:
 * - Send a product link alongside the text reply
 * - Offer a discount code
 * - Schedule a follow-up reminder
 * - Escalate to the merchant
 * - Send a catalog/product list
 * - Initiate order completion
 * 
 * Uses GPT-4o-mini function-calling for intelligent decision-making.
 * Cost: ~$0.001 per decision (only called when relevant signals detected).
 */

import { callGPT4, type ChatMessage } from './openai';
import type { CustomerProfile } from '../db/customer-intelligence';
import type { CustomerIntent } from './session-context';
import {
  createOrder,
  getMerchantById,
  getMerchantPaymentSettings,
  getOrdersByCustomerPhone,
  getProductsByMerchantId,
  getTopProducts,
  incrementDiscountCodeUsage,
} from '../db';

// Rate-limit map: prevent sending discount codes too frequently to the same customer
const _discountRateLimit = new Map<string, number>();

// ═══════════════════════════════════════════════════════════════
// Action Types
// ═══════════════════════════════════════════════════════════════

export type SariAction =
  | { type: 'text_only' }
  | { type: 'send_product_link'; productName: string; productId?: number }
  | { type: 'offer_discount'; reason: string }
  | { type: 'escalate_to_merchant'; reason: string; urgency: 'low' | 'medium' | 'high' }
  | { type: 'send_catalog'; category: string }
  | { type: 'schedule_followup'; delayHours: number; reason: string }
  | { type: 'request_merchant_info'; question: string }
  | { type: 'confirm_order'; items: string[] }
  | { type: 'check_order_status' };

// ═══════════════════════════════════════════════════════════════
// Signal-Based Pre-Filter (avoid GPT call when unnecessary)
// ═══════════════════════════════════════════════════════════════

const ACTION_SIGNALS: { signal: RegExp; possibleActions: SariAction['type'][] }[] = [
  // Product inquiry → might need product link
  { signal: /كم سعر|سعر|عندكم|أبغى|أبي/i, possibleActions: ['send_product_link', 'send_catalog'] },
  // Ready to buy → order confirmation
  { signal: /أبغى اطلب|كيف أطلب|أبي آخذ|سجلني/i, possibleActions: ['confirm_order'] },
  // Price objection → discount
  { signal: /غالي|كثير|خصم|تخفيض|عرض|مافي\s*خصم|ممكن\s*أقل/i, possibleActions: ['offer_discount'] },
  // Complex question → escalation
  { signal: /مشكلة|شكوى|عيب|كسر|استرجاع/i, possibleActions: ['escalate_to_merchant'] },
  // Hesitation → follow-up
  { signal: /بفكر|أفكر|بشوف|بعدين|مو الحين/i, possibleActions: ['schedule_followup'] },
  // Order tracking → check status
  { signal: /وين طلبي|أين طلبي|حالة الطلب|وصل الطلب|تتبع|شحن/i, possibleActions: ['check_order_status'] },
];

/**
 * Quick check: does this message warrant an action analysis?
 * Returns false for simple greetings/thanks that don't need supplementary actions.
 */
function hasActionSignal(message: string): boolean {
  return ACTION_SIGNALS.some(({ signal }) => signal.test(message));
}

// ═══════════════════════════════════════════════════════════════
// Core: Select Action via GPT-4o-mini
// ═══════════════════════════════════════════════════════════════

/**
 * Decide the best supplementary action based on conversation context.
 * Called after the main response is generated — fire-and-forget.
 * 
 * @returns Action to execute, or { type: 'text_only' } if no action needed.
 */
export async function selectAction(params: {
  merchantId: number;
  customerMessage: string;
  botResponse: string;
  intent: CustomerIntent;
  profile: Partial<CustomerProfile> | null;
  availableProducts?: { name: string; id: number; price?: number }[];
  hasActiveDiscounts?: boolean;
}): Promise<SariAction> {
  const { customerMessage, botResponse, intent, profile } = params;

  // Pre-filter: skip GPT call if no relevant signals
  if (!hasActionSignal(customerMessage)) {
    return { type: 'text_only' };
  }

  // For post_purchase, only allow check_order_status
  if (intent === 'post_purchase') {
    if (/وين طلبي|أين طلبي|حالة الطلب|وصل|تتبع|شحن/i.test(customerMessage)) {
      return { type: 'check_order_status' };
    }
    return { type: 'text_only' };
  }

  try {
    const systemPrompt = `أنت محرك قرارات لبوت مبيعات. بناءً على رسالة العميل ورد البوت، قرر أفضل إجراء تكميلي.

الإجراءات المتاحة:
1. text_only — الرد النصي كافي، لا حاجة لإجراء إضافي
2. send_product_link — أرسل رابط/صورة منتج محدد ذُكر في المحادثة
3. offer_discount — اقترح عرض خصم (فقط إذا العميل اعترض على السعر بقوة)
4. escalate_to_merchant — حوّل للتاجر (فقط للمشاكل/الشكاوى الجدية)
5. send_catalog — أرسل قائمة منتجات (إذا العميل يستكشف بدون تحديد)
6. schedule_followup — جدول متابعة (إذا العميل متردد وقال بعدين)
7. request_merchant_info — اطلب معلومة من التاجر (البوت ما يعرف الجواب)
8. confirm_order — ابدأ عملية الطلب (العميل جاهز)
9. check_order_status — استعلم عن حالة طلب سابق (العميل يسأل وين طلبه)

قواعد:
- اختر text_only إذا الرد النصي كافي (هذا هو الافتراضي)
- لا تقترح خصم إلا إذا العميل اعترض بقوة على السعر
- لا تصعّد للتاجر إلا للمشاكل الحقيقية
- اختر check_order_status إذا العميل يسأل عن طلب سابق أو شحنة
- أجب بـ JSON فقط`;

    const userPrompt = `رسالة العميل: "${sanitizeActionText(customerMessage.substring(0, 200))}"
رد البوت: "${sanitizeActionText(botResponse.substring(0, 200))}"
نية العميل: ${intent}
تصنيف العميل: ${profile?.customerTier || 'new'}

اختر الإجراء المناسب بصيغة JSON:
{
  "action": "text_only",
  "reason": "سبب الاختيار",
  "details": {}
}

إذا اخترت send_product_link:
{ "action": "send_product_link", "reason": "...", "details": { "productName": "اسم المنتج" } }

إذا اخترت schedule_followup:
{ "action": "schedule_followup", "reason": "...", "details": { "delayHours": 4 } }

إذا اخترت escalate_to_merchant:
{ "action": "escalate_to_merchant", "reason": "...", "details": { "urgency": "medium" } }`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callGPT4(messages, {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 200,
      noRetry: true,
    });

    // Parse response
    const jsonStr = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return { type: 'text_only' };

    const decision = JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1));

    // Map to typed action
    return mapDecisionToAction(decision);

  } catch (err: any) {
    console.warn(`[ActionSelector] Decision failed (non-blocking): ${err.message}`);
    return { type: 'text_only' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Action Mapper — Validate and convert GPT decision to typed action
// ═══════════════════════════════════════════════════════════════

function mapDecisionToAction(decision: any): SariAction {
  if (!decision || !decision.action) return { type: 'text_only' };

  switch (decision.action) {
    case 'send_product_link':
      return {
        type: 'send_product_link',
        productName: sanitizeActionText(decision.details?.productName || 'منتج'),
      };

    case 'offer_discount':
      return {
        type: 'offer_discount',
        reason: sanitizeActionText(decision.reason || 'اعتراض على السعر'),
      };

    case 'escalate_to_merchant': {
      const validUrgency = ['low', 'medium', 'high'];
      return {
        type: 'escalate_to_merchant',
        reason: sanitizeActionText(decision.reason || 'طلب تدخل'),
        urgency: validUrgency.includes(decision.details?.urgency)
          ? decision.details.urgency : 'medium',
      };
    }

    case 'send_catalog':
      return {
        type: 'send_catalog',
        category: sanitizeActionText(decision.details?.category || 'جميع المنتجات'),
      };

    case 'schedule_followup': {
      const hours = Number(decision.details?.delayHours);
      return {
        type: 'schedule_followup',
        delayHours: (hours > 0 && hours <= 72) ? hours : 4,
        reason: sanitizeActionText(decision.reason || 'متابعة'),
      };
    }

    case 'request_merchant_info':
      return {
        type: 'request_merchant_info',
        question: sanitizeActionText(decision.details?.question || decision.reason || 'سؤال'),
      };

    case 'confirm_order':
      return {
        type: 'confirm_order',
        items: Array.isArray(decision.details?.items)
          ? decision.details.items.slice(0, 5).map((i: string) => sanitizeActionText(String(i)))
          : [],
      };

    case 'check_order_status':
      return { type: 'check_order_status' };

    default:
      return { type: 'text_only' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Sanitization
// ═══════════════════════════════════════════════════════════════

function sanitizeActionText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .substring(0, 200)
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// Action Executor — Process the selected action
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a supplementary action after the main response.
 * Called by the webhook handler — fire-and-forget.
 */
export async function executeAction(params: {
  action: SariAction;
  merchantId: number;
  customerPhone: string;
  customerName?: string;
  customerMessage?: string;
  conversationId: number;
  sendMessage: (phone: string, message: string) => Promise<void>;
}): Promise<void> {
  const { action, merchantId, customerPhone, conversationId, sendMessage } = params;

  if (action.type === 'text_only') return;

  try {
    switch (action.type) {
      case 'send_product_link': {
        // Find matching product and send details
        const products = await getTopProducts(merchantId, 50);
        const match = products.find((p: any) =>
          (p.name || '').includes(action.productName) ||
          action.productName.includes(p.name || '')
        );
        if (match) {
          const price = (match as any).price ? ` — ${(match as any).price} ر.س` : '';
          await sendMessage(customerPhone,
            `📦 *${(match as any).name}*${price}\n${(match as any).description?.substring(0, 150) || ''}`
          );
          console.log(`[ActionSelector] ✅ Sent product link: ${(match as any).name}`);
        }
        break;
      }

      case 'send_catalog': {
        // Send top 5 products from merchant's catalog
        const products = await getTopProducts(merchantId, 5);
        if (products.length > 0) {
          const lines = products.map((p: any, i: number) => {
            const price = p.price ? ` — ${p.price} ر.س` : '';
            return `${i + 1}. *${p.name}*${price}`;
          });
          const msg = `🛍️ *منتجاتنا الأكثر طلباً:*\n\n${lines.join('\n')}\n\nأي منتج يعجبك؟ أقدر أعطيك تفاصيل أكثر! 😊`;
          await sendMessage(customerPhone, msg);
          console.log(`[ActionSelector] ✅ Sent catalog (${products.length} products)`);
        }
        break;
      }

      case 'offer_discount': {
        // Rate-limit: max 1 discount per customer per hour
        const discountKey = `${merchantId}:${customerPhone}`;
        const lastSent = _discountRateLimit.get(discountKey);
        if (lastSent && Date.now() - lastSent < 3600_000) {
          console.log(`[ActionSelector] ⏳ Discount rate-limited for ${customerPhone.slice(-4)}`);
          break;
        }
        // Find active discount codes for this merchant
        try {
          const { getPool } = await import('../db');
          const pool = await getPool();
          let discountSent = false;
          if (pool) {
            const [rows] = await pool.execute(
              `SELECT id, code, type, value FROM discount_codes 
               WHERE merchantId = ? AND isActive = 1 
               AND (expiresAt IS NULL OR expiresAt > NOW())
               AND (maxUses IS NULL OR usedCount < maxUses)
               ORDER BY createdAt DESC LIMIT 1`,
              [merchantId]
            );
            const discounts = rows as any[];
            if (discounts.length > 0) {
              const d = discounts[0];
              const valueStr = d.type === 'percentage' ? `${d.value}%` : `${d.value} ر.س`;
              await sendMessage(customerPhone,
                `🎁 عندنا عرض خاص لك!\n\nاستخدم كود الخصم: *${d.code}*\nقيمة الخصم: *${valueStr}*\n\nالعرض لفترة محدودة! ⏰`
              );
              // Track discount usage + rate-limit
              await incrementDiscountCodeUsage(d.code);
              _discountRateLimit.set(discountKey, Date.now());
              discountSent = true;
              console.log(`[ActionSelector] ✅ Sent existing discount code: ${d.code}`);
            }
          }

          // ── Auto-Discount Fallback: no existing codes → generate personalized one ──
          if (!discountSent && params.customerMessage) {
            try {
              const { generateAutoDiscount } = await import('./auto-discount');
              const autoCode = await generateAutoDiscount({
                merchantId,
                customerPhone,
                customerName: params.customerName,
                customerMessage: params.customerMessage,
              });
              if (autoCode) {
                const expireDate = autoCode.expiresAt;
                const expireText = `${Math.round((expireDate.getTime() - Date.now()) / 3600_000)} ساعة`;
                await sendMessage(customerPhone,
                  `🎁 عندي عرض خاص *لك أنت*!\n\n` +
                  `كود الخصم: *${autoCode.code}*\n` +
                  `قيمة الخصم: *${autoCode.value}%*\n` +
                  `⏰ صالح لمدة ${expireText} فقط\n\n` +
                  `هذا الكود مخصص لك — استغله قبل ما ينتهي! 🔥`
                );
                _discountRateLimit.set(discountKey, Date.now());
                console.log(`[ActionSelector] ✅ Auto-generated discount: ${autoCode.code} (${autoCode.value}%)`);
              }
            } catch (autoErr: any) {
              console.warn(`[ActionSelector] Auto-discount failed: ${autoErr.message}`);
            }
          }
        } catch (discErr: any) {
          console.warn(`[ActionSelector] Discount lookup failed: ${discErr.message}`);
        }
        break;
      }

      case 'escalate_to_merchant': {
        // Trigger the real smart-escalation system
        try {
          const { handleSmartEscalation } = await import('./smart-escalation');
          await handleSmartEscalation({
            merchantId,
            conversationId,
            customerPhone,
            customerQuestion: `[تصعيد تلقائي] ${action.reason}`,
          });
          console.log(`[ActionSelector] ✅ Escalated to merchant: ${action.reason} (urgency: ${action.urgency})`);
        } catch (escErr: any) {
          console.warn(`[ActionSelector] Escalation failed: ${escErr.message}`);
        }
        break;
      }

      case 'schedule_followup': {
        // BUG-FIX: Use unified sales_followups table instead of overwriting agent_history
        try {
          const { scheduleFollowUp } = await import('./proactive-followup');
          await scheduleFollowUp({
            merchantId,
            customerPhone,
            conversationId,
            followUpType: 'action_selector',
            customDelayMs: action.delayHours * 3600 * 1000,
            customMessage: undefined, // use default template
            source: 'action_selector',
          });
          console.log(`[ActionSelector] ✅ Follow-up scheduled in ${action.delayHours}h for conv #${conversationId}`);
        } catch (fuErr: any) {
          console.warn(`[ActionSelector] Follow-up scheduling failed: ${fuErr.message}`);
        }
        break;
      }

      case 'request_merchant_info': {
        // Use smart-escalation to ask the merchant
        try {
          const { handleSmartEscalation } = await import('./smart-escalation');
          await handleSmartEscalation({
            merchantId,
            conversationId,
            customerPhone,
            customerQuestion: action.question,
          });
          console.log(`[ActionSelector] ✅ Merchant info requested: ${action.question}`);
        } catch (escErr: any) {
          console.warn(`[ActionSelector] Merchant info request failed: ${escErr.message}`);
        }
        break;
      }

      case 'confirm_order': {
        // ══════════════════════════════════════════════════════════
        // REAL ORDER CREATION — creates DB record + Tap payment
        // ══════════════════════════════════════════════════════════
        if (action.items.length === 0) break;

        try {
          // 1. Match requested items to real products (with variant support)
          const allProducts = await getProductsByMerchantId(merchantId);
          const { getVariantsByProductId } = await import('../db/products');
          const matchedItems: Array<{ productId: number; variantId?: number; name: string; price: number; quantity: number }> = [];
          let subtotal = 0;

          for (const itemName of action.items) {
            const match = allProducts.find((p: any) =>
              (p.name || '').toLowerCase().includes(itemName.toLowerCase()) ||
              itemName.toLowerCase().includes((p.name || '').toLowerCase())
            );
            if (match) {
              // Check if product has variants
              if (match.hasVariants) {
                try {
                  const variants = await getVariantsByProductId(match.id);
                  // Try to match variant name (e.g. "أزرق XL")
                  const variantMatch = variants.find((v: any) =>
                    itemName.toLowerCase().includes((v.name || '').toLowerCase()) ||
                    (v.name || '').toLowerCase().includes(itemName.toLowerCase())
                  );
                  if (variantMatch && variantMatch.isActive) {
                    matchedItems.push({
                      productId: match.id,
                      variantId: variantMatch.id,
                      name: `${match.name} - ${variantMatch.name}`,
                      price: variantMatch.price || match.price,
                      quantity: 1,
                    });
                    subtotal += variantMatch.price || match.price;
                    continue;
                  }
                } catch { /* fallback to base product */ }
              }
              // No variants or no variant match → use base product
              matchedItems.push({
                productId: match.id,
                name: match.name,
                price: match.price,
                quantity: 1,
              });
              subtotal += match.price;
            }
          }

          if (matchedItems.length === 0) {
            // No products matched — send confirmation prompt only
            const itemsList = action.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
            await sendMessage(customerPhone,
              `📋 *تأكيد الطلب*\n\nالمنتجات:\n${itemsList}\n\nتبي تأكد الطلب؟ أرسل "نعم" 🛒`
            );
            console.log(`[ActionSelector] ⚠️ No products matched — sent text confirmation only`);
            break;
          }

          // 2. Calculate VAT if enabled
          let taxAmount = 0;
          let totalAmount = subtotal;
          let taxRate = 0;
          try {
            const paySettings = await getMerchantPaymentSettings(merchantId);
            if ((paySettings as any)?.taxEnabled && (paySettings as any)?.taxRate) {
              taxRate = Math.max(0, Math.min(Number((paySettings as any).taxRate), 100)); // PEN-CC-05: clamp [0, 100]
              taxAmount = Math.round(subtotal * taxRate / 100);
              totalAmount = subtotal + taxAmount;
            }
          } catch { /* no tax */ }

          // 3. Create order in DB (enrich customer name from profile)
          let customerName = customerPhone;
          try {
            const { getOrCreateProfile } = await import('../db/customer-intelligence');
            const profile = await getOrCreateProfile(merchantId, customerPhone);
            if (profile?.displayName) customerName = profile.displayName;
          } catch { /* use phone as fallback */ }

          const order = await createOrder({
            merchantId,
            customerPhone,
            customerName,
            items: JSON.stringify(matchedItems.map(i => ({
              name: i.name,
              quantity: i.quantity,
              price: i.price,
            }))),
            totalAmount,
            status: 'pending',
          });

          if (!order) {
            throw new Error('Failed to create order in DB');
          }

          console.log(`[ActionSelector] ✅ Order #${order.id} created in DB (${matchedItems.length} items, ${totalAmount} ر.س)`);

          // 3. Try to create Tap payment link
          let paymentUrl: string | null = null;
          try {
            const paymentSettings = await getMerchantPaymentSettings(merchantId);
            if (paymentSettings?.tapEnabled && paymentSettings?.tapSecretKey) {
              const merchant = await getMerchantById(merchantId);
              const chargeData = {
                amount: totalAmount / 100, // هللات → ريال
                currency: paymentSettings.defaultCurrency || 'SAR',
                customer: {
                  first_name: customerName || 'Customer',
                  phone: {
                    country_code: '966',
                    number: customerPhone.replace(/^\+?966/, '').replace(/^0/, ''),
                  },
                },
                source: { id: 'src_all' },
                redirect: {
                  url: `${process.env.VITE_APP_URL || 'https://sari.manus.space'}/payment/callback`,
                },
                description: `طلب #${order.id} من ${merchant?.businessName || 'المتجر'}`,
                metadata: {
                  merchantId: merchantId.toString(),
                  orderId: order.id.toString(),
                  type: 'order',  // Must match tap-webhook.ts handler check
                  conversationId: conversationId.toString(), // P0-FIX: Attribution
                },
              };

              const tapResponse = await fetch('https://api.tap.company/v2/charges', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${paymentSettings.tapSecretKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(chargeData),
              });

              const tapResult = await tapResponse.json();
              if (tapResponse.ok && (tapResult.transaction?.url || tapResult.redirect?.url)) {
                paymentUrl = tapResult.transaction?.url || tapResult.redirect?.url;

                // Save payment record
                const { createOrderPayment } = await import('../db_payments');
                await createOrderPayment({
                  merchantId,
                  orderId: order.id,
                  bookingId: null,
                  customerPhone,
                  amount: totalAmount,
                  currency: paymentSettings.defaultCurrency || 'SAR',
                  tapChargeId: tapResult.id,
                  tapPaymentUrl: paymentUrl,
                  status: 'pending',
                  description: `طلب واتساب #${order.id}`,
                });

                // P0-FIX: Update deal_stage + payment_link_sent_at for pipeline tracking
                try {
                  const { getPool } = await import('../db');
                  const pool2 = await getPool();
                  if (pool2) {
                    await pool2.execute(
                      `UPDATE conversations SET deal_stage = 'payment_link_sent', payment_link_sent_at = NOW() WHERE id = ? AND merchantId = ?`,
                      [conversationId, merchantId]
                    );
                  }
                } catch { /* non-blocking */ }

                console.log(`[ActionSelector] ✅ Tap payment link created: ${paymentUrl}`);
              }
            }
          } catch (tapErr: any) {
            console.warn(`[ActionSelector] Tap payment failed (non-blocking): ${tapErr.message}`);
          }

          // 5. Send confirmation message to customer
          const itemsText = matchedItems.map((item, i) =>
            `${i + 1}. *${item.name}* — ${item.price} ر.س`
          ).join('\n');

          const taxLine = taxAmount > 0
            ? `\n🧾 *المبلغ قبل الضريبة:* ${subtotal} ر.س\n💰 *الضريبة (${taxRate}%):* ${taxAmount} ر.س\n💵 *الإجمالي:* ${totalAmount} ر.س`
            : `\n💰 *الإجمالي:* ${totalAmount} ر.س`;

          if (paymentUrl) {
            // Full order with payment link
            await sendMessage(customerPhone,
              `✅ *تم إنشاء طلبك بنجاح!*\n\n` +
              `📦 *رقم الطلب:* #${order.id}\n\n` +
              `*المنتجات:*\n${itemsText}\n` +
              taxLine + `\n\n` +
              `🔗 *لإتمام الدفع:*\n${paymentUrl}\n\n` +
              `⏰ الرابط صالح لمدة 24 ساعة\n` +
              `📱 سنرسل لك تحديثات عن حالة طلبك\n\n` +
              `شكراً لثقتك بنا! 🌟`
            );
          } else {
            // Order created but no payment link (Tap not configured)
            await sendMessage(customerPhone,
              `✅ *تم تسجيل طلبك!*\n\n` +
              `📦 *رقم الطلب:* #${order.id}\n\n` +
              `*المنتجات:*\n${itemsText}\n` +
              taxLine + `\n\n` +
              `سيتواصل معك فريقنا لإتمام الطلب والدفع 🙏`
            );
          }

          console.log(`[ActionSelector] ✅ Order #${order.id} — confirmation sent to customer (payment: ${paymentUrl ? 'Tap' : 'manual'})`);

        } catch (orderErr: any) {
          console.warn(`[ActionSelector] Order creation failed: ${orderErr.message}`);
          // Fallback: send text-only confirmation
          const itemsList = action.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
          await sendMessage(customerPhone,
            `📋 *تأكيد الطلب*\n\nالمنتجات:\n${itemsList}\n\nسيتواصل معك فريقنا لإتمام الطلب 🙏`
          );
        }
        break;
      }

      case 'check_order_status': {
        // ══════════════════════════════════════════════════════════
        // ORDER STATUS LOOKUP — find customer's recent orders
        // ══════════════════════════════════════════════════════════
        try {
          const recentOrders = await getOrdersByCustomerPhone(merchantId, customerPhone, 3);
          if (recentOrders.length === 0) {
            await sendMessage(customerPhone,
              `📦 ما لقيت طلبات مسجلة على رقمك\n\nإذا طلبت من قبل، تواصل معنا وسنساعدك 🙏`
            );
          } else {
            const statusMap: Record<string, string> = {
              pending: '⏳ قيد المعالجة',
              paid: '✅ تم الدفع',
              processing: '🔄 جاري التجهيز',
              shipped: '🚚 تم الشحن',
              delivered: '📬 تم التوصيل',
              cancelled: '❌ ملغي',
            };
            const orderLines = recentOrders.map((o: any) => {
              const status = statusMap[o.status] || o.status;
              const date = new Date(o.createdAt).toLocaleDateString('ar-SA');
              let line = `📦 *طلب #${o.id}* — ${status}\n   📅 ${date} | 💰 ${o.totalAmount} ر.س`;
              if (o.trackingNumber) line += `\n   🔗 رقم التتبع: ${o.trackingNumber}`;
              return line;
            }).join('\n\n');
            await sendMessage(customerPhone,
              `📋 *طلباتك الأخيرة:*\n\n${orderLines}\n\nتبي تفاصيل أكثر عن طلب معين؟ أرسل رقمه 📝`
            );
          }
          console.log(`[ActionSelector] ✅ Order status sent (${recentOrders.length} orders found)`);
        } catch (statusErr: any) {
          console.warn(`[ActionSelector] Order status check failed: ${statusErr.message}`);
        }
        break;
      }

      default:
        console.log(`[ActionSelector] Action ${(action as any).type} — no handler`);
    }
  } catch (err: any) {
    console.warn(`[ActionSelector] Action execution failed: ${err.message}`);
  }
}

