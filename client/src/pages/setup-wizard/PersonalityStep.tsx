import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Smile, Briefcase, Coffee, MessageSquare, Eye } from 'lucide-react';
import PreviewChat from '@/components/PreviewChat';

interface PersonalityStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
}

const TONES = [
  {
    id: 'friendly',
    title: 'ودود ومرح',
    description: 'أسلوب دافئ وقريب من القلب',
    icon: Smile,
    color: 'from-pink-500 to-rose-500',
    example: 'أهلاً وسهلاً! 😊 كيف يمكنني مساعدتك اليوم؟',
  },
  {
    id: 'professional',
    title: 'احترافي ورسمي',
    description: 'أسلوب مهني ومحترم',
    icon: Briefcase,
    color: 'from-blue-500 to-indigo-500',
    example: 'مرحباً بك. يسعدني خدمتك، كيف يمكنني المساعدة؟',
  },
  {
    id: 'casual',
    title: 'عفوي وبسيط',
    description: 'أسلوب مريح وغير رسمي',
    icon: Coffee,
    color: 'from-orange-500 to-amber-500',
    example: 'هلا! شو تحتاج؟ أنا هنا أساعدك 👋',
  },
];



export default function PersonalityStep({
  wizardData,
  updateWizardData,
  goToNextStep,
}: PersonalityStepProps) {
  const [botTone, setBotTone] = useState(wizardData.botTone || 'friendly');

  const [welcomeMessage, setWelcomeMessage] = useState(
    wizardData.welcomeMessage || ''
  );

  const handleNext = () => {
    updateWizardData({
      botTone,
      welcomeMessage,
    });
    goToNextStep();
  };

  const selectedTone = TONES.find(t => t.id === botTone);

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-gray-600">
          اجعل ساري يتحدث بأسلوبك الخاص
        </p>
      </div>

      {/* Tone Selection */}
      <div className="space-y-3">
        <Label className="text-base font-semibold flex items-center space-x-2 space-x-reverse">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span>أسلوب التواصل</span>
        </Label>

        <div className="grid md:grid-cols-3 gap-3">
          {TONES.map((tone) => {
            const Icon = tone.icon;
            const isSelected = botTone === tone.id;

            return (
              <Card
                key={tone.id}
                className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${isSelected ? 'ring-2 ring-primary shadow-lg' : ''
                  }`}
                onClick={() => setBotTone(tone.id)}
              >
                <div className="p-4 space-y-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tone.color} flex items-center justify-center`}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">
                      {tone.title}
                    </h4>
                    <p className="text-xs text-gray-600">{tone.description}</p>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-gray-500 mb-1">مثال:</p>
                    <p className="text-xs text-gray-700 italic bg-gray-50 p-2 rounded">
                      "{tone.example}"
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>



      {/* Custom Welcome Message */}
      <div className="space-y-3">
        <Label htmlFor="welcomeMessage" className="text-base font-semibold">
          رسالة الترحيب المخصصة (اختياري)
        </Label>
        <Textarea
          id="welcomeMessage"
          placeholder={
            selectedTone?.id === 'friendly'
              ? 'مثال: أهلاً وسهلاً! أنا ساري، مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟ 😊'
              : selectedTone?.id === 'professional'
                ? 'مثال: مرحباً بك في [اسم نشاطك]. أنا ساري، المساعد الافتراضي. يسعدني خدمتك.'
                : 'مثال: هلا! أنا ساري، جاهز أساعدك بأي شي تحتاجه 👋'
          }
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-gray-500">
          اترك فارغاً لاستخدام رسالة افتراضية حسب الأسلوب المختار
        </p>
      </div>

      {/* Interactive Preview */}
      <div className="space-y-3">
        <Label className="text-base font-semibold flex items-center space-x-2 space-x-reverse">
          <Eye className="h-5 w-5 text-primary" />
          <span>معاينة تفاعلية</span>
        </Label>
        <p className="text-sm text-gray-600 mb-4">
          جرب كيف سيتفاعل ساري مع عملائك بناءً على الإعدادات التي اخترتها
        </p>
        <PreviewChat
          businessName={wizardData.businessName || 'متجرك'}
          botTone={botTone as 'friendly' | 'professional' | 'casual'}
          botLanguage={(wizardData.botLanguage || 'ar') as 'ar' | 'en' | 'both'}
          products={wizardData.products || []}
          services={wizardData.services || []}
          welcomeMessage={welcomeMessage}
          className="max-w-md mx-auto"
        />
      </div>

      {/* Next Button */}
      <div className="flex justify-center pt-4">
        <Button size="lg" onClick={handleNext} className="px-8">
          التالي
          <ArrowRight className="mr-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
