import type { z } from 'zod';
import { sallaCheckoutEvidenceInput,sallaCheckoutEvidenceOutput,type sallaCheckoutCartListItem } from '@shared/salla-checkout-evidence';

export function checkoutReviewInput(requestId:string,order:string,transaction:string) {
  const normalize=(value:string)=>value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
  return sallaCheckoutEvidenceInput.safeParse({requestId,orderId:normalize(order),transactionId:normalize(transaction)||undefined});
}
export function checkoutReviewResult(raw:unknown,input:z.infer<typeof sallaCheckoutEvidenceInput>,item:z.infer<typeof sallaCheckoutCartListItem>) {
  const result=sallaCheckoutEvidenceOutput.parse(raw);
  if(!item.cart||input.requestId!==item.requestId||result.requestId!==input.requestId||result.order.orderId!==input.orderId
    ||(result.transaction?.transactionId??undefined)!==input.transactionId||result.cart.cartId!==item.cart.cartId
    ||result.cart.preparedTotalMinor!==item.cart.preparedTotalMinor||result.cart.currency!==item.cart.currency)throw Error('Checkout evidence changed');
  return result;
}
