# دليل نظام SEO الشامل لـ Sari

## مقدمة
نظام SEO الشامل المدمج في ساري يوفر أدوات متقدمة لتحسين ترتيب موقعك على محركات البحث وزيادة حركة المرور العضوية.

---

## 1. البنية التحتية لقاعدة البيانات

### الجداول المتاحة:

#### `seo_pages`
- إدارة صفحات SEO الأساسية
- الحقول: `pageSlug`, `pageTitle`, `pageDescription`, `keywords`, `author`, `canonicalUrl`, `isIndexed`, `isPriority`

#### `seo_meta_tags`
- إدارة Meta Tags (الوصف، الكلمات المفتاحية، إلخ)
- الحقول: `pageId`, `metaName`, `metaContent`, `metaProperty`

#### `seo_open_graph`
- إدارة Open Graph للمشاركة على وسائل التواصل
- الحقول: `pageId`, `ogTitle`, `ogDescription`, `ogImage`, `ogType`, `ogUrl`

#### `seo_twitter_cards`
- إدارة Twitter Cards
- الحقول: `pageId`, `twitterTitle`, `twitterDescription`, `twitterImage`, `twitterCardType`

#### `seo_structured_data`
- إدارة JSON-LD Structured Data
- الحقول: `pageId`, `schemaType`, `schemaData`, `isActive`

#### `seo_tracking_codes`
- إدارة رموز التتبع (Google Analytics, Facebook Pixel, إلخ)
- الحقول: `trackingType`, `trackingId`, `trackingCode`, `isActive`

#### `seo_analytics`
- تخزين بيانات التحليلات
- الحقول: `pageId`, `date`, `visitors`, `pageViews`, `bounceRate`, `conversions`, `trafficSource`, `device`, `country`

#### `seo_keywords_analysis`
- تحليل الكلمات المفتاحية
- الحقول: `pageId`, `keyword`, `searchVolume`, `difficulty`, `currentRank`, `targetRank`, `competitorCount`, `trend`

#### `seo_backlinks`
- إدارة الروابط الخارجية
- الحقول: `pageId`, `sourceUrl`, `sourceDomain`, `anchorText`, `domainAuthority`, `spamScore`, `status`

#### `seo_performance_alerts`
- تنبيهات الأداء
- الحقول: `pageId`, `alertType`, `severity`, `message`, `metric`, `previousValue`, `currentValue`, `isResolved`

#### `seo_recommendations`
- توصيات تحسين SEO
- الحقول: `pageId`, `recommendationType`, `title`, `description`, `priority`, `status`

#### `seo_sitemaps`
- إدارة Sitemaps
- الحقول: `sitemapType`, `url`, `entryCount`, `isActive`

---

## 2. صفحات Admin المتاحة

### 📊 لوحة تحكم SEO الرئيسية (`SeoDashboard.tsx`)
- عرض KPIs الرئيسية (الزيارات، معدل التحويل، الكلمات المفتاحية)
- رسوم بيانية لحركة المرور
- قائمة أفضل الصفحات
- تنبيهات الأداء

**الوصول:** `/admin/seo/dashboard`

### 📄 إدارة صفحات SEO (`SeoPages.tsx`)
- إضافة وتعديل صفحات SEO
- البحث والتصفية
- إدارة حالة الفهرسة والأولوية

**الوصول:** `/admin/seo/pages`

### 🏷️ محرر Meta Tags (`SeoMetaTags.tsx`)
- تحرير Meta Tags لكل صفحة
- معاينة في محرك البحث
- إدارة الوصف والكلمات المفتاحية

**الوصول:** `/admin/seo/meta-tags`

### 🔗 محرر Open Graph (`SeoOpenGraph.tsx`)
- إدارة بيانات المشاركة على Facebook و Twitter
- معاينة المشاركات
- تحميل الصور

**الوصول:** `/admin/seo/open-graph`

### 📈 الإحصائيات والتقارير (`SeoAnalytics.tsx`)
- رسوم بيانية متقدمة لحركة المرور
- توزيع الأجهزة والدول
- أفضل الصفحات والكلمات المفتاحية
- قمع التحويل

**الوصول:** `/admin/seo/analytics`

### 🔍 إدارة الكلمات المفتاحية (`SeoKeywords.tsx`)
- تتبع ترتيب الكلمات المفتاحية
- تحليل صعوبة المنافسة
- توصيات الكلمات المفتاحية

**الوصول:** `/admin/seo/keywords`

### 🔗 إدارة الروابط الخارجية (`SeoBacklinks.tsx`)
- تتبع الروابط التي تشير إلى موقعك
- تحليل Domain Authority
- كشف الروابط المكسورة

**الوصول:** `/admin/seo/backlinks`

### 📡 إدارة رموز التتبع (`SeoTracking.tsx`)
- إدارة Google Analytics
- إدارة Facebook Pixel
- إدارة Google Tag Manager
- رموز تتبع مخصصة

**الوصول:** `/admin/seo/tracking`

---

## 3. استخدام مكون SeoHead

### الاستخدام الأساسي:

```tsx
import { SeoHead } from "@/components/SeoHead";

export default function HomePage() {
  return (
    <>
      <SeoHead
        title="ساري - وكيل مبيعات ذكي للواتساب"
        description="منصة ساري تساعدك في إدارة مبيعاتك عبر الواتساب بذكاء اصطناعي"
        keywords="واتساب، مبيعات، ذكاء اصطناعي"
        ogImage="https://sari.app/og-image.jpg"
      />
      {/* Page content */}
    </>
  );
}
```

### استخدام الإعدادات المعرفة مسبقاً:

```tsx
import { SeoHead, seoConfigs } from "@/components/SeoHead";

export default function HomePage() {
  return (
    <>
      <SeoHead {...seoConfigs.home} />
      {/* Page content */}
    </>
  );
}
```

### الخصائص المتاحة:

| الخاصية | النوع | الوصف |
|--------|-------|-------|
| `title` | string | عنوان الصفحة |
| `description` | string | وصف الصفحة |
| `keywords` | string | الكلمات المفتاحية |
| `author` | string | مؤلف الصفحة |
| `canonicalUrl` | string | الرابط الأساسي |
| `ogTitle` | string | عنوان Open Graph |
| `ogDescription` | string | وصف Open Graph |
| `ogImage` | string | صورة Open Graph |
| `ogType` | string | نوع Open Graph |
| `twitterTitle` | string | عنوان Twitter |
| `twitterDescription` | string | وصف Twitter |
| `twitterImage` | string | صورة Twitter |
| `twitterCardType` | string | نوع Twitter Card |
| `structuredData` | object | بيانات JSON-LD |

---

## 4. دوال قاعدة البيانات المتاحة

### SEO Pages
```typescript
import * as seoFunctions from "@/server/seo-functions";

// إنشاء صفحة SEO
await seoFunctions.createSeoPage({
  pageSlug: "home",
  pageTitle: "الصفحة الرئيسية",
  pageDescription: "وصف الصفحة",
});

// الحصول على جميع الصفحات
const pages = await seoFunctions.getSeoPages();

// الحصول على صفحة بواسطة slug
const page = await seoFunctions.getSeoPageBySlug("home");

// تحديث صفحة
await seoFunctions.updateSeoPage(pageId, { pageTitle: "عنوان جديد" });
```

### Meta Tags
```typescript
// إنشاء meta tag
await seoFunctions.createMetaTag({
  pageId: 1,
  metaName: "description",
  metaContent: "وصف الصفحة",
});

// الحصول على meta tags
const tags = await seoFunctions.getMetaTagsByPageId(1);
```

### Open Graph
```typescript
// إنشاء Open Graph
await seoFunctions.createOpenGraph({
  pageId: 1,
  ogTitle: "العنوان",
  ogDescription: "الوصف",
  ogImage: "https://example.com/image.jpg",
});

// الحصول على Open Graph
const og = await seoFunctions.getOpenGraphByPageId(1);
```

### Analytics
```typescript
// إضافة سجل تحليلات
await seoFunctions.createAnalyticsRecord({
  pageId: 1,
  date: "2024-01-15",
  visitors: 1200,
  pageViews: 2400,
  conversions: 240,
});

// الحصول على إحصائيات
const stats = await seoFunctions.getAnalyticsStats(1, 30);
```

### Keywords
```typescript
// إضافة كلمة مفتاحية
await seoFunctions.createKeywordAnalysis({
  pageId: 1,
  keyword: "واتساب",
  searchVolume: 8900,
  difficulty: 72,
  currentRank: 3,
});

// الحصول على الكلمات المفتاحية
const keywords = await seoFunctions.getKeywordsByPageId(1);
```

### Backlinks
```typescript
// إضافة رابط خارجي
await seoFunctions.createBacklink({
  pageId: 1,
  sourceUrl: "https://example.com/article",
  sourceDomain: "example.com",
  domainAuthority: 72,
});

// الحصول على الروابط الخارجية
const backlinks = await seoFunctions.getBacklinksByPageId(1);
```

### Alerts
```typescript
// إنشاء تنبيه
await seoFunctions.createAlert({
  pageId: 1,
  alertType: "ranking_drop",
  severity: "high",
  message: "انخفاض ترتيب الكلمة المفتاحية",
});

// الحصول على التنبيهات غير المحلولة
const alerts = await seoFunctions.getUnresolvedAlerts();

// حل تنبيه
await seoFunctions.resolveAlert(alertId);
```

---

## 5. Sitemap و Robots.txt

### استخدام Sitemap Generator:

```tsx
import { generateSitemap, defaultSitemapEntries } from "@/components/SitemapGenerator";

// إنشاء sitemap
const sitemap = generateSitemap(defaultSitemapEntries);

// أو مع إدخالات مخصصة
const customSitemap = generateSitemap([
  { url: "/", priority: 1.0, changefreq: "weekly" },
  { url: "/about", priority: 0.8, changefreq: "monthly" },
]);
```

### إنشاء Robots.txt:

```tsx
import { generateRobotsTxt } from "@/components/SitemapGenerator";

const robotsTxt = generateRobotsTxt();
```

---

## 6. أفضل الممارسات

### ✅ يجب عليك:

1. **تحديث Meta Tags بانتظام** - تأكد من أن جميع الصفحات لديها meta tags محسّنة
2. **استخدام Structured Data** - أضف JSON-LD للصفحات المهمة
3. **مراقبة الكلمات المفتاحية** - تتبع ترتيب الكلمات المفتاحية بانتظام
4. **تحليل الروابط الخارجية** - راقب الروابط التي تشير إلى موقعك
5. **تحسين سرعة الصفحة** - استخدم أدوات مثل Google PageSpeed Insights
6. **إنشاء محتوى عالي الجودة** - المحتوى هو الملك في SEO
7. **استخدام الصور بحكمة** - أضف alt text وحسّن حجم الصور

### ❌ تجنب:

1. **Keyword Stuffing** - لا تكرر الكلمات المفتاحية بشكل مفرط
2. **Meta Tags المكررة** - تأكد من تفرد meta tags لكل صفحة
3. **الروابط المكسورة** - تحقق من الروابط بانتظام
4. **المحتوى المكرر** - تجنب نسخ المحتوى من مواقع أخرى
5. **الصفحات البطيئة** - حسّن سرعة التحميل
6. **عدم استخدام Canonical URLs** - استخدمها لتجنب المحتوى المكرر

---

## 7. التكامل مع خدمات خارجية

### Google Analytics 4
```tsx
// أضف رمز التتبع في SeoTracking
{
  type: "Google Analytics",
  trackingId: "G-XXXXXXXXXX",
  code: "<!-- Google Analytics script -->",
  isActive: true
}
```

### Facebook Pixel
```tsx
// أضف رمز Facebook Pixel
{
  type: "Facebook Pixel",
  trackingId: "1234567890",
  code: "<!-- Facebook Pixel script -->",
  isActive: true
}
```

### Google Tag Manager
```tsx
// أضف رمز GTM
{
  type: "Google Tag Manager",
  trackingId: "GTM-XXXXXXX",
  code: "<!-- GTM script -->",
  isActive: true
}
```

---

## 8. الإحصائيات والتقارير

### KPIs الرئيسية:
- **إجمالي الزيارات** - عدد الزيارات الفريدة
- **معدل التحويل** - نسبة الزيارات التي تحولت إلى عملاء
- **متوسط مدة الجلسة** - الوقت الذي يقضيه الزائر على الموقع
- **معدل الارتداد** - نسبة الزيارات التي غادرت الموقع بدون تفاعل

### مصادر حركة المرور:
- **عضوي** - من محركات البحث
- **مباشر** - من الروابط المباشرة
- **وسائل التواصل** - من Facebook, Twitter, إلخ
- **إحالات** - من مواقع أخرى

---

## 9. استكشاف الأخطاء

### المشكلة: صفحتي لا تظهر في نتائج البحث

**الحل:**
1. تحقق من أن `isIndexed` = 1 في جدول `seo_pages`
2. تأكد من وجود meta tags محسّنة
3. تحقق من أن الصفحة مدرجة في sitemap
4. استخدم Google Search Console للتحقق من الفهرسة

### المشكلة: معدل التحويل منخفض

**الحل:**
1. حسّن meta tags والعنوان
2. أضف صور عالية الجودة
3. حسّن سرعة الصفحة
4. أضف call-to-action واضح

### المشكلة: الروابط الخارجية تنخفض

**الحل:**
1. راقب الروابط المكسورة
2. تواصل مع المواقع التي تشير إليك
3. أنشئ محتوى عالي الجودة يستحق الربط
4. استخدم استراتيجية link building

---

## 10. الخطوات التالية

1. **تحديث جميع الصفحات** - أضف SeoHead إلى جميع الصفحات الرئيسية
2. **إنشاء Sitemap** - أنشئ sitemap.xml وأضفه إلى Google Search Console
3. **إعداد Google Analytics** - أضف رمز GA4 إلى موقعك
4. **مراقبة الأداء** - استخدم لوحة تحكم SEO لمراقبة الأداء
5. **تحسين المحتوى** - حسّن المحتوى بناءً على البيانات

---

**آخر تحديث:** يناير 2024
**الإصدار:** 1.0
