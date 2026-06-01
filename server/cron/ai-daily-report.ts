/**
 * AI Daily Report — تقرير يومي بالاستهلاك والتكلفة
 * 
 * يُرسل كل يوم الساعة 8 صباحاً بتوقيت الرياض
 * يحتوي: إجمالي الطلبات، التكلفة، أعلى التجار استهلاكاً، مقارنة بالأمس
 */

import { sendEmail } from '../_core/emailService';

export async function sendDailyAiReport(): Promise<void> {
  try {
    const { getAiSettings } = await import('../db_ai_settings');
    const settings = await getAiSettings();

    if (!settings?.alertEmail) {
      console.log('[AI Report] No alert email configured — skipping daily report');
      return;
    }

    const { getDailyUsage, getUsageStats, getTopMerchantUsage } = await import('../db_ai_settings');

    // Get yesterday's and day-before stats
    const dailyUsage = await getDailyUsage(2);
    const todayStats = await getUsageStats('today');
    const monthStats = await getUsageStats('month');
    const topMerchants = await getTopMerchantUsage(5);

    // Parse daily data
    const yesterday = dailyUsage[dailyUsage.length - 1];
    const dayBefore = dailyUsage.length > 1 ? dailyUsage[dailyUsage.length - 2] : null;

    const ydRequests = yesterday?.requests || 0;
    const ydTokens = yesterday?.tokens || 0;
    const ydCost = parseFloat(yesterday?.cost || '0');

    const dbRequests = dayBefore?.requests || 0;
    const dbCost = parseFloat(dayBefore?.cost || '0');

    // Change indicators
    const reqChange = dbRequests > 0
      ? ((ydRequests - dbRequests) / dbRequests * 100).toFixed(1)
      : '0';
    const costChange = dbCost > 0
      ? ((ydCost - dbCost) / dbCost * 100).toFixed(1)
      : '0';

    const reqArrow = Number(reqChange) >= 0 ? '↑' : '↓';
    const costArrow = Number(costChange) >= 0 ? '↑' : '↓';
    const reqColor = Number(reqChange) >= 0 ? '#fbbf24' : '#34d399';
    const costColor = Number(costChange) >= 0 ? '#f87171' : '#34d399';

    // Month totals
    const monthCost = parseFloat(monthStats?.totalCost || '0');
    const monthRequests = monthStats?.totalRequests || 0;

    // Health status
    const healthIcon = settings.healthStatus === 'ok' ? '🟢' : '🔴';
    const healthText = settings.healthStatus === 'ok' ? 'يعمل بنجاح' : 'متوقف';

    // Top merchants table
    let merchantsHtml = '';
    if (topMerchants.length > 0) {
      merchantsHtml = topMerchants.map((m: any, i: number) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #d1d5db;">${i + 1}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #e0e0e0;">تاجر #${m.merchantId}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #e0e0e0; text-align: left;">${(m.requests || 0).toLocaleString()}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #fbbf24; text-align: left;">$${parseFloat(m.totalCost || '0').toFixed(4)}</td>
        </tr>
      `).join('');
    } else {
      merchantsHtml = `<tr><td colspan="4" style="padding: 16px; text-align: center; color: #6b7280;">لا يوجد بيانات</td></tr>`;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Riyadh',
    });

    await sendEmail({
      to: settings.alertEmail,
      subject: `📊 تقرير AI اليومي — ${now.toISOString().slice(0, 10)} — ساري`,
      type: 'report',
      html: `
        <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 640px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 22px; color: white;">📊 تقرير الذكاء الاصطناعي اليومي</h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">${dateStr}</p>
          </div>

          <div style="padding: 24px;">

            <!-- Health Status -->
            <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">${healthIcon} حالة OpenAI: <strong>${healthText}</strong></span>
            </div>

            <!-- Yesterday Stats Cards -->
            <h2 style="font-size: 16px; color: #a78bfa; margin: 0 0 12px;">📈 إحصائيات الأمس</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="width: 50%; padding: 8px;">
                  <div style="background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #a78bfa;">${ydRequests.toLocaleString()}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">طلب</p>
                    <p style="margin: 4px 0 0; font-size: 11px; color: ${reqColor};">${reqArrow} ${Math.abs(Number(reqChange))}% عن أمس</p>
                  </div>
                </td>
                <td style="width: 50%; padding: 8px;">
                  <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #fbbf24;">$${ydCost.toFixed(4)}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">التكلفة</p>
                    <p style="margin: 4px 0 0; font-size: 11px; color: ${costColor};">${costArrow} ${Math.abs(Number(costChange))}% عن أمس</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="width: 50%; padding: 8px;">
                  <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #34d399;">${ydTokens.toLocaleString()}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">Tokens</p>
                  </div>
                </td>
                <td style="width: 50%; padding: 8px;">
                  <div style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #60a5fa;">${monthRequests.toLocaleString()}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">إجمالي الشهر</p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Monthly Budget -->
            <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 14px;">تكلفة الشهر الحالي</span>
                <span style="font-size: 14px; font-weight: bold; color: #fbbf24;">$${monthCost.toFixed(4)}</span>
              </div>
              ${settings.monthlyBudgetLimit ? `
                <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 6px; overflow: hidden;">
                  <div style="background: linear-gradient(90deg, #7c3aed, #a78bfa); height: 100%; width: ${Math.min(100, (monthCost / parseFloat(settings.monthlyBudgetLimit as string)) * 100)}%; border-radius: 4px;"></div>
                </div>
                <p style="margin: 4px 0 0; font-size: 11px; color: #6b7280;">من الحد: $${settings.monthlyBudgetLimit}</p>
              ` : ''}
            </div>

            <!-- Top Merchants -->
            <h2 style="font-size: 16px; color: #a78bfa; margin: 0 0 12px;">👥 أكثر التجار استهلاكاً (هذا الشهر)</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <thead>
                <tr style="border-bottom: 2px solid rgba(124, 58, 237, 0.3);">
                  <th style="padding: 8px 12px; text-align: right; color: #9ca3af;">#</th>
                  <th style="padding: 8px 12px; text-align: right; color: #9ca3af;">التاجر</th>
                  <th style="padding: 8px 12px; text-align: left; color: #9ca3af;">الطلبات</th>
                  <th style="padding: 8px 12px; text-align: left; color: #9ca3af;">التكلفة</th>
                </tr>
              </thead>
              <tbody>
                ${merchantsHtml}
              </tbody>
            </table>

            <!-- CTA -->
            <div style="text-align: center; margin-top: 16px;">
              <a href="https://sary.live/admin/ai-settings" 
                 style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px;">
                فتح لوحة التحكم ←
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: rgba(255,255,255,0.05); padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
            تقرير تلقائي يومي من منصة ساري — يُرسل الساعة 8:00 صباحاً بتوقيت الرياض
          </div>
        </div>
      `,
    });

    console.log(`[AI Report] 📧 Daily report sent to ${settings.alertEmail}`);

  } catch (err: any) {
    console.error('[AI Report] Failed to send daily report:', err.message);
  }
}
