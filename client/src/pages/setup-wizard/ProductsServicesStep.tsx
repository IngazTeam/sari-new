import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ArrowRight, Plus, Trash2, Package, Briefcase, Lightbulb, AlertCircle } from 'lucide-react';

interface ProductsServicesStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  skipStep: () => void;
}

interface Item {
  id: string;
  name: string;
  description: string;
  price: string;
}

const PRODUCT_SUGGESTIONS = [
  { name: 'جوال سامسونج S24', price: '3499' },
  { name: 'لابتوب ديل انسبايرون', price: '2899' },
  { name: 'سماعات ايربودز', price: '899' },
  { name: 'شاحن لاسلكي', price: '149' },
];

const SERVICE_SUGGESTIONS = [
  { name: 'استقدام عاملة منزلية', price: '15000' },
  { name: 'تأشيرة عمالة', price: '2000' },
  { name: 'كشف طبي عام', price: '150' },
  { name: 'تنظيف أسنان', price: '300' },
];

export default function ProductsServicesStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
}: ProductsServicesStepProps) {
  const businessType = wizardData.businessType;
  const isStore = businessType === 'store' || businessType === 'both';
  const isServices = businessType === 'services' || businessType === 'both';

  const [products, setProducts] = useState<Item[]>(
    wizardData.products || []
  );
  const [services, setServices] = useState<Item[]>(
    wizardData.services || []
  );

  const addItem = (type: 'products' | 'services') => {
    const newItem: Item = {
      id: Date.now().toString(),
      name: '',
      description: '',
      price: '',
    };

    if (type === 'products') {
      setProducts([...products, newItem]);
    } else {
      setServices([...services, newItem]);
    }
  };

  const removeItem = (type: 'products' | 'services', id: string) => {
    if (type === 'products') {
      setProducts(products.filter(p => p.id !== id));
    } else {
      setServices(services.filter(s => s.id !== id));
    }
  };

  const updateItem = (type: 'products' | 'services', id: string, field: keyof Item, value: string) => {
    if (type === 'products') {
      setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));
    } else {
      setServices(services.map(s => s.id === id ? { ...s, [field]: value } : s));
    }
  };

  const addSuggestion = (type: 'products' | 'services', suggestion: { name: string; price: string }) => {
    const newItem: Item = {
      id: Date.now().toString(),
      name: suggestion.name,
      description: '',
      price: suggestion.price,
    };
    if (type === 'products') {
      setProducts([...products, newItem]);
    } else {
      setServices([...services, newItem]);
    }
  };

  // Check if at least one valid item exists
  const filledProducts = products.filter(p => p.name.trim());
  const filledServices = services.filter(s => s.name.trim());
  const hasFilledItems = filledProducts.length > 0 || filledServices.length > 0;
  const hasAnyItems = products.length > 0 || services.length > 0;

  const handleNext = () => {
    const data: any = {};

    if (isStore) {
      data.products = filledProducts;
    }

    if (isServices) {
      data.services = filledServices;
    }

    updateWizardData(data);
    goToNextStep();
  };

  const handleSkip = () => {
    updateWizardData({ products: [], services: [] });
    skipStep();
  };

  const renderItemForm = (item: Item, type: 'products' | 'services', index: number) => {
    const items = type === 'products' ? products : services;
    const Icon = type === 'products' ? Package : Briefcase;
    const label = type === 'products' ? 'المنتج' : 'الخدمة';

    return (
      <Card key={item.id} className="p-4 border-emerald-100 bg-white">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2 space-x-reverse">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Icon className="h-4 w-4 text-emerald-600" />
            </div>
            <h4 className="font-semibold text-gray-900">
              {label} #{index + 1}
            </h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeItem(type, item.id)}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor={`${type}-name-${item.id}`}>الاسم *</Label>
            <Input
              id={`${type}-name-${item.id}`}
              placeholder={type === 'products' ? 'مثال: جوال سامسونج S24' : 'مثال: استقدام عاملة منزلية'}
              value={item.name}
              onChange={(e) => updateItem(type, item.id, 'name', e.target.value)}
              className={!item.name.trim() && hasAnyItems ? 'border-amber-300' : ''}
            />
          </div>

          <div>
            <Label htmlFor={`${type}-desc-${item.id}`}>الوصف (اختياري)</Label>
            <Textarea
              id={`${type}-desc-${item.id}`}
              placeholder={type === 'products' ? 'وصف المنتج ومميزاته...' : 'وصف الخدمة ومدتها والشروط...'}
              value={item.description}
              onChange={(e) => updateItem(type, item.id, 'description', e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor={`${type}-price-${item.id}`}>السعر (ريال) *</Label>
            <Input
              id={`${type}-price-${item.id}`}
              type="number"
              placeholder="0.00"
              value={item.price}
              onChange={(e) => updateItem(type, item.id, 'price', e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
      </Card>
    );
  };

  const renderEmptyState = (type: 'products' | 'services') => {
    const isProducts = type === 'products';
    const suggestions = isProducts ? PRODUCT_SUGGESTIONS : SERVICE_SUGGESTIONS;
    const Icon = isProducts ? Package : Briefcase;
    const label = isProducts ? 'المنتجات' : 'الخدمات';
    const items = isProducts ? products : services;

    if (items.length > 0) return null;

    return (
      <div className="border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center space-y-4 bg-emerald-50/30">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 mb-2">
          <Icon className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-800 mb-1">
            ابدأ بإضافة {label}
          </p>
          <p className="text-sm text-gray-500">
            {isProducts
              ? 'أضف منتجاتك ليتمكن ساري من عرضها للعملاء والرد على استفساراتهم'
              : 'أضف خدماتك ليتمكن ساري من حجز المواعيد وتقديم التفاصيل للعملاء'}
          </p>
        </div>

        {/* Quick Add Button */}
        <Button
          onClick={() => addItem(type)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4 ml-2" />
          إضافة {isProducts ? 'منتج' : 'خدمة'}
        </Button>

        {/* Suggestions */}
        <div className="pt-3 border-t border-emerald-200">
          <p className="text-xs text-gray-500 mb-2 flex items-center justify-center gap-1">
            <Lightbulb className="h-3 w-3" />
            أو أضف سريعاً من الأمثلة:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => addSuggestion(type, s)}
                className="text-xs px-3 py-1.5 rounded-full bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-colors"
              >
                {s.name} ({s.price} ر.س)
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-gray-600">
          أضف {isStore && isServices ? 'المنتجات والخدمات' : isStore ? 'المنتجات' : 'الخدمات'} التي تقدمها
        </p>
        <p className="text-sm text-gray-500 mt-1">
          سيستخدمها ساري للرد على عملائك تلقائياً عبر واتساب
        </p>
      </div>

      {/* Tips Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <Lightbulb className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 space-y-1">
          <p className="font-medium">💡 نصائح لإضافة {isStore ? 'المنتجات' : 'الخدمات'}:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-700">
            {isStore ? (
              <>
                <li>أضف اسم واضح ومحدد (مثال: "جوال سامسونج S24 - 256GB")</li>
                <li>حدد السعر بالريال السعودي</li>
                <li>أضف وصف مختصر يساعد ساري في الرد على العملاء</li>
              </>
            ) : (
              <>
                <li>أضف اسم الخدمة بوضوح (مثال: "استقدام عاملة منزلية" أو "كشف طبي عام")</li>
                <li>حدد السعر أو النطاق السعري</li>
                <li>اذكر مدة الخدمة والشروط في الوصف إن أمكن</li>
              </>
            )}
          </ul>
        </div>
      </div>

      <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
        {/* Products Section */}
        {isStore && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 space-x-reverse">
                <Package className="h-5 w-5 text-emerald-600" />
                <span>المنتجات</span>
                {filledProducts.length > 0 && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    {filledProducts.length} منتج
                  </span>
                )}
              </h3>
              {products.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem('products')}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  <Plus className="h-4 w-4 ml-1" />
                  إضافة منتج
                </Button>
              )}
            </div>

            {renderEmptyState('products')}

            <div className="space-y-3">
              {products.map((product, index) => renderItemForm(product, 'products', index))}
            </div>
          </div>
        )}

        {/* Separator */}
        {isStore && isServices && <hr className="border-gray-200" />}

        {/* Services Section */}
        {isServices && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 space-x-reverse">
                <Briefcase className="h-5 w-5 text-emerald-600" />
                <span>الخدمات</span>
                {filledServices.length > 0 && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    {filledServices.length} خدمة
                  </span>
                )}
              </h3>
              {services.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem('services')}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  <Plus className="h-4 w-4 ml-1" />
                  إضافة خدمة
                </Button>
              )}
            </div>

            {renderEmptyState('services')}

            <div className="space-y-3">
              {services.map((service, index) => renderItemForm(service, 'services', index))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={handleSkip} className="text-gray-500 hover:text-gray-700">
          <AlertCircle className="h-4 w-4 ml-1" />
          تخطي - سأضيف لاحقاً
        </Button>

        {hasFilledItems ? (
          <Button size="lg" onClick={handleNext} className="px-8 bg-emerald-600 hover:bg-emerald-700">
            التالي ({filledProducts.length + filledServices.length} عنصر)
            <ArrowRight className="mr-2 h-5 w-5" />
          </Button>
        ) : (
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            أضف عنصر واحد على الأقل أو تخطَّ الخطوة
          </div>
        )}
      </div>
    </div>
  );
}
