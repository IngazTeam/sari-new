import { z } from 'zod';

const personalId = /^\d{7,15}@c\.us$/;
const chatSchema = z.object({ id: z.string(), name: z.string().max(255).optional(), contact: z.object({ name: z.string().max(255).optional() }).optional() });
export function normalizeHistoryChats(raw: unknown[]) {
  const chats = new Map<string, { id: string; phone: string; name: string }>();
  let rejected = 0;
  for (const item of raw) {
    const parsed = chatSchema.safeParse(item);
    if (!parsed.success) { rejected++; continue; }
    const chat = parsed.data;
    if (/^[\d-]+@g\.us$/.test(chat.id)) continue; // Existing import is explicitly personal chats only.
    if (!personalId.test(chat.id)) { rejected++; continue; }
    const phone = chat.id.slice(0, -5);
    chats.set(chat.id, { id: chat.id, phone, name: chat.name?.trim() || chat.contact?.name?.trim() || phone });
  }
  return { chats: Array.from(chats.values()), rejected };
}

const messageSchema = z.object({
  idMessage: z.string().trim().min(1).max(255), chatId: z.string().regex(personalId),
  type: z.enum(['incoming', 'outgoing']), typeMessage: z.string().min(1).max(100),
  timestamp: z.number().int().min(1).max(2147483647),
  textMessage: z.string().optional(), extendedTextMessage: z.object({ text: z.string().optional() }).optional(),
  caption: z.string().optional(), fileName: z.string().optional(), downloadUrl: z.string().optional(),
  statusMessage: z.enum(['pending', 'sent', 'delivered', 'read', 'yellowCard', 'failed']).optional(),
  isDeleted: z.boolean().optional(), isEdited: z.boolean().optional(),
  deletedMessageId: z.string().optional(), editedMessageId: z.string().optional(),
});
export type HistoryMessage = { providerId: string; direction: 'incoming' | 'outgoing'; senderType: 'customer' | 'unknown'; messageType: 'text' | 'image' | 'voice' | 'document'; content: string; createdAt: string; mediaUrl: string | null };

// Provider URLs are displayed, never fetched by this importer. Reject credentials and local/non-HTTPS URLs.
function mediaUrl(value?: string): string | null {
  if (!value) return null;
  if (value.length > 500) throw new Error('Invalid media');
  const url = new URL(value);
  const allowed = ['green-api.com', 'greenapi.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (url.protocol !== 'https:' || !allowed || url.username || url.password || url.port) throw new Error('Invalid media');
  return value;
}

/** Unsupported/uncertain records are counted, not silently converted into sales evidence. */
export function normalizeHistoryMessages(raw: unknown[], chatId: string, now = Date.now()) {
  const messages = new Map<string, HistoryMessage>();
  const conflicted = new Set<string>();
  let rejected = 0;
  for (const item of raw) {
    const parsed = messageSchema.safeParse(item);
    if (!parsed.success) { rejected++; continue; }
    const msg = parsed.data;
    if (msg.chatId !== chatId || msg.timestamp * 1000 > now + 300_000 || msg.isDeleted || msg.deletedMessageId || msg.editedMessageId || msg.typeMessage === 'deletedMessage'
        || msg.type === 'outgoing' && !['sent', 'delivered', 'read'].includes(msg.statusMessage || '')) { rejected++; continue; }
    let content = '', messageType: HistoryMessage['messageType'] = 'text', url: string | null = null;
    try {
      switch (msg.typeMessage) {
        case 'textMessage': case 'extendedTextMessage': case 'quotedMessage': content = msg.textMessage || msg.extendedTextMessage?.text || ''; break;
        case 'imageMessage': case 'stickerMessage': messageType = 'image'; content = msg.caption || '[صورة]'; url = mediaUrl(msg.downloadUrl); break;
        case 'audioMessage': case 'voiceMessage': messageType = 'voice'; content = msg.caption || '[رسالة صوتية]'; url = mediaUrl(msg.downloadUrl); break;
        case 'documentMessage': case 'videoMessage': messageType = 'document'; content = msg.caption || (msg.typeMessage === 'videoMessage' ? '[فيديو]' : `[ملف: ${msg.fileName || 'مستند'}]`); url = mediaUrl(msg.downloadUrl); break;
        case 'contactMessage': case 'contactsArrayMessage': content = '[جهة اتصال — التفاصيل متاحة في واتساب]'; break;
        case 'locationMessage': content = '[موقع — التفاصيل متاحة في واتساب]'; break;
        default: rejected++; continue;
      }
      // MySQL TEXT capacity is bytes; never truncate a customer message or substitute today's date.
      if (!content.trim() || Buffer.byteLength(content, 'utf8') > 65_535) throw new Error('Invalid content');
      const entry: HistoryMessage = { providerId: msg.idMessage, direction: msg.type, senderType: msg.type === 'incoming' ? 'customer' : 'unknown', messageType, content,
        createdAt: new Date(msg.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' '), mediaUrl: url };
      if (conflicted.has(entry.providerId)) { rejected++; continue; }
      const existing = messages.get(entry.providerId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) { messages.delete(entry.providerId); conflicted.add(entry.providerId); rejected++; }
      else messages.set(entry.providerId, entry);
    } catch { rejected++; }
  }
  return { messages: Array.from(messages.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.providerId.localeCompare(b.providerId)), rejected };
}
