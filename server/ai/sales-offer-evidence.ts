import { databaseTimeEpoch } from '../db/time';
import { normalizeCampaignPhone } from '../automation/campaign-guard';

export interface SalesDiscountEvidence {
  id: number;
  merchantId: number;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderAmount: number;
  expiresAt?: string;
  checkedAt: string;
}

const integer = (v: unknown, minimum = 0): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= minimum;
const couponCodePattern = new RegExp('^[\\p{L}\\p{N}_-]{1,50}$', 'u');
const privatePhone = (v: unknown): string | null =>
  typeof v === 'string' && /^[+\d][\d ()-]*(?:@c\.us)?$/.test(v) ? normalizeCampaignPhone(v) || null : null;

/** A fresh, scoped snapshot for discussion, never a reservation or permission to apply a discount.
 * discount_codes stores fixed value/minOrderAmount in major SAR units; percentages stay percentages.
 */
export function selectSalesDiscounts(
  rows: readonly unknown[],
  input: { merchantId: number; customerPhone?: string; now?: number },
): SalesDiscountEvidence[] {
  const now = input.now ?? Date.now();
  if (!integer(input.merchantId, 1) || !Number.isFinite(new Date(now).getTime())) return [];
  const customer = privatePhone(input.customerPhone);
  const result: SalesDiscountEvidence[] = [];
  const seen = new Set<string>();
  for (const value of rows) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    // Missing projections are not evidence of unrestricted use; raw SQL must alias customer_phone.
    if (['customerPhone', 'maxUses', 'minOrderAmount', 'expiresAt'].some((field) => row[field] === undefined))
      continue;
    if (
      !integer(row.id, 1) ||
      row.merchantId !== input.merchantId ||
      (row.isActive !== 1 && row.isActive !== true)
    )
      continue;
    if (typeof row.code !== 'string' || !couponCodePattern.test(row.code)) continue;
    if (
      !['percentage', 'fixed'].includes(String(row.type)) ||
      !integer(row.value, 1) ||
      (row.type === 'percentage' && row.value > 100)
    )
      continue;
    if (
      !integer(row.usedCount) ||
      (row.maxUses != null && (!integer(row.maxUses, 1) || row.usedCount >= row.maxUses))
    )
      continue;
    const minimum = row.minOrderAmount ?? 0;
    if (!integer(minimum)) continue;
    const assigned = row.customerPhone != null && row.customerPhone !== '';
    if (assigned && (!customer || privatePhone(row.customerPhone) !== customer)) continue;
    // Keep scarce/unassigned codes out of broad AI recommendations. A specifically assigned code may be shown to its owner.
    if (!assigned && row.maxUses != null && (row.maxUses as number) <= 5) continue;
    const expiry = row.expiresAt == null ? null : databaseTimeEpoch(row.expiresAt as string | Date);
    if (expiry !== null && (!Number.isFinite(expiry) || expiry <= now)) continue;
    const code = row.code.toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    result.push({
      id: row.id,
      merchantId: input.merchantId,
      code,
      type: row.type as SalesDiscountEvidence['type'],
      value: row.value,
      minOrderAmount: minimum,
      expiresAt: expiry === null ? undefined : new Date(expiry).toISOString(),
      checkedAt: new Date(now).toISOString(),
    });
  }
  return result.slice(0, 5);
}

export function asksAboutDiscount(message: string): boolean {
  const text = message.normalize('NFKC');
  if (
    /بدون\s*(?:خصم|كوبون)|(?:لا أريد|لا اريد|ما أبي|ما ابي|مش عايز)\s*(?:خصم|كوبون)|(?:no|without)\s+(?:discount|coupon)/i.test(
      text,
    )
  )
    return false;
  return /(?:خصم|خصومات|كوبون|كود تخفيض|تخفيض|discount|coupon|promo code)/i.test(text);
}

export function salesDiscountMessage(offer: SalesDiscountEvidence): string {
  const amount = offer.type === 'percentage' ? `${offer.value}%` : `${offer.value} ر.س`;
  const minimum = offer.minOrderAmount > 0 ? `\nالحد الأدنى للطلب: ${offer.minOrderAmount} ر.س` : '';
  const expiry = offer.expiresAt
    ? `\nينتهي: ${new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(offer.expiresAt))} بتوقيت السعودية`
    : '';
  return `كود الخصم المتاح: ${offer.code}\nقيمة الخصم: ${amount}${minimum}${expiry}\nيُتحقق من صلاحية الكود وشروطه والإجمالي عند إتمام الطلب؛ مشاركة الكود لا تعني تطبيقه.`;
}

export function salesDiscountPrompt(offers: readonly SalesDiscountEvidence[]): string {
  if (!offers.length) return '';
  // Structured data prevents coupon text from introducing prompt sections or SEND_* commands.
  return (
    '\n\n## عروض مقروءة من سجل الخصومات الحالي\n' +
    JSON.stringify(offers).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') +
    '\nالمصدر discount_codes؛ value مبلغ بالريال للنوع fixed ونسبة مئوية للنوع percentage، وminOrderAmount بالريال. ' +
    'اشرح شرط الحد الأدنى وتاريخ الانتهاء عند عرض كود واحد مناسب لسؤال العميل. لا تسمّه تعويضاً أو عرضاً حصرياً أو محدوداً دون دليل. ' +
    'هذه لقطة وقت القراءة وليست حجزاً للاستخدام: لا تعد بتطبيق الكود أو تجمعه مع خصم آخر؛ التنفيذ يحتاج التحقق من الأهلية والإجمالي والموافقة في مسار الطلب.\n'
  );
}
