// Translation generator for Sari locale files
// Translates ALL Arabic values in en.json to English
// Then generates fr, es, de, it, tr, zh from the combined ar+en reference

const fs = require('fs');
const path = require('path');

const localesDir = path.dirname(__filename || __dirname);

// Load source
const ar = JSON.parse(fs.readFileSync(path.join(localesDir, 'ar.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));

function hasArabic(str) {
    return /[\u0600-\u06FF]/.test(str);
}

// Comprehensive Arabic to English dictionary for common UI terms
const arToEn = {
    // Common UI
    'جاري التحميل...': 'Loading...',
    'حفظ': 'Save',
    'إلغاء': 'Cancel',
    'حذف': 'Delete',
    'تعديل': 'Edit',
    'إضافة': 'Add',
    'بحث': 'Search',
    'تصفية': 'Filter',
    'إغلاق': 'Close',
    'تأكيد': 'Confirm',
    'نعم': 'Yes',
    'لا': 'No',
    'خطأ': 'Error',
    'نجح': 'Success',
    'تحذير': 'Warning',
    'معلومات': 'Info',
    'الإجراءات': 'Actions',
    'الحالة': 'Status',
    'التاريخ': 'Date',
    'الوقت': 'Time',
    'الإجمالي': 'Total',
    'الاسم': 'Name',
    'رقم الهاتف': 'Phone Number',
    'البريد الإلكتروني': 'Email',
    'العنوان': 'Address',
    'الوصف': 'Description',
    'السعر': 'Price',
    'الكمية': 'Quantity',
    'التصنيف': 'Category',
    'الصورة': 'Image',
    'التفاصيل': 'Details',
    'الإعدادات': 'Settings',
    'تسجيل الخروج': 'Logout',
    'تسجيل الدخول': 'Login',
    'التسجيل': 'Register',
    'عرض': 'View',
    'تحميل': 'Download',
    'رفع': 'Upload',
    'طباعة': 'Print',
    'مشاركة': 'Share',
    'نسخ': 'Copy',
    'لصق': 'Paste',
    'قص': 'Cut',

    // Status terms
    'قيد الانتظار': 'Pending',
    'مؤكد': 'Confirmed',
    'قيد المعالجة': 'Processing',
    'تم الشحن': 'Shipped',
    'تم التوصيل': 'Delivered',
    'ملغي': 'Cancelled',
    'مكتملة': 'Completed',
    'مكتمل': 'Completed',
    'نشط': 'Active',
    'غير نشط': 'Inactive',
    'متصل': 'Connected',
    'غير متصل': 'Disconnected',
    'جاهز': 'Ready',
    'معطل': 'Disabled',
    'منتهي': 'Expired',
    'مستعادة': 'Recovered',
    'مرفوضة': 'Rejected',
    'مرفوض': 'Rejected',

    // Orders
    'تم تحديث الحالة': 'Status Updated',
    'تم تحديث حالة الطلب بنجاح': 'Order status updated successfully',
    'إدارة الطلبات': 'Order Management',
    'إجمالي الطلبات': 'Total Orders',
    'جميع الطلبات': 'All Orders',
    'تحتاج متابعة': 'Needs Follow-up',
    'إجمالي المبيعات': 'Total Sales',
    'هذا الشهر': 'This Month',
    'قائمة الطلبات': 'Orders List',
    'ابحث وفلتر الطلبات': 'Search and Filter Orders',
    'ابحث برقم الطلب أو اسم العميل...': 'Search by order number or customer name...',
    'جميع الحالات': 'All Statuses',
    'رقم الطلب': 'Order Number',
    'العميل': 'Customer',
    'المنتجات': 'Products',
    'تفاصيل الطلب': 'Order Details',
    'معلومات العميل': 'Customer Information',
    'عنوان التوصيل': 'Delivery Address',
    'حالة الطلب': 'Order Status',
    'ملاحظات': 'Notes',

    // Products
    'الرد الآلي الذكي': 'Smart Auto-Reply',
    'مساعد ذكي يرد على استفسارات عملائك باللهجة السعودية على مدار الساعة': 'Smart assistant that responds to customer inquiries in Saudi dialect 24/7',
    'رد تلقائي على الاستفسارات': 'Auto-reply to inquiries',
    'فهم اللهجة السعودية': 'Understanding Saudi dialect',
    'البحث في المنتجات': 'Product search',
    'اقتراح المنتجات المناسبة': 'Suggest suitable products',
    'متاح 24/7': 'Available 24/7',
    'إدارة المحادثات': 'Conversation Management',
    'نظام متقدم لإدارة جميع محادثاتك مع العملاء في مكان واحد': 'Advanced system to manage all your customer conversations in one place',
    'عرض جميع المحادثات': 'View all conversations',
    'تصنيف المحادثات': 'Categorize conversations',
    'البحث في المحادثات': 'Search conversations',
    'الرد اليدوي عند الحاجة': 'Manual reply when needed',
    'تاريخ كامل للمحادثات': 'Complete conversation history',
    'إدارة المنتجات': 'Product Management',
    'أضف وأدر منتجاتك بسهولة ليتعرف عليها ساري': 'Add and manage your products easily for Sari to recognize',
    'إضافة منتجات غير محدودة': 'Add unlimited products',
    'تصنيف المنتجات': 'Categorize products',
    'إدارة المخزون': 'Inventory management',
    'تحديث الأسعار': 'Update prices',
    'صور المنتجات': 'Product photos',
    'الحملات التسويقية': 'Marketing Campaigns',
    'أرسل حملات تسويقية مستهدفة لعملائك عبر الواتساب': 'Send targeted marketing campaigns to your customers via WhatsApp',
    'إنشاء حملات مخصصة': 'Create custom campaigns',
    'جدولة الحملات': 'Schedule campaigns',
    'استهداف العملاء': 'Target customers',
    'تتبع الأداء': 'Track performance',
    'رسائل صوتية وصور': 'Voice messages and images',
    'التقارير والتحليلات': 'Reports and Analytics',
    'تقارير مفصلة عن أداء متجرك ومحادثاتك': 'Detailed reports on your store and conversation performance',
    'إحصائيات المحادثات': 'Conversation statistics',
    'تحليل أداء المبيعات': 'Sales performance analysis',
    'تقارير الحملات': 'Campaign reports',
    'معدلات التحويل': 'Conversion rates',
    'رضا العملاء': 'Customer satisfaction',
    'الدعم الفني': 'Technical Support',
    'دعم فني متواصل لمساعدتك في أي وقت': 'Continuous technical support to help you anytime',
    'دعم عبر الواتساب': 'WhatsApp support',
    'دعم عبر البريد': 'Email support',
    'قاعدة معرفية شاملة': 'Comprehensive knowledge base',
    'فيديوهات تعليمية': 'Tutorial videos',
    'استجابة سريعة': 'Quick response',
};

// Count stats
let translated = 0, untranslated = 0;

function translateValue(arValue) {
    if (!hasArabic(arValue)) return arValue;

    // Direct dictionary lookup
    if (arToEn[arValue]) {
        translated++;
        return arToEn[arValue];
    }

    // Keep Arabic value as-is for now (will be handled in second pass)
    untranslated++;
    return arValue;
}

// Deep traverse and translate
function translateObj(obj) {
    const result = {};
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            result[key] = translateObj(obj[key]);
        } else if (typeof obj[key] === 'string') {
            result[key] = translateValue(obj[key]);
        } else {
            result[key] = obj[key];
        }
    }
    return result;
}

// First pass: translate en.json
const enTranslated = translateObj(en);
console.log(`EN: Translated ${translated}, Remaining Arabic: ${untranslated}`);

fs.writeFileSync(path.join(localesDir, 'en_test.json'), JSON.stringify(enTranslated, null, 2), 'utf8');
console.log('Written en_test.json');
