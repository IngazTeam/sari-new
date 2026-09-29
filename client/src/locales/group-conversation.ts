export const groupConversationEn = {
  mention: "When mentioned directly",
  mentionHelp:
    "AI reads the group discussion after a native WhatsApp mention of the connected account. Typing a phone number alone does not trigger a reply.",
  topics: "When the discussion relates to your business",
  topicsHelp:
    "AI understands the discussion and whether a participant needs your help. Topic descriptions guide relevance; matching a word does not trigger a reply.",
  private: "Invite the participant to a private chat",
  privateHelp:
    "AI assesses the request and suggests a private chat inside the group when needed. It does not message participants privately on its own.",
  topicsLabel: "Topics your business can help with",
  topicPlaceholder: "For example: choosing a suitable training course",
  addTopic: "Add topic",
  privateNote:
    "The invitation is written from the discussion context. The old automatic private-message template is retained in settings but is not sent.",
  scope:
    "Group replies use enabled catalog items and FAQs. Private customer history, payments, bookings and individual memory stay outside this discussion. Text messages are supported; media is retained without automatic interpretation.",
};
export type GroupConversationCopy = {
  [K in keyof typeof groupConversationEn]: string;
};
export const groupConversationAr: GroupConversationCopy = {
  mention: "عند الإشارة المباشرة للحساب",
  mentionHelp:
    "يقرأ AI نقاش المجموعة بعد إشارة واتساب أصلية للحساب المتصل. كتابة رقم الهاتف وحدها لا تشغّل الرد.",
  topics: "عند ارتباط النقاش بنشاطك",
  topicsHelp:
    "يفهم AI النقاش وحاجة المشارك للمساعدة. أوصاف المواضيع تحدد مجال الاهتمام؛ تطابق كلمة وحده لا يشغّل الرد.",
  private: "دعوة المشارك لبدء محادثة خاصة",
  privateHelp:
    "يحلل AI الطلب ويقترح الانتقال للخاص داخل المجموعة عند الحاجة. لا يراسل المشاركين على الخاص تلقائيًا.",
  topicsLabel: "مواضيع يستطيع نشاطك المساعدة فيها",
  topicPlaceholder: "مثال: اختيار دورة تدريبية مناسبة",
  addTopic: "إضافة موضوع",
  privateNote:
    "تُصاغ الدعوة من سياق النقاش. يبقى نص التحويل التلقائي القديم محفوظًا في الإعدادات لكنه لا يُرسل.",
  scope:
    "تعتمد ردود المجموعة على المنتجات والأسئلة الشائعة المفعّلة. تبقى محادثات العملاء الخاصة والدفع والحجز والذاكرة الفردية خارج النقاش. تُدعم الرسائل النصية؛ تُحفظ الوسائط دون تحليل آلي.",
};
