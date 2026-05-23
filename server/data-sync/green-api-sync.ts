import { ENV } from "../_core/env";
import {
  createConversation,
  createMessage,
  getConversationByMerchantAndPhone,
  getMessageByExternalId,
  updateConversation,
} from '../db';
import * as schema from "../../drizzle/schema";

interface GreenAPIMessage {
  idMessage: string;
  timestamp: number;
  type: string;
  senderName?: string;
  senderContactName?: string;
  textMessage?: string;
  caption?: string;
  quotedMessageId?: string;
  mediaUrl?: string;
}

interface GreenAPIChat {
  id: string;
  name: string;
  avatar?: string;
  unreadCount?: number;
  lastMessageTime?: number;
}

export async function fetchGreenAPIChats(
  instanceId: string,
  token: string
): Promise<GreenAPIChat[]> {
  try {
    const response = await fetch(
      `https://${instanceId}.api.greenapi.com/waInstance${instanceId}/getChats/${token}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Green API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching Green API chats:", error);
    throw error;
  }
}

export async function fetchGreenAPIMessages(
  instanceId: string,
  token: string,
  chatId: string,
  limit: number = 100
): Promise<GreenAPIMessage[]> {
  try {
    const response = await fetch(
      `https://${instanceId}.api.greenapi.com/waInstance${instanceId}/getChatHistory/${token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId: chatId,
          count: limit,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Green API error: ${response.status}`);
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error("Error fetching Green API messages:", error);
    throw error;
  }
}

export async function syncGreenAPIData(
  merchantId: string | number,
  instanceId: string,
  token: string,
  options: {
    syncChats?: boolean;
    syncMessages?: boolean;
    limit?: number;
  } = {}
) {
  const {
    syncChats = true,
    syncMessages = true,
    limit = 100,
  } = options;

  const merchantIdStr = merchantId.toString();
  const syncLog = {
    merchantId: merchantIdStr,
    startedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    status: "in_progress" as const,
    chatsProcessed: 0,
    messagesProcessed: 0,
    errors: [] as string[],
    completedAt: null as Date | null,
  };

  try {
    // جلب المحادثات
    if (syncChats) {
      console.log(`[Sync] Fetching chats for merchant ${merchantId}...`);
      const chats = await fetchGreenAPIChats(instanceId, token);
      console.log(`[Sync] Found ${chats.length} chats`);

      for (const chat of chats.slice(0, limit)) {
        try {
          // استخراج رقم الهاتف من chat ID
          const phoneNumber = chat.id.replace("@c.us", "").replace("@g.us", "");

          // البحث عن محادثة موجودة أو إنشاء جديدة
          // @ts-ignore
          let conversation = await getConversationByMerchantAndPhone(parseInt(merchantId), phoneNumber);

          if (!conversation) {
            // إنشاء محادثة جديدة
            conversation = await createConversation({
              // @ts-ignore
              merchantId: parseInt(merchantId),
              customerPhone: phoneNumber,
              customerName: chat.name || phoneNumber,
              status: "active",
              lastMessageAt: new Date(chat.lastMessageTime || Date.now()).toISOString().slice(0, 19).replace("T", " "),
              createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            });
          } else {
            // تحديث آخر رسالة
            await updateConversation(conversation.id, {
              lastMessageAt: new Date(chat.lastMessageTime || Date.now()).toISOString().slice(0, 19).replace("T", " "),
            });
          }

          syncLog.chatsProcessed++;

          // جلب الرسائل إذا كان مطلوباً
          if (syncMessages && conversation) {
            try {
              const messages = await fetchGreenAPIMessages(
                instanceId,
                token,
                chat.id,
                limit
              );

              for (const msg of messages) {
                // البحث عن رسالة موجودة
                const existingMsg = await getMessageByExternalId(msg.idMessage);

                if (!existingMsg) {
                  // تحديد نوع الرسالة
                  let messageType: "text" | "image" | "voice" | "document" = "text";
                  let content = msg.textMessage || msg.caption || "";

                  if (msg.type === "imageMessage") messageType = "image";
                  else if (msg.type === "audioMessage") messageType = "voice";
                  else if (msg.type === "documentMessage")
                    messageType = "document";

                  // تحديد المرسل
                  const isFromCustomer = !msg.senderName?.includes("Me");

                  // إدراج الرسالة
                  await createMessage({
                    conversationId: conversation.id,
                    content,
                    messageType: messageType as any,
                    mediaUrl: msg.mediaUrl || null,
                    externalId: msg.idMessage,
                    createdAt: new Date(msg.timestamp * 1000).toISOString().slice(0, 19).replace("T", " "),
                    direction: isFromCustomer ? 'incoming' : 'outgoing',
                    isProcessed: 0,
                  });

                  syncLog.messagesProcessed++;
                }
              }
            } catch (error) {
              const errorMsg = `Error syncing messages for chat ${chat.id}: ${error}`;
              console.error(errorMsg);
              syncLog.errors.push(errorMsg);
            }
          }
        } catch (error) {
          const errorMsg = `Error processing chat ${chat.id}: ${error}`;
          console.error(errorMsg);
          syncLog.errors.push(errorMsg);
        }
      }
    }

    // @ts-ignore
    syncLog.status = "completed";
    syncLog.completedAt = new Date();
    return syncLog;
  } catch (error) {
    // @ts-ignore
    syncLog.status = "failed";
    syncLog.errors.push(String(error));
    console.error("Sync failed:", error);
    throw error;
  }
}

export async function getSyncStatus(merchantId: string) {
  // يمكن إضافة جدول لتتبع حالة المزامنة
  return {
    merchantId,
    lastSync: new Date(),
    status: "idle",
  };
}