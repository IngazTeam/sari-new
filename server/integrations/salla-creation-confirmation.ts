import { createHash } from 'node:crypto';
import { z } from 'zod';
import { formatMinorMoney } from '../../shared/product-money';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key,entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}';
  return JSON.stringify(value);
}
const text = (max:number) => z.string().max(max);
const orderTerms = z.object({
  id:z.number().int().positive(), merchantId:z.number().int().positive(),
  sallaOrderId:text(100), orderNumber:text(100), customerPhone:text(50), customerName:text(255),
  address:text(4000), city:text(100).nullish().transform(v=>v??null),
  items:z.string().max(64000).transform(v=>JSON.parse(v)),
  totalAmount:z.number().int().nonnegative().max(2147483647), currency:z.literal('SAR'),
  paymentUrl:text(2048).nullish().transform(v=>v??null), isGift:z.union([z.literal(0),z.literal(1)]),
  giftRecipientName:text(255).nullish().transform(v=>v??null), giftMessage:text(4000).nullish().transform(v=>v??null),
  discountCode:text(50).nullish().transform(v=>v??null),
});
/** Bind accepted terms without copying customer data into the operation ledger.
 * Status is deliberately excluded: legitimate fulfilment updates are not edits
 * to the accepted order. This is integrity evidence, not a database signature. */
export function sallaConfirmationSeal(raw: unknown) {
  const terms = orderTerms.parse(raw);
  return {version:1 as const,sha256:createHash('sha256').update(canonical(terms)).digest('hex')};
}
export function assertSallaConfirmationSeal(raw:unknown,proof:unknown) {
  const saved=z.object({version:z.literal(1),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(proof);
  if(saved.sha256!==sallaConfirmationSeal(raw).sha256)throw Error('Salla confirmation terms changed');
}
const displayText=(value:string)=>value.replace(/[\r\n\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/[*_`]/g,'').trim();
const displayField=(max:number)=>text(max).transform(displayText).refine(v=>v.length>0);
const line=z.object({name:displayField(255),quantity:z.number().int().min(1).max(10000)});
function checkedLink(raw:string) {
  if(!raw)return '';
  const value=z.string().max(2048).parse(raw),url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Invalid Salla confirmation link');
  return url.href;
}
/** Catalogue unit prices/discount guesses are not invoice line amounts. Only
 * the verified provider total is shown; recording COD never implies payment. */
export function formatSallaCreationConfirmation(orderNumber:string,items:unknown,totalAmount:number,paymentUrl:string,giftRecipientName?:string) {
  const lines=z.array(line).min(1).max(100).parse(items),number=displayField(100).parse(orderNumber);
  const gift=giftRecipientName===undefined?null:displayField(255).parse(giftRecipientName);
  const link=checkedLink(paymentUrl);
  return [`${gift?'🎁':'✅'} تم تسجيل ${gift?'طلب الهدية':'طلبك'} في سلة #${number}.`,
    gift?`اسم مستلم الهدية المسجل: ${gift}.`:'', '', ...lines.map(item=>`• ${item.name} × ${item.quantity}`), '',
    `إجمالي فاتورة سلة عند إنشاء الطلب: ${formatMinorMoney(totalAmount)}.`,
    'طريقة الطلب المسجلة: الدفع عند الاستلام. تسجيل الطلب لا يُثبت سداد المبلغ.',
    link?`رابط المتجر لمراجعة الفاتورة وحالة الطلب:\n${link}`:'لم يتوفر رابط للمتجر؛ راجع الفاتورة وحالة الطلب معه.',
  ].filter((value,index,array)=>value!==''||index>0&&array[index-1]!=='').join('\n');
}
