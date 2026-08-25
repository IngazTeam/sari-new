import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  WHATSAPP_DISCONNECT_ALERT_WINDOW_HOURS,
  WHATSAPP_DISCONNECT_MAX_ALERTS,
  WHATSAPP_DISCONNECT_REMINDER_AFTER_HOURS,
} from './whatsapp-disconnect-policy';

const INCIDENT_SCHEMA = [{
  table: 'whatsapp_disconnect_incidents',
  columns: [
    'merchant_id', 'instance_id', 'detected_at', 'alerts_sent', 'next_alert_at',
    'last_alert_at', 'resolved_at', 'open_instance_id',
  ],
  generatedColumns: [{
    name: 'open_instance_id',
    expression: 'CASE WHEN resolved_at IS NULL THEN instance_id ELSE NULL END',
    storage: 'stored' as const,
  }],
  uniqueIndexes: [{
    name: 'uq_whatsapp_disconnect_open_instance',
    columns: ['open_instance_id'],
  }],
  checkConstraints: [{
    name: 'whatsapp_disconnect_alert_count_check',
    expression: 'alerts_sent >= 0 AND alerts_sent <= 2',
    enforced: true,
  }],
}] as const;

export type WhatsAppDisconnectAlertReservation = {
  incidentId: number;
  sequence: 1 | 2;
  detectedAt: Date | string;
};

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}`);
}

/**
 * Reserves one alert cycle before any external delivery. This makes the hard
 * cap of two cycles durable and at-most-once across restarts/deploy overlaps.
 */
export async function reserveWhatsAppDisconnectAlert(input: {
  merchantId: number;
  instanceId: number;
}): Promise<WhatsAppDisconnectAlertReservation | null> {
  requirePositiveInteger(input.merchantId, 'merchant');
  requirePositiveInteger(input.instanceId, 'WhatsApp instance');
  await assertRuntimeSchema('WhatsApp disconnect alert incidents', INCIDENT_SCHEMA);

  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    try {
      await connection.execute(
        `INSERT INTO whatsapp_disconnect_incidents
          (merchant_id, instance_id, detected_at, alerts_sent, next_alert_at)
         SELECT merchant_id, id, NOW(3), 0, NOW(3)
           FROM whatsapp_instances
          WHERE id = ? AND merchant_id = ? AND status = 'active'`,
        [input.instanceId, input.merchantId],
      );
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
    }

    const [rows] = await connection.execute(
      `SELECT id, detected_at, alerts_sent,
              (detected_at > DATE_SUB(NOW(3), INTERVAL ${WHATSAPP_DISCONNECT_ALERT_WINDOW_HOURS} HOUR)) AS within_window,
              (next_alert_at IS NOT NULL AND next_alert_at <= NOW(3)) AS is_due
         FROM whatsapp_disconnect_incidents
        WHERE instance_id = ? AND merchant_id = ? AND resolved_at IS NULL
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [input.instanceId, input.merchantId],
    );
    const incident = (rows as any[])?.[0];
    if (!incident) throw new Error('Disconnect incident reservation was not persisted');

    const alertsSent = Number(incident.alerts_sent || 0);
    const withinWindow = Number(incident.within_window) === 1;
    const isDue = Number(incident.is_due) === 1;
    if (!withinWindow || alertsSent >= WHATSAPP_DISCONNECT_MAX_ALERTS) {
      await connection.execute(
        `UPDATE whatsapp_disconnect_incidents
            SET next_alert_at = NULL
          WHERE id = ? AND resolved_at IS NULL`,
        [incident.id],
      );
      await connection.commit();
      return null;
    }
    if (!isDue) {
      await connection.commit();
      return null;
    }

    const sequence = (alertsSent + 1) as 1 | 2;
    const [updated] = await connection.execute(
      `UPDATE whatsapp_disconnect_incidents
          SET next_alert_at = CASE
                WHEN alerts_sent = 0
                  THEN DATE_ADD(detected_at, INTERVAL ${WHATSAPP_DISCONNECT_REMINDER_AFTER_HOURS} HOUR)
                ELSE NULL
              END,
              last_alert_at = NOW(3),
              alerts_sent = alerts_sent + 1
        WHERE id = ? AND resolved_at IS NULL AND alerts_sent = ?`,
      [incident.id, alertsSent],
    );
    if (Number((updated as any)?.affectedRows || 0) !== 1) {
      throw new Error('Disconnect alert reservation lost its row lock');
    }

    await connection.commit();
    return {
      incidentId: Number(incident.id),
      sequence,
      detectedAt: incident.detected_at,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function resolveWhatsAppDisconnectIncident(input: {
  merchantId: number;
  instanceId: number;
}): Promise<void> {
  requirePositiveInteger(input.merchantId, 'merchant');
  requirePositiveInteger(input.instanceId, 'WhatsApp instance');
  await assertRuntimeSchema('WhatsApp disconnect alert incidents', INCIDENT_SCHEMA);
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  await pool.execute(
    `UPDATE whatsapp_disconnect_incidents
        SET resolved_at = NOW(3), next_alert_at = NULL
      WHERE merchant_id = ? AND instance_id = ? AND resolved_at IS NULL`,
    [input.merchantId, input.instanceId],
  );
}
