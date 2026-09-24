import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  Plus,
  Trash2,
  Package,
  Briefcase,
  Lightbulb,
  AlertCircle,
  Globe,
  ImageIcon,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

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

export default function ProductsServicesStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
}: ProductsServicesStepProps) {
  const { t } = useTranslation();
  const businessType = wizardData.businessType;
  const isStore = businessType === "store" || businessType === "both";
  const isServices = businessType === "services" || businessType === "both";

  const [products, setProductsState] = useState<Item[]>(
    wizardData.products || []
  );
  const [services, setServicesState] = useState<Item[]>(
    wizardData.services || []
  );

  // Keep drafts when switching input methods or returning to another stage.
  const setProducts = (items: Item[]) => {
    setProductsState(items);
    updateWizardData({ products: items });
  };
  const setServices = (items: Item[]) => {
    setServicesState(items);
    updateWizardData({ services: items });
  };

  const addItem = (type: "products" | "services") => {
    const newItem: Item = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      price: "",
    };

    if (type === "products") {
      setProducts([...products, newItem]);
    } else {
      setServices([...services, newItem]);
    }
  };

  const removeItem = (type: "products" | "services", id: string) => {
    if (type === "products") {
      setProducts(products.filter(p => p.id !== id));
    } else {
      setServices(services.filter(s => s.id !== id));
    }
  };

  const updateItem = (
    type: "products" | "services",
    id: string,
    field: keyof Item,
    value: string
  ) => {
    if (type === "products") {
      setProducts(
        products.map(p => (p.id === id ? { ...p, [field]: value } : p))
      );
    } else {
      setServices(
        services.map(s => (s.id === id ? { ...s, [field]: value } : s))
      );
    }
  };

  // Check if at least one valid item exists
  const filledProducts = products.filter(p => p.name.trim());
  const filledServices = services.filter(s => s.name.trim());
  const hasFilledItems = filledProducts.length > 0 || filledServices.length > 0;
  const hasAnyItems = products.length > 0 || services.length > 0;

  const handleNext = () => {
    const data: Record<string, Item[]> = {};

    if (isStore) {
      data.products = filledProducts;
    }

    if (isServices) {
      data.services = filledServices;
    }

    updateWizardData(data);
    // Catalog persistence happens once in completeSetup. The wizard draft is
    // autosaved between steps, avoiding duplicate products on back/next retries.
    goToNextStep();
  };

  const handleSkip = () => {
    updateWizardData({ products: filledProducts, services: filledServices });
    skipStep();
  };

  // Check if products came from website scraping (have imageUrl or productUrl)
  const hasScrapedProducts = products.some(p => p.imageUrl || p.productUrl);

  const renderItemForm = (
    item: Item,
    type: "products" | "services",
    index: number
  ) => {
    const items = type === "products" ? products : services;
    const Icon = type === "products" ? Package : Briefcase;
    const label = type === "products" ? "المنتج" : "الخدمة";

    return (
      <Card key={item.id} className="p-4 border-border bg-card">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Show product image thumbnail if available */}
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-10 h-10 rounded-lg object-cover bg-muted border"
                onError={e => {
                  (e.target as HTMLImageElement).style.display = "none";
                  // Show fallback icon
                  const fallback = (e.target as HTMLImageElement)
                    .nextElementSibling;
                  if (fallback)
                    (fallback as HTMLElement).style.display = "flex";
                }}
              />
            ) : null}
            <div
              className={`w-8 h-8 rounded-lg bg-accent flex items-center justify-center ${item.imageUrl ? "hidden" : ""}`}
            >
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground">
                {label} #{index + 1}
              </h4>
              {item.category && (
                <span className="text-xs text-muted-foreground">
                  {item.category}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeItem(type, item.id)}
            aria-label={t("merchantUx.actions.removeNamed", { name: item.name || (type === "products" ? t("wizardProductsServicesStepPage.text9") : t("wizardProductsServicesStepPage.text10")) })}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor={`${type}-name-${item.id}`}>
              {t("wizardProductsServicesStepPage.text0")}
            </Label>
            <Input
              id={`${type}-name-${item.id}`}
              placeholder={
                type === "products"
                  ? "مثال: جوال سامسونج S24"
                  : "مثال: استقدام عاملة منزلية"
              }
              value={item.name}
              onChange={e => updateItem(type, item.id, "name", e.target.value)}
              className={
                !item.name.trim() && hasAnyItems ? "border-amber-300" : ""
              }
            />
          </div>

          <div>
            <Label htmlFor={`${type}-desc-${item.id}`}>
              {t("wizardProductsServicesStepPage.text1")}
            </Label>
            <Textarea
              id={`${type}-desc-${item.id}`}
              placeholder={
                type === "products"
                  ? "وصف المنتج ومميزاته..."
                  : "وصف الخدمة ومدتها والشروط..."
              }
              value={item.description}
              onChange={e =>
                updateItem(type, item.id, "description", e.target.value)
              }
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor={`${type}-price-${item.id}`}>
              {t("wizardProductsServicesStepPage.text2")}
              {item.currency && item.currency !== "SAR" && (
                <span className="text-xs text-muted-foreground mr-2">
                  ({item.currency})
                </span>
              )}
            </Label>
            <Input
              id={`${type}-price-${item.id}`}
              type="number"
              placeholder="0.00"
              value={item.price}
              onChange={e => updateItem(type, item.id, "price", e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
      </Card>
    );
  };

  // Card view for scraped products
  const renderScrapedCard = (item: Item, type: "products" | "services") => {
    return (
      <Card
        key={item.id}
        className="group overflow-hidden border hover:border-border hover:shadow-md transition-all duration-200 relative"
      >
        {/* Delete button */}
        <button
          onClick={() => removeItem(type, item.id)}
            aria-label={t("merchantUx.actions.removeNamed", { name: item.name || (type === "products" ? t("wizardProductsServicesStepPage.text9") : t("wizardProductsServicesStepPage.text10")) })}
          className="absolute top-1.5 left-1.5 z-10 w-9 h-9 rounded-full bg-red-500/90 text-white flex items-center justify-center transition-opacity hover:bg-red-600"
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
              onError={e => {
                (e.target as HTMLImageElement).style.display = "none";
                const fallback = (e.target as HTMLImageElement)
                  .nextElementSibling;
                if (fallback) (fallback as HTMLElement).style.display = "flex";
              }}
            />
          ) : null}
          <div
            className={`absolute inset-0 bg-accent items-center justify-center ${item.imageUrl && item.imageUrl.trim() ? "hidden" : "flex"}`}
          >
            <Package className="w-10 h-10 text-emerald-300" />
          </div>
          {/* Price badge */}
          {item.price && parseFloat(item.price) > 0 && (
            <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-0.5 text-xs font-bold text-primary shadow-sm">
              {item.price}{" "}
              {item.currency === "SAR" || !item.currency
                ? "ر.س"
                : item.currency}
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

  const renderEmptyState = (type: "products" | "services") => {
    const isProducts = type === "products";
    const Icon = isProducts ? Package : Briefcase;
    const label = isProducts ? "المنتجات" : "الخدمات";
    const items = isProducts ? products : services;

    if (items.length > 0) return null;

    return (
      <div className="border-2 border-dashed border-border rounded-xl p-6 text-center space-y-4 bg-accent">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent mb-2">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">
            ابدأ بإضافة {label}
          </p>
          <p className="text-sm text-muted-foreground">
            {isProducts
              ? "أضف منتجاتك ليتمكن ساري من عرضها للعملاء والرد على استفساراتهم"
              : "أضف خدماتك ليتمكن ساري من حجز المواعيد وتقديم التفاصيل للعملاء"}
          </p>
        </div>

        {/* Quick Add Button */}
        <Button
          onClick={() => addItem(type)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 ml-2" />
          إضافة {isProducts ? "منتج" : "خدمة"}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-muted-foreground">
          {hasScrapedProducts
            ? `راجع ${isStore && isServices ? "المنتجات والخدمات" : isStore ? "المنتجات" : "الخدمات"} المستوردة من موقعك`
            : `أضف ${isStore && isServices ? "المنتجات والخدمات" : isStore ? "المنتجات" : "الخدمات"} التي تقدمها`}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {hasScrapedProducts
            ? "يمكنك تعديل أو حذف أي منتج قبل المتابعة"
            : "سيستخدمها ساري للرد على عملائك تلقائياً عبر واتساب"}
        </p>
      </div>

      {/* Scraped Products Banner */}
      {hasScrapedProducts && products.length > 0 && (
        <div className="bg-accent border border-border rounded-xl p-4 flex gap-3">
          <Globe className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-primary">
            <p className="font-medium">
              🌐 تم استيراد {products.length} منتج من موقعك
            </p>
            <p className="text-xs text-primary mt-0.5">
              {t("productsServicesStep.auto_1")}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6 ms-unbounded-list max-h-[500px] overflow-y-auto pe-2">
        {/* Products Section */}
        {isStore && (
          <div className="space-y-4">
            <div className="flex items-center justify-between ms-adaptive-row">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <span>{t("wizardProductsServicesStepPage.text9")}</span>
                {filledProducts.length > 0 && (
                  <span className="text-xs bg-accent text-primary px-2 py-0.5 rounded-full">
                    {filledProducts.length} منتج
                  </span>
                )}
              </h3>
              {products.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem("products")}
                  className="border-border text-primary hover:bg-accent"
                >
                  <Plus className="h-4 w-4 ml-1" />
                  {t("productsServicesStep.auto_2")}
                </Button>
              )}
            </div>

            {renderEmptyState("products")}

            {hasScrapedProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.map(product =>
                  renderScrapedCard(product, "products")
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product, index) =>
                  renderItemForm(product, "products", index)
                )}
              </div>
            )}
          </div>
        )}

        {/* Separator */}
        {isStore && isServices && <hr className="border-border" />}

        {/* Services Section */}
        {isServices && (
          <div className="space-y-4">
            <div className="flex items-center justify-between ms-adaptive-row">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <span>{t("wizardProductsServicesStepPage.text10")}</span>
                {filledServices.length > 0 && (
                  <span className="text-xs bg-accent text-primary px-2 py-0.5 rounded-full">
                    {filledServices.length} خدمة
                  </span>
                )}
              </h3>
              {services.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem("services")}
                  className="border-border text-primary hover:bg-accent"
                >
                  <Plus className="h-4 w-4 ml-1" />
                  {t("productsServicesStep.auto_3")}
                </Button>
              )}
            </div>

            {renderEmptyState("services")}

            <div className="space-y-3">
              {services.map((service, index) =>
                renderItemForm(service, "services", index)
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="ms-actions">
        {!hasFilledItems && <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-muted-foreground hover:text-foreground"
        >
          <AlertCircle className="h-4 w-4 ml-1" />
          {t("productsServicesStep.auto_4")}
        </Button>}

        {hasFilledItems ? (
          <Button
            size="lg"
            onClick={handleNext}
            className="px-8 bg-primary hover:bg-primary/90"
          >
            التالي ({filledProducts.length + filledServices.length} عنصر)
            <ArrowRight className="h-5 w-5" />
          </Button>
        ) : (
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {t("productsServicesStep.auto_5")}
          </div>
        )}
      </div>
    </div>
  );
}
