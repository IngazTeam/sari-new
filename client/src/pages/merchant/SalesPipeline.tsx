import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Flame, Clock, CreditCard, AlertTriangle, TrendingUp, TrendingDown,
  Minus, Users, ShoppingCart, Phone, DollarSign, BarChart3,
  MessageCircle, ExternalLink, RefreshCw,
} from 'lucide-react';
import { useLocation } from 'wouter';

// ═══════════════════════════════════════════════════════════════
// Navigation Helper
// ═══════════════════════════════════════════════════════════════

function useOpenConversation() {
  const [, navigate] = useLocation();
  return (phone?: string, name?: string) => {
    if (!phone) return;
    // Navigate to conversations page with phone filter
    const params = new URLSearchParams();
    params.set('phone', phone);
    if (name) params.set('name', name);
    navigate(`/merchant/conversations?${params.toString()}`);
  };
}

// ═══════════════════════════════════════════════════════════════
// Loss Reason Labels
// ═══════════════════════════════════════════════════════════════

const LOSS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  price: { label: 'السعر', icon: '💰', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  trust: { label: 'الثقة', icon: '🤝', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  competitor: { label: 'منافس', icon: '🏪', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  delivery: { label: 'التوصيل', icon: '🚚', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  payment_failed: { label: 'فشل الدفع', icon: '❌', color: 'bg-red-100 text-red-800 border-red-200' },
  payment_abandoned: { label: 'دفع غير مكتمل', icon: '🛒', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  no_response: { label: 'لم يرد', icon: '👻', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  human_needed: { label: 'يحتاج إنسان', icon: '🙋', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
};

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'جديد', color: 'bg-slate-100 text-slate-800' },
  interested: { label: 'مهتم', color: 'bg-blue-100 text-blue-800' },
  qualified: { label: 'مؤهل', color: 'bg-indigo-100 text-indigo-800' },
  ready: { label: 'جاهز', color: 'bg-emerald-100 text-emerald-800' },
  payment_link_sent: { label: 'رابط دفع', color: 'bg-amber-100 text-amber-800' },
  purchased: { label: 'اشترى', color: 'bg-green-100 text-green-800' },
  paid: { label: 'دفع ✅', color: 'bg-green-200 text-green-900' },
  lost: { label: 'خسارة', color: 'bg-red-100 text-red-800' },
  payment_failed: { label: 'فشل دفع', color: 'bg-red-100 text-red-800' },
};

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function SalesPipeline() {
  const { data: actions } = trpc.salesPipeline.getActionCounts.useQuery();
  const { data: kpis } = trpc.salesPipeline.getKPIs.useQuery();
  const { data: pipeline } = trpc.salesPipeline.getPipeline.useQuery();
  const { data: lossBreakdown } = trpc.salesPipeline.getLossBreakdown.useQuery({ days: 30 });
  const openConversation = useOpenConversation();
  const [, navigate] = useLocation();

  const trendIcon = kpis?.weeklyTrend === 'up'
    ? <TrendingUp className="h-4 w-4 text-green-600" />
    : kpis?.weeklyTrend === 'down'
      ? <TrendingDown className="h-4 w-4 text-red-600" />
      : <Minus className="h-4 w-4 text-gray-400" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          غرفة قيادة المبيعات
        </h1>
        <p className="text-muted-foreground mt-2">
          تابع صفقاتك ومبيعاتك في الوقت الحقيقي — انقر على أي بطاقة للتنفيذ
        </p>
      </div>

      {/* ═══════ Row 1: Action Cards — "ماذا يحتاج انتباهك" ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-emerald-300 transition-all"
          onClick={() => navigate('/merchant/conversations?stage=ready')}
        >
          <CardContent className="pt-4 text-center">
            <div className="flex justify-center mb-2">
              <div className="p-2 rounded-full bg-emerald-100">
                <Flame className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-emerald-700">{actions?.readyToPay || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">🔥 جاهزون للدفع</p>
            <p className="text-[10px] text-emerald-600 mt-1 flex items-center justify-center gap-1">
              <ExternalLink className="h-3 w-3" /> انقر لفتح المحادثات
            </p>
          </CardContent>
        </Card>

        <Card
          className="border-orange-200 bg-gradient-to-br from-orange-50 to-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-orange-300 transition-all"
          onClick={() => navigate('/merchant/conversations?needs_human=1')}
        >
          <CardContent className="pt-4 text-center">
            <div className="flex justify-center mb-2">
              <div className="p-2 rounded-full bg-orange-100">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-orange-700">{actions?.needsHuman || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">⚠️ تحتاج تدخلك</p>
            <p className="text-[10px] text-orange-600 mt-1 flex items-center justify-center gap-1">
              <ExternalLink className="h-3 w-3" /> انقر للمراجعة
            </p>
          </CardContent>
        </Card>

        <Card
          className="border-amber-200 bg-gradient-to-br from-amber-50 to-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-amber-300 transition-all"
          onClick={() => navigate('/merchant/conversations?stage=payment_link_sent')}
        >
          <CardContent className="pt-4 text-center">
            <div className="flex justify-center mb-2">
              <div className="p-2 rounded-full bg-amber-100">
                <CreditCard className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-amber-700">{actions?.paymentPending || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">💳 دفع لم يكتمل</p>
            <p className="text-[10px] text-amber-600 mt-1 flex items-center justify-center gap-1">
              <ExternalLink className="h-3 w-3" /> انقر للمتابعة
            </p>
          </CardContent>
        </Card>

        <Card
          className="border-slate-200 bg-gradient-to-br from-slate-50 to-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-slate-300 transition-all"
          onClick={() => navigate('/merchant/conversations?stage=stalled')}
        >
          <CardContent className="pt-4 text-center">
            <div className="flex justify-center mb-2">
              <div className="p-2 rounded-full bg-slate-100">
                <Clock className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-700">{actions?.stalled || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">⏸️ متوقفة</p>
            <p className="text-[10px] text-slate-600 mt-1 flex items-center justify-center gap-1">
              <ExternalLink className="h-3 w-3" /> انقر لإعادة التواصل
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ Row 2: KPIs ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">نسبة التحويل</p>
              {trendIcon}
            </div>
            <p className={`text-2xl font-bold mt-1 ${(kpis?.conversionRate || 0) >= 30 ? 'text-green-600' : 'text-orange-600'}`}>
              {kpis?.conversionRate || 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">إيرادات الشهر</p>
            <p className="text-2xl font-bold mt-1 text-primary">
              {(kpis?.totalRevenue || 0).toLocaleString()} <span className="text-sm font-normal">ر.س</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">أكثر سبب خسارة</p>
            <p className="text-lg font-bold mt-1">
              {kpis?.topLossReason ? `${LOSS_LABELS[kpis.topLossReason]?.icon || '❓'} ${LOSS_LABELS[kpis.topLossReason]?.label || kpis.topLossReason}` : '—'}
            </p>
            {kpis?.topLossCount ? <p className="text-xs text-muted-foreground">{kpis.topLossCount} مرة</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">مقارنة أسبوعية</p>
            <p className="text-lg font-bold mt-1">
              {kpis?.thisWeekWins || 0} <span className="text-sm font-normal text-muted-foreground">هذا الأسبوع</span>
            </p>
            <p className="text-xs text-muted-foreground">vs {kpis?.lastWeekWins || 0} الأسبوع الماضي</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ Row 3: Pipeline Kanban ═══════ */}
      {pipeline?.stages && Object.keys(pipeline.stages).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              خط سير الصفقات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {['new', 'interested', 'qualified', 'ready', 'payment_link_sent', 'paid', 'lost'].map(stage => {
                const info = STAGE_LABELS[stage];
                const count = pipeline.stages[stage] || 0;
                if (!info) return null;
                return (
                  <div key={stage} className="flex items-center gap-2">
                    <div
                      className={`px-3 py-2 rounded-lg text-center min-w-[80px] cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all ${info.color}`}
                      onClick={() => navigate(`/merchant/conversations?stage=${stage}`)}
                      title={`عرض محادثات: ${info.label}`}
                    >
                      <p className="text-xl font-bold">{count}</p>
                      <p className="text-[10px]">{info.label}</p>
                    </div>
                    {stage !== 'lost' && <span className="text-muted-foreground">→</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════ Row 4: Lists ═══════ */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Hot Leads */}
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              🔥 عملاء جاهزون للدفع
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline?.hotLeads && pipeline.hotLeads.length > 0 ? (
              <div className="space-y-2">
                {pipeline.hotLeads.map((lead: any) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 hover:bg-emerald-100/50 transition-colors cursor-pointer group"
                    onClick={() => openConversation(lead.customerPhone, lead.customerName)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span className="text-sm font-medium truncate">{lead.customerName || lead.customerPhone}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); openConversation(lead.customerPhone, lead.customerName); }}
                    >
                      <MessageCircle className="h-3.5 w-3.5 ml-1" />
                      فتح المحادثة
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">لا يوجد عملاء جاهزون حالياً</p>
            )}
          </CardContent>
        </Card>

        {/* Payment Pending */}
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              💳 دفع لم يكتمل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline?.paymentPending && pipeline.paymentPending.length > 0 ? (
              <div className="space-y-2">
                {pipeline.paymentPending.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-amber-50/50 border border-amber-100 hover:bg-amber-100/50 transition-colors cursor-pointer group"
                    onClick={() => openConversation(item.customerPhone, item.customerName)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ShoppingCart className="h-3 w-3 text-amber-600 shrink-0" />
                      <span className="text-sm font-medium truncate">{item.customerName || item.customerPhone}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {item.payment_link_sent_at ? new Date(item.payment_link_sent_at).toLocaleDateString('ar-SA') : ''}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-amber-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); openConversation(item.customerPhone, item.customerName); }}
                    >
                      <MessageCircle className="h-3.5 w-3.5 ml-1" />
                      تذكير
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">لا يوجد روابط دفع معلقة</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Wins */}
        <Card className="border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              ✅ صفقات مدفوعة (آخر 7 أيام)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline?.recentWins && pipeline.recentWins.length > 0 ? (
              <div className="space-y-2">
                {pipeline.recentWins.map((win: any) => (
                  <div
                    key={win.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-green-50/50 border border-green-100 hover:bg-green-100/50 transition-colors cursor-pointer"
                    onClick={() => openConversation(win.customerPhone, win.customerName)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <DollarSign className="h-3 w-3 text-green-600 shrink-0" />
                      <span className="text-sm font-medium truncate">{win.customerName || win.customerPhone}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {win.lastMessageAt ? new Date(win.lastMessageAt).toLocaleDateString('ar-SA') : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد صفقات هذا الأسبوع</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Losses */}
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              ❌ صفقات خاسرة (آخر 7 أيام)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline?.recentLosses && pipeline.recentLosses.length > 0 ? (
              <div className="space-y-2">
                {pipeline.recentLosses.map((loss: any) => {
                  const info = LOSS_LABELS[loss.loss_reason] || { label: loss.loss_reason, icon: '❓', color: 'bg-gray-100 text-gray-800 border-gray-200' };
                  return (
                    <div
                      key={loss.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-red-50/50 border border-red-100 hover:bg-red-100/50 transition-colors cursor-pointer group"
                      onClick={() => openConversation(loss.customerPhone, loss.customerName)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">{info.icon}</span>
                        <span className="text-sm font-medium truncate">{loss.customerName || loss.customerPhone}</span>
                        <Badge className={`text-[10px] ${info.color}`}>{info.label}</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); openConversation(loss.customerPhone, loss.customerName); }}
                      >
                        <RefreshCw className="h-3.5 w-3.5 ml-1" />
                        محاولة استرداد
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد صفقات خاسرة 🎉</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ Row 5: Loss Reasons Chart ═══════ */}
      {lossBreakdown && lossBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📊 تحليل أسباب الخسارة (آخر 30 يوم)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lossBreakdown.map((item: any) => {
                const total = lossBreakdown.reduce((s: number, i: any) => s + i.count, 0);
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                const info = LOSS_LABELS[item.reason] || { label: item.reason, icon: '❓', color: 'bg-gray-100' };
                return (
                  <div key={item.reason}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{info.icon} {info.label}</span>
                      <span className="text-sm text-muted-foreground">{item.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60 transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
