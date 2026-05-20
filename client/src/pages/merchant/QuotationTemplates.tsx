import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  FileText, Plus, Trash2, Star, StarOff, Pencil, Eye, X,
  Save, Image, ChevronDown, ChevronUp, Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// ═══════════════════════════════════════════════════════════════
// Quotation Templates Management Page
// ═══════════════════════════════════════════════════════════════

export default function QuotationTemplates() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();

  // Data
  const { data: templates, isLoading } = trpc.sariBrain.getQuotationTemplates.useQuery();

  // Mutations
  const createMut = trpc.sariBrain.createQuotationTemplate.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء القالب بنجاح');
      utils.sariBrain.getQuotationTemplates.invalidate();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.sariBrain.updateQuotationTemplate.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث القالب');
      utils.sariBrain.getQuotationTemplates.invalidate();
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.sariBrain.deleteQuotationTemplate.useMutation({
    onSuccess: () => {
      toast.success('تم حذف القالب');
      utils.sariBrain.getQuotationTemplates.invalidate();
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState<number | null>(null);

  const [formName, setFormName] = useState('');
  const [formHeader, setFormHeader] = useState('');
  const [formFooter, setFormFooter] = useState('');
  const [formTerms, setFormTerms] = useState('');
  const [formDefault, setFormDefault] = useState(false);

  function resetForm() {
    setFormName('');
    setFormHeader('');
    setFormFooter('');
    setFormTerms('');
    setFormDefault(false);
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(tmpl: any) {
    setEditingId(tmpl.id);
    setFormName(tmpl.name || '');
    setFormHeader(tmpl.headerImageUrl || tmpl.header_image_url || '');
    setFormFooter(tmpl.footerText || tmpl.footer_text || '');
    setFormTerms(tmpl.termsText || tmpl.terms_text || '');
    setFormDefault(!!(tmpl.isDefault || tmpl.is_default));
    setShowForm(true);
  }

  function handleSave() {
    if (!formName.trim()) {
      toast.error('يرجى إدخال اسم القالب');
      return;
    }

    if (editingId) {
      updateMut.mutate({
        templateId: editingId,
        name: formName.trim(),
        headerImageUrl: formHeader.trim() || null,
        footerText: formFooter.trim() || null,
        termsText: formTerms.trim() || null,
        isDefault: formDefault,
      });
    } else {
      createMut.mutate({
        name: formName.trim(),
        footerText: formFooter.trim() || undefined,
        termsText: formTerms.trim() || undefined,
        isDefault: formDefault,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // WhatsApp-Style Preview
  // ═══════════════════════════════════════════════════════════════

  const previewTemplate = useMemo(() => {
    if (showPreview === null && !showForm) return null;

    // If previewing an existing template
    if (showPreview !== null) {
      const t = templates?.find((x: any) => x.id === showPreview);
      if (!t) return null;
      return {
        name: t.name,
        headerImageUrl: (t as any).headerImageUrl || (t as any).header_image_url || '',
        footerText: (t as any).footerText || (t as any).footer_text || '',
        termsText: (t as any).termsText || (t as any).terms_text || '',
      };
    }

    // If previewing form (live edit)
    return {
      name: formName || 'قالب جديد',
      headerImageUrl: formHeader,
      footerText: formFooter,
      termsText: formTerms,
    };
  }, [showPreview, showForm, templates, formName, formHeader, formFooter, formTerms]);

  function renderPreview(tmpl: { name: string; headerImageUrl: string; footerText: string; termsText: string }) {
    const sampleItems = [
      { name: 'خدمة التصميم الجرافيكي', quantity: 2, unitPrice: 500, total: 1000 },
      { name: 'إدارة حسابات التواصل', quantity: 1, unitPrice: 1500, total: 1500 },
    ];
    const subtotal = 2500;
    const tax = 375;
    const total = 2875;

    return (
      <div className="bg-[#0b141a] rounded-2xl overflow-hidden max-w-md mx-auto shadow-2xl border border-white/5">
        {/* WhatsApp Header */}
        <div className="bg-[#1f2c33] px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
            <Receipt className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">معاينة عرض السعر</p>
            <p className="text-[#8696a0] text-[11px]">باستخدام: {tmpl.name}</p>
          </div>
        </div>

        {/* Chat Bubble */}
        <div className="p-4 min-h-[300px]">
          {/* Header Image */}
          {tmpl.headerImageUrl && (
            <div className="mb-3 rounded-xl overflow-hidden">
              <img
                src={tmpl.headerImageUrl}
                alt="Header"
                className="w-full h-32 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          <div className="bg-[#005c4b] rounded-xl rounded-tr-sm p-3 max-w-[95%] mr-auto">
            <p className="text-white text-sm font-bold mb-1">📋 *عرض سعر رقم: Q-250520-1-4829*</p>
            <p className="text-white/90 text-sm">من: *متجري الإلكتروني*</p>
            <p className="text-white/90 text-sm mb-2">إلى: أحمد محمد</p>
            <div className="border-t border-white/20 my-2" />

            {sampleItems.map((item, i) => (
              <div key={i} className="mb-2">
                <p className="text-white text-sm font-medium">{i + 1}. *{item.name}*</p>
                <p className="text-white/80 text-xs mr-3">
                  الكمية: {item.quantity} × {item.unitPrice.toFixed(2)} = {item.total.toFixed(2)} ر.س
                </p>
              </div>
            ))}

            <div className="border-t border-white/20 my-2" />
            <p className="text-white/90 text-sm">المجموع: {subtotal.toFixed(2)} ر.س</p>
            <p className="text-white/90 text-sm">الضريبة (15%): {tax.toFixed(2)} ر.س</p>
            <p className="text-white text-sm font-bold">*الإجمالي: {total.toFixed(2)} ر.س*</p>

            <p className="text-white/90 text-sm mt-2">⏰ صالح حتى: 2026-06-20</p>

            {tmpl.termsText && (
              <>
                <div className="border-t border-white/20 my-2" />
                <p className="text-white/80 text-xs">📌 الشروط:</p>
                <p className="text-white/70 text-xs whitespace-pre-wrap">{tmpl.termsText}</p>
              </>
            )}

            {tmpl.footerText && (
              <p className="text-white/60 text-xs mt-2 pt-1 border-t border-white/10">{tmpl.footerText}</p>
            )}

            <p className="text-[#8696a0] text-[10px] text-left mt-2">09:15 ✓✓</p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20">
              <FileText className="h-6 w-6 text-violet-400" />
            </div>
            قوالب عروض الأسعار
          </h1>
          <p className="text-muted-foreground mt-1">
            أنشئ وخصص قوالب احترافية لعروض الأسعار مع معاينة مباشرة
          </p>
        </div>
        {!showForm && (
          <Button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg"
          >
            <Plus className="h-4 w-4 ml-2" />
            إنشاء قالب جديد
          </Button>
        )}
      </div>

      {/* ═════════ Form + Preview Layout ═════════ */}
      {showForm && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card className="bg-card/60 backdrop-blur-sm border-white/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {editingId ? <Pencil className="h-5 w-5 text-amber-400" /> : <Plus className="h-5 w-5 text-violet-400" />}
                {editingId ? 'تعديل القالب' : 'قالب جديد'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">اسم القالب *</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: قالب رسمي، قالب بسيط..."
                  className="bg-background/50"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  <Image className="h-3.5 w-3.5 inline ml-1" />
                  رابط صورة الهيدر (اختياري)
                </label>
                <Input
                  value={formHeader}
                  onChange={(e) => setFormHeader(e.target.value)}
                  placeholder="https://example.com/header.jpg"
                  className="bg-background/50 ltr"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">الشروط والأحكام (اختياري)</label>
                <Textarea
                  value={formTerms}
                  onChange={(e) => setFormTerms(e.target.value)}
                  placeholder="مثال: الأسعار لا تشمل الضريبة. العرض صالح لمدة 30 يوم..."
                  rows={3}
                  className="bg-background/50 resize-none"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">نص التذييل (اختياري)</label>
                <Textarea
                  value={formFooter}
                  onChange={(e) => setFormFooter(e.target.value)}
                  placeholder="مثال: شكراً لاختياركم خدماتنا 🙏"
                  rows={2}
                  className="bg-background/50 resize-none"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer group">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    formDefault
                      ? 'bg-amber-500 border-amber-500'
                      : 'border-white/20 group-hover:border-white/40'
                  }`}
                  onClick={() => setFormDefault(!formDefault)}
                >
                  {formDefault && <Star className="h-3 w-3 text-white" />}
                </div>
                <span className="text-sm" onClick={() => setFormDefault(!formDefault)}>تعيين كقالب افتراضي</span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={createMut.isPending || updateMut.isPending}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white flex-1"
                >
                  <Save className="h-4 w-4 ml-2" />
                  {createMut.isPending || updateMut.isPending ? 'جاري الحفظ...' : editingId ? 'حفظ التعديلات' : 'إنشاء القالب'}
                </Button>
                <Button variant="outline" onClick={resetForm} className="border-white/10">
                  <X className="h-4 w-4 ml-1" />
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-muted-foreground">معاينة مباشرة — WhatsApp</span>
            </div>
            {renderPreview({
              name: formName || 'قالب جديد',
              headerImageUrl: formHeader,
              footerText: formFooter,
              termsText: formTerms,
            })}
          </div>
        </div>
      )}

      {/* ═════════ Template Preview Modal ═════════ */}
      {showPreview !== null && previewTemplate && !showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPreview(null)}>
          <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(null)} className="text-white/60 hover:text-white">
                <X className="h-5 w-5" />
              </Button>
            </div>
            {renderPreview(previewTemplate)}
          </div>
        </div>
      )}

      {/* ═════════ Templates List ═════════ */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tmpl: any) => {
            const isDefault = tmpl.isDefault || tmpl.is_default;
            const terms = tmpl.termsText || tmpl.terms_text || '';
            const footer = tmpl.footerText || tmpl.footer_text || '';
            const header = tmpl.headerImageUrl || tmpl.header_image_url || '';

            return (
              <Card
                key={tmpl.id}
                className={`bg-card/60 backdrop-blur-sm border transition-all hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5 ${
                  isDefault ? 'border-amber-500/30 ring-1 ring-amber-500/10' : 'border-white/10'
                }`}
              >
                {/* Card Header Image Preview */}
                {header && (
                  <div className="h-20 overflow-hidden rounded-t-xl">
                    <img src={header} alt="" className="w-full h-full object-cover opacity-60" />
                  </div>
                )}

                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {isDefault && (
                        <div className="p-1 rounded-md bg-amber-500/20">
                          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                        </div>
                      )}
                      <h3 className="font-semibold text-white">{tmpl.name}</h3>
                    </div>
                    {isDefault && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">
                        افتراضي
                      </span>
                    )}
                  </div>

                  {/* Content Preview */}
                  <div className="space-y-1.5">
                    {terms && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 shrink-0">شروط</span>
                        <p className="text-xs text-muted-foreground line-clamp-1">{terms}</p>
                      </div>
                    )}
                    {footer && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">تذييل</span>
                        <p className="text-xs text-muted-foreground line-clamp-1">{footer}</p>
                      </div>
                    )}
                    {!terms && !footer && (
                      <p className="text-xs text-muted-foreground/50 italic">بدون شروط أو تذييل</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-white/5">
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 flex-1"
                      onClick={() => setShowPreview(tmpl.id)}
                    >
                      <Eye className="h-3.5 w-3.5 ml-1" />
                      معاينة
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 flex-1"
                      onClick={() => startEdit(tmpl)}
                    >
                      <Pencil className="h-3.5 w-3.5 ml-1" />
                      تعديل
                    </Button>
                    {deleteConfirm === tmpl.id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="sm"
                          className="h-8 text-xs text-red-400 hover:bg-red-500/10"
                          onClick={() => deleteMut.mutate({ templateId: tmpl.id })}
                          disabled={deleteMut.isPending}
                        >
                          تأكيد
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-8 text-xs"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 w-8 p-0 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => setDeleteConfirm(tmpl.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : !showForm ? (
        /* Empty State */
        <Card className="bg-card/40 backdrop-blur-sm border-white/5 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-600/10 mb-4">
              <FileText className="h-10 w-10 text-violet-400/60" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">لا توجد قوالب بعد</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              أنشئ قالب عرض سعر مخصص يتضمن شروطك وأحكامك وشعار شركتك لتقديم عروض احترافية لعملائك
            </p>
            <Button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
            >
              <Plus className="h-4 w-4 ml-2" />
              إنشاء أول قالب
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
