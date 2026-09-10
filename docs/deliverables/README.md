# حزم متطلبات Sari → ZahyPi

## التسليم الحالي — 10 سبتمبر 2026

[SARI_ZAHYPI_REQUIREMENTS_PACK_2026-09-10.zip](SARI_ZAHYPI_REQUIREMENTS_PACK_2026-09-10.zip)

- مصدر الكود: `3ddfb4d37aa249b10b592c8ca7c435c509264a96`.
- الحجم: 336,013 bytes؛ 50 مهمة و417 ملفًا.
- SHA-256: `a5d7ecb2e0ec22548e017cf864cd78b8264521d9ab1c32363a1f5420715669a0`.
- أدلة آلية داخل ZIP: 1230 passed / 0 failed / 1 skipped في 99 ملفًا، على Windows وNode 24.19.0.
- حالة التسليم: مراجعة/استقبال فقط، وليس اعتماد إنتاج أو نجاح نموذج حي.
- [تقرير الإصلاح والقيود](../SARI_REMEDIATION_VERIFICATION_2026-09-10.md).

## الأرشيف

حزمة ومجلد 26 أغسطس (36 مهمة) محفوظان كما هما. لا يمثلان المصدر الحالي.
السكربتان `build-sari-zahypi-requirements-pack.mjs` و`validate-sari-zahypi-requirements-pack.mjs`
من الجولة القديمة لا تولّدان/تتحققان من حزمة سبتمبر. الأمر الحالي هو `pnpm zahypi:pack --verify`، بعد حفظ تغييرات المصدر، مع مسار جديد للتسليم.

لا تعدّل محتويات ZIP يدويًا، ولا تحوّل حالات الأمثلة أو إشارات unknown إلى موافقات تشغيلية.
