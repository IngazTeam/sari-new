import { useState, useEffect, useRef } from 'react';
import { Bot, User, CheckCircle2, Mic, Image, File, MapPin, Clock, Phone, MoreVertical, Search, ArrowLeft, Send, Paperclip, Smile, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import AudioWaveAnimation from './AudioWaveAnimation';
import { useTranslation } from 'react-i18next';

export interface PreviewMessage {
  id: number | string;
  sender: 'customer' | 'sari' | 'system';
  content: string;
  timestamp: Date | string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  type?: 'text' | 'voice' | 'image' | 'file' | 'location';
  mediaUrl?: string;
  duration?: number; // للرسائل الصوتية
  fileName?: string; // للملفات
  fileSize?: string;
}

interface WhatsAppPreviewProps {
  messages: PreviewMessage[];
  customerName?: string;
  customerPhone?: string;
  isOnline?: boolean;
  lastSeen?: string;
  className?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  showTypingIndicator?: boolean;
  typingText?: string;
  onSendMessage?: (message: string) => void;
  onBack?: () => void;
  compact?: boolean;
  darkMode?: boolean;
  autoScroll?: boolean;
}

export function WhatsAppPreview({
  messages,
  customerName,
  customerPhone = '',
  isOnline = false,
  lastSeen,
  className,
  showHeader = true,
  showFooter = true,
  showTypingIndicator = false,
  typingText,
  onSendMessage,
  onBack,
  compact = false,
  darkMode = false,
  autoScroll = true,
}: WhatsAppPreviewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-US';
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const formatTime = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : t('compWhatsAppPreviewPage.dateUnavailable');
  };

  const formatDate = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    if (!Number.isFinite(date.getTime())) return t('compWhatsAppPreviewPage.dateUnavailable');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return t('compWhatsAppPreviewPage.today');
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('compWhatsAppPreviewPage.yesterday');
    } else {
      return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    }
  };

  const handleSend = () => {
    if (inputValue.trim() && onSendMessage) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3 h-3 text-gray-400" />;
      case 'sent':
        return (
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 16 15" fill="currentColor">
            <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z" />
          </svg>
        );
      case 'delivered':
        return (
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 16 15" fill="currentColor">
            <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
          </svg>
        );
      case 'read':
        return (
          <svg className="w-4 h-4 text-blue-500" viewBox="0 0 16 15" fill="currentColor">
            <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const renderMessage = (message: PreviewMessage, index: number) => {
    const isCustomer = message.sender === 'customer';
    const isSystem = message.sender === 'system';
    const prevMessage = messages[index - 1];
    const showDateSeparator = !prevMessage || 
      formatDate(message.timestamp) !== formatDate(prevMessage.timestamp);

    return (
      <div key={message.id}>
        {/* Date Separator */}
        {showDateSeparator && (
          <div className="flex justify-center my-3">
            <span className={cn(
              "text-xs px-3 py-1 rounded-lg",
              darkMode ? "bg-[#1F2C33] text-gray-400" : "bg-white/90 text-gray-600 shadow-sm"
            )}>
              {formatDate(message.timestamp)}
            </span>
          </div>
        )}

        {/* System Message */}
        {isSystem && (
          <div className="flex justify-center my-2">
            <span className={cn(
              "text-xs px-3 py-1 rounded-lg",
              darkMode ? "bg-[#1F2C33] text-gray-400" : "bg-yellow-100 text-yellow-800"
            )}>
              {message.content}
            </span>
          </div>
        )}

        {/* Regular Message */}
        {!isSystem && (
          <div className={cn(
            "flex gap-2 mb-1",
            isCustomer ? "justify-end" : "justify-start"
          )}>
            {/* Sari Avatar */}
            {!isCustomer && !compact && (
              <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0 mt-auto">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}

            {/* Message Bubble */}
            <div className={cn(
              "max-w-[75%] p-2 rounded-lg shadow-sm relative",
              isCustomer
                ? darkMode 
                  ? "bg-[#005C4B] text-white rounded-tr-none"
                  : "bg-[#DCF8C6] text-gray-900 rounded-tr-none"
                : darkMode
                  ? "bg-[#1F2C33] text-white rounded-tl-none"
                  : "bg-white text-gray-900 rounded-tl-none"
            )}>
              {/* Voice Message */}
              {message.type === 'voice' && (
                <div className="flex items-center gap-3" role="group" aria-label={t('compWhatsAppPreviewPage.voicePreview')}>
                  <span aria-hidden="true" className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Mic className="w-4 h-4 text-white" />
                  </span>
                  <AudioWaveAnimation isPlaying={false} className="flex-1" />
                  <span className={cn(
                    "text-xs font-medium",
                    darkMode ? "text-gray-400" : "text-gray-600"
                  )}>
                    {Number.isFinite(message.duration) && message.duration! >= 0 ? `${Math.floor(message.duration! / 60)}:${String(Math.floor(message.duration! % 60)).padStart(2, '0')}` : '0:00'}
                  </span>
                </div>
              )}

              {/* Image Message */}
              {message.type === 'image' && message.mediaUrl && (
                <div className="space-y-2">
                  <img 
                    src={message.mediaUrl} 
                    alt={t('compWhatsAppPreviewPage.text2')}
                    className="rounded-lg max-w-full h-auto max-h-[300px] object-cover"
                  />
                  {message.content && (
                    <p className="text-sm whitespace-pre-line leading-relaxed">{message.content}</p>
                  )}
                </div>
              )}

              {/* File Message */}
              {message.type === 'file' && (
                <div className={cn(
                  "flex items-center gap-3 p-2 rounded-lg min-w-[200px]",
                  darkMode ? "bg-[#2A3942]" : "bg-gray-100"
                )}>
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <File className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{message.fileName || t('compWhatsAppPreviewPage.file')}</p>
                    <p className={cn(
                      "text-xs",
                      darkMode ? "text-gray-400" : "text-gray-500"
                    )}>
                      {message.fileSize || 'غير معروف'}
                    </p>
                  </div>
                </div>
              )}

              {/* Location Message */}
              {message.type === 'location' && (
                <div className="space-y-2">
                  <div className={cn(
                    "w-full h-32 rounded-lg flex items-center justify-center",
                    darkMode ? "bg-[#2A3942]" : "bg-gray-200"
                  )}>
                    <MapPin className="w-8 h-8 text-red-500" />
                  </div>
                  {message.content && (
                    <p className="text-sm">{message.content}</p>
                  )}
                </div>
              )}

              {/* Text Message */}
              {(!message.type || message.type === 'text') && (
                <p className="text-sm whitespace-pre-line leading-relaxed">{message.content}</p>
              )}

              {/* Timestamp and Status */}
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className={cn(
                  "text-[10px]",
                  darkMode ? "text-gray-400" : "text-gray-500"
                )}>
                  {formatTime(message.timestamp)}
                </span>
                {isCustomer && getStatusIcon(message.status)}
              </div>
            </div>

            {/* Customer Avatar */}
            {isCustomer && !compact && (
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-auto",
                darkMode ? "bg-gray-600" : "bg-gray-300"
              )}>
                <User className={cn(
                  "w-5 h-5",
                  darkMode ? "text-gray-300" : "text-gray-600"
                )} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "flex flex-col rounded-2xl overflow-hidden shadow-xl border",
      darkMode ? "bg-[#0B141A]" : "bg-[#ECE5DD]",
      compact ? "h-[400px]" : "h-[600px]",
      className
    )}>
      {/* Header */}
      {showHeader && (
        <div className="bg-[#075E54] p-3 flex items-center gap-3 flex-shrink-0">
          {onBack && (
            <button type="button" aria-label={t('common.back')} onClick={onBack} className="text-white hover:bg-white/10 min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
            <User className="w-6 h-6 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white truncate">{customerName || t('compWhatsAppPreviewPage.text0')}</div>
            <div className="text-xs text-white/80 flex items-center gap-1">
              {isOnline ? (
                <>
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>{t('whatsAppPreview.auto_0')}</>
              ) : lastSeen ? (
                t('compWhatsAppPreviewPage.lastSeen', { value: lastSeen })
              ) : customerPhone}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-white p-2">
              <Phone className="w-5 h-5" />
            </span>
            <span aria-hidden="true" className="text-white p-2">
              <Search className="w-5 h-5" />
            </span>
            <span aria-hidden="true" className="text-white p-2">
              <MoreVertical className="w-5 h-5" />
            </span>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className={cn(
          "flex-1 p-3 overflow-y-auto",
          darkMode ? "bg-[#0B141A]" : "bg-[#ECE5DD]"
        )}
        style={{
          backgroundImage: darkMode 
            ? 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'%230B141A\' fill-opacity=\'.05\'/%3E%3Cpath d=\'M50 0L0 50M100 0L50 50M100 50L50 100M50 50L0 100\' stroke=\'%23fff\' stroke-opacity=\'.02\' stroke-width=\'.5\'/%3E%3C/svg%3E")'
            : 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'%23ECE5DD\' fill-opacity=\'.05\'/%3E%3Cpath d=\'M50 0L0 50M100 0L50 50M100 50L50 100M50 50L0 100\' stroke=\'%23000\' stroke-opacity=\'.02\' stroke-width=\'.5\'/%3E%3C/svg%3E")',
        }}
      >
        {messages.map((message, index) => renderMessage(message, index))}

        {/* Typing Indicator */}
        {showTypingIndicator && (
          <div className="flex gap-2 justify-start">
            {!compact && (
              <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            <div className={cn(
              "p-3 rounded-lg rounded-tl-none shadow-sm",
              darkMode ? "bg-[#1F2C33]" : "bg-white"
            )}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className={cn(
                  "text-xs",
                  darkMode ? "text-gray-400" : "text-gray-500"
                )}>
                  {typingText || t('compWhatsAppPreviewPage.text1')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Input */}
      {showFooter && (
        <div className={cn(
          "p-2 flex items-center gap-2 flex-shrink-0 border-t",
          darkMode ? "bg-[#1F2C33] border-[#2A3942]" : "bg-white border-gray-200"
        )}>
          <span aria-hidden="true" className="p-2 shrink-0">
            <Smile className={cn(
              "w-5 h-5",
              darkMode ? "text-gray-400" : "text-gray-500"
            )} />
          </span>
          <span aria-hidden="true" className="p-2 shrink-0">
            <Paperclip className={cn(
              "w-5 h-5",
              darkMode ? "text-gray-400" : "text-gray-500"
            )} />
          </span>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!onSendMessage}
              aria-label={t('compWhatsAppPreviewPage.text3')}
              placeholder={t('compWhatsAppPreviewPage.text3')}
              className={cn(
                "w-full min-h-11 px-4 py-2 rounded-full text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] disabled:opacity-60",
                darkMode 
                  ? "bg-[#2A3942] text-white placeholder-gray-400"
                  : "bg-gray-100 text-gray-900 placeholder-gray-500"
              )}
              dir="auto"
            />
          </div>
          <span aria-hidden="true" className="p-2 shrink-0">
            <Camera className={cn(
              "w-5 h-5",
              darkMode ? "text-gray-400" : "text-gray-500"
            )} />
          </span>
          {inputValue.trim() && onSendMessage ? (
            <button 
              type="button"
              aria-label={t('merchantUx.actions.sendMessage')}
              onClick={handleSend}
              className="w-11 h-11 shrink-0 rounded-full bg-[#075E54] flex items-center justify-center hover:bg-[#064E46] transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#075E54]"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          ) : (
            <span aria-hidden="true" className="w-11 h-11 shrink-0 rounded-full bg-[#075E54] flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// مكون مصغر للمعاينة السريعة
export function WhatsAppPreviewMini({
  messages,
  className,
}: {
  messages: PreviewMessage[];
  className?: string;
}) {
  return (
    <WhatsAppPreview
      messages={messages}
      showHeader={false}
      showFooter={false}
      compact={true}
      className={className}
    />
  );
}

export default WhatsAppPreview;
