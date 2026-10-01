export const conversationPreviewAr = {
  title: 'معاينة المحادثة', description: 'معاينة الرسائل المحمّلة في النافذة الحالية فقط. لا تثبت قراءة الرسائل أو اتصال العميل الآن.',
  trigger: 'معاينة', customer: 'العميل', mobile: 'هاتف', desktop: 'سطح المكتب', dark: 'الوضع الداكن',
  controls: 'خيارات المعاينة', messages: 'الرسائل المحمّلة', empty: 'لا توجد رسائل في هذه النافذة.', close: 'العودة للمحادثة',
};
export const conversationPreviewEn: Record<keyof typeof conversationPreviewAr, string> = {
  title: 'Conversation preview', description: 'Preview of the messages loaded in the current window only. This does not confirm message reads or customer presence.',
  trigger: 'Preview', customer: 'Customer', mobile: 'Phone', desktop: 'Desktop', dark: 'Dark mode',
  controls: 'Preview options', messages: 'Loaded messages', empty: 'There are no messages in this window.', close: 'Back to conversation',
};
