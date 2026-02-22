import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, Bot, User, Sparkles, MessageCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SignupPromptDialog from '@/components/SignupPromptDialog';
import { useTranslation } from 'react-i18next';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const EXAMPLE_MESSAGES = [
  { text: 'مرحبا، أريد شراء منتج', category: 'basic' },
  { text: 'ما هي المنتجات المتوفرة؟', category: 'basic' },
  { text: 'أريد معلومات عن الأسعار', category: 'basic' },
  { text: 'كيف يمكنني الطلب؟', category: 'basic' },
  { text: 'أريد طلب 3 قطع من المنتج الأول و 2 من الثاني', category: 'advanced' },
  { text: 'هل المنتج X متوفر بالمخزون؟', category: 'advanced' },
  { text: 'أريد فاتورة لطلبي السابق رقم 1234', category: 'advanced' },
  { text: 'المنتج وصلني تالف، كيف أرجعه؟', category: 'advanced' },
];

export default function TrySari() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'مرحباً! 👋 أنا ساري، مساعدك الذكي للمبيعات. كيف يمكنني مساعدتك اليوم؟',
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId] = useState(() => `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [messageCount, setMessageCount] = useState(0);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [signupPromptShown, setSignupPromptShown] = useState(false);
  const [showAdvancedExamples, setShowAdvancedExamples] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMutation = trpc.publicSari.chat.useMutation();
  const trackSignupPromptMutation = trpc.publicSari.trackSignupPrompt.useMutation();
  const trackConversionMutation = trpc.publicSari.trackConversion.useMutation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (message?: string, exampleUsed?: string) => {
    const messageToSend = message || inputMessage.trim();
    if (!messageToSend) return;

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: messageToSend,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');

    // Increment message count
    const newCount = messageCount + 1;
    setMessageCount(newCount);

    // Show signup prompt after 3-5 messages (random)
    const promptThreshold = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
    if (newCount >= promptThreshold && !signupPromptShown) {
      setShowSignupPrompt(true);
      setSignupPromptShown(true);
      trackSignupPromptMutation.mutate({ sessionId });
    }

    try {
      // Get AI response with analytics tracking
      const response = await chatMutation.mutateAsync({
        message: messageToSend,
        sessionId,
        exampleUsed,
        ipAddress: undefined, // Could be added if needed
        userAgent: navigator.userAgent,
      });

      // Add assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleExampleClick = (example: { text: string; category: string }) => {
    handleSendMessage(example.text, example.text);
  };

  const handleSignupPromptClose = () => {
    setShowSignupPrompt(false);
  };

  const handleSignupConversion = () => {
    trackConversionMutation.mutate({ sessionId });
    setShowSignupPrompt(false);
  };

  const handleReset = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'مرحباً! 👋 أنا ساري، مساعدك الذكي للمبيعات. كيف يمكنني مساعدتك اليوم؟',
        timestamp: new Date(),
      },
    ]);
    setMessageCount(0);
  };

  const basicExamples = EXAMPLE_MESSAGES.filter(e => e.category === 'basic');
  const advancedExamples = EXAMPLE_MESSAGES.filter(e => e.category === 'advanced');

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      <Navbar />
      
      <main className="flex-1 container py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full mb-4">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">{t('trySariPage.text0')}</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            تحدث مع ساري AI
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            اختبر قوة الذكاء الاصطناعي في خدمة العملاء. جرّب المحادثة مع ساري وشاهد كيف يمكنها مساعدة عملائك.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-[1fr_300px] gap-6">
            {/* Chat Area */}
            <Card className="flex flex-col h-[600px]">
              {/* Chat Header */}
              <div className="border-b p-4 bg-gradient-to-r from-blue-600 to-blue-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{t('trySariPage.text1')}</h3>
                    <p className="text-xs text-blue-100">{t('trySariPage.text2')}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="text-white hover:bg-white/20"
                  >
                    إعادة تعيين
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user'
                          ? 'bg-gray-200'
                          : 'bg-gradient-to-br from-blue-500 to-blue-600'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-gray-600" />
                      ) : (
                        <Bot className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div
                      className={`flex-1 max-w-[80%] ${
                        msg.role === 'user' ? 'text-right' : 'text-right'
                      }`}
                    >
                      <div
                        className={`inline-block p-3 rounded-2xl ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-gray-100 text-gray-900 rounded-tl-none'
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 px-2">
                        {msg.timestamp.toLocaleTimeString('ar-SA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                {chatMutation.isPending && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="border-t p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={t('trySariPage.text3')}
                    className="flex-1 text-right"
                    disabled={chatMutation.isPending}
                  />
                  <Button
                    type="submit"
                    disabled={!inputMessage.trim() || chatMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </Card>

            {/* Sidebar - Examples & Info */}
            <div className="space-y-6">
              {/* Quick Examples */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">{t('trySariPage.text4')}</h3>
                </div>
                <div className="space-y-2">
                  {basicExamples.map((example, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      className="w-full justify-start text-right text-sm"
                      onClick={() => handleExampleClick(example)}
                      disabled={chatMutation.isPending}
                    >
                      {example.text}
                    </Button>
                  ))}
                </div>
                
                {/* Advanced Examples Toggle */}
                <div className="mt-4 pt-4 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => setShowAdvancedExamples(!showAdvancedExamples)}
                  >
                    {showAdvancedExamples ? '▼' : '▶'} أمثلة متقدمة
                  </Button>
                  {showAdvancedExamples && (
                    <div className="space-y-2 mt-2">
                      {advancedExamples.map((example, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          className="w-full justify-start text-right text-xs"
                          onClick={() => handleExampleClick(example)}
                          disabled={chatMutation.isPending}
                        >
                          {example.text}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Features Info */}
              <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-3">
                  ✨ مميزات ساري AI
                </h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>{t('trySariPage.text5')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>{t('trySariPage.text6')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>{t('trySariPage.text7')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>{t('trySariPage.text8')}</span>
                  </li>
                </ul>
              </Card>

              {/* CTA */}
              <Card className="p-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                <h3 className="font-semibold mb-2">{t('trySariPage.text9')}</h3>
                <p className="text-sm text-gray-300 mb-4">
                  ابدأ الآن واحصل على ساري AI لمتجرك
                </p>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => (window.location.href = '/signup')}
                >
                  ابدأ الآن مجاناً
                </Button>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      
      {/* Signup Prompt Dialog */}
      <SignupPromptDialog
        open={showSignupPrompt}
        onClose={handleSignupPromptClose}
        onSignup={handleSignupConversion}
      />
    </div>
  );
}
