import http, { type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { withWooCommerceRequestAbortSignal } from './integrations/woocommerce-request-lifecycle';

const servers = new Set<Server>();
const agents = new Set<http.Agent>();

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('loopback_server_address_missing');
  return address.port;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections?.();
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function getConnectionCount(server: Server): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.getConnections((error, count) => error ? reject(error) : resolve(count));
  });
}

async function waitForNoConnections(server: Server): Promise<void> {
  await within((async () => {
    while (await getConnectionCount(server) !== 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  })(), 5_000);
}

async function within<T>(promise: Promise<T>, timeoutMs = 2_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('loopback_test_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

afterEach(async () => {
  for (const agent of agents) agent.destroy();
  agents.clear();
  await Promise.all([...servers].map(close));
  servers.clear();
});

describe('WooCommerce request lifecycle over a real HTTP socket', () => {
  it('aborts two batched consumers through one listener pair when the client disconnects', async () => {
    let requestEntered!: () => void;
    const entered = new Promise<void>(resolve => { requestEntered = resolve; });
    let resolveObservation!: (value: {
      signalsShared: boolean;
      values: boolean[];
      during: [number, number];
      after: [number, number];
    }) => void;
    let rejectObservation!: (error: unknown) => void;
    const observation = new Promise<{
      signalsShared: boolean;
      values: boolean[];
      during: [number, number];
      after: [number, number];
    }>((resolve, reject) => {
      resolveObservation = resolve;
      rejectObservation = reject;
    });

    const server = http.createServer((req, res) => {
      const initial: [number, number] = [req.listenerCount('aborted'), res.listenerCount('close')];
      const signals: AbortSignal[] = [];
      const waitForAbort = async (signal: AbortSignal): Promise<boolean> => {
        signals.push(signal);
        if (!signal.aborted) {
          await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
        }
        return signal.aborted;
      };
      const first = withWooCommerceRequestAbortSignal({ req, res }, waitForAbort);
      const second = withWooCommerceRequestAbortSignal({ req, res }, waitForAbort);
      const during: [number, number] = [
        req.listenerCount('aborted') - initial[0],
        res.listenerCount('close') - initial[1],
      ];
      requestEntered();
      Promise.all([first, second]).then(values => {
        resolveObservation({
          signalsShared: signals[0] === signals[1],
          values,
          during,
          after: [
            req.listenerCount('aborted') - initial[0],
            res.listenerCount('close') - initial[1],
          ],
        });
      }, rejectObservation);
    });
    servers.add(server);
    const port = await listen(server);

    const request = http.get({ host: '127.0.0.1', port, path: '/' });
    request.on('error', () => undefined);
    await within(entered);
    request.destroy();

    await expect(within(observation)).resolves.toEqual({
      signalsShared: true,
      values: [true, true],
      during: [1, 1],
      after: [0, 0],
    });
  });

  it('does not abort completed work and detaches listeners before a normal response closes', async () => {
    let resolveObservation!: (value: {
      signalsShared: boolean;
      aborted: boolean[];
      during: [number, number];
      after: [number, number];
    }) => void;
    const observation = new Promise<{
      signalsShared: boolean;
      aborted: boolean[];
      during: [number, number];
      after: [number, number];
    }>(resolve => { resolveObservation = resolve; });
    const server = http.createServer((req, res) => {
      const initial: [number, number] = [req.listenerCount('aborted'), res.listenerCount('close')];
      const signals: AbortSignal[] = [];
      let releaseActions!: () => void;
      const actionsMayComplete = new Promise<void>(resolve => { releaseActions = resolve; });
      const run = async (signal: AbortSignal): Promise<boolean> => {
        signals.push(signal);
        await actionsMayComplete;
        return signal.aborted;
      };
      const first = withWooCommerceRequestAbortSignal({ req, res }, run);
      const second = withWooCommerceRequestAbortSignal({ req, res }, run);
      const during: [number, number] = [
        req.listenerCount('aborted') - initial[0],
        res.listenerCount('close') - initial[1],
      ];
      releaseActions();
      Promise.all([first, second]).then(aborted => {
        resolveObservation({
          signalsShared: signals[0] === signals[1],
          aborted,
          during,
          after: [
            req.listenerCount('aborted') - initial[0],
            res.listenerCount('close') - initial[1],
          ],
        });
        res.end('ok');
      });
    });
    servers.add(server);
    const port = await listen(server);

    await within(new Promise<void>((resolve, reject) => {
      const request = http.get({ host: '127.0.0.1', port, path: '/' }, response => {
        response.resume();
        response.once('end', resolve);
      });
      request.once('error', reject);
    }));

    await expect(within(observation)).resolves.toEqual({
      signalsShared: true,
      aborted: [false, false],
      during: [1, 1],
      after: [0, 0],
    });
  });

  it('cleans up a 100-connection slow-client churn without listener or socket residue', async () => {
    const connectionTotal = 100;
    let enteredCount = 0;
    let resolveEntered!: () => void;
    const allEntered = new Promise<void>(resolve => { resolveEntered = resolve; });
    const observations: Array<{
      signalsShared: boolean;
      values: boolean[];
      during: [number, number];
      after: [number, number];
    }> = [];
    let resolveCompleted!: () => void;
    let rejectCompleted!: (error: unknown) => void;
    const allCompleted = new Promise<void>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    const server = http.createServer((req, res) => {
      const initial: [number, number] = [req.listenerCount('aborted'), res.listenerCount('close')];
      const signals: AbortSignal[] = [];
      const waitForAbort = async (signal: AbortSignal): Promise<boolean> => {
        signals.push(signal);
        if (!signal.aborted) {
          await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
        }
        return signal.aborted;
      };
      const first = withWooCommerceRequestAbortSignal({ req, res }, waitForAbort);
      const second = withWooCommerceRequestAbortSignal({ req, res }, waitForAbort);
      const during: [number, number] = [
        req.listenerCount('aborted') - initial[0],
        res.listenerCount('close') - initial[1],
      ];
      enteredCount += 1;
      if (enteredCount === connectionTotal) resolveEntered();
      Promise.all([first, second]).then(values => {
        observations.push({
          signalsShared: signals[0] === signals[1],
          values,
          during,
          after: [
            req.listenerCount('aborted') - initial[0],
            res.listenerCount('close') - initial[1],
          ],
        });
        if (observations.length === connectionTotal) resolveCompleted();
      }, rejectCompleted);
    });
    servers.add(server);
    const port = await listen(server);
    const agent = new http.Agent({ keepAlive: false, maxSockets: connectionTotal });
    agents.add(agent);
    const requests = Array.from({ length: connectionTotal }, () => {
      const request = http.request({
        agent,
        host: '127.0.0.1',
        port,
        path: '/',
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': '1048576',
        },
      });
      request.on('error', () => undefined);
      request.flushHeaders();
      return request;
    });

    await within(allEntered, 5_000);
    expect(await getConnectionCount(server)).toBe(connectionTotal);
    for (const request of requests) request.destroy();
    await within(allCompleted, 5_000);
    await waitForNoConnections(server);

    expect(observations).toHaveLength(connectionTotal);
    expect(observations.every(item => item.signalsShared)).toBe(true);
    expect(observations.every(item => item.values[0] && item.values[1])).toBe(true);
    expect(observations.every(item => item.during[0] === 1 && item.during[1] === 1)).toBe(true);
    expect(observations.every(item => item.after[0] === 0 && item.after[1] === 0)).toBe(true);
    expect(await getConnectionCount(server)).toBe(0);
  });
});
