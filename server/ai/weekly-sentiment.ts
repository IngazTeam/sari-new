/**
 * نظام التقارير الأسبوعية للمشاعر
 */

import {
  createWeeklySentimentReport,
  getConversationsByMerchantId,
  getMerchantById,
  getMessagesByConversationId,
  getUserById,
} from '../db';
import { analyzeSentiment } from './sentiment-analysis';
import { sendEmail } from '../reports/email-sender';

interface WeeklySentimentReport {
  merchantId: number;
  weekStartDate: Date;
  weekEndDate: Date;
  totalConversations: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  positivePercentage: number;
  negativePercentage: number;
  neutralPercentage: number;
  topKeywords: Array<{ keyword: string; count: number }>;
  improvementSuggestions: string[];
  // P3: Sales KPIs
  salesKPIs?: {
    conversionRate: number;
    totalPaid: number;
    totalLost: number;
    topLossReason: string | null;
  };
}

/**
 * إنشاء تقرير أسبوعي للمشاعر
 */
export async function generateWeeklySentimentReport(
  merchantId: number
): Promise<WeeklySentimentReport | null> {
  try {
    // حساب تاريخ بداية ونهاية الأسبوع الماضي
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - now.getDay()); // الأحد الماضي
    weekEnd.setHours(23, 59, 59, 999);
    
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6); // الاثنين قبل أسبوع
    weekStart.setHours(0, 0, 0, 0);

    // الحصول على المحادثات في هذا الأسبوع
    const conversations = await getConversationsByMerchantId(merchantId);
    const weekConversations = conversations.filter(c => {
      const createdAt = new Date(c.createdAt);
      return createdAt >= weekStart && createdAt <= weekEnd;
    });

    if (weekConversations.length === 0) {
      console.log(`[Weekly Report] No conversations found for merchant ${merchantId} in the past week`);
      return null;
    }

    // تحليل المشاعر لكل محادثة
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    const keywordMap = new Map<string, number>();

    for (const conversation of weekConversations) {
      // الحصول على رسائل المحادثة
      const messages = await getMessagesByConversationId(conversation.id);
      const customerMessages = messages.filter(m => m.direction === 'incoming');
      
      if (customerMessages.length === 0) continue;

      // تحليل المشاعر
      const conversationText = customerMessages.map(m => m.content).join(' ');
      const sentiment = await analyzeSentiment(conversationText);

      if (sentiment.sentiment === 'positive' || sentiment.sentiment === 'happy') positiveCount++;
      else if (sentiment.sentiment === 'negative' || sentiment.sentiment === 'angry' || sentiment.sentiment === 'sad' || sentiment.sentiment === 'frustrated') negativeCount++;
      else neutralCount++;

      // استخراج الكلمات المفتاحية (بسيط)
      const words = conversationText.split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          keywordMap.set(word, (keywordMap.get(word) || 0) + 1);
        }
      }
    }

    const totalConversations = weekConversations.length;
    const positivePercentage = (positiveCount / totalConversations) * 100;
    const negativePercentage = (negativeCount / totalConversations) * 100;
    const neutralPercentage = (neutralCount / totalConversations) * 100;

    // أكثر 10 كلمات تكراراً
    const topKeywords = Array.from(keywordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    // اقتراحات التحسين
    const improvementSuggestions = [];
    if (negativePercentage > 20) {
      improvementSuggestions.push('نسبة المشاعر السلبية مرتفعة. يُنصح بمراجعة الردود وتحسين خدمة العملاء.');
    }
    if (positivePercentage < 50) {
      improvementSuggestions.push('يمكن تحسين رضا العملاء من خلال ردود أسرع وأكثر ودية.');
    }
    if (topKeywords.length > 0) {
      improvementSuggestions.push(`الكلمات الأكثر تكراراً: ${topKeywords.slice(0, 3).map(k => k.keyword).join('، ')}. قد تحتاج لردود سريعة مخصصة.`);
    }

    const report: WeeklySentimentReport = {
      merchantId,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      totalConversations,
      positiveCount,
      negativeCount,
      neutralCount,
      positivePercentage,
      negativePercentage,
      neutralPercentage,
      topKeywords,
      improvementSuggestions
    };

    // P3: Load Sales KPIs from loss-detector pipeline
    try {
      const { getPipelineSummary } = await import('./loss-detector');
      const pipeline = await getPipelineSummary(merchantId);
      const totalPaid = pipeline.stages['paid'] || 0;
      const totalLost = pipeline.stages['lost'] || 0;
      const total = totalPaid + totalLost;
      const topLoss = Object.entries(pipeline.lossReasons).sort((a, b) => b[1] - a[1])[0];
      report.salesKPIs = {
        conversionRate: total > 0 ? Math.round((totalPaid / total) * 100) : 0,
        totalPaid,
        totalLost,
        topLossReason: topLoss ? topLoss[0] : null,
      };
      // Sales-based improvement suggestions
      if (report.salesKPIs.conversionRate < 20 && total > 0) {
        improvementSuggestions.push(`📉 نسبة التحويل منخفضة (${report.salesKPIs.conversionRate}%). راجع أسعارك أو أضف عروض.`);
      }
      if (report.salesKPIs.topLossReason === 'price') {
        improvementSuggestions.push('💰 أكثر سبب لخسارة العملاء هو السعر. فكّر بإضافة باقات بأسعار مختلفة.');
      }
      if (report.salesKPIs.topLossReason === 'no_response') {
        improvementSuggestions.push('👻 كثير من العملاء يختفون. حاول تحسين المتابعة الاستباقية.');
      }
    } catch {
      // Sales KPIs are supplementary — non-blocking
    }

    // حفظ التقرير في قاعدة البيانات
    await createWeeklySentimentReport({
      merchantId,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      totalConversations,
      positiveCount,
      negativeCount,
      neutralCount,
      topKeywords: topKeywords.map(k => k.keyword),
      topComplaints: [], // يمكن إضافته لاحقاً
      recommendations: improvementSuggestions
    });

    // إرسال التقرير عبر البريد الإلكتروني
    const merchant = await getMerchantById(merchantId);
    if (merchant) {
      const user = await getUserById(merchant.userId);
      if (user?.email) {
        await sendWeeklyReportEmail(user.email, merchant.businessName, report);
        
        // تحديث حالة الإرسال
        // تحديث حالة الإرسال (يمكن إضافة دالة updateWeeklySentimentReport لاحقاً)
      }
    }

    return report;
  } catch (error) {
    console.error('[Weekly Report] Error generating report:', error);
    throw error;
  }
}

/**
 * إرسال التقرير الأسبوعي عبر البريد الإلكتروني
 */
async function sendWeeklyReportEmail(
  email: string,
  businessName: string,
  report: WeeklySentimentReport
) {
  const subject = `📊 التقرير الأسبوعي لـ ${businessName} - ساري`;
  
  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>التقرير الأسبوعي</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); padding: 40px 30px; text-align: center;">
                  <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <svg width="50" height="50" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                      <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" fill="#00d25e" stroke="#00a84d" stroke-width="2"/>
                      <text x="50" y="65" font-size="45" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial">S</text>
                    </svg>
                  </div>
                  <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">📊 التقرير الأسبوعي</h1>
                  <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-size: 14px;">
                    من ${report.weekStartDate.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long' })} إلى ${report.weekEndDate.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">مرحباً ${businessName}،</h2>
                  <p style="color: #4a4a4a; line-height: 1.8; font-size: 15px; margin: 0 0 30px 0;">
                    إليك ملخص أداء محادثاتك خلال الأسبوع الماضي. نحن هنا لمساعدتك في تحسين تجربة عملائك! 🚀
                  </p>
                  
                  <!-- Stats Cards -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
                    <tr>
                      <td width="48%" style="background: linear-gradient(135deg, #f0fdf9 0%, #e6fcf5 100%); padding: 20px; border-radius: 10px; border: 2px solid #00d25e;">
                        <p style="color: #00a84d; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">إجمالي المحادثات</p>
                        <p style="color: #1a1a1a; font-size: 32px; font-weight: 700; margin: 0;">${report.totalConversations}</p>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 20px; border-radius: 10px; border: 2px solid #0ea5e9;">
                        <p style="color: #0284c7; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">معدل الرضا</p>
                        <p style="color: #1a1a1a; font-size: 32px; font-weight: 700; margin: 0;">${report.positivePercentage.toFixed(0)}%</p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Sentiment Analysis -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
                    <tr>
                      <td>
                        <h3 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">📈 تحليل المشاعر</h3>
                        <table width="100%" cellpadding="8" cellspacing="0">
                          <tr>
                            <td style="color: #4a4a4a; font-size: 14px; padding: 8px 0;">😊 إيجابي</td>
                            <td style="text-align: left; padding: 8px 0;">
                              <span style="background: #d4edda; color: #155724; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                                ${report.positiveCount} (${report.positivePercentage.toFixed(1)}%)
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td style="color: #4a4a4a; font-size: 14px; padding: 8px 0;">😐 محايد</td>
                            <td style="text-align: left; padding: 8px 0;">
                              <span style="background: #fff3cd; color: #856404; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                                ${report.neutralCount} (${report.neutralPercentage.toFixed(1)}%)
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td style="color: #4a4a4a; font-size: 14px; padding: 8px 0;">😞 سلبي</td>
                            <td style="text-align: left; padding: 8px 0;">
                              <span style="background: #f8d7da; color: #721c24; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">
                                ${report.negativeCount} (${report.negativePercentage.toFixed(1)}%)
                              </span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Top Keywords -->
                  ${report.topKeywords.length > 0 ? `
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
                    <tr>
                      <td>
                        <h3 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">🔑 الكلمات الأكثر تكراراً</h3>
                        <table width="100%" cellpadding="6" cellspacing="0">
                          ${report.topKeywords.slice(0, 5).map((k, i) => `
                            <tr>
                              <td style="color: #00d25e; font-weight: 700; font-size: 16px; width: 30px;">${i + 1}.</td>
                              <td style="color: #1a1a1a; font-size: 14px; font-weight: 600;">${k.keyword}</td>
                              <td style="text-align: left;">
                                <span style="background: #e9ecef; color: #495057; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;">
                                  ${k.count} مرة
                                </span>
                              </td>
                            </tr>
                          `).join('')}
                        </table>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                  
                  <!-- Improvement Suggestions -->
                  ${report.improvementSuggestions.length > 0 ? `
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-radius: 10px; padding: 25px; margin-bottom: 25px; border: 2px solid #fbbf24;">
                    <tr>
                      <td>
                        <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">💡 اقتراحات التحسين</h3>
                        <ul style="margin: 0; padding: 0 0 0 25px; color: #78350f; line-height: 1.8;">
                          ${report.improvementSuggestions.map(s => `<li style="margin-bottom: 8px; font-size: 14px;">${s}</li>`).join('')}
                        </ul>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="https://sary.live/merchant/insights" 
                           style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); 
                                  color: white; 
                                  padding: 16px 40px; 
                                  text-decoration: none; 
                                  border-radius: 8px; 
                                  display: inline-block;
                                  font-weight: 700;
                                  font-size: 15px;
                                  box-shadow: 0 6px 16px rgba(0, 210, 94, 0.35);">
                          📊 عرض التقرير الكامل
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e8e8e8;">
                    <tr>
                      <td>
                        <p style="color: #888; font-size: 13px; margin: 0; line-height: 1.5;">
                          ⚠️ هذا تقرير تلقائي يُرسل كل أسبوع. يرجى عدم الرد عليه مباشرة.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 30px; text-align: center; border-top: 1px solid #dee2e6;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td align="center">
                        <a href="https://wa.me/966500000000" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #25D366; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">📱</span>
                        </a>
                        <a href="https://twitter.com/sari_ai" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #1DA1F2; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">🐦</span>
                        </a>
                        <a href="https://instagram.com/sari_ai" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">📷</span>
                        </a>
                        <a href="mailto:support@sary.live" style="display: inline-block; margin: 0 8px; text-decoration: none;">
                          <span style="background: #EA4335; color: white; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">✉️</span>
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="color: #6c757d; font-size: 13px; margin: 0 0 8px 0; font-weight: 600;">
                    © ${new Date().getFullYear()} ساري - مساعد المبيعات الذكي على الواتساب
                  </p>
                  <p style="margin: 8px 0 0 0;">
                    <a href="https://sary.live" style="color: #00d25e; text-decoration: none; font-weight: 700; font-size: 14px;">sary.live</a>
                  </p>
                  <p style="color: #adb5bd; font-size: 11px; margin: 12px 0 0 0;">
                    المملكة العربية السعودية 🇸🇦 | الرياض
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  // إرسال البريد الإلكتروني
  try {
    await sendEmail({ to: email, subject, html });
    console.log('[Weekly Report] Email sent successfully to:', email);
  } catch (error) {
    console.error('[Weekly Report] Failed to send email:', error);
  }
}
