export const replySuggestionsAr={
  scope:'مسودات مبنية على المحادثة. راجع المعلومات والسعر والتوفر قبل الإرسال.',
  friendly:'ودي',professional:'رسمي',brief:'مختصر',detailed:'تفصيلي',generating:'جارٍ إعداد مسودات الرد…',
  failed:'تعذر إعداد الاقتراحات. تأكد من صلاحية الرد ثم أعد المحاولة. مسودتك محفوظة كما هي.',
  stale:'تغيرت المحادثة أثناء إعداد الاقتراحات. انتظر تحديث الرسائل ثم اطلب اقتراحات جديدة.',
  applied:'أُضيف الاقتراح إلى المسودة. راجعه قبل الإرسال.',
  draftChanged:'تغيرت مسودتك. اختر الاقتراح مرة أخرى لمراجعة طريقة إضافته.',
  applyFailed:'تعذرت إضافة الاقتراح الآن. راجع مسودتك وحالة المحادثة ثم حاول مجددًا.',
  reviewDraft:'إضافة الاقتراح إلى مسودتك',existingDraft:'لديك نص مكتوب. أضف الاقتراح في نهايته أو استبدله بعد المراجعة.',
  append:'إضافة إلى نهاية المسودة',replace:'استبدال المسودة بهذا الاقتراح',tooLong:'الإضافة ستتجاوز 4096 حرفًا. اختصر المسودة أو اختر الاستبدال.',
  quickFailed:'تعذر تحميل الردود السريعة. حاول مرة أخرى.',retry:'إعادة المحاولة',
};
export const replySuggestionsEn:Record<keyof typeof replySuggestionsAr,string>={
  scope:'Drafts based on this conversation. Check the facts, price and availability before sending.',
  friendly:'Friendly',professional:'Professional',brief:'Brief',detailed:'Detailed',generating:'Preparing reply drafts…',
  failed:'Suggestions could not be prepared. Check your reply permission and try again. Your draft is unchanged.',
  stale:'The conversation changed while suggestions were being prepared. Wait for the messages to refresh, then generate again.',
  applied:'Suggestion added to your draft. Review it before sending.',
  draftChanged:'Your draft changed. Select the suggestion again to review how to add it.',
  applyFailed:'The suggestion could not be added now. Check your draft and conversation status, then try again.',
  reviewDraft:'Add this suggestion to your draft',existingDraft:'You already have a draft. Append this suggestion or replace the draft after reviewing it.',
  append:'Append to draft',replace:'Replace draft with suggestion',tooLong:'Appending would exceed 4,096 characters. Shorten your draft or choose replace.',
  quickFailed:'Quick replies could not be loaded. Try again.',retry:'Try again',
};
