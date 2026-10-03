import { getPool } from '../db/connection';
import { ensureScheduledAuthoritySchema } from '../scheduled-message-authorization';
import { prepareScheduledMessage } from '../scheduled-message-preparation';

/** Weekly definitions prepare tenant campaigns; this job never calls a messaging provider. */
export async function checkScheduledMessages() {
  await ensureScheduledAuthoritySchema(); const pool = await getPool(); if (!pool) throw Error('Scheduled messages unavailable');
  let cursor = 0, checked = 0, prepared = 0, skipped = 0, failed = 0;
  // Keyset pages cover all authorized definitions. Legacy enabled rows require an explicit review.
  for (;;) {
    const [page] = await pool.execute<any[]>(`SELECT s.id,s.merchant_id FROM scheduled_messages s
      JOIN scheduled_message_authorizations a ON a.scheduled_message_id=s.id AND a.merchant_id=s.merchant_id AND a.active=1
      WHERE s.is_active=1 AND s.id>? ORDER BY s.id LIMIT 100`, [cursor]);
    if (!page.length) break;
    for (const row of page) {
      checked++; cursor = row.id;
      try { if (await prepareScheduledMessage(row.merchant_id, row.id) === 'prepared') prepared++; else skipped++; }
      catch { failed++; console.error('[Scheduled Messages] preparation unavailable'); }
    }
  }
  return { checked, prepared, skipped, failed };
}
let timer: NodeJS.Timeout | null = null, running = false;
export function startScheduledMessagesJob() {
  if (timer) return;
  const tick = async () => {
    if (running) return; running = true;
    try { await checkScheduledMessages(); } catch { console.error('[Scheduled Messages] batch unavailable'); } finally { running = false; }
  };
  void tick(); timer = setInterval(tick, 60_000); timer.unref?.();
}
