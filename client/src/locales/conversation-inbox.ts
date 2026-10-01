export const conversationInboxAr = {
  noActivity: 'لم تصل رسالة بعد', timeUnavailable: 'وقت غير متاح', search: 'البحث في جميع المحادثات',
  listFailed: 'تعذر تحميل المحادثات', listRetry: 'أعد المحاولة لاستعادة قائمة العملاء.', listLoading: 'جارٍ تحميل المحادثات…',
  needsHuman: 'تحتاج تدخل بشري', clearFilter: '✕ إزالة الفلتر', matches: 'نتائج مطابقة', all: 'كل المحادثات', searchHelp: 'ابحث باسم العميل أو رقم هاتفه في جميع المحادثات',
  previous: 'السابق', next: 'التالي', loading: 'جارٍ التحميل…', page: 'صفحة {{page}} من {{total}}',
  back: 'العودة إلى قائمة المحادثات', extras: 'اقتراحات ساري والإجراءات السريعة', placeholder: 'اكتب رسالتك هنا...', reply: 'رسالتك للعميل',
  invalidHistory: 'تعذر استعادة موضع السجل من الرابط. تُعرض أحدث الرسائل؛ يمكنك تصفح الأقدم من هنا.',
  emptyHistory: 'لا توجد رسائل في هذه النافذة الأقدم.',
  ready: '🔥 جاهزون للدفع', payment_link_sent: '💳 دفع لم يكتمل', stalled: '⏸️ متوقفة', new: 'جديد', interested: 'مهتم', qualified: 'مؤهل', paid: 'مدفوع', purchased: 'تم الشراء', payment_failed: 'تعذر الدفع', lost: 'خسارة',
};
export const conversationInboxEn: Record<keyof typeof conversationInboxAr, string> = {
  noActivity: 'No messages yet', timeUnavailable: 'Time unavailable', search: 'Search all conversations',
  listFailed: 'Conversations could not load', listRetry: 'Retry to restore the customer list.', listLoading: 'Loading conversations…',
  needsHuman: 'Needs human attention', clearFilter: '✕ Clear filters', matches: 'Matching results', all: 'All conversations', searchHelp: 'Search every conversation by customer name or phone',
  previous: 'Previous', next: 'Next', loading: 'Loading…', page: 'Page {{page}} of {{total}}',
  back: 'Back to conversation list', extras: 'Sari suggestions and quick actions', placeholder: 'Write your message here...', reply: 'Your reply to the customer',
  invalidHistory: 'The history position in this link could not be restored. Showing the latest messages; you can browse earlier messages here.',
  emptyHistory: 'There are no messages in this earlier window.',
  ready: '🔥 Ready to pay', payment_link_sent: '💳 Payment incomplete', stalled: '⏸️ Stalled', new: 'New', interested: 'Interested', qualified: 'Qualified', paid: 'Paid', purchased: 'Purchased', payment_failed: 'Payment failed', lost: 'Lost',
};
