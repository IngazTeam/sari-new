import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { assertBookingNotCancelling } from '../booking-calendar-state';
import { readPaymentLinkId } from './payment-link-policy';
import { bookingPaymentLinkRenewalSchema, type BookingPaymentLinkRenewalInput, type BookingPaymentLinkRenewalBlocker } from '../../shared/booking-payment-link-renewal';

const unavailable = () => new Error('Booking payment link renewal requires current verified evidence');
const positive = (value: number) => z.number().int().positive().safe().parse(value);
const iso = (value: string | Date) => new Date(databaseTimeEpoch(value)).toISOString();

async function assertSchema() {
  await assertRuntimeSchema('booking payment link renewal', [
    { table: 'payment_links', columns: ['booking_checkout_policy_version'] },
    { table: 'booking_checkout_attempts', columns: ['payment_id', 'amount_minor', 'currency', 'state', 'review_revision'] },
    { table: 'order_payments', columns: ['last_webhook_status', 'last_webhook_at', 'captured_at', 'refunded_at'] },
    { table: 'booking_payment_link_renewals', columns: ['merchant_id', 'booking_id', 'actor_user_id', 'reason', 'prior_expires_at', 'renewed_expires_at'],
      uniqueIndexes: [{ name: 'uq_booking_link_renewal_evidence', columns: ['payment_link_id', 'evidence_hash'] }] },
  ], { cacheSuccess: false });
}

async function transaction<T>(run: (connection: PoolConnection) => Promise<T>) {
  const pool = await getPool(); if (!pool) throw unavailable();
  const connection = await pool.getConnection(); let reusable = true, committing = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await connection.beginTransaction();
    const result = await run(connection); committing = true; await connection.commit(); return result;
  } catch (error) {
    if (committing) reusable = false;
    else try { await connection.rollback(); } catch { reusable = false; }
    throw error;
  } finally { if (reusable) connection.release(); else connection.destroy(); }
}

function terminal(payment: any) {
  return Number.isFinite(databaseTimeEpoch(payment.last_webhook_at)) && payment.captured_at == null && payment.refunded_at == null
    && (payment.status === 'failed' && ['FAILED', 'DECLINED', 'RESTRICTED'].includes(payment.last_webhook_status)
      || payment.status === 'cancelled' && ['CANCELLED', 'ABANDONED', 'VOID'].includes(payment.last_webhook_status));
}

/** Booking-first locks serialize renewal with checkout, reconciliation and settlement. */
async function graph(connection: PoolConnection, merchantId: number, bookingId: number) {
  const [bookings] = await connection.execute<any[]>('SELECT * FROM bookings WHERE id=? AND merchant_id=? FOR UPDATE', [bookingId, merchantId]);
  const booking = bookings[0]; if (!booking) throw unavailable();
  await assertBookingNotCancelling(connection, merchantId, bookingId);
  const [services] = await connection.execute<any[]>('SELECT id FROM services WHERE id=? AND merchant_id=? FOR UPDATE', [booking.service_id, merchantId]);
  const [links] = await connection.execute<any[]>('SELECT * FROM payment_links WHERE booking_id=? ORDER BY id FOR UPDATE', [bookingId]);
  if (!links.length) return null;
  const [attempts] = await connection.execute<any[]>('SELECT * FROM booking_checkout_attempts WHERE booking_id=? ORDER BY id FOR UPDATE', [bookingId]);
  const [payments] = await connection.execute<any[]>('SELECT * FROM order_payments WHERE booking_id=? ORDER BY id FOR UPDATE', [bookingId]);
  const [renewals] = await connection.execute<any[]>('SELECT * FROM booking_payment_link_renewals WHERE booking_id=? ORDER BY id FOR UPDATE', [bookingId]);
  // Read time after all locks: waiting for another transaction must not shorten the new lifetime.
  const [clock] = await connection.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const now = databaseTimeEpoch(clock[0].now); if (!Number.isFinite(now)) throw unavailable();
  const link = links[0]; let blocker: BookingPaymentLinkRenewalBlocker | null = null;
  if (!['pending', 'confirmed'].includes(booking.status) || booking.payment_status !== 'unpaid') blocker = 'booking';
  else if (links.some(row => row.booking_checkout_policy_version !== 1)) blocker = 'legacy';
  else if (services.length !== 1 || links.length !== 1 || link.merchant_id !== merchantId || link.order_id != null
    || ![booking.base_price, booking.discount_amount, booking.final_price].every(Number.isSafeInteger)
    || booking.discount_amount < 0 || booking.final_price < 100 || booking.base_price - booking.discount_amount !== booking.final_price
    || link.amount !== booking.final_price || link.currency !== 'SAR' || link.is_fixed_amount !== 1 || link.max_usage_count !== 1
    || renewals.some(row => row.merchant_id !== merchantId || row.payment_link_id !== link.id)) blocker = 'identity';
  else if ([link.usage_count, link.successful_payments, link.total_collected].some(value => value !== 0)
    || attempts.some(attempt => attempt.merchant_id !== merchantId || attempt.payment_link_id !== link.id
      || attempt.amount_minor !== booking.final_price || attempt.currency !== 'SAR' || !['created', 'failed'].includes(attempt.state)
      || !payments.some(payment => payment.id === attempt.payment_id))
    || payments.some(payment => payment.merchant_id !== merchantId || payment.order_id != null || payment.amount !== booking.final_price
      || payment.currency !== 'SAR' || readPaymentLinkId(payment.metadata) !== link.id || !/^chg_[A-Za-z0-9_-]{6,250}$/.test(payment.tap_charge_id || '')
      || !terminal(payment) || attempts.filter(attempt => attempt.payment_id === payment.id).length !== 1)) blocker = 'payment';
  else if (link.is_active !== 1 || !['active', 'expired'].includes(link.status)
    || !Number.isFinite(databaseTimeEpoch(link.expires_at)) || databaseTimeEpoch(link.expires_at) > now) blocker = 'link';
  return { booking, link, renewals, now, blocker,
    evidence: createHash('sha256').update(JSON.stringify({ booking, services, links, attempts, payments, renewals })).digest('hex') };
}

export async function getBookingPaymentLinkRenewal(merchantId: number, bookingId: number) {
  positive(merchantId); positive(bookingId); await assertSchema();
  return transaction(async connection => {
    const data = await graph(connection, merchantId, bookingId); if (!data) return null;
    const audit = data.renewals.filter(row => row.merchant_id === merchantId && row.payment_link_id === data.link.id).at(-1);
    return { state: data.blocker ? 'blocked' as const : 'eligible' as const, blocker: data.blocker, evidence: data.evidence,
      expiresAt: Number.isFinite(databaseTimeEpoch(data.link.expires_at)) ? iso(data.link.expires_at) : null,
      audit: audit ? { actorUserId: Number(audit.actor_user_id), reason: String(audit.reason),
        priorExpiresAt: iso(audit.prior_expires_at), renewedExpiresAt: iso(audit.renewed_expires_at), at: iso(audit.created_at) } : null };
  });
}

/** Extend the same local link once per reviewed graph; never creates charges or sends messages. */
export async function renewBookingPaymentLink(merchantId: number, actorUserId: number, raw: BookingPaymentLinkRenewalInput) {
  positive(merchantId); positive(actorUserId); const input = bookingPaymentLinkRenewalSchema.parse(raw); await assertSchema();
  return transaction(async connection => {
    const data = await graph(connection, merchantId, input.bookingId); if (!data) throw unavailable();
    // A retried acknowledgement reports the original audit, never reopens or extends the link again.
    const prior = data.renewals.find(row => row.evidence_hash === input.evidence && row.merchant_id === merchantId && row.payment_link_id === data.link.id);
    if (prior) return { renewed: true as const, alreadyRenewed: true, expiresAt: iso(prior.renewed_expires_at) };
    if (data.blocker || data.evidence !== input.evidence) throw unavailable();
    const expiresAt = new Date(Math.floor((data.now + 86_400_000) / 1000) * 1000);
    const [updated] = await connection.execute<any>(`UPDATE payment_links SET expires_at=?,status='active'
      WHERE id=? AND merchant_id=? AND booking_id=? AND is_active=1 AND status IN ('active','expired') AND expires_at=?`,
    [expiresAt, data.link.id, merchantId, input.bookingId, data.link.expires_at]);
    if (updated.affectedRows !== 1) throw unavailable();
    await connection.execute(`INSERT INTO booking_payment_link_renewals
      (merchant_id,booking_id,payment_link_id,actor_user_id,reason,prior_expires_at,renewed_expires_at,evidence_hash) VALUES (?,?,?,?,?,?,?,?)`,
    [merchantId, input.bookingId, data.link.id, actorUserId, input.reason, data.link.expires_at, expiresAt, input.evidence]);
    return { renewed: true as const, alreadyRenewed: false, expiresAt: expiresAt.toISOString() };
  });
}
