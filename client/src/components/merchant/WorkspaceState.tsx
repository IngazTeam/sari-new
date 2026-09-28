import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Clock3, Compass, LockKeyhole, RefreshCw, Search, ShieldCheck, Sparkles, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMerchantViewport } from '@/lib/merchant-viewport';
import { Button } from '@/components/ui/button';
import '@/styles/merchant-workspace.css';
import '@/styles/merchant-mobile.css';

export const workspaceStates = {
  payment: { code: 'PAYMENT', icon: Clock3, ar: ['راجع حالة الدفع', 'راجع اشتراكك قبل إعادة محاولة الدفع.'], en: ['Review your payment status', 'Check your subscription before trying the payment again.'] },
  missing: { code: '404', icon: Compass, ar: ['هذه الصفحة ليست هنا', 'قد يكون الرابط قد تغير. ارجع إلى مساحة عملك، أو ابحث عن الأداة التي تحتاجها.'], en: ['This page is not here', 'The link may have changed. Return to your workspace or find the tool you need.'] },
  error: { code: '500', icon: RefreshCw, ar: ['تعذّر عرض الصفحة', 'حدث خلل أثناء التحميل. أعد المحاولة، أو انتقل إلى قسم آخر من القائمة.'], en: ['We could not load this page', 'Something interrupted loading. Try again or open another section from the menu.'] },
  offline: { code: 'CONNECTION', icon: WifiOff, ar: ['تعذّر الاتصال', 'تحقق من اتصالك ثم أعد المحاولة. لا نعرض بيانات فارغة بدل البيانات التي لم تصل.'], en: ['Unable to connect', 'Check your connection and try again. Unavailable data is not shown as an empty result.'] },
  forbidden: { code: '403', icon: ShieldCheck, ar: ['تحتاج صلاحية لهذا القسم', 'اطلب من مالك المتجر مراجعة صلاحياتك، أو انتقل إلى قسم متاح لك.'], en: ['You need access to this section', 'Ask the store owner to review your permissions, or open another section.'] },
  session: { code: '401', icon: LockKeyhole, ar: ['سجّل الدخول إلى مساحة عملك', 'سجّل الدخول للوصول إلى بيانات متجرك ومتابعة عملك.'], en: ['Sign in to your workspace', 'Sign in to access your store and continue your work.'] },
  empty: { code: 'START', icon: Sparkles, ar: ['مساحتك جاهزة للبداية', 'ستظهر العناصر هنا بعد إضافتها. ابدأ بخطوة واحدة، وأكمل التفاصيل لاحقًا.'], en: ['Ready for your first step', 'Items appear here once you add them. Start with the essentials and add details later.'] },
  loading: { code: 'LOADING', icon: RefreshCw, ar: ['نجهّز مساحة عملك', 'جارٍ تحميل أحدث البيانات…'], en: ['Getting your workspace ready', 'Loading your latest data…'] },
} as const;
export type WorkspaceStateKind = keyof typeof workspaceStates;

export function workspaceFailureKind(error: unknown): WorkspaceStateKind {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return code === 'FORBIDDEN' ? 'forbidden' : code === 'UNAUTHORIZED' ? 'session' : code === 'NOT_FOUND' ? 'missing' : 'error';
}

export function WorkspaceState({ kind = 'error', onRetry, title, description, action, focus = false, inline = false }: {
  kind?: WorkspaceStateKind; onRetry?: () => void; title?: string; description?: string; action?: ReactNode; focus?: boolean; inline?: boolean;
}) {
  const { i18n } = useTranslation();
  const language = i18n.language?.startsWith('en') ? 'en' : 'ar';
  const config = workspaceStates[kind];
  const heading = useRef<HTMLHeadingElement>(null);
  const Heading = inline ? 'h2' : 'h1';
  useEffect(() => { if (focus) heading.current?.focus(); }, [focus, kind]);
  const copy = (ar: string, en: string) => language === 'ar' ? ar : en;
  const loading = kind === 'loading';
  return (
    <section className={`mw-state ${inline ? 'mw-state-inline' : ''}`} data-state={kind} aria-busy={loading} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mw-state-art" aria-hidden="true">
        <span className="mw-state-orbit" /><span className="mw-state-mark"><config.icon /></span>
        <span className="mw-state-code">{config.code}</span>
      </div>
      <div className="mw-state-copy">
        <p className="mw-eyebrow">{copy('مساحة التاجر · ساري', 'Sary · Merchant workspace')}</p>
        <Heading ref={heading} tabIndex={-1}>{title || config[language][0]}</Heading>
        <p role={loading ? 'status' : undefined}>{description || config[language][1]}</p>
        {loading ? <div className="mw-state-loading" aria-hidden="true"><span /><span /><span /></div> : (
          <div className="mw-state-actions">
            {action || (kind === 'session' ? <Button asChild><a href="/login">{copy('تسجيل الدخول', 'Sign in')}<ArrowLeft aria-hidden="true" /></a></Button>
              : onRetry ? <Button onClick={onRetry}><RefreshCw aria-hidden="true" />{copy('إعادة المحاولة', 'Try again')}</Button>
              : <Button asChild><Link href="/merchant/dashboard">{copy('العودة لمساحة العمل', 'Back to workspace')}<ArrowLeft aria-hidden="true" /></Link></Button>)}
            {kind !== 'session' && <Button variant="outline" asChild><Link href="/merchant/tools"><Search aria-hidden="true" />{copy('ابحث عن أداة', 'Find a tool')}</Link></Button>}
          </div>
        )}
        {!loading && kind !== 'empty' && <p className="mw-state-help">{copy('تحتاج مساعدة؟', 'Need help?')} <a href="/support">{copy('تواصل مع الدعم', 'Contact support')}</a></p>}
      </div>
    </section>
  );
}

export function WorkspaceStandalone({ children }: { children: ReactNode }) {
  useMerchantViewport();
  const { i18n } = useTranslation();
  const english = i18n.language?.startsWith('en');
  return <div className="merchant-workspace mw-standalone" dir={english ? 'ltr' : 'rtl'}>
    <header className="mw-standalone-header"><Link href="/merchant/dashboard" className="mw-brand"><span className="mw-brand-mark"><Sparkles aria-hidden="true" /></span><strong>{english ? 'Sary' : 'ساري'}</strong></Link><a href="/support">{english ? 'Help and support' : 'الدعم والمساعدة'}</a></header>
    <main>{children}</main><footer className="mw-footer">{english ? 'A clearer workspace. A lighter day.' : 'مساحة أوضح. يوم أخف.'}</footer>
  </div>;
}
