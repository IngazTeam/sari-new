import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Zap, Shield, TrendingUp, MessageCircle, Bot } from 'lucide-react';

interface WelcomeStepProps {
  goToNextStep: () => void;
}

export default function WelcomeStep({ goToNextStep }: WelcomeStepProps) {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 mb-4 shadow-lg shadow-green-200">
          <Bot className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          مرحباً بك في ساري! 🎉
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          مساعدك الذكي للمبيعات والتسويق عبر واتساب. سنساعدك في إعداد كل شيء خلال 5 دقائق فقط!
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex items-start space-x-3 space-x-reverse p-5 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100 hover:shadow-md transition-all">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">ردود تلقائية ذكية</h3>
            <p className="text-sm text-gray-600">
              ساري يرد على عملائك 24/7 بذكاء اصطناعي متقدم
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 space-x-reverse p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 hover:shadow-md transition-all">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-teal-500 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">زيادة المبيعات</h3>
            <p className="text-sm text-gray-600">
              تحويل المحادثات إلى طلبات ومبيعات فعلية
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 space-x-reverse p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100 hover:shadow-md transition-all">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">آمن ومضمون</h3>
            <p className="text-sm text-gray-600">
              بياناتك محمية بأعلى معايير الأمان
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 space-x-reverse p-5 bg-gradient-to-br from-teal-50 to-green-50 rounded-xl border border-teal-100 hover:shadow-md transition-all">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">سهل الاستخدام</h3>
            <p className="text-sm text-gray-600">
              لا تحتاج خبرة تقنية، كل شيء بسيط وواضح
            </p>
          </div>
        </div>
      </div>

      {/* WhatsApp Preview */}
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">ساري</p>
            <p className="text-xs text-green-600">متصل الآن</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 max-w-sm mr-auto">
          <p className="text-sm text-gray-700">مرحباً! 👋 أنا ساري، مساعدك الذكي. كيف أقدر أساعدك اليوم؟</p>
          <p className="text-[10px] text-gray-400 mt-1 text-left">12:00 م ✓✓</p>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center pt-4">
        <Button
          size="lg"
          onClick={goToNextStep}
          className="px-8 py-6 text-lg font-semibold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-200 transition-all"
        >
          لنبدأ! 🚀
          <ArrowRight className="mr-2 h-5 w-5" />
        </Button>
        <p className="text-sm text-gray-500 mt-3">
          لن يستغرق الأمر أكثر من 5 دقائق
        </p>
      </div>
    </div>
  );
}
