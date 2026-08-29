# تكامل Sari مع ZahyPi

هذا المجلد يصف عقد التكامل المحكوم بين Sari وZahyPi. مصدر الحقيقة البرمجي
للمهام هو `server/ai/task-catalog.ts`، وتبنى حزمة التسليم منه بالأمر:

```bash
pnpm zahypi:pack
```

## الحدود التشغيلية

- كل مهام النص والقرار تمر باسم Task Type معروف، وليس Prompt عامًا.
- OpenAI يبقى للصوت والـembeddings، أو كتراجع يدوي صريح لمسار النص.
- البيانات الحمراء لا تنتقل تلقائيًا إلى مزود خارجي عند فشل ZahyPi.
- `sari.invoke` غير قابل للتفعيل.
- الأسماء القديمة تبقى aliases مؤقتة وتتحول إلى الاسم canonical قبل الإرسال.
- تفعيل المشروع يتم بمفتاح generation مشفر واختبار حي معزول بالـtenant.

## دورة المهمة

```text
Sari caller
  -> resolve canonical Task Type
  -> validate bounded business input
  -> submit ZahyPi job with tenant, trace and idempotency
  -> poll to a terminal state when async
  -> require schema-valid output and run manifest
  -> return draft/analysis to Sari
```

لا تمنح الحزمة صلاحية نشر مباشرة. تمر المهام من Preview وValidate وSimulation
وReview قبل Shadow أو Canary أو Stable.
