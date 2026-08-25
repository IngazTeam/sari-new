export const WHATSAPP_DISCONNECT_ALERT_WINDOW_HOURS = 48;
export const WHATSAPP_DISCONNECT_REMINDER_AFTER_HOURS = 24;
export const WHATSAPP_DISCONNECT_MAX_ALERTS = 2;

export type WhatsAppHealthClassification = 'healthy' | 'disconnected' | 'transient_error';

/**
 * Only definitive provider/session states open an incident. Network failures,
 * rate limits and provider 5xx responses must never tell a merchant that their
 * number was disconnected.
 */
export function classifyWhatsAppHealth(result: {
  healthy: boolean;
  detail?: string;
}): WhatsAppHealthClassification {
  if (result.healthy) return 'healthy';

  const detail = String(result.detail || '').trim().toLowerCase();
  if (['notauthorized', 'blocked'].includes(detail)) return 'disconnected';

  const httpStatus = /^http_(\d{3})$/.exec(detail)?.[1];
  if (httpStatus) {
    const status = Number(httpStatus);
    if ([400, 401, 403, 404].includes(status)) return 'disconnected';
  }

  return 'transient_error';
}

function canonicalPhoneDigits(value: unknown): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  return digits;
}

export type HealthyWhatsAppSender = {
  id: number;
  phoneNumber?: string | null;
  isPrimary?: number | boolean | null;
};

/**
 * A disconnected number cannot deliver its own warning. Select another
 * provider-verified sender owned by the same merchant and avoid messaging a
 * sender to itself.
 */
export function chooseHealthyAlertSender(
  healthyInstances: readonly HealthyWhatsAppSender[],
  disconnectedInstanceId: number,
  recipientPhone: string | null | undefined,
): HealthyWhatsAppSender | null {
  const recipient = canonicalPhoneDigits(recipientPhone);
  if (!recipient) return null;

  return [...healthyInstances]
    .filter(instance => instance.id !== disconnectedInstanceId)
    .filter(instance => canonicalPhoneDigits(instance.phoneNumber) !== recipient)
    .sort((left, right) => Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)))[0] || null;
}

export function disconnectAlertMessage(input: {
  businessName: string;
  phoneNumber: string;
  sequence: 1 | 2;
  reconnectUrl: string;
}): string {
  const stage = input.sequence === 1 ? 'التنبيه الأول' : 'التذكير الأخير';
  return [
    `🔴 ${stage}: رقم واتساب المتجر غير متصل`,
    `المتجر: ${input.businessName}`,
    `الرقم: ${input.phoneNumber}`,
    'رسائل العملاء قد لا تصل حتى إعادة الربط.',
    `إعادة الربط: ${input.reconnectUrl}`,
    input.sequence === 1
      ? 'سنرسل تذكيرًا أخيرًا بعد 24 ساعة إذا استمر الانقطاع.'
      : 'هذا آخر تذكير؛ تتوقف تنبيهات هذه الحادثة تلقائيًا بعد نافذة 48 ساعة.',
  ].join('\n');
}
