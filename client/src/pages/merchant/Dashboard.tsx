import { useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
  Package,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import { formatCurrency as formatMajorCurrency } from '@shared/currency';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { TrialBanner } from '@/components/TrialBanner';
import { LearningEvidenceCard } from '@/components/LearningEvidenceCard';
import { QueryStateCard } from '@/components/QueryStateCard';

function PanelError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="mw-query-error">
      <p>تعذر تحميل هذه البيانات. أعد المحاولة لتظهر أحدث نتيجة.</p>
      <Button type="button" variant="outline" onClick={retry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

export default function MerchantDashboard() {
  const [dateRange, setDateRange] = useState(7);
  const [chartType, setChartType] = useState<'orders' | 'revenue'>('orders');
  const [quickOpen, setQuickOpen] = useState(false);
  const merchantQuery = trpc.merchants.getCurrent.useQuery();
  const onboarding = trpc.merchants.getOnboardingStatus.useQuery();
  const summary = trpc.dashboard.getSummary.useQuery({
    days: dateRange,
    topProductsLimit: 5,
  });
  const recent = trpc.conversations.listRecent.useQuery({ limit: 5 });
  const count = trpc.conversations.count.useQuery();
  const campaigns = trpc.campaigns.getStats.useQuery();
  const reviews = trpc.reviews.getStats.useQuery(
    { merchantId: merchantQuery.data?.id ?? 0 },
    { enabled: !!merchantQuery.data?.id }
  );
  const insights = trpc.dashboard.getAiInsights.useQuery(undefined, {
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });
  const sync = trpc.sariBrain.getIntegrationSyncStatus.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const merchant = merchantQuery.data;
  const onboardingStatus = onboarding.data;
  const setupCompleted = onboardingStatus?.setupCompleted === true;
  const channelReady = onboardingStatus?.stage === 'ready';
  // A connected channel is not proof that automatic replies are enabled.
  const autoReplyEnabled = merchant?.autoReplyEnabled === 1;
  const assistantRunning = channelReady && autoReplyEnabled;
  const stats = summary.data?.stats;
  // Orders and item prices are stored in minor units. The summary never mixes currencies.
  const formatCurrency = (minor: number) =>
    formatMajorCurrency(minor / 100, summary.data?.currency ?? 'SAR');
  const period = `آخر ${dateRange} أيام · ${summary.data?.currency ?? 'SAR'}`;
  const rawChart =
    chartType === 'orders'
      ? summary.data?.ordersTrend
      : summary.data?.revenueTrend;
  const chart = [...(rawChart ?? [])]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(item => ({
      date: new Date(item.date).toLocaleDateString('ar-SA', {
        calendar: 'gregory',
        month: 'short',
        day: 'numeric',
      }),
      value: 'count' in item ? Number(item.count) : Number(item.revenue) / 100,
    }));

  if (merchantQuery.isLoading) return <DashboardSkeleton />;
  if (merchantQuery.error || !merchant)
    return (
      <QueryStateCard
        kind="error"
        title="تعذر تحميل المتجر"
        description="تحقق من المتجر المحدد وصلاحية الوصول ثم أعد المحاولة."
        onRetry={() => void merchantQuery.refetch()}
      />
    );

  return (
    <div className="mw-home">
      <header className="mw-page-heading">
        <div>
          <p className="mw-eyebrow">
            {new Date().toLocaleDateString('ar-SA', {
              calendar: 'gregory',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <h1>مرحبًا، {merchant.businessName}</h1>
          <p>هذه أبرز مستجدات متجرك. لنبدأ بما يحتاج انتباهك.</p>
        </div>
        <div className="mw-page-actions">
          <label htmlFor="dashboard-period" className="sr-only">
            فترة التقرير
          </label>
          <select
            id="dashboard-period"
            value={dateRange}
            onChange={event => setDateRange(Number(event.target.value))}
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يومًا</option>
            <option value={90}>آخر 90 يومًا</option>
          </select>
          <Button type="button" onClick={() => setQuickOpen(true)}>
            <Plus aria-hidden="true" />
            إجراء سريع
          </Button>
        </div>
      </header>
      <TrialBanner />
      {onboarding.error ? (
        <PanelError retry={() => void onboarding.refetch()} />
      ) : (
        onboardingStatus &&
        !setupCompleted && (
          <section role="status" className="mw-attention">
            <div>
              <h2>أكمل إعداد نشاطك قبل الإطلاق</h2>
              <p>
                يمكنك استكشاف لوحة التحكم الآن. راجع بيانات النشاط وأكّد الإعداد
                قبل بدء التشغيل.
              </p>
            </div>
            <Link href="/merchant/setup-wizard" className="mw-link">
              إكمال الإعداد
              <ArrowLeft aria-hidden="true" />
            </Link>
          </section>
        )
      )}
      <section className="mw-attention" aria-label="خطوتك التالية">
        <div>
          <h2>خطوتك التالية</h2>
          <p>مهام يومك، دون البحث بين الصفحات</p>
        </div>
        <div className="mw-task-links">
          <Link href="/merchant/conversations?needs_human=1">
            محادثات تحتاج تدخلك
            <ArrowLeft aria-hidden="true" />
          </Link>
          <Link href="/merchant/products">
            مراجعة الكتالوج والمخزون
            <ArrowLeft aria-hidden="true" />
          </Link>
          <Link href="/merchant/campaigns">
            متابعة حملاتك
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
      </section>
      {summary.isLoading ? (
        <div role="status" aria-busy="true">
          <DashboardSkeleton />
        </div>
      ) : summary.error || !stats ? (
        <PanelError retry={() => void summary.refetch()} />
      ) : (
        <>
          <section className="mw-metrics" aria-label="مؤشرات المتجر">
            {[
              {
                label: 'قيمة الطلبات',
                value: formatCurrency(stats.totalRevenue),
                note: `${period} · تشمل جميع حالات الطلب`,
                icon: TrendingUp,
                path: '/merchant/reports',
              },
              {
                label: 'إجمالي الطلبات',
                value: stats.totalOrders.toLocaleString(),
                note: `${period} · حسب تاريخ الإنشاء`,
                icon: Package,
                path: '/merchant/orders',
              },
              {
                label: 'متوسط قيمة الطلب',
                value: formatCurrency(stats.averageOrderValue),
                note: 'قيمة الطلبات ÷ إجمالي عددها',
                icon: TrendingUp,
                path: '/merchant/analytics',
              },
              {
                label: 'طلبات تم تسليمها',
                value: stats.completedOrders.toLocaleString(),
                note: `${period} · حالة «تم التسليم»`,
                icon: CheckCircle2,
                path: '/merchant/orders',
              },
            ].map(metric => (
              <Link key={metric.label} href={metric.path} className="mw-metric">
                <div>
                  <span>{metric.label}</span>
                  <metric.icon aria-hidden="true" />
                </div>
                <strong>{metric.value}</strong>
                <small>{metric.note}</small>
              </Link>
            ))}
          </section>
          <div className="mw-home-grid">
            <section className="mw-panel">
              <div className="mw-panel-header">
                <div>
                  <h2>
                    {chartType === 'orders'
                      ? 'طلباتك خلال الفترة'
                      : 'قيمة الطلبات المسلّمة'}
                  </h2>
                  <p>
                    {period} ·{' '}
                    {chartType === 'orders'
                      ? 'عدد الطلبات حسب يوم الإنشاء'
                      : 'حسب يوم إنشاء الطلب؛ لا يمثل صافي التحصيل'}
                  </p>
                </div>
                <div className="mw-chart-switch">
                  <button
                    type="button"
                    aria-pressed={chartType === 'orders'}
                    onClick={() => setChartType('orders')}
                  >
                    الطلبات
                  </button>
                  <button
                    type="button"
                    aria-pressed={chartType === 'revenue'}
                    onClick={() => setChartType('revenue')}
                  >
                    القيمة
                  </button>
                </div>
              </div>
              {chart.length ? (
                <div
                  className="mw-chart"
                  role="img"
                  aria-label={
                    chartType === 'orders'
                      ? `اتجاه الطلبات خلال ${dateRange} أيام`
                      : `قيمة الطلبات المسلمة خلال ${dateRange} أيام`
                  }
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chart}
                      margin={{ left: 0, right: 8, top: 10, bottom: 4 }}
                    >
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        tickLine={false}
                        axisLine={false}
                        width={45}
                        allowDecimals={chartType !== 'orders'}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--card)',
                          color: 'var(--foreground)',
                          borderColor: 'var(--border)',
                          borderRadius: 9,
                          direction: 'rtl',
                        }}
                        formatter={(value: number) => [
                          chartType === 'orders'
                            ? value
                            : formatMajorCurrency(
                                value,
                                summary.data?.currency ?? 'SAR'
                              ),
                          chartType === 'orders' ? 'طلبات' : 'قيمة الطلبات',
                        ]}
                      />
                      <Bar
                        dataKey="value"
                        fill="var(--primary)"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={38}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="mw-empty-inline">
                  لا توجد طلبات {chartType === 'revenue' ? 'مسلّمة ' : ''}خلال
                  الفترة المختارة. جرّب فترة أخرى.
                </div>
              )}
              <Link href="/merchant/analytics-hub" className="mw-link">
                استكشف التحليلات
                <ArrowLeft aria-hidden="true" />
              </Link>
            </section>
            <section className="mw-panel mw-assistant-panel">
              <span className="mw-state-pill">
                {onboarding.isLoading
                  ? 'جارٍ التحقق من القناة'
                  : onboarding.error
                    ? 'تعذر التحقق من القناة'
                    : assistantRunning
                      ? 'القناة متصلة · الرد التلقائي مفعّل'
                      : channelReady
                        ? 'القناة متصلة · الرد التلقائي متوقف'
                        : 'بانتظار إكمال الربط'}
              </span>
              <h2>ساري، إلى جانبك</h2>
              <div className="mw-assistant-count">
                {count.isLoading
                  ? '…'
                  : count.error
                    ? '—'
                    : (count.data?.toLocaleString() ?? '—')}
                <small>محادثة في متجرك</small>
              </div>
              <p className="text-xs leading-6">
                {assistantRunning
                  ? 'تابع محادثات العملاء، وراجع معرفة المساعد من مكان واحد.'
                  : 'جهّز المعرفة، اختبر الإجابة، ثم أكمل ربط القناة وتشغيل الردود.'}
              </p>
              {channelReady && (
                <Link href="/merchant/bot-settings" className="mw-link">
                  إعدادات التشغيل
                  <ArrowLeft aria-hidden="true" />
                </Link>
              )}
              <Button asChild>
                <Link href="/merchant/test-sari">
                  <Sparkles aria-hidden="true" />
                  جرّب تجربة العميل
                </Link>
              </Button>
            </section>
          </div>
        </>
      )}
      <div className="mw-home-grid">
        <section className="mw-panel">
          <div className="mw-panel-header">
            <div>
              <h2>آخر المحادثات</h2>
              <p>افتح الحديث بسياق العميل الكامل</p>
            </div>
            <Link href="/merchant/conversations" className="mw-link">
              كل المحادثات
              <ArrowLeft aria-hidden="true" />
            </Link>
          </div>
          {recent.isLoading ? (
            <p role="status">جاري تحميل المحادثات…</p>
          ) : recent.error ? (
            <PanelError retry={() => void recent.refetch()} />
          ) : recent.data?.length ? (
            <div className="mw-home-list">
              {recent.data.map(conversation => (
                <Link
                  key={conversation.id}
                  href={`/merchant/conversations?phone=${encodeURIComponent(conversation.customerPhone)}`}
                >
                  <div>
                    <p>
                      {conversation.customerName || conversation.customerPhone}
                    </p>
                    <small dir="ltr">{conversation.customerPhone}</small>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {conversation.status === 'active'
                      ? 'نشطة'
                      : conversation.status === 'closed'
                        ? 'مغلقة'
                        : 'مؤرشفة'}
                  </span>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mw-empty-inline">
              تظهر محادثات عملائك هنا عند استقبالها.
              <br />
              <Link href="/merchant/whatsapp-instances" className="mw-link">
                إعداد قناة واتساب
              </Link>
            </div>
          )}
        </section>
        <section className="mw-panel">
          <div className="mw-panel-header">
            <div>
              <h2>نبض العلاقة</h2>
              <p>الحملات والتقييمات من بيانات متجرك</p>
            </div>
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="mw-home-list">
            <Link href="/merchant/campaigns">
              <div>
                <p>حملاتك</p>
                <small>إجمالي الحملات في المتجر</small>
              </div>
              <strong>
                {campaigns.error
                  ? 'تعذر التحميل'
                  : campaigns.isLoading
                    ? '…'
                    : (campaigns.data?.totalCampaigns ?? 0)}
              </strong>
            </Link>
            <Link href="/merchant/reviews">
              <div>
                <p>تقييمات العملاء</p>
                <small>
                  {reviews.data?.totalReviews
                    ? `${reviews.data.totalReviews} تقييمًا`
                    : 'لا توجد عينة كافية لحساب التقييم'}
                </small>
              </div>
              <strong>
                {reviews.error
                  ? 'تعذر التحميل'
                  : reviews.isLoading
                    ? '…'
                    : reviews.data?.totalReviews
                      ? reviews.data.averageRating.toFixed(1)
                      : '—'}
              </strong>
            </Link>
          </div>
        </section>
      </div>
      <section className="mw-panel">
        <div className="mw-panel-header">
          <div>
            <h2>الأكثر مبيعًا خلال الفترة</h2>
            <p>المنتجات في الطلبات المسلّمة · {period}</p>
          </div>
          <Link href="/merchant/products" className="mw-link">
            الكتالوج
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
        {summary.error ? (
          <PanelError retry={() => void summary.refetch()} />
        ) : summary.isLoading ? (
          <p role="status">جاري التحميل…</p>
        ) : summary.data?.topProducts.length ? (
          <div className="mw-home-list">
            {summary.data.topProducts.map((product, index) => (
              <div key={`${product.productName}-${index}`}>
                <span className="text-sm text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p>{product.productName}</p>
                  <small>
                    {product.totalSales} وحدة · متوسط السعر{' '}
                    {formatCurrency(product.averagePrice)}
                  </small>
                </div>
                <strong>{formatCurrency(product.totalRevenue)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="mw-empty-inline">
            لا توجد مبيعات مسلّمة للمنتجات خلال هذه الفترة.
          </p>
        )}
      </section>
      <details className="mw-panel">
        <summary className="mw-detail-summary">
          المعرفة والمزامنة واقتراحات ساري
        </summary>
        <div className="mt-4 space-y-5">
          <section
            role="status"
            className="rounded-lg border p-4 text-sm leading-7"
          >
            <p>
              {setupCompleted
                ? 'تمت المراجعة والتأكيد ✓'
                : 'إعداد النشاط غير مكتمل'}
            </p>
            <p>
              {channelReady
                ? 'واتساب متصل ✓'
                : 'لن تبدأ الردود قبل اكتمال الربط والتحقق'}
            </p>
          </section>
          <LearningEvidenceCard />
          <section>
            <h2 className="mb-3 font-semibold">حالة المزامنة</h2>
            {sync.error ? (
              <PanelError retry={() => void sync.refetch()} />
            ) : sync.isLoading ? (
              <p role="status">جاري تحميل المزامنة…</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {sync.data?.lastSyncAt
                    ? `آخر مزامنة: ${new Date(sync.data.lastSyncAt).toLocaleString('ar-SA')}`
                    : 'لم تتم المزامنة بعد'}
                </p>
                {sync.data?.hasData && (
                  <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {[
                      ['منتج / دورة', sync.data.products],
                      ['سؤال شائع', sync.data.faqs],
                      ['صفحة موقع', sync.data.discoveredPages],
                      ['قسم معرفة', sync.data.knowledgeSections],
                      ['عميل', sync.data.customers],
                    ].map(([label, value]) => (
                      <div className="rounded-lg border p-3" key={label}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-2 font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <Link href="/merchant/sari-brain" className="mw-link">
                  إدارة المعرفة والمصادر
                  <ArrowLeft aria-hidden="true" />
                </Link>
              </>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-semibold">ساري يقترح</h2>
            {insights.isLoading ? (
              <p role="status">جاري تحميل الاقتراحات…</p>
            ) : insights.error ? (
              <PanelError retry={() => void insights.refetch()} />
            ) : insights.data?.length ? (
              <div className="mw-tools-grid">
                {insights.data.map((insight, index) => (
                  <article className="rounded-lg border p-4" key={index}>
                    <h3 className="text-sm font-semibold">{insight.title}</h3>
                    <p className="my-3 text-xs leading-6 text-muted-foreground">
                      {insight.body}
                    </p>
                    {insight.action?.href?.startsWith('/merchant/') && (
                      <Link href={insight.action.href} className="mw-link">
                        {insight.action.label || 'عرض التفاصيل'}
                        <ArrowLeft aria-hidden="true" />
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                لا توجد اقتراحات جديدة الآن.
              </p>
            )}
          </section>
        </div>
      </details>
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ماذا تريد أن تنجز؟</DialogTitle>
            <DialogDescription>
              اختصارات إلى إجراءات متجرك الحالية
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {[
              ['/merchant/conversations', 'متابعة المحادثات'],
              ['/merchant/products', 'إدارة المنتجات'],
              ['/merchant/services/new', 'إضافة خدمة'],
              ['/merchant/sales-hub', 'إعداد عرض سعر'],
              ['/merchant/campaigns/new', 'تجهيز حملة'],
            ].map(([path, title]) => (
              <Button asChild key={path} variant="outline">
                <Link href={path}>
                  {title}
                  <ArrowLeft aria-hidden="true" />
                </Link>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
