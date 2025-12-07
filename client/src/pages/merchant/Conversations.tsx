import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, User, Bot, Clock, Search } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { ConversationsSkeleton } from '@/components/ConversationsSkeleton';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { toast } from 'sonner';

export default function Conversations() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: conversations, isLoading } = trpc.conversations.list.useQuery();
  const uploadAudioMutation = trpc.voice.uploadAudio.useMutation();

  // Show loading skeleton
  if (isLoading) {
    return <ConversationsSkeleton />;
  }
  
  const { data: messages } = trpc.conversations.getMessages.useQuery(
    { conversationId: selectedConversationId! },
    { enabled: selectedConversationId !== null }
  );

  const filteredConversations = conversations?.filter(conv =>
    conv.customerPhone.includes(searchQuery) ||
    conv.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConversation = conversations?.find(c => c.id === selectedConversationId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">المحادثات</h1>
        <p className="text-muted-foreground mt-2">
          سجل المحادثات مع العملاء والرسائل المتبادلة مع البوت الذكي
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المحادثات</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversations?.length || 0}</div>
            <p className="text-xs text-muted-foreground">جميع المحادثات</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المحادثات النشطة</CardTitle>
            <MessageSquare className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {conversations?.filter(c => c.status === 'active').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">محادثات جارية</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المحادثات المكتملة</CardTitle>
            <MessageSquare className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {conversations?.filter(c => c.status === 'closed').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">تم إغلاقها</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Conversations List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>قائمة المحادثات</CardTitle>
            <CardDescription>اختر محادثة لعرض الرسائل</CardDescription>
            <div className="relative mt-4">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الهاتف أو الاسم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {isLoading ? (
                <div className="p-4 text-center text-muted-foreground">
                  جاري التحميل...
                </div>
              ) : filteredConversations && filteredConversations.length > 0 ? (
                <div className="space-y-1">
                  {filteredConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedConversationId === conversation.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => setSelectedConversationId(conversation.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            <User className="h-5 w-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium truncate">
                              {conversation.customerName || 'عميل'}
                            </p>
                            <Badge
                              variant={
                                conversation.status === 'active'
                                  ? 'default'
                                  : conversation.status === 'closed'
                                  ? 'secondary'
                                  : 'outline'
                              }
                              className="text-xs"
                            >
                              {conversation.status === 'active' && 'نشط'}
                              {conversation.status === 'closed' && 'مغلق'}
                              {conversation.status === 'archived' && 'مؤرشف'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {conversation.customerPhone}
                          </p>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
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
                  <p>لا توجد محادثات بعد</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Messages View */}
        <Card className="md:col-span-2">
          {selectedConversation ? (
            <>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle>{selectedConversation.customerName || 'عميل'}</CardTitle>
                      <CardDescription>{selectedConversation.customerPhone}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={
                      selectedConversation.status === 'active'
                        ? 'default'
                        : selectedConversation.status === 'closed'
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {selectedConversation.status === 'active' && 'نشط'}
                    {selectedConversation.status === 'closed' && 'مغلق'}
                    {selectedConversation.status === 'archived' && 'مؤرشف'}
                  </Badge>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                <ScrollArea className="h-[600px] p-4">
                  {messages && messages.length > 0 ? (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${
                            message.direction === 'incoming' ? 'flex-row' : 'flex-row-reverse'
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
                            className={`flex-1 max-w-[70%] ${
                              message.direction === 'incoming' ? 'items-start' : 'items-end'
                            }`}
                          >
                            <div
                              className={`rounded-lg p-3 ${
                                message.direction === 'incoming'
                                  ? 'bg-muted'
                                  : 'bg-primary text-primary-foreground'
                              }`}
                            >
                              {message.messageType === 'voice' && (
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    رسالة صوتية
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
                                  ساري
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>لا توجد رسائل في هذه المحادثة</p>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
              {/* Voice Recorder */}
              <Separator />
              <CardContent className="p-4">
                <VoiceRecorder
                  onRecordingComplete={async (audioBlob, duration) => {
                    try {
                      // تحويل Blob إلى base64
                      const reader = new FileReader();
                      reader.readAsDataURL(audioBlob);
                      reader.onloadend = async () => {
                        const base64 = reader.result as string;
                        const audioBase64 = base64.split(',')[1]; // إزالة data:audio/webm;base64,

                        toast.loading('جاري رفع التسجيل...');

                        // رفع الملف إلى S3
                        const uploadResult = await uploadAudioMutation.mutateAsync({
                          audioBase64,
                          mimeType: audioBlob.type,
                          duration,
                          conversationId: selectedConversationId!,
                        });

                        if (uploadResult.success) {
                          toast.dismiss();
                          toast.success(`تم رفع التسجيل بنجاح (${uploadResult.size.toFixed(2)}MB)`);

                          // TODO: إرسال الرسالة الصوتية عبر WhatsApp
                          console.log('Audio URL:', uploadResult.audioUrl);
                        }
                      };
                    } catch (error) {
                      toast.dismiss();
                      toast.error('فشل رفع التسجيل');
                      console.error('Upload error:', error);
                    }
                  }}
                  onCancel={() => {
                    toast.info('تم إلغاء التسجيل');
                  }}
                />
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[700px]">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">اختر محادثة لعرض الرسائل</p>
                <p className="text-sm mt-2">اضغط على أي محادثة من القائمة</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
