-- ==============================================
-- Seed Email Templates for Sari Platform
-- Run: Copy and execute on production MySQL
-- ==============================================

-- 1. ترحيب بتاجر جديد
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'welcome',
  'ترحيب بتاجر جديد',
  'يُرسل تلقائياً عند تسجيل تاجر جديد في المنصة',
  'مرحباً بك في ساري! 🎉',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 30px;"><div style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 36px;">🎉</span></div><h1 style="color: #1f2937; font-size: 28px; margin: 0 0 10px;">مرحباً {{merchantName}}!</h1><p style="color: #6b7280; font-size: 16px; margin: 0;">تم تسجيلك بنجاح في منصة ساري</p></div><div style="background: #f0fdf4; border-radius: 12px; padding: 24px; margin-bottom: 24px;"><h3 style="color: #166534; margin: 0 0 12px; font-size: 16px;">✅ ابدأ الآن في 3 خطوات:</h3><ol style="color: #374151; margin: 0; padding-right: 20px; line-height: 2;"><li>اربط حسابك على واتساب</li><li>أضف منتجاتك أو خدماتك</li><li>فعّل ساري وابدأ البيع تلقائياً</li></ol></div><div style="text-align: center;"><a href="{{appUrl}}/merchant/dashboard" style="display: inline-block; background: #10b981; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">ابدأ الآن</a></div></td></tr>',
  'مرحباً {{merchantName}}!\n\nتم تسجيلك بنجاح في منصة ساري.\n\nابدأ الآن:\n1. اربط حسابك على واتساب\n2. أضف منتجاتك أو خدماتك\n3. فعّل ساري وابدأ البيع تلقائياً\n\nرابط لوحة التحكم: {{appUrl}}/merchant/dashboard',
  '["merchantName", "appUrl"]',
  0
);

-- 2. إشعار طلب جديد
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'new_order',
  'إشعار طلب جديد',
  'يُرسل عند استلام طلب جديد من عميل عبر واتساب',
  '🛒 طلب جديد #{{orderNumber}}',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 24px;"><div style="background: #dbeafe; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 28px;">🛒</span></div><h1 style="color: #1f2937; font-size: 24px; margin: 0;">طلب جديد!</h1></div><div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;"><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">رقم الطلب</td><td style="padding: 8px 0; color: #1f2937; font-weight: bold; text-align: left; font-size: 14px;">#{{orderNumber}}</td></tr><tr><td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #e5e7eb; font-size: 14px;">العميل</td><td style="padding: 8px 0; color: #1f2937; font-weight: bold; text-align: left; border-top: 1px solid #e5e7eb; font-size: 14px;">{{customerName}}</td></tr><tr><td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #e5e7eb; font-size: 14px;">المبلغ</td><td style="padding: 8px 0; color: #10b981; font-weight: bold; text-align: left; border-top: 1px solid #e5e7eb; font-size: 18px;">{{totalAmount}} ريال</td></tr></table></div><div style="text-align: center;"><a href="{{appUrl}}/merchant/orders" style="display: inline-block; background: #10b981; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض الطلب</a></div></td></tr>',
  'طلب جديد!\n\nرقم الطلب: #{{orderNumber}}\nالعميل: {{customerName}}\nالمبلغ: {{totalAmount}} ريال\n\nعرض الطلب: {{appUrl}}/merchant/orders',
  '["orderNumber", "customerName", "totalAmount", "merchantName", "appUrl"]',
  0
);

-- 3. تحديث حالة الطلب
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'order_status_changed',
  'تحديث حالة الطلب',
  'يُرسل عند تغيير حالة طلب',
  '📦 تحديث على الطلب #{{orderNumber}}',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 24px;"><div style="background: #fef3c7; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 28px;">📦</span></div><h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تحديث حالة الطلب</h1><p style="color: #6b7280; margin: 0;">الطلب #{{orderNumber}} — {{customerName}}</p></div><div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;"><p style="color: #92400e; font-size: 14px; margin: 0 0 8px;">الحالة الجديدة</p><p style="color: #78350f; font-size: 20px; font-weight: bold; margin: 0;">{{orderStatus}}</p></div><div style="text-align: center;"><a href="{{appUrl}}/merchant/orders" style="display: inline-block; background: #10b981; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض التفاصيل</a></div></td></tr>',
  'تحديث حالة الطلب\n\nالطلب: #{{orderNumber}}\nالعميل: {{customerName}}\nالحالة: {{orderStatus}}\n\nعرض التفاصيل: {{appUrl}}/merchant/orders',
  '["orderNumber", "customerName", "totalAmount", "merchantName", "orderStatus", "appUrl"]',
  0
);

-- 4. تقييم جديد
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'new_review',
  'تقييم جديد من عميل',
  'يُرسل عند استلام تقييم جديد من عميل',
  '⭐ تقييم جديد من {{customerName}}',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تقييم جديد!</h1><p style="color: #6b7280; margin: 0;">من {{customerName}}</p></div><div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;"><p style="font-size: 32px; margin: 0 0 12px;">{{rating}}</p><p style="color: #374151; font-size: 16px; font-weight: bold; margin: 0;">{{productName}}</p></div><div style="text-align: center;"><a href="{{appUrl}}/merchant/reviews" style="display: inline-block; background: #10b981; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض التقييمات</a></div></td></tr>',
  'تقييم جديد!\n\nمن: {{customerName}}\nالمنتج: {{productName}}\nالتقييم: {{rating}}\n\nعرض التقييمات: {{appUrl}}/merchant/reviews',
  '["customerName", "productName", "rating", "merchantName", "appUrl"]',
  0
);

-- 5. اكتمال حملة تسويقية
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'campaign_completed',
  'اكتمال حملة تسويقية',
  'يُرسل عند اكتمال إرسال حملة تسويقية عبر واتساب',
  '📊 تقرير الحملة: {{campaignName}}',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 24px;"><div style="background: #ede9fe; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 28px;">📊</span></div><h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تقرير الحملة</h1><p style="color: #6b7280; margin: 0;">{{campaignName}}</p></div><table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;"><tr><td style="width: 33%; padding: 16px; background: #f0fdf4; border-radius: 10px; text-align: center;"><p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">المستلمون</p><p style="color: #1f2937; font-size: 24px; font-weight: bold; margin: 0;">{{recipientsCount}}</p></td><td style="width: 33%; padding: 16px; background: #f0fdf4; border-radius: 10px; text-align: center;"><p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">نجح</p><p style="color: #16a34a; font-size: 24px; font-weight: bold; margin: 0;">{{successCount}}</p></td><td style="width: 33%; padding: 16px; background: #fef2f2; border-radius: 10px; text-align: center;"><p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">فشل</p><p style="color: #dc2626; font-size: 24px; font-weight: bold; margin: 0;">{{failedCount}}</p></td></tr></table><div style="text-align: center;"><a href="{{appUrl}}/merchant/campaigns" style="display: inline-block; background: #10b981; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض الحملات</a></div></td></tr>',
  'تقرير الحملة: {{campaignName}}\n\nالمستلمون: {{recipientsCount}}\nنجح: {{successCount}}\nفشل: {{failedCount}}\n\nعرض الحملات: {{appUrl}}/merchant/campaigns',
  '["campaignName", "recipientsCount", "successCount", "failedCount", "merchantName", "appUrl"]',
  0
);

-- 6. التقرير الأسبوعي
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'weekly_report',
  'التقرير الأسبوعي',
  'تقرير أسبوعي تلقائي يلخص أداء المتجر',
  '📈 تقريرك الأسبوعي — {{merchantName}}',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">📈 تقريرك الأسبوعي</h1><p style="color: #6b7280; margin: 0;">{{merchantName}} — ملخص أداء الأسبوع</p></div><table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;"><tr><td style="width: 50%; padding: 12px; background: #eff6ff; text-align: center; border: 1px solid #dbeafe;"><p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">الطلبات</p><p style="color: #1e40af; font-size: 22px; font-weight: bold; margin: 0;">{{totalOrders}}</p></td><td style="width: 50%; padding: 12px; background: #f0fdf4; text-align: center; border: 1px solid #bbf7d0;"><p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">الإيرادات</p><p style="color: #166534; font-size: 22px; font-weight: bold; margin: 0;">{{totalRevenue}} ر.س</p></td></tr><tr><td style="padding: 12px; background: #fefce8; text-align: center; border: 1px solid #fde68a;"><p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">عملاء جدد</p><p style="color: #92400e; font-size: 22px; font-weight: bold; margin: 0;">{{newCustomers}}</p></td><td style="padding: 12px; background: #faf5ff; text-align: center; border: 1px solid #e9d5ff;"><p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">الرسائل</p><p style="color: #7c3aed; font-size: 22px; font-weight: bold; margin: 0;">{{totalMessages}}</p></td></tr></table><div style="text-align: center;"><a href="{{appUrl}}/merchant/dashboard" style="display: inline-block; background: #10b981; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">عرض لوحة التحكم</a></div></td></tr>',
  'تقريرك الأسبوعي — {{merchantName}}\n\nالطلبات: {{totalOrders}}\nالإيرادات: {{totalRevenue}} ر.س\nعملاء جدد: {{newCustomers}}\nالرسائل: {{totalMessages}}\n\nلوحة التحكم: {{appUrl}}/merchant/dashboard',
  '["merchantName", "totalOrders", "totalRevenue", "newCustomers", "totalMessages", "appUrl"]',
  0
);

-- 7. إعادة تعيين كلمة المرور
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'password_reset',
  'إعادة تعيين كلمة المرور',
  'يُرسل عند طلب إعادة تعيين كلمة المرور',
  '🔐 إعادة تعيين كلمة المرور',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 24px;"><div style="background: #fef2f2; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 28px;">🔐</span></div><h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">إعادة تعيين كلمة المرور</h1><p style="color: #6b7280; margin: 0;">مرحباً {{merchantName}}</p></div><p style="color: #374151; font-size: 15px; line-height: 1.8; text-align: center; margin-bottom: 24px;">تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد.</p><div style="text-align: center; margin-bottom: 24px;"><a href="{{resetLink}}" style="display: inline-block; background: #ef4444; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">إعادة تعيين كلمة المرور</a></div><p style="color: #9ca3af; font-size: 12px; text-align: center;">هذا الرابط صالح لمدة ساعة واحدة فقط.</p></td></tr>',
  'إعادة تعيين كلمة المرور\n\nمرحباً {{merchantName}}\n\nتلقينا طلباً لإعادة تعيين كلمة المرور. إذا لم تطلب ذلك، تجاهل هذا البريد.\n\nرابط إعادة التعيين: {{resetLink}}\n\nالرابط صالح لمدة ساعة واحدة.',
  '["merchantName", "resetLink", "appUrl"]',
  0
);

-- 8. تفعيل الاشتراك
INSERT IGNORE INTO email_templates (name, display_name, description, subject, html_content, text_content, variables, is_custom)
VALUES (
  'subscription_activated',
  'تفعيل الاشتراك',
  'يُرسل عند تفعيل اشتراك جديد أو تجديد اشتراك',
  '✅ تم تفعيل اشتراكك — {{planName}}',
  '<tr><td style="padding: 40px 30px;"><div style="text-align: center; margin-bottom: 24px;"><div style="background: #dcfce7; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 28px;">✅</span></div><h1 style="color: #1f2937; font-size: 24px; margin: 0 0 8px;">تم تفعيل اشتراكك!</h1><p style="color: #6b7280; margin: 0;">مرحباً {{merchantName}}</p></div><div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;"><table style="width: 100%; border-collapse: collapse;"><tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">الباقة</td><td style="padding: 8px 0; color: #166534; font-weight: bold; text-align: left; font-size: 16px;">{{planName}}</td></tr><tr><td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #bbf7d0; font-size: 14px;">تاريخ الانتهاء</td><td style="padding: 8px 0; color: #1f2937; font-weight: bold; text-align: left; border-top: 1px solid #bbf7d0; font-size: 14px;">{{expiryDate}}</td></tr></table></div><div style="text-align: center;"><a href="{{appUrl}}/merchant/subscription" style="display: inline-block; background: #10b981; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">إدارة الاشتراك</a></div></td></tr>',
  'تم تفعيل اشتراكك!\n\nمرحباً {{merchantName}}\n\nالباقة: {{planName}}\nتاريخ الانتهاء: {{expiryDate}}\n\nإدارة الاشتراك: {{appUrl}}/merchant/subscription',
  '["merchantName", "planName", "expiryDate", "appUrl"]',
  0
);

-- ✅ Done!
SELECT CONCAT('✅ Seeded ', COUNT(*), ' email templates') AS result FROM email_templates;
