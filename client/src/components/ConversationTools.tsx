import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConversationHandoff } from './ConversationHandoff';
import { EscalationReconciliation } from './EscalationReconciliation';
import { SalesOfferReview } from './SalesOfferReview';
import { StaffAttemptReview } from './StaffAttemptReview';
type Scope = { merchantId: number; actorUserId: number; conversationId: number };
type Tool = 'handoff' | 'escalation' | 'offers' | 'attempts';
export function ConversationTools(props: Scope) { return <ScopedTools key={`${props.actorUserId}:${props.merchantId}:${props.conversationId}`} {...props}/>; }
function ScopedTools(props: Scope) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tool>('handoff'), [visited, setVisited] = useState<Partial<Record<Tool, boolean>>>({ handoff: true });
  const [offerNotes,setOfferNotes] = useState<Record<string,string>>({});
  const [escalationNotes,setEscalationNotes] = useState<Record<number,string>>({});
  const labels = { handoff: t('merchantUx.conversationTools.handoff'), escalation: t('merchantUx.conversationTools.escalation'), offers: t('merchantUx.conversationTools.offers'), attempts: t('merchantUx.conversationTools.attempts') };
  return <Dialog onOpenChange={open => { if (!open) { setTab('handoff'); setVisited({ handoff: true }); } }}><DialogTrigger asChild><Button type="button" data-conversation-tools variant="outline" className="h-auto min-h-11 whitespace-normal">{t('merchantUx.conversationTools.title')}</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] min-w-0 max-w-3xl overflow-y-auto" showCloseButton={false}>
      <DialogHeader className="text-start"><DialogTitle>{t('merchantUx.conversationTools.title')}</DialogTitle><DialogDescription>{t('merchantUx.conversationTools.description')}</DialogDescription></DialogHeader>
      <Tabs value={tab} onValueChange={value => { const next = value as Tool; setTab(next); setVisited(v => ({ ...v, [next]: true })); }} dir={i18n.language.startsWith('ar') ? 'rtl' : 'ltr'} className="min-w-0">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1">{(Object.keys(labels) as Tool[]).map(key => <TabsTrigger key={key} value={key} className="h-auto min-h-11 whitespace-normal px-2">{labels[key]}</TabsTrigger>)}</TabsList>
        {visited.handoff && <TabsContent value="handoff" forceMount className="min-w-0 data-[state=inactive]:hidden"><ConversationHandoff {...props}/></TabsContent>}
        {visited.escalation && <TabsContent value="escalation" forceMount className="min-w-0 data-[state=inactive]:hidden"><EscalationReconciliation {...props} draftNotes={escalationNotes} onDraftNotesChange={setEscalationNotes}/></TabsContent>}
        {visited.offers && <TabsContent value="offers" forceMount className="min-w-0 data-[state=inactive]:hidden"><SalesOfferReview {...props} defaultOpen draftNotes={offerNotes} onDraftNotesChange={setOfferNotes}/></TabsContent>}
        {visited.attempts && <TabsContent value="attempts" forceMount className="min-w-0 data-[state=inactive]:hidden"><StaffAttemptReview {...props} defaultOpen/></TabsContent>}
      </Tabs>
      <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">{t('merchantUx.conversationTools.close')}</Button></DialogClose>
    </DialogContent>
  </Dialog>;
}
