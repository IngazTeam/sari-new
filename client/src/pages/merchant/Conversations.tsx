import {StaffTeamReview} from '@/components/StaffTeamReview';
import { trpc } from '@/lib/trpc';
import { staffVoiceAttempt } from '@/lib/staff-voice-attempt';
import { staffDashboardAttempt } from '@/lib/staff-dashboard-attempt';
import { ConversationHandoff } from '@/components/ConversationHandoff';
import { EscalationReconciliation } from '@/components/EscalationReconciliation';
import { SalesOfferReview } from '@/components/SalesOfferReview';
import { StaffAttemptReview } from '@/components/StaffAttemptReview';
import { useLocation, useSearch } from 'wouter';
import { conversationHref, conversationNavigation } from '@/lib/conversation-navigation';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowRight,
  MessageSquare,
  User,
  Bot,
  Clock,
  Search,
  Send,
  Loader2,
  Image as ImageIcon,
  FileText,
  Download,
  RefreshCw,
  AlertTriangle,
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
  const drafts = useRef(new Map<string, Record<number, string>>());
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
  if (!drafts.current.has(key)) drafts.current.set(key, {});
  return <ScopedConversations key={key} currentMerchant={merchant.data} draftStore={drafts.current.get(key)!} />;
}

function ScopedConversations({ currentMerchant, draftStore }: { currentMerchant: { id: number; timezone?: string | null }; draftStore: Record<number, string> }) {
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
  const drafts = useRef(draftStore);
  const [, refreshDraft] = useState(0);
  const replyText = selectedConversationId ? drafts.current[selectedConversationId] || '' : '';
  const setReplyText = (value: string | ((current: string) => string)) => {
    if (!selectedConversationId) return;
    const current = drafts.current[selectedConversationId] || '';
    drafts.current[selectedConversationId] = typeof value === 'function' ? value(current) : value;
    refreshDraft(version => version + 1);
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
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const updateReplyText = (text: string) => setReplyText(text);
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
  const syncMutation = trpc.conversations.syncFromWhatsApp.useMutation();
  const diagnoseMutation = trpc.conversations.diagnoseWebhook.useMutation();
  const { data: connectionHealth } =
    trpc.conversations.connectionStatus.useQuery(undefined, {
      refetchInterval: 60_000, // Check every 60 seconds
      staleTime: 30_000,
    });
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
    if (!viewingLatest || !live.current || !replyText.trim() || !selectedConversationId || !selectedConversation || messagesError || messagesLoading || !historySnapshot || isSending || voiceBusy || sendLock.current) return;

    sendLock.current = true;
    setIsSending(true);
    try {
      const text=replyText.trim(),conversationId=selectedConversationId;
      const accepted=await sendDashboardText(conversationId,text);
      if(!accepted || !live.current)return;
      if(drafts.current[conversationId]?.trim()===text)drafts.current[conversationId]='';
      refreshDraft(version => version + 1);
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
    const attempt=await staffDashboardAttempt(currentMerchant?.id??0,conversationId,message);
    if(!live.current || selectedReplyConversation.current!==conversationId)return false;
    const result=await sendReplyMutation.mutateAsync({conversationId,message,requestId:attempt.requestId});
    if(!live.current)return false;
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
    if (!viewingLatest || !selectedConversationId || !data?.message || isSending || voiceBusy) return;
    if (replyText.trim()) {
      toast.warning(t('quickDrafts.existingDraft'), { position: 'top-center' });
      return;
    }
    updateReplyText(data.message);
  };

  return (
    <div className="mw-inbox-page">
      <StaffTeamReview/>
      {/* WhatsApp Disconnected Warning Banner */}
      {connectionHealth &&
        !connectionHealth.connected &&
        connectionHealth.state !== 'no_instance' && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="text-red-800 dark:text-red-200 font-medium">
                ⚠️ واتساب غير متصل — الرسائل لا تصل حالياً
              </p>
              <p className="text-red-600 dark:text-red-300 text-sm mt-1">
                {connectionHealth.message}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
              onClick={() =>
                (window.location.href = '/merchant/whatsapp-instances')
              }
            >
              إعادة الربط
            </Button>
          </div>
        )}

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
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            disabled={syncMutation.isPending || diagnoseMutation.isPending}
            onClick={async () => {
              try {
                // Step 1: Diagnose & fix webhook + settings
                const diagResult = await diagnoseMutation.mutateAsync();

                if (diagResult.status === 'no_instance') {
                  toast.error('لا يوجد اتصال واتساب نشط');
                  return;
                }

                if (diagResult.status === 'disconnected') {
                  toast.error(diagResult.message, { duration: 8000 });
                  return;
                }

                if (diagResult.fixed) {
                  toast.success(diagResult.message, { duration: 6000 });
                } else if (diagResult.status === 'ok') {
                  toast.success(diagResult.message);
                } else {
                  toast.error(diagResult.message, { duration: 6000 });
                }

                // Log details to console for debugging
                console.log('[Diagnose] Full result:', diagResult);

                // Step 2: Sync historical messages
                const result = await syncMutation.mutateAsync();
                if (result.messagesImported > 0 || result.chatsImported > 0) {
                  toast.success(
                    `تم استيراد ${result.chatsImported} محادثة جديدة و ${result.messagesImported} رسالة`
                  );
                }
                utils.conversations.list.invalidate();
                utils.conversations.listRecent.invalidate();
              } catch (err: any) {
                toast.error(err.message || 'فشلت المزامنة');
              }
            }}
          >
            <RefreshCw
              className={`h-4 w-4 ${syncMutation.isPending || diagnoseMutation.isPending ? 'animate-spin' : ''}`}
            />
            {syncMutation.isPending || diagnoseMutation.isPending
              ? 'جاري الفحص...'
              : 'مزامنة من واتساب'}
          </Button>
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
                        // @ts-ignore
                        messages={messages}
                        customerName={
                          selectedConversation.customerName ||
                          t('conversationsPage.customer')
                        }
                        customerPhone={selectedConversation.customerPhone}
                        isOnline={selectedConversation.status === 'active'}
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
              <details
                className="mw-chat-actions"
                key={`actions-${selectedConversation.id}`}
              >
                <summary>إدارة المحادثة ومراجعة العروض</summary>
                <div className="p-4">
                  <ConversationHandoff
                    key={selectedConversation.id}
                    conversationId={selectedConversation.id}
                  />
                </div>
                <div className="px-4 pb-4">
                  <EscalationReconciliation
                    key={selectedConversation.id}
                    conversationId={selectedConversation.id}
                  />
                </div>
                <div className="px-4 pb-4">
                  <SalesOfferReview
                    key={selectedConversation.id}
                    conversationId={selectedConversation.id}
                  />
                </div>
              </details>
              <StaffAttemptReview key={`attempts-${selectedConversation.id}`} conversationId={selectedConversation.id} />
              <nav className="flex flex-wrap items-center gap-2 border-y p-3 text-sm" aria-label={t('conversationHistory.navigation')}>
                <p className="w-full text-muted-foreground" role="status">
                  {viewingLatest ? t('conversationHistory.latestWindow') : t('conversationHistory.olderWindow')}
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
                      title="تعذر تحميل الرسائل"
                      description="أعد المحاولة لعرض سجل المحادثة."
                      onRetry={() => void refetchMessages()}
                    />
                  ) : messagesLoading ? (
                    <p role="status">جارٍ تحميل الرسائل…</p>
                  ) : messages && messages.length > 0 ? (
                    <div className="space-y-4">
                      {messages.map(message => {
                        // Resolve media URLs — check imageUrl, mediaUrl, and legacy voiceUrl fallback
                        const imgUrl =
                          (message as any).imageUrl ||
                          (message as any).mediaUrl ||
                          null;
                        const docUrl = (message as any).mediaUrl || null;
                        const isImage =
                          message.messageType === 'image' ||
                          (imgUrl &&
                            /\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(imgUrl));
                        const isDocument = message.messageType === 'document';
                        const isVoice = message.messageType === 'voice';
                        // Legacy fallback: old messages stored image URL in voiceUrl
                        const legacyImgUrl =
                          !imgUrl &&
                          !isVoice &&
                          (message as any).voiceUrl &&
                          message.messageType === 'image'
                            ? (message as any).voiceUrl
                            : null;
                        const finalImgUrl = imgUrl || legacyImgUrl;

                        return (
                          <div
                            key={message.id}
                            id={`conversation-message-${message.id}`}
                            className={`flex gap-3 ${
                              message.direction === 'incoming'
                                ? 'flex-row'
                                : 'flex-row-reverse'
                            }`}
                          >
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarFallback>
                                {message.direction === 'incoming' ||
                                message.senderType === 'merchant' ? (
                                  <User className="h-4 w-4" />
                                ) : (
                                  <Bot className="h-4 w-4" />
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div
                              className={`min-w-0 mw-chat-bubble ${
                                message.direction === 'incoming'
                                  ? 'items-start'
                                  : 'items-end'
                              }`}
                            >
                              <div
                                className={`rounded-lg p-3 ${
                                  message.direction === 'incoming'
                                    ? 'bg-muted'
                                    : 'bg-primary text-primary-foreground'
                                }`}
                              >
                                {/* Voice Message Badge */}
                                {isVoice && (
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {t('conversationsPage.voiceMessage')}
                                    </Badge>
                                  </div>
                                )}

                                {/* Image Display */}
                                {isImage && finalImgUrl && (
                                  <div className="mb-2">
                                    <div
                                      className="relative group cursor-pointer overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                      role="button"
                                      tabIndex={0}
                                      aria-label={t(
                                        'merchantUx.actions.openConversationImage'
                                      )}
                                      onClick={() =>
                                        setLightboxImage(finalImgUrl)
                                      }
                                      onKeyDown={event => {
                                        if (
                                          event.key === 'Enter' ||
                                          event.key === ' '
                                        ) {
                                          event.preventDefault();
                                          setLightboxImage(finalImgUrl);
                                        }
                                      }}
                                    >
                                      <img
                                        src={finalImgUrl}
                                        alt="صورة من المحادثة"
                                        className="rounded-md max-w-full max-h-[250px] object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                        loading="lazy"
                                        onError={e => {
                                          // Hide broken images
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = 'none';
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                        <ImageIcon className="h-6 w-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
                                      </div>
                                    </div>
                                    {message.messageType === 'image' && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground">
                                          صورة
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Document Display */}
                                {isDocument && docUrl && (
                                  <div className="mb-2">
                                    <a
                                      href={docUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`flex items-center gap-3 p-2.5 rounded-md border transition-colors ${
                                        message.direction === 'incoming'
                                          ? 'border-border/60 bg-background/50 hover:bg-background/80'
                                          : 'border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/15'
                                      }`}
                                    >
                                      <div
                                        className={`p-2 rounded-md ${
                                          message.direction === 'incoming'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-primary-foreground/20 text-primary-foreground'
                                        }`}
                                      >
                                        <FileText className="h-5 w-5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                          {message.content?.includes('[ملف:')
                                            ? message.content
                                                .replace(/\[ملف:\s*/, '')
                                                .replace(']', '')
                                                .trim()
                                            : 'ملف مرفق'}
                                        </p>
                                        <p
                                          className={`text-[10px] ${
                                            message.direction === 'incoming'
                                              ? 'text-muted-foreground'
                                              : 'text-primary-foreground/70'
                                          }`}
                                        >
                                          اضغط للتحميل
                                        </p>
                                      </div>
                                      <Download className="h-4 w-4 shrink-0 opacity-60" />
                                    </a>
                                  </div>
                                )}

                                {/* Text Content */}
                                {message.content &&
                                  !(
                                    isDocument &&
                                    message.content.startsWith('[ملف:')
                                  ) && (
                                    <p className="text-sm whitespace-pre-wrap break-words">
                                      {message.content}
                                    </p>
                                  )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 px-1">
                                <span className="text-xs text-muted-foreground">
                                  {parseMerchantDate(message.createdAt).toLocaleTimeString('ar-SA', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: merchantTimezone,
                                  })}
                                </span>
                                {message.direction === 'outgoing' && (
                                  <Badge variant="outline" className="text-xs">
                                    {message.senderType === 'merchant'
                                      ? t('merchantUx.handoff.employee')
                                      : message.senderType === 'assistant'
                                        ? t('merchantUx.handoff.assistant')
                                        : t('merchantUx.handoff.unknown')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
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

                {/* Image Lightbox Dialog */}
                <Dialog
                  open={!!lightboxImage}
                  onOpenChange={() => setLightboxImage(null)}
                >
                  <DialogContent className="max-w-4xl max-h-[90vh] p-2 bg-black/90 border-none">
                    <DialogHeader className="sr-only">
                      <DialogTitle>
                        {t('merchantUx.actions.mediaPreview')}
                      </DialogTitle>
                      <DialogDescription>
                        {t('merchantUx.actions.mediaPreview')}
                      </DialogDescription>
                    </DialogHeader>
                    {lightboxImage && (
                      <div className="flex items-center justify-center w-full h-full min-h-[300px]">
                        <img
                          src={lightboxImage}
                          alt="عرض الصورة"
                          className="max-w-full max-h-[80vh] object-contain rounded"
                        />
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </CardContent>

              {/* AI Suggestions */}
              <details
                className="mw-chat-extras"
                key={`extras-${selectedConversation.id}`}
              >
                <summary>اقتراحات ساري والإجراءات السريعة</summary>
                <Separator />
                <CardContent className="p-3">
                  {viewingLatest && messages && messages.length > 0 && (
                    <AISuggestions
                      conversationId={selectedConversationId!}
                      messages={messages.map(m => ({
                        content: m.content,
                        direction: m.direction,
                      }))}
                      customerName={
                        selectedConversation.customerName || undefined
                      }
                      onSelectSuggestion={text => {
                        if(!viewingLatest || isSending || voiceBusy)return;
                        updateReplyText(text);
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
                    disabled={!viewingLatest || isSending || voiceBusy}
                  />
                </CardContent>
              </details>
              {/* Text Input + Voice */}
              <Separator />
              <CardContent className="mw-chat-composer">
                {!viewingLatest && <p className="mb-2 text-sm text-muted-foreground">{t('conversationHistory.replyFromLatest')}</p>}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Textarea
                      data-staff-draft
                      placeholder="اكتب رسالتك هنا..."
                      aria-label="رسالتك للعميل"
                      disabled={!viewingLatest || isSending || voiceBusy}
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
                    disabled={!viewingLatest || !replyText.trim() || isSending || voiceBusy || !!messagesError || messagesLoading || !historySnapshot}
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
                        const attempt=await staffVoiceAttempt(currentMerchant?.id??0,conversationId,audioBlob,duration);
                        if(!live.current||selectedReplyConversation.current!==conversationId)return false;
                        const result=await sendVoiceReplyMutation.mutateAsync(attempt.input);
                        if(!live.current)return false;
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
