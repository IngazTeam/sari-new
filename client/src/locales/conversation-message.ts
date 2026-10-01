export const conversationMessageAr = {
  image: 'صورة من المحادثة', openImage: 'تكبير الصورة', preview: 'معاينة الصورة', previewDescription: 'صورة مرفقة بهذه الرسالة. يمكنك إغلاق المعاينة للعودة إلى المحادثة.',
  close: 'إغلاق المعاينة', failed: 'تعذر تحميل المرفق. قد يكون الرابط منتهيًا.', unavailable: 'المرفق غير متاح أو رابطه غير صالح. راجع الرسالة الأصلية في واتساب.',
  retry: 'إعادة تحميل المرفق', voice: 'رسالة صوتية', voicePlayer: 'تشغيل الرسالة الصوتية', document: 'ملف مرفق', openDocument: 'فتح المرفق في تبويب جديد',
  customer: 'العميل', employee: 'الموظف', assistant: 'مساعد ساري', unknown: 'المرسل غير محدد', timeUnavailable: 'وقت الرسالة غير متاح', utcFallback: 'منطقة المتجر الزمنية غير صالحة؛ الوقت معروض بتوقيت UTC.',
  loading: 'جارٍ تحميل الرسائل…', loadFailed: 'تعذر تحميل الرسائل', retryDescription: 'أعد المحاولة لعرض سجل المحادثة.',
};
export const conversationMessageEn: Record<keyof typeof conversationMessageAr, string> = {
  image: 'Conversation image', openImage: 'Enlarge image', preview: 'Image preview', previewDescription: 'An image attached to this message. Close the preview to return to the conversation.',
  close: 'Close preview', failed: 'The attachment could not load. Its link may have expired.', unavailable: 'The attachment is unavailable or its link is invalid. Check the original message in WhatsApp.',
  retry: 'Reload attachment', voice: 'Voice message', voicePlayer: 'Play voice message', document: 'Attached file', openDocument: 'Open attachment in a new tab',
  customer: 'Customer', employee: 'Employee', assistant: 'Sari assistant', unknown: 'Unknown sender', timeUnavailable: 'Message time unavailable', utcFallback: 'The store time zone is invalid; time is shown in UTC.',
  loading: 'Loading messages…', loadFailed: 'Messages could not load', retryDescription: 'Retry to view the conversation history.',
};
