import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertDNA } from '../db/learning';
import { attachLearningEvidence } from './learning-evidence';
import { getLearningPolicyReview, recordLearningPolicyReview } from './learning-policy-review';
import { learningPolicyReviewSuite, learningPolicyReviewSuiteDigest } from './learning-policy-review-contract';
import { createLearningPolicyCandidate, getLearningPolicyCandidate, getLearningPolicyCandidateVersion } from './learning-policy-candidates';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import * as policies from './sales-turn-policy';

describe.skipIf(!process.env.DATABASE_URL)('immutable sales policy candidates on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, users: number[], proposalId: number, signalId: number;
  const query=async(sql:string,args:any[]=[]):Promise<any> => (await (await getPool())!.execute(sql,args))[0];
  const get=()=>getLearningPolicyCandidate(owner.merchantId,{proposalId});
  const rows=()=>query('SELECT * FROM ai_learning_policy_candidates WHERE merchant_id=? ORDER BY version',[owner.merchantId]);
  const review=async(pass=true)=> {
    const source=await getLearningPolicyReview(owner.merchantId,{proposalId});
    return recordLearningPolicyReview(owner.merchantId,owner.userId,{proposalId,requestId:randomUUID(),sourceDigest:source.sourceDigest,
      suiteDigest:learningPolicyReviewSuiteDigest,expectedRevision:source.revision,styleOnly:true,
      cases:learningPolicyReviewSuite.cases.map(c=>({caseId:c.id as any,baselineResponse:'Synthetic baseline',candidateResponse:'Synthetic candidate',
        baselineVerdict:'pass',candidateVerdict:pass?'pass':'fail',reason:'Synthetic human judgment with enough detail.'}))});
  };
  const input=async()=>{const basis=await get();return {proposalId,requestId:randomUUID(),reviewId:basis.reviewId!,
    sourceDigest:basis.sourceDigest,baselineDigest:basis.baselineDigest,expectedVersion:basis.expectedVersion};};
  const create=(value:Awaited<ReturnType<typeof input>>)=>createLearningPolicyCandidate(owner.merchantId,owner.userId,value);
  const exportVersion=(id:number)=>getLearningPolicyCandidateVersion(owner.merchantId,{candidateId:id});
  beforeEach(async()=>{
    owner=await createDisposableMerchant('policy-candidate');users=[owner.userId];
    vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Candidates must not call providers');}));
    const conversationId=(await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000296')",[owner.merchantId])).insertId;
    signalId=(await query(`INSERT INTO sari_learning_signals (merchant_id,conversation_id,signal_type,customer_message)
      VALUES (?,?,'price_objection','Private synthetic evidence that must not be copied')`,[owner.merchantId,conversationId])).insertId;
    const proposal={merchantId:owner.merchantId,generation:1,dimension:'objection_handling' as const,insight:'Explain value before asking to proceed',evidenceCount:999,confidence:0.99};
    await upsertDNA(proposal);proposalId=Number((await query('SELECT id FROM ai_learning_proposals WHERE merchant_id=?',[owner.merchantId]))[0].id);
    await attachLearningEvidence({...proposal,observedSignalIds:[signalId],supportingSignalIds:[signalId]});await review();
  });
  afterEach(async()=>{expect(fetch).not.toHaveBeenCalled();vi.restoreAllMocks();vi.unstubAllGlobals();await cleanupDisposableMerchants(users);});
  afterAll(closeDb);
  it('persists complete reproducible input without altering live policy, evidence, reviews or budget',async()=>{
    const tables=['ai_learning_proposals','sari_learning_signals','ai_learning_policy_reviews','ai_learning_evidence_links','sari_behavioral_dna','ai_budget_policies','ai_price_cards'];
    const snapshot=async()=>Promise.all(tables.map(table=>query(`SELECT * FROM ${table} ORDER BY 1`)));
    const before=await snapshot(), saved=await create(await input()), view=await get();
    expect(saved).toMatchObject({version:1,activationAllowed:false,evaluationStatus:'not_run',reused:false});
    expect(view).toMatchObject({canCreate:false,latestCandidate:{current:true}});
    const exported=await exportVersion(saved.id);expect(exported.eligibility).toBe('not_checked');expect(exported.bundle.baseline.cases).toHaveLength(32);
    expect(policyArtifactDigest(exported.bundle)).toBe(saved.artifactDigest);
    expect(JSON.stringify(await rows())).not.toContain('Private synthetic evidence');expect(await snapshot()).toEqual(before);
  });
  it('refuses creation without a human review or with a newer failed review',async()=>{
    const old=await input();await review(false);expect((await get()).canCreate).toBe(false);await expect(create(old)).rejects.toThrow('changed');
    await query('DELETE FROM ai_learning_policy_reviews WHERE merchant_id=?',[owner.merchantId]);
    expect((await get()).canCreate).toBe(false);await expect(create(old)).rejects.toThrow('changed');expect(await rows()).toHaveLength(0);
  });
  it('keeps independent versions after later reviews and exports the historical snapshot exactly',async()=>{
    const first=await create(await input()), old=await exportVersion(first.id);await review();
    expect((await get()).latestCandidate!.current).toBe(false);const second=await create(await input());
    expect(second.version).toBe(2);expect(second.artifactDigest).not.toBe(first.artifactDigest);
    expect(await exportVersion(first.id)).toEqual(old);expect((await get()).history.map(c=>c.current)).toEqual([true,false]);
  });
  it('never selects an earlier pass after the latest human review fails',async()=>{
    const first=await create(await input());await review(false);
    expect(await get()).toMatchObject({canCreate:false,latestCandidate:{current:false}});
    await expect(create(await input())).rejects.toThrow('changed');
    expect((await exportVersion(first.id)).evaluationStatus).toBe('not_run');expect(await rows()).toHaveLength(1);
  });
  it('rejects an oversized reviewed insight instead of silently changing it for evaluation',async()=>{
    const insight='x'.repeat(8001);await query('UPDATE ai_learning_proposals SET insight=?,content_hash=SHA2(?,256) WHERE id=?',[insight,insight,proposalId]);
    await review();expect((await get()).canCreate).toBe(false);await expect(create(await input())).rejects.toThrow('changed');expect(await rows()).toHaveLength(0);
  });
  it('retains the artifact when a separate reviewer account is deleted',async()=>{
    const other=await createDisposableMerchant('candidate-reviewer');users.push(other.userId);
    const saved=await createLearningPolicyCandidate(owner.merchantId,other.userId,await input()),before=await exportVersion(saved.id);
    await cleanupDisposableMerchants([other.userId]);users=users.filter(id=>id!==other.userId);
    expect(await exportVersion(saved.id)).toEqual(before);expect((await get()).history[0].actorUserId).toBeNull();
  });
  it('invalidates current status after renderer drift while preserving replay and historical export',async()=>{
    const submitted=await input(),first=await create(submitted),old=await exportVersion(first.id),render=policies.buildSalesTurnPolicy;
    vi.spyOn(policies,'buildSalesTurnPolicy').mockImplementation(value=>render(value)+'\nNew runtime boundary');
    expect(await get()).toMatchObject({canCreate:true,latestCandidate:{current:false}});
    expect(await exportVersion(first.id)).toEqual(old);expect(await create(submitted)).toMatchObject({id:first.id,reused:true});
    await expect(create({...submitted,requestId:randomUUID(),expectedVersion:1})).rejects.toThrow('changed');
    const next=await create(await input());expect(next.version).toBe(2);expect(next.baselineDigest).not.toBe(first.baselineDigest);
  });
  it.each(['source','state','dimension','hash','suite'])('rejects %s drift after preparing a creation request',async change=>{
    const submitted=await input();
    if(change==='source')await query("UPDATE sari_learning_signals SET customer_message='changed' WHERE id=?",[signalId]);
    if(change==='state')await query("UPDATE ai_learning_proposals SET status='retired' WHERE id=?",[proposalId]);
    if(change==='dimension')await query("UPDATE ai_learning_proposals SET dimension='knowledge_gaps' WHERE id=?",[proposalId]);
    if(change==='hash')await query('UPDATE ai_learning_proposals SET content_hash=? WHERE id=?',['c'.repeat(64),proposalId]);
    if(change==='suite')await query('UPDATE ai_learning_policy_reviews SET suite_digest=? WHERE proposal_id=?',['c'.repeat(64),proposalId]);
    expect((await get()).canCreate).toBe(false);await expect(create(submitted)).rejects.toThrow('changed');expect(await rows()).toHaveLength(0);
  });
  it('replays a lost receipt after source deletion without calling it current',async()=>{
    const submitted=await input(),first=await create(submitted);await query('DELETE FROM sari_learning_signals WHERE id=?',[signalId]);
    expect(await create(submitted)).toMatchObject({id:first.id,reused:true});expect(await get()).toMatchObject({canCreate:false,latestCandidate:{current:false}});
    expect((await exportVersion(first.id)).artifactDigest).toBe(first.artifactDigest);
  });
  it.each(['reviewId','sourceDigest','baselineDigest','expectedVersion'])('rejects changed %s even with a current valid review',async field=>{
    const submitted:any=await input();submitted[field]=field.endsWith('Digest')?'f'.repeat(64):submitted[field]+1;
    await expect(create(submitted)).rejects.toThrow('changed');expect(await rows()).toHaveLength(0);
  });
  it('deduplicates five concurrent identical requests',async()=>{
    const submitted=await input(),results=await Promise.all(Array.from({length:5},()=>create(submitted)));
    expect(new Set(results.map(c=>c.id)).size).toBe(1);expect(results.filter(c=>!c.reused)).toHaveLength(1);expect(await rows()).toHaveLength(1);
  });
  it('commits only one of competing requests for the same version',async()=>{
    const submitted=await input(),results=await Promise.allSettled([create(submitted),create({...submitted,requestId:randomUUID()})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await rows()).toHaveLength(1);
    await expect(create(await input())).rejects.toThrow('changed');
  });
  it.each(['before','after'] as const)('recovers commit acknowledgment lost %s persistence',async when=>{
    const submitted=await input(),pool=(await getPool())!,getConnection=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
      const connection=await getConnection();return new Proxy(connection,{get(target,key){
        if(key==='commit')return async()=>{if(when==='after')await target.commit();throw Error('lost acknowledgment');};
        const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
      }}) as any;
    });
    await expect(create(submitted)).rejects.toThrow();vi.restoreAllMocks();
    expect(await rows()).toHaveLength(when==='after'?1:0);expect(await create(submitted)).toMatchObject({version:1,reused:when==='after'});
    expect(await rows()).toHaveLength(1);
  });
  it('does not reuse request identity with another actor or payload',async()=>{
    const submitted=await input();await create(submitted);const other=await createDisposableMerchant('candidate-actor');users.push(other.userId);
    await expect(createLearningPolicyCandidate(owner.merchantId,other.userId,submitted)).rejects.toThrow('changed');
    await expect(create({...submitted,expectedVersion:1})).rejects.toThrow('changed');
    expect(await create({...submitted,requestId:submitted.requestId.toUpperCase()})).toMatchObject({reused:true});
  });
  it('isolates proposal and candidate identifiers across merchants',async()=>{
    const submitted=await input(),first=await create(submitted),other=await createDisposableMerchant('candidate-foreign');users.push(other.userId);
    await expect(getLearningPolicyCandidate(other.merchantId,{proposalId})).rejects.toThrow('changed');
    await expect(getLearningPolicyCandidateVersion(other.merchantId,{candidateId:first.id})).rejects.toThrow('changed');
    await expect(createLearningPolicyCandidate(other.merchantId,other.userId,submitted)).rejects.toThrow('changed');
  });
  it('rejects mixed-tenant evidence even if the review row still passes',async()=>{
    const submitted=await input(),other=await createDisposableMerchant('candidate-foreign-source');users.push(other.userId);
    await query('UPDATE ai_learning_evidence_links SET merchant_id=? WHERE proposal_id=?',[other.merchantId,proposalId]);
    await expect(create(submitted)).rejects.toThrow('changed');
  });
  it('captures caller input before waiting for a transaction lock',async()=>{
    const submitted=await input(),connection=await (await getPool())!.getConnection();
    try{await connection.beginTransaction();await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[owner.merchantId]);
      const pending=create(submitted);submitted.sourceDigest='f'.repeat(64);submitted.reviewId=999999;
      await connection.commit();expect(await pending).toMatchObject({version:1});
    }finally{await connection.rollback();connection.release();}
  });
  it('checks source freshness after waiting for a transaction lock',async()=>{
    const submitted=await input(),connection=await (await getPool())!.getConnection();
    try{await connection.beginTransaction();await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[owner.merchantId]);
      await connection.execute("UPDATE sari_learning_signals SET customer_message='new evidence' WHERE id=?",[signalId]);
      const pending=create(submitted),rejection=expect(pending).rejects.toThrow('changed');await connection.commit();await rejection;
      expect(await rows()).toHaveLength(0);
    }finally{await connection.rollback();connection.release();}
  });
  it.each(['bundle','artifact_digest','source_digest','baseline_digest'])('refuses corrupt persisted %s on replay and export',async field=>{
    const submitted=await input(),first=await create(submitted);await query(`UPDATE ai_learning_policy_candidates SET ${field}=? WHERE id=?`,[field==='bundle'?'{}':'e'.repeat(64),first.id]);
    await expect(create(submitted)).rejects.toThrow('changed');await expect(exportVersion(first.id)).rejects.toThrow('changed');await expect(get()).rejects.toThrow('changed');
  });
  it.each([0,9007199254740992])('rejects persisted invalid version %s',async version=>{
    const first=await create(await input());await expect(query('UPDATE ai_learning_policy_candidates SET version=? WHERE id=?',[version,first.id]))
      .rejects.toMatchObject({code:'ER_CHECK_CONSTRAINT_VIOLATED'});
  });
  it('removes dependent artifacts when their proposal is deleted',async()=>{
    const first=await create(await input());await query('DELETE FROM ai_learning_proposals WHERE id=?',[proposalId]);
    expect(await rows()).toHaveLength(0);await expect(exportVersion(first.id)).rejects.toThrow('changed');
  });
});
