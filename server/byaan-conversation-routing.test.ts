import {beforeEach,describe,expect,it,vi} from 'vitest';
import {isByaanEnrollmentRequest,isByaanEnrollmentEdit,byaanCourseSelection} from './ai/byaan-enrollment-conversation';
const calls=vi.hoisted(()=>({memory:vi.fn(),budget:vi.fn(),byaan:vi.fn(),salla:vi.fn(),reminder:vi.fn(),understand:vi.fn(),escalate:vi.fn(),quick:vi.fn(),loyalty:vi.fn(),incrementQuick:vi.fn()}));
vi.mock('./ai/smart-escalation',()=>({handleSmartEscalation:calls.escalate}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(),
  getMerchantById:vi.fn(async()=>({businessName:'متجر الاختبار'})),getDb:vi.fn(async()=>null),
  getMessagesByConversationId:vi.fn(async()=>[]),getOrCreatePersonalitySettings:vi.fn(async()=>({})),
  getBotSettings:vi.fn(async()=>({})),findMatchingQuickResponse:calls.quick,incrementQuickResponseUse:calls.incrementQuick}));
vi.mock('./loyalty-integration',()=>({getCustomerLoyaltyInfo:calls.loyalty}));
vi.mock('./ai/requested-followup',()=>({handleRequestedFollowup:vi.fn(async()=>null)}));
vi.mock('./ai/conversation-handoff',()=>({conversationHandoffSummary:vi.fn(async()=>null),handoffPrompt:vi.fn(()=> '')}));
vi.mock('./ai/conversation-understanding',async original=>({...await original<typeof import('./ai/conversation-understanding')>(),understandConversation:calls.understand}));
vi.mock('./ai/customer-memory',async original=>({...await original<typeof import('./ai/customer-memory')>(),captureDirectCustomerMemory:calls.memory}));
vi.mock('./ai/budget-ledger',()=>({getAiBudgetStatus:calls.budget}));
vi.mock('./appointment-reminders',()=>({handleAppointmentReminder:calls.reminder}));
vi.mock('./ai/byaan-checkout-conversation',()=>({handleByaanCheckout:calls.byaan}));
vi.mock('./ai/salla-checkout-conversation',()=>({handleSallaCheckout:calls.salla}));
vi.mock('./ai/zahypi-client',async original=>({...await original<typeof import('./ai/zahypi-client')>(),runWithZahyPiContext:async(_:unknown,run:()=>Promise<unknown>)=>run()}));
import {chatWithSari} from './ai/sari-personality';
import {UNVERIFIED_ACTION_FALLBACK} from './ai/transactional-truth';

describe('Byaan intent and private conversation routing',()=>{
  beforeEach(()=>{vi.clearAllMocks();calls.memory.mockResolvedValue({reply:null,forgetBeforeMessageId:7});calls.budget.mockResolvedValue({exceeded:false});calls.reminder.mockResolvedValue(null);calls.byaan.mockResolvedValue('دورة ساري [BE-12]');calls.salla.mockResolvedValue('salla fallback');calls.understand.mockImplementation(async input=>({...input,analysis:{intent:'ready_to_buy',confidence:1}}));});
  const input={merchantId:17,conversationId:23,incomingMessageId:40,customerPhone:'966500000087',message:'سجلني في دورة ساري'};
  it('preserves the transactional truth guard for legacy group quick replies',async()=>{
    calls.quick.mockResolvedValue({id:1,response:'تم إنشاء الطلب بنجاح'});
    expect(await chatWithSari({...input,isGroupMessage:true})).toBe(UNVERIFIED_ACTION_FALLBACK);
    expect(calls.incrementQuick).not.toHaveBeenCalled();
  });
  it('keeps legacy quick-reply usage failures non-blocking after the truth guard',async()=>{
    calls.quick.mockResolvedValue({id:1,response:'هذه معلومات النشاط العامة'});
    calls.incrementQuick.mockRejectedValueOnce(Error('synthetic metric outage'));
    expect(await chatWithSari({...input,isGroupMessage:true})).toBe('هذه معلومات النشاط العامة');
    expect(calls.incrementQuick).toHaveBeenCalledWith(1);
  });
  it('does not replace an interpreted private request with a keyword quick reply or generic off-topic response',async()=>{
    const message='في فئة عاصمة المكافآت، كم المتبقي لي؟';
    calls.understand.mockResolvedValue({...input,message,analysis:{action:'respond',nextStep:'answer',confidence:0.96,requestKind:'loyalty_balance'}});
    calls.byaan.mockResolvedValue(null);calls.salla.mockResolvedValue(null);
    calls.quick.mockResolvedValue({id:1,response:'رد تلقائي غير مرتبط بالسياق'});
    calls.loyalty.mockResolvedValue('رصيدك الموثق 25 نقطة');
    expect(await chatWithSari({...input,message})).toBe('رصيدك الموثق 25 نقطة');
    expect(calls.quick).not.toHaveBeenCalled();expect(calls.loyalty).toHaveBeenCalledWith(17,input.customerPhone);
  });
  it('routes a contextual human request to the durable escalation before any sales adapter',async()=>{
    calls.understand.mockResolvedValue({...input,analysis:{action:'request_human',nextStep:'handoff',confidence:0.97,ambiguous:false,conditional:false}});
    calls.escalate.mockResolvedValue({message:'طلبك مسجل للفريق',escalationId:null,notified:false});
    expect(await chatWithSari(input)).toBe('طلبك مسجل للفريق');
    expect(calls.escalate).toHaveBeenCalledWith(expect.objectContaining({merchantId:17,conversationId:23,incomingMessageId:40,customerQuestion:input.message}));
    expect(calls.byaan).not.toHaveBeenCalled();expect(calls.salla).not.toHaveBeenCalled();
  });
  it.each([{ambiguous:true},{conditional:true},{confidence:0.4}])('does not turn an uncertain analysis into a staff notification: %j',async change=>{
    calls.understand.mockResolvedValue({...input,analysis:{action:'request_human',nextStep:'handoff',confidence:0.97,ambiguous:false,conditional:false,...change}});
    await chatWithSari(input); expect(calls.escalate).not.toHaveBeenCalled();
  });
  it('requires contextual understanding before every business route, with no keyword fallback',async()=>{
    calls.understand.mockResolvedValue(null); expect(await chatWithSari(input)).toContain('تعذر فهم سياق');
    expect(calls.understand).toHaveBeenCalledWith(input); expect(calls.byaan).not.toHaveBeenCalled(); expect(calls.salla).not.toHaveBeenCalled();
    expect(calls.budget.mock.invocationCallOrder[0]).toBeLessThan(calls.understand.mock.invocationCallOrder[0]);
  });
  it('keeps an exact Byaan response before commerce routing and identity rewriting',async()=>{expect(await chatWithSari(input)).toBe('دورة ساري [BE-12]');expect(calls.byaan).toHaveBeenCalledWith({...input,memoryHistoryCutoff:7});expect(calls.salla).not.toHaveBeenCalled();});
  it('retains the Salla route for unrelated intent',async()=>{calls.byaan.mockResolvedValue(null);expect(await chatWithSari(input)).toBe('salla fallback');expect(calls.salla).toHaveBeenCalledOnce();});
  it.each([{isGroupMessage:true},{incomingMessageId:undefined},{conversationId:undefined}])('does not run private enrollment without its source: %j',async overrides=>{calls.budget.mockResolvedValue({exceeded:true});await chatWithSari({...input,...overrides});expect(calls.byaan).not.toHaveBeenCalled();});
  it('preserves memory deletion and shared budget admission',async()=>{calls.memory.mockResolvedValue({reply:'تم الحذف',forgetBeforeMessageId:40});expect(await chatWithSari(input)).toBe('تم الحذف');expect(calls.byaan).not.toHaveBeenCalled();calls.memory.mockResolvedValue({reply:null,forgetBeforeMessageId:7});calls.budget.mockResolvedValue({exceeded:true});expect(await chatWithSari(input)).toContain('تعذر الرد الآلي');expect(calls.byaan).not.toHaveBeenCalled();});
  it.each(['سجلني في دورة المبيعات','أريد التسجيل في دورة ساري','ابغى اسجل في الدورة','enroll me in the course','register me'])('recognizes a course request: %s',text=>expect(isByaanEnrollmentRequest(text)).toBe(true));
  it.each(['نعم','هل أقدر أسجل؟','كيف أسجل','لا تسجلني','قال سجلني','سجلني إذا مجاني','سجلني لو السعر أقل','أريد شراء سماعة','"سجلني"','can you register me?','register me if free'])('does not turn %s into enrollment selection',text=>expect(isByaanEnrollmentRequest(text)).toBe(false));
  it.each(['غير الدورة إلى المبيعات','عدل التسجيل','change the course','replace my course'])('recognizes a pending course edit %s',text=>expect(isByaanEnrollmentEdit(text)).toBe(true));
  it.each([{productId:1,traineePhone:'966500000001'},{productId:1,price:1},{productId:'1'},[{productId:1}],null])('rejects model-supplied execution authority %j',value=>expect(byaanCourseSelection.safeParse(value).success).toBe(false));
});
