import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  ACCOUNT_DELETION_GRACE_HOURS,
  DATA_SUBJECT_RESPONSE_DAYS,
  LEGAL_DOCUMENTS,
  PERSONAL_DATA_EXPORT_VERSION,
} from '@shared/legal';
import { getPool } from '../db';
import { encryptSecret, isEncryptedSecret } from '../security/secrets';
import { privacyHash } from './privacy-hash';

type ConsentType = 'terms' | 'privacy' | 'marketing';
export type AdminAccountDeletionReason =
  | 'customer_request'
  | 'duplicate_test_account'
  | 'legal_requirement';

interface UserRow extends RowDataPacket {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  password: string | null;
  loginMethod: string | null;
  role: 'user' | 'admin';
  accountStatus: 'active' | 'deletion_pending' | 'anonymized';
  createdAt: string;
  lastSignedIn: string;
}

interface MerchantRow extends RowDataPacket {
  id: number;
  businessName: string;
  phone: string | null;
  status: string;
  createdAt: string;
}

function mysqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function plusHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function assertNoSharedMerchantOwnership(connection: PoolConnection, userId: number): Promise<void> {
  const [sharedMerchants] = await connection.execute<RowDataPacket[]>(
    `SELECT m.id
       FROM merchants m
      WHERE m.userId = ?
        AND EXISTS (
          SELECT 1 FROM merchant_members mm
           WHERE mm.merchant_id = m.id AND mm.user_id <> ? AND mm.is_active = 1
        )
      LIMIT 1`,
    [userId, userId],
  );
  if (sharedMerchants[0]) throw new Error('MERCHANT_OWNERSHIP_TRANSFER_REQUIRED');
}

async function suspendAccountForDeletion(
  connection: PoolConnection,
  userId: number,
  now: Date,
): Promise<void> {
  const timestamp = mysqlTimestamp(now);
  await connection.execute(
    `UPDATE users SET account_status = 'deletion_pending', deletion_requested_at = ?, password = NULL,
                      is_trial_active = 0, updatedAt = ? WHERE id = ? AND account_status = 'active'`,
    [timestamp, timestamp, userId],
  );
  await connection.execute(
    `UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
    [timestamp, userId],
  );
  await connection.execute(
    `UPDATE merchants SET status = 'suspended', autoReplyEnabled = 0, updatedAt = ? WHERE userId = ?`,
    [timestamp, userId],
  );
  await connection.execute(
    `UPDATE whatsapp_instances wi JOIN merchants m ON m.id = wi.merchant_id
        SET wi.status = 'inactive', wi.updated_at = ? WHERE m.userId = ?`,
    [timestamp, userId],
  );
  await connection.execute(
    `UPDATE sari_api_keys sak JOIN merchants m ON m.id = sak.merchant_id
        SET sak.is_active = 0 WHERE m.userId = ?`,
    [userId],
  );
  await connection.execute(
    `UPDATE byaan_connections bc JOIN merchants m ON m.id = bc.merchant_id
        SET bc.is_active = 0, bc.updated_at = ? WHERE m.userId = ?`,
    [timestamp, userId],
  );
}

function mysqlErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : undefined;
}

function mysqlDuplicateKey(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const candidate = error as { sqlMessage?: unknown; message?: unknown };
  return String(candidate.sqlMessage || candidate.message || '');
}

async function insertConsentReceipt(
  connection: PoolConnection,
  input: {
    userId: number;
    subjectReferenceHash: string;
    consentType: ConsentType;
    granted: boolean;
    source: string;
    ipHash: string | null;
    userAgentHash: string | null;
  },
): Promise<void> {
  const document = LEGAL_DOCUMENTS[input.consentType];
  await connection.execute(
    `INSERT INTO consent_receipts
      (user_id, subject_reference_hash, consent_type, granted, document_version, document_url,
       source, ip_hash, user_agent_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      input.userId,
      input.subjectReferenceHash,
      input.consentType,
      input.granted ? 1 : 0,
      document.version,
      document.url,
      input.source,
      input.ipHash,
      input.userAgentHash,
    ],
  );
}

async function lockUserAndVerifyPassword(
  connection: PoolConnection,
  userId: number,
  password: string,
): Promise<UserRow> {
  const [rows] = await connection.execute<UserRow[]>(
    `SELECT id, openId, name, email, password, loginMethod, role, account_status AS accountStatus,
            createdAt, lastSignedIn
       FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    throw new Error('INVALID_PASSWORD');
  }
  return user;
}

export async function registerMerchantAccount(input: {
  name: string;
  email: string;
  passwordHash: string;
  businessName: string;
  phone: string;
  acceptedTerms: true;
  acceptedPrivacy: true;
  marketingConsent: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  registrationSource?: 'signup' | 'byaan_provision' | 'platform_provision';
  merchantStatus?: 'pending' | 'active';
  platformType?: 'byaan' | 'custom' | null;
  integrationSource?: string;
  provisionIdempotencyHash?: string | null;
  provisionPayloadHash?: string | null;
  provisionTenantDomain?: string | null;
}): Promise<{ user: Omit<UserRow, 'password'>; merchantId: number; trialEndsAt: Date }> {
  if (input.acceptedTerms !== true || input.acceptedPrivacy !== true) {
    throw new Error('LEGAL_CONSENT_REQUIRED');
  }
  const provisionIdempotencyHash = input.provisionIdempotencyHash || null;
  const provisionPayloadHash = input.provisionPayloadHash || null;
  const provisionTenantDomain = input.provisionTenantDomain || null;
  if (
    Boolean(provisionIdempotencyHash) !== Boolean(provisionPayloadHash) ||
    (provisionIdempotencyHash && !/^[a-f0-9]{64}$/.test(provisionIdempotencyHash)) ||
    (provisionPayloadHash && !/^[a-f0-9]{64}$/.test(provisionPayloadHash))
  ) {
    throw new Error('INVALID_PROVISIONING_IDEMPOTENCY');
  }
  if (
    provisionTenantDomain &&
    (input.platformType !== 'byaan' ||
      provisionTenantDomain.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(provisionTenantDomain))
  ) {
    throw new Error('INVALID_PROVISIONING_TENANT');
  }
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  const email = normalizeEmail(input.email);
  const subjectReferenceHash = privacyHash(email);
  const ipHash = input.ipAddress ? privacyHash(input.ipAddress) : null;
  const userAgentHash = input.userAgent ? privacyHash(input.userAgent) : null;
  const registrationSource = input.registrationSource || 'signup';
  const merchantStatus = input.merchantStatus || 'pending';
  const platformType = input.platformType || null;
  const integrationSource = (input.integrationSource || 'none').trim().slice(0, 20);

  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email],
    );
    if (existing[0]) throw new Error('EMAIL_ALREADY_REGISTERED');

    const now = new Date();
    const trialEndsAt = plusDays(now, 7);
    const openId = `local_${crypto.randomUUID().replaceAll('-', '')}`;
    const [userResult] = await connection.execute(
      `INSERT INTO users
        (openId, name, email, password, loginMethod, role, account_status,
         trial_start_date, trial_end_date, is_trial_active, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, ?, 'email', 'user', 'active', ?, ?, 1, ?, ?, ?)`,
      [
        openId,
        input.name.trim(),
        email,
        input.passwordHash,
        mysqlTimestamp(now),
        mysqlTimestamp(trialEndsAt),
        mysqlTimestamp(now),
        mysqlTimestamp(now),
        mysqlTimestamp(now),
      ],
    );
    const userId = Number((userResult as { insertId: number }).insertId);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('USER_CREATE_FAILED');

    const [merchantResult] = await connection.execute(
      `INSERT INTO merchants
        (userId, businessName, phone, status, subscription_status, max_customers_allowed,
         autoReplyEnabled, onboardingCompleted, onboardingStep, setupCompleted, currency, timezone,
         platform_type, integration_source, provision_idempotency_hash, provision_payload_hash,
         createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'trial', 100, 1, 0, 0, 0, 'SAR', 'Asia/Riyadh', ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        input.businessName.trim(),
        input.phone.trim(),
        merchantStatus,
        platformType,
        integrationSource,
        provisionIdempotencyHash,
        provisionPayloadHash,
        mysqlTimestamp(now),
        mysqlTimestamp(now),
      ],
    );
    const merchantId = Number((merchantResult as { insertId: number }).insertId);
    if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error('MERCHANT_CREATE_FAILED');

    // Reserve the Byaan tenant in the same transaction as the account graph.
    // uq_byaan_domain makes concurrent provisioning exactly-one-winner and the
    // losing user/merchant inserts are rolled back with the transaction.
    if (provisionTenantDomain) {
      await connection.execute(
        `INSERT INTO byaan_connections
          (merchant_id, tenant_domain, sync_status, is_active)
         VALUES (?, ?, 'pending_verification', 0)`,
        [merchantId, provisionTenantDomain],
      );
    }

    await connection.execute(
      `INSERT INTO merchant_members
        (merchant_id, user_id, role, invited_by, invited_at, accepted_at, is_active)
       VALUES (?, ?, 'owner', NULL, ?, ?, 1)`,
      [merchantId, userId, mysqlTimestamp(now), mysqlTimestamp(now)],
    );

    const [subscriptionResult] = await connection.execute(
      `INSERT INTO merchant_subscriptions
        (merchant_id, plan_id, status, billing_cycle, start_date, end_date, trial_ends_at, auto_renew,
         conversations_used, messages_used, voice_messages_used, last_reset_at, created_at, updated_at)
       VALUES (?, NULL, 'trial', 'monthly', ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
      [
        merchantId,
        mysqlTimestamp(now),
        mysqlTimestamp(trialEndsAt),
        mysqlTimestamp(trialEndsAt),
        mysqlTimestamp(now),
        mysqlTimestamp(now),
        mysqlTimestamp(now),
      ],
    );
    const subscriptionId = Number((subscriptionResult as { insertId: number }).insertId);
    if (!Number.isSafeInteger(subscriptionId) || subscriptionId <= 0) throw new Error('TRIAL_CREATE_FAILED');
    await connection.execute(
      'UPDATE merchants SET current_subscription_id = ?, trial_started_at = ?, trial_ends_at = ? WHERE id = ?',
      [subscriptionId, mysqlTimestamp(now), mysqlTimestamp(trialEndsAt), merchantId],
    );

    for (const [consentType, granted] of [
      ['terms', true],
      ['privacy', true],
      ['marketing', input.marketingConsent],
    ] as const) {
      await insertConsentReceipt(connection, {
        userId,
        subjectReferenceHash,
        consentType,
        granted,
        source: registrationSource,
        ipHash,
        userAgentHash,
      });
    }

    const [createdUsers] = await connection.execute<UserRow[]>(
      `SELECT id, openId, name, email, password, loginMethod, role, account_status AS accountStatus,
              createdAt, lastSignedIn FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const created = createdUsers[0];
    if (!created) throw new Error('USER_CREATE_FAILED');
    const { password: _password, ...safeUser } = created;
    await connection.commit();
    return { user: safeUser, merchantId, trialEndsAt };
  } catch (error) {
    await connection.rollback();
    if (mysqlErrorCode(error) === 'ER_DUP_ENTRY') {
      const duplicateKey = mysqlDuplicateKey(error);
      if (duplicateKey.includes('uq_byaan_domain')) throw new Error('PROVISION_TENANT_ALREADY_LINKED');
      if (duplicateKey.includes('merchants_platform_provision_unique')) {
        throw new Error('PROVISION_IDEMPOTENCY_CONFLICT');
      }
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function exportPersonalAccountData(userId: number, password: string) {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const user = await lockUserAndVerifyPassword(connection, userId, password);
    if (user.accountStatus === 'anonymized') throw new Error('ACCOUNT_UNAVAILABLE');
    const subjectReferenceHash = privacyHash(user.email || String(user.id));
    const [merchants] = await connection.execute<MerchantRow[]>(
      `SELECT id, businessName, phone, status, createdAt FROM merchants WHERE userId = ? ORDER BY id`,
      [userId],
    );

    const merchantIds = merchants.map(item => item.id);
    const placeholders = merchantIds.map(() => '?').join(',');
    let subscriptions: RowDataPacket[] = [];
    let payments: RowDataPacket[] = [];
    let whatsappConnections: RowDataPacket[] = [];
    if (merchantIds.length > 0) {
      [subscriptions] = await connection.execute<RowDataPacket[]>(
        `SELECT id, merchant_id AS merchantId, plan_id AS planId, status, billing_cycle AS billingCycle,
                start_date AS startDate, end_date AS endDate, trial_ends_at AS trialEndsAt,
                conversations_used AS conversationsUsed, messages_used AS messagesUsed,
                voice_messages_used AS voiceMessagesUsed, created_at AS createdAt
           FROM merchant_subscriptions WHERE merchant_id IN (${placeholders}) ORDER BY id`,
        merchantIds,
      );
      [payments] = await connection.execute<RowDataPacket[]>(
        `SELECT id, merchant_id AS merchantId, subscription_id AS subscriptionId, type, amount, currency,
                status, payment_method AS paymentMethod, paid_at AS paidAt, refunded_at AS refundedAt,
                created_at AS createdAt
           FROM payment_transactions WHERE merchant_id IN (${placeholders}) ORDER BY id`,
        merchantIds,
      );
      [whatsappConnections] = await connection.execute<RowDataPacket[]>(
        `SELECT id, merchant_id AS merchantId, phone_number AS phoneNumber, status, connected_at AS connectedAt,
                created_at AS createdAt
           FROM whatsapp_instances WHERE merchant_id IN (${placeholders}) ORDER BY id`,
        merchantIds,
      );
    }

    const [consents] = await connection.execute<RowDataPacket[]>(
      `SELECT consent_type AS consentType, granted, document_version AS documentVersion,
              document_url AS documentUrl, source, created_at AS createdAt, withdrawn_at AS withdrawnAt
         FROM consent_receipts WHERE user_id = ? ORDER BY created_at`,
      [userId],
    );
    const [memberships] = await connection.execute<RowDataPacket[]>(
      `SELECT mm.merchant_id AS merchantId, mm.role, mm.accepted_at AS acceptedAt, mm.is_active AS isActive,
              m.businessName
         FROM merchant_members mm
         JOIN merchants m ON m.id = mm.merchant_id
        WHERE mm.user_id = ? ORDER BY mm.id`,
      [userId],
    );
    const [requests] = await connection.execute<RowDataPacket[]>(
      `SELECT id, request_type AS requestType, status, requested_at AS requestedAt, due_at AS dueAt,
              completed_at AS completedAt, rejection_reason AS rejectionReason
         FROM data_subject_requests WHERE user_id = ? ORDER BY requested_at`,
      [userId],
    );

    const now = new Date();
    const dueAt = plusDays(now, DATA_SUBJECT_RESPONSE_DAYS);
    const [requestResult] = await connection.execute(
      `INSERT INTO data_subject_requests
        (user_id, subject_reference_hash, request_type, status, requested_at, due_at, completed_at,
         request_metadata, created_at, updated_at)
       VALUES (?, ?, 'export', 'completed', ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        subjectReferenceHash,
        mysqlTimestamp(now),
        mysqlTimestamp(dueAt),
        mysqlTimestamp(now),
        JSON.stringify({ formatVersion: PERSONAL_DATA_EXPORT_VERSION, delivery: 'self_service' }),
        mysqlTimestamp(now),
        mysqlTimestamp(now),
      ],
    );
    const requestId = Number((requestResult as { insertId: number }).insertId);
    await connection.commit();

    return {
      formatVersion: PERSONAL_DATA_EXPORT_VERSION,
      generatedAt: now.toISOString(),
      requestId,
      scope: 'account-holder personal data; customer conversation content is intentionally excluded',
      account: {
        id: user.id,
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        role: user.role,
        accountStatus: user.accountStatus,
        createdAt: user.createdAt,
        lastSignedIn: user.lastSignedIn,
      },
      merchants,
      memberships,
      subscriptions,
      payments,
      whatsappConnections,
      consentHistory: consents,
      requestHistory: requests,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getPrivacyCenterState(userId: number) {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const [requests] = await pool.execute<RowDataPacket[]>(
    `SELECT id, request_type AS requestType, status, requested_at AS requestedAt, due_at AS dueAt,
            processing_scheduled_at AS processingScheduledAt, completed_at AS completedAt,
            rejection_reason AS rejectionReason
       FROM data_subject_requests WHERE user_id = ? ORDER BY requested_at DESC LIMIT 20`,
    [userId],
  );
  const [marketing] = await pool.execute<RowDataPacket[]>(
    `SELECT granted, created_at AS createdAt
       FROM consent_receipts WHERE user_id = ? AND consent_type = 'marketing'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    [userId],
  );
  return {
    marketingConsent: Boolean(marketing[0]?.granted),
    requests,
    responseDays: DATA_SUBJECT_RESPONSE_DAYS,
    legalDocuments: LEGAL_DOCUMENTS,
  };
}

export async function setMarketingConsent(input: {
  userId: number;
  granted: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute<UserRow[]>(
      `SELECT id, openId, name, email, password, loginMethod, role, account_status AS accountStatus,
              createdAt, lastSignedIn FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [input.userId],
    );
    const user = users[0];
    if (!user || user.accountStatus !== 'active') throw new Error('ACCOUNT_UNAVAILABLE');
    await connection.execute(
      `UPDATE consent_receipts SET withdrawn_at = NOW()
        WHERE user_id = ? AND consent_type = 'marketing' AND withdrawn_at IS NULL`,
      [input.userId],
    );
    await insertConsentReceipt(connection, {
      userId: input.userId,
      subjectReferenceHash: privacyHash(user.email || String(user.id)),
      consentType: 'marketing',
      granted: input.granted,
      source: 'privacy_center',
      ipHash: input.ipAddress ? privacyHash(input.ipAddress) : null,
      userAgentHash: input.userAgent ? privacyHash(input.userAgent) : null,
    });
    if (!input.granted) {
      const now = new Date();
      await connection.execute(
        `INSERT INTO data_subject_requests
          (user_id, subject_reference_hash, request_type, status, requested_at, due_at, completed_at,
           request_metadata, created_at, updated_at)
         VALUES (?, ?, 'withdraw_consent', 'completed', ?, ?, ?, ?, ?, ?)`,
        [
          input.userId,
          privacyHash(user.email || String(user.id)),
          mysqlTimestamp(now),
          mysqlTimestamp(now),
          mysqlTimestamp(now),
          JSON.stringify({ scope: 'direct_marketing', source: 'privacy_center' }),
          mysqlTimestamp(now),
          mysqlTimestamp(now),
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function submitDataSubjectRequest(input: {
  userId: number;
  requestType: 'access' | 'correction' | 'objection';
  details: string;
}) {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute<UserRow[]>(
      `SELECT id, openId, name, email, password, loginMethod, role, account_status AS accountStatus,
              createdAt, lastSignedIn FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [input.userId],
    );
    const user = users[0];
    if (!user || user.accountStatus !== 'active') throw new Error('ACCOUNT_UNAVAILABLE');
    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT id, request_type AS requestType, status, requested_at AS requestedAt, due_at AS dueAt
         FROM data_subject_requests
        WHERE user_id = ? AND request_type = ? AND status IN ('pending', 'processing', 'requires_review')
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [input.userId, input.requestType],
    );
    if (existing[0]) {
      await connection.commit();
      return existing[0];
    }

    const now = new Date();
    const dueAt = plusDays(now, DATA_SUBJECT_RESPONSE_DAYS);
    const [result] = await connection.execute(
      `INSERT INTO data_subject_requests
        (user_id, subject_reference_hash, request_type, status, requested_at, due_at,
         request_metadata, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        input.userId,
        privacyHash(user.email || String(user.id)),
        input.requestType,
        mysqlTimestamp(now),
        mysqlTimestamp(dueAt),
        JSON.stringify({ details: input.details.trim(), source: 'privacy_center' }),
        mysqlTimestamp(now),
        mysqlTimestamp(now),
      ],
    );
    await connection.commit();
    return {
      id: Number((result as { insertId: number }).insertId),
      requestType: input.requestType,
      status: 'pending',
      requestedAt: mysqlTimestamp(now),
      dueAt: mysqlTimestamp(dueAt),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listDataSubjectRequestsForAdmin(status?: string) {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const parameters: string[] = [];
  const statusClause = status ? 'WHERE dsr.status = ?' : '';
  if (status) parameters.push(status);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT dsr.id, dsr.request_type AS requestType, dsr.status, dsr.requested_at AS requestedAt,
            dsr.due_at AS dueAt, dsr.completed_at AS completedAt, dsr.request_metadata AS requestMetadata,
            dsr.rejection_reason AS rejectionReason, dsr.resolution_notes AS resolutionNotes,
            u.id AS userId, u.name, u.email
       FROM data_subject_requests dsr
       LEFT JOIN users u ON u.id = dsr.user_id
       ${statusClause}
      ORDER BY CASE WHEN dsr.status IN ('pending', 'processing', 'requires_review') THEN 0 ELSE 1 END,
               dsr.due_at ASC, dsr.id DESC
      LIMIT 100`,
    parameters,
  );
  return rows.map(row => {
    let details: string | null = null;
    let source: string | null = null;
    let reasonCode: string | null = null;
    let affectedMerchantCount: number | null = null;
    try {
      const metadata = row.requestMetadata ? JSON.parse(String(row.requestMetadata)) : null;
      details = typeof metadata?.details === 'string' ? metadata.details : null;
      source = typeof metadata?.source === 'string' ? metadata.source : null;
      reasonCode = typeof metadata?.reasonCode === 'string' ? metadata.reasonCode : null;
      affectedMerchantCount = Number.isSafeInteger(metadata?.affectedMerchantCount)
        ? Number(metadata.affectedMerchantCount)
        : null;
    } catch {
      details = null;
    }
    return {
      id: row.id,
      requestType: row.requestType,
      status: row.status,
      requestedAt: row.requestedAt,
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      rejectionReason: row.rejectionReason,
      resolutionNotes: row.resolutionNotes,
      details,
      source,
      reasonCode,
      affectedMerchantCount,
      subject: row.userId ? { userId: row.userId, name: row.name, email: row.email } : null,
    };
  });
}

export async function resolveDataSubjectRequest(input: {
  requestId: number;
  reviewerUserId: number;
  decision: 'completed' | 'rejected' | 'requires_review' | 'retry';
  notes: string;
}) {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, request_type AS requestType, status
         FROM data_subject_requests WHERE id = ? LIMIT 1 FOR UPDATE`,
      [input.requestId],
    );
    const request = rows[0];
    if (!request) throw new Error('REQUEST_NOT_FOUND');
    if (!['pending', 'processing', 'requires_review'].includes(String(request.status))) {
      throw new Error('REQUEST_ALREADY_FINAL');
    }
    if (request.requestType === 'deletion') {
      if (input.decision === 'completed' || input.decision === 'rejected') {
        throw new Error('DELETION_COMPLETION_WORKER_ONLY');
      }
      if (input.decision === 'retry') {
        if (request.status !== 'requires_review') throw new Error('DELETION_RETRY_REQUIRES_REVIEW');
        await connection.execute(
          `UPDATE data_subject_requests
              SET status = 'pending', handled_by_user_id = ?, resolution_notes = ?,
                  rejection_reason = NULL, processing_scheduled_at = NOW(), completed_at = NULL, updated_at = NOW()
            WHERE id = ? AND status = 'requires_review'`,
          [input.reviewerUserId, input.notes.trim(), input.requestId],
        );
        await connection.commit();
        return { success: true };
      }
    } else if (input.decision === 'retry') {
      throw new Error('RETRY_ONLY_FOR_DELETION');
    }
    const completedAt = input.decision === 'completed' || input.decision === 'rejected'
      ? mysqlTimestamp(new Date())
      : null;
    await connection.execute(
      `UPDATE data_subject_requests
          SET status = ?, handled_by_user_id = ?, resolution_notes = ?,
              rejection_reason = ?, completed_at = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        input.decision,
        input.reviewerUserId,
        input.notes.trim(),
        input.decision === 'rejected' ? input.notes.trim() : null,
        completedAt,
        input.requestId,
      ],
    );
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function requestAccountDeletion(userId: number, password: string) {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const user = await lockUserAndVerifyPassword(connection, userId, password);
    if (user.role === 'admin') throw new Error('ADMIN_DELETION_REQUIRES_REVIEW');
    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT id, status, due_at AS dueAt, processing_scheduled_at AS processingScheduledAt
         FROM data_subject_requests
        WHERE user_id = ? AND request_type = 'deletion' AND status IN ('pending', 'processing', 'requires_review')
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [userId],
    );
    if (existing[0]) {
      if (user.accountStatus !== 'deletion_pending') throw new Error('DELETION_STATE_MISMATCH');
      await connection.commit();
      return existing[0];
    }
    if (user.accountStatus !== 'active') throw new Error('ACCOUNT_UNAVAILABLE');

    await assertNoSharedMerchantOwnership(connection, userId);

    const now = new Date();
    const dueAt = plusDays(now, DATA_SUBJECT_RESPONSE_DAYS);
    const scheduledAt = plusHours(now, ACCOUNT_DELETION_GRACE_HOURS);
    const subjectReferenceHash = privacyHash(user.email || String(user.id));
    const [result] = await connection.execute(
      `INSERT INTO data_subject_requests
        (user_id, subject_reference_hash, request_type, status, requested_at, due_at,
         processing_scheduled_at, request_metadata, created_at, updated_at)
       VALUES (?, ?, 'deletion', 'pending', ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        subjectReferenceHash,
        mysqlTimestamp(now),
        mysqlTimestamp(dueAt),
        mysqlTimestamp(scheduledAt),
        JSON.stringify({ source: 'self_service', graceHours: ACCOUNT_DELETION_GRACE_HOURS }),
        mysqlTimestamp(now),
        mysqlTimestamp(now),
      ],
    );
    const requestId = Number((result as { insertId: number }).insertId);
    await suspendAccountForDeletion(connection, userId, now);
    await connection.commit();
    return {
      id: requestId,
      status: 'pending',
      dueAt: mysqlTimestamp(dueAt),
      processingScheduledAt: mysqlTimestamp(scheduledAt),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getAdminAccountDeletionImpact(merchantId: number): Promise<{
  merchantId: number;
  affectedMerchantCount: number;
  sharedMemberCount: number;
  existingRequest: { id: number; status: string; processingScheduledAt: Date | string | null } | null;
}> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const [targets] = await pool.execute<RowDataPacket[]>(
    `SELECT m.id AS merchantId, u.id AS userId, u.role
       FROM merchants m INNER JOIN users u ON u.id = m.userId
      WHERE m.id = ? LIMIT 1`,
    [merchantId],
  );
  const target = targets[0];
  if (!target) throw new Error('MERCHANT_NOT_FOUND');
  if (target.role === 'admin') throw new Error('ADMIN_ACCOUNT_DELETION_FORBIDDEN');
  const [owned] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM merchants WHERE userId = ?',
    [target.userId],
  );
  const [shared] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM merchant_members mm INNER JOIN merchants m ON m.id = mm.merchant_id
      WHERE m.userId = ? AND mm.user_id <> ? AND mm.is_active = 1`,
    [target.userId, target.userId],
  );
  const [requests] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status, processing_scheduled_at AS processingScheduledAt
       FROM data_subject_requests
      WHERE user_id = ? AND request_type = 'deletion'
        AND status IN ('pending', 'processing', 'requires_review')
      ORDER BY id DESC LIMIT 1`,
    [target.userId],
  );
  return {
    merchantId,
    affectedMerchantCount: owned.length,
    sharedMemberCount: Number(shared[0]?.count || 0),
    existingRequest: requests[0]
      ? {
          id: Number(requests[0].id),
          status: String(requests[0].status),
          processingScheduledAt: requests[0].processingScheduledAt || null,
        }
      : null,
  };
}

export async function requestAccountDeletionByAdmin(input: {
  merchantId: number;
  adminUserId: number;
  confirmation: string;
  reasonCode: AdminAccountDeletionReason;
}): Promise<{
  id: number;
  status: string;
  processingScheduledAt: Date | string | null;
  affectedMerchantCount: number;
  alreadyScheduled: boolean;
}> {
  if (input.confirmation !== `DELETE-${input.merchantId}`) {
    throw new Error('ADMIN_DELETION_CONFIRMATION_INVALID');
  }
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [admins] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM users
        WHERE id = ? AND role = 'admin' AND account_status = 'active' LIMIT 1 FOR UPDATE`,
      [input.adminUserId],
    );
    if (!admins[0]) throw new Error('ADMIN_ACTOR_REQUIRED');

    const [targets] = await connection.execute<RowDataPacket[]>(
      `SELECT m.id AS merchantId, u.id AS userId, u.email, u.role, u.account_status AS accountStatus
         FROM merchants m INNER JOIN users u ON u.id = m.userId
        WHERE m.id = ? LIMIT 1 FOR UPDATE`,
      [input.merchantId],
    );
    const target = targets[0];
    if (!target) throw new Error('MERCHANT_NOT_FOUND');
    if (target.role === 'admin') throw new Error('ADMIN_ACCOUNT_DELETION_FORBIDDEN');

    const [ownedMerchants] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM merchants WHERE userId = ? FOR UPDATE',
      [target.userId],
    );
    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT id, status, processing_scheduled_at AS processingScheduledAt
         FROM data_subject_requests
        WHERE user_id = ? AND request_type = 'deletion'
          AND status IN ('pending', 'processing', 'requires_review')
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [target.userId],
    );
    if (existing[0]) {
      if (target.accountStatus !== 'deletion_pending') throw new Error('DELETION_STATE_MISMATCH');
      await connection.commit();
      return {
        id: Number(existing[0].id),
        status: String(existing[0].status),
        processingScheduledAt: existing[0].processingScheduledAt || null,
        affectedMerchantCount: ownedMerchants.length,
        alreadyScheduled: true,
      };
    }
    if (target.accountStatus !== 'active') throw new Error('ACCOUNT_UNAVAILABLE');
    await assertNoSharedMerchantOwnership(connection, Number(target.userId));

    const now = new Date();
    const dueAt = plusDays(now, DATA_SUBJECT_RESPONSE_DAYS);
    const scheduledAt = plusHours(now, ACCOUNT_DELETION_GRACE_HOURS);
    const metadata = JSON.stringify({
      source: 'admin_console',
      reasonCode: input.reasonCode,
      targetMerchantId: input.merchantId,
      affectedMerchantCount: ownedMerchants.length,
      graceHours: ACCOUNT_DELETION_GRACE_HOURS,
    });
    const [result] = await connection.execute(
      `INSERT INTO data_subject_requests
        (user_id, subject_reference_hash, request_type, status, requested_at, due_at,
         processing_scheduled_at, handled_by_user_id, request_metadata, created_at, updated_at)
       VALUES (?, ?, 'deletion', 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      [
        target.userId,
        privacyHash(String(target.email || target.userId)),
        mysqlTimestamp(now),
        mysqlTimestamp(dueAt),
        mysqlTimestamp(scheduledAt),
        input.adminUserId,
        metadata,
        mysqlTimestamp(now),
        mysqlTimestamp(now),
      ],
    );
    await suspendAccountForDeletion(connection, Number(target.userId), now);
    await connection.commit();
    return {
      id: Number((result as { insertId: number }).insertId),
      status: 'pending',
      processingScheduledAt: mysqlTimestamp(scheduledAt),
      affectedMerchantCount: ownedMerchants.length,
      alreadyScheduled: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function validatedIdentifier(value: unknown): string {
  const identifier = String(value || '');
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error('INVALID_SCHEMA_IDENTIFIER');
  return `\`${identifier}\``;
}

async function archiveFinancialRecords(
  connection: PoolConnection,
  subjectReferenceHash: string,
  user: UserRow,
  merchant: MerchantRow,
): Promise<void> {
  const retentionYears = Math.min(10, Math.max(1, Number(process.env.LEGAL_RETENTION_YEARS || 7)));
  const retainUntil = new Date();
  retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + retentionYears);
  const [records] = await connection.execute<RowDataPacket[]>(
    `SELECT 'invoice' AS recordType, i.id AS sourceRecordId, i.created_at AS recordDate,
            i.amount, i.currency, i.status, i.invoice_number AS externalReference
       FROM invoices i WHERE i.merchant_id = ?
     UNION ALL
     SELECT 'payment', pt.id, pt.created_at, pt.amount, pt.currency, pt.status, pt.tap_charge_id
       FROM payment_transactions pt WHERE pt.merchant_id = ?
     UNION ALL
     SELECT 'legacy_payment', p.id, p.createdAt, p.amount, p.currency, p.status, p.transactionId
       FROM payments p WHERE p.merchantId = ?`,
    [merchant.id, merchant.id, merchant.id],
  );
  for (const record of records) {
    const payload = encryptSecret(JSON.stringify({
      accountEmail: user.email,
      businessName: merchant.businessName,
      externalReference: record.externalReference,
    }));
    if (!isEncryptedSecret(payload)) throw new Error('LEGAL_ARCHIVE_ENCRYPTION_REQUIRED');
    await connection.execute(
      `INSERT IGNORE INTO legal_retention_records
        (subject_reference_hash, record_type, source_record_id, record_date, amount, currency, status,
         encrypted_payload, retain_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        subjectReferenceHash,
        record.recordType,
        record.sourceRecordId,
        record.recordDate || mysqlTimestamp(new Date()),
        record.amount ?? null,
        record.currency ?? null,
        record.status ?? null,
        payload,
        mysqlTimestamp(retainUntil),
      ],
    );
  }
}

async function deleteOrphanedScopedRows(
  connection: PoolConnection,
  scopeColumns: readonly string[],
  scopeId: number,
  excludedTables: readonly string[],
): Promise<void> {
  const placeholders = scopeColumns.map(() => '?').join(',');
  const [columns] = await connection.execute<RowDataPacket[]>(
    `SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS c
       JOIN INFORMATION_SCHEMA.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
      WHERE c.TABLE_SCHEMA = DATABASE() AND c.COLUMN_NAME IN (${placeholders})`,
    [...scopeColumns],
  );
  for (const column of columns) {
    const tableName = String(column.tableName);
    if (excludedTables.includes(tableName)) continue;
    const table = validatedIdentifier(tableName);
    const field = validatedIdentifier(column.columnName);
    await connection.execute(`DELETE FROM ${table} WHERE ${field} = ?`, [scopeId]);
  }
}

async function processDeletionRequest(requestId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute<RowDataPacket[]>(
      `SELECT id, user_id AS userId, subject_reference_hash AS subjectReferenceHash, status
         FROM data_subject_requests WHERE id = ? AND request_type = 'deletion' LIMIT 1 FOR UPDATE`,
      [requestId],
    );
    const request = requests[0];
    if (!request || request.status !== 'pending') {
      await connection.commit();
      return;
    }
    await connection.execute(
      `UPDATE data_subject_requests SET status = 'processing', updated_at = NOW() WHERE id = ? AND status = 'pending'`,
      [requestId],
    );
    const [users] = await connection.execute<UserRow[]>(
      `SELECT id, openId, name, email, password, loginMethod, role, account_status AS accountStatus,
              createdAt, lastSignedIn FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [request.userId],
    );
    const user = users[0];
    if (!user) {
      await connection.execute(
        `UPDATE data_subject_requests SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [requestId],
      );
      await connection.commit();
      return;
    }
    if (user.accountStatus !== 'deletion_pending') throw new Error('DELETION_STATE_MISMATCH');

    const [merchants] = await connection.execute<MerchantRow[]>(
      'SELECT id, businessName, phone, status, createdAt FROM merchants WHERE userId = ? FOR UPDATE',
      [user.id],
    );
    for (const merchant of merchants) {
      try {
        const [members] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS count FROM merchant_members
            WHERE merchant_id = ? AND user_id <> ? AND is_active = 1`,
          [merchant.id, user.id],
        );
        if (Number(members[0]?.count || 0) > 0) throw new Error('MERCHANT_OWNERSHIP_TRANSFER_REQUIRED');
      } catch (error) {
        if (error instanceof Error && error.message === 'MERCHANT_OWNERSHIP_TRANSFER_REQUIRED') throw error;
        // merchant_members may not exist on an older schema; ownership still comes from merchants.userId.
      }
      await archiveFinancialRecords(connection, request.subjectReferenceHash, user, merchant);
      await deleteOrphanedScopedRows(
        connection,
        ['merchant_id', 'merchantId'],
        merchant.id,
        ['merchants', 'legal_retention_records', 'data_subject_requests', 'consent_receipts'],
      );
      await connection.execute('DELETE FROM merchants WHERE id = ?', [merchant.id]);
    }

    await deleteOrphanedScopedRows(
      connection,
      ['user_id', 'userId'],
      user.id,
      ['users', 'data_subject_requests', 'consent_receipts', 'legal_retention_records'],
    );
    await connection.execute('DELETE FROM users WHERE id = ?', [user.id]);
    await connection.execute(
      `UPDATE data_subject_requests
          SET status = 'completed', user_id = NULL, completed_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [requestId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function processDueAccountDeletions(limit = 10): Promise<{ processed: number; review: number }> {
  const pool = await getPool();
  if (!pool) return { processed: 0, review: 0 };
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM data_subject_requests
      WHERE request_type = 'deletion' AND status = 'pending'
        AND processing_scheduled_at IS NOT NULL AND processing_scheduled_at <= NOW()
      ORDER BY processing_scheduled_at LIMIT ?`,
    [Math.min(100, Math.max(1, limit))],
  );
  let processed = 0;
  let review = 0;
  for (const row of rows) {
    try {
      await processDeletionRequest(Number(row.id));
      processed += 1;
    } catch (error) {
      review += 1;
      console.error('[Privacy] Account deletion requires review', { requestId: Number(row.id) });
      await pool.execute(
        `UPDATE data_subject_requests
            SET status = 'requires_review', rejection_reason = 'automatic_processing_failed', updated_at = NOW()
          WHERE id = ? AND status IN ('pending', 'processing')`,
        [row.id],
      ).catch(() => undefined);
    }
  }
  return { processed, review };
}

export async function purgeExpiredLegalRetentionRecords(limit = 100): Promise<number> {
  const pool = await getPool();
  if (!pool) return 0;
  const [result] = await pool.execute(
    `DELETE FROM legal_retention_records WHERE retain_until < NOW() ORDER BY retain_until LIMIT ?`,
    [Math.min(1_000, Math.max(1, limit))],
  );
  return Number((result as { affectedRows?: number }).affectedRows || 0);
}
