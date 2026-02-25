import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Bot, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';

interface Message {
  id: number;
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

interface PreviewChatProps {
  businessName?: string;
  botTone?: 'friendly' | 'professional' | 'casual';
  botLanguage?: 'ar' | 'en' | 'both';
  products?: Array<{ name: string; price: number; description?: string }>;
  services?: Array<{ name: string; price?: number; duration?: string }>;
  welcomeMessage?: string;
  className?: string;
  useAI?: boolean;
}

// Quick reply suggestions
const SAMPLE_QUERIES = [
  'السلام عليكم',
  'وش عندكم؟',
  'وش الأسعار؟',
  'أبي أحجز موعد',
];

export default function PreviewChat({
  businessName = 'متجرك',
  botTone = 'friendly',
  botLanguage = 'ar',
  products = [],
  services = [],
  welcomeMessage,
  className = '',
  useAI = true,
}: PreviewChatProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [messageCounter, setMessageCounter] = useState(1);

  // Real AI mutation
  const sendMessageMutation = trpc.testSari.sendMessage.useMutation({
    onSuccess: (data) => {
      const botMessage: Message = {
        id: Date.now(),
        sender: 'bot',
        text: data.response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    },
    onError: (error) => {
      console.error('AI chat error:', error);
      // Fallback to simple response on error
      const botMessage: Message = {
        id: Date.now(),
        sender: 'bot',
        text: 'عذراً، حصل خطأ. حاول مرة ثانية 🙏',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    },
  });

  // Welcome greeting based on tone
  const getGreeting = () => {
    if (welcomeMessage) return welcomeMessage;
    switch (botTone) {
      case 'professional':
        return 'مرحباً بك. أنا ساري، المساعد الافتراضي. كيف يمكنني خدمتك؟';
      case 'casual':
        return 'هلا! أنا ساري 👋 شو تحتاج؟';
      default:
        return 'أهلاً وسهلاً! 😊 أنا ساري، مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟';
    }
  };

  // Initialize with welcome message
  useEffect(() => {
    setMessages([{
      id: 1,
      sender: 'bot',
      text: getGreeting(),
      timestamp: new Date(),
    }]);
    setMessageCounter(2);
  }, [welcomeMessage, botTone]);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage: Message = {
      id: messageCounter,
      sender: 'user',
      text: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setMessageCounter(c => c + 1);
    const currentInput = inputValue;
    setInputValue('');
    setIsTyping(true);

    if (useAI) {
      // Use real AI
      sendMessageMutation.mutate({
        message: currentInput,
      });
    } else {
      // Fallback: simple local response
      setTimeout(() => {
        const botMessage: Message = {
          id: Date.now(),
          sender: 'bot',
          text: getGreeting(),
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, botMessage]);
        setIsTyping(false);
      }, 1000);
    }
  };

  const handleQuickReply = (query: string) => {
    if (isTyping) return;
    setInputValue(query);
    // Use a microtask to ensure state is updated before sending
    setTimeout(() => {
      const userMessage: Message = {
        id: messageCounter,
        sender: 'user',
        text: query,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);
      setMessageCounter(c => c + 1);
      setInputValue('');
      setIsTyping(true);

      if (useAI) {
        sendMessageMutation.mutate({ message: query });
      } else {
        setTimeout(() => {
          const botMessage: Message = {
            id: Date.now(),
            sender: 'bot',
            text: getGreeting(),
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, botMessage]);
          setIsTyping(false);
        }, 1000);
      }
    }, 50);
  };

  const resetChat = () => {
    setMessages([{
      id: 1,
      sender: 'bot',
      text: getGreeting(),
      timestamp: new Date(),
    }]);
    setMessageCounter(2);
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-500 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">ساري - {businessName}</h3>
              <p className="text-xs text-green-100 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></span>
                متصل الآن
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={resetChat}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="h-72 overflow-y-auto p-4 bg-gray-50 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${message.sender === 'user'
                ? 'bg-green-600 text-white rounded-br-md'
                : 'bg-white text-gray-800 shadow-sm rounded-bl-md'
                }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.text}</p>
              <p
                className={`text-xs mt-1 ${message.sender === 'user' ? 'text-green-100' : 'text-gray-400'
                  }`}
              >
                {message.timestamp.toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm rounded-bl-md">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      <div className="px-4 py-2 bg-gray-100 border-t overflow-x-auto">
        <div className="flex gap-2">
          {SAMPLE_QUERIES.map((query, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className="whitespace-nowrap text-xs"
              onClick={() => handleQuickReply(query)}
              disabled={isTyping}
            >
              {query}
            </Button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t">
        <div className="flex gap-2">
          <Input
            placeholder={t('compPreviewChatPage.text0')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1"
            dir="rtl"
            disabled={isTyping}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="bg-green-600 hover:bg-green-700"
          >
            {isTyping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Preview Badge */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center py-2 text-xs">
        <Sparkles className="h-3 w-3 inline-block ml-1" />
        {useAI ? 'ذكاء اصطناعي حقيقي — جرب كيف سيتفاعل ساري مع عملائك' : 'وضع المعاينة — جرب كيف سيتفاعل ساري مع عملائك'}
      </div>
    </Card>
  );
}
