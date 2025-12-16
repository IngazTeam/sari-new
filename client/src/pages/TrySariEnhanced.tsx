import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignupPromptDialogEnhanced } from '@/components/SignupPromptDialogEnhanced';
import { trpc } from '@/lib/trpc';
import { MessageCircle, Zap, BarChart3, Lock } from 'lucide-react';

export default function TrySariEnhanced() {
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [messageCount, setMessageCount] = useState(0);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Update try sari analytics
  const updateAnalyticsMutation = trpc.trySari.upsertAnalytics.useMutation();

  // Handle sending message
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    const newMessageCount = messageCount + 1;
    setMessageCount(newMessageCount);

    // Add user message to history
    const newHistory = [
      ...conversationHistory,
      { role: 'user', content: inputValue },
    ];
    setConversationHistory(newHistory);
    setInputValue('');

    // Simulate AI response
    setTimeout(() => {
      newHistory.push({
        role: 'assistant',
        content: 'شكراً على رسالتك! أنا ساري، مساعد المبيعات الذكي. كيف يمكنني مساعدتك؟',
      });
      setConversationHistory([...newHistory]);
      setIsLoading(false);

      // Update analytics
      updateAnalyticsMutation.mutate({
        sessionId,
        messageCount: newMessageCount,
        signupPromptShown: showSignupPrompt,
      });

      // Show signup prompt after certain number of messages
      if (newMessageCount === 3 || newMessageCount === 5) {
        setShowSignupPrompt(true);
      }
    }, 1000);
  };

  const handleSignupPromptClose = () => {
    setShowSignupPrompt(false);
  };

  const handleSignup = () => {
    // Update analytics with conversion
    updateAnalyticsMutation.mutate({
      sessionId,
      messageCount,
      signupPromptShown: true,
      convertedToSignup: true,
    });
    setShowSignupPrompt(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">جرب ساري مجاناً</h1>
              <p className="text-gray-600 mt-2">تحدث مع مساعد المبيعات الذكي الآن</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">عدد الرسائل: {messageCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chat Area */}
          <div className="lg:col-span-2">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="border-b">
                <CardTitle>محادثة ساري</CardTitle>
                <CardDescription>تحدث مع مساعد المبيعات الذكي</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {conversationHistory.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>ابدأ المحادثة بكتابة رسالة</p>
                    </div>
                  </div>
                ) : (
                  conversationHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          msg.role === 'user'
                            ? 'bg-green-500 text-white rounded-br-none'
                            : 'bg-gray-100 text-gray-900 rounded-bl-none'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg rounded-bl-none">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="اكتب رسالتك هنا..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    disabled={isLoading}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || !inputValue.trim()}
                    className="bg-green-500 hover:bg-green-600 text-white"
                  >
                    إرسال
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Features Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">المميزات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Zap className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-sm">ذكاء اصطناعي متقدم</p>
                    <p className="text-xs text-gray-600">يفهم احتياجات عملائك</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <MessageCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-sm">دعم الواتساب</p>
                    <p className="text-xs text-gray-600">تواصل مباشر مع عملائك</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <BarChart3 className="w-5 h-5 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-sm">تحليلات شاملة</p>
                    <p className="text-xs text-gray-600">تتبع أداء المبيعات</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Lock className="w-5 h-5 text-purple-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-sm">آمن وموثوق</p>
                    <p className="text-xs text-gray-600">حماية بيانات عملائك</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white border-none">
              <CardHeader>
                <CardTitle className="text-lg">ابدأ الآن</CardTitle>
                <CardDescription className="text-green-100">
                  احصل على 7 أيام تجربة مجانية
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setShowSignupPrompt(true)}
                  className="w-full bg-white text-green-600 hover:bg-gray-100 font-bold"
                >
                  تسجيل مجاني
                </Button>
                <p className="text-xs text-green-100 text-center mt-3">
                  بدون الحاجة لبطاقة ائتمانية
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Signup Prompt Dialog */}
      <SignupPromptDialogEnhanced
        isOpen={showSignupPrompt}
        onClose={handleSignupPromptClose}
        sessionId={sessionId}
        messageCount={messageCount}
      />
    </div>
  );
}
