export const staffTeamReviewAr={
 title:'مراجعة محاولات الفريق',scope:'للمالك والمدير: تحقق من محاولات الفريق عبر المحادثات، بما فيها محاولات موظف غادر العمل. يُسجّل سبب المراجعة ونتيجتها، دون إرسال رسالة أو رفع تسجيل جديد.',
 attempts:'المحاولات',history:'سجل المراجعات',conversation:'رقم المحادثة',author:'رقم صاحب الرد',all:'الكل',apply:'تطبيق التصفية',filtersInvalid:'أدخل أرقامًا صحيحة موجبة أو اترك الحقول فارغة.',
 identity:'المحادثة #{{conversation}} · صاحب الرد #{{author}}',reviewer:'راجعها المستخدم #{{reviewer}}',review:'المراجعة #{{id}}',
 reason:'سبب المراجعة',chooseReason:'اختر سببًا',delivery:'التحقق من نتيجة الإرسال',departed:'متابعة محاولة موظف غادر العمل',incident:'مراجعة مشكلة في الإرسال',
 check:'تحقق وسجّل المراجعة',checking:'جارٍ التحقق والتسجيل…',saved:'حُفظت المراجعة #{{id}}. لم تُرسل رسالة جديدة.',
 failed:'تعذر تأكيد حفظ المراجعة. حدّث القائمة قبل إعادة المحاولة؛ ستستخدم المحاولة التالية الطلب نفسه.',
 loading:'جارٍ تحميل سجل الفريق…',empty:'لا توجد نتائج مطابقة.',loadFailed:'تعذر عرض السجل. حدّث القائمة وتأكد من صلاحية المراجعة.',invalid:'تعذر التحقق من سلامة بيانات السجل.',
 refresh:'تحديث',older:'نتائج أقدم',latest:'أحدث النتائج',auditScope:'يسجل هذا القسم عمليات التحقق الإدارية. قبول الإرسال لا يثبت التسليم أو القراءة أو إتمام البيع.',
};
export const staffTeamReviewEn:Record<keyof typeof staffTeamReviewAr,string>={
 title:'Review team attempts',scope:'Owners and managers can check team attempts across conversations, including replies from former staff. Each review records its reason and result without sending a message or uploading another recording.',
 attempts:'Attempts',history:'Review history',conversation:'Conversation ID',author:'Reply author ID',all:'All',apply:'Apply filters',filtersInvalid:'Enter positive whole numbers or leave the fields empty.',
 identity:'Conversation #{{conversation}} · Reply author #{{author}}',reviewer:'Reviewed by user #{{reviewer}}',review:'Review #{{id}}',
 reason:'Review reason',chooseReason:'Choose a reason',delivery:'Check send result',departed:'Follow up a former staff member’s attempt',incident:'Investigate a sending issue',
 check:'Check and record review',checking:'Checking and recording…',saved:'Review #{{id}} saved. No new message was sent.',
 failed:'The review save could not be confirmed. Refresh before trying again; the next attempt will use the same request.',
 loading:'Loading team history…',empty:'No matching results.',loadFailed:'History could not be loaded. Refresh and check your review permission.',invalid:'The history data could not be verified.',
 refresh:'Refresh',older:'Older results',latest:'Latest results',auditScope:'This history records administrative checks. Send acceptance does not prove delivery, reading, or a completed sale.',
};
