import { trpc } from '@/lib/trpc';
import { isValidDealStage } from '@shared/const';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, User, Bot, Clock, Search, Send, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConversationsSkeleton } from '@/components/ConversationsSkeleton';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { ConversationPreviewMode } from '@/components/ConversationPreviewMode';
import { AISuggestions } from '@/components/AISuggestions';
import { QuickActionsBar } from '@/components/QuickActions';
import { toast } from 'sonner';

export default function Conversations() {
  const { t } = useTranslation();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Pipeline filter state (from SalesPipeline deep-links)
  const [stageFilter, setStageFilter] = useState<string | undefined>();
  const [needsHumanFilter, setNeedsHumanFilter] = useState<boolean | undefined>();

  // P0-FIX: Read URL params from SalesPipeline deep-links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phone = params.get('phone');
    const stage = params.get('stage');
    const needsHuman = params.get('needs_human');
    if (phone) setSearchQuery(phone);
    if (stage && isValidDealStage(stage)) setStageFilter(stage);
    if (needsHuman === '1') setNeedsHumanFilter(true);
  }, []);

  const STAGE_LABELS: Record<string, string> = {
    ready: '🔥 جاهزون للدفع',
    payment_link_sent: '💳 دفع لم يكتمل',
    stalled: '⏸️ متوقفة',
    new: 'جديد', interested: 'مهتم', qualified: 'مؤهل',
    paid: 'مدفوع', lost: 'خسارة',
  };

  const { data: conversationsData, isLoading } = trpc.conversations.list.useQuery({
    page: currentPage,
    pageSize: 50,
    stage: stageFilter,
    needsHuman: needsHumanFilter,
  });
  const uploadAudioMutation = trpc.voice.uploadAudio.useMutation();
  const sendReplyMutation = trpc.conversations.sendReply.useMutation();
  const utils = trpc.useUtils();

  const { data: messages } = trpc.conversations.getMessages.useQuery(
    { conversationId: selectedConversationId! },
    { enabled: selectedConversationId !== null }
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show loading skeleton
  if (isLoading) {
    return <ConversationsSkeleton />;
  }

  const conversations = conversationsData?.items;

  const filteredConversations = conversations?.filter(conv =>
    conv.customerPhone.includes(searchQuery) ||
    conv.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const hasActiveFilter = stageFilter || needsHumanFilter;

  const selectedConversation = conversations?.find(c => c.id === selectedConversationId);

  // Send text reply
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConversationId || isSending) return;

    setIsSending(true);
    try {
      await sendReplyMutation.mutateAsync({
        conversationId: selectedConversationId,
        message: replyText.trim(),
      });
      setReplyText('');
      toast.success('تم إرسال الرسالة ✓');
      // Refresh messages
      utils.conversations.getMessages.invalidate({ conversationId: selectedConversationId });
    } catch (error: any) {
      toast.error(error.message || 'فشل إرسال الرسالة');
    } finally {
      setIsSending(false);
    }
  };

  // Send quick action message
  const handleQuickAction = async (action: string, data?: any) => {
    if (!selectedConversationId || !data?.message) return;

    try {
      await sendReplyMutation.mutateAsync({
        conversationId: selectedConversationId,
        message: data.message,
      });
      toast.success(`تم تنفيذ: ${action} ✓`);
      utils.conversations.getMessages.invalidate({ conversationId: selectedConversationId });
    } catch (error: any) {
      toast.error(error.message || 'فشل تنفيذ الإجراء');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('conversationsPage.title')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('conversationsPage.description')}
        </p>
        {hasActiveFilter && (
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {needsHumanFilter ? '⚠️ تحتاج تدخل بشري' : `🔍 ${STAGE_LABELS[stageFilter!] || stageFilter}`}
              {' '}({conversationsData?.total || 0})
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => { setStageFilter(undefined); setNeedsHumanFilter(undefined); window.history.replaceState({}, '', window.location.pathname); }}
            >
              ✕ إزالة الفلتر
            </Button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('conversationsPage.totalConversations')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversationsData?.total || 0}</div>
            <p className="text-xs text-muted-foreground">{t('conversationsPage.allConversations')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('conversationsPage.activeConversations')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {conversations?.filter(c => c.status === 'active').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">{t('conversationsPage.ongoingConversations')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('conversationsPage.completedConversations')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {conversations?.filter(c => c.status === 'closed').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">{t('conversationsPage.closedConversations')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content — 5-col grid: 2 for list, 3 for chat */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Conversations List — wider */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('conversationsPage.conversationList')}</CardTitle>
            <CardDescription className="text-xs">{t('conversationsPage.selectConversation')}</CardDescription>
            <div className="relative mt-2">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('conversationsPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 h-9 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {filteredConversations && filteredConversations.length > 0 ? (
                <div className="space-y-0">
                  {filteredConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/40 ${selectedConversationId === conversation.id ? 'bg-muted' : ''
                        }`}
                      onClick={() => setSelectedConversationId(conversation.id)}
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
                              {conversation.customerName || t('conversationsPage.customer')}
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
                              {conversation.status === 'active' && t('conversationsPage.statusActive')}
                              {conversation.status === 'closed' && t('conversationsPage.statusClosed')}
                              {conversation.status === 'archived' && t('conversationsPage.statusArchived')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate" dir="ltr">
                            {conversation.customerPhone}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              {formatDistanceToNow(new Date(conversation.lastMessageAt), {
                                addSuffix: true,
                                locale: ar,
                              })}
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
          </CardContent>
        </Card>

        {/* Messages View */}
        <Card className="lg:col-span-3 flex flex-col">
          {selectedConversation ? (
            <>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{selectedConversation.customerName || t('conversationsPage.customer')}</CardTitle>
                      <CardDescription className="text-xs" dir="ltr">{selectedConversation.customerPhone}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {messages && messages.length > 0 && (
                      <ConversationPreviewMode
                        // @ts-ignore
                        messages={messages}
                        customerName={selectedConversation.customerName || t('conversationsPage.customer')}
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
                      {selectedConversation.status === 'active' && t('conversationsPage.statusActive')}
                      {selectedConversation.status === 'closed' && t('conversationsPage.statusClosed')}
                      {selectedConversation.status === 'archived' && t('conversationsPage.statusArchived')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-0 flex-1">
                <ScrollArea className="h-[400px] p-4">
                  {messages && messages.length > 0 ? (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${message.direction === 'incoming' ? 'flex-row' : 'flex-row-reverse'
                            }`}
                        >
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback>
                              {message.direction === 'incoming' ? (
                                <User className="h-4 w-4" />
                              ) : (
                                <Bot className="h-4 w-4" />
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`flex-1 max-w-[70%] ${message.direction === 'incoming' ? 'items-start' : 'items-end'
                              }`}
                          >
                            <div
                              className={`rounded-lg p-3 ${message.direction === 'incoming'
                                  ? 'bg-muted'
                                  : 'bg-primary text-primary-foreground'
                                }`}
                            >
                              {message.messageType === 'voice' && (
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {t('conversationsPage.voiceMessage')}
                                  </Badge>
                                </div>
                              )}
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                              {message.imageUrl && (
                                <img
                                  src={message.imageUrl}
                                  alt="Media"
                                  className="mt-2 rounded max-w-full h-auto"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 px-1">
                              <span className="text-xs text-muted-foreground">
                                {new Date(message.createdAt).toLocaleTimeString('ar-SA', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {message.direction === 'outgoing' && (
                                <Badge variant="outline" className="text-xs">
                                  {t('conversationsPage.sari')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
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
              <Separator />
              <CardContent className="p-3">
                {messages && messages.length > 0 && (
                  <AISuggestions
                    conversationId={selectedConversationId!}
                    messages={messages.map(m => ({
                      content: m.content,
                      direction: m.direction,
                    }))}
                    customerName={selectedConversation.customerName || undefined}
                    onSelectSuggestion={(text) => {
                      setReplyText(text);
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
                />
              </CardContent>

              {/* Text Input + Voice */}
              <Separator />
              <CardContent className="p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Textarea
                      placeholder="اكتب رسالتك هنا..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      className="min-h-[44px] max-h-[120px] resize-none text-sm"
                      rows={1}
                      dir="auto"
                    />
                  </div>
                  <Button
                    size="icon"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSending}
                    className="shrink-0 h-[44px] w-[44px]"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="mt-2">
                  <VoiceRecorder
                    onRecordingComplete={async (audioBlob, duration) => {
                      try {
                        // تحويل Blob إلى base64
                        const reader = new FileReader();
                        reader.readAsDataURL(audioBlob);
                        reader.onloadend = async () => {
                          const base64 = reader.result as string;
                          const audioBase64 = base64.split(',')[1]; // إزالة data:audio/webm;base64,

                          toast.loading(t('conversationsPage.uploadingRecording'));

                          // رفع الملف إلى S3
                          const uploadResult = await uploadAudioMutation.mutateAsync({
                            audioBase64,
                            mimeType: audioBlob.type,
                            duration,
                            conversationId: selectedConversationId!,
                          });

                          if (uploadResult.success) {
                            toast.dismiss();
                            toast.success(`${t('toast.conversations.msg1')} (${uploadResult.size.toFixed(2)}MB)`);

                            // TODO: إرسال الرسالة الصوتية عبر WhatsApp
                            console.log('Audio URL:', uploadResult.audioUrl);
                          }
                        };
                      } catch (error) {
                        toast.dismiss();
                        toast.error(t('toast.conversations.msg2'));
                        console.error('Upload error:', error);
                      }
                    }}
                    onCancel={() => {
                      toast.info(t('toast.conversations.msg3'));
                    }}
                  />
                </div>
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[700px]">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">{t('conversationsPage.selectToView')}</p>
                <p className="text-sm mt-2">{t('conversationsPage.clickToView')}</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}