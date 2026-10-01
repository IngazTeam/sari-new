import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Moon, Smartphone, Monitor, User } from 'lucide-react';
import { ConversationMessage, type ConversationMessageData } from './ConversationMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type PreviewProps = {
  messages: ConversationMessageData[];
  customerName?: string;
  customerPhone?: string;
  timezone: string;
};

export function InlineConversationPreview({ messages, customerName, customerPhone, timezone, className }: PreviewProps & { className?: string }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  return <section data-conversation-preview className={cn('min-w-0 overflow-hidden rounded-xl border bg-background text-foreground', className)} dir={i18n.language.startsWith('ar') ? 'rtl' : 'ltr'}>
    <header className="flex min-w-0 items-center gap-3 border-b bg-muted/50 p-3">
      <User className="h-5 w-5 shrink-0" aria-hidden="true"/>
      <div className="min-w-0"><p className="font-semibold [overflow-wrap:anywhere]">{customerName || t('merchantUx.conversationPreview.customer')}</p>{customerPhone && <p dir="ltr" className="text-start text-xs text-muted-foreground [overflow-wrap:anywhere]">{customerPhone}</p>}</div>
    </header>
    <div data-preview-messages role="region" aria-label={t('merchantUx.conversationPreview.messages')} tabIndex={0} className="max-h-[50dvh] min-w-0 space-y-4 overflow-y-auto overscroll-contain p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      {messages.length ? messages.map(message => <ConversationMessage key={message.id} idPrefix={`preview-${id}`} message={message} timezone={timezone}/>) : <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t('merchantUx.conversationPreview.empty')}</p>}
    </div>
  </section>;
}

type ScopedPreviewProps = PreviewProps & { actorUserId: number; merchantId: number; conversationId: number };
export function ConversationPreviewMode(props: ScopedPreviewProps) {
  return <ScopedPreview key={`${props.actorUserId}:${props.merchantId}:${props.conversationId}`} {...props}/>;
}
function ScopedPreview(props: ScopedPreviewProps) {
  const { t, i18n } = useTranslation();
  const [darkMode, setDarkMode] = useState(false);
  const [deviceView, setDeviceView] = useState<'mobile' | 'desktop'>('mobile');
  return <Dialog><DialogTrigger asChild><Button type="button" data-conversation-preview-trigger variant="outline" className="min-h-11 gap-2"><Eye className="h-4 w-4" aria-hidden="true"/>{t('merchantUx.conversationPreview.trigger')}</Button></DialogTrigger>
    <DialogContent data-conversation-preview-dialog showCloseButton={false} dir={i18n.language.startsWith('ar') ? 'rtl' : 'ltr'} className={cn('max-h-[90dvh] min-w-0 sm:max-w-4xl overflow-y-auto bg-background text-foreground', darkMode && 'dark')}>
      <DialogHeader className="text-start"><DialogTitle>{t('merchantUx.conversationPreview.title')}</DialogTitle><DialogDescription>{t('merchantUx.conversationPreview.description')}</DialogDescription></DialogHeader>
      <div role="group" aria-label={t('merchantUx.conversationPreview.controls')} className="flex min-w-0 flex-wrap gap-2">
        <Button type="button" variant={deviceView === 'mobile' ? 'default' : 'outline'} className="h-auto min-h-11 gap-2 whitespace-normal" aria-pressed={deviceView === 'mobile'} onClick={() => setDeviceView('mobile')}><Smartphone className="h-4 w-4" aria-hidden="true"/>{t('merchantUx.conversationPreview.mobile')}</Button>
        <Button type="button" variant={deviceView === 'desktop' ? 'default' : 'outline'} className="h-auto min-h-11 gap-2 whitespace-normal" aria-pressed={deviceView === 'desktop'} onClick={() => setDeviceView('desktop')}><Monitor className="h-4 w-4" aria-hidden="true"/>{t('merchantUx.conversationPreview.desktop')}</Button>
        <Button type="button" variant={darkMode ? 'default' : 'outline'} className="h-auto min-h-11 gap-2 whitespace-normal" aria-pressed={darkMode} onClick={() => setDarkMode(value => !value)}><Moon className="h-4 w-4" aria-hidden="true"/>{t('merchantUx.conversationPreview.dark')}</Button>
      </div>
      <InlineConversationPreview {...props} className={cn('w-full', deviceView === 'mobile' && 'mx-auto max-w-[375px]')}/>
      <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">{t('merchantUx.conversationPreview.close')}</Button></DialogClose>
    </DialogContent>
  </Dialog>;
}

export default ConversationPreviewMode;
