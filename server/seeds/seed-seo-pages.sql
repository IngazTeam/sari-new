-- =============================================
-- Seed SEO Pages for Sari Platform
-- This populates the admin SEO dashboard with all public pages
-- =============================================

INSERT INTO seo_pages (page_slug, page_title, page_description, keywords, canonical_url, is_indexed, is_priority, change_frequency, priority, created_at) VALUES

-- الصفحات الرئيسية
('/', 'ساري - وكيل مبيعات ذكي بالذكاء الاصطناعي للواتساب | Sari AI', 'ساري منصة ذكاء اصطناعي تُدير مبيعاتك عبر واتساب تلقائياً. رد ذكي، طلبات تلقائية، سلات متروكة، تتبع شحنات، وتقارير متقدمة.', 'واتساب بوت, ذكاء اصطناعي, أتمتة مبيعات, شات بوت واتساب, WhatsApp AI', 'https://sary.live/', 1, 1, 'daily', '1.0', NOW()),

('/pricing', 'الأسعار والباقات | ساري', 'اختر الباقة المناسبة لمتجرك. باقات مرنة تبدأ من المجاني حتى المتقدم. أتمتة مبيعات واتساب بأسعار تنافسية.', 'أسعار ساري, باقات واتساب, اشتراك شات بوت', 'https://sary.live/pricing', 1, 1, 'weekly', '0.9', NOW()),

('/support', 'الدعم الفني | ساري', 'فريق دعم ساري جاهز لمساعدتك. تواصل معنا عبر الواتساب أو البريد الإلكتروني.', 'دعم فني ساري, مساعدة, تواصل', 'https://sary.live/support', 1, 0, 'monthly', '0.5', NOW()),

('/try-sari', 'جرب ساري مجاناً | تجربة وكيل المبيعات الذكي', 'جرب وكيل مبيعات ساري الذكي مباشرة. شاهد كيف يتعامل مع العملاء ويعالج الطلبات.', 'تجربة ساري, تجربة مجانية, شات بوت مجاني', 'https://sary.live/try-sari', 1, 1, 'weekly', '0.9', NOW()),

-- صفحات الحلول
('/solutions/sales', 'حلول المبيعات | ساري - أتمتة مبيعات واتساب', 'حوّل واتساب إلى قناة مبيعات قوية. رد تلقائي ذكي، طلبات فورية، وتوصيات منتجات.', 'مبيعات واتساب, أتمتة مبيعات, بوت مبيعات', 'https://sary.live/solutions/sales', 1, 1, 'weekly', '0.8', NOW()),

('/solutions/marketing', 'حلول التسويق | ساري - تسويق واتساب ذكي', 'أطلق حملات تسويقية ذكية عبر واتساب. رسائل مخصصة وحملات مجدولة.', 'تسويق واتساب, حملات واتساب, رسائل تسويقية', 'https://sary.live/solutions/marketing', 1, 1, 'weekly', '0.8', NOW()),

('/solutions/support', 'حلول الدعم | ساري - دعم عملاء واتساب 24/7', 'وفر دعم عملاء على مدار الساعة عبر واتساب بدون تدخل بشري.', 'دعم عملاء واتساب, خدمة عملاء ذكية, بوت دعم فني', 'https://sary.live/solutions/support', 1, 1, 'weekly', '0.8', NOW()),

-- صفحات المنتجات
('/product/ai-agent', 'الذكاء الاصطناعي للمبيعات | ساري', 'وكيل ذكاء اصطناعي متقدم يتحدث باللهجة السعودية ويحول المحادثات إلى مبيعات.', 'ذكاء اصطناعي, وكيل مبيعات ذكي, مساعد ذكي', 'https://sary.live/product/ai-agent', 1, 1, 'weekly', '0.8', NOW()),

('/product/chatbot', 'روبوت دردشة ذكي للواتساب | ساري', 'أتمت محادثات العملاء بالكامل مع روبوت ساري الذكي.', 'شات بوت واتساب, روبوت دردشة, أتمتة واتساب', 'https://sary.live/product/chatbot', 1, 1, 'weekly', '0.8', NOW()),

('/product/whatsapp', 'ربط وتكامل واتساب بزنس | ساري', 'اربط واتسابك بساري في دقائق بتكامل سلس ومزامنة فورية.', 'ربط واتساب, تكامل سلة واتساب, تكامل زد واتساب', 'https://sary.live/product/whatsapp', 1, 0, 'weekly', '0.7', NOW()),

('/product/broadcasts', 'رسائل البث الجماعي للواتساب | ساري', 'أرسل حملاتك التسويقية لآلاف العملاء في ثوانٍ.', 'بث جماعي واتساب, حملات واتساب, رسائل ترويجية', 'https://sary.live/product/broadcasts', 1, 0, 'weekly', '0.7', NOW()),

-- ========== صفحات Landing الرئيسية ==========
('/ai-whatsapp-sales-agent', 'موظف مبيعات واتساب بالذكاء الاصطناعي | ساري AI', 'ساري موظف مبيعات ذكي يعمل على واتساب 24/7. يرد على العملاء، يعالج الطلبات، يستعيد السلات المتروكة.', 'موظف مبيعات واتساب, ذكاء اصطناعي واتساب, AI WhatsApp sales agent, بوت مبيعات', 'https://sary.live/ai-whatsapp-sales-agent', 1, 1, 'weekly', '0.9', NOW()),

('/whatsapp-ordering-system', 'نظام طلبات واتساب آلي | ساري', 'نظام طلبات واتساب ذكي يستقبل ويعالج طلبات عملائك تلقائياً. ربط مع سلة وزد.', 'نظام طلبات واتساب, طلبات واتساب آلي, WhatsApp ordering', 'https://sary.live/whatsapp-ordering-system', 1, 1, 'weekly', '0.9', NOW()),

('/whatsapp-booking-system', 'نظام حجوزات واتساب ذكي | ساري', 'إدارة حجوزات عملائك عبر واتساب بالذكاء الاصطناعي. حجز تلقائي، تذكيرات، وتأكيدات.', 'حجز واتساب, نظام حجوزات, WhatsApp booking', 'https://sary.live/whatsapp-booking-system', 1, 1, 'weekly', '0.9', NOW()),

('/ai-customer-service-whatsapp', 'خدمة عملاء ذكية بالواتساب | ساري AI', 'خدمة عملاء بالذكاء الاصطناعي عبر واتساب. إجابات فورية وتحويل للموظف عند الحاجة.', 'خدمة عملاء واتساب, AI customer service, دعم فني واتساب', 'https://sary.live/ai-customer-service-whatsapp', 1, 1, 'weekly', '0.9', NOW()),

('/conversational-commerce-platform', 'تجارة محادثات واتساب | ساري', 'حوّل محادثات واتساب إلى عمليات بيع مع ساري AI.', 'تجارة محادثات, conversational commerce, بيع واتساب', 'https://sary.live/conversational-commerce-platform', 1, 1, 'weekly', '0.9', NOW()),

-- ========== صفحات الصناعات ==========
('/solutions/clinics', 'واتساب للعيادات والمراكز الطبية | ساري AI', 'حل متكامل لإدارة عيادتك عبر واتساب. حجز مواعيد تلقائي وتذكير بالمواعيد.', 'واتساب عيادات, حجز مواعيد طبية, WhatsApp clinics', 'https://sary.live/solutions/clinics', 1, 1, 'weekly', '0.8', NOW()),

('/solutions/restaurants', 'واتساب للمطاعم - طلبات تلقائية | ساري AI', 'نظام طلبات مطاعم ذكي عبر واتساب. استقبال الطلبات وتتبع التوصيل تلقائياً.', 'واتساب مطاعم, طلبات مطاعم واتساب, WhatsApp restaurant', 'https://sary.live/solutions/restaurants', 1, 1, 'weekly', '0.8', NOW()),

('/solutions/salons', 'واتساب لصالونات التجميل | ساري AI', 'أتمتة حجوزات صالون التجميل عبر واتساب. حجز مواعيد وعروض خاصة.', 'واتساب صالونات, حجز صالون واتساب, WhatsApp salon', 'https://sary.live/solutions/salons', 1, 1, 'weekly', '0.8', NOW()),

('/solutions/training-centers', 'واتساب لمراكز التدريب | ساري AI', 'إدارة مركز التدريب عبر واتساب. تسجيل المتدربين وجدولة الدورات تلقائياً.', 'واتساب مراكز تدريب, تسجيل دورات واتساب', 'https://sary.live/solutions/training-centers', 1, 1, 'weekly', '0.8', NOW()),

('/solutions/real-estate', 'واتساب للعقارات | ساري AI', 'عرض العقارات وإدارة الاستفسارات عبر واتساب بالذكاء الاصطناعي.', 'واتساب عقارات, بوت عقاري, WhatsApp real estate', 'https://sary.live/solutions/real-estate', 1, 1, 'weekly', '0.8', NOW()),

('/solutions/consultants', 'واتساب للاستشاريين والمحامين | ساري AI', 'إدارة مواعيد الاستشارات عبر واتساب. حجز جلسات ودفع إلكتروني.', 'واتساب استشاريين, حجز استشارات واتساب', 'https://sary.live/solutions/consultants', 1, 1, 'weekly', '0.8', NOW()),

-- ========== صفحات المعرفة ==========
('/docs/how-sari-works', 'كيف يعمل ساري - الدليل الكامل', 'تعرّف على كيفية عمل ساري AI خطوة بخطوة. من الربط بالواتساب إلى أتمتة المبيعات.', 'كيف يعمل ساري, دليل ساري, شرح ساري', 'https://sary.live/docs/how-sari-works', 1, 0, 'monthly', '0.7', NOW()),

('/docs/whatsapp-payment-guide', 'دليل الدفع عبر واتساب | ساري', 'دليل شامل لقبول المدفوعات عبر واتساب. ربط بوابات الدفع وإرسال روابط دفع تلقائية.', 'دفع واتساب, مدفوعات واتساب, WhatsApp payment', 'https://sary.live/docs/whatsapp-payment-guide', 1, 0, 'monthly', '0.7', NOW()),

('/docs/ai-sales-guide', 'دليل مبيعات الذكاء الاصطناعي | ساري', 'دليل استراتيجي لاستخدام الذكاء الاصطناعي في تعزيز المبيعات.', 'مبيعات ذكاء اصطناعي, AI sales guide', 'https://sary.live/docs/ai-sales-guide', 1, 0, 'monthly', '0.7', NOW()),

-- ========== صفحات الشركة ==========
('/company/about', 'عن ساري | قصتنا ورؤيتنا', 'تعرف على ساري — المنصة السعودية لأتمتة المبيعات عبر واتساب.', 'عن ساري, فريق ساري', 'https://sary.live/company/about', 1, 0, 'monthly', '0.5', NOW()),

('/company/contact', 'اتصل بنا | ساري', 'تواصل مع فريق ساري للاستفسارات والدعم الفني.', 'اتصل بساري, دعم فني, تواصل', 'https://sary.live/company/contact', 1, 0, 'monthly', '0.5', NOW()),

('/company/terms', 'الشروط والأحكام | ساري', 'الشروط والأحكام الخاصة باستخدام منصة ساري.', NULL, 'https://sary.live/company/terms', 1, 0, 'yearly', '0.3', NOW()),

('/company/privacy', 'سياسة الخصوصية | ساري', 'سياسة الخصوصية وحماية بيانات المستخدمين في منصة ساري.', NULL, 'https://sary.live/company/privacy', 1, 0, 'yearly', '0.3', NOW()),

-- ========== الموارد ==========
('/resources/blog', 'المدونة | ساري - نصائح المبيعات والتسويق', 'أحدث المقالات والنصائح حول أتمتة المبيعات والتسويق عبر واتساب.', 'مدونة ساري, نصائح مبيعات, تسويق واتساب', 'https://sary.live/resources/blog', 1, 0, 'daily', '0.7', NOW()),

('/resources/help-center', 'مركز المساعدة | ساري', 'دليلك الشامل لاستخدام ساري وأتمتة مبيعاتك بنجاح.', 'مركز مساعدة, دليل استخدام, شرح ساري', 'https://sary.live/resources/help-center', 1, 0, 'weekly', '0.6', NOW()),

('/resources/success-stories', 'قصص النجاح | ساري', 'اكتشف كيف ساعدت ساري مئات المتاجر في مضاعفة مبيعاتهم.', 'قصص نجاح, تجارب عملاء, شهادات', 'https://sary.live/resources/success-stories', 1, 0, 'weekly', '0.6', NOW())

ON DUPLICATE KEY UPDATE page_title = VALUES(page_title), page_description = VALUES(page_description);
