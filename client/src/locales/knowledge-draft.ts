export const knowledgeDraftEn = {
  logoutWarning: 'Unsaved knowledge text and request references in this tab will also be cleared. Saved server records remain in the file library.',
  chooseOriginal: 'Select the same original file', restoreOriginal: 'Check the saved result, or select the original file again to retry the same request. Its name and bytes must match; nothing is sent automatically.',
  differentFile: 'This file does not match the original name and content. Choose the same original; the request reference is unchanged.', fileReadError: 'Could not read this file to verify its fingerprint. No request was sent.',
  loading: 'Checking your account and store…', scopeError: 'Could not verify the account and store. Retry before editing knowledge.',
  restored: 'Your text draft was restored. Analyze it again and review the new plan before approval.',
  memoryOnly: 'Your text stays available while navigating this open dashboard. Reloading, closing the tab or signing out clears unsaved text. Keep your own copy.',
  discard: 'Discard this draft',
  recovered: 'A previous request reference was recovered. Check its saved result before starting another request. Nothing was resent.',
  storageError: 'The browser could not retain or read the request reference. No new request was sent. Enable session storage and reload; copy unsaved text first.',
  recoveredUpload: 'The original file is no longer selected. Read the saved result using this reference. Reloading does not upload the file again.',
  missingUpload: 'No result is available for this reference yet. Check again or inspect the file library; this does not confirm that uploading failed.',
};
export type KnowledgeDraftCopy = { [K in keyof typeof knowledgeDraftEn]: string };
export const knowledgeDraftAr: KnowledgeDraftCopy = {
  logoutWarning: 'سيُمسح نص مسودات المعرفة وأرقام طلباتها في هذا التبويب. تبقى السجلات المحفوظة على الخادم في مكتبة الملفات.',
  chooseOriginal: 'اختيار الملف الأصلي نفسه', restoreOriginal: 'تحقق من النتيجة، أو اختر الأصل مجددًا لإعادة الطلب نفسه. يجب أن يتطابق الاسم والمحتوى؛ لا نرسل شيئًا تلقائيًا.',
  differentFile: 'اسم هذا الملف أو محتواه لا يطابق الأصل. اختر الملف الأصلي نفسه؛ لم يتغيّر رقم الطلب.', fileReadError: 'تعذرت قراءة الملف للتحقق من بصمته. لم يُرسل طلب.',
  loading: 'جارٍ التحقق من الحساب والمتجر…', scopeError: 'تعذر التحقق من الحساب والمتجر. أعد المحاولة قبل تعديل المعرفة.',
  restored: 'استعدنا مسودة النص. افحصها مجددًا وراجع الخطة الجديدة قبل الاعتماد.',
  memoryOnly: 'يبقى النص أثناء التنقل داخل اللوحة المفتوحة. تحديث الصفحة أو إغلاق التبويب أو تسجيل الخروج يمسح النص غير المحفوظ؛ احتفظ بنسخة لديك.',
  discard: 'تجاهل هذه المسودة',
  recovered: 'استعدنا رقم طلب سابق. تحقق من نتيجته المحفوظة قبل بدء طلب آخر. لم نُعد إرساله.',
  storageError: 'تعذر حفظ رقم الطلب أو قراءته في المتصفح. لم نرسل طلبًا جديدًا. فعّل تخزين الجلسة ثم حدّث الصفحة بعد نسخ النص غير المحفوظ.',
  recoveredUpload: 'لم يعد الملف الأصلي محددًا. اقرأ النتيجة المحفوظة برقم الطلب. تحديث الصفحة لا يرفع الملف مجددًا.',
  missingUpload: 'لا توجد نتيجة متاحة لهذا الرقم حتى الآن. تحقق مجددًا أو راجع مكتبة الملفات؛ هذا لا يؤكد فشل الرفع.',
};
