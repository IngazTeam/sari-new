import { describe, expect, it } from 'vitest';
import { conversationUnderstandingCases as cases, type UnderstandingCase } from '../../scripts/testing/conversation-understanding-cases';
import { scoreUnderstanding } from '../../scripts/testing/conversation-understanding-scoring';
import type { ConversationUnderstanding } from './conversation-understanding-context';

const result = (change:Partial<ConversationUnderstanding> = {}):ConversationUnderstanding=>({version:1,intent:'inquiring',goal:'explain_requested_information',action:'respond',confidence:0.96,conditional:false,ambiguous:false,targetQuoteId:null,targetProvider:'none',productIds:[],sessionIndex:null,requestKind:'ordinary',sentiment:'neutral',topicChanged:false,objection:'none',needs:[],unresolvedQuestions:[],summary:'فهم اصطناعي لاختبار المقياس.',nextStep:'answer',evidence:[{messageId:3,excerpt:'نعم'}],...change});
const find = (id:string)=>cases.find(c=>c.id===id)!;
describe('model evaluation scoring guards (not live quality evidence)',()=>{
  it('all cases have a positive semantic expectation and unique IDs',()=>{
    expect(new Set(cases.map(c=>c.id)).size).toBe(cases.length);
    for(const c of cases) {expect(Object.keys(c.expected).length).toBeGreaterThan(0);expect(c.input.messages.at(-1)?.id).toBe(c.input.currentMessageId);}
  });
  it('cannot pass an entire suite by always clarifying',()=>{
    const scores = cases.map(c=>scoreUnderstanding(c,result({action:'clarify',ambiguous:true})));
    expect(scores.filter(s=>s.passed).length).toBeLessThan(cases.length/2);
  });
  it.each(['request_purchase','modify_offer','confirm_offer','decline_offer','select_session','request_booking','confirm_booking','request_human'] as const)('flags unintended executable %s, including changes and staff alerts',action=>{
    expect(scoreUnderstanding(find('yes-to-explanation'),result({action}))).toMatchObject({passed:false,criticalFailure:true});
  });
  it('flags a handoff next step even with a respond action',()=>{
    expect(scoreUnderstanding(find('negated-staff-request'),result({nextStep:'handoff'})).criticalFailure).toBe(true);
  });
  it.each([{confidence:0.3},{ambiguous:true},{conditional:true}])('does not pass genuine consent when execution remains blocked: %j',change=>{
    expect(scoreUnderstanding(find('yes-to-specific-offer'),result({action:'confirm_offer',targetQuoteId:19,...change}))).toMatchObject({passed:false,mismatches:['executable']});
  });
  it('accepts valid consent and an explicit withdrawal as distinct legitimate actions',()=>{
    expect(scoreUnderstanding(find('yes-to-specific-offer'),result({action:'confirm_offer',targetQuoteId:19})).passed).toBe(true);
    expect(scoreUnderstanding(find('withdraw-prior-interest'),result({action:'decline_offer',targetQuoteId:19,intent:'declined'})).passed).toBe(true);
  });
  it('compares structured product references and conditional intent rather than JSON validity alone',()=>{
    expect(scoreUnderstanding(find('specific-price-pronoun'),result({productIds:[7]})).passed).toBe(true);
    expect(scoreUnderstanding(find('specific-price-pronoun'),result({productIds:[]})).passed).toBe(false);
    expect(scoreUnderstanding(find('conditional-yes'),result()).passed).toBe(false);
    expect(scoreUnderstanding(find('conditional-yes'),result({conditional:true,action:'clarify'})).passed).toBe(true);
  });
  it('refuses an empty scoring rubric',()=>{
    const invalid:UnderstandingCase={...find('yes-to-explanation'),expected:{}};
    expect(scoreUnderstanding(invalid,result()).passed).toBe(false);
  });
  it('requires the contextual specialization and confidence without accepting an unintended human handoff',()=>{
    const item=find('agent-negated-accounting');
    expect(scoreUnderstanding(item,result({virtualAgentId:42})).passed).toBe(true);
    expect(scoreUnderstanding(item,result({virtualAgentId:41})).passed).toBe(false);
    expect(scoreUnderstanding(item,result()).passed).toBe(false);
    for(const change of [{confidence:.7},{ambiguous:true},{conditional:true}])
      expect(scoreUnderstanding(item,result({virtualAgentId:42,...change}))).toMatchObject({passed:false,mismatches:['agentRoutingBlocked']});
    expect(scoreUnderstanding(item,result({virtualAgentId:42,nextStep:'handoff'})).criticalFailure).toBe(true);
  });
});
