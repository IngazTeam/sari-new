import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Pencil, ArrowRight } from 'lucide-react';
import PreviewChat from '@/components/PreviewChat';
import { useTranslation } from 'react-i18next';

interface CompleteStepProps {
  wizardData: Record<string, any>;
  goToStep: (step: number) => void;
  completeSetup: () => void;
  isLoading: boolean;
}

export default function CompleteStep({ wizardData, goToStep, completeSetup, isLoading }: CompleteStepProps) {
  const { t } = useTranslation();
  const websiteReview = wizardData.websiteAnalysis?.confirmed ? wizardData.websiteAnalysis : null;
  const hasValidProfile =
    typeof wizardData.businessName === 'string' && wizardData.businessName.trim().length >= 2 &&
    typeof wizardData.phone === 'string' && /^[+0-9][0-9\s()\-]{6,19}$/.test(wizardData.phone.trim());
  const products = (wizardData.products || []).filter((item: any) => item.name?.trim());
  const services = (wizardData.services || []).filter((item: any) => item.name?.trim());
  const tone = wizardData.botTone === 'professional' ? t('setupWorkspace.toneProfessional') : wizardData.botTone === 'casual' ? t('setupWorkspace.toneCasual') : t('setupWorkspace.toneFriendly');
  const language = ({ ar: 'العربية', en: 'English', both: 'العربية والإنجليزية', fr: 'Français', tr: 'Türkçe', es: 'Español', it: 'Italiano' } as Record<string, string>)[wizardData.botLanguage || 'ar'];
  const edit = (name: string, action: () => void) => <Button type="button" variant="ghost" size="sm" onClick={action} disabled={isLoading} aria-label={t('setupWorkspace.editNamed', { name })}><Pencil aria-hidden="true" />{t('setupWorkspace.edit')}</Button>;
  return <div className="space-y-5">
    <div className="ms-review-list">
      <section>
        <header><h2>{t('setupWorkspace.reviewBusiness')}</h2>{edit(t('setupWorkspace.reviewBusiness'), () => goToStep(3))}</header>
        <dl><div><dt>{t('setupWorkspace.nameLabel')}</dt><dd>{wizardData.businessName || t('setupWorkspace.notProvided')}</dd></div><div><dt>{t('setupWorkspace.phoneLabel')}</dt><dd><bdi>{wizardData.phone || t('setupWorkspace.notProvided')}</bdi></dd></div></dl>
      </section>
      <section>
        <header><h2>{t('setupWorkspace.reviewCatalog')}</h2>{edit(t('setupWorkspace.reviewCatalog'), () => goToStep(6))}</header>
        {products.length + services.length > 0 ? <><p>{t('setupWorkspace.catalogCount', { products: products.length, services: services.length })}</p><small>{t('setupWorkspace.catalogReviewNote')}</small></> : <p>{t('setupWorkspace.catalogEmpty')}</p>}
      </section>
      <section>
        <header><h2>{t('setupWorkspace.reviewAssistant')}</h2>{edit(t('setupWorkspace.reviewAssistant'), () => goToStep(8))}</header>
        <dl><div><dt>{t('setupWorkspace.toneLabel')}</dt><dd>{tone}</dd></div><div><dt>{t('setupWorkspace.languageLabel')}</dt><dd>{language}</dd></div></dl>
      </section>
      {websiteReview && <section>
        <header><h2>{t('setupWorkspace.reviewWebsite')}</h2>{edit(t('setupWorkspace.reviewWebsite'), () => goToStep(4))}</header>
        <p className="break-all" dir="ltr">{websiteReview.websiteUrl}</p>
      </section>}
    </div>
    <details className="ms-details">
      <summary>{t('setupWorkspace.previewTitle')}</summary>
      <PreviewChat businessName={wizardData.businessName} botTone={wizardData.botTone || 'friendly'} botLanguage={wizardData.botLanguage || 'ar'} products={products} services={services} welcomeMessage={wizardData.welcomeMessage || ''} useAI={false} className="max-w-md mx-auto" />
    </details>
    {!hasValidProfile && <div role="alert" className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle aria-hidden="true" />{t('setupWorkspace.invalidProfile')}</div>}
    <div className="ms-actions">
      <Button size="lg" onClick={completeSetup} disabled={isLoading || !hasValidProfile}>
        {isLoading ? <><Loader2 className="animate-spin" aria-hidden="true" />{t('completeStep.auto_4')}</> : <>{t('setupWorkspace.reviewConfirm')}<ArrowRight aria-hidden="true" /></>}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground leading-relaxed">{t('setupWorkspace.confirmHint')}</p>
  </div>;
}
