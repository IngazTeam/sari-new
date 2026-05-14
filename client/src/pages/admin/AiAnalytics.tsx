import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Globe, TrendingUp, Users, Zap, Target, Sparkles, BarChart3,
  CheckCircle2, AlertTriangle, MessageSquare, ArrowUpRight, Store,
} from 'lucide-react';

const QUALITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: 'ممتاز', color: 'text-green-700', bg: 'bg-green-500' },
  good: { label: 'جيد', color: 'text-blue-700', bg: 'bg-blue-500' },
  average: { label: 'متوسط', color: 'text-yellow-700', bg: 'bg-yellow-500' },
  poor: { label: 'ضعيف', color: 'text-red-700', bg: 'bg-red-500' },
};

const SECTION_TYPE_LABELS: Record<string, string> = {
  identity: '🏢 هوية', services: '🛍️ خدمات', policies: '📋 سياسات',
  faq: '❓ أسئلة', contact: '📞 تواصل', team: '👥 فريق',
  achievements: '🏆 إنجازات', sales_intel: '💎 ذكاء مبيعات',
  opportunities: '🎯 فرص', custom: '📝 مخصص',
};

export default function AiAnalytics() {
  const { data: overview, isLoading } = trpc.adminAiAnalytics.getOverview.useQuery();
  const { data: websiteStats } = trpc.adminAiAnalytics.getWebsiteStats.useQuery();
  const { data: knowledgeStats } = trpc.adminAiAnalytics.getKnowledgeStats.useQuery();
  const { data: responseQuality } = trpc.adminAiAnalytics.getResponseQuality.useQuery();
  const { data: topOpportunities } = trpc.adminAiAnalytics.getTopOpportunities.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Brain className="h-12 w-12 text-primary animate-pulse" />
      </div>
    );
  }

  const totalDist = websiteStats?.distribution?.reduce((a: number, d: any) => a + Number(d.count), 0) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Brain className="h-8 w-8 text-primary" />
          📊 ذكاء المنصة — AI Analytics
        </h1>
        <p className="text-muted-foreground mt-1">إحصائيات شاملة عن أداء الذكاء الاصطناعي عبر جميع التجار</p>
      </div>

      {/* ═══ Overview Cards ═══ */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Merchants */}
        <Card className="border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">التجار</CardTitle>
            <Store className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.merchants.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">{overview?.merchants.active || 0}</span> نشط
              {(overview?.merchants.suspended || 0) > 0 && (
                <> · <span className="text-red-600">{overview?.merchants.suspended}</span> موقوف</>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Websites */}
        <Card className="border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مواقع محلّلة</CardTitle>
            <Globe className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.websites.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              متوسط الجودة: <span className="font-medium text-blue-600">{overview?.websites.avgScore || 0}%</span>
            </p>
          </CardContent>
        </Card>

        {/* Knowledge */}
        <Card className="border-emerald-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">أقسام المعرفة</CardTitle>
            <Brain className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.knowledge.totalSections || 0}</div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-emerald-600">{overview?.knowledge.merchantsWithKnowledge || 0}</span> تاجر لديه معرفة
            </p>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card className="border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">رسائل AI (30 يوم)</CardTitle>
            <MessageSquare className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(overview?.responses.totalMessages || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              نسبة التوصيل: <span className="font-medium text-purple-600">{overview?.responses.deliveryRate || 0}%</span>
            </p>
          </CardContent>
        </Card>

        {/* Avg Response */}
        <Card className="border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط زمن الرد</CardTitle>
            <Zap className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview?.responses.avgResponseMs ? `${(overview.responses.avgResponseMs / 1000).toFixed(1)}s` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">من استلام الرسالة حتى الرد</p>
          </CardContent>
        </Card>

        {/* Sales Intel */}
        <Card className="border-amber-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ذكاء المبيعات</CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.salesIntelCoverage || 0}</div>
            <p className="text-xs text-muted-foreground">تاجر لديه بيانات مبيعات AI</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Row 2: Website Analysis + Knowledge ═══ */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Website Quality Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-blue-500" />
              🌐 توزيع جودة المواقع
            </CardTitle>
            <CardDescription>تصنيف المواقع حسب نقاط الجودة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Distribution bar */}
            <div className="flex rounded-full overflow-hidden h-4">
              {websiteStats?.distribution?.map((d: any) => {
                const q = QUALITY_LABELS[d.quality] || { bg: 'bg-gray-400' };
                const pct = (Number(d.count) / totalDist) * 100;
                return pct > 0 ? (
                  <div key={d.quality} className={`${q.bg} transition-all`} style={{ width: `${pct}%` }} title={`${q.label}: ${d.count}`} />
                ) : null;
              })}
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-2">
              {websiteStats?.distribution?.map((d: any) => {
                const q = QUALITY_LABELS[d.quality] || { label: d.quality, color: 'text-gray-700', bg: 'bg-gray-400' };
                return (
                  <div key={d.quality} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${q.bg}`} />
                    <span className={`text-sm ${q.color}`}>{q.label}: <strong>{d.count}</strong></span>
                  </div>
                );
              })}
            </div>

            {/* Top industries */}
            {websiteStats?.industries && websiteStats.industries.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-sm font-semibold mb-2">أبرز الصناعات</p>
                <div className="flex flex-wrap gap-1.5">
                  {websiteStats.industries.slice(0, 8).map((ind: any) => (
                    <Badge key={ind.industry} variant="secondary" className="text-xs">
                      {ind.industry} ({ind.count}) — {ind.avg_score}%
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Knowledge Section Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-emerald-500" />
              🧠 أنواع أقسام المعرفة
            </CardTitle>
            <CardDescription>توزيع أقسام المعرفة عبر المنصة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Section types */}
            <div className="space-y-2">
              {knowledgeStats?.sectionTypes?.map((st: any) => {
                const total = knowledgeStats.sectionTypes.reduce((a: number, s: any) => a + Number(s.count), 0) || 1;
                const pct = Math.round((Number(st.count) / total) * 100);
                return (
                  <div key={st.section_type} className="flex items-center gap-3">
                    <span className="text-sm w-28 truncate">{SECTION_TYPE_LABELS[st.section_type] || st.section_type}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-left">{st.count}</span>
                  </div>
                );
              })}
            </div>

            {/* Source distribution */}
            {knowledgeStats?.sourceDistribution && knowledgeStats.sourceDistribution.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-sm font-semibold mb-2">مصادر المعرفة</p>
                <div className="flex flex-wrap gap-2">
                  {knowledgeStats.sourceDistribution.map((s: any) => (
                    <Badge key={s.source} variant="outline" className="text-xs">
                      {s.source === 'website' ? '🌐 موقع' : s.source === 'document' ? '📄 ملف' : s.source === 'manual' ? '✏️ يدوي' : s.source}: {s.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Row 3: Satisfaction + Merchant Health ═══ */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Customer Satisfaction */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-green-500" />
              😊 رضا العملاء
            </CardTitle>
            <CardDescription>تحليل المشاعر من المحادثات</CardDescription>
          </CardHeader>
          <CardContent>
            {responseQuality?.satisfaction ? (
              <div className="space-y-4">
                {/* Satisfaction ring */}
                <div className="flex items-center gap-6">
                  <div className="relative w-24 h-24 shrink-0">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="3"
                        strokeDasharray={`${responseQuality.satisfaction.positiveRate}, 100`}
                        className={responseQuality.satisfaction.positiveRate >= 70 ? 'stroke-green-500' : responseQuality.satisfaction.positiveRate >= 40 ? 'stroke-yellow-500' : 'stroke-red-500'}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold">{responseQuality.satisfaction.positiveRate}%</span>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex justify-between text-sm">
                      <span>😊 إيجابي</span>
                      <span className="font-medium text-green-600">{responseQuality.satisfaction.positive}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>😐 محايد</span>
                      <span className="font-medium text-gray-600">{responseQuality.satisfaction.neutral}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>😞 سلبي</span>
                      <span className="font-medium text-red-600">{responseQuality.satisfaction.negative}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-1">
                      <span>الإجمالي</span>
                      <span className="font-bold">{responseQuality.satisfaction.total}</span>
                    </div>
                  </div>
                </div>

                {/* Escalation */}
                {responseQuality.escalationRate > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm">نسبة التحويل للتاجر: <strong>{responseQuality.escalationRate}%</strong></span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">لا توجد بيانات sentiment بعد</p>
            )}

            {/* Top questions */}
            {responseQuality?.topQuestions && responseQuality.topQuestions.length > 0 && (
              <div className="pt-4 border-t mt-4">
                <p className="text-sm font-semibold mb-2">🔥 أكثر الأسئلة تكراراً</p>
                <div className="space-y-1.5">
                  {responseQuality.topQuestions.slice(0, 5).map((q: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs shrink-0">{q.hitCount}×</Badge>
                      <span className="truncate">{q.question}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Merchant Knowledge Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              🏪 صحة المعرفة لكل تاجر
            </CardTitle>
            <CardDescription>أفضل 20 تاجر من حيث المحتوى المعرفي</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {knowledgeStats?.merchantHealth?.map((m: any) => (
                <div key={m.merchantId} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.merchantName}</p>
                    <p className="text-[10px] text-muted-foreground">{m.sectionCount} قسم · {m.typeCount} أنواع</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {m.hasIntel && <Badge className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5">💎</Badge>}
                    {m.hasOpps && <Badge className="bg-amber-100 text-amber-800 text-[10px] px-1.5">🎯</Badge>}
                    {!m.hasIntel && !m.hasOpps && m.sectionCount === 0 && (
                      <Badge variant="outline" className="text-[10px] text-red-500">فارغ</Badge>
                    )}
                  </div>
                </div>
              ))}
              {(!knowledgeStats?.merchantHealth || knowledgeStats.merchantHealth.length === 0) && (
                <p className="text-center text-muted-foreground py-8">لا توجد بيانات بعد</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Row 4: Weak Websites + Opportunities ═══ */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Websites needing improvement */}
        <Card className="border-red-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ⚠️ مواقع تحتاج تحسين
            </CardTitle>
            <CardDescription>مواقع جودتها أقل من 50%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {websiteStats?.needsImprovement?.map((site: any) => (
                <div key={site.id} className="flex items-center gap-3 p-2 rounded-lg border border-red-100 bg-red-50/30 dark:bg-red-950/10">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm shrink-0">
                    {site.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{site.merchantName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{site.url}</p>
                  </div>
                  {site.industry && <Badge variant="outline" className="text-[10px]">{site.industry}</Badge>}
                </div>
              ))}
              {(!websiteStats?.needsImprovement || websiteStats.needsImprovement.length === 0) && (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">جميع المواقع بجودة جيدة 🎉</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Opportunities */}
        <Card className="border-amber-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-amber-500" />
              🎯 أبرز الفرص المكتشفة
            </CardTitle>
            <CardDescription>فرص تطوير اكتشفها الذكاء الاصطناعي</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {topOpportunities?.map((opp: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border border-amber-100 bg-amber-50/30 dark:bg-amber-950/10">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpRight className="h-3 w-3 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{opp.merchantName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{opp.content}</p>
                </div>
              ))}
              {(!topOpportunities || topOpportunities.length === 0) && (
                <p className="text-center text-muted-foreground py-8">لم يتم اكتشاف فرص بعد</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
