import { useState } from 'react';
import { WhatsAppPreview, PreviewMessage } from './WhatsAppPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Maximize2, Moon, Sun, Smartphone, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  content: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string | Date;
  messageType?: string;
  imageUrl?: string;
}

interface ConversationPreviewModeProps {
  messages: Message[];
  customerName?: string;
  customerPhone?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export function ConversationPreviewMode({
  messages,
  customerName = 'عميل',
  customerPhone = '',
  isOnline = false,
  lastSeen,
}: ConversationPreviewModeProps) {
  const { t } = useTranslation();
  const [darkMode, setDarkMode] = useState(false);
  const [deviceView, setDeviceView] = useState<'mobile' | 'desktop'>('mobile');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // تحويل الرسائل إلى تنسيق WhatsAppPreview
  const previewMessages: PreviewMessage[] = messages.map((msg) => ({
    id: msg.id,
    sender: msg.direction === 'incoming' ? 'customer' : 'sari',
    content: msg.content,
    timestamp: msg.createdAt,
    status: 'read' as const,
    type: msg.messageType === 'voice' ? 'voice' : msg.imageUrl ? 'image' : 'text',
    mediaUrl: msg.imageUrl,
  }));

  const PreviewContent = () => (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={darkMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? <Moon className="w-4 h-4 mr-2" /> : <Sun className="w-4 h-4 mr-2" />}
            {darkMode ? 'داكن' : 'فاتح'}
          </Button>
          <Button
            variant={deviceView === 'mobile' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDeviceView('mobile')}
          >
            <Smartphone className="w-4 h-4 mr-2" />{t('conversationPreviewMode.auto_0')}</Button>
          <Button
            variant={deviceView === 'desktop' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDeviceView('desktop')}
          >
            <Monitor className="w-4 h-4 mr-2" />{t('conversationPreviewMode.auto_1')}</Button>
        </div>
      </div>

      {/* Preview */}
      <div className={cn(
        "flex justify-center",
        deviceView === 'mobile' ? 'max-w-[375px] mx-auto' : 'w-full'
      )}>
        <WhatsAppPreview
          messages={previewMessages}
          customerName={customerName}
          customerPhone={customerPhone}
          isOnline={isOnline}
          lastSeen={lastSeen}
          darkMode={darkMode}
          showFooter={false}
          className={cn(
            "w-full",
            deviceView === 'desktop' && "h-[500px]"
          )}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* زر المعاينة */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Eye className="w-4 h-4 mr-2" />{t('conversationPreviewMode.auto_2')}</Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />{t('conversationPreviewMode.auto_3')}</DialogTitle>
          </DialogHeader>
          <PreviewContent />
        </DialogContent>
      </Dialog>
    </>
  );
}

// مكون للمعاينة المضمنة (Inline Preview)
export function InlineConversationPreview({
  messages,
  customerName = 'عميل',
  customerPhone = '',
  isOnline = false,
  className,
}: {
  messages: Message[];
  customerName?: string;
  customerPhone?: string;
  isOnline?: boolean;
  className?: string;
}) {
  const previewMessages: PreviewMessage[] = messages.map((msg) => ({
    id: msg.id,
    sender: msg.direction === 'incoming' ? 'customer' : 'sari',
    content: msg.content,
    timestamp: msg.createdAt,
    status: 'read' as const,
    type: msg.messageType === 'voice' ? 'voice' : msg.imageUrl ? 'image' : 'text',
    mediaUrl: msg.imageUrl,
  }));

  return (
    <WhatsAppPreview
      messages={previewMessages}
      customerName={customerName}
      customerPhone={customerPhone}
      isOnline={isOnline}
      compact={true}
      showFooter={false}
      className={className}
    />
  );
}

export default ConversationPreviewMode;
