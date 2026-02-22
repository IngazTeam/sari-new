/**
 * Sari AI Playground
 * Interactive testing page for Sari AI responses
 */

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Bot, User, Sparkles, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function SariPlayground() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (data: { response: string }) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      }]);
    },
    onError: (error: any) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    
    chatMutation.mutate({ message: input });
    setInput('');
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const exampleQueries = [
    'السلام عليكم',
    'عندك جوالات؟',
    'أبغى هدية لأمي',
    'كم سعر المنتج؟',
    'شكراً لك',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ساري AI - ملعب التجربة
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            جرّب محادثة ساري الذكي واختبر قدراته في فهم العملاء واقتراح المنتجات
          </p>
          <Badge variant="outline" className="text-green-600 border-green-600">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
              نشط ومتصل
            </div>
          </Badge>
        </div>

        {/* Example Queries */}
        <Card className="p-4 bg-white/80 backdrop-blur">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-800">{t('sariPlaygroundPage.text0')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((query, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => setInput(query)}
                className="text-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
              >
                {query}
              </Button>
            ))}
          </div>
        </Card>

        {/* Chat Container */}
        <Card className="h-[500px] flex flex-col bg-white/90 backdrop-blur shadow-xl">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <Bot className="h-16 w-16" />
                <p className="text-lg">{t('sariPlaygroundPage.text1')}</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                    <p
                      className={`text-xs mt-2 ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {message.role === 'user' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {chatMutation.isPending && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('sariPlaygroundPage.text2')}</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t bg-white p-4">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('sariPlaygroundPage.text3')}
                disabled={chatMutation.isPending}
                className="flex-1 text-lg"
                dir="rtl"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                disabled={messages.length === 0}
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center bg-white/80 backdrop-blur">
            <p className="text-2xl font-bold text-blue-600">{messages.filter(m => m.role === 'user').length}</p>
            <p className="text-sm text-gray-600">{t('sariPlaygroundPage.text4')}</p>
          </Card>
          <Card className="p-4 text-center bg-white/80 backdrop-blur">
            <p className="text-2xl font-bold text-purple-600">{messages.filter(m => m.role === 'assistant').length}</p>
            <p className="text-sm text-gray-600">{t('sariPlaygroundPage.text5')}</p>
          </Card>
          <Card className="p-4 text-center bg-white/80 backdrop-blur">
            <p className="text-2xl font-bold text-green-600">{messages.length}</p>
            <p className="text-sm text-gray-600">{t('sariPlaygroundPage.text6')}</p>
          </Card>
        </div>

        {/* Info */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-blue-900">{t('sariPlaygroundPage.text7')}</h4>
              <p className="text-sm text-blue-800">
                هذه الصفحة للتجربة فقط. الردود تستخدم نفس نظام ساري AI المستخدم في الواتساب.
                يمكنك اختبار أنواع مختلفة من الأسئلة لرؤية كيف يتفاعل ساري مع العملاء.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
