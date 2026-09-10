# تكامل Sari مع ZahyPi

هذا المجلد يصف عقد التكامل المحكوم بين Sari وZahyPi. مصدر الحقيقة البرمجي
للمهام هو `server/ai/task-catalog.ts`، وتبنى حزمة التسليم منه بالأمر:

```bash
pnpm zahypi:pack
```

لإرفاق دليل حديث من بوابات الاختبار المحلية، بعد حفظ تغييرات الكود والكتالوج والبناء:

```bash
pnpm zahypi:pack --verify --date=2026-09-10 --output=docs/deliverables/SARI_ZAHYPI_REQUIREMENTS_PACK_2026-09-10.zip
```

يرفض CLI تسمية الحزمة بكوميت غير HEAD أو بناءها فوق تغييرات غير محفوظة في مصادرها.
`--verify` يشغّل ملفات بوابات ZahyPi والإصدار دون تكرار، ويضمّن الأعداد الفعلية وSHA
والإصدار في `test-evidence/local-gates.json` دون logs خام. لا يختبر مزودًا حيًا أو
قاعدة إنتاج. البناء دون هذا الخيار يسجل `NOT_RUN` ولا يخترع نجاحًا.

ZIP حتمي لنفس المصادر والأدلة، مستقل عن `zip/unzip` الخارجية، ولا يستبدل ملفًا
مختلفًا موجودًا. حزمة 26 أغسطس والسكربتان القديمتان أرشيف لا مصدر كتالوج التشغيل.
راجع تقرير الجولة `docs/SARI_REMEDIATION_VERIFICATION_2026-09-10.md` للفجوات المتبقية.

## الحدود التشغيلية

- كل مهام النص والقرار تمر باسم Task Type معروف، وليس Prompt عامًا.
- OpenAI يبقى للصوت والـembeddings، أو كتراجع يدوي صريح لمسار النص.
- البيانات الحمراء لا تنتقل تلقائيًا إلى مزود خارجي عند فشل ZahyPi.
- `sari.invoke` غير قابل للتفعيل.
- الأسماء القديمة تبقى aliases مؤقتة وتتحول إلى الاسم canonical قبل الإرسال.
- تفعيل المشروع يتم بمفتاح generation مشفر واختبار حي معزول بالـtenant.
- قبول التفعيل مشروط بتطابق project/tenant/task/trace وبمخرج يطابق مخطط المهمة؛
  إيصال صحيح الشكل من مهمة أخرى لا يكفي.
- المدخل والمخرج يفحصان محليًا عبر JSON Schema الكتالوج. `applicationResponse`
  يبقى غلاف توافق؛ التحقق البنيوي ليس تقييم جودة نموذج أو تفويض أثر تجاري.

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
