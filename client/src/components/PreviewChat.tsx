import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, Bot, User, Sparkles, RefreshCw } from 'lucide-react';

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
}

// Sample responses based on tone
const RESPONSES = {
  friendly: {
    greeting: 'أهلاً وسهلاً! 😊 أنا ساري، مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟',
    productAsk: 'أكيد عندنا! 🎉 دقيقة أجيب لك المعلومات...',
    productFound: (name: string, price: number) => `نعم متوفر! ${name} بسعر ${price} ريال فقط 💰 تبي تطلب؟`,
    serviceAsk: 'بكل سرور! 🌟 خليني أشوف الخدمات المتاحة...',
    serviceFound: (name: string) => `عندنا خدمة ${name} وهي من أفضل خدماتنا! 🔥 تبي تحجز موعد؟`,
    notFound: 'للأسف ما لقيت اللي تدور عليه 😅 بس خليني أساعدك بشيء ثاني!',
    thanks: 'العفو! 😊 أي شيء ثاني أقدر أساعدك فيه؟',
    bye: 'تشرفنا! 👋 لا تتردد تراسلنا أي وقت',
  },
  professional: {
    greeting: 'مرحباً بك. أنا ساري، المساعد الافتراضي. كيف يمكنني خدمتك؟',
    productAsk: 'بالتأكيد، دعني أتحقق من المنتجات المتوفرة...',
    productFound: (name: string, price: number) => `نعم، ${name} متوفر لدينا بسعر ${price} ريال. هل ترغب في الطلب؟`,
    serviceAsk: 'سأتحقق من الخدمات المتاحة لك...',
    serviceFound: (name: string) => `نقدم خدمة ${name}. هل تود حجز موعد؟`,
    notFound: 'عذراً، لم أجد ما تبحث عنه. هل يمكنني مساعدتك بشيء آخر؟',
    thanks: 'على الرحب والسعة. هل هناك شيء آخر يمكنني مساعدتك به؟',
    bye: 'شكراً لتواصلك معنا. نتطلع لخدمتك مجدداً.',
  },
  casual: {
    greeting: 'هلا! أنا ساري 👋 شو تحتاج؟',
    productAsk: 'تمام، خليني أشوف...',
    productFound: (name: string, price: number) => `إيه عندنا ${name} بـ ${price} ريال. تبيه؟`,
    serviceAsk: 'أوكي، دقيقة...',
    serviceFound: (name: string) => `عندنا ${name}، تبي تحجز؟`,
    notFound: 'ما لقيت شي 😕 بس قولي شو تبي بالضبط',
    thanks: 'ولا يهمك! شي ثاني؟',
    bye: 'باي! 👋',
  },
};

// Sample user queries to simulate
const SAMPLE_QUERIES = [
  'السلام عليكم',
  'عندكم منتجات؟',
  'وش الأسعار؟',
  'أبي أحجز موعد',
  'شكراً',
  'مع السلامة',
];

export default function PreviewChat({
  businessName = 'متجرك',
  botTone = 'friendly',
  botLanguage = 'ar',
  products = [],
  services = [],
  welcomeMessage,
  className = '',
}: PreviewChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const responses = RESPONSES[botTone];

  // Initialize with welcome message
  useEffect(() => {
    const initialMessage: Message = {
      id: 1,
      sender: 'bot',
      text: welcomeMessage || responses.greeting,
      timestamp: new Date(),
    };
    setMessages([initialMessage]);
  }, [welcomeMessage, botTone]);

  // Auto scroll to bottom — scroll within container only (prevents page jitter)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Simulate bot response
  const generateBotResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();

    // Greeting detection
    if (lowerMessage.includes('سلام') || lowerMessage.includes('هلا') || lowerMessage.includes('مرحبا')) {
      return welcomeMessage || responses.greeting;
    }

    // Product inquiry
    if (lowerMessage.includes('منتج') || lowerMessage.includes('سعر') || lowerMessage.includes('عندكم')) {
      if (products.length > 0) {
        const product = products[0];
        return responses.productFound(product.name, product.price);
      }
      return responses.notFound;
    }

    // Service/booking inquiry
    if (lowerMessage.includes('خدم') || lowerMessage.includes('حجز') || lowerMessage.includes('موعد')) {
      if (services.length > 0) {
        const service = services[0];
        return responses.serviceFound(service.name);
      }
      return responses.notFound;
    }

    // Thanks
    if (lowerMessage.includes('شكر') || lowerMessage.includes('thanks')) {
      return responses.thanks;
    }

    // Goodbye
    if (lowerMessage.includes('سلام') || lowerMessage.includes('باي') || lowerMessage.includes('bye')) {
      return responses.bye;
    }

    // Default response
    return welcomeMessage || responses.greeting;
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      sender: 'user',
      text: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate typing delay
    setTimeout(() => {
      const botResponse: Message = {
        id: messages.length + 2,
        sender: 'bot',
        text: generateBotResponse(inputValue),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleQuickReply = (query: string) => {
    setInputValue(query);
    setTimeout(() => handleSendMessage(), 100);
  };

  const resetChat = () => {
    const initialMessage: Message = {
      id: 1,
      sender: 'bot',
      text: welcomeMessage || responses.greeting,
      timestamp: new Date(),
    };
    setMessages([initialMessage]);
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
      <div ref={messagesContainerRef} className="h-64 overflow-y-auto p-4 bg-gray-50 space-y-4">
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
          {SAMPLE_QUERIES.slice(0, 4).map((query, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className="whitespace-nowrap text-xs"
              onClick={() => handleQuickReply(query)}
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
            placeholder="اكتب رسالتك..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1"
            dir="rtl"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="bg-green-600 hover:bg-green-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Preview Badge */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center py-2 text-xs">
        <Sparkles className="h-3 w-3 inline-block ml-1" />
        وضع المعاينة - جرب كيف سيتفاعل ساري مع عملائك
      </div>
    </Card>
  );
}
