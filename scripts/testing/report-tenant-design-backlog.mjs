import fs from 'node:fs';

const root = 'docs/audits/tenant-notification-prototype-2026-09-28';
const source = 'docs/audits/tenant-features-2026-09-28/coverage.json';
const { generatedAt, routes } = JSON.parse(fs.readFileSync(source, 'utf8'));
const counts = routes.reduce((all, row) => ({...all, [row.design]:(all[row.design] || 0) + 1}), {});
const priority = row => row.redirect ? 'تحويل' : /sari-brain|sari-playground|test-sari|sari-analytics|ai-suggestions|sari-personality/.test(row.route) ? 'P0'
  : /conversations|orders|customers|product|service|booking|campaign|checkout|payment|sales-|virtual-team|bot-settings|human-takeover|setup-wizard/.test(row.route) ? 'P1' : 'P2';
const table = routes.map(row => ({...row, priority:priority(row)})).sort((a,b) => a.priority.localeCompare(b.priority) || a.route.localeCompare(b.route));
fs.mkdirSync(root, {recursive:true});
fs.writeFileSync(`${root}/REMAINING.md`, `# سجل استكمال تصميم لوحة التيننت

حالة التصميم بعد جولة نماذج التقارير والإشعارات. مرجع عناصر المصدر: لقطة ${generatedAt} في [سجل التغطية](../tenant-features-2026-09-28/coverage.json). لم يُعد حصر المصدر خلال هذه الجولة؛ توجد تغييرات سلة متزامنة تحتاج إعادة توليد الحصر بعد تثبيتها. هذا سجل أولويات وتصميم، وليس إثبات نجاح تشغيل كل خاصية.

${Object.entries(counts).map(([label,count])=>`- ${label}: **${count}** مسارًا.`).join('\n')}

P0 أولوية المستخدم: نتائج عقل ساري، المصادر والملفات والفجوات، تفسير تقييم المبيعات، تجربة الرد قبل اعتماده، وبقية إعدادات التعلم والتجارب والتشغيل. P1 التدفقات اليومية وما يغيّر بيانات العميل أو المال أو الإرسال. P2 بقية الإدارة والتحليلات والإعدادات. الأولوية ترتيب عمل؛ لا تعني ثغرة أمنية مؤكدة.

## شروط إغلاق أي صفحة

مطابقة الحقول والأزرار والنوافذ والخيارات المشروطة والصلاحيات مع المصدر؛ تجربة دورة القراءة والتعديل والحفظ وإعادة الفتح والفشل دون فقد المسودة؛ اختبار الحالات الفارغة والتحميل والخطأ؛ مراجعة الهاتف ولوحة المفاتيح والاتجاه؛ توثيق الفروق بين الموك أب والخادم. تتطلب خدمات الذكاء الاصطناعي والإرسال والتكاملات تحققًا منفصلًا قبل وصفها بأنها تعمل. يبقى اختبار Safari وiPhone الفعلي مفتوحًا.

## الصفحات الـ126 دون إسقاط

| الأولوية | الصفحة والمسار | حالة الموك أب | العمل الباقي أو شرط التحقق |
| --- | --- | --- | --- |
${table.map(row => `| ${row.priority} | ${row.title}<br><code>${row.route}</code> | ${row.design} | ${row.redirect ? 'التحقق من التحويل إلى ' + row.redirect + '.' : row.gaps.length ? row.gaps.join(' ') + (row.design === 'موك أب عام' ? ' ' + row.acceptancePlan : '') : 'لا توجد فجوة تصميم مسجلة في نطاق هذا الفحص؛ لا يعني ذلك اختبار كل خدمة خارجية.'} |`).join('\n')}

عدد عناصر JSX أو وجود رابط لكل مسار لا يُحوّل التصميم العام إلى تصميم تفصيلي. لا تُحذف الملفات القديمة غير المرتبطة قبل فحص مراجعها وبدائل واجهاتها. تفاصيل عناصر كل صفحة في [السجل القابل للبحث](../../../prototypes/tenant-dashboard/site/feature-audit.html).
`);
console.log(JSON.stringify({routes:routes.length, counts, report:`${root}/REMAINING.md`}));
