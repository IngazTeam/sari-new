const fs = require('fs');

const translations = {
  whatsappManagement: {
    title: {
      ar: "إدارة أرقام الواتساب",
      en: "WhatsApp Number Management"
    },
    subtitle: {
      ar: "أضف أرقام واتساب جديدة وتحكّم في أرقامك النشطة",
      en: "Add new WhatsApp numbers and manage your active connections"
    },
    addNumber: {
      ar: "طلب ربط رقم جديد",
      en: "Request New Number"
    },
    planUsage: {
      ar: "استخدام الباقة",
      en: "Plan Usage"
    },
    numbersActive: {
      ar: "أرقام نشطة",
      en: "active numbers"
    },
    remaining: {
      ar: "متبقي",
      en: "Remaining"
    },
    numbers: {
      ar: "أرقام",
      en: "numbers"
    },
    upgradePlan: {
      ar: "ترقية الباقة",
      en: "Upgrade Plan"
    },
    stats: {
      activeNumbers: {
        ar: "أرقام نشطة",
        en: "Active Numbers"
      },
      inactiveNumbers: {
        ar: "أرقام متوقفة",
        en: "Inactive Numbers"
      },
      pendingRequests: {
        ar: "طلبات قيد المراجعة",
        en: "Pending Requests"
      }
    },
    connectedNumbers: {
      ar: "الأرقام النشطة",
      en: "Active Numbers"
    },
    connectedDesc: {
      ar: "أرقام الواتساب المتصلة والنشطة حالياً",
      en: "Currently connected and active WhatsApp numbers"
    },
    noPhone: {
      ar: "رقم غير محدد",
      en: "Number not set"
    },
    primary: {
      ar: "الرقم الأساسي",
      en: "Primary Number"
    },
    connectedSince: {
      ar: "متصل منذ",
      en: "Connected since"
    },
    status: {
      active: {
        ar: "نشط",
        en: "Active"
      },
      inactive: {
        ar: "متوقف",
        en: "Inactive"
      },
      approved: {
        ar: "تمت الموافقة",
        en: "Approved"
      },
      connected: {
        ar: "متصل",
        en: "Connected"
      },
      rejected: {
        ar: "مرفوض",
        en: "Rejected"
      },
      pending: {
        ar: "قيد المراجعة",
        en: "Pending Review"
      }
    },
    setAsPrimary: {
      ar: "تعيين كأساسي",
      en: "Set as Primary"
    },
    deactivate: {
      ar: "إيقاف",
      en: "Deactivate"
    },
    activate: {
      ar: "تفعيل",
      en: "Activate"
    },
    inactiveNumbers: {
      ar: "الأرقام المتوقفة",
      en: "Inactive Numbers"
    },
    inactiveDesc: {
      ar: "يمكنك إعادة تفعيل هذه الأرقام حسب حدود باقتك",
      en: "You can reactivate these numbers within your plan limits"
    },
    emptyTitle: {
      ar: "لم تربط أي رقم واتساب بعد",
      en: "No WhatsApp Numbers Connected Yet"
    },
    emptyDesc: {
      ar: "قدّم طلب ربط رقم واتساب جديد وسيقوم فريق الدعم بتفعيله خلال 24 ساعة",
      en: "Submit a WhatsApp number connection request and our team will activate it within 24 hours"
    },
    requestsHistory: {
      ar: "سجل الطلبات",
      en: "Request History"
    },
    requestsHistoryDesc: {
      ar: "جميع طلبات ربط أرقام الواتساب الخاصة بك",
      en: "All your WhatsApp number connection requests"
    },
    newNumberRequest: {
      ar: "طلب رقم جديد",
      en: "New Number Request"
    },
    rejectionReason: {
      ar: "سبب الرفض",
      en: "Rejection Reason"
    },
    adminNotes: {
      ar: "ملاحظات الإدارة",
      en: "Admin Notes"
    },
    dialog: {
      title: {
        ar: "طلب ربط رقم واتساب",
        en: "Request WhatsApp Number Connection"
      },
      description: {
        ar: "أدخل رقم الواتساب الذي تريد ربطه. سيتم مراجعة طلبك من قبل فريق الإدارة وتفعيله خلال 24 ساعة.",
        en: "Enter the WhatsApp number you want to connect. Your request will be reviewed by the admin team and activated within 24 hours."
      },
      phoneLabel: {
        ar: "رقم الواتساب",
        en: "WhatsApp Number"
      },
      phoneHint: {
        ar: "أدخل الرقم مع مفتاح الدولة (مثال: +966)",
        en: "Enter the number with country code (e.g., +966)"
      },
      businessLabel: {
        ar: "اسم النشاط التجاري (اختياري)",
        en: "Business Name (Optional)"
      },
      businessPlaceholder: {
        ar: "اسم المتجر أو الشركة",
        en: "Store or company name"
      },
      sending: {
        ar: "جاري الإرسال...",
        en: "Sending..."
      },
      submit: {
        ar: "إرسال الطلب",
        en: "Submit Request"
      }
    },
    confirm: {
      deactivateTitle: {
        ar: "إيقاف الرقم",
        en: "Deactivate Number"
      },
      activateTitle: {
        ar: "تفعيل الرقم",
        en: "Activate Number"
      },
      setPrimaryTitle: {
        ar: "تعيين كرقم أساسي",
        en: "Set as Primary Number"
      }
    },
    toast: {
      requestSent: {
        ar: "تم إرسال طلب الربط بنجاح! سيتم مراجعته من قبل الإدارة.",
        en: "Connection request sent successfully! It will be reviewed by admin."
      },
      requestFailed: {
        ar: "فشل إرسال الطلب",
        en: "Failed to send request"
      },
      statusChanged: {
        ar: "تم تحديث حالة الرقم بنجاح",
        en: "Number status updated successfully"
      },
      primarySet: {
        ar: "تم تعيين الرقم الأساسي بنجاح",
        en: "Primary number set successfully"
      }
    }
  }
};

// Helper to flatten nested translation objects
function flattenKeys(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !value.ar && !value.en) {
      Object.assign(result, flattenKeys(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

const flat = flattenKeys(translations);

// Read existing locale files
const arPath = 'c:\\Users\\ingaz\\Herd\\sari\\client\\src\\locales\\ar.json';
const enPath = 'c:\\Users\\ingaz\\Herd\\sari\\client\\src\\locales\\en.json';

const arJson = JSON.parse(fs.readFileSync(arPath, 'utf8'));
const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));

let arAdded = 0;
let enAdded = 0;

for (const [key, val] of Object.entries(flat)) {
  if (!arJson[key] && val.ar) {
    arJson[key] = val.ar;
    arAdded++;
  }
  if (!enJson[key] && val.en) {
    enJson[key] = val.en;
    enAdded++;
  }
}

// Also add the sidebar key
if (!arJson['sidebar.merchant.whatsappInstances']) {
  arJson['sidebar.merchant.whatsappInstances'] = 'إدارة أرقام الواتساب';
  arAdded++;
}
if (!enJson['sidebar.merchant.whatsappInstances']) {
  enJson['sidebar.merchant.whatsappInstances'] = 'WhatsApp Number Management';
  enAdded++;
}

fs.writeFileSync(arPath, JSON.stringify(arJson, null, 2) + '\n');
fs.writeFileSync(enPath, JSON.stringify(enJson, null, 2) + '\n');

console.log(`Done! Added ${arAdded} keys to ar.json, ${enAdded} keys to en.json`);
