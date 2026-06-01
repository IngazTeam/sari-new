/**
 * AI Health Monitor — فحص تلقائي لاتصال OpenAI كل 15 دقيقة
 * 
 * - يختبر صلاحية المفتاح عبر /v1/models
 * - يحدّث healthStatus في ai_settings
 * - يرسل تنبيه بالبريد عند الفشل (حد أقصى: مرة كل ساعة)
 */

import { sendEmail } from '../_core/emailService';

// ═══════════════════════════════════════════════════════════════
// Health Check Logic
// ═══════════════════════════════════════════════════════════════

export async function checkOpenAiHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { getAiSettings, upsertAiSettings } = await import('../db_ai_settings');
    const settings = await getAiSettings();

    // Get the API key (DB → env fallback)
    const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      const result = { ok: false, error: 'لا يوجد مفتاح API' };
      await updateHealthStatus('failed', settings);
      await sendFailureAlert(settings?.alertEmail, result.error);
      return result;
    }

    // Test the connection
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = response.status === 401
        ? 'مفتاح API غير صالح أو منتهي'
        : response.status === 429
          ? 'تم تجاوز حد الطلبات (Rate Limit)'
          : `خطأ في الاتصال: ${response.status}`;

      await updateHealthStatus('failed', settings);
      await sendFailureAlert(settings?.alertEmail, errorText);
      console.error(`[AI Health] ❌ Check failed: ${errorText}`);
      return { ok: false, error: errorText };
    }

    // Success
    await updateHealthStatus('ok', settings);
    console.log('[AI Health] ✅ OpenAI connection healthy');
    return { ok: true };

  } catch (err: any) {
    const errorMsg = err.name === 'AbortError'
      ? 'انتهت مهلة الاتصال (15 ثانية)'
      : `خطأ غير متوقع: ${err.message}`;

    try {
      const { getAiSettings } = await import('../db_ai_settings');
      const settings = await getAiSettings();
      await updateHealthStatus('failed', settings);
      await sendFailureAlert(settings?.alertEmail, errorMsg);
    } catch { /* ignore */ }

    console.error(`[AI Health] ❌ ${errorMsg}`);
    return { ok: false, error: errorMsg };
  }
}

// ═══════════════════════════════════════════════════════════════
// Update Health Status in DB
// ═══════════════════════════════════════════════════════════════

async function updateHealthStatus(status: 'ok' | 'failed', settings: any) {
  try {
    const { upsertAiSettings } = await import('../db_ai_settings');
    await upsertAiSettings({
      healthStatus: status,
      lastHealthCheck: new Date(),
    } as any);
  } catch (e) {
    console.error('[AI Health] Failed to update health status:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// Failure Alert Email (max 1 per hour)
// ═══════════════════════════════════════════════════════════════

async function sendFailureAlert(alertEmail: string | null | undefined, errorMessage: string) {
  if (!alertEmail) return;

  try {
    const { getAiSettings, upsertAiSettings } = await import('../db_ai_settings');
    const settings = await getAiSettings();

    // Throttle: max 1 alert per hour
    if (settings?.lastAlertSentAt) {
      const lastAlert = new Date(settings.lastAlertSentAt);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastAlert > hourAgo) {
        console.log('[AI Health] Alert throttled — last sent:', lastAlert.toISOString());
        return;
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });

    await sendEmail({
      to: alertEmail,
      subject: '🔴 تنبيه: فشل اتصال OpenAI — منصة ساري',
      type: 'notification',
      html: `
        <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 22px; color: white;">🔴 فشل اتصال OpenAI</h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">منصة ساري — تنبيه تلقائي</p>
          </div>
          <div style="padding: 24px;">
            <div style="background: rgba(220, 38, 38, 0.1); border: 1px solid rgba(220, 38, 38, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 0; font-size: 14px; color: #fca5a5;">
                <strong>سبب الفشل:</strong> ${errorMessage}
              </p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #9ca3af;">وقت الفحص:</td>
                <td style="padding: 8px 0; text-align: left;">${timeStr}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af;">الإجراء المطلوب:</td>
                <td style="padding: 8px 0; text-align: left;">تحقق من مفتاح API في لوحة التحكم</td>
              </tr>
            </table>
            <div style="margin-top: 20px; text-align: center;">
              <a href="https://sary.live/admin/ai-settings" 
                 style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px;">
                فتح إعدادات AI ←
              </a>
            </div>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
            هذا تنبيه تلقائي من نظام مراقبة ساري. لن يتم إرسال أكثر من تنبيه واحد كل ساعة.
          </div>
        </div>
      `,
    });

    // Update last alert time
    await upsertAiSettings({ lastAlertSentAt: now } as any);
    console.log(`[AI Health] 📧 Alert sent to ${alertEmail}`);

  } catch (e) {
    console.error('[AI Health] Failed to send alert email:', e);
  }
}
