import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import jwt from 'jsonwebtoken';
import superjson from 'superjson';
import { appRouter } from './routers';
import { createContext } from './_core/context';
import { createSessionToken } from './_core/auth';
import { revokeAuthSession } from './db';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';

describe.skipIf(!process.env.DATABASE_URL)('HTTP session, tenant and privilege penetration probes (MySQL)', () => {
  const userIds: number[] = [];
  const previousSecret = process.env.JWT_SECRET;
  let server: Server;
  let base: string;
  let owner: { userId: number; merchantId: number };
  let foreign: { userId: number; merchantId: number };
  let viewer: { userId: number; merchantId: number };
  let ownerToken: string;
  let viewerToken: string;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'disposable-http-probe-secret-not-for-production';
    for (const label of ['http-owner', 'http-foreign', 'http-viewer']) {
      const account = await createDisposableMerchant(label);
      userIds.push(account.userId);
      if (label === 'http-owner') owner = account;
      else if (label === 'http-foreign') foreign = account;
      else viewer = account;
    }
    await (await getPool())!.execute('INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)', [owner.merchantId, viewer.userId, 'viewer']);
    // This actor is a team member only; its fixture-owned store must not create
    // a legitimate independent legacy-owner access path after revocation.
    await (await getPool())!.execute("UPDATE merchants SET status='suspended' WHERE id=?", [viewer.merchantId]);
    ownerToken = await createSessionToken(String(owner.userId));
    viewerToken = await createSessionToken(String(viewer.userId));
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    app.use('/api/trpc', createExpressMiddleware({ router: appRouter, createContext }));
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing probe address');
    base = `http://127.0.0.1:${address.port}/api/trpc`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    await cleanupDisposableMerchants(userIds);
    await closeDb();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  async function rpc(path: string, input?: unknown, token?: string, mutation = false) {
    const payload = JSON.stringify(superjson.serialize(input));
    const response = await fetch(`${base}/${path}${mutation ? '' : `?input=${encodeURIComponent(payload)}`}`, {
      method: mutation ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(mutation ? { body: payload } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  it('rejects anonymous and tampered signed sessions', async () => {
    expect((await rpc('products.list')).status).toBe(401);
    const parts = ownerToken.split('.');
    parts[1] = Buffer.from(JSON.stringify({ ...jwt.decode(ownerToken) as object, userId: String(foreign.userId), role: 'admin' })).toString('base64url');
    expect((await rpc('products.list', undefined, parts.join('.'))).status).toBe(401);
  });
  it('permits an authenticated owner and viewer to read their shared tenant', async () => {
    expect((await rpc('products.list', undefined, ownerToken)).status).toBe(200);
    expect((await rpc('products.list', undefined, viewerToken)).status).toBe(200);
  });
  it('blocks viewer role escalation, payment secrets and order mutation over HTTP', async () => {
    expect((await rpc('merchantPayments.getSettings', undefined, viewerToken)).status).toBe(403);
    expect((await rpc('team.updateRole', { memberId: 1, role: 'owner' }, viewerToken, true)).status).toBe(403);
    expect((await rpc('orders.updateStatus', { orderId: 1, status: 'paid' }, viewerToken, true)).status).toBe(403);
  });
  it('rejects foreign tenant analytics and SQL-shaped identifiers before business actions', async () => {
    expect((await rpc('analytics.getDashboardKPIs', { merchantId: foreign.merchantId, startDate: '2026-09-01', endDate: '2026-09-19' }, ownerToken)).status).toBe(403);
    expect((await rpc('orders.cancel', { orderId: '1 OR 1=1' }, ownerToken, true)).status).toBe(400);
  });
  it('does not trust a role claim even with a valid signature and live session', async () => {
    const forgedRoleToken = jwt.sign({ ...jwt.decode(viewerToken) as object, role: 'admin' }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
    expect((await rpc('merchantPayments.getSettings', undefined, forgedRoleToken)).status).toBe(403);
  });
  it('revokes access immediately after logout', async () => {
    const token = await createSessionToken(String(owner.userId));
    const session = jwt.decode(token) as { sessionId: string };
    await revokeAuthSession(owner.userId, session.sessionId);
    expect((await rpc('products.list', undefined, token)).status).toBe(401);
  });
  it('revokes tenant access immediately while the login session remains valid', async () => {
    await (await getPool())!.execute('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [owner.merchantId, viewer.userId]);
    expect((await rpc('products.list', undefined, viewerToken)).status).toBe(403);
  });
});
