import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { registerMerchantAccount } from './accounts/lifecycle';
import {
  acceptTeamInvitation,
  inspectTeamInvitation,
  issueTeamInvitation,
  TeamInvitationError,
} from './accounts/team-invitations';
import { getPool } from './db';

describe.skipIf(!process.env.DATABASE_URL)('team invitation security (database integration)', () => {
  const createdUserIds: number[] = [];

  afterAll(async () => {
    const pool = await getPool();
    if (!pool || createdUserIds.length === 0) return;
    const placeholders = createdUserIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM consent_receipts WHERE user_id IN (${placeholders})`, createdUserIds);
    await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
  });

  async function createAccount(label: string) {
    const nonce = randomUUID().replaceAll('-', '');
    const email = `${label}-${nonce}@example.test`;
    const account = await registerMerchantAccount({
      name: `${label} Test`,
      email,
      passwordHash: '$2b$10$test.only.hash.not.used.for.login',
      businessName: `${label} Test Store`,
      phone: '+966500000002',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
    });
    createdUserIds.push(account.user.id);
    return { ...account, email };
  }

  async function verifyUser(userId: number) {
    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    await pool.execute('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [userId]);
  }

  it('stores only a digest and accepts exactly once for the verified recipient', async () => {
    const owner = await createAccount('invite-owner');
    const recipient = await createAccount('invite-recipient');
    await verifyUser(recipient.user.id);
    const invitation = await issueTeamInvitation({
      merchantId: owner.merchantId,
      email: recipient.email,
      role: 'manager',
      invitedBy: owner.user.id,
    });

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [storedBefore] = await pool.execute(
      `SELECT token, recipient_hash AS recipientHash, status
         FROM merchant_invitations WHERE merchant_id = ?`,
      [owner.merchantId],
    );
    expect(storedBefore as any[]).toHaveLength(1);
    expect((storedBefore as any[])[0].token).toMatch(/^[a-f0-9]{64}$/);
    expect((storedBefore as any[])[0].token).not.toBe(invitation.token);
    expect((storedBefore as any[])[0].recipientHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await inspectTeamInvitation(invitation.token)).toMatchObject({ role: 'manager' });

    const first = await acceptTeamInvitation({ token: invitation.token, userId: recipient.user.id });
    const replay = await acceptTeamInvitation({ token: invitation.token, userId: recipient.user.id });
    expect(first).toEqual({ merchantId: owner.merchantId, alreadyAccepted: false });
    expect(replay).toEqual({ merchantId: owner.merchantId, alreadyAccepted: true });

    const [memberships] = await pool.execute(
      `SELECT role FROM merchant_members WHERE merchant_id = ? AND user_id = ?`,
      [owner.merchantId, recipient.user.id],
    );
    expect(memberships as any[]).toEqual([{ role: 'manager' }]);
    const [storedAfter] = await pool.execute(
      `SELECT status, recipient_hash AS recipientHash, accepted_by_user_id AS acceptedByUserId
         FROM merchant_invitations WHERE merchant_id = ?`,
      [owner.merchantId],
    );
    expect((storedAfter as any[])[0]).toMatchObject({
      status: 'accepted',
      recipientHash: null,
      acceptedByUserId: recipient.user.id,
    });
  });

  it('rejects a different logged-in identity without consuming the invitation', async () => {
    const owner = await createAccount('mismatch-owner');
    const recipient = await createAccount('mismatch-recipient');
    const attacker = await createAccount('mismatch-attacker');
    await verifyUser(recipient.user.id);
    await verifyUser(attacker.user.id);
    const invitation = await issueTeamInvitation({
      merchantId: owner.merchantId,
      email: recipient.email,
      role: 'viewer',
      invitedBy: owner.user.id,
    });

    await expect(acceptTeamInvitation({
      token: invitation.token,
      userId: attacker.user.id,
    })).rejects.toMatchObject<TeamInvitationError>({ code: 'recipient_mismatch' });

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [invitations] = await pool.execute(
      `SELECT status FROM merchant_invitations WHERE merchant_id = ?`,
      [owner.merchantId],
    );
    expect((invitations as any[])[0].status).toBe('pending');
    const [memberships] = await pool.execute(
      `SELECT id FROM merchant_members WHERE merchant_id = ? AND user_id = ?`,
      [owner.merchantId, attacker.user.id],
    );
    expect(memberships as any[]).toHaveLength(0);
  });

  it('serializes concurrent issuance and leaves one pending invitation', async () => {
    const owner = await createAccount('concurrent-owner');
    const recipient = await createAccount('concurrent-recipient');
    const input = {
      merchantId: owner.merchantId,
      email: recipient.email,
      role: 'sales_supervisor' as const,
      invitedBy: owner.user.id,
    };
    const results = await Promise.allSettled([
      issueTeamInvitation(input),
      issueTeamInvitation(input),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);

    const pool = await getPool();
    if (!pool) throw new Error('Database not initialized');
    const [pending] = await pool.execute(
      `SELECT id FROM merchant_invitations WHERE merchant_id = ? AND status = 'pending'`,
      [owner.merchantId],
    );
    expect(pending as any[]).toHaveLength(1);
  });
});
