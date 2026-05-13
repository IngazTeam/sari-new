/**
 * Seed Email Templates
 * يملأ جدول email_templates بالقوالب الافتراضية
 */

import { getDb } from './db.js';
import { emailTemplates } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const defaultTemplates = [
  {
    name: 'new_order',
    displayName: 'إشعار طلب جديد',
    subject: '🛍️ طلب جديد #{{orderNumber}}',
    description: 'يُرسل للتاجر عند إنشاء طلب جديد',
    variables: JSON.stringify(['orderNumber', 'customerName', 'totalAmount', 'items']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">طلب جديد! 🎉</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          لديك طلب جديد من <strong>{{customerName}}</strong>
        </p>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0; color: #6b7280;">رقم الطلب</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #00d25e;">#{{orderNumber}}</p>
        </div>

        <h3 style="color: #111827; margin-bottom: 15px;">تفاصيل الطلب:</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
          {{itemsHtml}}
        </table>

        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; text-align: left;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #111827;">
            الإجمالي: {{totalAmount}} ر.س
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/orders" 
             style="display: inline-block; background: #00d25e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            عرض الطلب
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `طلب جديد! 🎉\n\nلديك طلب جديد من {{customerName}}\n\nرقم الطلب: #{{orderNumber}}\n\nالإجمالي: {{totalAmount}} ر.س\n\nعرض الطلب: {{appUrl}}/merchant/orders`,
  },
  {
    name: 'order_status_changed',
    displayName: 'تحديث حالة الطلب',
    subject: '📦 تحديث حالة الطلب #{{orderNumber}}',
    description: 'يُرسل للعميل عند تغيير حالة الطلب',
    variables: JSON.stringify(['orderNumber', 'customerName', 'oldStatus', 'newStatus', 'statusMessage']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">تحديث حالة الطلب</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          طلب <strong>{{customerName}}</strong> تم تحديثه
        </p>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0; color: #6b7280;">رقم الطلب</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #6366f1;">#{{orderNumber}}</p>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #374151; line-height: 1.6;">
            {{statusMessage}}
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/orders" 
             style="display: inline-block; background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            عرض الطلب
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `تحديث حالة الطلب\n\nطلب {{customerName}} تم تحديثه\n\nرقم الطلب: #{{orderNumber}}\n\n{{statusMessage}}\n\nعرض الطلب: {{appUrl}}/merchant/orders`,
  },
  {
    name: 'new_customer_message',
    displayName: 'رسالة جديدة من عميل',
    subject: '💬 رسالة جديدة من {{customerName}}',
    description: 'يُرسل للتاجر عند استلام رسالة جديدة من عميل',
    variables: JSON.stringify(['customerName', 'customerPhone', 'message', 'conversationId']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">رسالة جديدة! 💬</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 5px 0; color: #6b7280;">من</p>
          <p style="margin: 0; font-size: 20px; font-weight: bold; color: #111827;">{{customerName}}</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">{{customerPhone}}</p>
        </div>

        <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 0; color: #374151; line-height: 1.6; white-space: pre-wrap;">{{message}}</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/conversations" 
             style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            الرد على الرسالة
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `رسالة جديدة! 💬\n\nمن: {{customerName}}\nالهاتف: {{customerPhone}}\n\nالرسالة:\n{{message}}\n\nالرد على الرسالة: {{appUrl}}/merchant/conversations`,
  },
  {
    name: 'scheduled_report',
    displayName: 'تقرير دوري',
    subject: '📊 {{reportTitle}} - {{period}}',
    description: 'تقرير دوري (يومي/أسبوعي/شهري) يُرسل للتاجر',
    variables: JSON.stringify(['reportTitle', 'period', 'totalOrders', 'totalRevenue', 'newCustomers', 'conversations']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">{{reportTitle}} 📊</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">{{period}}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
          <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); padding: 20px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">الطلبات</p>
            <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #1e3a8a;">{{totalOrders}}</p>
          </div>
          <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 20px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #065f46; font-size: 14px;">الإيرادات</p>
            <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #064e3b;">{{totalRevenue}} ر.س</p>
          </div>
          <div style="background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%); padding: 20px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #9f1239; font-size: 14px;">عملاء جدد</p>
            <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #881337;">{{newCustomers}}</p>
          </div>
          <div style="background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); padding: 20px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #3730a3; font-size: 14px;">المحادثات</p>
            <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold; color: #312e81;">{{conversations}}</p>
          </div>
        </div>
      </td>
    </tr>`,
    textContent: `{{reportTitle}} 📊\n{{period}}\n\nالطلبات: {{totalOrders}}\nالإيرادات: {{totalRevenue}} ر.س\nعملاء جدد: {{newCustomers}}\nالمحادثات: {{conversations}}`,
  },
  {
    name: 'payment_failed',
    displayName: 'فشل الدفع',
    subject: '⚠️ فشل عملية الدفع',
    description: 'يُرسل للتاجر عند فشل عملية دفع',
    variables: JSON.stringify(['merchantName', 'amount', 'errorMessage', 'orderNumber']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ فشل عملية الدفع</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          مرحباً <strong>{{merchantName}}</strong>،
        </p>
        
        <div style="background: #fef2f2; border-right: 4px solid #ef4444; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #991b1b; line-height: 1.6;">
            فشلت عملية الدفع للطلب #{{orderNumber}} بمبلغ {{amount}} ر.س
          </p>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">سبب الفشل:</p>
          <p style="margin: 0; color: #374151;">{{errorMessage}}</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/payments" 
             style="display: inline-block; background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            عرض التفاصيل
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `⚠️ فشل عملية الدفع\n\nمرحباً {{merchantName}}،\n\nفشلت عملية الدفع للطلب #{{orderNumber}} بمبلغ {{amount}} ر.س\n\nسبب الفشل: {{errorMessage}}\n\nعرض التفاصيل: {{appUrl}}/merchant/payments`,
  },
  {
    name: 'integration_connected',
    displayName: 'تكامل جديد',
    subject: '🔗 تم ربط {{integrationName}} بنجاح',
    description: 'يُرسل للتاجر عند ربط تكامل جديد',
    variables: JSON.stringify(['merchantName', 'integrationName', 'connectedAt']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">🔗 تكامل جديد</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          مرحباً <strong>{{merchantName}}</strong>،
        </p>
        
        <div style="background: #d1fae5; border-right: 4px solid #10b981; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #065f46; line-height: 1.6;">
            تم ربط <strong>{{integrationName}}</strong> بنجاح مع حسابك
          </p>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">تاريخ الربط:</p>
          <p style="margin: 0; color: #374151;">{{connectedAt}}</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/integrations-dashboard" 
             style="display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            إدارة التكاملات
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `🔗 تكامل جديد\n\nمرحباً {{merchantName}}،\n\nتم ربط {{integrationName}} بنجاح مع حسابك\n\nتاريخ الربط: {{connectedAt}}\n\nإدارة التكاملات: {{appUrl}}/merchant/integrations-dashboard`,
  },
  {
    name: 'sync_error',
    displayName: 'خطأ في المزامنة',
    subject: '⚠️ خطأ في مزامنة {{syncType}}',
    description: 'يُرسل للتاجر عند حدوث خطأ في المزامنة',
    variables: JSON.stringify(['merchantName', 'syncType', 'errorMessage', 'timestamp']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ خطأ في المزامنة</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          مرحباً <strong>{{merchantName}}</strong>،
        </p>
        
        <div style="background: #fef3c7; border-right: 4px solid #f59e0b; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; line-height: 1.6;">
            حدث خطأ أثناء مزامنة <strong>{{syncType}}</strong>
          </p>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">تفاصيل الخطأ:</p>
          <p style="margin: 0; color: #374151;">{{errorMessage}}</p>
          <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px;">{{timestamp}}</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/data-sync" 
             style="display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            عرض سجل المزامنة
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `⚠️ خطأ في المزامنة\n\nمرحباً {{merchantName}}،\n\nحدث خطأ أثناء مزامنة {{syncType}}\n\nتفاصيل الخطأ: {{errorMessage}}\n\n{{timestamp}}\n\nعرض سجل المزامنة: {{appUrl}}/merchant/data-sync`,
  },
  {
    name: 'low_stock_alert',
    displayName: 'تنبيه نقص المخزون',
    subject: '📦 تنبيه: نقص مخزون {{productName}}',
    description: 'يُرسل للتاجر عند نقص مخزون منتج',
    variables: JSON.stringify(['merchantName', 'productName', 'currentStock', 'minStock']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">📦 تنبيه نقص المخزون</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          مرحباً <strong>{{merchantName}}</strong>،
        </p>
        
        <div style="background: #fef3c7; border-right: 4px solid #f59e0b; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; line-height: 1.6;">
            المخزون المتبقي من <strong>{{productName}}</strong> أقل من الحد الأدنى
          </p>
        </div>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">المخزون الحالي:</p>
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #f59e0b;">{{currentStock}} وحدة</p>
          <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">الحد الأدنى: {{minStock}} وحدة</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/products" 
             style="display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            تحديث المخزون
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `📦 تنبيه نقص المخزون\n\nمرحباً {{merchantName}}،\n\nالمخزون المتبقي من {{productName}} أقل من الحد الأدنى\n\nالمخزون الحالي: {{currentStock}} وحدة\nالحد الأدنى: {{minStock}} وحدة\n\nتحديث المخزون: {{appUrl}}/merchant/products`,
  },
  {
    name: 'new_review',
    displayName: 'تقييم جديد',
    subject: '⭐ تقييم جديد من {{customerName}}',
    description: 'يُرسل للتاجر عند استلام تقييم جديد',
    variables: JSON.stringify(['merchantName', 'customerName', 'rating', 'comment', 'productName']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">⭐ تقييم جديد</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          مرحباً <strong>{{merchantName}}</strong>،
        </p>
        
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 5px 0; color: #6b7280;">من</p>
          <p style="margin: 0; font-size: 20px; font-weight: bold; color: #111827;">{{customerName}}</p>
          <p style="margin: 10px 0 0 0; color: #6b7280;">المنتج: {{productName}}</p>
        </div>

        <div style="text-align: center; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 48px; color: #fbbf24;">{{rating}}</p>
        </div>

        <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 0; color: #374151; line-height: 1.6; white-space: pre-wrap;">{{comment}}</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/reviews" 
             style="display: inline-block; background: #fbbf24; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            عرض جميع التقييمات
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `⭐ تقييم جديد\n\nمرحباً {{merchantName}}،\n\nمن: {{customerName}}\nالمنتج: {{productName}}\n\nالتقييم: {{rating}}\n\nالتعليق:\n{{comment}}\n\nعرض جميع التقييمات: {{appUrl}}/merchant/reviews`,
  },
  {
    name: 'campaign_sent',
    displayName: 'إرسال حملة',
    subject: '📢 تم إرسال حملة {{campaignName}}',
    description: 'يُرسل للتاجر عند إرسال حملة تسويقية',
    variables: JSON.stringify(['merchantName', 'campaignName', 'recipientsCount', 'successCount', 'failedCount']),
    htmlContent: `<tr>
      <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">📢 تم إرسال الحملة</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          مرحباً <strong>{{merchantName}}</strong>،
        </p>
        
        <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #1e40af; font-size: 18px; font-weight: bold;">{{campaignName}}</p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 30px;">
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">إجمالي المرسل إليهم</p>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #111827;">{{recipientsCount}}</p>
          </div>
          <div style="background: #d1fae5; padding: 15px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #065f46; font-size: 12px;">نجح</p>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #10b981;">{{successCount}}</p>
          </div>
          <div style="background: #fee2e2; padding: 15px; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #991b1b; font-size: 12px;">فشل</p>
            <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #ef4444;">{{failedCount}}</p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="{{appUrl}}/merchant/campaigns" 
             style="display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            عرض تفاصيل الحملة
          </a>
        </div>
      </td>
    </tr>`,
    textContent: `📢 تم إرسال الحملة\n\nمرحباً {{merchantName}}،\n\nالحملة: {{campaignName}}\n\nإجمالي المرسل إليهم: {{recipientsCount}}\nنجح: {{successCount}}\nفشل: {{failedCount}}\n\nعرض تفاصيل الحملة: {{appUrl}}/merchant/campaigns`,
  },
];

async function seedEmailTemplates() {
  try {
    console.log('🌱 Starting email templates seed...');
    
    const db = await getDb();
    if (!db) {
      console.error('❌ Database not initialized — check DATABASE_URL');
      return;
    }
    
    for (const template of defaultTemplates) {
      try {
        // Check if template already exists
        const existing = await db
          .select()
          .from(emailTemplates)
          .where(eq(emailTemplates.name, template.name))
          .limit(1);
        
        if (existing.length > 0) {
          console.log(`⏭️  Template "${template.name}" already exists, skipping...`);
          continue;
        }
        
        // Insert template
        await db.insert(emailTemplates).values(template);
        console.log(`✅ Inserted template: ${template.displayName}`);
      } catch (error) {
        console.error(`❌ Error inserting template "${template.name}":`, error);
      }
    }
    
    console.log('✅ Email templates seed completed!');
  } catch (error) {
    console.error('❌ Error seeding email templates:', error);
    throw error;
  }
}

// Run if called directly
seedEmailTemplates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

export { seedEmailTemplates };
