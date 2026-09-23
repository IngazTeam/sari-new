import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn(), conversations: vi.fn(), count: vi.fn(), conversation: vi.fn(), messages: vi.fn(),
  marginRead: vi.fn(), marginWrite: vi.fn(), marginPreview: vi.fn(), marginAudit: vi.fn(), invoiceApprove: vi.fn(), invoiceLink: vi.fn(),
  zidList: vi.fn(), zidReconcile: vi.fn(), sectorRead: vi.fn(), sectorWrite: vi.fn(), followupRead: vi.fn(), followupWrite: vi.fn(), handoffRead: vi.fn(), handoffWrite: vi.fn(), handoffSource: vi.fn(), relayList: vi.fn(), relayReview: vi.fn(), offerList: vi.fn(), offerReview: vi.fn(), discountRead: vi.fn(), discountWrite: vi.fn(), botWrite: vi.fn() }));
vi.mock('./ai/discount-policy', async original => ({ ...await original<typeof import('./ai/discount-policy')>(),
  getDiscountPolicy: mocks.discountRead, updateDiscountPolicy: mocks.discountWrite }));
vi.mock('./ai/checkout-margin-policy', async original => ({...await original<typeof import('./ai/checkout-margin-policy')>(),getMarginPolicy:mocks.marginRead,updateMarginPolicy:mocks.marginWrite}));
vi.mock('./ai/checkout-margin', async original => ({...await original<typeof import('./ai/checkout-margin')>(),previewCheckoutMargin:mocks.marginPreview,getCheckoutMarginException:mocks.marginAudit}));
vi.mock('./ai/checkout-agreements', async original => ({...await original<typeof import('./ai/checkout-agreements')>(),approveCheckoutInvoice:mocks.invoiceApprove}));
vi.mock('./payment/order-payment-link', async original => ({...await original<typeof import('./payment/order-payment-link')>(),issueCanonicalOrderPaymentLink:mocks.invoiceLink}));
vi.mock('./ai/sales-offer-review', async original => ({ ...await original<typeof import('./ai/sales-offer-review')>(),
  listSalesOfferAttempts: mocks.offerList, reviewSalesOffer: mocks.offerReview }));
vi.mock('./ai/escalation-reconciliation', async original => ({ ...await original<typeof import('./ai/escalation-reconciliation')>(),
  listEscalationRelays: mocks.relayList, reviewEscalationRelay: mocks.relayReview }));
vi.mock('./ai/conversation-handoff', async original => ({ ...await original<typeof import('./ai/conversation-handoff')>(),
  conversationHandoffSummary: mocks.handoffRead, transitionConversationOwnership: mocks.handoffWrite, conversationHandoffSource: mocks.handoffSource }));
vi.mock('./ai/followup-policy', async original => ({ ...await original<typeof import('./ai/followup-policy')>(),
  getFollowupPolicy: mocks.followupRead, updateFollowupPolicy: mocks.followupWrite }));
vi.mock('./ai/zid-checkout-reconciliation', () => ({ listZidReconciliations: mocks.zidList, reconcileZidCheckout: mocks.zidReconcile }));
vi.mock('./ai/sales-sector-settings', async original => ({ ...await original<typeof import('./ai/sales-sector-settings')>(),
  getSalesSectorSettings: mocks.sectorRead, updateSalesSectorSettings: mocks.sectorWrite }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(),
  updateBotSettings: mocks.botWrite,
  getMerchantById: mocks.merchant, getConversationsByMerchantId: mocks.conversations,
  getConversationCountByMerchantId: mocks.count, getConversationById: mocks.conversation, getMessagesByConversationId: mocks.messages,
}));
import { appRouter } from './routers';
const caller = () => appRouter.createCaller({ user: { id: 7, role: 'user' }, req: {}, res: {}, merchantId: 999 } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: 'viewer', memberId: 3 });
  mocks.merchant.mockResolvedValue({ id: 20 });
  mocks.conversations.mockResolvedValue([{ id: 4, merchantId: 20 }]);
  mocks.count.mockResolvedValue(1);
  mocks.zidList.mockResolvedValue({ items: [], nextCursor: null }); mocks.zidReconcile.mockResolvedValue({ verified: true });
  mocks.sectorRead.mockResolvedValue({ revision: 0, playbook: { id: 'general' } }); mocks.sectorWrite.mockResolvedValue({ revision: 1 });
  mocks.followupRead.mockResolvedValue({ revision: 0 }); mocks.followupWrite.mockResolvedValue({ revision: 1 });
  mocks.handoffRead.mockResolvedValue({ version: 0 }); mocks.handoffWrite.mockResolvedValue({ version: 1, changed: true });
  mocks.handoffSource.mockResolvedValue({ id: 81, text: 'fixture' });
  mocks.relayList.mockResolvedValue({items:[],nextCursor:null}); mocks.relayReview.mockResolvedValue({outcome:'unresolved'});
  mocks.offerList.mockResolvedValue({items:[],nextCursor:null}); mocks.offerReview.mockResolvedValue({outcome:'unresolved'});
  mocks.discountRead.mockResolvedValue({revision:0}); mocks.discountWrite.mockResolvedValue({revision:1}); mocks.botWrite.mockResolvedValue({});
  mocks.marginRead.mockResolvedValue({revision:0});mocks.marginWrite.mockResolvedValue({revision:1});mocks.marginPreview.mockResolvedValue({status:'pass'});
  mocks.marginAudit.mockResolvedValue(null);
  mocks.invoiceApprove.mockResolvedValue({approved:true,conversationId:4});mocks.invoiceLink.mockResolvedValue({issued:false,reason:'gateway_not_ready'});
});
describe('real app router team boundaries', () => {
  const marginPolicyInput={policy:{enabled:true,minPercent:30},expectedRevision:0,evidence:'a'.repeat(64),reviewed:true as const};
  const marginCosts={taxMinor:0,shippingCostMinor:0,otherCostMinor:0};
  const invoiceInput={orderId:10,expectedAmountMinor:10000,totalIsFinal:true as const,margin:{costs:marginCosts,evidence:'b'.repeat(64),reviewedCosts:true as const}};
  const exceptionInput={...invoiceInput,margin:{...invoiceInput.margin,exception:{reason:'Reviewed reason for this invoice only',reviewed:true as const}}};
  it.each(['owner','manager'])('derives immediate exception authority for %s from the session',async role=>{
    mocks.access.mockResolvedValue({merchantId:20,role,memberId:3});await caller().orders.approveCheckoutInvoice(exceptionInput);
    expect(mocks.invoiceApprove).toHaveBeenCalledWith({...exceptionInput,merchantId:20,actorUserId:7,authorizeMarginException:true});
  });
  it.each(['viewer','sales_supervisor'])('denies %s an invoice exception without changing the floor',async role=>{
    mocks.access.mockResolvedValue({merchantId:20,role,memberId:3});await expect(caller().orders.approveCheckoutInvoice(exceptionInput)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(mocks.invoiceApprove).not.toHaveBeenCalled();expect(mocks.invoiceLink).not.toHaveBeenCalled();expect(mocks.marginWrite).not.toHaveBeenCalled();
  });
  it.each([{authorizeMarginException:true},{merchantId:30},{actorUserId:1},
    {margin:{...exceptionInput.margin,exception:{reason:'  ',reviewed:true}}},
    {margin:{...exceptionInput.margin,exception:{...exceptionInput.margin.exception,actorUserId:1}}},
    {margin:{...exceptionInput.margin,exception:{...exceptionInput.margin.exception,reviewed:false}}},
    {margin:{...exceptionInput.margin,exception:{...exceptionInput.margin.exception,scope:'all'}}}])('rejects forged exception authority %j',async attack=>{
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
    await expect(caller().orders.approveCheckoutInvoice({...exceptionInput,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.invoiceApprove).not.toHaveBeenCalled();expect(mocks.invoiceLink).not.toHaveBeenCalled();
  });
  it('requires an active membership and permission to read the invoice exception audit',async()=>{
    await expect(caller().orders.getCheckoutMarginException({orderId:10})).rejects.toMatchObject({code:'FORBIDDEN'});
    mocks.access.mockResolvedValue({merchantId:20,role:'sales_supervisor',memberId:3});expect(await caller().orders.getCheckoutMarginException({orderId:10})).toBeNull();expect(mocks.marginAudit).toHaveBeenCalledWith(20,10);
    await expect(caller().orders.getCheckoutMarginException({orderId:10,merchantId:30} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
    mocks.marginAudit.mockRejectedValueOnce(new Error('private storage'));await expect(caller().orders.getCheckoutMarginException({orderId:10})).rejects.toMatchObject({code:'CONFLICT',message:'Invoice exception audit unavailable'});
    mocks.access.mockResolvedValue(null);await expect(caller().orders.approveCheckoutInvoice(exceptionInput)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('separates authority to set floors from authority to approve an individual invoice',async()=>{
    expect(await caller().botSettings.getMarginPolicy()).toMatchObject({canManage:false});expect(mocks.marginRead).toHaveBeenCalledWith(20);
    await expect(caller().botSettings.updateMarginPolicy(marginPolicyInput)).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(caller().orders.previewCheckoutMargin({orderId:10,costs:marginCosts})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(caller().orders.approveCheckoutInvoice(invoiceInput)).rejects.toMatchObject({code:'FORBIDDEN'});
    mocks.access.mockResolvedValue({merchantId:20,role:'sales_supervisor',memberId:3});
    await expect(caller().botSettings.updateMarginPolicy(marginPolicyInput)).rejects.toMatchObject({code:'FORBIDDEN'});
    await caller().orders.previewCheckoutMargin({orderId:10,costs:marginCosts});expect(mocks.marginPreview).toHaveBeenCalledWith({orderId:10,costs:marginCosts,merchantId:20});
    await caller().orders.approveCheckoutInvoice(invoiceInput);expect(mocks.invoiceApprove).toHaveBeenCalledWith({...invoiceInput,merchantId:20,actorUserId:7});
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});await caller().botSettings.updateMarginPolicy(marginPolicyInput);
    expect(mocks.marginWrite).toHaveBeenCalledWith({...marginPolicyInput,merchantId:20,actorUserId:7});
  });
  it.each([{merchantId:30},{actorUserId:1},{reviewed:false},{expectedRevision:-1},{evidence:'forged'},
    {policy:{enabled:true,minPercent:-1}},{policy:{enabled:true,minPercent:101}},{policy:{enabled:true,minPercent:30.5}},{policy:{enabled:true,minPercent:30,override:true}}])
    ('rejects forged margin policy %j',async attack=>{
      mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
      await expect(caller().botSettings.updateMarginPolicy({...marginPolicyInput,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.marginWrite).not.toHaveBeenCalled();
    });
  it.each([{merchantId:30},{actorUserId:1},{orderId:-1},{totalIsFinal:false},
    {margin:{...invoiceInput.margin,reviewedCosts:false}},{margin:{...invoiceInput.margin,evidence:'fake'}},
    {margin:{...invoiceInput.margin,policy:{enabled:false}}},{margin:{...invoiceInput.margin,costs:{...marginCosts,productCostMinor:0}}},
    {margin:{...invoiceInput.margin,costs:{...marginCosts,taxMinor:-1}}}])('rejects forged margin approval %j',async attack=>{
      mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
      await expect(caller().orders.approveCheckoutInvoice({...invoiceInput,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
      expect(mocks.invoiceApprove).not.toHaveBeenCalled();expect(mocks.invoiceLink).not.toHaveBeenCalled();
    });
  it.each([{merchantId:30},{orderId:-1},{costs:{...marginCosts,taxMinor:1.5}},{costs:{...marginCosts,otherCostMinor:'0'}}])('rejects forged preview %j',async attack=>{
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
    await expect(caller().orders.previewCheckoutMargin({orderId:10,costs:marginCosts,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.marginPreview).not.toHaveBeenCalled();
  });
  it('does not issue payment when margin approval fails and hides private error details',async()=>{
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});mocks.invoiceApprove.mockRejectedValueOnce(new Error('private costs'));
    const error=await caller().orders.approveCheckoutInvoice(invoiceInput).catch(e=>e);expect(error.code).toBe('CONFLICT');expect(error.message).not.toContain('private');expect(mocks.invoiceLink).not.toHaveBeenCalled();
    mocks.marginPreview.mockRejectedValueOnce(new Error('private cost'));await expect(caller().orders.previewCheckoutMargin({orderId:10,costs:marginCosts})).rejects.toMatchObject({code:'CONFLICT',message:'Invoice or cost evidence changed or unavailable'});
    mocks.marginWrite.mockRejectedValueOnce(new Error('private details'));await expect(caller().botSettings.updateMarginPolicy(marginPolicyInput)).rejects.toMatchObject({code:'CONFLICT',message:'Margin policy changed or unavailable; refresh and review again'});
    mocks.access.mockResolvedValue(null);await expect(caller().botSettings.getMarginPolicy()).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  const discountInput={policy:{enabled:true,maxPercent:3,expireHours:24},expectedRevision:0,evidence:'a'.repeat(64),reviewed:true as const};
  it('scopes discount authority and requires settings permission, independently of sales supervision',async()=>{
    expect(await caller().botSettings.getDiscountPolicy()).toMatchObject({canManage:false});expect(mocks.discountRead).toHaveBeenCalledWith(20);
    for(const role of ['viewer','sales_supervisor']) {
      mocks.access.mockResolvedValue({merchantId:20,role,memberId:3});
      await expect(caller().botSettings.updateDiscountPolicy(discountInput)).rejects.toMatchObject({code:'FORBIDDEN'});
    }
    expect(mocks.discountWrite).not.toHaveBeenCalled();
    for(const role of ['owner','manager']) {
      mocks.access.mockResolvedValue({merchantId:20,role,memberId:3});await caller().botSettings.updateDiscountPolicy(discountInput);
      expect(mocks.discountWrite).toHaveBeenLastCalledWith({...discountInput,merchantId:20,actorUserId:7});
    }
  });
  it.each([{merchantId:30},{actorUserId:1},{expectedRevision:-1},{evidence:'forged'},{reviewed:false},
    {policy:{...discountInput.policy,maxPercent:1.5}},{policy:{...discountInput.policy,maxPercent:0}},{policy:{...discountInput.policy,maxPercent:51}},
    {policy:{...discountInput.policy,expireHours:169}},{policy:{...discountInput.policy,enabled:'true'}},{policy:{...discountInput.policy,margin:10}}])
    ('rejects forged discount authority %j',async attack=>{
      mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
      await expect(caller().botSettings.updateDiscountPolicy({...discountInput,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
      expect(mocks.discountWrite).not.toHaveBeenCalled();
    });
  it.each([{autoDiscountEnabled:true},{autoDiscountMaxPercent:3},{autoDiscountExpireHours:24},{autoDiscountRevision:1},{merchantId:30}])
    ('blocks bypass of discount review through legacy update %j',async attack=>{
      mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
      await expect(caller().botSettings.update({autoReplyEnabled:true,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
      expect(mocks.botWrite).not.toHaveBeenCalled();expect(mocks.discountWrite).not.toHaveBeenCalled();
    });
  it('keeps normal bot saves including custom instructions independent of discount authority',async()=>{
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
    const payload={autoReplyEnabled:true,customInstructions:'ابدأ بفهم احتياج العميل'};
    await caller().botSettings.update(payload);expect(mocks.botWrite).toHaveBeenCalledWith(20,payload);expect(mocks.discountWrite).not.toHaveBeenCalled();
  });
  it('hides policy storage details and rejects revoked membership',async()=>{
    mocks.discountRead.mockRejectedValueOnce(new Error('private detail'));
    await expect(caller().botSettings.getDiscountPolicy()).rejects.toMatchObject({code:'CONFLICT',message:'Discount settings unavailable'});
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});mocks.discountWrite.mockRejectedValueOnce(new Error('private detail'));
    const error=await caller().botSettings.updateDiscountPolicy(discountInput).catch(e=>e);expect(error.code).toBe('CONFLICT');expect(error.message).not.toContain('private');
    mocks.access.mockResolvedValue(null);await expect(caller().botSettings.getDiscountPolicy()).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  const offerInput={conversationId:4,attemptId:'1c2e9491-2555-4fa3-a5e9-846efea99780',expectedRevision:0,evidence:'a'.repeat(64),reviewed:true as const,note:'راجعت إيصال العرض'};
  it('scopes offer records to membership, restricts review writes and records the authenticated actor',async()=>{
    expect(await caller().conversations.listSalesOfferAttempts({conversationId:4,beforeSourceId:80})).toMatchObject({canManage:false});
    expect(mocks.offerList).toHaveBeenCalledWith(20,4,80);
    await expect(caller().conversations.reviewSalesOffer(offerInput)).rejects.toMatchObject({code:'FORBIDDEN'});expect(mocks.offerReview).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});await caller().conversations.reviewSalesOffer(offerInput);
    expect(mocks.offerReview).toHaveBeenCalledWith({...offerInput,merchantId:20,actorUserId:7});
  });
  it.each([{merchantId:30},{actorUserId:1},{reviewed:false},{attemptId:'1 OR 1=1'},{conversationId:-1},{expectedRevision:-1},
    {evidence:'invented'},{note:' '},{note:'a'.repeat(1001)},{providerMessageId:'invented'},{outcome:'recorded'},{customerPhone:'966500000001'}])
    ('rejects forged offer review context %j',async attack=>{
      mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
      await expect(caller().conversations.reviewSalesOffer({...offerInput,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.offerReview).not.toHaveBeenCalled();
    });
  it.each([{merchantId:30},{beforeSourceId:-1},{beforeSourceId:'1 OR 1=1'},{conversationId:0}])('rejects forged offer list context %j',async attack=>{
    await expect(caller().conversations.listSalesOfferAttempts({conversationId:4,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mocks.offerList).not.toHaveBeenCalled();
  });
  it('hides offer storage errors and rejects revoked membership',async()=>{
    mocks.offerList.mockRejectedValueOnce(new Error('private detail'));
    await expect(caller().conversations.listSalesOfferAttempts({conversationId:4})).rejects.toMatchObject({code:'NOT_FOUND',message:'Sales offer records unavailable'});
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});mocks.offerReview.mockRejectedValueOnce(new Error('private receipt'));
    const failure=await caller().conversations.reviewSalesOffer(offerInput).catch(e=>e);expect(failure.code).toBe('CONFLICT');expect(failure.message).not.toContain('private');
    mocks.access.mockResolvedValue(null);await expect(caller().conversations.listSalesOfferAttempts({conversationId:4})).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  const relayInput={conversationId:4,relayId:5,expectedRevision:0,evidence:'a'.repeat(64),reviewed:true as const,note:'راجع السجل'};
  it('scopes relay records to membership, restricts writes, and records the authenticated reviewer',async () => {
    expect(await caller().conversations.listEscalationRelays({conversationId:4,beforeId:8})).toMatchObject({canManage:false});
    expect(mocks.relayList).toHaveBeenCalledWith(20,4,8);
    await expect(caller().conversations.reviewEscalationRelay(relayInput)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(mocks.relayReview).not.toHaveBeenCalled(); mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
    await caller().conversations.reviewEscalationRelay(relayInput);
    expect(mocks.relayReview).toHaveBeenCalledWith({...relayInput,merchantId:20,actorUserId:7});
  });
  it.each([{merchantId:30},{actorUserId:1},{reviewed:false},{relayId:-1},{conversationId:'1 OR 1=1'},
    {expectedRevision:-1},{evidence:'forged'},{note:' '},{note:'a'.repeat(1001)},{outcome:'accepted'},{providerMessageId:'invented'}])
    ('rejects forged relay review context %j',async attack => {
      mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});
      await expect(caller().conversations.reviewEscalationRelay({...relayInput,...attack} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
      expect(mocks.relayReview).not.toHaveBeenCalled();
    });
  it('does not disclose private relay storage errors or allow membership-revoked reads',async () => {
    mocks.relayList.mockRejectedValueOnce(new Error('private database detail'));
    await expect(caller().conversations.listEscalationRelays({conversationId:4})).rejects.toMatchObject({code:'NOT_FOUND',message:'Escalation records unavailable'});
    mocks.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3}); mocks.relayReview.mockRejectedValueOnce(new Error('private receipt details'));
    const error=await caller().conversations.reviewEscalationRelay(relayInput).catch(error=>error);
    expect(error.code).toBe('CONFLICT'); expect(error.message).not.toContain('private');
    mocks.access.mockResolvedValue(null); await expect(caller().conversations.listEscalationRelays({conversationId:4})).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('looks up exact evidence with membership identity and hides unavailable sources', async () => {
    expect(await caller().conversations.getHandoffSource({ conversationId: 4, messageId: 81 })).toMatchObject({ id: 81 });
    expect(mocks.handoffSource).toHaveBeenCalledWith(20, 4, 81);
    mocks.handoffSource.mockRejectedValueOnce(new Error('private source detail'));
    await expect(caller().conversations.getHandoffSource({ conversationId: 4, messageId: 82 })).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Conversation source unavailable' });
  });
  it.each([{ merchantId: 30 }, { messageId: "1 OR 1=1" }, { conversationId: -1 }])('rejects forged source lookup %j', async attack => {
    await expect(caller().conversations.getHandoffSource({ conversationId: 4, messageId: 81, ...attack } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.handoffSource).not.toHaveBeenCalled();
  });
  const handoffInput = { conversationId: 4, expectedVersion: 0, expectedLastMessageId: 81, reviewed: false, action: 'takeover' as const };
  it('scopes handoff reads to membership and allows only users with reply permission to change ownership', async () => {
    expect(await caller().conversations.getHandoff({ conversationId: 4 })).toMatchObject({ canManage: false });
    expect(mocks.handoffRead).toHaveBeenCalledWith(20, 4);
    await expect(caller().conversations.setOwnership(handoffInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.handoffWrite).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    await caller().conversations.setOwnership(handoffInput);
    expect(mocks.handoffWrite).toHaveBeenCalledWith(4, expect.objectContaining({ humanTakeover: 1 }),
      { merchantId: 20, expectedVersion: 0, expectedLastMessageId: 81, reason: 'manual' });
  });
  it.each([{ merchantId: 30 }, { actorUserId: 1 }, { expectedVersion: -1 }, { expectedLastMessageId: -1 },
    { action: 'resume', reviewed: false }, { conversationId: "1' OR 1=1" }, { action: 'force_resume' }])
    ('rejects forged ownership context and unreviewed resume %j', async attack => {
      mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
      await expect(caller().conversations.setOwnership({ ...handoffInput, ...attack } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(mocks.handoffWrite).not.toHaveBeenCalled();
    });
  it('hides foreign handoff evidence and private storage details', async () => {
    mocks.handoffRead.mockRejectedValueOnce(new Error('private tenant data'));
    await expect(caller().conversations.getHandoff({ conversationId: 80 })).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Conversation unavailable' });
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    mocks.handoffWrite.mockRejectedValueOnce(new Error('private storage error'));
    const error = await caller().conversations.setOwnership(handoffInput).catch(error => error);
    expect(error.code).toBe('CONFLICT'); expect(error.message).not.toContain('private');
  });
  const followupInput = { expectedRevision: 0, policy: { enabled: true, timeZone: 'Asia/Riyadh', startHour: 8, endHour: 23, weeklyLimit: 3 } };
  it('scopes follow-up settings to membership and requires bot settings permission for edits', async () => {
    expect(await caller().sariBrain.getFollowupPolicy()).toMatchObject({ canManage: false });
    expect(mocks.followupRead).toHaveBeenCalledWith(20);
    for (const role of ['viewer', 'sales_supervisor']) {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await expect(caller().sariBrain.updateFollowupPolicy(followupInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(mocks.followupWrite).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    await caller().sariBrain.updateFollowupPolicy(followupInput);
    expect(mocks.followupWrite).toHaveBeenCalledWith({ ...followupInput, merchantId: 20, actorUserId: 7 });
  });
  it.each([{ merchantId: 30 }, { actorUserId: 1 }, { expectedRevision: -1 },
    { policy: { ...followupInput.policy, weeklyLimit: 999 } }, { policy: { ...followupInput.policy, timeZone: "UTC'; DROP TABLE merchants; --" } },
    { policy: { ...followupInput.policy, enabled: 'true' } }, { policy: { ...followupInput.policy, extra: 'forged' } }])
    ('rejects follow-up identity substitution and unsafe policy payloads %j', async attack => {
      mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
      await expect(caller().sariBrain.updateFollowupPolicy({ ...followupInput, ...attack } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(mocks.followupWrite).not.toHaveBeenCalled();
    });
  it('returns a safe follow-up conflict without leaking storage errors', async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    mocks.followupWrite.mockRejectedValueOnce(new Error('private fixture connection details'));
    const error = await caller().sariBrain.updateFollowupPolicy(followupInput).catch(error => error);
    expect(error.code).toBe('CONFLICT'); expect(error.message).not.toContain('private fixture');
  });
  it('scopes reconciliation reads to membership and forbids viewer writes', async () => {
    expect(await caller().orders.listZidReconciliations()).toMatchObject({ canManage: false });
    expect(mocks.zidList).toHaveBeenCalledWith(20, undefined);
    await expect(caller().orders.reconcileZidCheckout({ quotationId: 1, orderId: 2, reviewed: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.zidReconcile).not.toHaveBeenCalled();
  });
  it('attributes reconciliation to the authenticated actor and rejects identity injection', async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    const input = { quotationId: 1, orderId: 2, reviewed: true as const };
    await caller().orders.reconcileZidCheckout(input);
    expect(mocks.zidReconcile).toHaveBeenCalledWith({ ...input, merchantId: 20, actorUserId: 7 });
    for (const attack of [{ merchantId: 30 }, { actorUserId: 1 }, { reviewed: false }, { orderId: -1 }, { orderId: "1' OR 1=1" }]) {
      await expect(caller().orders.reconcileZidCheckout({ ...input, ...attack } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(mocks.zidReconcile).toHaveBeenCalledTimes(1);
  });
  it('requires bot settings permission for sales guide changes, independently of order permissions', async () => {
    expect(await caller().sariBrain.getSalesSector()).toMatchObject({ canManage: false });
    for (const role of ['viewer', 'sales_supervisor']) {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await expect(caller().sariBrain.updateSalesSector({ playbookId: 'training', expectedRevision: 0 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(mocks.sectorWrite).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 });
    await caller().sariBrain.updateSalesSector({ playbookId: 'training', expectedRevision: 0 });
    expect(mocks.sectorWrite).toHaveBeenCalledWith({ merchantId: 20, actorUserId: 7, playbookId: 'training', expectedRevision: 0 });
  });
  it('uses active membership for conversation reads and ignores a forged context tenant', async () => {
    const result = await caller().conversations.list();
    expect(result.items).toHaveLength(1);
    expect(mocks.merchant).toHaveBeenCalledWith(20);
    expect(mocks.conversations).toHaveBeenCalledWith(20, expect.any(Object));
  });
  it('does not expose foreign conversation messages', async () => {
    mocks.conversation.mockResolvedValue({ id: 80, merchantId: 30 });
    await expect(caller().conversations.getMessages({ conversationId: 80 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.messages).not.toHaveBeenCalled();
  });
  it('blocks viewer sends, sync and order mutations before handlers run', async () => {
    await expect(caller().conversations.sendReply({ conversationId: 4, message: 'forged' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().conversations.syncFromWhatsApp()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().orders.cancel({ orderId: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().orders.updateStatus({ orderId: 1, status: 'paid' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it('fails closed after membership revocation or identity database failure', async () => {
    mocks.access.mockResolvedValue(null);
    await expect(caller().orders.listByMerchant()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.access.mockRejectedValue(new Error('fixture connection failure'));
    await expect(caller().conversations.list()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it('blocks viewer payment configuration in the mounted router', async () => {
    await expect(caller().merchantPayments.getSettings()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller().merchantPayments.testConnection()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it.each(['manager', 'viewer'])('refuses analytics tenant substitution by a %s', async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
    mocks.merchant.mockResolvedValue({ id: 30 });
    await expect(caller().analytics.getDashboardKPIs({ merchantId: 30, startDate: '2026-09-01', endDate: '2026-09-19' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
