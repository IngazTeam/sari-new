import axios from 'axios';

/**
 * Green API WhatsApp Integration
 * 
 * This module provides functions to interact with Green API for WhatsApp messaging.
 * 
 * Required Environment Variables:
 * - GREEN_API_INSTANCE_ID: Your Green API instance ID
 * - GREEN_API_TOKEN: Your Green API token
 * 
 * Documentation: https://green-api.com/en/docs/
 */

interface GreenAPIConfig {
  instanceId: string;
  token: string;
}

function getGreenAPIConfig(): GreenAPIConfig {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;

  if (!instanceId || !token) {
    throw new Error('GREEN_API_INSTANCE_ID and GREEN_API_TOKEN must be set in environment variables');
  }

  return { instanceId, token };
}

function getBaseURL(instanceId: string, token: string): string {
  return `https://api.green-api.com/waInstance${instanceId}/${token}`;
}

/**
 * Get QR Code for WhatsApp connection
 * Returns base64 encoded QR code image
 */
export async function getQRCode(): Promise<{ qrCode: string; message: string }> {
  try {
    const { instanceId, token } = getGreenAPIConfig();
    const baseURL = getBaseURL(instanceId, token);

    // First, logout to get a new QR code
    await axios.get(`${baseURL}/logout`);

    // Wait a bit for logout to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get QR code
    const response = await axios.get(`${baseURL}/qr`);

    if (response.data && response.data.type === 'qrCode') {
      return {
        qrCode: response.data.message,
        message: 'Scan this QR code with WhatsApp to connect',
      };
    }

    throw new Error('Failed to get QR code');
  } catch (error: any) {
    console.error('Error getting QR code:', error);
    throw new Error(`Failed to get QR code: ${error.message}`);
  }
}

/**
 * Get connection status
 * Returns the current WhatsApp connection status
 */
export async function getConnectionStatus(): Promise<{
  isConnected: boolean;
  status: string;
  phoneNumber?: string;
}> {
  try {
    const { instanceId, token } = getGreenAPIConfig();
    const baseURL = getBaseURL(instanceId, token);

    const response = await axios.get(`${baseURL}/getStateInstance`);

    const isConnected = response.data.stateInstance === 'authorized';
    
    return {
      isConnected,
      status: response.data.stateInstance,
      phoneNumber: isConnected ? response.data.phoneNumber : undefined,
    };
  } catch (error: any) {
    console.error('Error getting connection status:', error);
    return {
      isConnected: false,
      status: 'error',
    };
  }
}

/**
 * Send text message
 */
export async function sendTextMessage(
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { instanceId, token } = getGreenAPIConfig();
    const baseURL = getBaseURL(instanceId, token);

    // Format phone number (remove + and spaces)
    const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');

    const response = await axios.post(`${baseURL}/sendMessage`, {
      chatId: `${formattedPhone}@c.us`,
      message,
    });

    if (response.data && response.data.idMessage) {
      return {
        success: true,
        messageId: response.data.idMessage,
      };
    }

    return {
      success: false,
      error: 'Failed to send message',
    };
  } catch (error: any) {
    console.error('Error sending text message:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send image with caption
 */
export async function sendImageMessage(
  phoneNumber: string,
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { instanceId, token } = getGreenAPIConfig();
    const baseURL = getBaseURL(instanceId, token);

    // Format phone number
    const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');

    const response = await axios.post(`${baseURL}/sendFileByUrl`, {
      chatId: `${formattedPhone}@c.us`,
      urlFile: imageUrl,
      fileName: 'image.jpg',
      caption: caption || '',
    });

    if (response.data && response.data.idMessage) {
      return {
        success: true,
        messageId: response.data.idMessage,
      };
    }

    return {
      success: false,
      error: 'Failed to send image',
    };
  } catch (error: any) {
    console.error('Error sending image:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send audio file
 */
export async function sendAudioMessage(
  phoneNumber: string,
  audioUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { instanceId, token } = getGreenAPIConfig();
    const baseURL = getBaseURL(instanceId, token);

    // Format phone number
    const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');

    const response = await axios.post(`${baseURL}/sendFileByUrl`, {
      chatId: `${formattedPhone}@c.us`,
      urlFile: audioUrl,
      fileName: 'audio.ogg',
    });

    if (response.data && response.data.idMessage) {
      return {
        success: true,
        messageId: response.data.idMessage,
      };
    }

    return {
      success: false,
      error: 'Failed to send audio',
    };
  } catch (error: any) {
    console.error('Error sending audio:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Set webhook URL for receiving messages
 */
export async function setWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { instanceId, token } = getGreenAPIConfig();
    const baseURL = getBaseURL(instanceId, token);

    await axios.post(`${baseURL}/setSettings`, {
      webhookUrl,
      webhookUrlToken: '',
      outgoingWebhook: 'yes',
      stateWebhook: 'yes',
      incomingWebhook: 'yes',
      deviceWebhook: 'no',
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error setting webhook:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Process incoming webhook message
 */
export interface IncomingMessage {
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  from: string;
  message?: string;
  fileUrl?: string;
  caption?: string;
  timestamp: number;
}

export function parseWebhookMessage(webhookData: any): IncomingMessage | null {
  try {
    if (!webhookData || !webhookData.typeWebhook) {
      return null;
    }

    // Only process incoming messages
    if (webhookData.typeWebhook !== 'incomingMessageReceived') {
      return null;
    }

    const messageData = webhookData.messageData;
    if (!messageData) {
      return null;
    }

    const from = messageData.chatId.replace('@c.us', '');
    const timestamp = messageData.timestamp || Date.now();

    // Text message
    if (messageData.typeMessage === 'textMessage') {
      return {
        type: 'text',
        from,
        message: messageData.textMessageData?.textMessage || '',
        timestamp,
      };
    }

    // Image message
    if (messageData.typeMessage === 'imageMessage') {
      return {
        type: 'image',
        from,
        fileUrl: messageData.downloadUrl,
        caption: messageData.caption,
        timestamp,
      };
    }

    // Audio message
    if (messageData.typeMessage === 'audioMessage') {
      return {
        type: 'audio',
        from,
        fileUrl: messageData.downloadUrl,
        timestamp,
      };
    }

    // Video message
    if (messageData.typeMessage === 'videoMessage') {
      return {
        type: 'video',
        from,
        fileUrl: messageData.downloadUrl,
        caption: messageData.caption,
        timestamp,
      };
    }

    // Document message
    if (messageData.typeMessage === 'documentMessage') {
      return {
        type: 'document',
        from,
        fileUrl: messageData.downloadUrl,
        caption: messageData.caption,
        timestamp,
      };
    }

    return null;
  } catch (error) {
    console.error('Error parsing webhook message:', error);
    return null;
  }
}

/**
 * Add typing indicator (simulate human behavior)
 */
export async function sendTypingIndicator(
  phoneNumber: string,
  durationSeconds: number = 3
): Promise<void> {
  try {
    const { instanceId, token } = getGreenAPIConfig();
    const baseURL = getBaseURL(instanceId, token);

    const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');

    // Send "typing..." indicator
    await axios.post(`${baseURL}/sendChatStateTyping`, {
      chatId: `${formattedPhone}@c.us`,
    });

    // Wait for specified duration
    await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));

    // Stop typing indicator
    await axios.post(`${baseURL}/sendChatStateStopTyping`, {
      chatId: `${formattedPhone}@c.us`,
    });
  } catch (error) {
    console.error('Error sending typing indicator:', error);
  }
}


/**
 * Send campaign messages to multiple recipients with random delay
 * @param recipients Array of phone numbers (format: 966XXXXXXXXX@c.us)
 * @param message Text message to send
 * @param imageUrl Optional image URL to send with message
 * @param minDelay Minimum delay in seconds (default: 3)
 * @param maxDelay Maximum delay in seconds (default: 6)
 * @returns Array of results for each recipient
 */
export async function sendCampaign(
  recipients: string[],
  message: string,
  imageUrl?: string,
  minDelay: number = 3,
  maxDelay: number = 6
): Promise<Array<{ phone: string; success: boolean; error?: string }>> {
  const results: Array<{ phone: string; success: boolean; error?: string }> = [];

  for (const phone of recipients) {
    try {
      // Send message (with image if provided)
      if (imageUrl) {
        await sendImageMessage(phone, imageUrl, message);
      } else {
        await sendTextMessage(phone, message);
      }

      results.push({ phone, success: true });

      // Random delay between messages (3-6 seconds by default)
      if (recipients.indexOf(phone) < recipients.length - 1) {
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      results.push({
        phone,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}


/**
 * Set Webhook URL for receiving incoming messages
 * This should be called after WhatsApp connection is established
 */
export async function setWebhookUrl(
  instanceId: string,
  apiToken: string,
  webhookUrl: string,
  apiUrl: string = 'https://api.green-api.com'
): Promise<{ success: boolean; error?: string }> {
  try {
    const baseURL = `${apiUrl}/waInstance${instanceId}`;
    
    // Set webhook settings
    const response = await axios.post(`${baseURL}/settings`, {
      webhookUrl: webhookUrl,
      webhookUrlToken: '',
      delaySendMessagesMilliseconds: 1000,
      markIncomingMessagesReaded: 'yes',
      markIncomingMessagesReadedOnReply: 'yes',
      outgoingWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      outgoingAPIMessageWebhook: 'yes',
      incomingWebhook: 'yes',
      deviceWebhook: 'no',
      statusInstanceWebhook: 'yes',
      stateWebhook: 'yes',
      keepOnlineStatus: 'yes',
    }, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Webhook settings response:', response.data);

    if (response.data && response.data.saveSettings) {
      return { success: true };
    }

    // Try alternative method using setSettings endpoint
    const settingsResponse = await axios.post(`${baseURL}/setSettings/${apiToken}`, {
      webhookUrl: webhookUrl,
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
      stateWebhook: 'yes',
    });

    console.log('Alternative webhook settings response:', settingsResponse.data);

    return { success: true };
  } catch (error: any) {
    console.error('Error setting webhook URL:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Get current webhook settings
 */
export async function getWebhookSettings(
  instanceId: string,
  apiToken: string,
  apiUrl: string = 'https://api.green-api.com'
): Promise<{ webhookUrl?: string; error?: string }> {
  try {
    const baseURL = `${apiUrl}/waInstance${instanceId}`;
    
    const response = await axios.get(`${baseURL}/getSettings/${apiToken}`);

    return {
      webhookUrl: response.data?.webhookUrl,
    };
  } catch (error: any) {
    console.error('Error getting webhook settings:', error.response?.data || error.message);
    return {
      error: error.response?.data?.message || error.message,
    };
  }
}


/**
 * Receive notification from Green API (Polling method)
 * This is used for free accounts that don't support webhooks
 * 
 * Documentation: https://green-api.com/en/docs/api/receiving/technology-http-api/ReceiveNotification/
 */
export async function receiveNotification(
  instanceId: string,
  apiToken: string,
  apiUrl: string = 'https://api.green-api.com'
): Promise<{ notification: any | null; receiptId: number | null; error?: string }> {
  try {
    const baseURL = `${apiUrl}/waInstance${instanceId}`;
    
    const response = await axios.get(`${baseURL}/receiveNotification/${apiToken}`, {
      timeout: 45000, // 45 seconds timeout for long polling
      headers: {
        'Connection': 'keep-alive',
      },
    });

    if (response.data) {
      return {
        notification: response.data.body,
        receiptId: response.data.receiptId,
      };
    }

    return { notification: null, receiptId: null };
  } catch (error: any) {
    // Timeout is normal for long polling - don't log as error
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return { notification: null, receiptId: null };
    }
    
    console.error('Error receiving notification:', error.response?.data || error.message);
    return {
      notification: null,
      receiptId: null,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Delete notification from Green API queue after processing
 * 
 * Documentation: https://green-api.com/en/docs/api/receiving/technology-http-api/DeleteNotification/
 */
export async function deleteNotification(
  instanceId: string,
  apiToken: string,
  receiptId: number,
  apiUrl: string = 'https://api.green-api.com'
): Promise<{ success: boolean; error?: string }> {
  try {
    const baseURL = `${apiUrl}/waInstance${instanceId}`;
    
    const response = await axios.delete(`${baseURL}/deleteNotification/${apiToken}/${receiptId}`);

    return { success: response.data?.result === true };
  } catch (error: any) {
    console.error('Error deleting notification:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}


/**
 * Send text message with custom credentials (for polling system)
 */
export async function sendMessageWithCredentials(
  instanceId: string,
  apiToken: string,
  apiUrl: string,
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const baseURL = `${apiUrl}/waInstance${instanceId}`;

    // Format phone number (remove + and spaces)
    const formattedPhone = phoneNumber.replace(/[^0-9]/g, '');

    const response = await axios.post(`${baseURL}/sendMessage/${apiToken}`, {
      chatId: `${formattedPhone}@c.us`,
      message,
    });

    if (response.data && response.data.idMessage) {
      return {
        success: true,
        messageId: response.data.idMessage,
      };
    }

    return {
      success: false,
      error: 'Failed to send message',
    };
  } catch (error: any) {
    console.error('Error sending message:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}


/**
 * Clear Webhook URL to enable polling mode
 * This is required for free Green API accounts that don't support webhooks
 * 
 * Documentation: https://green-api.com/en/docs/api/account/SetSettings/
 */
export async function clearWebhookUrl(
  instanceId: string,
  apiToken: string,
  apiUrl: string = 'https://api.green-api.com'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Extract first 4 digits from instanceId for subdomain (Green API format)
    const instancePrefix = instanceId.substring(0, 4);
    const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${instanceId}`;
    
    console.log(`[WhatsApp] Clearing webhook URL for instance ${instanceId}...`);
    
    // Clear webhook settings using setSettings endpoint
    const response = await axios.post(`${baseURL}/setSettings/${apiToken}`, {
      webhookUrl: '',
      webhookUrlToken: '',
      outgoingWebhook: 'no',
      outgoingMessageWebhook: 'no',
      outgoingAPIMessageWebhook: 'no',
      incomingWebhook: 'no',
      deviceWebhook: 'no',
      statusInstanceWebhook: 'no',
      stateWebhook: 'no',
    });

    console.log('[WhatsApp] Clear webhook response:', response.data);

    if (response.data && response.data.saveSettings === true) {
      console.log(`[WhatsApp] Webhook URL cleared successfully for instance ${instanceId}`);
      return { success: true };
    }

    // Even if saveSettings is not explicitly true, check if the request succeeded
    if (response.status === 200) {
      console.log(`[WhatsApp] Webhook URL cleared (status 200) for instance ${instanceId}`);
      return { success: true };
    }

    return {
      success: false,
      error: 'Failed to clear webhook URL - unexpected response',
    };
  } catch (error: any) {
    console.error('[WhatsApp] Error clearing webhook URL:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}
