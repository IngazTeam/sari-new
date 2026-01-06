/**
 * Email Service
 * Handles sending emails for welcome, subscription confirmation, and trial expiry notifications
 */

import { invokeLLM } from "./llm";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

interface WelcomeEmailParams {
  name: string;
  email: string;
  trialEndDate: string;
}

interface SubscriptionConfirmationParams {
  name: string;
  email: string;
  planName: string;
  startDate: string;
  endDate: string;
}

interface TrialExpiryParams {
  name: string;
  email: string;
  daysRemaining: number;
}

/**
 * Send email using Manus notification system
 * Since we don't have direct email service, we'll use the owner notification system
 * In production, this should be replaced with a proper email service like SendGrid, AWS SES, etc.
 */
async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    // For now, we'll log the email content
    // In production, integrate with an email service provider
    console.log('[Email Service] Sending email:', {
      to: params.to,
      subject: params.subject,
      preview: params.html.substring(0, 100) + '...'
    });

    // TODO: Integrate with actual email service
    // Example with SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({
    //   to: params.to,
    //   from: 'noreply@sari.app',
    //   subject: params.subject,
    //   html: params.html,
    // });

    return true;
  } catch (error) {
    console.error('[Email Service] Error sending email:', error);
    return false;
  }
}

/**
 * Generate welcome email HTML template
 */
function generateWelcomeEmailHTML(params: WelcomeEmailParams): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>مرحباً بك في ساري</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
      direction: rtl;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      text-align: center;
      color: white;
    }
    .header h1 {
      margin: 0;
      font-size: 32px;
      font-weight: bold;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #333;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .content p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 15px;
    }
    .trial-box {
      background-color: #f0f4ff;
      border-right: 4px solid #667eea;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .trial-box strong {
      color: #667eea;
      font-size: 18px;
    }
    .features {
      margin: 30px 0;
    }
    .feature-item {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
    }
    .feature-icon {
      width: 24px;
      height: 24px;
      background-color: #667eea;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 12px;
      color: white;
      font-weight: bold;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      margin: 20px 0;
      text-align: center;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 30px;
      text-align: center;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 مرحباً بك في ساري!</h1>
    </div>
    
    <div class="content">
      <h2>أهلاً ${params.name}،</h2>
      
      <p>نحن سعداء جداً بانضمامك إلى عائلة ساري! 🚀</p>
      
      <p>ساري هو مساعدك الذكي للمبيعات عبر الواتساب، مصمم خصيصاً لمساعدة تجار المملكة العربية السعودية على تنمية أعمالهم وزيادة مبيعاتهم.</p>
      
      <div class="trial-box">
        <strong>🎁 فترتك التجريبية المجانية نشطة الآن!</strong>
        <p style="margin-top: 10px; margin-bottom: 0;">استمتع بجميع ميزات ساري مجاناً حتى <strong>${params.trialEndDate}</strong></p>
      </div>
      
      <div class="features">
        <h3 style="color: #333; margin-bottom: 20px;">ماذا يمكنك فعله مع ساري؟</h3>
        
        <div class="feature-item">
          <div class="feature-icon">✓</div>
          <span>الرد التلقائي على استفسارات العملاء 24/7</span>
        </div>
        
        <div class="feature-item">
          <div class="feature-icon">✓</div>
          <span>معالجة الطلبات وتأكيدها تلقائياً</span>
        </div>
        
        <div class="feature-item">
          <div class="feature-icon">✓</div>
          <span>إدارة المنتجات والخدمات بسهولة</span>
        </div>
        
        <div class="feature-item">
          <div class="feature-icon">✓</div>
          <span>إرسال حملات تسويقية مستهدفة</span>
        </div>
        
        <div class="feature-item">
          <div class="feature-icon">✓</div>
          <span>تقارير وإحصائيات تفصيلية</span>
        </div>
      </div>
      
      <p style="margin-top: 30px;"><strong>الخطوة التالية:</strong></p>
      <p>ابدأ الآن بإعداد حسابك وربط رقم الواتساب الخاص بك. لكن تذكر، لربط رقم الواتساب ستحتاج إلى الاشتراك في إحدى باقاتنا أولاً.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://sari.app/merchant/dashboard" class="cta-button">ابدأ الآن</a>
      </div>
      
      <p style="color: #999; font-size: 14px; margin-top: 30px;">إذا كان لديك أي استفسار، لا تتردد في التواصل معنا. نحن هنا لمساعدتك! 💜</p>
    </div>
    
    <div class="footer">
      <p>ساري - مساعدك الذكي للمبيعات عبر الواتساب</p>
      <p>© 2025 جميع الحقوق محفوظة</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate subscription confirmation email HTML template
 */
function generateSubscriptionConfirmationHTML(params: SubscriptionConfirmationParams): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تأكيد الاشتراك</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
      direction: rtl;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      padding: 40px 20px;
      text-align: center;
      color: white;
    }
    .header h1 {
      margin: 0;
      font-size: 32px;
      font-weight: bold;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #333;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .content p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 15px;
    }
    .subscription-details {
      background-color: #f0fdf4;
      border-right: 4px solid #10b981;
      padding: 25px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .subscription-details table {
      width: 100%;
      border-collapse: collapse;
    }
    .subscription-details td {
      padding: 10px 0;
      font-size: 16px;
    }
    .subscription-details td:first-child {
      color: #666;
      font-weight: normal;
    }
    .subscription-details td:last-child {
      color: #333;
      font-weight: bold;
      text-align: left;
    }
    .success-icon {
      width: 80px;
      height: 80px;
      background-color: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 48px;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      margin: 20px 0;
      text-align: center;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 30px;
      text-align: center;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✓</div>
      <h1>تم تأكيد اشتراكك!</h1>
    </div>
    
    <div class="content">
      <h2>مبروك ${params.name}! 🎉</h2>
      
      <p>تم تفعيل اشتراكك في ساري بنجاح. أنت الآن جاهز للاستفادة من جميع الميزات المتقدمة!</p>
      
      <div class="subscription-details">
        <table>
          <tr>
            <td>الباقة:</td>
            <td>${params.planName}</td>
          </tr>
          <tr>
            <td>تاريخ البدء:</td>
            <td>${params.startDate}</td>
          </tr>
          <tr>
            <td>تاريخ الانتهاء:</td>
            <td>${params.endDate}</td>
          </tr>
        </table>
      </div>
      
      <p><strong>ماذا بعد؟</strong></p>
      
      <p>الآن يمكنك ربط رقم الواتساب الخاص بك والبدء في استقبال الرسائل ومعالجتها تلقائياً!</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://sari.app/merchant/whatsapp" class="cta-button">ربط الواتساب الآن</a>
      </div>
      
      <p style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border-right: 4px solid #f59e0b;">
        <strong>💡 نصيحة:</strong> لا تنسَ إعداد منتجاتك وخدماتك في لوحة التحكم لتحصل على أفضل تجربة مع ساري!
      </p>
      
      <p style="color: #999; font-size: 14px; margin-top: 30px;">شكراً لثقتك بنا. نحن متحمسون لمساعدتك في تنمية أعمالك! 💜</p>
    </div>
    
    <div class="footer">
      <p>ساري - مساعدك الذكي للمبيعات عبر الواتساب</p>
      <p>© 2025 جميع الحقوق محفوظة</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate trial expiry warning email HTML template
 */
function generateTrialExpiryHTML(params: TrialExpiryParams): string {
  const urgencyColor = params.daysRemaining <= 1 ? '#ef4444' : '#f59e0b';
  const urgencyText = params.daysRemaining <= 1 ? 'ينتهي قريباً!' : 'تنبيه مهم';
  
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تنبيه انتهاء الفترة التجريبية</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
      direction: rtl;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, ${urgencyColor} 0%, ${urgencyColor === '#ef4444' ? '#dc2626' : '#d97706'} 100%);
      padding: 40px 20px;
      text-align: center;
      color: white;
    }
    .header h1 {
      margin: 0;
      font-size: 32px;
      font-weight: bold;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #333;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .content p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 15px;
    }
    .warning-box {
      background-color: #fef2f2;
      border-right: 4px solid ${urgencyColor};
      padding: 25px;
      margin: 25px 0;
      border-radius: 8px;
      text-align: center;
    }
    .warning-box .days {
      font-size: 48px;
      font-weight: bold;
      color: ${urgencyColor};
      margin: 10px 0;
    }
    .warning-box p {
      margin: 5px 0;
      font-size: 18px;
      color: #333;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${urgencyColor} 0%, ${urgencyColor === '#ef4444' ? '#dc2626' : '#d97706'} 100%);
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: bold;
      margin: 20px 0;
      text-align: center;
    }
    .benefits {
      background-color: #f0f9ff;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .benefits h3 {
      color: #333;
      margin-bottom: 15px;
    }
    .benefits ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .benefits li {
      padding: 8px 0;
      color: #666;
    }
    .benefits li:before {
      content: "✓ ";
      color: #10b981;
      font-weight: bold;
      margin-left: 8px;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 30px;
      text-align: center;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ ${urgencyText}</h1>
    </div>
    
    <div class="content">
      <h2>عزيزي ${params.name},</h2>
      
      <p>نأمل أن تكون قد استمتعت بتجربة ساري خلال الفترة التجريبية المجانية! 🎉</p>
      
      <div class="warning-box">
        <p>فترتك التجريبية تنتهي خلال:</p>
        <div class="days">${params.daysRemaining}</div>
        <p><strong>${params.daysRemaining === 1 ? 'يوم واحد' : params.daysRemaining === 2 ? 'يومين' : `${params.daysRemaining} أيام`}</strong></p>
      </div>
      
      <p>لا تفوت فرصة الاستمرار في استخدام ساري لتنمية أعمالك! 🚀</p>
      
      <div class="benefits">
        <h3>لماذا تشترك في ساري؟</h3>
        <ul>
          <li>زيادة المبيعات بنسبة تصل إلى 40%</li>
          <li>توفير الوقت والجهد في الرد على العملاء</li>
          <li>تحسين تجربة العملاء وزيادة رضاهم</li>
          <li>تقارير وإحصائيات تساعدك على اتخاذ قرارات أفضل</li>
          <li>دعم فني متواصل باللغة العربية</li>
        </ul>
      </div>
      
      <p style="text-align: center; font-size: 18px; color: #333; margin: 30px 0;">
        <strong>اشترك الآن واستمر في النجاح!</strong>
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://sari.app/merchant/subscription" class="cta-button">اختر باقتك الآن</a>
      </div>
      
      <p style="color: #999; font-size: 14px; margin-top: 30px;">إذا كان لديك أي استفسار أو تحتاج إلى مساعدة في اختيار الباقة المناسبة، فريقنا جاهز لمساعدتك! 💜</p>
    </div>
    
    <div class="footer">
      <p>ساري - مساعدك الذكي للمبيعات عبر الواتساب</p>
      <p>© 2025 جميع الحقوق محفوظة</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<boolean> {
  const html = generateWelcomeEmailHTML(params);
  
  return await sendEmail({
    to: params.email,
    subject: '🎉 مرحباً بك في ساري - فترتك التجريبية المجانية نشطة الآن!',
    html,
  });
}

/**
 * Send subscription confirmation email
 */
export async function sendSubscriptionConfirmationEmail(params: SubscriptionConfirmationParams): Promise<boolean> {
  const html = generateSubscriptionConfirmationHTML(params);
  
  return await sendEmail({
    to: params.email,
    subject: '✓ تم تأكيد اشتراكك في ساري بنجاح!',
    html,
  });
}

/**
 * Send trial expiry warning email
 */
export async function sendTrialExpiryEmail(params: TrialExpiryParams): Promise<boolean> {
  const html = generateTrialExpiryHTML(params);
  
  const subject = params.daysRemaining <= 1 
    ? '⏰ تنبيه عاجل: فترتك التجريبية تنتهي اليوم!'
    : `⏰ تنبيه: فترتك التجريبية تنتهي خلال ${params.daysRemaining} ${params.daysRemaining === 2 ? 'يومين' : 'أيام'}`;
  
  return await sendEmail({
    to: params.email,
    subject,
    html,
  });
}
