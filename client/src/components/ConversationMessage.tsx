import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, User, CircleHelp, FileText, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { conversationMediaUrl, conversationTimestamp } from '@/lib/conversation-message';

export type ConversationMessageData = { id: number; direction: string; senderType?: string | null; messageType: string; content: string | null; createdAt: string | Date | null; imageUrl?: string | null; mediaUrl?: string | null; voiceUrl?: string | null };
function PreviewImage({ url }: { url: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  return failed ? <div role="status" className="space-y-2" data-preview-failed><p>{t('merchantUx.conversationMessage.failed')}</p><Button type="button" variant="outline" className="min-h-11" onClick={() => { setFailed(false); setAttempt(v => v + 1); }}>{t('merchantUx.conversationMessage.retry')}</Button></div> : <img key={attempt} data-preview-image src={url} alt={t('merchantUx.conversationMessage.image')} className="mx-auto max-h-[65dvh] max-w-full object-contain" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}
function Attachment({ kind, source }: { kind: 'image' | 'voice' | 'document'; source: unknown }) {
  const { t } = useTranslation();
  const url = conversationMediaUrl(source);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  if (!url) return <p role="status" data-media-unavailable className="text-sm leading-relaxed">{t('merchantUx.conversationMessage.unavailable')}</p>;
  if (failed) return <div role="status" className="space-y-2 text-sm" data-media-failed><p>{t('merchantUx.conversationMessage.failed')}</p><Button type="button" variant="secondary" className="h-auto min-h-11 whitespace-normal" onClick={() => { setFailed(false); setAttempt(v => v + 1); }}>{t('merchantUx.conversationMessage.retry')}</Button></div>;
  if (kind === 'document') return <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-current/20 p-3 underline underline-offset-4 focus-visible:outline focus-visible:outline-2" aria-label={t('merchantUx.conversationMessage.openDocument')}><FileText className="h-5 w-5 shrink-0" aria-hidden="true"/><span className="min-w-0 break-words">{t('merchantUx.conversationMessage.openDocument')}</span><ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true"/></a>;
  if (kind === 'voice') return <div className="min-w-0 space-y-2"><p className="text-xs">{t('merchantUx.conversationMessage.voice')}</p><audio key={attempt} controls preload="none" src={url} aria-label={t('merchantUx.conversationMessage.voicePlayer')} className="block w-full min-w-0 max-w-[18rem]" onError={() => setFailed(true)}/></div>;
  return <Dialog><DialogTrigger asChild><button type="button" className="block min-h-11 min-w-11 max-w-full overflow-hidden rounded-md text-start focus-visible:outline focus-visible:outline-2" aria-label={t('merchantUx.conversationMessage.openImage')}>
    <img key={attempt} src={url} alt={t('merchantUx.conversationMessage.image')} className="block max-h-[250px] w-full max-w-[18rem] rounded-md object-contain" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/><span className="mt-1 flex items-center gap-1 text-xs"><ImageIcon className="h-3 w-3" aria-hidden="true"/>{t('merchantUx.conversationMessage.openImage')}</span>
  </button></DialogTrigger><DialogContent className="max-h-[90dvh] min-w-0 max-w-4xl overflow-y-auto" showCloseButton={false}><DialogHeader className="text-start"><DialogTitle>{t('merchantUx.conversationMessage.preview')}</DialogTitle><DialogDescription>{t('merchantUx.conversationMessage.previewDescription')}</DialogDescription></DialogHeader><PreviewImage url={url}/><DialogClose asChild><Button type="button" variant="outline" className="min-h-11">{t('merchantUx.conversationMessage.close')}</Button></DialogClose></DialogContent></Dialog>;
}

export function ConversationMessage({ message, timezone, idPrefix = 'conversation-message' }: { message: ConversationMessageData; timezone: string; idPrefix?: string }) {
  const { t, i18n } = useTranslation();
  const incoming = message.direction === 'incoming';
  const sender = incoming ? 'customer' : message.senderType === 'merchant' ? 'employee' : message.senderType === 'assistant' ? 'assistant' : 'unknown';
  const authors = { customer: t('merchantUx.conversationMessage.customer'), employee: t('merchantUx.conversationMessage.employee'), assistant: t('merchantUx.conversationMessage.assistant'), unknown: t('merchantUx.conversationMessage.unknown') };
  const at = conversationTimestamp(message.createdAt, i18n.language, timezone);
  const kind = ['image', 'voice', 'document'].includes(message.messageType) ? message.messageType as 'image' | 'voice' | 'document' : null;
  const source = kind === 'image' ? message.imageUrl || message.mediaUrl || message.voiceUrl : kind === 'voice' ? message.voiceUrl || message.mediaUrl : message.mediaUrl;
  return <article id={`${idPrefix}-${message.id}`} data-message-sender={sender} dir={i18n.language.startsWith('ar') ? 'rtl' : 'ltr'} className="flex min-w-0 gap-2" style={{ flexDirection: incoming ? 'row' : 'row-reverse' }} aria-label={authors[sender]}>
    <Avatar className="h-8 w-8 shrink-0" aria-hidden="true"><AvatarFallback>{sender === 'assistant' ? <Bot className="h-4 w-4"/> : sender === 'unknown' ? <CircleHelp className="h-4 w-4"/> : <User className="h-4 w-4"/>}</AvatarFallback></Avatar>
    <div className="mw-chat-bubble min-w-0"><div className={`min-w-0 space-y-2 rounded-lg p-3 ${incoming ? 'bg-muted' : 'bg-primary text-primary-foreground'}`}>
      {kind && <Attachment key={`${message.id}:${kind}:${String(source)}`} kind={kind} source={source}/>}
      {message.content && <p dir="auto" className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.content}</p>}
    </div><div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground"><span>{authors[sender]}</span>{at ? <time dateTime={at.iso} title={at.fallback ? t('merchantUx.conversationMessage.utcFallback') : at.label}>{at.label}</time> : <span>{t('merchantUx.conversationMessage.timeUnavailable')}</span>}</div>{at?.fallback && <p className="mt-1 text-xs text-muted-foreground">{t('merchantUx.conversationMessage.utcFallback')}</p>}</div>
  </article>;
}
