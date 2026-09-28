import { describe, expect, it, vi } from 'vitest';
vi.mock('./openai', () => ({ callGPT4: vi.fn() }));
import { callGPT4 } from './openai';
import { withConversationUnderstanding, type ConversationUnderstanding } from './conversation-understanding-context';
import { searchRelevantProducts, shouldAutoRelease } from './sari-personality';
import { evaluateSmartEscalationV2 } from './smart-escalation';
import { selectAction } from './action-selector';

const analysis = (change: Partial<ConversationUnderstanding> = {}): ConversationUnderstanding => ({ version:1,intent:'inquiring',goal:'explain_requested_information',action:'respond',confidence:0.96,conditional:false,ambiguous:false,targetQuoteId:null,targetProvider:'none',productIds:[2],sessionIndex:null,requestKind:'ordinary',sentiment:'neutral',topicChanged:false,objection:'none',needs:[],unresolvedQuestions:[],summary:'استفسار عن المنتج المقصود في الحوار.',nextStep:'answer',evidence:[{messageId:12,excerpt:'هذا'}],...change });
const scope = <T>(message:string, change:Partial<ConversationUnderstanding>, run:()=>Promise<T>) => withConversationUnderstanding({merchantId:1,conversationId:2,incomingMessageId:12,message,analysis:analysis(change)},run);
const products = [{id:1,name:'برنامج تدريب صباحي',stock:3},{id:2,name:'برنامج تدريب مسائي',stock:5},{id:3,name:'منتج متوقف',stock:0}];
const escalation = (message:string) => evaluateSmartEscalationV2({merchantId:1,conversationId:2,customerPhone:'test-playground',customerMessage:message,dealStage:'payment_link_sent',sentiment:'angry',paymentLinkSent:true,hoursSincePaymentLink:10});

describe('contextual reply routing (synthetic interpretations)',()=>{
  it('does not start a second contradictory action analysis after a private contextual reply',async()=>{
    expect(await selectAction({merchantId:1,customerMessage:'أبغى خصم وسجلني',botResponse:'نحتاج نراجع العرض أولًا',intent:'ready_to_buy',profile:null,primaryReplyOwnsActions:true})).toEqual({type:'text_only'});
    expect(callGPT4).not.toHaveBeenCalled();
  });
  it('selects a pronoun-referenced product even when the message has no matching product words',async()=>{
    await scope('هذا يناسبني',{},async()=>expect(await searchRelevantProducts('هذا يناسبني',products)).toEqual([products[1]]));
  });
  it('a specific price question cannot expand into a full catalog based on words',async()=>{
    await scope('بكم هذا؟',{},async()=>expect(await searchRelevantProducts('بكم هذا؟',products)).toEqual([products[1]]));
  });
  it('honors interpreted catalog requests without any known catalog phrase',async()=>{
    await scope('وريني اللي ممكن اختار منه',{requestKind:'catalog'},async()=>expect(await searchRelevantProducts('وريني اللي ممكن اختار منه',products)).toEqual(products.slice(0,2)));
  });
  it('does not infer a product after the interpreter left its reference unresolved',async()=>{
    await scope('برنامج تدريب صباحي',{productIds:[],ambiguous:true},async()=>expect(await searchRelevantProducts('برنامج تدريب صباحي',products)).toEqual([]));
  });
  it('ignores foreign, removed and currently unavailable product IDs and preserves the limit',async()=>{
    await scope('هذول مناسبين',{productIds:[999,3,2,1]},async()=>expect(await searchRelevantProducts('هذول مناسبين',products,1)).toEqual([products[1]]));
  });
  it.each(['ما عندي شكوى، بس أقارن الموعدين','ما أبغى موظف، محتاج أعرف خبرة المدرب','مو غالي، الموعد متأخر علي'])('does not let words, negative tone or an old payment link force a handoff: %s',async message=>{
    await scope(message,{},async()=>{for(let i=0;i<4;i++)expect(escalation(message).shouldEscalate).toBe(false);});
  });
  it('recognizes a contextual staff request and leaves acknowledgement to durable execution',async()=>{
    await scope('خلنا نسمع من الشخص المخوّل',{action:'request_human',nextStep:'handoff'},async()=>{
      expect(escalation('خلنا نسمع من الشخص المخوّل')).toMatchObject({shouldEscalate:true,customerMessage:''});
      expect(escalation('نعم').shouldEscalate).toBe(false);
    });
  });
  it.each([{ambiguous:true},{conditional:true},{confidence:0.5}])('does not notify staff from uncertain contextual interpretation: %j',async change=>{
    await scope('موظف',{action:'request_human',nextStep:'handoff',...change},async()=>expect(escalation('موظف').shouldEscalate).toBe(false));
  });
  it('reuses contextual topic understanding for a hold instead of a second classifier or message counter',async()=>{
    const hold = {question:'طلب خاص',holdResponseCount:3} as Parameters<typeof shouldAutoRelease>[0];
    await scope('ما زلت أنتظر ردهم',{},async()=>expect(await shouldAutoRelease(hold,'ما زلت أنتظر ردهم')).toBeNull());
    await scope('عندي موضوع ثاني',{topicChanged:true},async()=>expect(await shouldAutoRelease(hold,'عندي موضوع ثاني')).toBe('new_topic'));
    expect(callGPT4).not.toHaveBeenCalled();
  });
  it('retains explicit legacy product lookup outside the contextual private pipeline',async()=>{
    expect(await searchRelevantProducts('مسائي',products)).toEqual([products[1]]);
  });
});
