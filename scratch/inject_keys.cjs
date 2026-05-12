const fs = require('fs');
const path = require('path');

const arPath = path.join(__dirname, '../client/src/locales/ar.json');
const enPath = path.join(__dirname, '../client/src/locales/en.json');

const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

const newKeysAr = {
  productChatbot: {
    hero: {
      badge: "روبوت الدردشة",
      title: "روبوت دردشة ذكي يعمل على مدار الساعة",
      description: "ليس مجرد ردود آلية جامدة — روبوت ساري يفهم عملائك، يتحدث بلهجتهم، ويقودهم نحو الشراء خطوة بخطوة 24/7.",
      ctaPrimary: "ابدأ أتمتة محادثاتك",
      ctaSecondary: "عرض الأسعار"
    },
    demo: {
      title: "ذكاء اصطناعي يفهم السياق والنية",
      description: "انسَ الردود الجاهزة (اضغط 1 للمبيعات). ساري يفهم اللغة الطبيعية، الأخطاء الإملائية، وتفاصيل الطلبات بدقة متناهية.",
      f1: { title: "فهم اللهجات المحلية", desc: "مدرب على فهم اللهجات السعودية والخليجية والمصطلحات الدارجة." },
      f2: { title: "توصيات ذكية", desc: "يفهم ما يبحث عنه العميل ويقترح المنتجات المناسبة من متجرك." },
      f3: { title: "إتمام الطلب", desc: "يأخذ بيانات العميل، عنوانه، ويؤكد الطلب مباشرة عبر الواتساب." },
      chat: {
        m1: "هلا، عندكم عبايات شتوية لون كحلي مقاس 54؟ وبكم التوصيل للرياض؟",
        m2: "يا هلا فيك! 🌟 إي نعم متوفر عندنا مجموعة عبايات شتوية كحلي مقاس 54.\n\nالتوصيل للرياض بـ 25 ريال وياخذ 1-2 أيام عمل.\n\nهذي أحدث تشكيلة شتوية متوفرة بمقاسك:\n1. عباية جوخ كحلي سادة (299 ريال)\n2. عباية مخمل كحلي بتطريز خفيف (349 ريال)\n\nتبين أرسل لك صورهم؟ 📸",
        m3: "اي ارسلي صور المخمل",
        m4: "أبشري، هذي صور عباية المخمل الكحلي ✨<br/><br/>[صورة العباية]<br/><br/>خامتها جداً فخمة ودافية للشتاء. إذا حابة تطلبينها الحين أقدر أرفع لك الطلب، أحتاج بس اسمك ورقم الجوال الحي 📍"
      }
    },
    features: {
      title: "أكثر من مجرد شات بوت",
      subtitle: "مزايا تجعل روبوت ساري الخيار الأول لمتاجرك",
      items: {
        f1: { title: "رد فوري 24/7", desc: "عملائك لا ينامون، ومتجرك أيضاً. ساري يرد في ثوانٍ حتى في أوقات الذروة." },
        f2: { title: "تدخل بشري سلس", desc: "إذا احتاج العميل مساعدة معقدة، يحول ساري المحادثة لفريقك بسلاسة تامة." },
        f3: { title: "حماية الخصوصية", desc: "تشفير كامل للمحادثات وحماية تامة لبيانات عملائك متوافقة مع أحدث المعايير." },
        f4: { title: "تقارير وتحليلات", desc: "اعرف أكثر الأسئلة شيوعاً، أوقات الذروة، ومعدل رضا العملاء عن الردود." },
        f5: { title: "تعلم مستمر", desc: "كل محادثة تجعل ساري أذكى. يتعلم من تفاعلات العملاء ويحسن ردوده باستمرار." },
        f6: { title: "تخصيص كامل", desc: "حدد نبرة صوت الروبوت — رسمية، ودية، أو حتى مرحة بما يتناسب مع هويتك." }
      }
    },
    cta: {
      title: "وظّف أفضل موظف مبيعات لديك",
      description: "لا تدع عميلاً ينتظر. أتمت محادثاتك وزد مبيعاتك اليوم مع روبوت ساري الذكي.",
      btnPrimary: "ابدأ تجربتك المجانية",
      btnSecondary: "تحدث مع المبيعات"
    }
  },
  productWhatsApp: {
    hero: {
      badge: "تكامل واتساب",
      title: "اربط واتساب بمتجرك في دقائق",
      description: "تكامل سلس ورسمي مع واتساب أعمال. تحكم في جميع المحادثات، اربط متجرك، وابدأ البيع فوراً دون تعقيدات تقنية.",
      ctaPrimary: "اربط متجرك الآن",
      ctaSecondary: "تواصل معنا"
    },
    steps: {
      title: "3 خطوات بسيطة للانطلاق",
      subtitle: "لا تحتاج مبرمج ولا خبرة تقنية. الربط أسهل مما تتخيل.",
      s1: { title: "1. فعّل رقمك", desc: "اربط رقم واتساب أعمال الخاص بك بساري في ثوانٍ معدودة." },
      s2: { title: "2. اربط متجرك", desc: "سجّل دخول بحسابك في سلة أو زد لسحب منتجاتك تلقائياً." },
      s3: { title: "3. انطلق", desc: "أنت جاهز! ابدأ استقبال الطلبات والردود التلقائية." }
    },
    platforms: {
      title: "تكامل مباشر مع منصتك المفضلة",
      description: "ساري متصل بالكامل مع المنصات الرائدة. يتزامن الكتالوج، المخزون، والأسعار تلقائياً بدون أي تدخل منك.",
      sync: "مزامنة لحظية للمنتجات والطلبات والعملاء"
    },
    features: {
      f1: "ربط رسمي (WhatsApp Cloud API)",
      f2: "اعتماد الحساب (العلامة الخضراء)",
      f3: "تشفير كامل للبيانات (End-to-End)",
      f4: "استقرار وثبات 99.9% في الاتصال"
    },
    cta: {
      title: "جاهز لربط متجرك؟",
      description: "اربط سلة أو زد بواتساب الآن وابدأ استقبال الطلبات مباشرة",
      btnPrimary: "ابدأ تجربتك المجانية"
    }
  },
  productBroadcasts: {
    hero: {
      badge: "البث الجماعي",
      title: "أرسل حملاتك لآلاف العملاء في ثوانٍ",
      description: "بث رسائل واتساب مخصصة لقوائم العملاء — عروض، تحديثات، تذكيرات — مع تخصيص ذكي لكل عميل وتقارير أداء فورية.",
      ctaPrimary: "ابدأ حملتك الأولى",
      ctaSecondary: "عرض الأسعار"
    },
    stats: {
      s1: { label: "معدل الفتح", desc: "أعلى من الإيميل 5x" },
      s2: { label: "معدل الرد", desc: "تفاعل حقيقي مع العملاء" },
      s3: { label: "زيادة المبيعات", desc: "مقارنة بالقنوات التقليدية" },
      s4: { label: "وقت الوصول", desc: "رسائل فورية للجميع" }
    },
    features: {
      title: "حملات ذكية — ليس مجرد رسائل عشوائية",
      subtitle: "أدوات احترافية لتسويق فعّال عبر الواتساب",
      items: {
        f1: { title: "استهداف دقيق", desc: "قسّم عملاءك حسب المدينة، المشتريات، آخر تفاعل، أو أي معيار مخصص. أرسل الرسالة الصح للشخص الصح." },
        f2: { title: "تخصيص ذكي", desc: "خصص كل رسالة باسم العميل، آخر منتج اشتراه، أو عرض خاص فيه. رسائل تبدو شخصية لكل عميل." },
        f3: { title: "وسائط متعددة", desc: "أرسل صور، فيديوهات، ملفات PDF، وأزرار تفاعلية. اجعل حملاتك جذابة وغنية بالمحتوى." },
        f4: { title: "جدولة مسبقة", desc: "جدول حملاتك مسبقاً — حدد اليوم والوقت الأنسب. حملات المناسبات والأعياد جاهزة تلقائياً." },
        f5: { title: "تقارير مفصلة", desc: "تابع أداء كل حملة لحظة بلحظة — معدل الوصول، الفتح، الردود، والتحويلات. اعرف وش نجح ووش لا." },
        f6: { title: "قوائم ذكية", desc: "أنشئ قوائم عملاء ديناميكية تتحدث تلقائياً. عملاء جدد، عملاء غير نشطين، أو أعلى المشترين." }
      }
    },
    useCases: {
      title: "أفكار حملات تزيد مبيعاتك",
      c1: { title: "عروض وتخفيضات", desc: "أرسل عروضك الحصرية مع كود خصم مخصص لكل عميل." },
      c2: { title: "استعادة السلات المتروكة", desc: "ذكّر العملاء بالمنتجات اللي في سلتهم مع حافز للإكمال." },
      c3: { title: "تحديثات الشحن", desc: "أرسل تحديثات الطلب والشحن تلقائياً — رقم التتبع والحالة." },
      c4: { title: "حملات المناسبات", desc: "رمضان، العيد، اليوم الوطني — حملات جاهزة بضغطة زر." },
      c5: { title: "طلب تقييمات", desc: "بعد التوصيل، أرسل طلب تقييم مع رابط مباشر." },
      c6: { title: "برنامج الولاء", desc: "أرسل نقاط المكافآت والعروض الحصرية لأعضاء برنامج الولاء." }
    },
    cta: {
      title: "ابدأ أول حملة بث جماعي",
      description: "وصّل رسالتك لكل عملائك في ثوانٍ مع أعلى معدل فتح في السوق",
      btnPrimary: "ابدأ تجربتك المجانية",
      btnSecondary: "تحدث مع فريقنا"
    }
  }
};

const newKeysEn = {
  productChatbot: {
    hero: {
      badge: "Chatbot",
      title: "A Smart Chatbot Working Around the Clock",
      description: "Not just rigid automated replies—Sari understands your customers, speaks their dialect, and guides them towards a purchase step-by-step 24/7.",
      ctaPrimary: "Start Automating Conversations",
      ctaSecondary: "View Pricing"
    },
    demo: {
      title: "AI that Understands Context and Intent",
      description: "Forget rigid menus (Press 1 for Sales). Sari understands natural language, typos, and order details with high accuracy.",
      f1: { title: "Understands Local Dialects", desc: "Trained on Saudi and Gulf dialects as well as common slang." },
      f2: { title: "Smart Recommendations", desc: "Understands what the customer wants and suggests suitable products from your store." },
      f3: { title: "Order Completion", desc: "Takes customer details, address, and confirms the order directly via WhatsApp." },
      chat: {
        m1: "Hello, do you have navy winter abayas in size 54? And how much is delivery to Riyadh?",
        m2: "Hello! 🌟 Yes, we have a collection of navy winter abayas in size 54.\n\nDelivery to Riyadh is 25 SAR and takes 1-2 business days.\n\nHere's our latest winter collection in your size:\n1. Plain Navy Wool Abaya (299 SAR)\n2. Navy Velvet Abaya with light embroidery (349 SAR)\n\nWould you like me to send pictures? 📸",
        m3: "Yes, send the velvet pictures",
        m4: "Sure, here are pictures of the Navy Velvet Abaya ✨<br/><br/>[Abaya Image]<br/><br/>The material is very luxurious and warm for winter. If you'd like to order now, I can process it for you. I just need your name and location 📍"
      }
    },
    features: {
      title: "More Than Just a Chatbot",
      subtitle: "Features that make Sari the #1 choice for stores",
      items: {
        f1: { title: "Instant Reply 24/7", desc: "Your customers don't sleep, and neither does your store. Sari replies in seconds even during peak hours." },
        f2: { title: "Seamless Human Handoff", desc: "If a customer needs complex help, Sari smoothly transfers the chat to your team." },
        f3: { title: "Privacy Protection", desc: "End-to-end encryption for conversations and complete protection of customer data following the latest standards." },
        f4: { title: "Reports & Analytics", desc: "Know the most common questions, peak times, and customer satisfaction rates." },
        f5: { title: "Continuous Learning", desc: "Every conversation makes Sari smarter. It learns from interactions to constantly improve its replies." },
        f6: { title: "Full Customization", desc: "Set the bot's tone—formal, friendly, or even playful to match your brand identity." }
      }
    },
    cta: {
      title: "Hire Your Best Salesperson",
      description: "Don't leave customers waiting. Automate your chats and boost sales today with Sari's smart bot.",
      btnPrimary: "Start Your Free Trial",
      btnSecondary: "Talk to Sales"
    }
  },
  productWhatsApp: {
    hero: {
      badge: "WhatsApp Integration",
      title: "Connect WhatsApp to Your Store in Minutes",
      description: "Seamless, official integration with WhatsApp Business. Control all conversations, connect your store, and start selling instantly without technical complexity.",
      ctaPrimary: "Connect Your Store Now",
      ctaSecondary: "Contact Us"
    },
    steps: {
      title: "3 Simple Steps to Launch",
      subtitle: "No developer or technical experience needed. Connecting is easier than you think.",
      s1: { title: "1. Activate Your Number", desc: "Link your WhatsApp Business number to Sari in seconds." },
      s2: { title: "2. Connect Your Store", desc: "Login to your Salla or Zid account to pull your products automatically." },
      s3: { title: "3. Launch", desc: "You're ready! Start receiving orders and automated replies." }
    },
    platforms: {
      title: "Direct Integration with Your Favorite Platform",
      description: "Sari is fully connected with leading platforms. Catalog, inventory, and prices sync automatically with zero manual effort.",
      sync: "Real-time sync for products, orders, and customers"
    },
    features: {
      f1: "Official API Access (WhatsApp Cloud API)",
      f2: "Account Verification (Green Tick)",
      f3: "End-to-End Data Encryption",
      f4: "99.9% Uptime & Stability"
    },
    cta: {
      title: "Ready to Connect Your Store?",
      description: "Link Salla or Zid to WhatsApp now and start receiving orders directly",
      btnPrimary: "Start Your Free Trial"
    }
  },
  productBroadcasts: {
    hero: {
      badge: "Broadcasts",
      title: "Send Campaigns to Thousands in Seconds",
      description: "Broadcast personalized WhatsApp messages to customer lists—offers, updates, reminders—with smart personalization and instant reports.",
      ctaPrimary: "Start Your First Campaign",
      ctaSecondary: "View Pricing"
    },
    stats: {
      s1: { label: "Open Rate", desc: "5x higher than Email" },
      s2: { label: "Reply Rate", desc: "Real engagement with customers" },
      s3: { label: "Sales Increase", desc: "Compared to traditional channels" },
      s4: { label: "Delivery Time", desc: "Instant messages for everyone" }
    },
    features: {
      title: "Smart Campaigns—Not Just Random Messages",
      subtitle: "Professional tools for effective WhatsApp marketing",
      items: {
        f1: { title: "Precise Targeting", desc: "Segment your customers by city, purchases, last interaction, or custom criteria. Send the right message to the right person." },
        f2: { title: "Smart Personalization", desc: "Customize each message with the customer's name, last purchased item, or a special offer. Messages that feel personal." },
        f3: { title: "Rich Media", desc: "Send images, videos, PDFs, and interactive buttons. Make your campaigns engaging and content-rich." },
        f4: { title: "Advance Scheduling", desc: "Schedule campaigns in advance—pick the perfect day and time. Holiday campaigns ready on autopilot." },
        f5: { title: "Detailed Reports", desc: "Track campaign performance in real-time—delivery, open, reply, and conversion rates. Know what works and what doesn't." },
        f6: { title: "Smart Lists", desc: "Create dynamic customer lists that update automatically. New customers, inactive customers, or top buyers." }
      }
    },
    useCases: {
      title: "Campaign Ideas to Boost Sales",
      c1: { title: "Offers & Discounts", desc: "Send exclusive offers with customized discount codes." },
      c2: { title: "Abandoned Cart Recovery", desc: "Remind customers of items left in their cart with an incentive to complete the purchase." },
      c3: { title: "Shipping Updates", desc: "Send automated order and shipping updates—tracking numbers and status." },
      c4: { title: "Holiday Campaigns", desc: "Ramadan, Eid, National Day—ready campaigns with a click of a button." },
      c5: { title: "Review Requests", desc: "Send a direct link asking for a review after delivery." },
      c6: { title: "Loyalty Program", desc: "Send reward points and exclusive offers to loyalty members." }
    },
    cta: {
      title: "Start Your First Broadcast",
      description: "Deliver your message to all customers in seconds with the highest open rate in the market",
      btnPrimary: "Start Your Free Trial",
      btnSecondary: "Talk to Our Team"
    }
  }
};

arData.productChatbot = newKeysAr.productChatbot;
arData.productWhatsApp = newKeysAr.productWhatsApp;
arData.productBroadcasts = newKeysAr.productBroadcasts;

enData.productChatbot = newKeysEn.productChatbot;
enData.productWhatsApp = newKeysEn.productWhatsApp;
enData.productBroadcasts = newKeysEn.productBroadcasts;

fs.writeFileSync(arPath, JSON.stringify(arData, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');

console.log("Keys successfully injected into ar.json and en.json");
