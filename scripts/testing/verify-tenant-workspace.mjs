/** Opt-in HTTP + MySQL probes against a loopback, disposable tenant test environment.
 * Run with Node 22, --import=tsx, --env-file=<local test env>, and block-external-network.cjs.
 * Uses fresh synthetic users/tenants and deletes only the records it created.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import superjson from 'superjson';

const origin = new URL(process.env.SARI_TENANT_TEST_ORIGIN || 'http://127.0.0.1:3017');
const dbUrl = new URL(process.env.DATABASE_URL || '');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && origin.protocol === 'http:');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(dbUrl.hostname));
assert(['mysql:', 'mysql2:'].includes(dbUrl.protocol) && /^\/[a-z0-9_]*test[a-z0-9_]*$/i.test(dbUrl.pathname));
assert(!dbUrl.search && !dbUrl.hash && process.env.NODE_ENV !== 'production');
const connection = await mysql.createConnection({ host: dbUrl.hostname, port: Number(dbUrl.port) || 3306,
  user: decodeURIComponent(dbUrl.username), password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.slice(1), timezone: 'Z' });
await connection.query("SET SESSION time_zone = '+00:00'");
const prefix = `workspace-${randomUUID().slice(0, 8)}`;
const userIds = [];
const checks = [];
const cookies = new Map();
const password = randomUUID() + '!aA9';
let cleaned = false;
let completed = false;
let closeApplicationDb;

async function probe(name, test) {
  await test(); checks.push(name); console.log(`PASS ${name}`);
}
async function insert(sql, values) {
  const [result] = await connection.execute(sql, values);
  return result.insertId;
}
async function rpc(route, input, { account, method = 'GET', headers = {} } = {}) {
  const url = new URL(`/api/trpc/${route}`, origin);
  const payload = JSON.stringify(superjson.serialize(input));
  if (method === 'GET' && input !== undefined) url.searchParams.set('input', payload);
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json',
    origin: origin.origin, ...(account ? { cookie: cookies.get(account) } : {}), ...headers },
    ...(method === 'POST' ? { body: payload } : {}), signal: AbortSignal.timeout(15_000) });
  const json = await response.json();
  return { status: response.status, response, json, data: json.result?.data ? superjson.deserialize(json.result.data) : undefined,
    error: json.error?.json?.data?.code };
}
const ok = result => { assert.equal(result.status, 200, JSON.stringify(result.json)); return result.data; };
try {
  const hash = await bcrypt.hash(password, 10);
  for (const label of ['owner-a', 'owner-b', 'viewer']) {
    userIds.push(await insert('INSERT INTO users (openId, name, email, password, role, account_status) VALUES (?, ?, ?, ?, ?, ?)',
      [`${prefix}-${label}`, label, `${prefix}-${label}@example.test`, hash, 'user', 'active']));
  }
  const a = await insert('INSERT INTO merchants (userId, businessName, status, currency) VALUES (?, ?, ?, ?)', [userIds[0], `${prefix}-a`, 'active', 'SAR']);
  const b = await insert('INSERT INTO merchants (userId, businessName, status, currency) VALUES (?, ?, ?, ?)', [userIds[1], `${prefix}-b`, 'active', 'SAR']);
  await insert('INSERT INTO merchant_members (merchant_id, user_id, role) VALUES (?, ?, ?)', [a, userIds[2], 'viewer']);
  const attack = "literal %_' OR 1=1 --";
  const aConversation = await insert('INSERT INTO conversations (merchantId, customerPhone, customerName) VALUES (?, ?, ?)', [a, '966500000101', attack]);
  await insert('INSERT INTO conversations (merchantId, customerPhone, customerName) VALUES (?, ?, ?)', [a, '966500000102', 'second']);
  await insert('INSERT INTO conversations (merchantId, customerPhone, customerName) VALUES (?, ?, ?)', [a, '966500000103', 'third']);
  const bConversation = await insert('INSERT INTO conversations (merchantId, customerPhone, customerName) VALUES (?, ?, ?)', [b, '966500000104', 'tenant-b-secret']);
  await insert('INSERT INTO messages (conversationId, direction, content) VALUES (?, ?, ?)', [bConversation, 'incoming', 'tenant-b-secret']);
  const foreignCampaign = await insert('INSERT INTO campaigns (merchantId, name, message, status) VALUES (?, ?, ?, ?)', [b, 'foreign', 'secret', 'draft']);
  for (const [tenant, amount, currency, status, age] of [[a,10000,'SAR','delivered',1], [a,20000,'SAR','pending',1], [a,999999,'USD','delivered',1], [b,888888,'SAR','delivered',1], [a,60000,'SAR','delivered',40]]) {
    await insert('INSERT INTO orders (merchantId, customerPhone, customerName, items, totalAmount, currency, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tenant, '966500000101', 'test', JSON.stringify([{ name: 'Test product', quantity: 1, price: amount }]), amount, currency, status, new Date(Date.now() - age * 86400000)]);
  }
  await probe('anonymous inbox read is denied', async () => assert.equal((await rpc('conversations.list', {})).status, 401));
  await probe('anonymous analytics read is denied', async () => assert.equal((await rpc('dashboard.getSummary', {})).status, 401));
  await probe('anonymous campaign write is denied', async () => assert.equal((await rpc('campaigns.update', { id: foreignCampaign, name: 'attack' }, { method: 'POST' })).status, 401));
  for (const label of ['owner-a', 'owner-b', 'viewer']) {
    await probe(`${label} obtains a cookie session without a body token`, async () => {
      const result = await rpc('auth.login', { email: `${prefix}-${label}@example.test`, password }, { method: 'POST' });
      const data = ok(result);
      assert.equal(data.success, true);
      assert(!JSON.stringify(data).match(/sessionToken|accessToken/));
      const cookie = result.response.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
      cookies.set(label, cookie.split(';')[0]);
    });
  }
  await probe('pagination reads only tenant A records', async () => {
    const first = ok(await rpc('conversations.list', { page: 1, pageSize: 2 }, { account: 'owner-a' }));
    const second = ok(await rpc('conversations.list', { page: 2, pageSize: 2 }, { account: 'owner-a' }));
    assert.equal(first.total, 3); assert.equal(first.totalPages, 2);
    assert.equal(first.items.length, 2); assert.equal(second.items.length, 1);
    assert([...first.items, ...second.items].every(item => item.merchantId === a));
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 3);
  });
  await probe('SQL injection metacharacters are searched literally', async () => {
    const result = ok(await rpc('conversations.list', { search: attack }, { account: 'owner-a' }));
    assert.equal(result.total, 1); assert.equal(result.items[0].id, aConversation);
  });
  await probe('search never reveals another tenant customer', async () => {
    const result = ok(await rpc('conversations.list', { search: 'tenant-b-secret' }, { account: 'owner-a' }));
    assert.equal(result.total, 0); assert.deepEqual(result.items, []);
  });
  await probe('invalid stage cannot widen literal search', async () => {
    const result = ok(await rpc('conversations.list', { search: attack, stage: "' OR 1=1 --" }, { account: 'owner-a' }));
    assert.equal(result.total, 1); assert.equal(result.items[0].id, aConversation);
  });
  await probe('forged merchant selection is denied', async () => {
    assert.equal((await rpc('conversations.list', {}, { account: 'owner-a', headers: { 'x-merchant-id': String(b) } })).status, 403);
    assert.equal((await rpc('dashboard.getSummary', {}, { account: 'owner-a', headers: { 'x-merchant-id': String(b) } })).status, 403);
  });
  await probe('cross-tenant message and campaign IDOR are denied', async () => {
    assert.equal((await rpc('conversations.getMessages', { conversationId: bConversation }, { account: 'owner-a' })).status, 403);
    assert.equal((await rpc('campaigns.getById', { id: foreignCampaign }, { account: 'owner-a' })).status, 403);
    assert.equal((await rpc('campaigns.update', { id: foreignCampaign, name: 'attack' }, { account: 'owner-a', method: 'POST' })).status, 403);
  });
  for (const input of [{ search: 'x'.repeat(201) }, { page: 1.5 }, { pageSize: 101 }, { page: 1e10 }]) {
    await probe(`inbox rejects oversized or fractional input ${Object.keys(input)[0]}=${String(Object.values(input)[0]).slice(0, 12)}`, async () => {
      assert.equal((await rpc('conversations.list', input, { account: 'owner-a' })).status, 400);
    });
  }
  for (const input of [{ days: -1 }, { days: 1e9 }, { days: 1.5 }, { topProductsLimit: 100000 }]) {
    await probe(`analytics rejects invalid ${Object.keys(input)[0]}=${Object.values(input)[0]}`, async () => {
      assert.equal((await rpc('dashboard.getSummary', input, { account: 'owner-a' })).status, 400);
    });
  }
  await probe('analytics isolates tenant, currency, period and delivered state', async () => {
    const summary = ok(await rpc('dashboard.getSummary', { days: 7, topProductsLimit: 5, merchantId: b, currency: 'USD' }, { account: 'owner-a' }));
    assert.equal(summary.currency, 'SAR'); assert.equal(Number(summary.stats.totalOrders), 2);
    assert.equal(Number(summary.stats.totalRevenue), 30000); assert.equal(Number(summary.stats.completedOrders), 1);
    assert.equal(Number(summary.revenueTrend[0].revenue), 10000);
    assert.equal(summary.topProducts[0].totalRevenue, 10000);
  });
  let campaignId;
  await probe('owner creates a draft without dispatch', async () => {
    const created = ok(await rpc('campaigns.create', { name: 'security-test', message: 'Synthetic test only' }, { account: 'owner-a', method: 'POST' }));
    campaignId = created.id; assert(campaignId > 0); assert.equal(created.status, 'draft');
  });
  await probe('viewer cannot create, edit, or reply', async () => {
    assert.equal((await rpc('campaigns.create', { name: 'forbidden', message: 'forbidden' }, { account: 'viewer', method: 'POST' })).status, 403);
    assert.equal((await rpc('campaigns.update', { id: campaignId, name: 'forbidden' }, { account: 'viewer', method: 'POST' })).status, 403);
    assert.equal((await rpc('conversations.sendReply', { conversationId: aConversation, message: 'forbidden' }, { account: 'viewer', method: 'POST' })).status, 403);
  });
  await probe('campaign edit cannot forge server-owned fields or tenant', async () => {
    for (const input of [{ id: campaignId, status: 'sending' }, { id: campaignId, sentCount: 99 }, { id: campaignId, merchantId: b }, { id: campaignId }]) {
      assert.equal((await rpc('campaigns.update', input, { account: 'owner-a', method: 'POST' })).status, 400);
    }
  });
  await probe('campaign schedule is validated by the API', async () => {
    for (const scheduledAt of [new Date('2000-01-01Z'), new Date('2040-01-01Z')]) {
      assert.equal((await rpc('campaigns.update', { id: campaignId, scheduledAt }, { account: 'owner-a', method: 'POST' })).status, 400);
    }
  });
  await probe('unsafe image schemes and credentials are rejected', async () => {
    for (const imageUrl of ['file:///secret', 'http://example.test/img', 'https://user:pass@example.test/img']) {
      assert.equal((await rpc('campaigns.update', { id: campaignId, imageUrl }, { account: 'owner-a', method: 'POST' })).status, 400);
    }
  });
  await probe('schedule round trip preserves UTC then can be cleared to draft', async () => {
    const scheduledAt = new Date(Date.now() + 86400000);
    scheduledAt.setMilliseconds(0);
    ok(await rpc('campaigns.update', { id: campaignId, scheduledAt, imageUrl: 'https://example.test/test.png' }, { account: 'owner-a', method: 'POST' }));
    const scheduled = ok(await rpc('campaigns.getById', { id: campaignId }, { account: 'owner-a' }));
    assert.equal(scheduled.status, 'scheduled');
    assert.equal(new Date(scheduled.scheduledAt.replace(' ', 'T') + 'Z').getTime(), scheduledAt.getTime());
    ok(await rpc('campaigns.update', { id: campaignId, scheduledAt: null, imageUrl: null }, { account: 'owner-a', method: 'POST' }));
    const draft = ok(await rpc('campaigns.getById', { id: campaignId }, { account: 'owner-a' }));
    assert.equal(draft.status, 'draft'); assert.equal(draft.scheduledAt, null); assert.equal(draft.imageUrl, null);
    assert.equal(draft.sentCount, 0); assert.equal(draft.totalRecipients, 0);
  });
  await probe('sending or terminal campaigns cannot be reopened', async () => {
    for (const status of ['sending', 'completed', 'failed']) {
      await connection.execute('UPDATE campaigns SET status = ? WHERE id = ? AND merchantId = ?', [status, campaignId, a]);
      assert.equal((await rpc('campaigns.update', { id: campaignId, scheduledAt: null }, { account: 'owner-a', method: 'POST' })).status, 400);
      const [[row]] = await connection.execute('SELECT status FROM campaigns WHERE id = ?', [campaignId]);
      assert.equal(row.status, status);
    }
  });
  await probe('database write guard rejects a stale draft after dispatcher claim', async () => {
    const { updateEditableCampaign } = await import('../../server/db.ts');
    const { closeDb } = await import('../../server/db/connection.ts');
    closeApplicationDb = closeDb;
    await connection.execute("UPDATE campaigns SET status = 'draft' WHERE id = ? AND merchantId = ?", [campaignId, a]);
    const [[stale]] = await connection.execute('SELECT status FROM campaigns WHERE id = ?', [campaignId]);
    assert.equal(stale.status, 'draft');
    await connection.execute("UPDATE campaigns SET status = 'sending' WHERE id = ? AND merchantId = ?", [campaignId, a]);
    assert.equal(await updateEditableCampaign(campaignId, a, { status: 'draft', name: 'stale edit' }), false);
    const [[claimed]] = await connection.execute('SELECT status, name FROM campaigns WHERE id = ?', [campaignId]);
    assert.equal(claimed.status, 'sending'); assert.equal(claimed.name, 'security-test');
    assert.equal(await updateEditableCampaign(foreignCampaign, a, { name: 'foreign edit' }), false);
  });
  await probe('logout revokes the same HTTP session cookie', async () => {
    ok(await rpc('auth.logout', undefined, { account: 'owner-a', method: 'POST' }));
    assert.equal((await rpc('conversations.list', {}, { account: 'owner-a' })).status, 401);
  });
  await probe('tenant B data remains unchanged', async () => {
    const foreign = ok(await rpc('campaigns.getById', { id: foreignCampaign }, { account: 'owner-b' }));
    assert.equal(foreign.name, 'foreign'); assert.equal(foreign.status, 'draft');
    const inbox = ok(await rpc('conversations.list', {}, { account: 'owner-b' }));
    assert.equal(inbox.total, 1); assert.equal(inbox.items[0].id, bConversation);
  });
  completed = true;
} finally {
  // These are synthetic users created above, never IDs taken from existing data.
  for (const id of userIds.reverse()) await connection.execute('DELETE FROM users WHERE id = ? AND openId LIKE ?', [id, `${prefix}-%`]);
  const [[remaining]] = await connection.execute('SELECT COUNT(*) AS total FROM users WHERE openId LIKE ?', [`${prefix}-%`]);
  cleaned = Number(remaining.total) === 0;
  await closeApplicationDb?.();
  await connection.end();
  if (process.env.SARI_TENANT_TEST_REPORT) writeFileSync(process.env.SARI_TENANT_TEST_REPORT,
    JSON.stringify({ date: new Date().toISOString(), scope: 'Loopback HTTP and MySQL, synthetic tenants only', completed, passed: checks.length, checks, cleaned }, null, 2) + '\n');
}
assert(cleaned, 'Synthetic fixtures must be cleaned');
console.log(`Completed ${checks.length} live security probes; fixtures cleaned.`);
