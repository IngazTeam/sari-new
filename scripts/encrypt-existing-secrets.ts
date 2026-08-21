import '../server/_core/loadEnv';
import { eq } from 'drizzle-orm';
import {
  merchantPaymentSettings,
  paymentGateways,
  platformIntegrations,
  whatsappConnections,
  whatsappConnectionRequests,
  whatsappInstances,
  whatsappRequests,
} from '../drizzle/schema';
import { closeDb, getDb } from '../server/db';
import { encryptSecret, isEncryptedSecret } from '../server/security/secrets';

if (!process.env.FIELD_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY.length < 32) {
  throw new Error('FIELD_ENCRYPTION_KEY (32+ characters) is required for the credential migration');
}

let updated = 0;

async function main() {
  const db = await getDb();
  if (!db) throw new Error('Database is not initialized');

  const instances = await db.select({ id: whatsappInstances.id, token: whatsappInstances.token }).from(whatsappInstances);
  for (const row of instances) {
    if (!isEncryptedSecret(row.token)) {
      await db.update(whatsappInstances).set({ token: encryptSecret(row.token) }).where(eq(whatsappInstances.id, row.id));
      updated++;
    }
  }

  const legacyConnections = await db.select({ id: whatsappConnections.id, apiToken: whatsappConnections.apiToken }).from(whatsappConnections);
  for (const row of legacyConnections) {
    if (row.apiToken && !isEncryptedSecret(row.apiToken)) {
      await db.update(whatsappConnections).set({ apiToken: encryptSecret(row.apiToken) }).where(eq(whatsappConnections.id, row.id));
      updated++;
    }
  }

  const connectionRequests = await db.select({ id: whatsappConnectionRequests.id, apiToken: whatsappConnectionRequests.apiToken }).from(whatsappConnectionRequests);
  for (const row of connectionRequests) {
    if (row.apiToken && !isEncryptedSecret(row.apiToken)) {
      await db.update(whatsappConnectionRequests).set({ apiToken: encryptSecret(row.apiToken) }).where(eq(whatsappConnectionRequests.id, row.id));
      updated++;
    }
  }

  const requests = await db.select({ id: whatsappRequests.id, token: whatsappRequests.token }).from(whatsappRequests);
  for (const row of requests) {
    if (row.token && !isEncryptedSecret(row.token)) {
      await db.update(whatsappRequests).set({ token: encryptSecret(row.token) }).where(eq(whatsappRequests.id, row.id));
      updated++;
    }
  }

  const merchantPayments = await db.select({
    id: merchantPaymentSettings.id,
    tapSecretKey: merchantPaymentSettings.tapSecretKey,
    tapWebhookSecret: merchantPaymentSettings.tapWebhookSecret,
  }).from(merchantPaymentSettings);
  for (const row of merchantPayments) {
    const changes: Record<string, string> = {};
    if (row.tapSecretKey && !isEncryptedSecret(row.tapSecretKey)) changes.tapSecretKey = encryptSecret(row.tapSecretKey);
    if (row.tapWebhookSecret && !isEncryptedSecret(row.tapWebhookSecret)) changes.tapWebhookSecret = encryptSecret(row.tapWebhookSecret);
    if (Object.keys(changes).length > 0) {
      await db.update(merchantPaymentSettings).set(changes).where(eq(merchantPaymentSettings.id, row.id));
      updated++;
    }
  }

  const gateways = await db.select({
    id: paymentGateways.id,
    secretKey: paymentGateways.secretKey,
    webhookSecret: paymentGateways.webhookSecret,
  }).from(paymentGateways);
  for (const row of gateways) {
    const changes: Record<string, string> = {};
    if (row.secretKey && !isEncryptedSecret(row.secretKey)) changes.secretKey = encryptSecret(row.secretKey);
    if (row.webhookSecret && !isEncryptedSecret(row.webhookSecret)) changes.webhookSecret = encryptSecret(row.webhookSecret);
    if (Object.keys(changes).length > 0) {
      await db.update(paymentGateways).set(changes).where(eq(paymentGateways.id, row.id));
      updated++;
    }
  }

  const integrations = await db.select({
    id: platformIntegrations.id,
    accessToken: platformIntegrations.accessToken,
    refreshToken: platformIntegrations.refreshToken,
    settings: platformIntegrations.settings,
  }).from(platformIntegrations);
  for (const row of integrations) {
    const changes: Record<string, string> = {};
    if (row.accessToken && !isEncryptedSecret(row.accessToken)) changes.accessToken = encryptSecret(row.accessToken);
    if (row.refreshToken && !isEncryptedSecret(row.refreshToken)) changes.refreshToken = encryptSecret(row.refreshToken);
    if (row.settings) {
      try {
        const settings = JSON.parse(row.settings);
        let settingsChanged = false;
        for (const key of ['managerToken', 'webhook_secret', 'clientSecret', 'apiKey']) {
          if (typeof settings[key] === 'string' && !isEncryptedSecret(settings[key])) {
            settings[key] = encryptSecret(settings[key]);
            settingsChanged = true;
          }
        }
        if (settingsChanged) changes.settings = JSON.stringify(settings);
      } catch {
        console.warn(`[SecurityMigration] Skipped malformed platform settings row ${row.id}`);
      }
    }
    if (Object.keys(changes).length > 0) {
      await db.update(platformIntegrations).set(changes).where(eq(platformIntegrations.id, row.id));
      updated++;
    }
  }

  console.log(`[SecurityMigration] Encrypted credential rows: ${updated}`);
}

main()
  .catch(error => {
    console.error('[SecurityMigration] Failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(() => closeDb());
