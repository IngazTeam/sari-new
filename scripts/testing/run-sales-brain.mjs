import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep virtual-clock provider tests separate from real MySQL integration tests.
const units = [
  'server/ai/sales-experiment-cohort-pentest.test.ts',
  'server/sales-experiment-cohort-access-pentest.test.ts',
  'server/sales-experiment-protocol-ui-pentest.test.ts',
  'server/ai/sales-experiment-protocol-pentest.test.ts',
  'server/sales-experiment-protocol-access-pentest.test.ts',
  'server/ai/legacy-ab-pentest.test.ts',
  'server/legacy-ab-access-pentest.test.ts',
  'server/learning-policy-history-access-pentest.test.ts',
  'server/learning-policy-evaluation-ui-pentest.test.ts',
  'server/ai/learning-policy-output-review-pentest.test.ts',
  'server/learning-policy-output-review-access-pentest.test.ts',
  'server/ai/learning-policy-evaluation-pentest.test.ts',
  'server/learning-policy-evaluation-access-pentest.test.ts',
  'server/ai/learning-policy-candidate-pentest.test.ts',
  'server/learning-policy-candidate-access-pentest.test.ts',
  'server/learning-policy-review-ui-pentest.test.ts',
  'server/ai/learning-policy-review-pentest.test.ts',
  'server/learning-policy-review-access-pentest.test.ts',
  'server/ai/budget-settlement-pentest.test.ts',
  'server/ai/learning-provider-recovery-worker-pentest.test.ts',
  'server/ai/provider-job-retrieval-pentest.test.ts',
  'server/ai/learning-response-handoff-pentest.test.ts',
  'server/ai/provider-lifecycle-pentest.test.ts',
  'server/ai/learning-signal-capture-pentest.test.ts',
  'server/learning-recovery-bootstrap-pentest.test.ts',
  'server/learning-recovery-access-pentest.test.ts',
  'server/ai/learning-recovery-worker-pentest.test.ts',
  'server/ai/learning-analysis-pentest.test.ts',
  'server/ai/sales-decision-benchmark.test.ts',
  'server/ai/customer-decision-pentest.test.ts',
  'server/appointment-reminder-access-pentest.test.ts',
  'server/appointment-reminder-pentest.test.ts',
  'server/ai/auxiliary-routing-pentest.test.ts',
  'server/voice-transcription.test.ts',
  'server/ai-settings-provider-routing.test.ts',
  'server/booking-reschedule-pentest.test.ts',
  'server/calendar-transport-pentest.test.ts',
  'server/calendar-evidence-pentest.test.ts',
  'server/booking-cancellation-intent.test.ts',
  'server/booking-cancellation-pentest.test.ts',
  'server/ai/booking-conversation.test.ts',
  'server/calendar-provider-contract.test.ts',
  'server/appointment-reconciliation-pentest.test.ts',
  'server/appointment-booking.test.ts',
  'server/appointment-capacity-pentest.test.ts',
  'server/calendar-availability.test.ts',
  'server/booking-capacity-pentest.test.ts',
  'server/booking-operations-pentest.test.ts',
  'server/booking-calendar-pentest.test.ts',
  'server/booking-checkout-pentest.test.ts',
  'server/checkout-reconciliation-pentest.test.ts',
  'server/ai/checkout-margin.test.ts',
  'server/ai/checkout-discount.test.ts',
  'server/ai/sales-offer-evidence.test.ts', 'server/ai/sales-persuasion-consistency.test.ts', 'server/ai/auto-discount-authority.test.ts',
  'server/webhooks/greenapi-escalation.test.ts',
  'server/ai/escalation-routing.test.ts',
  'server/ai/customer-memory.test.ts',
  'server/ai/customer-memory-chat.test.ts',
  'server/tests/adaptive-sales-engine.test.ts',
  'server/ai/sales-brain-decisions.test.ts', 'server/ai/sales-brain-learning.test.ts',
  'server/ai/review-sales-response.test.ts', 'server/ai/response-validator-failure.test.ts',
  'server/ai/transactional-truth.test.ts', 'server/ai/action-execution.test.ts',
  'server/ai/zahypi-client.test.ts', 'server/ai/openai-zahypi.test.ts',
  'server/tap-order-payment-effects-pentest.test.ts',
  'server/ai/provider-interaction.test.ts', 'server/ai/checkout-conversation.test.ts',
  'server/knowledge/retrieval.test.ts', 'server/knowledge/merchant-teaching.test.ts',
  'server/ai/response-critic-contract.test.ts',
  'server/ai/sales-turn-policy.test.ts',
  'server/ai/requested-followup-time.test.ts',
  'server/ai/followup-policy.test.ts',
  'server/automation/zid-order-from-chat.test.ts', 'server/automation/zid-order-contract.test.ts',
  'server/automation/zid-order-extraction.test.ts',
  'server/tests/chat-commerce-pentest.test.ts',
];
const database = [
  'server/ai/sales-experiment-cohort.mysql.test.ts',
  'server/ai/sales-experiment-protocol.mysql.test.ts',
  'server/ai/legacy-ab.mysql.test.ts',
  'server/ai/learning-policy-output-review.mysql.test.ts',
  'server/ai/learning-policy-review.mysql.test.ts',
  'server/ai/learning-policy-candidates.mysql.test.ts',
  'server/ai/learning-policy-evaluation.mysql.test.ts',
  'server/ai/budget-settlement.mysql.test.ts',
  'server/ai/learning-provider-attempt.mysql.test.ts',
  'server/ai/learning-signal-capture.mysql.test.ts',
  'server/ai/learning-analysis-recovery.mysql.test.ts',
  'server/ai/learning-analysis-jobs.mysql.test.ts',
  'server/ai/learning-analysis.mysql.test.ts',
  'server/appointment-reminders.mysql.test.ts',
  'server/ai/booking-reschedule.mysql.test.ts',
  'server/ai/booking-cancellation.mysql.test.ts',
  'server/ai/booking-agreements.mysql.test.ts',
  'server/ai/booking-amendments.mysql.test.ts',
  'server/ai/booking-calendar.mysql.test.ts',
  'server/appointment-creation-requests.mysql.test.ts',
  'server/appointment-reconciliation.mysql.test.ts',
  'server/appointment-capacity.mysql.test.ts',
  'server/booking-capacity.mysql.test.ts',
  'server/booking-operations.mysql.test.ts',
  'server/payment/booking-payment-link-renewal.mysql.test.ts',
  'server/payment/booking-checkout-reconciliation.mysql.test.ts',
  'server/payment/booking-checkout.mysql.test.ts',
  'server/ai/checkout-discount-release.mysql.test.ts',
  'server/payment/checkout-reconciliation.mysql.test.ts',
  'server/payment/order-checkout-attempts.mysql.test.ts',
  'server/ai/checkout-margin.mysql.test.ts',
  'server/ai/checkout-discount.mysql.test.ts',
  'server/ai/sales-offer-review.mysql.test.ts',
  'server/ai/sales-offer-reconciliation.mysql.test.ts',
  'server/ai/sales-offer-authority.mysql.test.ts',
  'server/ai/sales-offer-evidence.mysql.test.ts',
  'server/ai/escalation-reconciliation.mysql.test.ts',
  'server/ai/customer-memory.mysql.test.ts',
  'server/ai/followup-policy.mysql.test.ts', 'server/ai/discount-policy.mysql.test.ts',
  'server/ai/conversation-handoff.mysql.test.ts',
  'server/ai/escalation-relay.mysql.test.ts',
  'server/ai/interaction-jobs.mysql.test.ts', 'server/ai/proactive-followup.mysql.test.ts',
  'server/ai/review-sales-delivery.mysql.test.ts', 'server/ai/session-store.mysql.test.ts',
  'server/ai/verified-purchase-memory.mysql.test.ts',
  'server/ai/checkout-agreements.mysql.test.ts',
  'server/ai/learning-evidence.mysql.test.ts',
  'server/ai/sales-playbook.mysql.test.ts',
  'server/knowledge/sales-knowledge.mysql.test.ts', 'server/knowledge/lifecycle.mysql.test.ts',
  'server/ai/zid-checkout-agreements.mysql.test.ts',
  'server/ai/sales-sector-settings.mysql.test.ts',
  'server/messaging/inbound.mysql.test.ts', 'server/messaging/inbound-process.mysql.test.ts',
];
const output = resolve('.tmp/sales-brain-evidence'); mkdirSync(output, { recursive: true });
function run(name, args) {
  const result = spawnSync(process.execPath, [resolve('scripts/testing/run-isolated.mjs'), ...args,
    '--reporter=default', '--reporter=json', `--outputFile.json=${resolve(output, `${name}.json`)}`],
  { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
run('unit', units);
// Files share one disposable database and global queues. A worker in one file may
// legitimately claim another file's job; serialize files, retaining concurrency within tests.
if (process.argv.includes('--with-database')) run('database', ['--with-database', '--no-file-parallelism', ...database]);
else console.log('Database acceptance not run. Use --with-database and SARI_TEST_DATABASE_URL for a disposable loopback database.');
if (process.argv.includes('--regression')) {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  const files = [...new Set(['test:remediation', 'pretest:release', 'test:zahypi'].flatMap(name =>
    pkg.scripts[name].split(/\s+/).filter(value => value.endsWith('.test.ts'))))];
  files.push('server/central-interactions.test.ts', 'server/central-landing.test.ts',
    'server/merchant-semantic-i18n-pentest.test.ts', 'server/customer-profile-canonical-pentest.test.ts',
    'server/sales-conversion-pentest.test.ts', 'server/tap-payment-idempotency-pentest.test.ts', 'server/tap-payment-ownership-pentest.test.ts',
    'server/coaching-bugfix-pentest.test.ts', 'server/context-intelligence-pentest.test.ts');
  run('regression', files);
  run('legacy-sales', ['server/sales-hardening-pentest.test.ts', 'server/sales-engine-pentest.test.ts', 'server/conversation-order-payment-link-pentest.test.ts']);
  if (process.argv.includes('--with-database')) run('budget', ['--with-database', 'server/aiBudgetLedger.mysql.test.ts']);
}
if (process.argv.includes('--security')) {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
  const files = walk('server').filter(file => /-pentest\.test\.ts$/.test(file));
  run('security', [...new Set([...files, 'server/core-team-access.test.ts', 'server/merchant-access.test.ts',
    'server/products-access.test.ts', 'server/ai-settings-budget-access.test.ts', 'server/security/download-media.test.ts',
    'server/whatsapp-delivery-safety.test.ts', 'server/ai/budget-boundaries.test.ts', 'server/messaging/ingress.test.ts',
    'server/integrations/zahypi-connector/routes.test.ts', 'server/ai/task-validation.test.ts'])].sort());
}
