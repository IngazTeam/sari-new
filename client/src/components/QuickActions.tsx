import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Package, 
  CreditCard, 
  Calendar, 
  MapPin, 
  Clock, 
  UserPlus,
  Send,
  ChevronRight,
  Zap,
  ShoppingCart,
  FileText,
  Phone,
  MessageSquare,
  Gift,
  Star,
  Truck,
  Settings,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface QuickActionsProps {
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  merchantId?: number;
  onActionComplete?: (action: string, data?: any) => void;
  className?: string;
  compact?: boolean;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  category: 'sales' | 'support' | 'info' | 'booking';
}

const quickActions: QuickAction[] = [
  {
    id: 'send_products',
    label: 'قائمة المنتجات',
    icon: <Package className="w-4 h-4" />,
    color: 'bg-blue-500',
    description: 'إرسال قائمة المنتجات المتاحة',
    category: 'sales',
  },
  {
    id: 'send_payment_link',
    label: 'رابط الدفع',
    icon: <CreditCard className="w-4 h-4" />,
    color: 'bg-green-500',
    description: 'إنشاء وإرسال رابط دفع',
    category: 'sales',
  },
  {
    id: 'book_appointment',
    label: 'حجز موعد',
    icon: <Calendar className="w-4 h-4" />,
    color: 'bg-purple-500',
    description: 'حجز موعد للعميل',
    category: 'booking',
  },
  {
    id: 'send_location',
    label: 'موقع المتجر',
    icon: <MapPin className="w-4 h-4" />,
    color: 'bg-red-500',
    description: 'إرسال موقع المتجر',
    category: 'info',
  },
  {
    id: 'send_hours',
    label: 'ساعات العمل',
    icon: <Clock className="w-4 h-4" />,
    color: 'bg-orange-500',
    description: 'إرسال ساعات العمل',
    category: 'info',
  },
  {
    id: 'transfer_human',
    label: 'تحويل للدعم',
    icon: <UserPlus className="w-4 h-4" />,
    color: 'bg-yellow-500',
    description: 'تحويل المحادثة للدعم البشري',
    category: 'support',
  },
  {
    id: 'send_order_status',
    label: 'حالة الطلب',
    icon: <Truck className="w-4 h-4" />,
    color: 'bg-cyan-500',
    description: 'إرسال حالة طلب العميل',
    category: 'sales',
  },
  {
    id: 'send_offer',
    label: 'عرض خاص',
    icon: <Gift className="w-4 h-4" />,
    color: 'bg-pink-500',
    description: 'إرسال عرض أو خصم خاص',
    category: 'sales',
  },
  {
    id: 'request_review',
    label: 'طلب تقييم',
    icon: <Star className="w-4 h-4" />,
    color: 'bg-amber-500',
    description: 'طلب تقييم من العميل',
    category: 'support',
  },
  {
    id: 'send_catalog',
    label: 'الكتالوج',
    icon: <FileText className="w-4 h-4" />,
    color: 'bg-indigo-500',
    description: 'إرسال كتالوج المنتجات',
    category: 'sales',
  },
];

const categoryLabels: Record<string, string> = {
  sales: 'المبيعات',
  support: 'الدعم',
  info: 'المعلومات',
  booking: 'الحجوزات',
};

export function QuickActions({
  conversationId,
  customerPhone,
  customerName,
  merchantId,
  onActionComplete,
  className,
  compact = false,
}: QuickActionsProps) {
  const { t } = useTranslation();
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionData, setActionData] = useState<Record<string, any>>({});

  // Fetch products for product list action
  const { data: products } = trpc.products.list.useQuery(undefined, {
    enabled: selectedAction?.id === 'send_products',
  });

  const handleActionClick = (action: QuickAction) => {
    setSelectedAction(action);
    setActionData({});
    
    // بعض الإجراءات تحتاج dialog للمزيد من المعلومات
    if (['send_payment_link', 'book_appointment', 'send_offer'].includes(action.id)) {
      setIsDialogOpen(true);
    } else {
      executeAction(action);
    }
  };

  const executeAction = async (action: QuickAction) => {
    setIsProcessing(true);
    
    try {
      let message = '';
      
      switch (action.id) {
        case 'send_products':
          if (products && products.length > 0) {
            message = `📦 *قائمة المنتجات المتاحة:*\n\n`;
            products.slice(0, 10).forEach((product, index) => {
              message += `${index + 1}. *${product.name}*\n`;
              message += `   💰 السعر: ${product.price} ريال\n`;
              if (product.description) {
                message += `   📝 ${product.description.substring(0, 50)}...\n`;
              }
              message += '\n';
            });
            message += `\n✨ للطلب أو الاستفسار، أرسل رقم المنتج`;
          } else {
            message = 'عذراً، لا توجد منتجات متاحة حالياً';
          }
          break;

        case 'send_location':
          message = `📍 *موقع متجرنا:*\n\nالرياض - حي النرجس\nشارع الملك عبدالعزيز\n\n🗺️ رابط الموقع:\nhttps://maps.google.com/?q=24.7136,46.6753`;
          break;

        case 'send_hours':
          message = `⏰ *ساعات العمل:*\n\n🗓️ السبت - الخميس:\n   9:00 ص - 10:00 م\n\n🗓️ الجمعة:\n   4:00 م - 10:00 م\n\n📞 للاستفسارات: 0500000000`;
          break;

        case 'transfer_human':
          message = `👋 شكراً لتواصلك معنا!\n\nتم تحويل محادثتك إلى فريق الدعم البشري.\nسيتواصل معك أحد ممثلينا في أقرب وقت.\n\n⏱️ وقت الانتظار المتوقع: 5-10 دقائق`;
          break;

        case 'send_order_status':
          message = `📦 *حالة طلبك:*\n\n✅ تم تأكيد الطلب\n📦 جاري التجهيز\n🚚 في الطريق إليك\n\n⏱️ التوصيل المتوقع: خلال 2-3 أيام عمل\n\n📞 للاستفسار: 0500000000`;
          break;

        case 'request_review':
          message = `⭐ *نقدر رأيك!*\n\nشكراً لتعاملك معنا 🙏\n\nنتمنى أن تكون تجربتك ممتازة.\nهل يمكنك تقييم خدمتنا؟\n\n⭐⭐⭐⭐⭐\n\nرأيك يهمنا ويساعدنا على التطوير!`;
          break;

        case 'send_catalog':
          message = `📚 *كتالوج المنتجات*\n\nيمكنك تصفح جميع منتجاتنا من خلال الرابط:\n\n🔗 https://sari.shop/catalog\n\n✨ عروض حصرية متاحة الآن!`;
          break;

        case 'send_payment_link':
          const amount = actionData.amount || 0;
          const description = actionData.description || 'طلب';
          message = `💳 *رابط الدفع:*\n\n📝 ${description}\n💰 المبلغ: ${amount} ريال\n\n🔗 رابط الدفع:\nhttps://pay.sari.live/order/${Date.now()}\n\n⏱️ صالح لمدة 24 ساعة`;
          break;

        case 'book_appointment':
          const date = actionData.date || 'غداً';
          const time = actionData.time || '10:00 ص';
          const service = actionData.service || 'استشارة';
          message = `📅 *تأكيد الموعد:*\n\n✅ تم حجز موعدك بنجاح!\n\n📋 الخدمة: ${service}\n📆 التاريخ: ${date}\n⏰ الوقت: ${time}\n\n📍 العنوان: الرياض - حي النرجس\n\n⚠️ يرجى الحضور قبل الموعد بـ 10 دقائق`;
          break;

        case 'send_offer':
          const offerTitle = actionData.offerTitle || 'عرض خاص';
          const discount = actionData.discount || '20%';
          const code = actionData.code || 'SPECIAL20';
          message = `🎁 *${offerTitle}*\n\n🔥 خصم ${discount} على جميع المنتجات!\n\n🎟️ كود الخصم: *${code}*\n\n⏱️ العرض ساري حتى نهاية الأسبوع\n\n✨ لا تفوت الفرصة!`;
          break;

        default:
          message = 'تم تنفيذ الإجراء بنجاح';
      }

      // هنا يمكن إرسال الرسالة عبر WhatsApp API
      console.log('Sending message:', message);
      
      toast.success(`تم تنفيذ: ${action.label}`);
      onActionComplete?.(action.id, { message });
      setIsDialogOpen(false);
      
    } catch (error) {
      console.error('Action error:', error);
      toast.error(t('compQuickActionsPage.text0'));
    } finally {
      setIsProcessing(false);
    }
  };

  const renderActionDialog = () => {
    if (!selectedAction) return null;

    switch (selectedAction.id) {
      case 'send_payment_link':
        return (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('compQuickActionsPage.text1')}</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={actionData.amount || ''}
                  onChange={(e) => setActionData({ ...actionData, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('compQuickActionsPage.text2')}</Label>
                <Input
                  placeholder={t('compQuickActionsPage.text3')}
                  value={actionData.description || ''}
                  onChange={(e) => setActionData({ ...actionData, description: e.target.value })}
                />
              </div>
            </div>
          </>
        );

      case 'book_appointment':
        return (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('compQuickActionsPage.text4')}</Label>
                <Input
                  placeholder={t('compQuickActionsPage.text5')}
                  value={actionData.service || ''}
                  onChange={(e) => setActionData({ ...actionData, service: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('compQuickActionsPage.text6')}</Label>
                  <Input
                    type="date"
                    value={actionData.date || ''}
                    onChange={(e) => setActionData({ ...actionData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('compQuickActionsPage.text7')}</Label>
                  <Input
                    type="time"
                    value={actionData.time || ''}
                    onChange={(e) => setActionData({ ...actionData, time: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </>
        );

      case 'send_offer':
        return (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('compQuickActionsPage.text8')}</Label>
                <Input
                  placeholder={t('compQuickActionsPage.text9')}
                  value={actionData.offerTitle || ''}
                  onChange={(e) => setActionData({ ...actionData, offerTitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('compQuickActionsPage.text10')}</Label>
                  <Input
                    placeholder={t('compQuickActionsPage.text11')}
                    value={actionData.discount || ''}
                    onChange={(e) => setActionData({ ...actionData, discount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('compQuickActionsPage.text12')}</Label>
                  <Input
                    placeholder={t('compQuickActionsPage.text13')}
                    value={actionData.code || ''}
                    onChange={(e) => setActionData({ ...actionData, code: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  if (compact) {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        <TooltipProvider>
          {quickActions.slice(0, 6).map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => handleActionClick(action)}
                  disabled={isProcessing}
                >
                  <span className={cn("w-5 h-5 rounded flex items-center justify-center text-white", action.color)}>
                    {action.icon}
                  </span>
                  <span className="text-xs">{action.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.description}</TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>

        {/* Dialog for actions that need more input */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedAction && (
                  <>
                    <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white", selectedAction.color)}>
                      {selectedAction.icon}
                    </span>
                    {selectedAction.label}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {selectedAction?.description}
              </DialogDescription>
            </DialogHeader>
            {renderActionDialog()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                إلغاء
              </Button>
              <Button 
                onClick={() => selectedAction && executeAction(selectedAction)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    جاري التنفيذ...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    إرسال
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Full view with categories
  const groupedActions = quickActions.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {} as Record<string, QuickAction[]>);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="w-5 h-5 text-primary" />
          إجراءات سريعة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groupedActions).map(([category, actions]) => (
          <div key={category}>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {categoryLabels[category]}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  className="justify-start gap-2 h-auto py-2"
                  onClick={() => handleActionClick(action)}
                  disabled={isProcessing}
                >
                  <span className={cn("w-6 h-6 rounded flex items-center justify-center text-white shrink-0", action.color)}>
                    {action.icon}
                  </span>
                  <span className="text-sm truncate">{action.label}</span>
                </Button>
              ))}
            </div>
          </div>
        ))}

        {/* Dialog for actions that need more input */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedAction && (
                  <>
                    <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white", selectedAction.color)}>
                      {selectedAction.icon}
                    </span>
                    {selectedAction.label}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {selectedAction?.description}
              </DialogDescription>
            </DialogHeader>
            {renderActionDialog()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                إلغاء
              </Button>
              <Button 
                onClick={() => selectedAction && executeAction(selectedAction)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    جاري التنفيذ...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    إرسال
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// مكون شريط الإجراءات السريعة المصغر
export function QuickActionsBar({
  conversationId,
  customerPhone,
  onActionComplete,
  className,
}: {
  conversationId: number;
  customerPhone: string;
  onActionComplete?: (action: string, data?: any) => void;
  className?: string;
}) {
  return (
    <QuickActions
      conversationId={conversationId}
      customerPhone={customerPhone}
      onActionComplete={onActionComplete}
      className={className}
      compact
    />
  );
}

export default QuickActions;
