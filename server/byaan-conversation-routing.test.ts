import {beforeEach,describe,expect,it,vi} from 'vitest';
import {isByaanEnrollmentRequest,isByaanEnrollmentEdit,byaanCourseSelection} from './ai/byaan-enrollment-conversation';
const calls=vi.hoisted(()=>({memory:vi.fn(),budget:vi.fn(),byaan:vi.fn(),salla:vi.fn(),reminder:vi.fn()}));
vi.mock('./ai/customer-memory',async original=>({...await original<typeof import('./ai/customer-memory')>(),captureDirectCustomerMemory:calls.memory}));
vi.mock('./ai/budget-ledger',()=>({getAiBudgetStatus:calls.budget}));
vi.mock('./appointment-reminders',()=>({handleAppointmentReminder:calls.reminder}));
vi.mock('./ai/byaan-checkout-conversation',()=>({handleByaanCheckout:calls.byaan}));
vi.mock('./ai/salla-checkout-conversation',()=>({handleSallaCheckout:calls.salla}));
vi.mock('./ai/zahypi-client',async original=>({...await original<typeof import('./ai/zahypi-client')>(),runWithZahyPiContext:async(_:unknown,run:()=>Promise<unknown>)=>run()}));
import {chatWithSari} from './ai/sari-personality';

describe('Byaan intent and private conversation routing',()=>{
  beforeEach(()=>{vi.clearAllMocks();calls.memory.mockResolvedValue({reply:null,forgetBeforeMessageId:7});calls.budget.mockResolvedValue({exceeded:false});calls.reminder.mockResolvedValue(null);calls.byaan.mockResolvedValue('دورة ساري [BE-12]');calls.salla.mockResolvedValue('salla fallback');});
  const input={merchantId:17,conversationId:23,incomingMessageId:40,customerPhone:'966500000087',message:'سجلني في دورة ساري'};
  it('keeps an exact Byaan response before commerce routing and identity rewriting',async()=>{expect(await chatWithSari(input)).toBe('دورة ساري [BE-12]');expect(calls.byaan).toHaveBeenCalledWith({...input,memoryHistoryCutoff:7});expect(calls.salla).not.toHaveBeenCalled();});
  it('retains the Salla route for unrelated intent',async()=>{calls.byaan.mockResolvedValue(null);expect(await chatWithSari(input)).toBe('salla fallback');expect(calls.salla).toHaveBeenCalledOnce();});
  it.each([{isGroupMessage:true},{incomingMessageId:undefined},{conversationId:undefined}])('does not run private enrollment without its source: %j',async overrides=>{calls.budget.mockResolvedValue({exceeded:true});await chatWithSari({...input,...overrides});expect(calls.byaan).not.toHaveBeenCalled();});
  it('preserves memory deletion and shared budget admission',async()=>{calls.memory.mockResolvedValue({reply:'تم الحذف',forgetBeforeMessageId:40});expect(await chatWithSari(input)).toBe('تم الحذف');expect(calls.byaan).not.toHaveBeenCalled();calls.memory.mockResolvedValue({reply:null,forgetBeforeMessageId:7});calls.budget.mockResolvedValue({exceeded:true});expect(await chatWithSari(input)).toContain('تعذر الرد الآلي');expect(calls.byaan).not.toHaveBeenCalled();});
  it.each(['سجلني في دورة المبيعات','أريد التسجيل في دورة ساري','ابغى اسجل في الدورة','enroll me in the course','register me'])('recognizes a course request: %s',text=>expect(isByaanEnrollmentRequest(text)).toBe(true));
  it.each(['نعم','هل أقدر أسجل؟','كيف أسجل','لا تسجلني','قال سجلني','سجلني إذا مجاني','سجلني لو السعر أقل','أريد شراء سماعة','"سجلني"','can you register me?','register me if free'])('does not turn %s into enrollment selection',text=>expect(isByaanEnrollmentRequest(text)).toBe(false));
  it.each(['غير الدورة إلى المبيعات','عدل التسجيل','change the course','replace my course'])('recognizes a pending course edit %s',text=>expect(isByaanEnrollmentEdit(text)).toBe(true));
  it.each([{productId:1,traineePhone:'966500000001'},{productId:1,price:1},{productId:'1'},[{productId:1}],null])('rejects model-supplied execution authority %j',value=>expect(byaanCourseSelection.safeParse(value).success).toBe(false));
});
