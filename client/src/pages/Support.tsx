import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { SeoHead, useSeoConfig } from '@/components/SeoHead';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type ServiceStatus = 'checking' | 'operational' | 'degraded' | 'unknown';
type SubmissionState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; reference: string }
  | { kind: 'error'; rateLimited: boolean };

type SupportForm = {
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string;
};

const EMPTY_FORM: SupportForm = {
  name: '',
  email: '',
  subject: '',
  message: '',
  website: '',
};

const SUPPORT_EMAIL = 'support@sary.live';

export default function Support() {
  const { t, i18n } = useTranslation();
  const isArabic = (i18n.resolvedLanguage || i18n.language).startsWith('ar');
  const [form, setForm] = useState<SupportForm>(EMPTY_FORM);
  const [submission, setSubmission] = useState<SubmissionState>({ kind: 'idle' });
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('checking');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const startedAtRef = useRef(Date.now());
  const feedbackRef = useRef<HTMLDivElement>(null);

  const checkStatus = useCallback(async (signal?: AbortSignal) => {
    setServiceStatus('checking');
    try {
      const response = await fetch('/api/public/status', {
        headers: { Accept: 'application/json' },
        signal,
      });
      const payload = await response.json() as { status?: string; checkedAt?: string };
      if (payload.status === 'operational' || payload.status === 'degraded') {
        setServiceStatus(payload.status);
        setCheckedAt(payload.checkedAt || new Date().toISOString());
        return;
      }
      setServiceStatus('unknown');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setServiceStatus('unknown');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkStatus(controller.signal);
    return () => controller.abort();
  }, [checkStatus]);

  const updateField = (field: keyof SupportForm, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    if (submission.kind !== 'idle' && submission.kind !== 'submitting') {
      setSubmission({ kind: 'idle' });
    }
  };

  const focusFeedback = () => {
    window.requestAnimationFrame(() => feedbackRef.current?.focus());
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submission.kind === 'submitting') return;
    setSubmission({ kind: 'submitting' });

    try {
      const response = await fetch('/api/public/support', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...form, startedAt: startedAtRef.current }),
      });
      const payload = await response.json().catch(() => null) as {
        accepted?: boolean;
        reference?: string;
      } | null;

      if (!response.ok || !payload?.accepted || !payload.reference) {
        setSubmission({ kind: 'error', rateLimited: response.status === 429 });
        focusFeedback();
        return;
      }

      setSubmission({ kind: 'success', reference: payload.reference });
      setForm(EMPTY_FORM);
      startedAtRef.current = Date.now();
      focusFeedback();
    } catch {
      setSubmission({ kind: 'error', rateLimited: false });
      focusFeedback();
    }
  };

  const statusLabel = serviceStatus === 'operational'
    ? t('publicUx.support.statusOperational')
    : serviceStatus === 'degraded'
      ? t('publicUx.support.statusDegraded')
      : serviceStatus === 'checking'
        ? t('publicUx.support.statusChecking')
        : t('publicUx.support.statusUnknown');

  const faqs = [
    ['faqStartQuestion', 'faqStartAnswer'],
    ['faqResponseQuestion', 'faqResponseAnswer'],
    ['faqWhatsappQuestion', 'faqWhatsappAnswer'],
    ['faqSecurityQuestion', 'faqSecurityAnswer'],
  ] as const;

  return (
    <div className="min-h-screen flex flex-col bg-background" dir={isArabic ? 'rtl' : 'ltr'}>
      <SeoHead {...useSeoConfig('support')} />
      <Navbar />

      <main className="flex-1">
        <section className="bg-gradient-to-b from-primary/10 to-background py-20 md:py-28">
          <div className="container mx-auto px-4 text-center">
            <ShieldCheck aria-hidden="true" className="h-14 w-14 text-primary mx-auto mb-6" />
            <h1 className="text-4xl md:text-6xl font-bold mb-6">{t('publicUx.support.heroTitle')}</h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {t('publicUx.support.heroDescription')}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-4 -mt-8 pb-16" aria-labelledby="service-status-title">
          <Card className="max-w-3xl mx-auto border-2">
            <CardContent className="p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
              <div className="flex gap-4 items-start">
                {serviceStatus === 'operational' ? (
                  <CheckCircle2 aria-hidden="true" className="h-7 w-7 text-green-600 shrink-0" />
                ) : serviceStatus === 'checking' ? (
                  <Loader2 aria-hidden="true" className="h-7 w-7 text-primary animate-spin shrink-0" />
                ) : (
                  <AlertCircle aria-hidden="true" className="h-7 w-7 text-amber-600 shrink-0" />
                )}
                <div>
                  <h2 id="service-status-title" className="text-xl font-semibold">{t('publicUx.support.statusTitle')}</h2>
                  <p className="font-medium mt-1" role="status" aria-live="polite">{statusLabel}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('publicUx.support.statusDescription')}</p>
                  {checkedAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('publicUx.support.statusCheckedAt', {
                        time: new Intl.DateTimeFormat(isArabic ? 'ar-SA' : 'en', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(checkedAt)),
                      })}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void checkStatus()}
                disabled={serviceStatus === 'checking'}
              >
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
                {t('publicUx.support.statusRetry')}
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="py-16" aria-labelledby="support-channels-title">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 id="support-channels-title" className="text-3xl md:text-4xl font-bold mb-4">
                {t('publicUx.support.channelsTitle')}
              </h2>
              <p className="text-lg text-muted-foreground">{t('publicUx.support.channelsDescription')}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <Card>
                <CardContent className="p-6 text-center space-y-4">
                  <Mail aria-hidden="true" className="h-10 w-10 text-primary mx-auto" />
                  <h3 className="text-xl font-semibold">{t('publicUx.support.emailTitle')}</h3>
                  <p className="text-muted-foreground">{t('publicUx.support.emailDescription')}</p>
                  <Button asChild variant="outline" className="w-full">
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{t('publicUx.support.emailAction')}</a>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center space-y-4">
                  <BookOpen aria-hidden="true" className="h-10 w-10 text-primary mx-auto" />
                  <h3 className="text-xl font-semibold">{t('publicUx.support.helpTitle')}</h3>
                  <p className="text-muted-foreground">{t('publicUx.support.helpDescription')}</p>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/resources/help-center">{t('publicUx.support.helpAction')}</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="max-w-3xl mx-auto mt-6 bg-muted/30">
              <CardContent className="p-6">
                <div className="flex gap-3 items-start">
                  <Clock aria-hidden="true" className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-lg">{t('publicUx.support.hoursTitle')}</h3>
                    <p className="text-muted-foreground mt-1">{t('publicUx.support.hoursDescription')}</p>
                    <p className="text-sm text-muted-foreground mt-3">{t('publicUx.support.slaNotice')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="py-16 bg-muted/30" aria-labelledby="support-form-title">
          <div className="container mx-auto px-4">
            <Card className="max-w-3xl mx-auto">
              <CardHeader>
                <CardTitle id="support-form-title" className="text-2xl">{t('publicUx.support.formTitle')}</CardTitle>
                <p className="text-muted-foreground">{t('publicUx.support.formDescription')}</p>
              </CardHeader>
              <CardContent>
                {(submission.kind === 'success' || submission.kind === 'error') && (
                  <div
                    ref={feedbackRef}
                    tabIndex={-1}
                    role={submission.kind === 'error' ? 'alert' : 'status'}
                    aria-live={submission.kind === 'error' ? 'assertive' : 'polite'}
                    className={`rounded-lg border p-4 mb-6 outline-none ${
                      submission.kind === 'success'
                        ? 'border-green-300 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-100'
                        : 'border-destructive/40 bg-destructive/5 text-destructive'
                    }`}
                  >
                    <p className="font-semibold">
                      {submission.kind === 'success'
                        ? t('publicUx.support.successTitle')
                        : t('publicUx.support.errorTitle')}
                    </p>
                    <p className="text-sm mt-1">
                      {submission.kind === 'success'
                        ? t('publicUx.support.successDescription')
                        : submission.rateLimited
                          ? t('publicUx.support.rateLimitError')
                          : t('publicUx.support.errorDescription')}
                    </p>
                    {submission.kind === 'success' && (
                      <p className="font-mono font-semibold mt-2">
                        {t('publicUx.support.referenceLabel')}: {submission.reference}
                      </p>
                    )}
                    {submission.kind === 'error' && (
                      <a className="inline-block underline font-medium mt-2" href={`mailto:${SUPPORT_EMAIL}`}>
                        {t('publicUx.support.emailFallback')}
                      </a>
                    )}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="support-name">{t('publicUx.support.nameLabel')}</Label>
                      <Input
                        id="support-name"
                        name="name"
                        autoComplete="name"
                        minLength={2}
                        maxLength={120}
                        value={form.name}
                        onChange={event => updateField('name', event.target.value)}
                        placeholder={t('publicUx.support.namePlaceholder')}
                        disabled={submission.kind === 'submitting'}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="support-email">{t('publicUx.support.emailLabel')}</Label>
                      <Input
                        id="support-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        maxLength={320}
                        value={form.email}
                        onChange={event => updateField('email', event.target.value)}
                        placeholder={t('publicUx.support.emailPlaceholder')}
                        disabled={submission.kind === 'submitting'}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="support-subject">{t('publicUx.support.subjectLabel')}</Label>
                    <Input
                      id="support-subject"
                      name="subject"
                      minLength={3}
                      maxLength={160}
                      value={form.subject}
                      onChange={event => updateField('subject', event.target.value)}
                      placeholder={t('publicUx.support.subjectPlaceholder')}
                      disabled={submission.kind === 'submitting'}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="support-message">{t('publicUx.support.messageLabel')}</Label>
                    <Textarea
                      id="support-message"
                      name="message"
                      minLength={10}
                      maxLength={4_000}
                      rows={7}
                      value={form.message}
                      onChange={event => updateField('message', event.target.value)}
                      placeholder={t('publicUx.support.messagePlaceholder')}
                      disabled={submission.kind === 'submitting'}
                      required
                    />
                  </div>
                  <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                    <Label htmlFor="support-website">Website</Label>
                    <Input
                      id="support-website"
                      name="website"
                      autoComplete="off"
                      tabIndex={-1}
                      value={form.website}
                      onChange={event => updateField('website', event.target.value)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('publicUx.support.privacyNotice')}{' '}
                    <Link href="/company/privacy" className="underline font-medium">
                      {t('publicUx.support.privacyLink')}
                    </Link>.
                  </p>
                  <Button type="submit" size="lg" className="w-full" disabled={submission.kind === 'submitting'}>
                    {submission.kind === 'submitting' ? (
                      <Loader2 aria-hidden="true" className={`h-4 w-4 animate-spin ${isArabic ? 'ml-2' : 'mr-2'}`} />
                    ) : (
                      <Send aria-hidden="true" className={`h-4 w-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
                    )}
                    {submission.kind === 'submitting'
                      ? t('publicUx.support.submitting')
                      : t('publicUx.support.submit')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="py-16" aria-labelledby="support-resources-title">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 id="support-resources-title" className="text-3xl md:text-4xl font-bold mb-4">
                {t('publicUx.support.resourcesTitle')}
              </h2>
              <p className="text-lg text-muted-foreground">{t('publicUx.support.resourcesDescription')}</p>
            </div>
            <Card className="max-w-xl mx-auto text-center">
              <CardContent className="p-6 space-y-4">
                <h3 className="text-xl font-semibold">{t('publicUx.support.pricingTitle')}</h3>
                <p className="text-muted-foreground">{t('publicUx.support.pricingDescription')}</p>
                <Button asChild variant="outline">
                  <Link href="/pricing">{t('publicUx.support.pricingAction')}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="py-16 bg-muted/30" aria-labelledby="support-faq-title">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h2 id="support-faq-title" className="text-3xl md:text-4xl font-bold mb-4">
                {t('publicUx.support.faqTitle')}
              </h2>
              <p className="text-lg text-muted-foreground">{t('publicUx.support.faqDescription')}</p>
            </div>
            <div className="max-w-3xl mx-auto space-y-4">
              {faqs.map(([question, answer]) => (
                <Card key={question}>
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-lg">{t(`publicUx.support.${question}`)}</h3>
                    <p className="text-muted-foreground mt-2">{t(`publicUx.support.${answer}`)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
