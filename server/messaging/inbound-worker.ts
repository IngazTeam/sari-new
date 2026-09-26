import { assertInboundSchema, claimInbound, executeInbound, recoverExpiredInbound } from './inbound-jobs';

export async function startInboundWorker() {
  await assertInboundSchema();
  const stops:Array<()=>Promise<void>>=[];
  const stopChildren=async()=>{
    const results=await Promise.allSettled(stops.map(stop=>Promise.resolve().then(stop)));
    if(results.some(result=>result.status==='rejected'))throw Error('Worker shutdown incomplete');
  };
  try {
    const { startInteractionWorker } = await import('../ai/interaction-jobs');
    const stopInteractions = await startInteractionWorker();
    stops.push(stopInteractions);
    const { startEscalationReconciliationWorker } = await import('../ai/escalation-reconciliation');
    const stopReconciliation = await startEscalationReconciliationWorker();
    stops.push(stopReconciliation);
    const { startSalesOfferReconciliationWorker } = await import('../ai/sales-offer-reconciliation');
    const stopOfferReconciliation = await startSalesOfferReconciliationWorker();
    stops.push(stopOfferReconciliation);
    const { startBookingNotificationWorker } = await import('../booking-reschedule-notification');
    const stopBookingNotifications = await startBookingNotificationWorker();
    stops.push(stopBookingNotifications);
    const { startAppointmentReminderWorker } = await import('../appointment-reminders');
    const stopAppointmentReminders = await startAppointmentReminderWorker();
    stops.push(stopAppointmentReminders);
    const { startLearningRecoveryWorker } = await import('../ai/learning-analysis-recovery');
    const stopLearningRecovery = await startLearningRecoveryWorker();
    stops.push(stopLearningRecovery);
    const { startLearningProviderRecoveryWorker } = await import('../ai/learning-provider-recovery');
    stops.push(await startLearningProviderRecoveryWorker());
    const { startAiSettlementWorker } = await import('../ai/budget-settlement');
    stops.push(await startAiSettlementWorker());
    const { startSalesGenerationRecoveryWorker } = await import('../ai/sales-generation-recovery');
    stops.push(await startSalesGenerationRecoveryWorker());
    const { startSalesReplyRecoveryWorker } = await import('../ai/sales-reply-recovery');
    stops.push(await startSalesReplyRecoveryWorker());
    const { startOrdinaryReplyUsageRecoveryWorker } = await import('../ai/ordinary-reply-usage');
    stops.push(await startOrdinaryReplyUsageRecoveryWorker());
    const { startSalesPaymentAttributionWorker } = await import('../ai/sales-payment-attribution');
    stops.push(await startSalesPaymentAttributionWorker());
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
    return async () => { stopping = true; clearInterval(timer); await active; await stopChildren(); };
  } catch(error) { await stopChildren().catch(()=>{}); throw error; }
}
