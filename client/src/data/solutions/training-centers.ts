import { 
  GraduationCap, 
  BookOpen, 
  CreditCard, 
  Users, 
  Calendar,
  CheckCircle2,
  Video,
  Award,
  Megaphone,
  UserPlus,
  TrendingUp
} from 'lucide-react';
import { SectorData } from './types';

export const trainingCentersData: SectorData = {
  id: 'training-centers',
  slug: 'training-centers',
  title: 'مراكز التدريب والأكاديميات',
  description: 'إدارة تسجيل المتدربين، تذكيرات حصص الزووم، وإرسال الشهادات عبر واتساب.',
  icon: GraduationCap,
  themeColor: 'blue-600',
  services: [
    {
      id: 'course-registration',
      slug: 'course-registration',
      title: 'تسجيل الدورات',
      metaDescription: 'استقبل استفسارات المتدربين عن الدورات التدريبية وأتمت عملية التسجيل والدفع عبر واتساب.',
      heroTitle: 'تسجيل الدورات عبر واتساب',
      heroDescription: 'حوّل استفسارات المتدربين إلى تسجيلات مؤكدة فوراً. ساري يعرض تفاصيل الدورة، المقاعد المتاحة، ويزود المتدرب برابط الدفع الآمن.',
      heroBadge: 'الأكثر طلباً للتدريب',
      problemTitle: 'الاستفسارات الكثيرة تعطل عملية التسجيل',
      problemDescription: 'المتدربون يسألون مراراً عن أسعار الدورات، أوقاتها، والشهادات المعتمدة. التأخر في الرد يفقدهم الحماس ويقلل من نسبة التسجيل.',
      howItWorks: [
        {
          title: 'عرض تفاصيل الدورة',
          description: 'يجيب ساري عن محاور الدورة، اسم المدرب، المدة، والتكلفة.',
          icon: BookOpen
        },
        {
          title: 'معرفة المقاعد المتاحة',
          description: 'توضيح عدد المقاعد المتبقية لخلق شعور بالندرة.',
          icon: Users
        },
        {
          title: 'الدفع والتسجيل الفوري',
          description: 'إرسال رابط التسجيل والدفع المباشر لإنهاء العملية داخل واتساب.',
          icon: CreditCard
        }
      ],
      chatScenarios: [
        {
          id: 'registration-scenario',
          title: 'استفسار وتسجيل',
          description: 'كيف يكمل ساري عملية تسجيل متدرب',
          messages: [
            { role: 'user', content: 'تفاصيل دورة إدارة المشاريع PMP متى تبدأ؟' },
            { role: 'bot', content: 'دورة PMP القادمة تبدأ يوم الأحد القادم. مدتها 5 أيام (35 ساعة معتمدة) مع المدرب م. أحمد. متبقي 3 مقاعد فقط. هل تريدين معرفة السعر؟' },
            { role: 'user', content: 'نعم كم سعرها؟' },
            { role: 'bot', content: 'سعر الدورة 1200 ريال شاملة رسوم الشهادة. لتأكيد حجز مقعدك والتسجيل الآن، اضغطي على الرابط التالي:', isAction: true },
            { role: 'bot', content: '💳 رابط الدفع والتسجيل' }
          ]
        }
      ],
      objections: [
        {
          objection: 'كيف يثق المتدرب بدفع مبالغ كبيرة عبر الواتساب؟',
          response: 'ساري يستخدم روابط دفع رسمية وآمنة عبر بوابات معتمدة، ويظهر للمتدرب رسالة تأكيد رسمية وفاتورة إلكترونية بعد الدفع.',
          icon: CheckCircle2
        }
      ],
      faqs: [
        {
          question: 'هل يمكن ربط ساري بمنصة إدارة التعلم (LMS) الخاصة بنا؟',
          answer: 'نعم، إذا كانت منصتكم (مثل بياَن أو غيرها) تدعم الـ API، يمكن إضافة المتدرب للمنصة فوراً بعد الدفع.'
        }
      ]
    },
    {
      id: 'class-reminders-certificates',
      slug: 'class-reminders-certificates',
      title: 'الحصص والشهادات',
      metaDescription: 'تذكير المتدربين بحصص Zoom وإرسال الشهادات فور اجتياز الدورة عبر واتساب.',
      heroTitle: 'تذكيرات الحصص وإرسال الشهادات',
      heroDescription: 'ارفع نسب حضور المتدربين بإرسال تنبيهات تلقائية قبل بدء حصص البث المباشر (Zoom). وأسعدهم بإرسال الشهادة كملف PDF على واتساب فور تخرجهم.',
      problemTitle: 'نسيان الحصص وتأخر تسليم الشهادات',
      problemDescription: 'التنبيه عبر الإيميل غالباً لا يصل في الوقت المناسب، وتأخير إصدار وتسليم الشهادات يزعج المتدربين ويزيد من تواصلهم لطلبها.',
      howItWorks: [
        {
          title: 'تنبيه قبل الحصة',
          description: 'رسالة تلقائية برابط Zoom قبل بدء البث المباشر بوقت محدد.',
          icon: Video
        },
        {
          title: 'تسليم الشهادات',
          description: 'إرسال رابط أو ملف الشهادة للمتدرب بمجرد استيفاء الشروط.',
          icon: Award
        },
        {
          title: 'جدولة الحصص',
          description: 'إرسال جدول الدورة الأسبوعي بشكل واضح.',
          icon: Calendar
        }
      ],
      chatScenarios: [
        {
          id: 'reminder-scenario',
          title: 'تنبيه حصة واستلام شهادة',
          description: 'كيف يتابع ساري المتدربين أثناء وبعد الدورة',
          messages: [
            { role: 'bot', content: 'مرحباً عبدالله، نذكرك بأن اليوم الأول لدورة PMP سيبدأ بعد ساعة (5:00 م). يمكنك الدخول للبث المباشر عبر الرابط:', isAction: true },
            { role: 'bot', content: '🎥 رابط الزووم' },
            { role: 'bot', content: '--- بعد نهاية الدورة ---', isAction: true },
            { role: 'bot', content: 'ألف مبروك اجتيازك دورة PMP بنجاح! 🎉 تفضل بتحميل شهادتك المعتمدة:', isAction: true },
            { role: 'bot', content: '📄 شهادة_عبدالله.pdf (مرفق)' }
          ]
        }
      ],
      objections: [
        {
          objection: 'بعض المتدربين يحضرون الحصة الأولى فقط وينسحبون.',
          response: 'التذكيرات المستمرة والآلية عبر الواتساب تحافظ على تفاعل المتدربين وتقلل نسبة الانسحاب (Drop-off rate).',
          icon: TrendingUp
        }
      ],
      faqs: [
        {
          question: 'كيف يتأكد البوت من أهلية المتدرب لاستلام الشهادة؟',
          answer: 'يتم ذلك عبر ربط البوت بنظامك الداخلي للتحقق من درجات الحضور واجتياز الاختبار قبل إرسال الشهادة.'
        }
      ]
    },
    {
      id: 'course-marketing',
      slug: 'course-marketing',
      title: 'تسويق الدورات',
      metaDescription: 'استخدم واتساب لإطلاق حملات تسويقية للدورات الجديدة ومتابعة المهتمين لزيادة المبيعات.',
      heroTitle: 'تسويق الدورات عبر واتساب',
      heroDescription: 'الواتساب هو أقوى قناة تسويقية. أعلن عن دوراتك الجديدة للمتدربين السابقين، وتابع قوائم الانتظار (Leads) بعروض تسويقية ذكية لزيادة معدل التحويل.',
      problemTitle: 'الاستفسارات التي لا تتحول إلى تسجيلات',
      problemDescription: 'الكثير يسأل عن الدورة ثم يختفي. إهمال متابعة هؤلاء (Follow-up) يعني خسارة مبيعات محققة.',
      howItWorks: [
        {
          title: 'إعلانات الدورات الجديدة',
          description: 'إرسال حملات إعلانية (Broadcast) للمتدربين السابقين عن دورات متقدمة.',
          icon: Megaphone
        },
        {
          title: 'متابعة المهتمين',
          description: 'رسائل متابعة تلقائية لمن سأل عن دورة ولم يكمل التسجيل.',
          icon: UserPlus
        },
        {
          title: 'عروض الخصم المبكر',
          description: 'توزيع أكواد التسجيل المبكر (Early Bird) لزيادة المبيعات الفورية.',
          icon: TrendingUp
        }
      ],
      chatScenarios: [
        {
          id: 'marketing-scenario',
          title: 'متابعة متدرب مهتم',
          description: 'كيف يتابع ساري متدرباً لم يسجل بعد',
          messages: [
            { role: 'bot', content: 'أهلاً عبدالله، لاحظنا اهتمامك بدورة "تحليل البيانات" الأسبوع الماضي. متبقي مقعدين فقط! 🚀 كهدية لك، هذا كود خصم 10% صالح لليوم فقط: DATA10. هل حاب تسجل؟' },
            { role: 'user', content: 'شكراً لكم، الكود ممتاز بسجل الآن.' },
            { role: 'bot', content: 'يسعدنا انضمامك! يمكنك استخدام الكود في صفحة الدفع عبر الرابط:', isAction: true },
            { role: 'bot', content: '🔗 رابط الدفع' }
          ]
        }
      ],
      objections: [
        {
          objection: 'هل إرسال الإعلانات يعرض رقمنا للحظر؟',
          response: 'ساري يوفر أدوات لإرسال الرسائل تدريجياً وبطريقة آمنة لتجنب الحظر، وننصح دائماً باستخدام قوالب معتمدة إذا كنت تستخدم WhatsApp API الرسمي.',
          icon: CheckCircle2
        }
      ],
      faqs: [
        {
          question: 'هل يمكنني إرسال رسائل لفئة محددة فقط (Segments)؟',
          answer: 'نعم، يمكنك استهداف قوائم محددة مثل "من سأل عن دورات البرمجة" لضمان وصول الإعلان للجمهور الصحيح.'
        }
      ]
    }
  ]
};
