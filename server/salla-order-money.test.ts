import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), create: vi.fn(), product: vi.fn(), products: vi.fn(), link: vi.fn(), notify: vi.fn(), llm: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => ({ post: m.post, get: m.get }) } }));
vi.mock('./db', () => ({
  createOrder: m.create, getProductById: m.product, getProductsByMerchantId: m.products,
  getSallaConnectionByMerchantId: vi.fn().mockResolvedValue({accessToken:'test-only'}),
  getMerchantById: vi.fn().mockResolvedValue(null), getUserById: vi.fn(),
  getReferralCodeByCode: vi.fn(), incrementDiscountCodeUsage: vi.fn(),
}));
vi.mock('./_core/llm', () => ({ invokeLLM: m.llm }));
vi.mock('./automation/discount-system', () => ({ extractDiscountCodeFromMessage: vi.fn(), validateDiscountCode: vi.fn() }));
vi.mock('./automation/referral-system', () => ({ extractReferralCodeFromMessage: vi.fn(), trackReferral: vi.fn() }));
vi.mock('./payment/order-payment-link', () => ({ issueCanonicalOrderPaymentLink: m.link }));
vi.mock('./_core/emailNotifications', () => ({ notifyNewOrder: m.notify }));
import { SallaIntegration } from './integrations/salla';
import { createOrderFromChat, parseOrderMessage, generateOrderConfirmationMessage } from './automation/order-from-chat';
import { withInboundExecution, type InboundExecution } from './messaging/inbound-context';
import { formatMinorMoney } from '../shared/product-money';
const shipTo = {country: 1, city: 2, address_line:'Fixture', street_number:'12', block:'Test', short_address:'ABCD1234', building_number:'1234', additional_number:'5678', postal_code:'12345', geo_coordinates:{lat:24,lng:46}};
const data = () => ({customerName:'Test Customer', phone:'966500000009', address:'Fixture', shipTo, items:[{sallaProductId:'123',price:9999,quantity:2}]});
const parsed = () => ({shipTo, products:[{name:'Sample',productId:4,quantity:2}]});
const execution = (): InboundExecution => ({id:1,merchantId:7,instanceId:1,token:'test',eventKey:'e',partitionKey:'p',sendOrdinal:0,assertOwned:vi.fn().mockResolvedValue(undefined)});
beforeEach(() => {
  vi.clearAllMocks();
  m.post.mockResolvedValue({data:{success:true,data:{id:123,reference_id:456,currency:'SAR',amounts:{total:{amount:229.98,currency:'SAR'}},urls:{checkout:'https://fixture.salla.sa/checkout/test'}}}});
  m.product.mockResolvedValue({id:4,merchantId:7,name:'Sample',price:9999,priceUnit:'minor',currency:'SAR',sallaProductId:'123',isActive:1,trackInventory:1,stock:5});
  m.create.mockResolvedValue({id:55,orderNumber:'456'});
  m.notify.mockResolvedValue(undefined);
});
describe('Salla order transport and monetary authority', () => {
  it('uses the documented product identifiers, national address and pending payment contract', async () => {
    const result = await new SallaIntegration(7,'test-only').createOrder({...data(),discountCode:'TEST'});
    expect(m.post).toHaveBeenCalledTimes(1);
    const body=m.post.mock.calls[0][1];
    expect(body).toMatchObject({products:[{identifier_type:'id',identifier:'123',quantity:2}],ship_to:shipTo,payment:{status:'pending',method:'cod'},coupon:'TEST'});
    expect(body).not.toHaveProperty('items');
    expect(body).not.toHaveProperty('shipping');
    expect(body.products[0]).not.toHaveProperty('price');
    expect(result).toMatchObject({amountMinor:22998,currency:'SAR',orderId:'123',orderNumber:'456'});
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each([undefined, {city:2}])('rejects an incomplete national address before the provider call', async shipTo => {
    await expect(new SallaIntegration(7,'test-only').createOrder({...data(),shipTo} as any)).rejects.toThrow();
    expect(m.post).not.toHaveBeenCalled();
  });
  it.each([{price:99.99},{quantity:0},{quantity:1.5},{sallaProductId:'byaan:123'}])('rejects invalid items before a provider effect: %j', async patch => {
    const input=data(); Object.assign(input.items[0],patch);
    await expect(new SallaIntegration(7,'test-only').createOrder(input)).rejects.toThrow();
    expect(m.post).not.toHaveBeenCalled();
  });
  it('saves one local order with the provider total including tax/shipping, without a second Tap collection', async () => {
    await expect(createOrderFromChat(7,'966500000009','Test',parsed())).resolves.toMatchObject({orderId:55});
    expect(m.post).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create.mock.calls[0][0]).toMatchObject({merchantId:7,sallaOrderId:'123',totalAmount:22998});
    expect(m.link).not.toHaveBeenCalled();
  });
  it.each([{merchantId:8},{priceUnit:'unverified'},{currency:'USD'},{stock:1}])('rejects foreign, uncertain, unsupported or unavailable products: %j', async patch => {
    m.product.mockResolvedValue({...await m.product(),...patch});
    expect(await createOrderFromChat(7,'966500000009','Test',parsed())).toBeNull();
    expect(m.post).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it('does not register a partial order', async () => {
    const input=parsed(); input.products.push({name:'Missing',quantity:1} as any);
    expect(await createOrderFromChat(7,'966500000009','Test',input)).toBeNull();
    expect(m.post).not.toHaveBeenCalled();
  });
  it.each([undefined,{amount:'1.001',currency:'SAR'},{amount:100,currency:'USD'}])('parks an ambiguous provider acceptance rather than pretending it failed safely: %j', async total => {
    m.post.mockResolvedValue({data:{success:true,data:{id:123,reference_id:456,amounts:{total}}}});
    const ctx=execution();
    await expect(withInboundExecution(ctx,()=>createOrderFromChat(7,'966500000009','Test',parsed()))).rejects.toThrow();
    expect(ctx.uncertainEffect).toBe(true); expect(m.post).toHaveBeenCalledTimes(1); expect(m.create).not.toHaveBeenCalled();
  });
  it('parks a lost local INSERT acknowledgement without reissuing the provider request', async () => {
    m.create.mockRejectedValue(new Error('commit acknowledgement lost')); const ctx=execution();
    await expect(withInboundExecution(ctx,()=>createOrderFromChat(7,'966500000009','Test',parsed()))).rejects.toThrow('acknowledgement lost');
    expect(ctx.uncertainEffect).toBe(true); expect(m.post).toHaveBeenCalledTimes(1);
  });
  it.each([{id:{}},{urls:{checkout:'javascript:alert(1)'}},{urls:{checkout:'https://user:pass@example.test/pay'}},{currency:'USD'}])('rejects malformed identities, unsafe checkout URLs and conflicting currencies: %j', async patch => {
    m.post.mockResolvedValue({data:{success:true,data:{id:123,reference_id:456,currency:'SAR',amounts:{total:{amount:99.99,currency:'SAR'}},...patch}}});
    const ctx=execution();
    await expect(withInboundExecution(ctx,()=>createOrderFromChat(7,'966500000009','Test',parsed()))).rejects.toThrow();
    expect(ctx.uncertainEffect).toBe(true); expect(m.create).not.toHaveBeenCalled();
  });
  it('requires a unique parsed product match and never substitutes the first candidate', async () => {
    m.products.mockResolvedValue([{id:1,name:'Sample A',price:100,priceUnit:'minor',currency:'SAR',isActive:1,trackInventory:0},{id:2,name:'Sample B',price:200,priceUnit:'minor',currency:'SAR',isActive:1,trackInventory:0}]);
    m.llm.mockResolvedValue({choices:[{message:{content:JSON.stringify({products:[{name:'Sample',quantity:1}]})}}]});
    expect((await parseOrderMessage('fixture',7))?.products[0].productId).toBeUndefined();
  });
  it('formats a confirmation from minor units and does not invent a missing checkout link', () => {
    const text=generateOrderConfirmationMessage('456',[{name:'Sample',price:9999,quantity:2}],22998,'');
    expect(text).toContain(formatMinorMoney(19998)); expect(text).toContain(formatMinorMoney(22998));
    expect(text).toContain('لم يتوفر رابط دفع'); expect(text).not.toContain('22998 ريال');
  });
});
