import { useState, useEffect } from 'react';
import { Bot, User, CheckCircle2, Package, CreditCard, Mic } from 'lucide-react';
import AudioWaveAnimation from './AudioWaveAnimation';
import { useTranslation } from 'react-i18next';

interface Message {
  id: number;
  sender: 'customer' | 'sari';
  text: string;
  timestamp?: string;
  status?: 'sending' | 'sent' | 'delivered';
  isTyping?: boolean;
  isVoice?: boolean;
}

const chatScenario: Omit<Message, 'id'>[] = [
  {
    sender: 'customer',
    text: 'السلام عليكم، عندكم ساعات ذكية؟',
    status: 'delivered',
  },
  {
    sender: 'sari',
    text: 'وعليكم السلام! أهلاً وسهلاً 😊\n\nنعم عندنا مجموعة رائعة من الساعات الذكية:\n\n⌚ Apple Watch Series 9 - 1,899 ريال\n⌚ Samsung Galaxy Watch 6 - 1,299 ريال\n⌚ Xiaomi Smart Band 8 - 199 ريال\n\nأي موديل يهمك؟',
    status: 'delivered',
  },
  {
    sender: 'customer',
    text: 'رسالة صوتية - 0:05',
    status: 'delivered',
    isVoice: true,
  },
  {
    sender: 'sari',
    text: 'ممتاز! Apple Watch Series 9 خيار رائع 👌\n\nالمواصفات:\n✅ شاشة Retina دائمة\n✅ مقاومة للماء\n✅ مستشعر صحي متقدم\n✅ بطارية تدوم 18 ساعة\n\nالسعر: 1,899 ريال\nمتوفر باللون: الأسود، الفضي، الذهبي\n\nتبي تطلبه؟',
    status: 'delivered',
  },
  {
    sender: 'customer',
    text: 'نعم، أبي واحد أسود',
    status: 'delivered',
  },
  {
    sender: 'sari',
    text: 'تمام! 🎉\n\nتفاصيل الطلب:\n📦 Apple Watch Series 9 (أسود)\n💰 السعر: 1,899 ريال\n📍 العنوان: ؟\n\nوين تبي التوصيل؟',
    status: 'delivered',
  },
  {
    sender: 'customer',
    text: 'الرياض، حي النرجس',
    status: 'delivered',
  },
  {
    sender: 'sari',
    text: '✅ تم تأكيد الطلب!\n\n📋 ملخص الطلب:\n━━━━━━━━━━━━━━\n📦 المنتج: Apple Watch Series 9 (أسود)\n💰 السعر: 1,899 ريال\n🚚 التوصيل: 30 ريال\n━━━━━━━━━━━━━━\n💳 الإجمالي: 1,929 ريال\n\n📍 العنوان: الرياض، حي النرجس\n⏱️ التوصيل: 2-3 أيام عمل\n\n🔗 رابط الدفع:\nhttps://pay.sary.live/order/ABC123\n\nشكراً لك! 🙏',
    status: 'delivered',
  },
];

export default function LiveChatDemo() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    // Reset and start animation
    const startAnimation = () => {
      setMessages([]);
      setCurrentMessageIndex(0);
      setIsTyping(false);
      setDisplayedText('');
      setCharIndex(0);
    };

    startAnimation();
  }, []);

  useEffect(() => {
    if (currentMessageIndex >= chatScenario.length) {
      // Animation complete, restart after delay
      const restartTimer = setTimeout(() => {
        setMessages([]);
        setCurrentMessageIndex(0);
        setIsTyping(false);
        setDisplayedText('');
        setCharIndex(0);
      }, 5000);
      return () => clearTimeout(restartTimer);
    }

    const currentScenarioMessage = chatScenario[currentMessageIndex];
    
    // Delay before showing next message
    const delayTimer = setTimeout(() => {
      if (currentScenarioMessage.sender === 'sari') {
        // Show typing indicator for Sari
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          setDisplayedText('');
          setCharIndex(0);
        }, 1500);
      } else {
        // Customer messages appear instantly
        setMessages(prev => [...prev, {
          ...currentScenarioMessage,
          id: currentMessageIndex,
        }]);
        setCurrentMessageIndex(prev => prev + 1);
      }
    }, currentMessageIndex === 0 ? 500 : 1500);

    return () => clearTimeout(delayTimer);
  }, [currentMessageIndex]);

  useEffect(() => {
    if (!isTyping && currentMessageIndex < chatScenario.length) {
      const currentScenarioMessage = chatScenario[currentMessageIndex];
      
      if (currentScenarioMessage.sender === 'sari' && charIndex < currentScenarioMessage.text.length) {
        const typingTimer = setTimeout(() => {
          setDisplayedText(prev => prev + currentScenarioMessage.text[charIndex]);
          setCharIndex(prev => prev + 1);
        }, 30); // Typing speed

        return () => clearTimeout(typingTimer);
      } else if (currentScenarioMessage.sender === 'sari' && charIndex === currentScenarioMessage.text.length && charIndex > 0) {
        // Finished typing, add complete message
        setMessages(prev => [...prev, {
          ...currentScenarioMessage,
          id: currentMessageIndex,
        }]);
        setCurrentMessageIndex(prev => prev + 1);
        setDisplayedText('');
        setCharIndex(0);
      }
    }
  }, [isTyping, charIndex, currentMessageIndex]);

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl border bg-card h-[600px] flex flex-col">
      {/* Chat Header */}
      <div className="bg-[#075E54] p-4 flex items-center gap-3 flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
          <Bot className="w-7 h-7 text-[#075E54]" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-white">{t('compLiveChatDemoPage.text0')}</div>
          <div className="text-sm text-white/80 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            متصل الآن
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto bg-[#ECE5DD] dark:bg-[#0B141A]" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'%23ECE5DD\' fill-opacity=\'.05\'/%3E%3Cpath d=\'M50 0L0 50M100 0L50 50M100 50L50 100M50 50L0 100\' stroke=\'%23000\' stroke-opacity=\'.02\' stroke-width=\'.5\'/%3E%3C/svg%3E")',
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${message.sender === 'customer' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
          >
            {message.sender === 'sari' && (
              <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[75%] p-3 rounded-lg shadow-sm ${
                message.sender === 'customer'
                  ? 'bg-[#DCF8C6] dark:bg-[#005C4B] text-gray-900 dark:text-white rounded-tr-none'
                  : 'bg-white dark:bg-[#1F2C33] text-gray-900 dark:text-white rounded-tl-none'
              }`}
            >
              {message.isVoice ? (
                <div className="flex items-center gap-3 min-w-[200px]">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Mic className="w-4 h-4 text-white" />
                  </div>
                  <AudioWaveAnimation isPlaying={true} className="flex-1" />
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">0:05</span>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-line leading-relaxed">{message.text}</p>
              )}
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {message.sender === 'customer' && (
                  <CheckCircle2 className="w-3 h-3 text-blue-500" />
                )}
              </div>
            </div>
            {message.sender === 'customer' && (
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </div>
            )}
          </div>
        ))}

        {/* Typing message for Sari */}
        {isTyping && (
          <div className="flex gap-2 justify-start animate-in slide-in-from-bottom-2 duration-300">
            <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white dark:bg-[#1F2C33] p-3 rounded-lg rounded-tl-none shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        {/* Currently typing message */}
        {!isTyping && displayedText && (
          <div className="flex gap-2 justify-start animate-in slide-in-from-bottom-2 duration-300">
            <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="max-w-[75%] bg-white dark:bg-[#1F2C33] p-3 rounded-lg rounded-tl-none shadow-sm">
              <p className="text-sm whitespace-pre-line leading-relaxed text-gray-900 dark:text-white">
                {displayedText}
                <span className="inline-block w-0.5 h-4 bg-gray-900 dark:bg-white ml-0.5 animate-pulse"></span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Chat Footer */}
      <div className="bg-white dark:bg-[#1F2C33] p-3 border-t flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 bg-gray-100 dark:bg-[#2A3942] rounded-full px-4 py-2">
          <p className="text-sm text-gray-400">{t('compLiveChatDemoPage.text1')}</p>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#075E54] flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      {/* Overlay label */}
      <div className="absolute bottom-16 left-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-3 pointer-events-none">
        <p className="text-white text-sm font-medium text-center">
          🎬 عرض توضيحي: محادثة حقيقية لشراء منتج عبر واتساب
        </p>
      </div>
    </div>
  );
}
