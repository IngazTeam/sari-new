import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import type { SignalType } from '../db/learning';

export type LearningSignalInput = {
  merchantId: number; conversationId: number; signalType: SignalType; signalWeight?: number;
  botMessage?: string; customerMessage?: string; merchantCorrection?: string; contextSummary?: string;
  sourceKey?: string; strict?: boolean;
};
export class LearningSignalCaptureError extends Error {
  constructor(readonly code: 'invalid_input' | 'ownership' | 'source_conflict' | 'daily_limit' | 'storage_unavailable') {
    super(`Learning signal capture: ${code}`); this.name = 'LearningSignalCaptureError';
  }
}
const types: readonly SignalType[] = ['positive_feedback','purchase_completed','purchase_refunded','question_repeated',
  'customer_left','escalation_requested','price_objection','knowledge_gap','merchant_correction','long_conversation','quick_resolution'];
const invalid = () => { throw new LearningSignalCaptureError('invalid_input'); };
function text(value: unknown, maximum: number): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') return invalid();
  return value.slice(0, maximum);
}
function normalize(input: LearningSignalInput) {
  if (!input || ![input.merchantId,input.conversationId].every(v=>Number.isSafeInteger(v)&&v>0)
    || !types.includes(input.signalType) || (input.strict!==undefined&&typeof input.strict!=='boolean')) return invalid();
  const weight=input.signalWeight??1;
  if (!Number.isFinite(weight)||weight<0||weight>9.99||Math.abs(weight*100-Math.round(weight*100))>1e-8) return invalid();
  if (input.sourceKey!==undefined&&(typeof input.sourceKey!=='string'||!input.sourceKey.trim()
    || input.sourceKey.length>160||input.sourceKey!==input.sourceKey.trim()||/[\u0000-\u001f\u007f]/.test(input.sourceKey))) return invalid();
  if (input.strict && !input.sourceKey) return invalid();
  return {merchantId:input.merchantId,conversationId:input.conversationId,signalType:input.signalType,weight,
    bot:text(input.botMessage,2000),customer:text(input.customerMessage,2000),correction:text(input.merchantCorrection,2000),
    context:text(input.contextSummary,500),source:input.sourceKey??null};
}

/** One message's signals commit together. Replays are checked before the admission quota. */
export async function captureLearningSignals(inputs: readonly LearningSignalInput[]): Promise<void> {
  if (!Array.isArray(inputs)||inputs.length>20) return invalid();
  if (!inputs.length) return;
  const values=inputs.map(normalize),merchantId=values[0].merchantId,strict=inputs.some(input=>input.strict);
  if (values.some(value=>value.merchantId!==merchantId)) return invalid();
  try {
    await assertRuntimeSchema('learning signal admission', [{table:'sari_learning_signals',columns:['source_key'],
      uniqueIndexes:[{name:'uq_learning_source',columns:['merchant_id','source_key','signal_type']}] }]);
    const pool=await getPool(); if(!pool)throw new LearningSignalCaptureError('storage_unavailable');
    const connection=await pool.getConnection();
    try {
      await connection.beginTransaction();
      // Lock parent before sources, matching analysis. Never hold it across an AI call.
      const [owners]=await connection.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchantId]);
      if(!owners.length)throw new LearningSignalCaptureError('ownership');
      const conversations=Array.from(new Set(values.map(value=>value.conversationId))).sort((a,b)=>a-b);
      const [owned]=await connection.execute<any[]>(`SELECT id FROM conversations WHERE merchantId=?
        AND id IN (${conversations.map(()=>'?').join(',')}) ORDER BY id FOR SHARE`,[merchantId,...conversations]);
      if(owned.length!==conversations.length)throw new LearningSignalCaptureError('ownership');
      // A locking count observes the latest committed admissions, even under REPEATABLE READ.
      const [today]=await connection.execute<any[]>(`SELECT id FROM sari_learning_signals WHERE merchant_id=?
        AND created_at>=UTC_DATE() AND created_at<TIMESTAMPADD(DAY,1,UTC_DATE()) LIMIT 500 FOR UPDATE`,[merchantId]);
      let admitted=today.length;
      for(const value of values){
        if(value.source){
          const [existing]=await connection.execute<any[]>(`SELECT * FROM sari_learning_signals
            WHERE merchant_id=? AND source_key=? AND signal_type=? FOR UPDATE`,[merchantId,value.source,value.signalType]);
          if(existing[0]){
            const row=existing[0];
            if(row.source_key!==value.source||row.signal_type!==value.signalType||row.conversation_id!==value.conversationId
              || Number(row.signal_weight)!==value.weight||row.bot_message!==value.bot||row.customer_message!==value.customer
              || row.merchant_correction!==value.correction||row.context_summary!==value.context) throw new LearningSignalCaptureError('source_conflict');
            continue;
          }
        }
        if(admitted>=500)throw new LearningSignalCaptureError('daily_limit');
        await connection.execute(`INSERT INTO sari_learning_signals
          (merchant_id,conversation_id,signal_type,signal_weight,bot_message,customer_message,merchant_correction,context_summary,source_key)
          VALUES (?,?,?,?,?,?,?,?,?)`,[merchantId,value.conversationId,value.signalType,value.weight,value.bot,value.customer,value.correction,value.context,value.source]);
        admitted++;
      }
      await connection.commit();
    } catch(error){try{await connection.rollback();}catch{/* A lost acknowledgement is resolved by the same source identity. */}throw error;}
    finally{connection.release();}
  } catch(error){
    const safe=error instanceof LearningSignalCaptureError?error:new LearningSignalCaptureError('storage_unavailable');
    // SQL errors can include the customer text and bound values. Log only the fixed classification.
    if(safe.code!=='daily_limit')console.error('[Learning] Signal batch not confirmed',{reason:safe.code});
    if(strict)throw safe;
  }
}
