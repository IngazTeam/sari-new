import {ConversationTools} from '@/components/ConversationTools';
import {ConversationMessage} from '@/components/ConversationMessage';
import {ConversationConnection} from '@/components/ConversationConnection';
import {StaffTeamReview} from '@/components/StaffTeamReview';
import { trpc } from '@/lib/trpc';
import { staffVoiceAttempt } from '@/lib/staff-voice-attempt';
import { staffDashboardAttempt } from '@/lib/staff-dashboard-attempt';
import { useLocation, useSearch } from 'wouter';
import { conversationHref, conversationNavigation } from '@/lib/conversation-navigation';
import { conversationDraftEpoch, conversationDraftScope, readConversationDraft, saveConversationDraft } from '@/lib/conversation-draft';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ArrowRight,
  MessageSquare,
  User,

  Clock,
  Search,
  Send,
  Loader2,



} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { ConversationPreviewMode } from '@/components/ConversationPreviewMode';
import { AISuggestions } from '@/components/AISuggestions';
import { QuickActionsBar, type QuickActionDraft } from '@/components/QuickActions';
import { toast } from 'sonner';
import { QueryStateCard } from '@/components/QueryStateCard';
import { parseMerchantDate } from '@/lib/merchant-date';
import { WorkspaceState, workspaceFailureKind } from '@/components/merchant/WorkspaceState';
import { useConversationScroll } from '@/lib/use-conversation-scroll';

function activityTime(value: string | Date | null) {
  if (!value) return 'لم تصل رسالة بعد';
  // Drizzle returns UTC strings; the filtered mysql query returns Date objects.
  const date = parseMerchantDate(value);
  return Number.isNaN(date.getTime())
    ? 'وقت غير متاح'
    : formatDistanceToNow(date, { addSuffix: true, locale: ar });
}

export default function Conversations() {
  const user = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 0, refetchOnMount: 'always' });
  const merchant = trpc.merchants.getCurrent.useQuery(undefined, {
    retry: false, staleTime: 0, refetchOnMount: 'always',
    enabled: Boolean(user.data?.id) && !user.error && !user.isFetching,
  });
  const error = user.error || merchant.error;
  if (error) return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={() => { void user.refetch(); void merchant.refetch(); }} />;
  if (user.isLoading || user.isFetching || merchant.isLoading || merchant.isFetching)
    return <WorkspaceState kind="loading" />;
  if (!user.data?.id || !merchant.data?.id)
    return <WorkspaceState kind={!user.data?.id ? 'session' : 'missing'} onRetry={() => { void user.refetch(); void merchant.refetch(); }} />;
  const key = `${user.data.id}:${merchant.data.id}`;
  return <ScopedConversations key={key} currentMerchant={merchant.data} actorId={user.data.id} />;
}

function ScopedConversations({ currentMerchant, actorId }: { currentMerchant: { id: number; timezone?: string | null }; actorId: number }) {
  const { t } = useTranslation();
  const live = useRef(true), sendLock = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const search = useSearch(), [pathname, navigate] = useLocation();
  const navigation = conversationNavigation(search);
  const { conversationId: selectedConversationId, search: debouncedSearch, page: currentPage, stage: stageFilter, needsHuman: needsHumanFilter } = navigation;
  const [searchEdit, setSearchEdit] = useState<{ source: string; value: string } | null>(null);
  const searchQuery = searchEdit?.source === search ? searchEdit.value : debouncedSearch;
  useEffect(() => { setSearchEdit(null); }, [search]);
  const changeRoute = (patch: Record<string, string | number | null>) => navigate(conversationHref(pathname, search, patch));
  const draftEpoch = useRef(conversationDraftEpoch());
  const [, refreshDraft] = useState(0);
  const draftScope = (id: number) => conversationDraftScope(actorId, currentMerchant.id, id);
  const draft = selectedConversationId ? readConversationDraft(draftScope(selectedConversationId)) : { state: 'missing' as const };
  const replyText = draft.state === 'ready' ? draft.record.text : '';
  const draftReview = draft.state === 'ready' && draft.record.review;
  const draftUnavailable = draft.state === 'unavailable' || (draft.state === 'ready' && !draft.persisted);
  const draftInvalid = draft.state === 'invalid';
  const saveDraft = (id: number, text: string, review = false) => {
    const saved = saveConversationDraft(draftScope(id), text, review, draftEpoch.current);
    refreshDraft(version => version + 1);
    return saved;
  };
  const [historyState, setHistoryState] = useState<{ conversationId: number | null; trail: number[] }>({ conversationId: null, trail: [] });
  const historyTrail = historyState.conversationId === selectedConversationId ? historyState.trail : [];
  const setHistoryTrail = (value: number[] | ((current: number[]) => number[])) => setHistoryState(current => ({
    conversationId: selectedConversationId,
    trail: typeof value === 'function' ? value(current.conversationId === selectedConversationId ? current.trail : []) : value,
  }));
  const beforeId = historyTrail.at(-1);
  const viewingLatest = beforeId === undefined;
  const [isSending, setIsSending] = useState(false);
  const [voiceBusy,setVoiceBusy]=useState(false);
  const selectedReplyConversation=useRef(selectedConversationId);
  selectedReplyConversation.current=selectedConversationId;
  const updateReplyText = (text: string) => { if (selectedConversationId && !draftReview && !draftInvalid) saveDraft(selectedConversationId, text); };
  const selectConversation = (id: number | null) => {
    if (isSending || voiceBusy) return;
    setHistoryTrail([]);
    changeRoute({ conversationId: id });
  };
  useEffect(() => {
    if (searchQuery.trim() === debouncedSearch || isSending || voiceBusy) return;
    const timer = window.setTimeout(() => navigate(conversationHref(pathname, search, {
      phone: searchQuery.trim(), page: null, conversationId: null,
    })), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery, debouncedSearch, pathname, search, navigate, isSending, voiceBusy]);

  const STAGE_LABELS: Record<string, string> = {
    ready: '🔥 جاهزون للدفع',
    payment_link_sent: '💳 دفع لم يكتمل',
    stalled: '⏸️ متوقفة',
    new: 'جديد',
    interested: 'مهتم',
    qualified: 'مؤهل',
    paid: 'مدفوع',
    purchased: 'تم الشراء',
    payment_failed: 'تعذر الدفع',
    lost: 'خسارة',
  };

  const {
    data: listSnapshot,
    isLoading,
    error: listQueryError,
    refetch: refetchList,
  } = trpc.conversations.list.useQuery(
    {
      page: currentPage,
      pageSize: 50,
      stage: stageFilter,
      needsHuman: needsHumanFilter,
      search: debouncedSearch || undefined,
    },
    {
      retry: false, staleTime: 0, refetchOnMount: 'always',
      refetchInterval: 10_000, // تحديث قائمة المحادثات كل 10 ثواني
    }
  );
  const listError = listQueryError || (listSnapshot && (listSnapshot.merchantId !== currentMerchant.id || listSnapshot.items.some(c => c.merchantId !== currentMerchant.id)) ? new Error('Inbox context mismatch') : null);
  const conversationsData = !listError ? listSnapshot : undefined;
  const merchantTimezone = (currentMerchant as any)?.timezone || 'Asia/Riyadh';

  const sendReplyMutation = trpc.conversations.sendReply.useMutation();
  const sendVoiceReplyMutation =
    trpc.conversations.sendVoiceReply.useMutation();
  const utils = trpc.useUtils();

  const {
    data: historySnapshot,
    isLoading: messagesLoading,
    isFetching: historyFetching,
    error: historyError,
    refetch: refetchMessages,
  } = trpc.conversations.messageHistory.useQuery(
    { conversationId: selectedConversationId!, beforeId, limit: 50 },
    {
      retry: false, staleTime: 0, refetchOnMount: 'always',
      enabled: selectedConversationId !== null,
      refetchInterval: viewingLatest ? 5_000 : false,
    }
  );
  const messagesError = historyError || (historySnapshot && (historySnapshot.merchantId !== currentMerchant.id || historySnapshot.conversationId !== selectedConversationId || historySnapshot.items.some(m => m.conversationId !== selectedConversationId) || (historySnapshot.conversation && (historySnapshot.conversation.id !== selectedConversationId || historySnapshot.conversation.merchantId !== currentMerchant.id))) ? new Error('Message context mismatch') : null);
  const messages = !messagesError ? historySnapshot?.items : undefined;

  const messageScroll = useConversationScroll(`${selectedConversationId}:${beforeId ?? 'latest'}`, messages, viewingLatest);

  // Show loading skeleton
  const conversations = conversationsData?.items;

  const filteredConversations = conversations;

  const hasActiveFilter = stageFilter || needsHumanFilter;

  const listedSelectedConversation = conversations?.find(
    c => c.id === selectedConversationId
  );
  const voiceConversationSnapshot=useRef<typeof listedSelectedConversation>(undefined);
  if(listedSelectedConversation)voiceConversationSnapshot.current=listedSelectedConversation;
  const selectedConversation=!listError ? listedSelectedConversation || (!messagesError && !messagesLoading ? historySnapshot?.conversation : undefined) || (voiceBusy&&voiceConversationSnapshot.current?.id===selectedConversationId?voiceConversationSnapshot.current:undefined) : undefined;

  // Send text reply
  const handleSendReply = async () => {
    if (draftReview || draftInvalid || replyText.trim().length > 4096 || !viewingLatest || !live.current || !replyText.trim() || !selectedConversationId || !selectedConversation || messagesError || messagesLoading || !historySnapshot || isSending || voiceBusy || sendLock.current) return;

    sendLock.current = true;
    setIsSending(true);
    try {
      const text=replyText.trim(),conversationId=selectedConversationId;
      const accepted=await sendDashboardText(conversationId,text);
      if(!accepted || !live.current)return;
      const latestDraft = readConversationDraft(draftScope(conversationId));
      if(latestDraft.state === 'ready' && latestDraft.record.text.trim() === text)saveDraft(conversationId, '');
      // Refresh messages
      utils.conversations.getMessages.invalidate({
        conversationId: selectedConversationId,
      });
      void utils.conversations.messageHistory.invalidate({ conversationId });
    } catch (error: any) {
      if(live.current)toast.error(t('staffDashboardReply.unavailable'), { position: 'top-center' });
    } finally {
      sendLock.current = false;
      if(live.current)setIsSending(false);
    }
  };

  const sendDashboardText=async(conversationId:number,message:string)=>{
    const attempt=await staffDashboardAttempt(actorId,currentMerchant.id,conversationId,message);
    if(!live.current || selectedReplyConversation.current!==conversationId)return false;
    // Persist a review marker before contacting the provider. A crash or a failed
    // post-send cleanup must not restore this text as an ordinary unsent draft.
    if (!saveDraft(conversationId, message, true)) {
      saveDraft(conversationId, message, false);
      throw Error('Draft storage unavailable');
    }
    const result=await sendReplyMutation.mutateAsync({conversationId,message,requestId:attempt.requestId});
    if(!live.current)return false;
    attempt.confirmOwner();
    if(result.success)attempt.complete();
    if(selectedReplyConversation.current!==conversationId)return result.success;
    if(!result.success){
      if('status' in result&&result.status!=='pending')toast.warning(t('staffDashboardReply.failed'), { position: 'top-center' });
      else toast.warning(t('staffDashboardReply.pending'), { position: 'top-center' });
      return false;
    }
    if('persisted' in result&&!result.persisted)toast.warning(t('staffDashboardReply.projectionPending'), { position: 'top-center' });
    else toast.success(t('staffDashboardReply.accepted'), { position: 'top-center' });
    return true;
  };

  // A shortcut prepares a draft; only the explicit send action contacts the customer.
  const handleQuickAction = (_action: string, data: QuickActionDraft) => {
    if (draftReview || draftInvalid || !viewingLatest || !selectedConversationId || !data?.message || isSending || voiceBusy) return;
    if (replyText.trim()) {
      toast.warning(t('quickDrafts.existingDraft'), { position: 'top-center' });
      return;
    }
    updateReplyText(data.message);
  };

  return (
    <div className="mw-inbox-page">
      {/* Header */}
      <div>
        <div className="mw-inbox-header">
          <div>
            <h1 className="text-3xl font-bold">
              {t('conversationsPage.title')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('conversationsPage.description')}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2"><StaffTeamReview merchantId={currentMerchant.id} actorUserId={actorId} compact/><ConversationConnection merchantId={currentMerchant.id} actorUserId={actorId}/></div>
        </div>
        {hasActiveFilter && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {needsHumanFilter && <Badge variant="secondary" className="text-sm py-1 px-3">⚠️ تحتاج تدخل بشري</Badge>}
            {stageFilter && <Badge variant="secondary" className="text-sm py-1 px-3">{STAGE_LABELS[stageFilter] || stageFilter}</Badge>}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={voiceBusy || isSending}
              onClick={() => {
                changeRoute({ page: null, stage: null, needs_human: null });
              }}
            >
              ✕ إزالة الفلتر
            </Button>
          </div>
        )}
      </div>

      <div className="mw-inbox-stats" role="status">
        <span>
          {debouncedSearch || hasActiveFilter ? 'نتائج مطابقة' : 'كل المحادثات'}{' '}
          <strong>{listError ? '—' : (conversationsData?.total ?? '…')}</strong>
        </span>
        <span>ابحث باسم العميل أو رقم هاتفه في جميع المحادثات</span>
      </div>

      {/* Main Content — 5-col grid: 2 for list, 3 for chat */}
      <div className="mw-inbox-grid" data-selected={!!selectedConversation || (!!selectedConversationId && !listError)}>
        {/* Conversations List — wider */}
        <Card className="mw-inbox-list">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t('conversationsPage.conversationList')}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('conversationsPage.selectConversation')}
            </CardDescription>
            <div className="relative mt-2">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('conversationsPage.searchPlaceholder')}
                aria-label="البحث في جميع المحادثات"
                maxLength={200}
                disabled={voiceBusy || isSending}
                value={searchQuery}
                onChange={e => setSearchEdit({ source: search, value: e.target.value })}
                className="pr-10 h-9 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="mw-inbox-list-scroll">
              {listError ? (
                <QueryStateCard
                  kind="error"
                  title="تعذر تحميل المحادثات"
                  description="أعد المحاولة لاستعادة قائمة العملاء."
                  onRetry={() => void refetchList()}
                />
              ) : isLoading ? (
                <p className="p-8 text-center" role="status">
                  جارٍ تحميل المحادثات…
                </p>
              ) : filteredConversations && filteredConversations.length > 0 ? (
                <div className="space-y-0">
                  {filteredConversations.map(conversation => (
                    <div
                      key={conversation.id}
                      data-staff-conversation={conversation.id}
                      className={`px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                        selectedConversationId === conversation.id
                          ? 'bg-muted'
                          : ''
                      }`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedConversationId === conversation.id}
                      aria-label={t('merchantUx.actions.viewNamed', {
                        name:
                          conversation.customerName ||
                          conversation.customerPhone,
                      })}
                      onClick={() => selectConversation(conversation.id)}
                      onKeyDown={event => {
                        if (event.currentTarget !== event.target) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectConversation(conversation.id);
                        }
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="text-xs">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-medium text-sm truncate max-w-[140px]">
                              {conversation.customerName ||
                                t('conversationsPage.customer')}
                            </p>
                            <Badge
                              variant={
                                conversation.status === 'active'
                                  ? 'default'
                                  : conversation.status === 'closed'
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {conversation.status === 'active' &&
                                t('conversationsPage.statusActive')}
                              {conversation.status === 'closed' &&
                                t('conversationsPage.statusClosed')}
                              {conversation.status === 'archived' &&
                                t('conversationsPage.statusArchived')}
                            </Badge>
                          </div>
                          <p
                            className="text-xs text-muted-foreground truncate"
                            dir="ltr"
                          >
                            {conversation.customerPhone}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              {activityTime(conversation.lastMessageAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('conversationsPage.noConversations')}</p>
                </div>
              )}
            </ScrollArea>
            <div className="mw-inbox-pagination">
              {!isLoading && !listError && conversationsData && currentPage > Math.max(1, conversationsData.totalPages) && <Button type="button" variant="outline" disabled={isSending || voiceBusy} onClick={() => changeRoute({ page: null, conversationId: null })}>{t('conversationNavigation.firstPage')}</Button>}
              <Button
                type="button"
                variant="outline"
                disabled={currentPage <= 1 || isLoading || isSending || voiceBusy}
                onClick={() => {
                  changeRoute({ conversationId: null, page: currentPage - 1 });
                }}
              >
                السابق
              </Button>
              <span>
                {isLoading
                  ? 'جارٍ التحميل…'
                  : `صفحة ${currentPage} من ${Math.max(1, conversationsData?.totalPages ?? 1)}`}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !conversationsData ||
                  currentPage >= conversationsData.totalPages ||
                  isLoading ||
                  isSending || voiceBusy
                }
                onClick={() => {
                  changeRoute({ conversationId: null, page: currentPage + 1 });
                }}
              >
                التالي
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Messages View */}
        <Card className="mw-inbox-chat">
          {selectedConversation ? (
            <>
              <CardHeader className="mw-chat-header">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="mw-chat-back"
                      aria-label="العودة إلى قائمة المحادثات"
                      disabled={isSending || voiceBusy}
                      onClick={() => selectConversation(null)}
                    >
                      <ArrowRight />
                    </Button>
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">
                        {selectedConversation.customerName ||
                          t('conversationsPage.customer')}
                      </CardTitle>
                      <CardDescription className="text-xs" dir="ltr">
                        {selectedConversation.customerPhone}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {messages && messages.length > 0 && (
                      <ConversationPreviewMode
                        actorUserId={actorId}
                        merchantId={currentMerchant.id}
                        conversationId={selectedConversation.id}
                        timezone={merchantTimezone}
                        messages={messages}
                        customerName={
                          selectedConversation.customerName ||
                          t('conversationsPage.customer')
                        }
                        customerPhone={selectedConversation.customerPhone}
                      />
                    )}
                    <Badge
                      variant={
                        selectedConversation.status === 'active'
                          ? 'default'
                          : selectedConversation.status === 'closed'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {selectedConversation.status === 'active' &&
                        t('conversationsPage.statusActive')}
                      {selectedConversation.status === 'closed' &&
                        t('conversationsPage.statusClosed')}
                      {selectedConversation.status === 'archived' &&
                        t('conversationsPage.statusArchived')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <nav className="mw-chat-toolbar flex flex-wrap items-center gap-2 border-y p-2 text-sm" aria-label={t('conversationHistory.navigation')}>
                <ConversationTools merchantId={currentMerchant.id} actorUserId={actorId} conversationId={selectedConversation.id}/>
                <p className="min-w-0 flex-1 text-xs text-muted-foreground" role="status" title={viewingLatest ? t('conversationHistory.latestWindow') : t('conversationHistory.olderWindow')}>
                  {viewingLatest ? t('merchantUx.conversationTools.latest') : t('merchantUx.conversationTools.older')}
                </p>
                <Button type="button" variant="outline" className="min-h-11" disabled={historyFetching || messagesLoading || !!messagesError || !historySnapshot?.hasMore || !historySnapshot.nextBeforeId || isSending || voiceBusy}
                  onClick={() => { const next=historySnapshot?.nextBeforeId;if(next)setHistoryTrail(current => current.at(-1)===next?current:[...current,next]); }}>
                  {t('conversationHistory.older')}
                </Button>
                {!viewingLatest && <>
                  <Button type="button" variant="outline" className="min-h-11" disabled={isSending || voiceBusy} onClick={() => setHistoryTrail(current => current.slice(0,-1))}>{t('conversationHistory.newer')}</Button>
                  <Button type="button" className="min-h-11" disabled={isSending || voiceBusy} onClick={() => setHistoryTrail([])}>{t('conversationHistory.latest')}</Button>
                </>}
                {viewingLatest && messageScroll.unseen && <Button type="button" className="min-h-11" onClick={messageScroll.jump}>{t('conversationHistory.newMessages')}</Button>}
              </nav>
              <CardContent className="p-0 mw-chat-messages">
                <ScrollArea className="mw-chat-scroll p-4">
                  {messagesError ? (
                    <QueryStateCard
                      kind="error"
                      title={t('merchantUx.conversationMessage.loadFailed')}
                      description={t('merchantUx.conversationMessage.retryDescription')}
                      onRetry={() => void refetchMessages()}
                    />
                  ) : messagesLoading ? (
                    <p role="status">{t('merchantUx.conversationMessage.loading')}</p>
                  ) : messages && messages.length > 0 ? (
                    <div className="space-y-4">
                      {messages.map(message => <ConversationMessage key={message.id} message={message} timezone={merchantTimezone}/>)}
                      <div ref={messageScroll.endRef} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('conversationsPage.noMessages')}</p>
                      </div>
                    </div>
                  )}
                </ScrollArea>

              </CardContent>

              {/* AI Suggestions */}
              <details
                className="mw-chat-extras"
                key={`extras-${selectedConversation.id}`}
              >
                <summary>اقتراحات ساري والإجراءات السريعة</summary>
                <Separator />
                <CardContent className="p-3">
                  {viewingLatest && !draftReview && !draftInvalid && messages && messages.length > 0 && (
                    <AISuggestions
                      merchantId={currentMerchant.id}
                      actorUserId={actorId}
                      conversationId={selectedConversationId!}
                      customerPhone={selectedConversation.customerPhone}
                      version={historySnapshot?.conversation?.handoffVersion ?? selectedConversation.handoffVersion}
                      draftText={replyText}
                      disabled={isSending || voiceBusy || historyFetching || messagesLoading || !!messagesError}
                      messages={messages.map(m => ({
                        id: m.id,
                        content: m.content,
                        direction: m.direction,
                        senderType: m.senderType,
                        timestamp: String(m.createdAt),
                      }))}
                      onSelectSuggestion={(text, expectedDraft) => {
                        if(!live.current || !viewingLatest || isSending || voiceBusy || historyFetching || messagesLoading || messagesError || text.length > 4096)return false;
                        const current = readConversationDraft(draftScope(selectedConversationId!));
                        if(current.state === 'invalid' || (current.state === 'ready' && current.record.review))return false;
                        if((current.state === 'ready' ? current.record.text : '') !== expectedDraft)return false;
                        saveDraft(selectedConversationId!, text);
                        const saved = readConversationDraft(draftScope(selectedConversationId!));
                        return saved.state === 'ready' && saved.record.text === text && !saved.record.review;
                      }}
                      compact
                    />
                  )}
                </CardContent>

                {/* Quick Actions */}
                <Separator />
                <CardContent className="p-3">
                  <QuickActionsBar
                    conversationId={selectedConversationId!}
                    customerPhone={selectedConversation.customerPhone}
                    onActionComplete={handleQuickAction}
                    disabled={draftReview || draftInvalid || !viewingLatest || isSending || voiceBusy}
                  />
                </CardContent>
              </details>
              {/* Text Input + Voice */}
              <Separator />
              <CardContent className="mw-chat-composer">
                {draftReview && !isSending && <div role="status" className="mb-3 space-y-2 text-sm" data-draft-review>
                  <p>{t('conversationDraft.review')}</p>
                  <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={voiceBusy} onClick={() => saveDraft(selectedConversationId!, replyText)}>{t('conversationDraft.reviewed')}</Button>
                </div>}
                {draftInvalid && <div role="alert" className="mb-3 space-y-2 text-sm">
                  <p>{t('conversationDraft.invalid')}</p>
                  <Button type="button" variant="outline" disabled={isSending || voiceBusy} onClick={() => saveDraft(selectedConversationId!, '')}>{t('conversationDraft.startEmpty')}</Button>
                </div>}
                {draft.state === 'expired' && <p role="status" className="mb-2 text-sm">{t('conversationDraft.expired')}</p>}
                {draftUnavailable && <div role="alert" className="mb-3 space-y-2 text-sm" data-draft-storage-error>
                  <p>{t('conversationDraft.storageFailed')}</p>
                  <Button type="button" variant="outline" disabled={isSending || voiceBusy} onClick={() => saveDraft(selectedConversationId!, replyText, draftReview)}>{t('conversationDraft.retry')}</Button>
                </div>}
                {replyText.trim().length > 4096 && <p role="alert" className="mb-2 text-sm">{t('conversationDraft.tooLong')}</p>}
                {replyText && !draftReview && !draftUnavailable && <p role="status" className="mb-2 text-xs text-muted-foreground">{t('conversationDraft.saved')}</p>}
                {!viewingLatest && <p className="mb-2 text-sm text-muted-foreground">{t('conversationHistory.replyFromLatest')}</p>}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Textarea
                      data-staff-draft
                      placeholder="اكتب رسالتك هنا..."
                      aria-label="رسالتك للعميل"
                      disabled={draftReview || draftInvalid || !viewingLatest || isSending || voiceBusy}
                      value={replyText}
                      maxLength={4096}
                      style={{fontSize:16}}
                      onChange={e => updateReplyText(e.target.value)}
                      onKeyDown={e => {
                        if (
                          e.key === 'Enter' &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      className="min-h-[44px] max-h-[120px] resize-none text-base md:text-base"
                      rows={1}
                      dir="auto"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    data-staff-send
                    onClick={handleSendReply}
                    disabled={draftReview || draftInvalid || replyText.trim().length > 4096 || !viewingLatest || !replyText.trim() || isSending || voiceBusy || !!messagesError || messagesLoading || !historySnapshot}
                    className="shrink-0 h-[44px] w-[44px]"
                    aria-label={t('merchantUx.actions.sendMessage')}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <details
                  className="mt-2"
                  key={`voice-${selectedConversation.id}`}
                >
                  <summary className="cursor-pointer text-xs py-1">
                    {t('staffVoice.title')}
                  </summary>
                  <VoiceRecorder
                    disabled={!viewingLatest || isSending || !!messagesError || messagesLoading || !historySnapshot}
                    onBusyChange={setVoiceBusy}
                    onRecordingComplete={async (audioBlob, duration) => {
                      if(!viewingLatest||!live.current||!selectedConversationId||isSending||messagesError||messagesLoading||!historySnapshot||sendLock.current)return false;
                      const conversationId=selectedConversationId;
                      sendLock.current=true;
                      setIsSending(true);
                      try{
                        const attempt=await staffVoiceAttempt(actorId,currentMerchant.id,conversationId,audioBlob,duration);
                        if(!live.current||selectedReplyConversation.current!==conversationId)return false;
                        const result=await sendVoiceReplyMutation.mutateAsync(attempt.input);
                        if(!live.current)return false;
                        attempt.confirmOwner();
                        if(result.success)attempt.complete();
                        if(selectedReplyConversation.current!==conversationId)return result.success;
                        if(!result.success){
                          toast.warning(t('staffVoice.pending'),{position:'top-center'});
                          return false;
                        }
                        if(result.persisted)toast.success(t('staffVoice.accepted'),{position:'top-center'});
                        else toast.warning(t('staffDashboardReply.projectionPending'),{position:'top-center'});
                        utils.conversations.getMessages.invalidate({conversationId});
                        void utils.conversations.messageHistory.invalidate({conversationId});
                        return true;
                      }catch{
                        if(live.current)toast.error(t('staffVoice.unavailable'),{position:'top-center'});
                        return false;
                      }finally{sendLock.current=false;if(live.current)setIsSending(false);}
                    }}
                    onCancel={() => {
                      toast.info(t('toast.conversations.msg3'));
                    }}
                  />
                </details>
              </CardContent>
            </>
          ) : selectedConversationId && !listError ? (
            <div className="space-y-3 p-4">
              <Button type="button" variant="outline" onClick={() => changeRoute({ conversationId: null })}>{t('conversationNavigation.backToList')}</Button>
              {messagesLoading ? <p role="status">{t('conversationNavigation.loading')}</p> : <QueryStateCard kind="error" title={t('conversationNavigation.unavailable')} description={t('conversationNavigation.tryAgain')} onRetry={() => void refetchMessages()} />}
            </div>
          ) : (
            <div className="mw-chat-no-selection">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  {t('conversationsPage.selectToView')}
                </p>
                <p className="text-sm mt-2">
                  {t('conversationsPage.clickToView')}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
