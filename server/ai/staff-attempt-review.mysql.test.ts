import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), upload: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: mocks.send }) }));
vi.mock('../storage', () => ({ storagePut: mocks.upload }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { trySendDashboardStaff } from './staff-dashboard-reply';
import { trySendDashboardVoice } from './staff-dashboard-voice';
import { listStaffAttempts, checkStaffAttempt } from './staff-attempt-review';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';

describe.each(['text', 'voice'] as const)('%s history and SQL-only checks', kind => {
  describe.each(['registered', 'group', 'legacy'] as const)('%s account', channel => {
    describe.skipIf(!process.env.DATABASE_URL)('on isolated MySQL', () => {
      let f: Awaited<ReturnType<typeof createDisposableMerchant>>, conv: number, requestId: string;
      const table = kind === 'text' ? 'ai_sales_staff_replies' : 'ai_sales_staff_voices';
      const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
      const send = () => kind === 'text' ? trySendDashboardStaff(f.merchantId, f.userId, { conversationId: conv, requestId, message: 'private original text' })
        : trySendDashboardVoice(f.merchantId, f.userId, { conversationId: conv, requestId, audioBase64: Buffer.from('OggSsynthetic').toString('base64'), mimeType: 'audio/ogg', duration: 3 });
      const row = async () => (await q(`SELECT * FROM ${table} WHERE merchant_id=? ORDER BY id DESC`, [f.merchantId]))[0];
      const list = (beforeId?: number) => listStaffAttempts(f.merchantId, f.userId, { conversationId: conv, kind, beforeId });
      const check = async () => checkStaffAttempt(f.merchantId, f.userId, { conversationId: conv, kind, sourceId: (await row()).id });
      const once = () => { expect(mocks.send).toHaveBeenCalledOnce(); expect(mocks.upload).toHaveBeenCalledTimes(kind === 'voice' ? 1 : 0); };
      beforeEach(async () => {
        f = await createDisposableMerchant('staff-review'); requestId = randomUUID();
        conv = Number((await q('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [f.merchantId, channel === 'group' ? 'group_120363123' : '966500006611'])).insertId);
        if (channel === 'legacy') await q("INSERT INTO whatsapp_connection_requests (merchantId,countryCode,phoneNumber,fullNumber,status,instanceId,apiToken,apiUrl) VALUES (?,'966','500006611','966500006611','connected','710000001','fixture','https://api.green-api.com')", [f.merchantId]);
        else await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary,api_url) VALUES (?,'710000001','fixture','active',1,'https://api.green-api.com')", [f.merchantId]);
        mocks.send.mockReset().mockResolvedValue({ accepted: true, status: 'sent', providerMessageId: `receipt-${f.merchantId}` });
        mocks.upload.mockReset().mockImplementation(async (key: string) => ({ key, url: `https://media.example.test/${key}` }));
      });
      afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([f.userId]); }); afterAll(closeDb);
      async function failFinalSave() {
        const pool = (await getPool())!, connect = pool.getConnection.bind(pool);
        vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
          const c = await connect(), execute = c.execute.bind(c);
          vi.spyOn(c, 'execute').mockImplementation(((sql: any, args: any) => {
            if (String(sql).includes("SET status='accepted'")) throw Error('synthetic final save failure'); return execute(sql, args);
          }) as any); return c;
        });
      }
      async function unresolved() {
        mocks.send.mockImplementationOnce(async () => { await failFinalSave(); return { accepted: true, status: 'sent', providerMessageId: `receipt-${f.merchantId}` }; });
        expect(await send()).toMatchObject({ success: false }); vi.restoreAllMocks(); expect((await row()).status).toBe('reserved');
      }
      it('returns only bounded metadata and does not expose content, identities or credentials', async () => {
        await send(); const result = await list(); expect(result.items).toEqual([{ id: (await row()).id, createdAt: expect.any(String), state: 'accepted', persisted: true }]);
        expect(JSON.stringify(result)).not.toMatch(/private|media\.|requestId|customerPhone|actor|token|receipt/); once();
      });
      it('recovers after reconnect without original content, recording or an external effect', async () => {
        await unresolved(); expect((await list()).items[0].state).toBe('pending'); await closeDb();
        const results = await Promise.all(Array.from({ length: 5 }, check));
        expect(results.every(r => r.success && r.persisted)).toBe(true);
        expect((await list()).items[0].state).toBe('accepted'); once();
      });
      it('retains the same result after a lost review commit acknowledgement', async () => {
        await unresolved(); const pool = (await getPool())!, connect = pool.getConnection.bind(pool); let commits = 0;
        vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
          const c = await connect(), commit = c.commit.bind(c); vi.spyOn(c, 'commit').mockImplementation(async () => { await commit(); if (++commits === 2) throw Error('lost acknowledgement'); }); return c;
        });
        await expect(check()).rejects.toThrow(); vi.restoreAllMocks(); expect((await check()).success).toBe(true); once();
      });
      it.each(['actor', 'suspended', 'disabled'])('rejects %s revocation both before and during the review', async change => {
        await unresolved(); const changeAuthority = () => q(change === 'actor' ? "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)"
          : change === 'suspended' ? "UPDATE merchants SET status='suspended' WHERE id=?" : "UPDATE users SET account_status='deletion_pending' WHERE id=?",
        change === 'actor' ? [f.merchantId, f.userId] : [change === 'suspended' ? f.merchantId : f.userId]);
        const pool = (await getPool())!, connect = pool.getConnection.bind(pool); let changed = false;
        vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
          const c = await connect(), commit = c.commit.bind(c); vi.spyOn(c, 'commit').mockImplementation(async () => { await commit(); if (!changed) { changed = true; await changeAuthority(); } }); return c;
        });
        await expect(check()).rejects.toThrow(); vi.restoreAllMocks(); await expect(list()).rejects.toThrow(); await expect(check()).rejects.toThrow();
        expect((await row()).status).toBe('reserved'); once();
      });
      it('isolates another authorized actor, merchant and conversation', async () => {
        await unresolved(); const other = await createDisposableMerchant('review-other'), r = await row();
        try {
          await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [f.merchantId, other.userId]);
          expect((await listStaffAttempts(f.merchantId, other.userId, { conversationId: conv, kind })).items).toEqual([]);
          expect((await listStaffAttempts(other.merchantId, other.userId, { conversationId: conv, kind })).items).toEqual([]);
          for (const [merchant, actor, conversation] of [[f.merchantId, other.userId, conv], [other.merchantId, other.userId, conv], [f.merchantId, f.userId, conv + 1]])
            await expect(checkStaffAttempt(merchant, actor, { conversationId: conversation, kind, sourceId: r.id })).rejects.toThrow();
          once();
        } finally { await cleanupDisposableMerchants([other.userId]); }
      });
      it('rechecks the conversation binding after preflight even if a replacement snapshot is internally consistent', async () => {
        await unresolved(); const pool = (await getPool())!, connect = pool.getConnection.bind(pool); let replaced = false;
        const parse = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
        vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
          const c = await connect(), commit = c.commit.bind(c); vi.spyOn(c, 'commit').mockImplementation(async () => {
            await commit(); if (replaced) return; replaced = true; const r = await row(), conversation = conv + 100000;
            if (kind === 'text') { const b = parse(r.basis); b.conversationId = conversation;
              await q(`UPDATE ${table} SET conversation_id=?,basis=?,basis_digest=? WHERE id=?`, [conversation, JSON.stringify(b), hash(b), r.id]);
            } else { const i = parse(r.intent), b = parse(r.basis); i.conversationId = conversation; b.intentDigest = hash(i); if (channel === 'registered') b.intent = i;
              await q(`UPDATE ${table} SET conversation_id=?,intent=?,intent_digest=?,basis=?,basis_digest=? WHERE id=?`, [conversation, JSON.stringify(i), hash(i), JSON.stringify(b), hash(b), r.id]);
            }
          }); return c;
        });
        await expect(check()).rejects.toThrow(); vi.restoreAllMocks(); expect((await row()).status).toBe('reserved');
        expect(await q('SELECT * FROM messages WHERE conversationId=?', [conv])).toEqual([]); once();
      });
      it('cannot create or dispatch a missing attempt', async () => {
        await expect(checkStaffAttempt(f.merchantId, f.userId, { conversationId: conv, kind, sourceId: 2147483647 })).rejects.toThrow();
        expect((await list()).items).toEqual([]); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
      });
      it.each(['pending', 'accepted'])('marks corrupted %s evidence unavailable without leaking its contents', async state => {
        if (state === 'pending') await unresolved(); else await send();
        await q(`UPDATE ${table} SET ${kind === 'text' ? 'basis_digest' : 'intent_digest'}=REPEAT('a',64) WHERE merchant_id=?`, [f.merchantId]);
        expect((await list()).items[0]).toMatchObject({ state: 'unavailable', persisted: null }); await expect(check()).rejects.toThrow(); once();
      });
      it('preserves historical acceptance after the source conversation is deleted', async () => {
        await send(); await q('DELETE FROM conversations WHERE id=?', [conv]);
        expect((await list()).items[0].state).toBe('accepted'); expect(await check()).toMatchObject({ success: true });
        expect(await q('SELECT * FROM messages WHERE conversationId=?', [conv])).toEqual([]); once();
      });
      it('never guesses acceptance for a failed provider result', async () => {
        mocks.send.mockResolvedValue({ accepted: false, status: 'failed', outcome: 'rejected', errorCode: 'http_400' }); await send();
        expect((await list()).items[0].state).toBe('pending'); expect(await check()).toMatchObject({ success: false }); once();
      });
      if (channel === 'registered') it('does not display an accepted database flag without a valid acceptance fact', async () => {
        await send(); await q('DELETE FROM ai_sales_staff_acceptances WHERE merchant_id=?', [f.merchantId]);
        expect((await list()).items[0]).toMatchObject({ state: 'unavailable', persisted: null }); await expect(check()).rejects.toThrow(); once();
      });
      if (channel === 'group') it('paginates deterministically, survives deletion and excludes a new attempt from older pages', async () => {
        for (let n = 0; n < 23; n++) { requestId = randomUUID(); mocks.send.mockResolvedValue({ accepted: true, status: 'sent', providerMessageId: `receipt-${f.merchantId}-${n}` }); await send(); }
        const first = await list(); expect(first.items).toHaveLength(20); expect(first.nextCursor).toBe(first.items.at(-1)!.id);
        await q(`DELETE FROM ${table} WHERE id=?`, [first.nextCursor]);
        requestId = randomUUID(); mocks.send.mockResolvedValue({ accepted: true, status: 'sent', providerMessageId: `new-${f.merchantId}` }); await send();
        const older = await list(first.nextCursor!); expect(older.items).toHaveLength(3); expect(older.nextCursor).toBeNull();
        expect(older.items.every(r => r.id < first.nextCursor!)).toBe(true);
      });
    });
  });
});
