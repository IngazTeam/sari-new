import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { conversationUnderstandingCases as cases } from './conversation-understanding-cases';
import { scoreUnderstanding } from './conversation-understanding-scoring';

const args = process.argv.slice(2);
const live = args.includes('--live'), preflight = args.includes('--preflight');
const reportLine = console.log.bind(console);

async function main() {
  if (!live && !preflight) {
    if (args.length) throw Error('invalid_arguments');
    reportLine(JSON.stringify({ mode:'dry-run',total:cases.length,cases:cases.map(({input:_input,...c})=>c),
      preflightCommand:'node --import tsx scripts/testing/evaluate-conversation-understanding.ts --preflight --merchant-id <test-merchant-id>',
      liveCommand:'node --import tsx scripts/testing/evaluate-conversation-understanding.ts --live --merchant-id <test-merchant-id>',
      note:'Live mode bills the centrally selected provider through the shared platform budget. No orders, bookings, staff alerts or WhatsApp messages are created. Dry-run reads no environment file or database.' },null,2));
    return;
  }
  if (live && preflight) throw Error('choose_one_mode');
  const merchantIndex = args.indexOf('--merchant-id'), repeatIndex = args.indexOf('--repeat');
  const merchantId = Number(args[merchantIndex+1]);
  const repeat = repeatIndex >= 0 ? Number(args[repeatIndex+1]) : 1;
  const expectedArgs = [live?'--live':'--preflight','--merchant-id',String(merchantId),...(repeatIndex>=0?['--repeat',String(repeat)]:[])];
  if (args.length!==expectedArgs.length || args.some(arg=>!expectedArgs.includes(arg)) || merchantIndex<0
    || !Number.isSafeInteger(merchantId) || merchantId<1 || !Number.isSafeInteger(repeat) || repeat<1 || repeat>3) throw Error('invalid_arguments');

  // Runtime errors may include driver/provider details. Only fixed error codes leave this CLI.
  const original = {log:console.log,warn:console.warn,error:console.error};
  let runtimeLogEvents = 0;
  console.log = console.warn = console.error = () => { runtimeLogEvents++; };
  let closeDb: (()=>Promise<void>) | undefined;
  try {
    const { config } = await import('dotenv');
    config({path:process.env.SARI_ENV_FILE || '.env',quiet:true});
    const connection = await import('../../server/db/connection'); closeDb = connection.closeDb;
    const pool = await connection.getPool(); if (!pool) throw Error('database_unavailable');
    const [rows] = await pool.execute<any[]>('SELECT id FROM merchants WHERE id=?',[merchantId]);
    if (!rows.length) throw Error('test_merchant_not_found');
    const { getTextGenerationSettings, getZahyPiRuntimeMetadata } = await import('../../server/db_ai_settings');
    async function currentConfiguration() {
      const settings = await getTextGenerationSettings();
      if (!settings) throw Error('central_settings_missing');
      const runtime = await getZahyPiRuntimeMetadata();
      if (!settings.isActive || !runtime.enabled) throw Error('central_provider_disabled');
      return {configuredProvider:runtime.provider,configuredModel:runtime.provider==='zahypi'?runtime.model:settings.model,
        configurationSource:runtime.source,connectorGeneration:runtime.generation ?? null};
    }
    const configuration = await currentConfiguration();
    if (preflight) {
      reportLine(JSON.stringify({mode:'preflight',readyForAttempt:true,...configuration,cases:cases.length,
        note:'Read-only metadata check. Provider credentials, price admission and model quality have not been verified.'},null,2));
      return;
    }
    const { callGPT4 } = await import('../../server/ai/openai');
    const { understandingMessages, validateUnderstanding } = await import('../../server/ai/conversation-understanding');
    const startedAt = new Date().toISOString();
    const directory = resolve('.tmp/conversation-understanding-evaluations'); await mkdir(directory,{recursive:true});
    const file = resolve(directory,startedAt.replace(/[:.]/g,'-')+'.json');
    const results: any[] = [];
    const total = cases.length*repeat;
    const fingerprint = (value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const suiteDigest = fingerprint(cases);
    const promptDigest = fingerprint(cases.map(c=>understandingMessages(c.input)));
    let stopReason: string|null = null;
    async function persist(complete:boolean) {
      const report = {startedAt,updatedAt:new Date().toISOString(),complete,...configuration,suiteDigest,promptDigest,
        repeat,total,attempted:results.length,notRun:total-results.length,passed:results.filter(r=>r.passed).length,
        criticalFailures:results.filter(r=>r.criticalFailure).length,stopReason,runtimeLogEvents,
        scope:'Synthetic live interpretation evaluation. No business actions or customer histories. Review manually; not conversion evidence. Configured model is not observed response metadata.',results};
      await writeFile(file+'.tmp',JSON.stringify(report,null,2)); await rename(file+'.tmp',file);
      return report;
    }
    await persist(false);
    outer: for (let run=1;run<=repeat;run++) for (const item of cases) {
      try {
        if (fingerprint(await currentConfiguration())!==fingerprint(configuration)) {stopReason='central_configuration_changed';break outer;}
      } catch {stopReason='central_configuration_unavailable';break outer;}
      const started = Date.now(); let raw:string;
      try {
        raw = await callGPT4(understandingMessages(item.input),{merchantId,taskType:'sari.customer.intent',
          model:configuration.configuredProvider==='openai'?configuration.configuredModel:undefined,temperature:0,maxTokens:1800,noRetry:true});
      } catch {
        results.push({id:item.id,run,passed:false,criticalFailure:false,durationMs:Date.now()-started,error:'provider_or_budget_failure'});
        stopReason='provider_or_budget_failure'; await persist(false); break outer;
      }
      try {
        if (fingerprint(await currentConfiguration())!==fingerprint(configuration)) throw Error('changed');
      } catch {
        results.push({id:item.id,run,passed:false,criticalFailure:false,durationMs:Date.now()-started,error:'central_configuration_changed_during_call'});
        stopReason='central_configuration_changed_during_call'; await persist(false); break outer;
      }
      try {
        const result = validateUnderstanding(raw,item.input);
        results.push({id:item.id,run,...scoreUnderstanding(item,result),durationMs:Date.now()-started,result});
      } catch {
        results.push({id:item.id,run,passed:false,criticalFailure:false,durationMs:Date.now()-started,error:'invalid_or_ungrounded_output'});
      }
      await persist(false);
    }
    const report = await persist(!stopReason && results.length===total);
    reportLine(JSON.stringify({file,total,attempted:report.attempted,notRun:report.notRun,passed:report.passed,criticalFailures:report.criticalFailures,stopReason}));
    if (!report.complete || report.passed!==total || report.criticalFailures) process.exitCode=1;
  } finally {
    try {await closeDb?.();} finally {Object.assign(console,original);}
  }
}

main().catch(error=>{
  const safeCodes = ['invalid_arguments','choose_one_mode','database_unavailable','test_merchant_not_found','central_settings_missing','central_provider_disabled'];
  const code = safeCodes.includes(error?.message)?error.message:'runtime_preflight_failed';
  reportLine(JSON.stringify({mode:live?'live':preflight?'preflight':'dry-run',started:false,error:code}));
  process.exitCode=1;
});
