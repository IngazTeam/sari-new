import { fork, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, afterAll, describe, expect, it } from 'vitest';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { getPool, closeDb } from '../db/connection';
import { enqueueInbound, recoverExpiredInbound, claimInbound, assertInboundOwned } from './inbound-jobs';

describe.skipIf(!process.env.DATABASE_URL)('real process crash recovery', () => {
  const users: number[] = [];
  let child: ChildProcess | undefined;
  let merchantId: number;
  const localProvider = createServer((request, response) => { request.resume(); received++; response.end('{"accepted":true}'); });
  let received = 0;
  afterEach(async () => {
    if (child && child.exitCode === null && child.signalCode === null) { const ended = new Promise<void>(resolve => child!.once('exit', () => resolve())); child.kill('SIGKILL'); await ended; }
    await cleanupDisposableMerchants(users.splice(0));
    if (localProvider.listening) await new Promise<void>(resolve => localProvider.close(() => resolve()));
  });
  afterAll(closeDb);
  async function fixture() {
    const account = await createDisposableMerchant('process-crash'); users.push(account.userId);
    merchantId = account.merchantId;
    const instance = randomUUID();
    await (await getPool())!.execute("INSERT INTO whatsapp_instances (merchant_id, instance_id, token, provider, status) VALUES (?, ?, 'fixture', 'green_api', 'active')", [account.merchantId, instance]);
    return enqueueInbound({ source: 'webhook', payload: { typeWebhook: 'incomingMessageReceived', idMessage: randomUUID(),
      instanceData: { idInstance: instance }, senderData: { chatId: '966500000012@c.us' }, timestamp: Math.floor(Date.now() / 1000),
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'synthetic fault probe' } } } });
  }
  function phase(name: string) {
    return new Promise<any>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`Child did not reach ${name}`)), 15_000);
      const listen = (message: any) => { if (message.phase === name) { clearTimeout(deadline); child!.off('message', listen); resolve(message); } };
      child!.on('message', listen);
      child!.once('error', error => { clearTimeout(deadline); reject(error); });
    });
  }
  async function killAndExpire(id: number) {
    const ended = new Promise<void>(resolve => child!.once('exit', () => resolve()));
    child!.kill('SIGKILL'); await ended;
    await (await getPool())!.execute('UPDATE whatsapp_inbound_jobs SET lease_until = TIMESTAMPADD(SECOND, -1, UTC_TIMESTAMP(3)) WHERE id = ?', [id]);
    await recoverExpiredInbound();
  }
  it('reclaims a process killed before business execution and fences the dead owner', async () => {
    const queued = await fixture();
    child = fork(resolve('server/tests/helpers/inbound-crash-child.ts'), ['claim', '', String(merchantId)], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
    const claimed = await phase('claimed'); expect(claimed.id).toBe(queued.id);
    const [rows] = await (await getPool())!.execute<any[]>('SELECT lease_token FROM whatsapp_inbound_jobs WHERE id = ?', [queued.id]);
    const oldToken = rows[0].lease_token;
    await killAndExpire(queued.id);
    const reclaimed = await claimInbound(merchantId); expect(reclaimed?.id).toBe(queued.id);
    await expect(assertInboundOwned({ id: queued.id, lease_token: oldToken })).rejects.toThrow('lease lost');
  }, 25_000);
  it('does not replay an external effect when a real worker dies after provider acceptance', async () => {
    const queued = await fixture(); received = 0;
    await new Promise<void>(resolve => localProvider.listen(0, '127.0.0.1', () => resolve()));
    const address = localProvider.address() as { port: number };
    child = fork(resolve('server/tests/helpers/inbound-crash-child.ts'), ['accepted', `http://127.0.0.1:${address.port}`, String(merchantId)],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
    await phase('claimed'); const executing = phase('executing'); child.send('continue'); await executing;
    expect(received).toBe(1);
    await killAndExpire(queued.id);
    expect(await claimInbound(merchantId)).toBeNull(); expect(received).toBe(1);
    const [rows] = await (await getPool())!.execute<any[]>('SELECT status, error_code FROM whatsapp_inbound_jobs WHERE id = ?', [queued.id]);
    expect(rows).toEqual([{ status: 'review', error_code: 'worker_interrupted' }]);
  }, 25_000);
});
