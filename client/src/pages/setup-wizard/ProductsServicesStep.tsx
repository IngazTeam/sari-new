import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ArrowRight, Plus, Trash2, Package, Briefcase, Lightbulb, AlertCircle, Globe, ImageIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  imageUrl?: string;
  currency?: string;
  category?: string;
  productUrl?: string;
}

const PRODUCT_SUGGESTIONS = [
  { name: 'جوال سامسونج S24', price: '3499' },
  { name: 'لابتوب ديل انسبايرون', price: '2899' },
  { name: 'سماعات ايربودز', price: '899' },
  { name: 'شاحن لاسلكي', price: '149' },
  { name: 'طاولة مكتب', price: '750' },
  { name: 'كرسي مكتبي', price: '1200' },
];

const SERVICE_SUGGESTIONS = [
  { name: 'حجز موعد كشف طبي', price: '150' },
  { name: 'تنظيف أسنان', price: '300' },
  { name: 'جلسة تصوير فوتوغرافي', price: '500' },
  { name: 'استشارة قانونية', price: '400' },
  { name: 'جلسة تجميل وعناية', price: '250' },
  { name: 'صيانة مكيفات', price: '200' },
  { name: 'استقدام عاملة منزلية', price: '15000' },
  { name: 'حجز قاعة مناسبات', price: '5000' },
];

export default function ProductsServicesStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
}: ProductsServicesStepProps) {
  const { t } = useTranslation();
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

  // Check if products came from website scraping (have imageUrl or productUrl)
  const hasScrapedProducts = products.some(p => p.imageUrl || p.productUrl);

  const renderItemForm = (item: Item, type: 'products' | 'services', index: number) => {
    const items = type === 'products' ? products : services;
    const Icon = type === 'products' ? Package : Briefcase;
    const label = type === 'products' ? 'المنتج' : 'الخدمة';

    return (
      <Card key={item.id} className="p-4 border-emerald-100 bg-white">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2 space-x-reverse">
            {/* Show product image thumbnail if available */}
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-10 h-10 rounded-lg object-cover bg-muted border"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  // Show fallback icon
                  const fallback = (e.target as HTMLImageElement).nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
              />
            ) : null}
            <div className={`w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center ${item.imageUrl ? 'hidden' : ''}`}>
              <Icon className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">
                {label} #{index + 1}
              </h4>
              {item.category && (
                <span className="text-xs text-gray-500">{item.category}</span>
              )}
            </div>
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
            <Label htmlFor={`${type}-name-${item.id}`}>{t('wizardProductsServicesStepPage.text0')}</Label>
            <Input
              id={`${type}-name-${item.id}`}
              placeholder={type === 'products' ? 'مثال: جوال سامسونج S24' : 'مثال: استقدام عاملة منزلية'}
              value={item.name}
              onChange={(e) => updateItem(type, item.id, 'name', e.target.value)}
              className={!item.name.trim() && hasAnyItems ? 'border-amber-300' : ''}
            />
          </div>

          <div>
            <Label htmlFor={`${type}-desc-${item.id}`}>{t('wizardProductsServicesStepPage.text1')}</Label>
            <Textarea
              id={`${type}-desc-${item.id}`}
              placeholder={type === 'products' ? 'وصف المنتج ومميزاته...' : 'وصف الخدمة ومدتها والشروط...'}
              value={item.description}
              onChange={(e) => updateItem(type, item.id, 'description', e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor={`${type}-price-${item.id}`}>
              {t('wizardProductsServicesStepPage.text2')}
              {item.currency && item.currency !== 'SAR' && (
                <span className="text-xs text-gray-400 mr-2">({item.currency})</span>
              )}
            </Label>
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

  // Card view for scraped products
  const renderScrapedCard = (item: Item, type: 'products' | 'services') => {
    return (
      <Card key={item.id} className="group overflow-hidden border hover:border-emerald-300 hover:shadow-md transition-all duration-200 relative">
        {/* Delete button */}
        <button
          onClick={() => removeItem(type, item.id)}
          className="absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Product Image */}
        <div className="aspect-square bg-muted relative overflow-hidden">
          {item.imageUrl && item.imageUrl.trim() ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                const fallback = (e.target as HTMLImageElement).nextElementSibling;
                if (fallback) (fallback as HTMLElement).style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className={`absolute inset-0 bg-gradient-to-br from-emerald-50 to-emerald-100 items-center justify-center ${item.imageUrl && item.imageUrl.trim() ? 'hidden' : 'flex'}`}
          >
            <Package className="w-10 h-10 text-emerald-300" />
          </div>
          {/* Price badge */}
          {item.price && parseFloat(item.price) > 0 && (
            <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-0.5 text-xs font-bold text-emerald-700 shadow-sm">
              {item.price} {item.currency === 'SAR' || !item.currency ? 'ر.س' : item.currency}
            </div>
          )}
        </div>
        {/* Product Info */}
        <div className="p-2.5">
          <p className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
            {item.name}
          </p>
          {item.category && (
            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 mt-1 inline-block">
              {item.category}
            </span>
          )}
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

        {/* Suggestions — only show if NO scraped products exist */}
        {!hasScrapedProducts && (
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
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-gray-600">
          {hasScrapedProducts
            ? `راجع ${isStore && isServices ? 'المنتجات والخدمات' : isStore ? 'المنتجات' : 'الخدمات'} المستوردة من موقعك`
            : `أضف ${isStore && isServices ? 'المنتجات والخدمات' : isStore ? 'المنتجات' : 'الخدمات'} التي تقدمها`
          }
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {hasScrapedProducts
            ? 'يمكنك تعديل أو حذف أي منتج قبل المتابعة'
            : 'سيستخدمها ساري للرد على عملائك تلقائياً عبر واتساب'
          }
        </p>
      </div>

      {/* Scraped Products Banner */}
      {hasScrapedProducts && products.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <Globe className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">🌐 تم استيراد {products.length} منتج من موقعك</p>
            <p className="text-xs text-blue-600 mt-0.5">يمكنك تعديل أو حذف أي منتج أدناه</p>
          </div>
        </div>
      )}

      {/* Tips Banner — only show when not scraped */}
      {!hasScrapedProducts && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <Lightbulb className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-medium">💡 نصائح لإضافة {isStore ? 'المنتجات' : 'الخدمات'}:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-700">
              {isStore ? (
                <>
                  <li>{t('wizardProductsServicesStepPage.text3')}</li>
                  <li>{t('wizardProductsServicesStepPage.text4')}</li>
                  <li>{t('wizardProductsServicesStepPage.text5')}</li>
                </>
              ) : (
                <>
                  <li>{t('wizardProductsServicesStepPage.text6')}</li>
                  <li>{t('wizardProductsServicesStepPage.text7')}</li>
                  <li>{t('wizardProductsServicesStepPage.text8')}</li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
        {/* Products Section */}
        {isStore && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2 space-x-reverse">
                <Package className="h-5 w-5 text-emerald-600" />
                <span>{t('wizardProductsServicesStepPage.text9')}</span>
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

            {hasScrapedProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.map((product) => renderScrapedCard(product, 'products'))}
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product, index) => renderItemForm(product, 'products', index))}
              </div>
            )}
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
                <span>{t('wizardProductsServicesStepPage.text10')}</span>
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
