/** Green API polling transport. Business logic lives in the durable inbound worker. */
import * as whatsapp from './whatsapp';
import { getAllWhatsAppConnectionRequests, getWhatsAppConnectionRequestByMerchantId } from './db';
const activePollers = new Map<number, NodeJS.Timeout>();
const pollingMerchantsInFlight = new Set<number>();
const POLLING_INTERVAL = 2000;

/**
 * Start polling for a specific merchant
 */
export async function startPolling(merchantId: number): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if already polling
    if (activePollers.has(merchantId)) {
      console.log(`[Polling] Already polling for merchant ${merchantId}`);
      return { success: true };
    }

    // Get merchant's WhatsApp connection from connection requests
    const connection = await getWhatsAppConnectionRequestByMerchantId(merchantId);
    if (!connection || connection.status !== 'connected') {
      return { success: false, error: 'WhatsApp not connected' };
    }

    if (!connection.instanceId || !connection.apiToken) {
      return { success: false, error: 'Missing Green API credentials' };
    }

    const apiUrl = 'https://api.green-api.com';

    // A settings read failure is not evidence that the instance uses polling.
    // Never clear a webhook here: a concurrent settings change may have enabled it.
    const currentSettings = await whatsapp.getWebhookSettings(connection.instanceId, connection.apiToken, apiUrl);
    if (currentSettings.error || typeof currentSettings.webhookUrl !== 'string') {
      return { success: false, error: 'Unable to verify WhatsApp delivery mode' };
    }
    if (currentSettings.webhookUrl.trim()) {
      console.log(`[Polling] Skipping merchant ${merchantId}: webhook delivery is configured`);
      return { success: true };
    }
    console.log(`[Polling] Starting polling for merchant ${merchantId} (no webhook configured)`);

    // Start polling interval
    const interval = setInterval(async () => {
      await pollMessages(merchantId, connection.instanceId!, connection.apiToken!, apiUrl);
    }, POLLING_INTERVAL);

    activePollers.set(merchantId, interval);

    // Poll immediately
    await pollMessages(merchantId, connection.instanceId, connection.apiToken, apiUrl);

    return { success: true };
  } catch (error: any) {
    console.error(`[Polling] Error starting polling for merchant ${merchantId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Stop polling for a specific merchant
 */
export function stopPolling(merchantId: number): void {
  const interval = activePollers.get(merchantId);
  if (interval) {
    clearInterval(interval);
    activePollers.delete(merchantId);
    console.log(`[Polling] Stopped polling for merchant ${merchantId}`);
  }
}

/**
 * Poll for messages from Green API
 */
async function pollMessages(
  merchantId: number,
  instanceId: string,
  apiToken: string,
  apiUrl: string
): Promise<void> {
  if (pollingMerchantsInFlight.has(merchantId)) return;
  pollingMerchantsInFlight.add(merchantId);

  try {
    // Receive notification from Green API
    const { notification, receiptId, error } = await whatsapp.receiveNotification(instanceId, apiToken, apiUrl);

    if (error) {
      console.error(`[Polling] Error receiving notification for merchant ${merchantId}:`, error);
      return;
    }

    if (!notification || !receiptId) {
      // No new messages
      return;
    }

    console.log(`[Polling] Received notification for merchant ${merchantId}`, {
      typeWebhook: notification.typeWebhook || 'unknown',
      hasMessageData: Boolean(notification.messageData),
    });

    // Process the notification
    const { acceptWhatsAppEvent } = await import('./messaging/ingress');
    const accepted = await acceptWhatsAppEvent({
      ...notification,
      instanceData: { ...notification.instanceData, idInstance: instanceId },
    }, 'polling', merchantId);
    if (!accepted.success) throw new Error('Polling event was not accepted');

    // Delete the notification from queue
    const deleteResult = await whatsapp.deleteNotification(instanceId, apiToken, receiptId, apiUrl);
    if (!deleteResult.success) {
      console.warn(`[Polling] Notification ${receiptId} was processed but not acknowledged: ${deleteResult.error || 'unknown error'}`);
    }

  } catch (error) {
    console.error(`[Polling] Error polling messages for merchant ${merchantId}:`, error);
  } finally {
    pollingMerchantsInFlight.delete(merchantId);
  }
}

/**
 * Start polling for all connected merchants
 */
export async function startAllPolling(): Promise<void> {
  try {
    console.log('[Polling] Starting polling for all connected merchants...');
    
    // Get all connected WhatsApp connections
    const connections = await getAllWhatsAppConnectionRequests();
    const connectedConnections = connections.filter(c => c.status === 'connected');
    
    for (const connection of connectedConnections) {
      if (connection.instanceId && connection.apiToken) {
        await startPolling(connection.merchantId);
      }
    }

    console.log(`[Polling] Started polling for ${connectedConnections.length} merchants`);
  } catch (error) {
    console.error('[Polling] Error starting all polling:', error);
  }
}

/**
 * Stop all polling
 */
export function stopAllPolling(): void {
  console.log('[Polling] Stopping all polling...');
  activePollers.forEach((interval, merchantId) => {
    clearInterval(interval);
    console.log(`[Polling] Stopped polling for merchant ${merchantId}`);
  });
  activePollers.clear();
}

/**
 * Get polling status
 */
export function getPollingStatus(): { merchantId: number; active: boolean }[] {
  return Array.from(activePollers.keys()).map(merchantId => ({
    merchantId,
    active: true,
  }));
}


/**
 * Restart polling for a specific merchant
 * This will stop the current polling, clear webhook URL, and start fresh
 */
export async function restartPolling(merchantId: number): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Polling] Restarting polling for merchant ${merchantId}...`);
    
    // Stop current polling if active
    stopPolling(merchantId);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start polling (this will clear webhook URL)
    return await startPolling(merchantId);
  } catch (error: any) {
    console.error(`[Polling] Error restarting polling for merchant ${merchantId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Restart all polling
 * This will stop all current polling, clear webhook URLs, and start fresh
 */
export async function restartAllPolling(): Promise<void> {
  try {
    console.log('[Polling] Restarting all polling...');
    
    // Stop all current polling
    stopAllPolling();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start all polling (this will clear webhook URLs)
    await startAllPolling();
  } catch (error) {
    console.error('[Polling] Error restarting all polling:', error);
  }
}

/**
 * Force clear webhook and restart polling for a merchant
 * Use this when webhook is blocking polling
 */
export async function forceClearAndRestartPolling(merchantId: number): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Polling] Force clearing webhook and restarting polling for merchant ${merchantId}...`);
    
    // Get merchant's WhatsApp connection
    const connection = await getWhatsAppConnectionRequestByMerchantId(merchantId);
    if (!connection || connection.status !== 'connected') {
      return { success: false, error: 'WhatsApp not connected' };
    }

    if (!connection.instanceId || !connection.apiToken) {
      return { success: false, error: 'Missing Green API credentials' };
    }

    // Stop current polling
    stopPolling(merchantId);

    // Force clear webhook URL
    const apiUrl = 'https://api.green-api.com';
    console.log(`[Polling] Force clearing webhook URL for instance ${connection.instanceId}...`);
    
    const clearResult = await whatsapp.clearWebhookUrl(connection.instanceId, connection.apiToken, apiUrl);
    
    if (clearResult.success) {
      console.log(`[Polling] Webhook URL cleared successfully. Waiting for Green API to process...`);
      // Wait longer for Green API to process the settings change
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds as recommended by Green API
    } else {
      console.warn(`[Polling] Warning: Failed to clear webhook URL: ${clearResult.error}`);
    }

    // Start polling
    return await startPolling(merchantId);
  } catch (error: any) {
    console.error(`[Polling] Error in forceClearAndRestartPolling for merchant ${merchantId}:`, error);
    return { success: false, error: error.message };
  }
}
