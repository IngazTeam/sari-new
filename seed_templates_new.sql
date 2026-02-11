-- =============================================
-- New Templates: شركة استقدام عمالة + مركز تدريب
-- =============================================

-- Template 7: شركة استقدام عمالة (Labor Recruitment Company)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'services',
  'شركة استقدام عمالة',
  '👷',
  '[{"name":"استقدام عمالة منزلية","description":"خادمات، سائقين، طباخين من مختلف الجنسيات","price":"5000"},{"name":"استقدام فني وحرفي","description":"كهربائيين، سباكين، نجارين، حدادين","price":"4000"},{"name":"نقل كفالة","description":"إجراءات نقل الكفالة كاملة مع التأمين","price":"2000"},{"name":"تجديد إقامة","description":"تجديد الإقامة والتأمين الطبي","price":"1500"},{"name":"استشارة مجانية","description":"استشارة حول الاستقدام والأنظمة","price":"0"}]',
  NULL,
  '{"type":"weekdays","saturday":{"open":"08:00","close":"17:00"},"sunday":{"open":"08:00","close":"17:00"},"monday":{"open":"08:00","close":"17:00"},"tuesday":{"open":"08:00","close":"17:00"},"wednesday":{"open":"08:00","close":"17:00"},"thursday":{"open":"08:00","close":"14:00"},"friday":{"open":"closed","close":"closed"}}',
  '{"tone":"professional","language":"ar","welcomeMessage":"مرحباً بك! 👷 أهلاً في شركتنا للاستقدام. كيف أقدر أساعدك؟ نوفر عمالة من مختلف الجنسيات بأسعار منافسة. اسأل عن أي خدمة تحتاجها!"}',
  'قالب متخصص لشركات الاستقدام وتوظيف العمالة. يتضمن خدمات الاستقدام المنزلي والمهني مع ساعات عمل رسمية.',
  'شركات استقدام، مكاتب توظيف، مكاتب عمالة، خدمات نقل كفالة',
  1, 0, 'ar'
);

-- Template 8: مركز تدريب (Training Center)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'services',
  'مركز تدريب',
  '🎓',
  '[{"name":"دورة اللغة الإنجليزية","description":"دورة مكثفة لتعلم الإنجليزية - مستوى مبتدئ إلى متقدم","price":"1500"},{"name":"دورة الحاسب الآلي","description":"تعلم أساسيات الحاسب وبرامج الأوفيس","price":"1200"},{"name":"دورة إدارة المشاريع PMP","description":"دورة تأهيلية لاختبار PMP مع مدربين معتمدين","price":"3500"},{"name":"دورة التسويق الرقمي","description":"احتراف التسويق عبر السوشال ميديا وقوقل","price":"2000"},{"name":"دورة السلامة المهنية OSHA","description":"دورة السلامة والصحة المهنية المعتمدة","price":"2500"}]',
  NULL,
  '{"type":"weekdays","saturday":{"open":"08:00","close":"21:00"},"sunday":{"open":"08:00","close":"21:00"},"monday":{"open":"08:00","close":"21:00"},"tuesday":{"open":"08:00","close":"21:00"},"wednesday":{"open":"08:00","close":"21:00"},"thursday":{"open":"08:00","close":"16:00"},"friday":{"open":"closed","close":"closed"}}',
  '{"tone":"professional","language":"ar","welcomeMessage":"أهلاً بك! 🎓 مرحباً في مركزنا التدريبي. نقدم دورات معتمدة في مختلف المجالات. تقدر تسأل عن الدورات المتاحة أو تسجل مباشرة!"}',
  'قالب احترافي لمراكز التدريب والمعاهد. يتضمن دورات تدريبية متنوعة مع ساعات عمل مرنة.',
  'مراكز تدريب، معاهد، أكاديميات، مراكز تعليمية',
  1, 0, 'ar'
);

-- =============================================
-- Translations
-- =============================================

-- Template 7: شركة استقدام عمالة - Arabic
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'شركة استقدام عمالة', 'قالب متخصص لشركات الاستقدام وتوظيف العمالة.', 'شركات استقدام، مكاتب توظيف، خدمات نقل كفالة'
FROM business_templates WHERE template_name = 'شركة استقدام عمالة' LIMIT 1;

-- Template 7: شركة استقدام عمالة - English
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Labor Recruitment', 'Specialized template for labor recruitment and staffing companies.', 'Recruitment agencies, staffing offices, labor services'
FROM business_templates WHERE template_name = 'شركة استقدام عمالة' LIMIT 1;

-- Template 8: مركز تدريب - Arabic
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'مركز تدريب', 'قالب احترافي لمراكز التدريب والمعاهد.', 'مراكز تدريب، معاهد، أكاديميات'
FROM business_templates WHERE template_name = 'مركز تدريب' LIMIT 1;

-- Template 8: مركز تدريب - English
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Training Center', 'Professional template for training centers and institutes.', 'Training centers, institutes, academies, educational centers'
FROM business_templates WHERE template_name = 'مركز تدريب' LIMIT 1;

SELECT 'New templates added successfully!' AS result;
