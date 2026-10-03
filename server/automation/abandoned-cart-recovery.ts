/** Legacy ingestion helpers. Sending requires an explicit reviewed tenant request. */
import {createAbandonedCart,getAbandonedCartsByMerchantId} from '../db';

export async function trackAbandonedCart(
  merchantId: number,
  customerPhone: string,
  customerName: string | null,
  items: Array<{ productId: number; productName: string; quantity: number; price: number }>,
  totalAmount: number
): Promise<number> {
  // التحقق من وجود سلة مهجورة سابقة لنفس العميل
  const existingCarts = await getAbandonedCartsByMerchantId(merchantId);
  const existingCart = existingCarts.find(
    cart => cart.customerPhone === customerPhone && !cart.recovered && !cart.reminderSent
  );

  if (existingCart) {
    // إرجاع ID السلة الموجودة
    return existingCart.id;
  }

  // إنشاء سلة مهجورة جديدة
  const cart = await createAbandonedCart({
    merchantId,
    customerPhone,
    customerName,
    items: JSON.stringify(items),
    totalAmount,
    reminderSent: 0,
    recovered: 0
  });

  return cart!.id;
}


const reviewRequired=():never=>{throw new Error('abandoned_cart:review_required');};
/** Compatibility tombstones: never create a discount, message, or misleading sales total. */
export async function generateRecoveryDiscount(_merchantId:number,_customerPhone:string):Promise<string>{return reviewRequired();}
export function generateReminderMessage(_customerName:string|null,_items:Array<{productName:string;quantity:number;price:number}>,_totalAmount:number,_discountCode:string):string{return reviewRequired();}
export async function sendCartReminder(_cartId:number):Promise<boolean>{return reviewRequired();}
export async function getCartRecoveryStats(_merchantId:number):Promise<never>{return reviewRequired();}
export async function checkAbandonedCarts(){return {status:'review_required' as const,checked:0,reminded:0,errors:0};}

export function isProductSelectionMessage(message: string): boolean {
  const keywords = [
    'أريد',
    'أبي',
    'أبغى',
    'عندك',
    'عندكم',
    'كم سعر',
    'بكم',
    'متوفر',
    'موجود'
  ];

  return keywords.some(keyword => message.includes(keyword));
}