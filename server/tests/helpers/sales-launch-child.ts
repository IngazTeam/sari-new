import { revokeSalesExperimentLaunch } from '../../ai/sales-experiment-launch';
import { closeDb } from '../../db/connection';

process.once('message', async () => {
  try {
    const result = await revokeSalesExperimentLaunch(Number(process.argv[2]), Number(process.argv[3]), JSON.parse(process.argv[4]));
    process.send?.({ phase: 'done', result });
  } catch { process.send?.({ phase: 'done', failed: true }); }
  finally { await closeDb(); process.disconnect?.(); }
});
process.send?.({ phase: 'ready' });
