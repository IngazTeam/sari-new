/**
 * Migration Script: Move WhatsApp data from merchants table to whatsapp_instances table
 * 
 * This script migrates existing WhatsApp connection data from the merchants table
 * to the new whatsapp_instances table for better management of multiple instances.
 * 
 * Run: node --loader tsx server/migrations/migrate-whatsapp-instances.ts
 */

import {
  createWhatsAppInstance,
  getAllMerchants,
  getWhatsAppInstanceByInstanceId,
  getWhatsappConnectionByMerchantId,
} from '../db';

async function migrateWhatsAppInstances() {
  console.log('[Migration] Starting WhatsApp instances migration...');

  try {
    // Get all merchants
    const merchants = await getAllMerchants();
    console.log(`[Migration] Found ${merchants.length} merchants`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const merchant of merchants) {
      try {
        // Check if merchant has WhatsApp connection data in old format
        // (This assumes merchants table had whatsappInstanceId and whatsappToken fields)
        const connection = await getWhatsappConnectionByMerchantId(merchant.id);
        
        if (!connection || !connection.instanceId || !connection.apiToken) {
          console.log(`[Migration] Skipping merchant ${merchant.id} - No WhatsApp connection`);
          skippedCount++;
          continue;
        }

        // Check if already migrated
        const existing = await getWhatsAppInstanceByInstanceId(connection.instanceId);
        if (existing) {
          console.log(`[Migration] Skipping merchant ${merchant.id} - Already migrated`);
          skippedCount++;
          continue;
        }

        // Create new instance
        const instance = await createWhatsAppInstance({
          merchantId: merchant.id,
          instanceId: connection.instanceId,
          token: connection.apiToken,
          apiUrl: 'https://api.green-api.com',
          phoneNumber: connection.phoneNumber || null,
          webhookUrl: null,
          status: connection.status === 'connected' ? 'active' : 'inactive',
          isPrimary: 1, // Set first instance as primary
          lastSyncAt: connection.lastConnected || null,
          connectedAt: connection.lastConnected || null,
          expiresAt: null,
          metadata: null,
        });

        if (instance) {
          console.log(`[Migration] ✓ Migrated merchant ${merchant.id} - Instance ${connection.instanceId}`);
          migratedCount++;
        } else {
          console.log(`[Migration] ✗ Failed to migrate merchant ${merchant.id}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`[Migration] Error migrating merchant ${merchant.id}:`, error);
        errorCount++;
      }
    }

    console.log('\n[Migration] Summary:');
    console.log(`  - Migrated: ${migratedCount}`);
    console.log(`  - Skipped: ${skippedCount}`);
    console.log(`  - Errors: ${errorCount}`);
    console.log('[Migration] Migration completed!');

  } catch (error) {
    console.error('[Migration] Fatal error:', error);
    process.exit(1);
  }
}

// Run migration
migrateWhatsAppInstances()
  .then(() => {
    console.log('[Migration] Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Migration] Failed:', error);
    process.exit(1);
  });
