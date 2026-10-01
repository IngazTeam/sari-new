import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({llm:vi.fn()}));
vi.mock('./_core/llm',()=>({invokeLLM:m.llm}));
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {generateReplySuggestions} from './reply-suggestions';
import {conversationReplyEvidence,conversationHandoffSummary} from './ai/conversation-handoff';
describe.skipIf(!process.env.DATABASE_URL)('reply suggestion stored evidence',()=>{
  let fixture:Awaited<ReturnType<typeof createDisposableMerchant>>,conversationId:number;
  const query=async(sql:string,args:any[]=[])=> (await (await getPool())!.execute<any>(sql,args))[0];
  const incoming=async(text='أحتاج تفاصيل المنتج')=>Number((await query("INSERT INTO messages(conversationId,direction,messageType,content,sender_type) VALUES (?,'incoming','text',?,'customer')",[conversationId,text])).insertId);
  const output=()=>({choices:[{message:{content:JSON.stringify({suggestions:['friendly','professional','brief','detailed'].map(type=>({type,text:`Draft ${type}`}))})}}]});
  beforeEach(async()=>{fixture=await createDisposableMerchant('reply-suggestions');conversationId=Number((await query("INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966500000225','active')",[fixture.merchantId])).insertId);m.llm.mockReset().mockResolvedValue(output());});
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([fixture.userId]);});afterAll(closeDb);
  const generate=()=>generateReplySuggestions(fixture.merchantId,fixture.userId,conversationId);
  it('uses stored roles, avoids writes and keeps the public handoff shape unchanged',async()=>{
    await incoming();await query("INSERT INTO messages(conversationId,direction,messageType,content,sender_type) VALUES (?,'outgoing','text','employee answer','merchant')",[conversationId]);
    const result=await generate();expect(result.suggestions).toHaveLength(4);expect(JSON.parse(m.llm.mock.calls[0][0].messages[1].content).evidence.messages[1].role).toBe('merchant');
    expect(await conversationHandoffSummary(fixture.merchantId,conversationId)).not.toHaveProperty('sourceBinding');expect((await query('SELECT COUNT(*) AS n FROM messages WHERE conversationId=?',[conversationId]))[0].n).toBe(2);
  });
  it('rejects another tenant before calling the provider',async()=>{await incoming();await expect(generateReplySuggestions(fixture.merchantId+99999,fixture.userId,conversationId)).rejects.toMatchObject({code:'NOT_FOUND'});expect(m.llm).not.toHaveBeenCalled();});
  it('refuses empty history without a provider call',async()=>{await expect(generate()).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(m.llm).not.toHaveBeenCalled();});
  it.each(['arrival','customer','long-message','version'])('refuses stale generation after stored %s changes',async kind=>{
    const id=await incoming('x'.repeat(610));m.llm.mockImplementationOnce(async()=>{
      if(kind==='arrival')await incoming('new request');if(kind==='customer')await query("UPDATE conversations SET customerPhone='966500000226' WHERE id=?",[conversationId]);
      if(kind==='long-message')await query('UPDATE messages SET content=? WHERE id=?',['x'.repeat(600)+'changed tail',id]);if(kind==='version')await query('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conversationId]);return output();
    });await expect(generate()).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('includes full-message binding while limiting exposed excerpts',async()=>{await incoming('x'.repeat(2000));const evidence=await conversationReplyEvidence(fixture.merchantId,conversationId);expect(evidence.summary.messages[0].text).toHaveLength(600);expect(evidence.sourceBinding).toMatch(/^[a-f0-9]{64}$/);});
});
