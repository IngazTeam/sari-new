import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep the established guard filename for deployed callers. These are contracts,
// not just table existence: old readers must never resume on store-scoped data.
// Do not infer compatibility from its age, application name or current DB data.
export const requiredReleaseCapabilities = Object.freeze([
  'website-analysis-durable-jobs-0200',
  'website-analysis-request-links-0201','competitor-reviewed-workspace-v1',
  'zid-order-store-identity-0127',
  'zid-catalog-store-identity-0129',
  'staff-voice-acceptance-0132',
  'salla-order-store-identity-0137',
  'salla-order-creation-0138',
  'salla-catalog-store-identity-0139',
  'salla-creation-effects-0140',
  'salla-sheet-receipts-0142',
  'salla-notice-receipts-0143',
  'zid-oauth-reviewed-admission-0189',
  'zid-dashboard-reviewed-writes-0190',
  'woocommerce-dashboard-authority-v1',
  'woocommerce-atomic-admission-v1',
  'woocommerce-reviewed-sync-0191',
  'woocommerce-reviewed-notices-0191',
  'woocommerce-dashboard-reviewed-writes-0191',
  'calendly-dashboard-authority-v1',
  'calendly-worker-authority-v1',
  'calendly-notification-authority-v1',
  'calendly-dashboard-reviewed-writes-0192',
  'merchant-referral-program-0193',
  'abandoned-cart-reminder-admission-0194',
  'abandoned-cart-reminder-transport-0194',
  'abandoned-cart-reviewed-writes-only-0194',
  'occasion-reviewed-writes-only-v1',
  'occasion-activation-grants-0195',
  'occasion-preparation-authority-0195',
  'occasion-dispatch-authority-0195',
  'promotion-atomic-writes-v1',
  'promotion-code-boundaries-v1',
  'promotion-reviewed-receipts-0196',
  'promotion-request-resolution-v1', 'promotion-reviewed-writes-only-v1', 'promotion-evidence-boundaries-v1', 'promotion-arsenal-evidence-v1', 'promotion-target-names-v1', 'promotion-named-scope-evidence-v1', 'promotion-banner-transport-v1', 'ordinary-reply-media-producer-v2', 'media-action-receipts-0197', 'media-reviewed-writes-only-0197', 'weekly-schedule-transport-0198', 'weekly-reviewed-actions-0198', 'weekly-reviewed-writes-only-0198', 'review-scoped-replies-only-v1', 'review-unscoped-automation-retired-v1', 'review-aggregate-reference-policy-v1', 'order-notice-reviewed-writes-only-v1', 'order-notice-authorizations-0199', 'order-notice-reviewed-transport-0199', 'order-notice-legacy-paths-retired-v1',
]);

export function assertZidOrderReleaseCompatible(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw Error('ZID_ORDER_RELEASE_INCOMPATIBLE');
  const marker = JSON.parse(fs.readFileSync(path.join(directory, 'scripts/zid-order-store-capability.json'), 'utf8'));
  if (marker?.version !== 1 || !Array.isArray(marker.capabilities)
      || !requiredReleaseCapabilities.every(capability => marker.capabilities.includes(capability))) {
    throw Error('ZID_ORDER_RELEASE_INCOMPATIBLE');
  }
}

export function assertManagedWritersStopped(processes) {
  if (!Array.isArray(processes)) throw Error('MANAGED_WRITERS_NOT_STOPPED');
  for (const app of processes.filter(app => ['sari', 'sari-inbound'].includes(app?.name))) {
    if (app.pm2_env?.status !== 'stopped' || (app.pid !== 0 && app.pid !== null)) throw Error('MANAGED_WRITERS_NOT_STOPPED');
  }
}

export function assertManagedWriterCompatibility(processes) {
  if (!Array.isArray(processes)) throw Error('INVALID_MANAGED_WRITER_STATE');
  for (const app of processes.filter(app => ['sari', 'sari-inbound'].includes(app?.name))) {
    const directory = app.pm2_env?.pm_cwd;
    assertZidOrderReleaseCompatible(directory);
    const executable = app.pm2_env?.pm_exec_path;
    if (typeof executable !== 'string' || path.resolve(executable) !== path.join(directory, 'dist', app.name === 'sari' ? 'index.js' : 'worker.js')) {
      throw Error('INVALID_MANAGED_WRITER_EXECUTABLE');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'compatible') assertZidOrderReleaseCompatible(process.argv[3]);
    else if (['stopped','writers-compatible'].includes(process.argv[2])) {
      let input='';for await (const chunk of process.stdin) input+=chunk;
      if(process.argv[2]==='stopped')assertManagedWritersStopped(JSON.parse(input));
      else assertManagedWriterCompatibility(JSON.parse(input));
    } else throw Error('INVALID_RELEASE_GUARD_ACTION');
  } catch {
    console.error('ZID_ORDER_RELEASE_GUARD_FAILED; RETAIN_DATA_AND_ROLL_FORWARD_WITH_COMPATIBLE_RELEASE');
    process.exitCode=1;
  }
}
