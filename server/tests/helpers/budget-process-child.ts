import { reserveAiBudget } from '../../ai/budget-ledger';
import { closeDb } from '../../db/connection';
import { assertDisposableDatabase } from './disposable-merchant';

async function main() {
  assertDisposableDatabase();
  const request = JSON.parse(process.argv[2]);
  try {
    const reservation = await reserveAiBudget(request);
    process.send?.({ accepted: true, reservation });
    if (process.argv[3] === 'hold') await new Promise(() => { setInterval(() => {}, 1000); });
  } catch (error: any) { process.send?.({ accepted: false, code: error.code || 'unexpected' }); }
  await closeDb();
  process.disconnect?.();
}
main().catch(() => { process.exitCode = 1; process.disconnect?.(); });
