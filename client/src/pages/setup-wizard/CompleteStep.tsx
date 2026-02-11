import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, Loader2, Rocket, Store, Briefcase, MessageSquare, Calendar, Settings, User } from 'lucide-react';
import { useState, useEffect } from 'react';

interface CompleteStepProps {
  wizardData: Record<string, any>;
  completeSetup: () => void;
  isLoading: boolean;
}

export default function CompleteStep({
  wizardData,
  completeSetup,
  isLoading,
}: CompleteStepProps) {
  const businessType = wizardData.businessType;
  const hasProducts = wizardData.products && wizardData.products.length > 0;
  const hasServices = wizardData.services && wizardData.services.length > 0;
  const hasIntegrations = wizardData.enableCalendar || wizardData.enableSheets;

  // WhatsApp Preview State
  const [previewMessages, setPreviewMessages] = useState<Array<{ sender: 'user' | 'bot', text: string }>>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Generate preview messages based on wizard data
  useEffect(() => {
    if (showPreview) {
      const messages: Array<{ sender: 'user' | 'bot', text: string }> = [];

      // User greeting
      messages.push({ sender: 'user', text: 'السلام عليكم' });

      // Bot response based on personality
      const greeting = wizardData.botTone === 'friendly'
        ? 'وعليكم السلام! 😊 أهلاً وسهلاً فيك، أنا ساري مساعدك الذكي'
        : wizardData.botTone === 'professional'
          ? 'وعليكم السلام ورحمة الله، مرحباً بك. أنا ساري، المساعد الآلي'
          : 'وعليكم السلام! أهلاً، أنا ساري';

      messages.push({ sender: 'bot', text: greeting });

      // User asks about products/services
      if (hasProducts) {
        messages.push({ sender: 'user', text: 'عندكم ' + (wizardData.products[0]?.name || 'منتجات') + '؟' });

        const productResponse = wizardData.botTone === 'friendly'
          ? `أكيد! 🎉 عندنا ${wizardData.products[0]?.name || 'المنتج'} بسعر ${wizardData.products[0]?.price || 'مميز'} ريال`
          : `نعم، متوفر لدينا ${wizardData.products[0]?.name || 'المنتج'} بسعر ${wizardData.products[0]?.price || 'XX'} ريال`;

        messages.push({ sender: 'bot', text: productResponse });
      } else if (hasServices) {
        messages.push({ sender: 'user', text: 'وش الخدمات اللي تقدمونها؟' });

        const serviceResponse = wizardData.botTone === 'friendly'
          ? `نقدم خدمات رائعة! 🌟 مثل ${wizardData.services[0]?.name || 'الخدمة'}`
          : `نقدم خدمة ${wizardData.services[0]?.name || 'الخدمة'} وخدمات أخرى متنوعة`;

        messages.push({ sender: 'bot', text: serviceResponse });
      }

      // Final message
      const finalMsg = wizardData.botTone === 'friendly'
        ? 'تبي تطلب شيء معين؟ أنا هنا أساعدك! 💪'
        : 'هل تحتاج مساعدة في شيء محدد؟';

      messages.push({ sender: 'bot', text: finalMsg });

      setPreviewMessages(messages);
    }
  }, [showPreview, wizardData, hasProducts, hasServices]);

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 mb-4 animate-bounce">
          <Check className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          رائع! كل شيء جاهز 🎉
        </h2>
        <p className="text-lg text-gray-600">
          دعنا نراجع إعداداتك قبل البدء
        </p>
      </div>

      {/* WhatsApp Preview Section */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 space-x-reverse">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <span>معاينة محادثة ساري</span>
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
            >
              {showPreview ? 'إخفاء المعاينة' : 'عرض المعاينة'}
            </Button>
          </div>

          {showPreview && (
            <div className="bg-white rounded-lg shadow-lg p-4 max-w-md mx-auto border border-gray-200">
              {/* WhatsApp Header */}
              <div className="bg-green-600 text-white p-3 rounded-t-lg -m-4 mb-4 flex items-center space-x-3 space-x-reverse">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold">ساري - {wizardData.businessName || 'مساعدك الذكي'}</p>
                  <p className="text-xs text-green-100">متصل الآن</p>
                </div>
              </div>

              {/* Messages */}
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {previewMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg p-3 ${msg.sender === 'user'
                          ? 'bg-green-600 text-white rounded-br-none'
                          : 'bg-gray-100 text-gray-900 rounded-bl-none'
                        }`}
                    >
                      <p className="text-sm">{msg.text}</p>
                      <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-green-100' : 'text-gray-500'}`}>
                        {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input (disabled) */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-500 text-center">
                  هذه معاينة فقط - ساري سيرد تلقائياً على عملائك
                </div>
              </div>
            </div>
          )}

          {!showPreview && (
            <p className="text-sm text-gray-600 text-center">
              شاهد كيف سيتفاعل ساري مع عملائك بناءً على الإعدادات التي اخترتها
            </p>
          )}
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Business Info */}
        <Card className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100">
          <div className="flex items-start space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
              {businessType === 'store' ? (
                <Store className="h-5 w-5 text-white" />
              ) : businessType === 'services' ? (
                <Briefcase className="h-5 w-5 text-white" />
              ) : (
                <Settings className="h-5 w-5 text-white" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">معلومات النشاط</h3>
              <div className="space-y-1 text-sm text-gray-700">
                <p><strong>الاسم:</strong> {wizardData.businessName || 'غير محدد'}</p>
                <p><strong>النوع:</strong> {
                  businessType === 'store' ? 'متجر إلكتروني' :
                    businessType === 'services' ? 'مقدم خدمات' :
                      'منتجات وخدمات'
                }</p>
                <p><strong>الهاتف:</strong> {wizardData.phone || 'غير محدد'}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Products/Services */}
        <Card className="p-5 bg-gradient-to-br from-teal-50 to-teal-100">
          <div className="flex items-start space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">المنتجات والخدمات</h3>
              <div className="space-y-1 text-sm text-gray-700">
                {hasProducts && (
                  <p className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>{wizardData.products.length} منتج</span>
                  </p>
                )}
                {hasServices && (
                  <p className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>{wizardData.services.length} خدمة</span>
                  </p>
                )}
                {!hasProducts && !hasServices && (
                  <p className="text-gray-500">لم يتم إضافة منتجات أو خدمات بعد</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Bot Personality */}
        <Card className="p-5 bg-gradient-to-br from-green-50 to-green-100">
          <div className="flex items-start space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">شخصية ساري</h3>
              <div className="space-y-1 text-sm text-gray-700">
                <p><strong>الأسلوب:</strong> {
                  wizardData.botTone === 'friendly' ? 'ودود ومرح' :
                    wizardData.botTone === 'professional' ? 'احترافي ورسمي' :
                      'عفوي وبسيط'
                }</p>
                <p><strong>اللغة:</strong> {
                  wizardData.botLanguage === 'ar' ? 'العربية' :
                    wizardData.botLanguage === 'en' ? 'الإنجليزية' :
                      'العربية والإنجليزية'
                }</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Integrations */}
        <Card className="p-5 bg-gradient-to-br from-green-50 to-green-100">
          <div className="flex items-start space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">التكاملات</h3>
              <div className="space-y-1 text-sm text-gray-700">
                {wizardData.enableCalendar && (
                  <p className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>Google Calendar</span>
                  </p>
                )}
                {wizardData.enableSheets && (
                  <p className="flex items-center space-x-1 space-x-reverse">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>Google Sheets</span>
                  </p>
                )}
                {!hasIntegrations && (
                  <p className="text-gray-500">لم يتم تفعيل تكاملات</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* What's Next */}
      <Card className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2 space-x-reverse">
            <Rocket className="h-5 w-5 text-emerald-600" />
            <span>ماذا بعد؟</span>
          </h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start space-x-2 space-x-reverse">
              <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>سنقوم بإنشاء حسابك وتجهيز كل شيء</span>
            </li>
            <li className="flex items-start space-x-2 space-x-reverse">
              <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>ستتمكن من ربط رقم واتساب الخاص بك</span>
            </li>
            <li className="flex items-start space-x-2 space-x-reverse">
              <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>ساري سيبدأ في الرد على عملائك تلقائياً</span>
            </li>
            <li className="flex items-start space-x-2 space-x-reverse">
              <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span>يمكنك متابعة المحادثات والطلبات من لوحة التحكم</span>
            </li>
          </ul>
        </div>
      </Card>

      {/* Complete Button */}
      <div className="text-center pt-6">
        <Button
          size="lg"
          onClick={completeSetup}
          disabled={isLoading}
          className="px-12 py-6 text-lg font-semibold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-green-200"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              جاري الإعداد...
            </>
          ) : (
            <>
              ابدأ الآن! 🚀
              <Rocket className="mr-2 h-6 w-6" />
            </>
          )}
        </Button>
        <p className="text-sm text-gray-500 mt-3">
          بالنقر على "ابدأ الآن"، أنت توافق على شروط الخدمة وسياسة الخصوصية
        </p>
      </div>
    </div>
  );
}
