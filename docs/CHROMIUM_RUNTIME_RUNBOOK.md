# Runbook تشغيل Chrome/Chromium

**النطاق:** تحليل المواقع التي تحتاج JavaScript وتوليد PDF لعروض الأسعار  
**القرار:** استخدام Chrome/Chromium محدث تديره صورة الخادم أو نظام التشغيل، دون تنزيل browser binary من حزمة npm قديمة

## الإعداد

1. ثبّت Chrome أو Chromium من مستودع نظام موثوق، أو ضمن صورة container مثبتة digest وتخضع لتحديثات الثغرات.
2. اضبط مساره المطلق عبر secret/config manager، لا عبر إدخال المستخدم:

```text
CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

3. يعمل resolver أيضًا مع المسارات النظامية الشائعة، لكن المسار الصريح أفضل لمنع اختلاف الصور والبيئات.
4. لا تضف حزمة `chromium` القديمة إلى dependencies، ولا تضف lockfile ثانٍ؛ `pnpm-lock.yaml` هو المصدر الوحيد للتثبيت.

## sandbox

يبقى Chromium sandbox مفعّلًا افتراضيًا. إذا كانت بيئة container معزولة فعلًا وتستخدم seccomp/capability policy ولا يمكنها تشغيل sandbox، يكون التعطيل استثناءً موثقًا بهذه القيمة الدقيقة فقط:

```text
CHROMIUM_DISABLE_SANDBOX_ACK=isolated-container-with-seccomp
```

لا تستخدم `true` أو `1`، ولا تضبط الاستثناء على خادم مشترك. راجع الاستثناء عند كل تغيير للصورة.

## بوابة النشر

1. شغّل preflight يتحقق أن المسار مطلق وموجود وقابل للتنفيذ بحساب التطبيق.
2. حلّل صفحة SPA اختبارية مسموحة وتحقق من استخراج النص وإغلاق العملية بعد النجاح والفشل.
3. أنشئ عرض سعر تجريبيًا وتحقق من PDF وحجمه وإغلاق browser.
4. راقب زمن الإطلاق والذاكرة وعدد عمليات Chrome اليتيمة؛ أي تراكم يمنع النشر.
5. شغّل production dependency audit؛ معيار القبول صفر Critical وصفر High، بلا allowlist مؤقتة.
