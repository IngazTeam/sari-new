import { 
  Utensils, 
  ShoppingBag, 
  CreditCard, 
  Clock, 
  RotateCcw,
  MessageSquareHeart,
  ShieldCheck,
  CheckCircle2,
  Smartphone
} from 'lucide-react';
import { SectorData } from './types';

export const restaurantsData: SectorData = {
  id: 'restaurants',
  slug: 'restaurants',
  title: 'المطاعم والمقاهي',
  description: 'نظام طلبات ذكي، قائمة طعام رقمية، ودفع إلكتروني داخل واتساب.',
  icon: Utensils,
  themeColor: 'orange-500',
  services: [
    {
      id: 'whatsapp-ordering',
      slug: 'whatsapp-ordering',
      title: 'نظام طلبات واتساب',
      metaDescription: 'استقبل طلبات المطعم عبر واتساب بسهولة مع ساري. يفهم الطلبات، التخصيصات، ويصدر ملخص الطلب.',
      heroTitle: 'نظام طلبات مطاعم عبر واتساب',
      heroDescription: 'حوّل واتساب إلى كاشير آلي يعمل على مدار الساعة. ساري يفهم طلبات عملائك، يضيف التعديلات، ويرسل ملخص الطلب للمطبخ فوراً.',
      heroBadge: 'لزيادة مبيعات المطاعم',
      problemTitle: 'الطلبات اليدوية تضيع الوقت والمال',
      problemDescription: 'أخذ الطلبات عبر الاتصال أو الشات اليدوي يؤدي إلى أخطاء في الطلب، وتأخير في الرد وقت الذروة، مما يزعج العملاء.',
      howItWorks: [
        {
          title: 'فهم ذكي للطلب',
          description: 'يفهم البوت طلبات العميل حتى باللغة العامية المكتوبة أو الصوتية.',
          icon: MessageSquareHeart
        },
        {
          title: 'التخصيص والإضافات',
          description: 'يتعامل مع التعديلات مثل "بدون بصل" أو "زيادة جبن" بدقة.',
          icon: ShoppingBag
        },
        {
          title: 'ملخص الطلب',
          description: 'إصدار ملخص نهائي للطلب للتأكيد قبل التنفيذ.',
          icon: CheckCircle2
        }
      ],
      chatScenarios: [
        {
          id: 'ordering-scenario',
          title: 'استقبال طلب وتخصيص',
          description: 'كيف يتلقى ساري طلب طعام مع تعديلات',
          messages: [
            { role: 'user', content: 'أبغى ٢ شاورما دجاج صاروخ وواحد برجر لحم.' },
            { role: 'bot', content: 'أهلاً بك! تم إضافة ٢ شاورما دجاج صاروخ و١ برجر لحم لطلبك. هل تفضل أي إضافات أو تعديلات على الطلب؟' },
            { role: 'user', content: 'الشاورما بدون مخلل والبرجر كثر صوص.' },
            { role: 'bot', content: 'تم التعديل:\n- ٢ شاورما دجاج صاروخ (بدون مخلل)\n- ١ برجر لحم (زيادة صوص)\nالمجموع: 55 ريال. هل تريد إضافة مشروبات أو تأكيد الطلب؟' },
            { role: 'user', content: 'أكد الطلب استلام من الفرع.' },
            { role: 'bot', content: 'تم تأكيد طلبك (استلام من الفرع). طلبك سيكون جاهزاً خلال 15 دقيقة.' }
          ]
        }
      ],
      objections: [
        {
          objection: 'العملاء يفضلون تطبيقات التوصيل.',
          response: 'الطلب المباشر عبر واتساب يوفر على العميل والمطعم عمولات تطبيقات التوصيل العالية، ويبني ولاءً مباشراً.',
          icon: ShieldCheck
        }
      ],
      faqs: [
        {
          question: 'هل يمكن ربط الطلبات بنظام نقاط البيع (POS)؟',
          answer: 'نعم، يمكن ربط ساري بأنظمة نقاط البيع المدعومة لإرسال الطلبات مباشرة إلى شاشة المطبخ.'
        }
      ]
    },
    {
      id: 'digital-menu-payment',
      slug: 'digital-menu-payment',
      title: 'المنيو والدفع',
      metaDescription: 'عرض المنيو الرقمي واستقبال المدفوعات داخل واتساب للمطاعم.',
      heroTitle: 'قائمة ذكية ودفع إلكتروني داخل المحادثة',
      heroDescription: 'قدم لعملائك تجربة طلب متكاملة دون مغادرة واتساب. عرض قائمة الطعام بالصور، واستقبال الدفع عبر Apple Pay أو مدى فوراً.',
      problemTitle: 'صعوبة الدفع وتصفح المنيو',
      problemDescription: 'إرسال صور المنيو كملفات PDF أو تحويل العميل لمواقع خارجية يقلل من احتمالية إتمام الطلب.',
      howItWorks: [
        {
          title: 'تصفح المنيو التفاعلي',
          description: 'إرسال قائمة الطعام بشكل تفاعلي ومرتب.',
          icon: Smartphone
        },
        {
          title: 'دفع إلكتروني سريع',
          description: 'إرسال روابط دفع آمنة لإتمام العملية في ثوانٍ.',
          icon: CreditCard
        },
        {
          title: 'إصدار الفاتورة',
          description: 'إرسال إيصال الدفع وملخص الطلب للعميل.',
          icon: CheckCircle2
        }
      ],
      chatScenarios: [
        {
          id: 'menu-payment-scenario',
          title: 'استعراض المنيو والدفع',
          description: 'كيف يعرض ساري المنيو ويسهل الدفع',
          messages: [
            { role: 'user', content: 'ممكن المنيو؟' },
            { role: 'bot', content: 'تفضل قائمة طعامنا المميزة 🍔🍕', isAction: true },
            { role: 'bot', content: 'هل هناك صنف محدد تبحث عنه؟' },
            { role: 'user', content: 'أبغى بيتزا بيبيروني حجم وسط.' },
            { role: 'bot', content: 'تم اختيار بيتزا بيبيروني (وسط). السعر: 40 ريال. للدفع وتأكيد الطلب، يرجى الضغط على الرابط:', isAction: true },
            { role: 'bot', content: '💳 رابط الدفع الآمن' }
          ]
        }
      ],
      objections: [
        {
          objection: 'هل روابط الدفع آمنة؟',
          response: 'نعم، روابط الدفع تكون متكاملة مع بوابات دفع معتمدة (مثل Tap) وتدعم مدى و Apple Pay بأعلى معايير الأمان.',
          icon: ShieldCheck
        }
      ],
      faqs: [
        {
          question: 'كيف أحدث أسعار المنيو؟',
          answer: 'يمكنك تحديث الأسعار والأصناف بسهولة من لوحة تحكم ساري، وستنعكس التغييرات فوراً في المحادثات.'
        }
      ]
    },
    {
      id: 'delivery-repeat-orders',
      slug: 'delivery-repeat-orders',
      title: 'التوصيل وإعادة الطلب',
      metaDescription: 'تحديثات حالة الطلب وتسهيل إعادة الطلب السريع لعملاء المطاعم.',
      heroTitle: 'تحديثات التوصيل وإعادة الطلب السريع',
      heroDescription: 'ابقِ عملاءك على اطلاع بحالة طلبهم (قيد التحضير، في الطريق). ووفر لهم زر "نفس طلبي السابق" لطلب أسرع في المرات القادمة.',
      problemTitle: 'كثرة أسئلة "وين الطلب؟"',
      problemDescription: 'العميل يقلق عند تأخر الطلب ويكثر من الاستفسارات، وعدم توفر خيار إعادة الطلب السريع يفوت عليك مبيعات سهلة.',
      howItWorks: [
        {
          title: 'تحديثات الحالة',
          description: 'إرسال تنبيهات آلية عند تغيير حالة الطلب.',
          icon: Clock
        },
        {
          title: 'إعادة الطلب بنقرة',
          description: 'التعرف على العملاء الدائمين واقتراح إعادة طلباتهم المفضلة.',
          icon: RotateCcw
        }
      ],
      chatScenarios: [
        {
          id: 'repeat-order-scenario',
          title: 'تتبع وإعادة طلب',
          description: 'كيف يتابع ساري الطلب ويسهل إعادته',
          messages: [
            { role: 'user', content: 'وين طلبي تأخر؟' },
            { role: 'bot', content: 'عذراً على التأخير. طلبك (رقم 104) خرج مع المندوب وفي الطريق إليك، المتوقع وصوله خلال 10 دقائق.' },
            { role: 'bot', content: '--- بعد عدة أيام ---', isAction: true },
            { role: 'user', content: 'السلام عليكم.' },
            { role: 'bot', content: 'وعليكم السلام! أهلاً بعودتك. هل ترغب في إعادة نفس طلبك السابق (٢ شاورما و ١ برجر) أم تود تصفح المنيو؟' },
            { role: 'user', content: 'نفس الطلب.' },
            { role: 'bot', content: 'تم! جاري تحضير طلبك المعتاد.' }
          ]
        }
      ],
      objections: [
        {
          objection: 'العملاء يغيرون عناوينهم باستمرار.',
          response: 'ساري يؤكد دائماً العنوان المحفوظ في الملف قبل اعتماد طلب التوصيل.',
          icon: ShieldCheck
        }
      ],
      faqs: [
        {
          question: 'هل يمكن تتبع المندوب عبر ساري؟',
          answer: 'يمكن إرسال رابط تتبع للمندوب (Tracking Link) إذا كان نظام التوصيل لديك يدعم ذلك.'
        }
      ]
    }
  ]
};
