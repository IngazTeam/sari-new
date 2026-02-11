-- =============================================
-- Seed Business Templates for Setup Wizard
-- Run on production: mysql -u root -p sari < seed_templates.sql
-- =============================================

-- Template 1: متجر ملابس (Clothing Store)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'store',
  'متجر ملابس',
  '👕',
  NULL,
  '[{"name":"قميص قطني رجالي","description":"قميص قطن 100% بألوان متعددة","price":"89"},{"name":"فستان نسائي","description":"فستان أنيق مناسب للسهرات","price":"199"},{"name":"بنطلون جينز","description":"جينز عالي الجودة بقصة عصرية","price":"159"},{"name":"عباية مطرزة","description":"عباية فاخرة بتطريز يدوي","price":"350"}]',
  '{"type":"weekdays","saturday":{"open":"09:00","close":"22:00"},"sunday":{"open":"09:00","close":"22:00"},"monday":{"open":"09:00","close":"22:00"},"tuesday":{"open":"09:00","close":"22:00"},"wednesday":{"open":"09:00","close":"22:00"},"thursday":{"open":"09:00","close":"22:00"},"friday":{"open":"16:00","close":"22:00"}}',
  '{"tone":"friendly","language":"ar","welcomeMessage":"أهلاً بك في متجرنا! 👋 كيف أقدر أساعدك اليوم؟ تقدر تسأل عن المنتجات، الأسعار، أو تتبع طلبك."}',
  'قالب جاهز لمتاجر الملابس والأزياء. يتضمن منتجات نموذجية وساعات عمل مناسبة ورسالة ترحيب احترافية.',
  'متاجر الملابس، الأزياء، العبايات، الأحذية، الإكسسوارات',
  1, 0, 'ar'
);

-- Template 2: مطعم (Restaurant)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'both',
  'مطعم',
  '🍽️',
  '[{"name":"توصيل طلبات","description":"توصيل سريع خلال 30-45 دقيقة","price":"15"}]',
  '[{"name":"برجر كلاسيك","description":"لحم أنقز 200 جرام مع خس وطماطم","price":"35"},{"name":"بيتزا مارجريتا","description":"عجينة طازجة مع صلصة طماطم وجبنة موزاريلا","price":"45"},{"name":"سلطة سيزر","description":"خس روماني مع صدر دجاج مشوي وصوص سيزر","price":"28"},{"name":"عصير برتقال طازج","description":"برتقال طبيعي 100%","price":"15"}]',
  '{"type":"custom","saturday":{"open":"11:00","close":"23:00"},"sunday":{"open":"11:00","close":"23:00"},"monday":{"open":"11:00","close":"23:00"},"tuesday":{"open":"11:00","close":"23:00"},"wednesday":{"open":"11:00","close":"23:00"},"thursday":{"open":"11:00","close":"00:00"},"friday":{"open":"13:00","close":"00:00"}}',
  '{"tone":"casual","language":"ar","welcomeMessage":"أهلاً وسهلاً! 🍽️ حياك الله في مطعمنا. شنو تحب تطلب اليوم؟ تقدر تشوف القائمة أو تطلب مباشرة!"}',
  'قالب مثالي للمطاعم والكافيهات. يتضمن قائمة طعام نموذجية وساعات عمل مناسبة مع رسالة ترحيب ودية.',
  'مطاعم، كافيهات، محلات حلويات، عصائر، مخابز',
  1, 0, 'ar'
);

-- Template 3: صالون تجميل (Beauty Salon)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'services',
  'صالون تجميل',
  '💇',
  '[{"name":"قص شعر رجالي","description":"قص وتصفيف الشعر مع غسيل","price":"50"},{"name":"صبغة شعر","description":"صبغة لون كامل مع عناية بالشعر","price":"150"},{"name":"مانيكير وبديكير","description":"عناية كاملة بالأظافر مع طلاء","price":"120"},{"name":"تنظيف بشرة","description":"جلسة تنظيف عميق للبشرة","price":"200"}]',
  NULL,
  '{"type":"weekdays","saturday":{"open":"10:00","close":"21:00"},"sunday":{"open":"10:00","close":"21:00"},"monday":{"open":"10:00","close":"21:00"},"tuesday":{"open":"10:00","close":"21:00"},"wednesday":{"open":"10:00","close":"21:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"16:00","close":"22:00"}}',
  '{"tone":"professional","language":"ar","welcomeMessage":"أهلاً بك! ✨ يسعدنا خدمتك. تقدر تحجز موعد أو تسأل عن خدماتنا وأسعارنا. نسعد بخدمتك!"}',
  'قالب مخصص لصالونات التجميل والعناية. يتضمن خدمات شائعة مع أسعار وساعات عمل مناسبة.',
  'صالونات تجميل، عيادات جلدية، مراكز عناية، سبا',
  1, 0, 'ar'
);

-- Template 4: عيادة طبية (Medical Clinic)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'services',
  'عيادة طبية',
  '🏥',
  '[{"name":"كشف طبي عام","description":"فحص شامل مع الطبيب المختص","price":"200"},{"name":"استشارة عن بعد","description":"استشارة طبية عبر مكالمة فيديو","price":"150"},{"name":"أشعة وتحاليل","description":"فحوصات مخبرية وأشعة تشخيصية","price":"300"},{"name":"متابعة حالة","description":"زيارة متابعة للمرضى الحاليين","price":"100"}]',
  NULL,
  '{"type":"weekdays","saturday":{"open":"08:00","close":"20:00"},"sunday":{"open":"08:00","close":"20:00"},"monday":{"open":"08:00","close":"20:00"},"tuesday":{"open":"08:00","close":"20:00"},"wednesday":{"open":"08:00","close":"20:00"},"thursday":{"open":"08:00","close":"16:00"},"friday":{"open":"closed","close":"closed"}}',
  '{"tone":"professional","language":"ar","welcomeMessage":"مرحباً بك! 🏥 أهلاً في عيادتنا. كيف أقدر أساعدك؟ تقدر تحجز موعد، تسأل عن الخدمات، أو تستفسر عن أي شيء."}',
  'قالب مهني للعيادات والمراكز الطبية. يتضمن خدمات طبية شائعة مع رسائل احترافية.',
  'عيادات طبية، أسنان، عيون، مراكز صحية',
  1, 0, 'ar'
);

-- Template 5: متجر إلكترونيات (Electronics Store)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'store',
  'متجر إلكترونيات',
  '📱',
  NULL,
  '[{"name":"سماعة بلوتوث","description":"سماعة لاسلكية بجودة صوت عالية","price":"199"},{"name":"شاحن سريع","description":"شاحن 65 واط يدعم الشحن السريع","price":"89"},{"name":"كفر جوال","description":"كفر حماية مقاوم للصدمات","price":"49"},{"name":"ساعة ذكية","description":"ساعة ذكية تدعم قياس النبض والرياضة","price":"599"}]',
  '{"type":"24_7"}',
  '{"tone":"friendly","language":"ar","welcomeMessage":"أهلاً! 📱 مرحباً في متجرنا للإلكترونيات. أقدر أساعدك تلقى المنتج المناسب لك. شنو تدور عليه؟"}',
  'قالب لمتاجر الإلكترونيات والأجهزة الذكية. يتضمن منتجات تقنية شائعة مع متجر يعمل 24/7.',
  'متاجر إلكترونيات، جوالات، إكسسوارات تقنية، كمبيوترات',
  1, 0, 'ar'
);

-- Template 6: مكتب استشارات (Consulting Office)
INSERT INTO business_templates (business_type, template_name, icon, services, products, working_hours, bot_personality, description, suitable_for, is_active, usage_count, default_language)
VALUES (
  'services',
  'مكتب استشارات',
  '💼',
  '[{"name":"استشارة أولية","description":"جلسة تعارف ودراسة الحالة","price":"300"},{"name":"استشارة قانونية","description":"استشارة متخصصة في المسائل القانونية","price":"500"},{"name":"دراسة جدوى","description":"إعداد دراسة جدوى اقتصادية شاملة","price":"3000"},{"name":"استشارة مالية","description":"تخطيط مالي وإدارة الميزانية","price":"400"}]',
  NULL,
  '{"type":"weekdays","saturday":{"open":"09:00","close":"17:00"},"sunday":{"open":"09:00","close":"17:00"},"monday":{"open":"09:00","close":"17:00"},"tuesday":{"open":"09:00","close":"17:00"},"wednesday":{"open":"09:00","close":"17:00"},"thursday":{"open":"09:00","close":"14:00"},"friday":{"open":"closed","close":"closed"}}',
  '{"tone":"professional","language":"ar","welcomeMessage":"مرحباً بك! 💼 أهلاً في مكتبنا للاستشارات. كيف أقدر أخدمك؟ يمكنك حجز استشارة أو الاستفسار عن خدماتنا."}',
  'قالب احترافي لمكاتب الاستشارات والخدمات المهنية.',
  'مكاتب استشارات، محاماة، محاسبة، تسويق',
  1, 0, 'ar'
);

-- =============================================
-- Template Translations (Arabic + English)
-- =============================================

-- Get the IDs of the inserted templates (assuming auto-increment starts from 1)
-- Template 1: متجر ملابس
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'متجر ملابس', 'قالب جاهز لمتاجر الملابس والأزياء. يتضمن منتجات نموذجية.', 'متاجر الملابس، الأزياء، العبايات'
FROM business_templates WHERE template_name = 'متجر ملابس' LIMIT 1;

INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Clothing Store', 'Ready-made template for clothing and fashion stores. Includes sample products.', 'Clothing stores, fashion, abayas, shoes, accessories'
FROM business_templates WHERE template_name = 'متجر ملابس' LIMIT 1;

-- Template 2: مطعم
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'مطعم', 'قالب مثالي للمطاعم والكافيهات مع قائمة طعام نموذجية.', 'مطاعم، كافيهات، محلات حلويات'
FROM business_templates WHERE template_name = 'مطعم' LIMIT 1;

INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Restaurant', 'Ideal template for restaurants and cafes with a sample menu.', 'Restaurants, cafés, dessert shops, bakeries'
FROM business_templates WHERE template_name = 'مطعم' LIMIT 1;

-- Template 3: صالون تجميل
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'صالون تجميل', 'قالب مخصص لصالونات التجميل والعناية مع خدمات شائعة.', 'صالونات تجميل، سبا، مراكز عناية'
FROM business_templates WHERE template_name = 'صالون تجميل' LIMIT 1;

INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Beauty Salon', 'Custom template for beauty salons and care centers with popular services.', 'Beauty salons, spas, care centers'
FROM business_templates WHERE template_name = 'صالون تجميل' LIMIT 1;

-- Template 4: عيادة طبية
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'عيادة طبية', 'قالب مهني للعيادات والمراكز الطبية.', 'عيادات طبية، أسنان، عيون'
FROM business_templates WHERE template_name = 'عيادة طبية' LIMIT 1;

INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Medical Clinic', 'Professional template for medical clinics and health centers.', 'Medical clinics, dental, ophthalmology, health centers'
FROM business_templates WHERE template_name = 'عيادة طبية' LIMIT 1;

-- Template 5: متجر إلكترونيات
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'متجر إلكترونيات', 'قالب لمتاجر الإلكترونيات والأجهزة الذكية.', 'متاجر إلكترونيات، جوالات'
FROM business_templates WHERE template_name = 'متجر إلكترونيات' LIMIT 1;

INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Electronics Store', 'Template for electronics and smart device stores.', 'Electronics stores, phones, tech accessories'
FROM business_templates WHERE template_name = 'متجر إلكترونيات' LIMIT 1;

-- Template 6: مكتب استشارات
INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'ar', 'مكتب استشارات', 'قالب احترافي لمكاتب الاستشارات والخدمات المهنية.', 'مكاتب استشارات، محاماة'
FROM business_templates WHERE template_name = 'مكتب استشارات' LIMIT 1;

INSERT INTO template_translations (template_id, language, template_name, description, suitable_for)
SELECT id, 'en', 'Consulting Office', 'Professional template for consulting and professional services offices.', 'Consulting offices, law firms, accounting'
FROM business_templates WHERE template_name = 'مكتب استشارات' LIMIT 1;

SELECT 'Templates seeded successfully!' AS result;
