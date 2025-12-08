/**
 * نظام تقارير المشاعر الأسبوعية
 * يولد تقرير أسبوعي عن رضا العملاء مع توصيات ذكية
 */

import * as db from '../db';
import { invokeLLM } from '../_core/llm';
import { sendEmail } from './email-sender';

/**
 * توليد تقرير أسبوعي للتاجر
 */
export async function generateWeeklyReport(merchantId: number): Promise<number> {
  // حساب تواريخ الأسبوع (الأحد - السبت)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  
  // بداية الأسبوع (الأحد الماضي)
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - dayOfWeek);
  weekStartDate.setHours(0, 0, 0, 0);
  
  // نهاية الأسبوع (السبت)
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  weekEndDate.setHours(23, 59, 59, 999);

  // الحصول على محادثات الأسبوع
  const conversations = await db.getConversationsByMerchantId(merchantId);
  const weekConversations = conversations.filter((c: any) => {
    const createdAt = new Date(c.createdAt);
    return createdAt >= weekStartDate && createdAt <= weekEndDate;
  });

  // الحصول على تحليل المشاعر
  const stats = await db.getMerchantSentimentStats(merchantId, 7);

  // استخراج الكلمات المفتاحية الأكثر تكراراً
  const keywords = await db.getKeywordStats(merchantId, {
    minFrequency: 2,
    limit: 10,
  });

  const topKeywords = keywords
    .filter((k: any) => {
      // فقط الكلمات من هذا الأسبوع
      const lastSeen = new Date(k.lastSeenAt);
      return lastSeen >= weekStartDate && lastSeen <= weekEndDate;
    })
    .slice(0, 5)
    .map((k: any) => k.keyword);

  // استخراج أكثر الشكاوى تكراراً
  const complaints = keywords
    .filter((k: any) => k.category === 'complaint')
    .slice(0, 5)
    .map((k: any) => k.keyword);

  // توليد توصيات ذكية
  const recommendations = await generateRecommendations({
    totalConversations: weekConversations.length,
    positiveCount: stats.positive,
    negativeCount: stats.negative,
    neutralCount: stats.neutral,
    topKeywords,
    topComplaints: complaints,
  });

  // إنشاء التقرير في قاعدة البيانات
  const reportId = await db.createWeeklySentimentReport({
    merchantId,
    weekStartDate,
    weekEndDate,
    totalConversations: weekConversations.length,
    positiveCount: stats.positive,
    negativeCount: stats.negative,
    neutralCount: stats.neutral,
    topKeywords,
    topComplaints: complaints,
    recommendations,
  });

  return reportId;
}

/**
 * توليد توصيات ذكية بناءً على بيانات الأسبوع
 */
async function generateRecommendations(data: {
  totalConversations: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  topKeywords: string[];
  topComplaints: string[];
}): Promise<string[]> {
  if (data.totalConversations === 0) {
    return ['لم يتم تسجيل محادثات هذا الأسبوع. ننصح بزيادة التفاعل مع العملاء.'];
  }

  try {
    const positivePercentage = Math.round((data.positiveCount / data.totalConversations) * 100);
    const negativePercentage = Math.round((data.negativeCount / data.totalConversations) * 100);

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `أنت مستشار ذكي لتحسين خدمة العملاء.
مهمتك: تحليل بيانات رضا العملاء وتقديم توصيات عملية ومحددة.

التوصيات يجب أن تكون:
- محددة وقابلة للتنفيذ
- مبنية على البيانات الفعلية
- باللغة العربية الفصحى
- 3-5 توصيات فقط

الرد يجب أن يكون JSON فقط.`
        },
        {
          role: "user",
          content: `حلل هذه البيانات واقترح توصيات:

إجمالي المحادثات: ${data.totalConversations}
المحادثات الإيجابية: ${data.positiveCount} (${positivePercentage}%)
المحادثات السلبية: ${data.negativeCount} (${negativePercentage}%)
المحادثات المحايدة: ${data.neutralCount}

أكثر الكلمات تكراراً: ${data.topKeywords.join(', ') || 'لا يوجد'}
أكثر الشكاوى: ${data.topComplaints.join(', ') || 'لا يوجد'}

اقترح 3-5 توصيات محددة لتحسين رضا العملاء.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "recommendations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                items: { type: "string" },
                description: "قائمة التوصيات (3-5 توصيات)"
              }
            },
            required: ["recommendations"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0].message.content;
    if (!content || typeof content !== 'string') {
      throw new Error("No content in LLM response");
    }

    const result = JSON.parse(content);
    return result.recommendations;
  } catch (error) {
    console.error("Error generating recommendations:", error);
    
    // Fallback: توصيات أساسية
    const recommendations = [];
    
    if (data.negativeCount > data.positiveCount) {
      recommendations.push('نسبة المحادثات السلبية مرتفعة. ننصح بمراجعة أسباب عدم الرضا والعمل على معالجتها.');
    }
    
    if (data.topComplaints.length > 0) {
      recommendations.push(`الشكاوى الأكثر تكراراً: ${data.topComplaints.join(', ')}. ننصح بإنشاء ردود سريعة لهذه المواضيع.`);
    }
    
    if (data.positiveCount > data.negativeCount) {
      recommendations.push('أداء ممتاز! استمر في تقديم خدمة عملاء متميزة.');
    }
    
    recommendations.push('ننصح بمراجعة الردود السريعة وتحديثها بناءً على الأسئلة المتكررة.');
    
    return recommendations;
  }
}

/**
 * إرسال التقرير بالبريد الإلكتروني
 */
export async function sendReportEmail(reportId: number): Promise<boolean> {
  const report = await db.getWeeklySentimentReportById(reportId);
  if (!report) {
    throw new Error('Report not found');
  }

  // الحصول على معلومات التاجر
  const merchant = await db.getMerchantById(report.merchantId);
  if (!merchant) {
    throw new Error('Merchant not found');
  }

  const user = await db.getUserById(merchant.userId);
  if (!user || !user.email) {
    throw new Error('User email not found');
  }

  // تحويل التواريخ
  const weekStart = new Date(report.weekStartDate).toLocaleDateString('ar-SA');
  const weekEnd = new Date(report.weekEndDate).toLocaleDateString('ar-SA');

  // تحليل JSON
  const topKeywords = report.topKeywords ? JSON.parse(report.topKeywords) : [];
  const topComplaints = report.topComplaints ? JSON.parse(report.topComplaints) : [];
  const recommendations = report.recommendations ? JSON.parse(report.recommendations) : [];

  // إنشاء محتوى البريد
  const emailHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير المشاعر الأسبوعي</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 20px;
      direction: rtl;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .header p {
      margin: 10px 0 0;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-card .number {
      font-size: 32px;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 5px;
    }
    .stat-card .label {
      color: #666;
      font-size: 14px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #333;
      font-size: 18px;
      margin-bottom: 15px;
      border-right: 4px solid #667eea;
      padding-right: 10px;
    }
    .section ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .section li {
      background: #f8f9fa;
      padding: 12px 15px;
      margin-bottom: 8px;
      border-radius: 6px;
      border-right: 3px solid #667eea;
    }
    .recommendation {
      background: #e7f3ff;
      border-right-color: #2196F3;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .score {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 30px;
    }
    .score .number {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .score .label {
      font-size: 16px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 تقرير المشاعر الأسبوعي</h1>
      <p>${weekStart} - ${weekEnd}</p>
    </div>
    
    <div class="content">
      <div class="score">
        <div class="number">${report.satisfactionScore}%</div>
        <div class="label">درجة رضا العملاء</div>
      </div>

      <div class="stats">
        <div class="stat-card">
          <div class="number">${report.totalConversations}</div>
          <div class="label">إجمالي المحادثات</div>
        </div>
        <div class="stat-card">
          <div class="number">${report.positivePercentage}%</div>
          <div class="label">محادثات إيجابية</div>
        </div>
        <div class="stat-card">
          <div class="number">${report.negativePercentage}%</div>
          <div class="label">محادثات سلبية</div>
        </div>
        <div class="stat-card">
          <div class="number">${report.neutralCount}</div>
          <div class="label">محادثات محايدة</div>
        </div>
      </div>

      ${topKeywords.length > 0 ? `
      <div class="section">
        <h2>🔑 أكثر الكلمات المفتاحية تكراراً</h2>
        <ul>
          ${topKeywords.map((k: string) => `<li>${k}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${topComplaints.length > 0 ? `
      <div class="section">
        <h2>⚠️ أكثر الشكاوى تكراراً</h2>
        <ul>
          ${topComplaints.map((c: string) => `<li>${c}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${recommendations.length > 0 ? `
      <div class="section">
        <h2>💡 التوصيات</h2>
        <ul>
          ${recommendations.map((r: string) => `<li class="recommendation">${r}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>هذا تقرير تلقائي من نظام ساري AI</p>
      <p>للمزيد من التفاصيل، قم بزيارة لوحة التحكم</p>
    </div>
  </div>
</body>
</html>
  `;

  // إرسال البريد
  const success = await sendEmail({
    to: user.email,
    subject: `تقرير المشاعر الأسبوعي - ${weekStart} إلى ${weekEnd}`,
    html: emailHtml,
  });

  if (success) {
    await db.markReportEmailSent(reportId);
  }

  return success;
}

/**
 * جدولة التقارير الأسبوعية (يتم استدعاؤها من Cron Job)
 */
export async function scheduleWeeklyReports() {
  // الحصول على جميع التجار النشطين
  const merchants = await db.getAllMerchants();
  const activeMerchants = merchants.filter(m => m.status === 'active');

  console.log(`[Weekly Reports] Generating reports for ${activeMerchants.length} merchants...`);

  for (const merchant of activeMerchants) {
    try {
      // توليد التقرير
      const reportId = await generateWeeklyReport(merchant.id);
      
      // إرسال البريد
      await sendReportEmail(reportId);
      
      console.log(`[Weekly Reports] Report sent to merchant ${merchant.id}`);
    } catch (error) {
      console.error(`[Weekly Reports] Error for merchant ${merchant.id}:`, error);
    }
  }

  console.log(`[Weekly Reports] Completed!`);
}
