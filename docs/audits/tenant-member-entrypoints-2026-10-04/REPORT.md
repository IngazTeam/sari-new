# المرحلة 452 — فتح مداخل الصفحات لأعضاء الفريق

نُقل 26 مكوّن دخول، بما فيها بطاقة ربط التقويم المتداخلة، من ملف المالك getCurrent إلى workspaceIdentity المحدود بالمتجر والمستخدم. يطابق كل مدخل actorId مع الجلسة قبل عرض مساحة العمل. لم تتوسع صلاحية القراءة أو التعديل في مصادر البيانات.

أُزيل اعتماد مسارات الخدمات في الموك أب على ملف المالك، وحُدثت 23 مجموعة اختبارات قائمة، وأضيف اختبار يمر على المداخل الـ26 مع غياب getCurrent وصلاحية العرض فقط.

التحقق: 777 حالة وحدة وواجهة وتراجع ناجحة، وفحص TypeScript وبناء التطبيق والموك أب ناجحة. عُرضت الإشعارات والخصومات في التطبيق المحلي بعضوية مشاهد: سبعة مفاتيح إشعارات معطلة، لا زر حفظ، وصفحة خصومات فارغة صحيحة مع شرح صلاحية العرض. جرى الوصول للخصومات عبر دليل الأدوات بعد أن أعاد المسار غير المسجل /merchant/discount-codes صفحة404؛ المسار الصحيح /merchant/discounts. لا تعديل تفضيلات أو إنشاء أكواد. أُعيدت عضوية حساب الفحص المحلي إلى حالتها الأصلية بعد التجربة.

الصور: viewer-notifications.png وviewer-discounts.png. فحص المتصفح هنا مكتبي محلي، وليس اختبار Safari أو iPhone فعليًا. فحوص الهاتف الموثقة في المرحلة449 لا تُعد فحصًا جديدًا لهذه المرحلة.

المداخل المعدّلة:

- `client/src/pages/DiscountCodes.tsx`
- `client/src/pages/BookingsManagement.tsx`
- `client/src/pages/ByaanDashboard.tsx`
- `client/src/pages/CalendarSettings.tsx`
- `client/src/pages/CalendarPage.tsx`
- `client/src/pages/PlatformIntegrations.tsx`
- `client/src/pages/ServiceDetails.tsx`
- `client/src/pages/SallaIntegration.tsx`
- `client/src/pages/StaffManagement.tsx`
- `client/src/pages/ZidCallback.tsx`
- `client/src/pages/merchant/AbandonedCartsPage.tsx`
- `client/src/pages/merchant/ByaanIntegration.tsx`
- `client/src/pages/merchant/CalendlyIntegration.tsx`
- `client/src/pages/merchant/OccasionCampaignsPage.tsx`
- `client/src/pages/merchant/OrderNotificationsSettings.tsx`
- `client/src/pages/merchant/MediaLibrary.tsx`
- `client/src/pages/merchant/Promotions.tsx`
- `client/src/pages/merchant/Referrals.tsx`
- `client/src/pages/merchant/ScheduledMessages.tsx`
- `client/src/pages/merchant/ServicesManagement.tsx`
- `client/src/pages/merchant/ServiceForm.tsx`
- `client/src/components/merchant/ReviewPage.tsx`
- `client/src/components/merchant/ServiceCollectionPage.tsx`
- `client/src/components/merchant/WooWorkspacePage.tsx`
- `client/src/components/merchant/ZidWorkspacePage.tsx`
- `client/src/components/merchant/CalendarConnectionCard.tsx`

بقيت مداخل تستخدم ملف المتجر لأنها تحتاج بياناته، وبقيت صفحات عامة في الموك أب. التالي إعدادات العملة والحساب؛ لا ادعاء اكتمال كل الصفحات، ولا نشر.
