import { claimInbound, executeInbound } from '../../messaging/inbound-jobs';
import { assertDisposableDatabase } from './disposable-merchant';

async function main() {
assertDisposableDatabase();
const job = await claimInbound(Number(process.argv[4]));
if (!job) throw new Error('Fixture job missing');
process.send?.({ phase: 'claimed', id: job.id });
await new Promise<void>(resolve => process.once('message', () => resolve()));
if (process.argv[2] === 'claim') await new Promise(() => {});
await executeInbound(job, async () => {
  if (process.argv[2] === 'accepted') {
    const url = new URL(process.argv[3]);
    if (url.hostname !== '127.0.0.1') throw new Error('Only a local synthetic provider is permitted');
    await fetch(url, { method: 'POST', body: JSON.stringify({ fixtureJobId: job.id }) });
  }
  process.send?.({ phase: 'executing', id: job.id });
  await new Promise(() => {});
  return { success: true };
});
}
main().catch(() => { process.exitCode = 1; process.disconnect?.(); });
