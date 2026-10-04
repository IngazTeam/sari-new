import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Link2, MessageCircle, ShieldCheck } from 'lucide-react';
import '@/styles/whatsapp-setup-workspace.css';

/** Guidance only. Connection, delivery and AI readiness require separate evidence. */
export function WhatsAppSetupWorkspace({ view }: { view: 'setup' | 'receive' }) {
  const { t, i18n } = useTranslation();
  const [provider, setProvider] = useState<'green' | 'meta'>('green');
  const receive = view === 'receive';
  const steps = receive ? [
    { title: t('whatsappSetupUx.checkConnection'), body: t('whatsappSetupUx.checkConnectionBody'), href: '/merchant/whatsapp', action: t('whatsappSetupUx.openConnections') },
    { title: t('whatsappSetupUx.checkIncoming'), body: t('whatsappSetupUx.checkIncomingBody'), href: '/merchant/conversations', action: t('whatsappSetupUx.openConversations') },
    { title: t('whatsappSetupUx.checkReply'), body: t('whatsappSetupUx.checkReplyBody'), href: '/merchant/bot-settings', action: t('whatsappSetupUx.openAssistant') },
  ] : provider === 'green' ? [
    { title: t('whatsappSetupUx.greenRequest'), body: t('whatsappSetupUx.greenRequestBody'), href: '/merchant/whatsapp', action: t('whatsappSetupUx.openConnections') },
    { title: t('whatsappSetupUx.greenScan'), body: t('whatsappSetupUx.greenScanBody') },
    { title: t('whatsappSetupUx.greenVerify'), body: t('whatsappSetupUx.greenVerifyBody'), href: '/merchant/whatsapp-webhook-setup', action: t('whatsappSetupUx.receiveTab') },
  ] : [
    { title: t('whatsappSetupUx.metaStart'), body: t('whatsappSetupUx.metaStartBody'), href: '/merchant/whatsapp', action: t('whatsappSetupUx.openConnections') },
    { title: t('whatsappSetupUx.metaAuthorize'), body: t('whatsappSetupUx.metaAuthorizeBody') },
    { title: t('whatsappSetupUx.metaReturn'), body: t('whatsappSetupUx.metaReturnBody'), href: '/merchant/whatsapp-webhook-setup', action: t('whatsappSetupUx.receiveTab') },
  ];
  return <section className="wa-setup" dir={i18n.language.startsWith('en') ? 'ltr' : 'rtl'}>
    <header className="wa-setup-header">
      <div><p className="wa-setup-eyebrow"><MessageCircle size={18} aria-hidden="true"/>{t('whatsappSetupUx.eyebrow')}</p>
        <h1>{receive ? t('whatsappSetupUx.receiveTitle') : t('whatsappSetupUx.setupTitle')}</h1>
        <p>{receive ? t('whatsappSetupUx.receiveDescription') : t('whatsappSetupUx.setupDescription')}</p></div>
      <Link className="wa-setup-button wa-setup-primary" href="/merchant/whatsapp"><Link2 size={18} aria-hidden="true"/>{t('whatsappSetupUx.openConnections')}</Link>
    </header>
    <nav className="wa-setup-nav" aria-label={t('whatsappSetupUx.navigation')}>
      <Link href="/merchant/greenapi-setup" aria-current={!receive ? 'page' : undefined}>{t('whatsappSetupUx.setupTab')}</Link>
      <Link href="/merchant/whatsapp-webhook-setup" aria-current={receive ? 'page' : undefined}>{t('whatsappSetupUx.receiveTab')}</Link>
    </nav>
    <p className="wa-setup-evidence"><ShieldCheck size={20} aria-hidden="true"/><span>{t('whatsappSetupUx.guideOnly')}</span></p>
    {!receive && <fieldset className="wa-setup-provider"><legend>{t('whatsappSetupUx.chooseProvider')}</legend>
      <label><input type="radio" name="wa-setup-provider" value="green" checked={provider === 'green'} onChange={() => setProvider('green')}/><span><strong>{t('whatsappSetupUx.green')}</strong><small>{t('whatsappSetupUx.greenHint')}</small></span></label>
      <label><input type="radio" name="wa-setup-provider" value="meta" checked={provider === 'meta'} onChange={() => setProvider('meta')}/><span><strong>Meta Cloud</strong><small>{t('whatsappSetupUx.metaHint')}</small></span></label>
    </fieldset>}
    <div className="wa-setup-layout">
      <section className="wa-setup-panel"><h2>{receive ? t('whatsappSetupUx.receiveSteps') : t('whatsappSetupUx.setupSteps')}</h2>
        <ol className="wa-setup-steps" key={`${view}:${provider}`}>{steps.map((step, index) => <li key={step.title}>
          <span className="wa-setup-number" aria-hidden="true">{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p>
            {'href' in step && step.href && <Link className="wa-setup-button" href={step.href}>{step.action}<ArrowUpRight size={17} aria-hidden="true"/></Link>}</div>
        </li>)}</ol>
      </section>
      <aside className="wa-setup-panel wa-setup-note"><h2>{t('whatsappSetupUx.secureTitle')}</h2><p>{t('whatsappSetupUx.secureBody')}</p>
        <p>{t('whatsappSetupUx.secretsBody')}</p><Link className="wa-setup-button" href="/merchant/test-sari">{t('whatsappSetupUx.testAssistant')}</Link><p className="wa-setup-small">{t('whatsappSetupUx.simulatorHint')}</p>
      </aside>
    </div>
    <section className="wa-setup-panel wa-setup-help"><h2>{t('whatsappSetupUx.troubleshoot')}</h2>
      <details><summary>{t('whatsappSetupUx.noNumber')}</summary><p>{t('whatsappSetupUx.noNumberBody')}</p><Link className="wa-setup-button" href="/merchant/whatsapp">{t('whatsappSetupUx.openConnections')}</Link></details>
      <details><summary>{t('whatsappSetupUx.noIncoming')}</summary><p>{t('whatsappSetupUx.noIncomingBody')}</p><Link className="wa-setup-button" href="/merchant/conversations">{t('whatsappSetupUx.openConversations')}</Link></details>
      <details><summary>{t('whatsappSetupUx.noReply')}</summary><p>{t('whatsappSetupUx.noReplyBody')}</p><div className="wa-setup-actions"><Link className="wa-setup-button" href="/merchant/bot-settings">{t('whatsappSetupUx.openAssistant')}</Link><Link className="wa-setup-button" href="/merchant/sari-brain">{t('whatsappSetupUx.openKnowledge')}</Link></div></details>
      <details><summary>{t('whatsappSetupUx.existingProvider')}</summary><p>{t('whatsappSetupUx.existingProviderBody')}</p><a className="wa-setup-button" href="https://console.green-api.com" target="_blank" rel="noopener noreferrer">{t('whatsappSetupUx.providerConsole')}<ArrowUpRight size={17} aria-hidden="true"/></a></details>
      <p className="wa-setup-support">{t('whatsappSetupUx.needHelp')} <a href="/support">{t('whatsappSetupUx.support')}</a></p>
    </section>
  </section>;
}
