import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight, Check } from 'lucide-react';

interface BusinessTypeStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
}

const BUSINESS_TYPES = [
  {
    id: 'store',
    title: 'متجر إلكتروني',
    description: 'أبيع منتجات (ملابس، إلكترونيات، طعام، إلخ)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#store-bg)" />
        <path d="M15 20h18v12a2 2 0 01-2 2H17a2 2 0 01-2-2V20z" fill="white" opacity="0.9" />
        <path d="M12 16l3-4h18l3 4" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 16h24v4H12z" fill="white" opacity="0.3" />
        <circle cx="24" cy="26" r="3" fill="url(#store-bg)" opacity="0.6" />
        <defs>
          <linearGradient id="store-bg" x1="4" y1="4" x2="44" y2="44">
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
        </defs>
      </svg>
    ),
    bgColor: 'from-emerald-50 to-green-50',
    borderColor: 'border-emerald-200',
    selectedBorder: 'ring-emerald-500',
    examples: ['متجر ملابس', 'متجر إلكترونيات', 'متجر مواد غذائية', 'متجر مستحضرات تجميل'],
  },
  {
    id: 'services',
    title: 'مقدم خدمات',
    description: 'أقدم خدمات (صالون، عيادة، استشارات، إلخ)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#service-bg)" />
        <path d="M24 14v4m0 12v4M14 24h4m12 0h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="24" r="6" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.2" />
        <circle cx="24" cy="24" r="2" fill="white" />
        <path d="M18 18l2 2m8 8l2 2m0-12l-2 2m-8 8l-2 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <defs>
          <linearGradient id="service-bg" x1="4" y1="4" x2="44" y2="44">
            <stop stopColor="#14b8a6" />
            <stop offset="1" stopColor="#0d9488" />
          </linearGradient>
        </defs>
      </svg>
    ),
    bgColor: 'from-teal-50 to-emerald-50',
    borderColor: 'border-teal-200',
    selectedBorder: 'ring-teal-500',
    examples: ['صالون تجميل', 'عيادة طبية', 'مكتب استشارات', 'مركز تدريب'],
  },
  {
    id: 'both',
    title: 'منتجات وخدمات',
    description: 'أبيع منتجات وأقدم خدمات معاً',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#both-bg)" />
        <rect x="14" y="16" width="10" height="12" rx="2" fill="white" opacity="0.9" />
        <rect x="26" y="20" width="8" height="8" rx="4" fill="white" opacity="0.9" />
        <path d="M19 14v2m0 14v2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M30 18v2m0 8v2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M24 24l2-2" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        <defs>
          <linearGradient id="both-bg" x1="4" y1="4" x2="44" y2="44">
            <stop stopColor="#22c55e" />
            <stop offset="1" stopColor="#16a34a" />
          </linearGradient>
        </defs>
      </svg>
    ),
    bgColor: 'from-green-50 to-lime-50',
    borderColor: 'border-green-200',
    selectedBorder: 'ring-green-500',
    examples: ['مطعم (طعام + توصيل)', 'صيدلية (أدوية + استشارات)', 'ورشة (قطع غيار + صيانة)'],
  },
];

export default function BusinessTypeStep({
  wizardData,
  updateWizardData,
  goToNextStep,
}: BusinessTypeStepProps) {
  const [selectedType, setSelectedType] = useState<string>(wizardData.businessType || '');

  const handleSelect = (typeId: string) => {
    setSelectedType(typeId);
    updateWizardData({ businessType: typeId });
  };

  const handleNext = () => {
    if (selectedType) {
      goToNextStep();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-gray-600">
          اختر نوع نشاطك التجاري لنتمكن من تخصيص ساري حسب احتياجاتك
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {BUSINESS_TYPES.map((type) => {
          const isSelected = selectedType === type.id;

          return (
            <Card
              key={type.id}
              className={`relative cursor-pointer transition-all duration-300 hover:shadow-xl group ${isSelected
                  ? `ring-2 ${type.selectedBorder} shadow-lg scale-[1.03] bg-gradient-to-br ${type.bgColor}`
                  : `hover:scale-[1.02] hover:bg-gradient-to-br hover:${type.bgColor} border-gray-200`
                }`}
              onClick={() => handleSelect(type.id)}
            >
              {isSelected && (
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg z-10">
                  <Check className="h-5 w-5 text-white" />
                </div>
              )}

              <div className="p-6 space-y-4">
                {/* Icon */}
                <div className="flex justify-center group-hover:scale-110 transition-transform duration-300">
                  {type.icon}
                </div>

                {/* Title */}
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {type.title}
                  </h3>
                  <p className="text-sm text-gray-600">{type.description}</p>
                </div>

                {/* Examples */}
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">أمثلة:</p>
                  <ul className="space-y-1.5">
                    {type.examples.map((example, index) => (
                      <li key={index} className="text-xs text-gray-600 flex items-center">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full ml-2 flex-shrink-0"></span>
                        {example}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Help Text */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
        <p className="text-sm text-emerald-800">
          💡 <strong>نصيحة:</strong> يمكنك تغيير نوع النشاط لاحقاً من الإعدادات
        </p>
      </div>

      {/* Next Button */}
      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          onClick={handleNext}
          disabled={!selectedType}
          className="px-8 bg-emerald-600 hover:bg-emerald-700"
        >
          التالي
          <ArrowRight className="mr-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
