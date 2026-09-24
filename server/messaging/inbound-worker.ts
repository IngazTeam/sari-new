import { assertInboundSchema, claimInbound, executeInbound, recoverExpiredInbound } from './inbound-jobs';

export async function startInboundWorker() {
  await assertInboundSchema();
  const { startInteractionWorker } = await import('../ai/interaction-jobs');
  const stopInteractions = await startInteractionWorker();
  const { startEscalationReconciliationWorker } = await import('../ai/escalation-reconciliation');
  const stopReconciliation = await startEscalationReconciliationWorker();
  const { startSalesOfferReconciliationWorker } = await import('../ai/sales-offer-reconciliation');
  const stopOfferReconciliation = await startSalesOfferReconciliationWorker();
  const { startBookingNotificationWorker } = await import('../booking-reschedule-notification');
  const stopBookingNotifications = await startBookingNotificationWorker();
  const { startAppointmentReminderWorker } = await import('../appointment-reminders');
  const stopAppointmentReminders = await startAppointmentReminderWorker();
  let stopping = false;
  let active: Promise<void> | undefined;
  let nextRetentionAt = 0;
  const tick = () => {
    if (stopping || active) return;
    active = (async () => {
      await recoverExpiredInbound();
      if (Date.now() >= nextRetentionAt) {
        const { purgeCompletedInboundPayloads } = await import('./retention');
        await purgeCompletedInboundPayloads();
        nextRetentionAt = Date.now() + 60 * 60 * 1000;
      }
      const job = await claimInbound();
      if (!job || stopping) return; // Unstarted claim can be safely recovered after expiry.
      const { handleGreenAPIWebhook } = await import('../webhooks/greenapi');
      await executeInbound(job, handleGreenAPIWebhook);
    })().catch(() => {
      // Never log payloads, provider URLs, or credentials from worker errors.
      console.error('[InboundWorker] Processing failed; durable state retained for recovery');
    }).finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, 500);
  tick();
  return async () => { stopping = true; clearInterval(timer); await active; await stopInteractions(); await stopReconciliation(); await stopOfferReconciliation(); await stopBookingNotifications(); await stopAppointmentReminders(); };
}
