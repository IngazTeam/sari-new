import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';

type BillingCycle = 'monthly' | 'yearly';

export interface VerifiedSubscriptionCharge {
  id: string;
  status: string;
  amount: number;
  currency: string;
  live_mode?: boolean;
}

interface PaymentRow extends RowDataPacket {
  id: number;
  merchant_id: number;
  subscription_id: number | null;
  type: 'subscription' | 'addon' | 'renewal' | 'upgrade' | 'downgrade';
  amount: string;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  metadata: string | null;
}

interface PlanRow extends RowDataPacket {
  id: number;
  max_customers: number;
}

interface SubscriptionRow extends RowDataPacket {
  id: number;
  merchant_id: number;
  plan_id: number | null;
  billing_cycle: BillingCycle;
}

export type CanonicalChargeValidation =
  | { valid: true }
  | { valid: false; reason: 'invalid_charge' | 'amount_mismatch' | 'currency_mismatch' };

export function validateCanonicalCharge(
  expected: { amount: string | number; currency: string },
  charge: VerifiedSubscriptionCharge,
): CanonicalChargeValidation {
  if (!charge.id || !Number.isFinite(charge.amount) || charge.amount < 0 || !charge.currency) {
    return { valid: false, reason: 'invalid_charge' };
  }

  // Compare minor units so 99.90 and "99.9" are equivalent without floating drift.
  const expectedMinor = Math.round(Number(expected.amount) * 100);
  const receivedMinor = Math.round(Number(charge.amount) * 100);
  if (!Number.isSafeInteger(expectedMinor) || expectedMinor !== receivedMinor) {
    return { valid: false, reason: 'amount_mismatch' };
  }

  if (expected.currency.trim().toUpperCase() !== charge.currency.trim().toUpperCase()) {
    return { valid: false, reason: 'currency_mismatch' };
  }

  return { valid: true };
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value || value.length > 10_000) throw new Error('INVALID_PAYMENT_METADATA');
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_PAYMENT_METADATA');
  }
  return parsed as Record<string, unknown>;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return Number(value);
}

function billingCycle(value: unknown, field = 'billing_cycle'): BillingCycle {
  if (value !== 'monthly' && value !== 'yearly') {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return value;
}

function mysqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function periodEnd(now: Date, cycle: BillingCycle): string {
  const end = new Date(now);
  if (cycle === 'monthly') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return mysqlTimestamp(end);
}

export async function startCanonicalTrial(
  merchantId: number,
): Promise<{ subscriptionId: number; trialEndsAt: Date }> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error('INVALID_MERCHANT_ID');
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE',
      [merchantId],
    );
    if (!merchantRows[0]) throw new Error('MERCHANT_NOT_FOUND');

    const [history] = await connection.execute<RowDataPacket[]>(
      `SELECT id, status, trial_ends_at FROM merchant_subscriptions
        WHERE merchant_id = ? AND (status IN ('trial', 'active') OR trial_ends_at IS NOT NULL)
        LIMIT 1 FOR UPDATE`,
      [merchantId],
    );
    if (history[0]) throw new Error('TRIAL_ALREADY_USED_OR_SUBSCRIBED');

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const start = mysqlTimestamp(now);
    const end = mysqlTimestamp(trialEndsAt);
    const [insertResult] = await connection.execute(
      `INSERT INTO merchant_subscriptions
        (merchant_id, plan_id, status, billing_cycle, start_date, end_date, trial_ends_at, auto_renew,
         conversations_used, messages_used, voice_messages_used, last_reset_at, created_at, updated_at)
       VALUES (?, NULL, 'trial', 'monthly', ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
      [merchantId, start, end, end, start, start, start],
    );
    const subscriptionId = Number((insertResult as { insertId: number }).insertId);
    if (!Number.isSafeInteger(subscriptionId) || subscriptionId <= 0) throw new Error('TRIAL_CREATE_FAILED');

    await synchronizeMerchant(connection, merchantId, subscriptionId, 'trial', 100);
    await connection.commit();
    return { subscriptionId, trialEndsAt };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getPlan(connection: PoolConnection, planId: number): Promise<PlanRow> {
  const [rows] = await connection.execute<PlanRow[]>(
    'SELECT id, max_customers FROM subscription_plans WHERE id = ? LIMIT 1 FOR UPDATE',
    [planId],
  );
  if (!rows[0]) throw new Error('PLAN_NOT_FOUND');
  return rows[0];
}

async function synchronizeMerchant(
  connection: PoolConnection,
  merchantId: number,
  subscriptionId: number | null,
  status: 'active' | 'trial' | 'expired',
  maxCustomers: number,
): Promise<void> {
  await connection.execute(
    `UPDATE merchants
       SET current_subscription_id = ?, subscription_status = ?, max_customers_allowed = ?
     WHERE id = ?`,
    [subscriptionId, status, maxCustomers, merchantId],
  );
}

async function activateNewSubscription(
  connection: PoolConnection,
  payment: PaymentRow,
  metadata: Record<string, unknown>,
  now: Date,
): Promise<number> {
  const planId = positiveInteger(metadata.planId, 'plan_id');
  const cycle = billingCycle(metadata.billingCycle);
  const plan = await getPlan(connection, planId);
  const start = mysqlTimestamp(now);
  const end = periodEnd(now, cycle);
  metadata.appliedStartDate = start;
  metadata.appliedEndDate = end;

  await connection.execute(
    `UPDATE merchant_subscriptions
        SET status = 'cancelled', cancelled_at = ?, cancellation_reason = 'superseded_by_captured_payment'
      WHERE merchant_id = ? AND status IN ('pending', 'trial', 'active')`,
    [start, payment.merchant_id],
  );

  const [insertResult] = await connection.execute(
    `INSERT INTO merchant_subscriptions
      (merchant_id, plan_id, status, billing_cycle, start_date, end_date, auto_renew,
       conversations_used, messages_used, voice_messages_used, last_reset_at, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
    [payment.merchant_id, planId, cycle, start, end, start, start, start],
  );
  const subscriptionId = Number((insertResult as { insertId: number }).insertId);
  if (!Number.isSafeInteger(subscriptionId) || subscriptionId <= 0) throw new Error('SUBSCRIPTION_CREATE_FAILED');

  await synchronizeMerchant(connection, payment.merchant_id, subscriptionId, 'active', plan.max_customers);
  return subscriptionId;
}

async function applyPlanChange(
  connection: PoolConnection,
  payment: PaymentRow,
  metadata: Record<string, unknown>,
  now: Date,
): Promise<number> {
  const subscriptionId = positiveInteger(payment.subscription_id, 'subscription_id');
  const planId = positiveInteger(metadata.newPlanId, 'new_plan_id');
  const cycle = billingCycle(metadata.newBillingCycle, 'new_billing_cycle');
  const plan = await getPlan(connection, planId);
  const start = mysqlTimestamp(now);
  const end = periodEnd(now, cycle);
  metadata.appliedStartDate = start;
  metadata.appliedEndDate = end;

  const [result] = await connection.execute(
    `UPDATE merchant_subscriptions
        SET plan_id = ?, billing_cycle = ?, status = 'active', start_date = ?, end_date = ?, updated_at = ?
      WHERE id = ? AND merchant_id = ? AND status IN ('trial', 'active')`,
    [planId, cycle, start, end, start, subscriptionId, payment.merchant_id],
  );
  if (Number((result as { affectedRows: number }).affectedRows) !== 1) {
    throw new Error('SUBSCRIPTION_OWNERSHIP_OR_STATE_MISMATCH');
  }

  await synchronizeMerchant(connection, payment.merchant_id, subscriptionId, 'active', plan.max_customers);
  return subscriptionId;
}

async function applyRenewal(
  connection: PoolConnection,
  payment: PaymentRow,
  metadata: Record<string, unknown>,
  now: Date,
): Promise<number> {
  const subscriptionId = positiveInteger(payment.subscription_id, 'subscription_id');
  const [rows] = await connection.execute<SubscriptionRow[]>(
    `SELECT id, merchant_id, plan_id, billing_cycle
       FROM merchant_subscriptions WHERE id = ? AND merchant_id = ? LIMIT 1 FOR UPDATE`,
    [subscriptionId, payment.merchant_id],
  );
  const subscription = rows[0];
  if (!subscription) throw new Error('SUBSCRIPTION_OWNERSHIP_MISMATCH');

  const planId = positiveInteger(subscription.plan_id, 'plan_id');
  const cycle = billingCycle(metadata.billingCycle ?? subscription.billing_cycle);
  const plan = await getPlan(connection, planId);
  const start = mysqlTimestamp(now);
  const end = periodEnd(now, cycle);
  metadata.appliedStartDate = start;
  metadata.appliedEndDate = end;
  const [result] = await connection.execute(
    `UPDATE merchant_subscriptions
        SET status = 'active', billing_cycle = ?, start_date = ?, end_date = ?, updated_at = ?
      WHERE id = ? AND merchant_id = ? AND status IN ('active', 'expired')`,
    [cycle, start, end, start, subscriptionId, payment.merchant_id],
  );
  if (Number((result as { affectedRows: number }).affectedRows) !== 1) {
    throw new Error('SUBSCRIPTION_RENEWAL_STATE_MISMATCH');
  }

  await synchronizeMerchant(connection, payment.merchant_id, subscriptionId, 'active', plan.max_customers);
  return subscriptionId;
}

async function applyAddon(
  connection: PoolConnection,
  payment: PaymentRow,
  metadata: Record<string, unknown>,
  now: Date,
): Promise<number> {
  const addonId = positiveInteger(metadata.addonId, 'addon_id');
  const quantity = positiveInteger(metadata.quantity ?? 1, 'quantity');
  const cycle = billingCycle(metadata.billingCycle);
  const start = mysqlTimestamp(now);

  const [addonRows] = await connection.execute<RowDataPacket[]>(
    'SELECT id FROM subscription_addons WHERE id = ? LIMIT 1 FOR UPDATE',
    [addonId],
  );
  if (!addonRows[0]) throw new Error('ADDON_NOT_FOUND');

  const [insertResult] = await connection.execute(
    `INSERT INTO merchant_addons
      (merchant_id, addon_id, subscription_id, quantity, start_date, end_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [payment.merchant_id, addonId, payment.subscription_id, quantity, start, periodEnd(now, cycle), start, start],
  );
  const merchantAddonId = Number((insertResult as { insertId: number }).insertId);
  if (!Number.isSafeInteger(merchantAddonId) || merchantAddonId <= 0) throw new Error('ADDON_CREATE_FAILED');
  return merchantAddonId;
}

async function compensateRefund(
  connection: PoolConnection,
  payment: PaymentRow,
  metadata: Record<string, unknown>,
  now: Date,
): Promise<void> {
  const timestamp = mysqlTimestamp(now);
  if (payment.type === 'subscription') {
    if (!payment.subscription_id) throw new Error('REFUND_SUBSCRIPTION_NOT_LINKED');
    const appliedPlanId = positiveInteger(metadata.planId, 'plan_id');
    const appliedStartDate = String(metadata.appliedStartDate || '');
    const appliedEndDate = String(metadata.appliedEndDate || '');
    if (!appliedStartDate || !appliedEndDate) throw new Error('INVALID_REFUND_SNAPSHOT');
    const [result] = await connection.execute(
      `UPDATE merchant_subscriptions
          SET status = 'cancelled', cancelled_at = ?, cancellation_reason = 'payment_refunded', updated_at = ?
        WHERE id = ? AND merchant_id = ? AND plan_id = ? AND start_date = ? AND end_date = ?
          AND status IN ('trial', 'active')`,
      [
        timestamp,
        timestamp,
        payment.subscription_id,
        payment.merchant_id,
        appliedPlanId,
        appliedStartDate,
        appliedEndDate,
      ],
    );
    if (Number((result as { affectedRows: number }).affectedRows) !== 1) {
      throw new Error('SUBSCRIPTION_REFUND_STATE_MISMATCH');
    }
    await synchronizeMerchant(connection, payment.merchant_id, null, 'expired', 0);
    return;
  }

  if (payment.type === 'renewal') {
    if (!payment.subscription_id) throw new Error('REFUND_SUBSCRIPTION_NOT_LINKED');
    const appliedStartDate = String(metadata.appliedStartDate || '');
    const appliedEndDate = String(metadata.appliedEndDate || '');
    if (!appliedStartDate || !appliedEndDate) throw new Error('INVALID_REFUND_SNAPSHOT');
    const [result] = await connection.execute(
      `UPDATE merchant_subscriptions
          SET status = 'expired', updated_at = ?
        WHERE id = ? AND merchant_id = ? AND start_date = ? AND end_date = ? AND status = 'active'`,
      [timestamp, payment.subscription_id, payment.merchant_id, appliedStartDate, appliedEndDate],
    );
    if (Number((result as { affectedRows: number }).affectedRows) !== 1) {
      throw new Error('RENEWAL_REFUND_STATE_MISMATCH');
    }
    await synchronizeMerchant(connection, payment.merchant_id, null, 'expired', 0);
    return;
  }

  if (payment.type === 'addon') {
    const merchantAddonId = positiveInteger(metadata.merchantAddonId, 'merchant_addon_id');
    const [result] = await connection.execute(
      `UPDATE merchant_addons SET is_active = 0, updated_at = ?
        WHERE id = ? AND merchant_id = ? AND is_active = 1`,
      [timestamp, merchantAddonId, payment.merchant_id],
    );
    if (Number((result as { affectedRows: number }).affectedRows) !== 1) {
      throw new Error('ADDON_REFUND_STATE_MISMATCH');
    }
    return;
  }

  const subscriptionId = positiveInteger(payment.subscription_id, 'subscription_id');
  const previousBillingCycle = billingCycle(metadata.previousBillingCycle, 'previous_billing_cycle');
  const previousStartDate = String(metadata.previousStartDate || '');
  const previousEndDate = String(metadata.previousEndDate || '');
  const previousStatus = metadata.previousStatus === 'trial' ? 'trial' : 'active';
  const previousPlanId = metadata.previousPlanId == null
    ? null
    : positiveInteger(metadata.previousPlanId, 'previous_plan_id');
  if (previousStatus !== 'trial' && previousPlanId == null) throw new Error('INVALID_REFUND_SNAPSHOT');
  const previousPlan = previousPlanId == null ? null : await getPlan(connection, previousPlanId);
  const appliedPlanId = positiveInteger(metadata.newPlanId, 'new_plan_id');
  const appliedStartDate = String(metadata.appliedStartDate || '');
  const appliedEndDate = String(metadata.appliedEndDate || '');
  if (!previousStartDate || !previousEndDate) throw new Error('INVALID_REFUND_SNAPSHOT');
  if (!appliedStartDate || !appliedEndDate) throw new Error('INVALID_REFUND_SNAPSHOT');

  const [result] = await connection.execute(
    `UPDATE merchant_subscriptions
        SET plan_id = ?, billing_cycle = ?, status = ?, start_date = ?, end_date = ?, updated_at = ?
      WHERE id = ? AND merchant_id = ? AND plan_id = ? AND start_date = ? AND end_date = ?`,
    [
      previousPlanId,
      previousBillingCycle,
      previousStatus,
      mysqlTimestamp(new Date(previousStartDate)),
      mysqlTimestamp(new Date(previousEndDate)),
      timestamp,
      subscriptionId,
      payment.merchant_id,
      appliedPlanId,
      appliedStartDate,
      appliedEndDate,
    ],
  );
  if (Number((result as { affectedRows: number }).affectedRows) !== 1) {
    throw new Error('PLAN_REFUND_STATE_MISMATCH');
  }
  await synchronizeMerchant(
    connection,
    payment.merchant_id,
    subscriptionId,
    previousStatus,
    previousPlan?.max_customers ?? 100,
  );
}

export async function completeImmediateCanonicalPlanChange(
  transactionId: number,
  merchantId: number,
): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<PaymentRow[]>(
      `SELECT id, merchant_id, subscription_id, type, amount, currency, status, metadata
         FROM payment_transactions WHERE id = ? LIMIT 1 FOR UPDATE`,
      [transactionId],
    );
    const payment = rows[0];
    if (!payment || payment.merchant_id !== merchantId) throw new Error('PAYMENT_OWNERSHIP_MISMATCH');
    if (!['upgrade', 'downgrade'].includes(payment.type)) throw new Error('INVALID_IMMEDIATE_PAYMENT_TYPE');
    if (payment.status !== 'pending' || Number(payment.amount) !== 0) throw new Error('INVALID_IMMEDIATE_PAYMENT_STATE');

    const now = new Date();
    const metadata = parseMetadata(payment.metadata);
    const subscriptionId = await applyPlanChange(connection, payment, metadata, now);
    const [updated] = await connection.execute(
      `UPDATE payment_transactions
          SET status = 'completed', subscription_id = ?, paid_at = ?, metadata = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
      [subscriptionId, mysqlTimestamp(now), JSON.stringify(metadata), mysqlTimestamp(now), payment.id],
    );
    if (Number((updated as { affectedRows: number }).affectedRows) !== 1) throw new Error('PAYMENT_STATE_RACE');
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function processCanonicalSubscriptionCharge(
  charge: VerifiedSubscriptionCharge,
): Promise<{ success: boolean; status: string; message: string }> {
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<PaymentRow[]>(
      `SELECT id, merchant_id, subscription_id, type, amount, currency, status, metadata
         FROM payment_transactions WHERE tap_charge_id = ? LIMIT 1 FOR UPDATE`,
      [charge.id],
    );
    const payment = rows[0];
    if (!payment) {
      await connection.rollback();
      return { success: false, status: 'not_found', message: 'Transaction not found' };
    }

    if (charge.status === 'REFUNDED') {
      if (payment.status === 'refunded') {
        await connection.commit();
        return { success: true, status: 'refunded', message: 'Transaction already refunded' };
      }
      if (payment.status !== 'completed') throw new Error('INVALID_REFUND_STATE');

      const validation = validateCanonicalCharge(payment, charge);
      if (!validation.valid) {
        await connection.rollback();
        return { success: false, status: 'verification_failed', message: 'Refund verification mismatch' };
      }

      const now = new Date();
      const metadata = parseMetadata(payment.metadata);
      await compensateRefund(connection, payment, metadata, now);
      const [refunded] = await connection.execute(
        `UPDATE payment_transactions SET status = 'refunded', refunded_at = ?, refund_reason = 'tap_refund', updated_at = ? WHERE id = ?`,
        [mysqlTimestamp(now), mysqlTimestamp(now), payment.id],
      );
      if (Number((refunded as { affectedRows: number }).affectedRows) !== 1) throw new Error('REFUND_STATE_RACE');
      await connection.commit();
      return { success: true, status: 'refunded', message: 'Refund applied' };
    }

    if (payment.status !== 'pending') {
      await connection.commit();
      return { success: true, status: payment.status, message: 'Transaction already processed' };
    }

    if (charge.status === 'FAILED' || charge.status === 'CANCELLED' || charge.status === 'DECLINED') {
      await connection.execute(
        `UPDATE payment_transactions SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'pending'`,
        [mysqlTimestamp(new Date()), payment.id],
      );
      await connection.commit();
      return { success: true, status: 'failed', message: 'Transaction marked failed' };
    }

    // AUTHORIZED/INITIATED are not money movement and must never grant entitlement.
    if (charge.status !== 'CAPTURED') {
      await connection.commit();
      return { success: true, status: 'pending', message: 'Awaiting captured payment' };
    }

    const validation = validateCanonicalCharge(payment, charge);
    if (!validation.valid) {
      await connection.execute(
        `UPDATE payment_transactions SET status = 'failed', refund_reason = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
        [validation.reason, mysqlTimestamp(new Date()), payment.id],
      );
      await connection.commit();
      return { success: false, status: 'failed', message: 'Payment verification mismatch' };
    }

    const metadata = parseMetadata(payment.metadata);
    const now = new Date();
    let subscriptionId = payment.subscription_id;
    if (payment.type === 'subscription') {
      subscriptionId = await activateNewSubscription(connection, payment, metadata, now);
    } else if (payment.type === 'upgrade' || payment.type === 'downgrade') {
      subscriptionId = await applyPlanChange(connection, payment, metadata, now);
    } else if (payment.type === 'renewal') {
      subscriptionId = await applyRenewal(connection, payment, metadata, now);
    } else if (payment.type === 'addon') {
      const merchantAddonId = await applyAddon(connection, payment, metadata, now);
      metadata.merchantAddonId = merchantAddonId;
    } else {
      throw new Error('UNSUPPORTED_PAYMENT_TYPE');
    }

    const safeResponse = JSON.stringify({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
      liveMode: charge.live_mode ?? null,
    });
    const [updated] = await connection.execute(
      `UPDATE payment_transactions
          SET status = 'completed', subscription_id = ?, paid_at = ?, tap_response = ?, metadata = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
      [subscriptionId, mysqlTimestamp(now), safeResponse, JSON.stringify(metadata), mysqlTimestamp(now), payment.id],
    );
    if (Number((updated as { affectedRows: number }).affectedRows) !== 1) {
      throw new Error('PAYMENT_STATE_RACE');
    }

    await connection.commit();
    return { success: true, status: 'completed', message: 'Payment and entitlement committed' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
