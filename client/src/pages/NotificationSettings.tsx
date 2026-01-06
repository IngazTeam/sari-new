import { useState, useEffect } from 'react';

import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { 
  Bell, 
  BellOff, 
  Mail, 
  Smartphone, 
  Clock, 
  ShoppingCart, 
  MessageSquare, 
  Calendar, 
  Package, 
  AlertTriangle,
  Loader2,
  Save
} from 'lucide-react';

export default function NotificationSettings() {
  const [merchantId, setMerchantId] = useState<number | null>(null);

  // Get merchant ID
  const { data: merchants } = trpc.merchants.list.useQuery();

  useEffect(() => {
    if (merchants && merchants.length > 0) {
      setMerchantId(merchants[0].id);
    }
  }, [merchants]);

  // Get notification preferences
  const { data: preferences, isLoading, refetch } = trpc.notificationPreferences.get.useQuery(
    { merchantId: merchantId! },
    { enabled: !!merchantId }
  );

  // Update preferences mutation
  const updateMutation = trpc.notificationPreferences.update.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ إعدادات الإشعارات بنجاح');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleUpdate = (data: any) => {
    if (!merchantId) return;
    updateMutation.mutate({
      merchantId,
      ...data,
    });
  };

  if (isLoading || !preferences) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إعدادات الإشعارات</h1>
          <p className="text-gray-600">تخصيص تفضيلات الإشعارات وساعات الهدوء</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* طريقة الإرسال المفضلة */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <CardTitle>طريقة الإرسال المفضلة</CardTitle>
            </div>
            <CardDescription>اختر كيف تريد استلام الإشعارات</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3">
              <Button
                variant={preferences.preferredMethod === 'push' ? 'default' : 'outline'}
                onClick={() => handleUpdate({ preferredMethod: 'push' })}
                className="w-full justify-start"
              >
                <Smartphone className="w-4 h-4 ml-2" />
                إشعارات فورية فقط
              </Button>
              
              <Button
                variant={preferences.preferredMethod === 'email' ? 'default' : 'outline'}
                onClick={() => handleUpdate({ preferredMethod: 'email' })}
                className="w-full justify-start"
              >
                <Mail className="w-4 h-4 ml-2" />
                بريد إلكتروني فقط
              </Button>
              
              <Button
                variant={preferences.preferredMethod === 'both' ? 'default' : 'outline'}
                onClick={() => handleUpdate({ preferredMethod: 'both' })}
                className="w-full justify-start"
              >
                <Bell className="w-4 h-4 ml-2" />
                كلاهما
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* أنواع الإشعارات */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <CardTitle>أنواع الإشعارات</CardTitle>
            </div>
            <CardDescription>اختر الإشعارات التي تريد استلامها</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <Label htmlFor="newOrders">الطلبات الجديدة</Label>
              </div>
              <Switch
                id="newOrders"
                checked={preferences.newOrdersEnabled}
                onCheckedChange={(checked) => handleUpdate({ newOrdersEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                <Label htmlFor="newMessages">الرسائل الجديدة</Label>
              </div>
              <Switch
                id="newMessages"
                checked={preferences.newMessagesEnabled}
                onCheckedChange={(checked) => handleUpdate({ newMessagesEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                <Label htmlFor="appointments">المواعيد</Label>
              </div>
              <Switch
                id="appointments"
                checked={preferences.appointmentsEnabled}
                onCheckedChange={(checked) => handleUpdate({ appointmentsEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-orange-600" />
                <Label htmlFor="orderStatus">تحديثات حالة الطلب</Label>
              </div>
              <Switch
                id="orderStatus"
                checked={preferences.orderStatusEnabled}
                onCheckedChange={(checked) => handleUpdate({ orderStatusEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellOff className="w-4 h-4 text-yellow-600" />
                <Label htmlFor="missedMessages">الرسائل الفائتة</Label>
              </div>
              <Switch
                id="missedMessages"
                checked={preferences.missedMessagesEnabled}
                onCheckedChange={(checked) => handleUpdate({ missedMessagesEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <Label htmlFor="whatsappDisconnect">فك ربط واتساب</Label>
              </div>
              <Switch
                id="whatsappDisconnect"
                checked={preferences.whatsappDisconnectEnabled}
                onCheckedChange={(checked) => handleUpdate({ whatsappDisconnectEnabled: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* ساعات الهدوء */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <CardTitle>ساعات الهدوء</CardTitle>
            </div>
            <CardDescription>إيقاف الإشعارات خلال فترة معينة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="quietHours">تفعيل ساعات الهدوء</Label>
              <Switch
                id="quietHours"
                checked={preferences.quietHoursEnabled}
                onCheckedChange={(checked) => handleUpdate({ quietHoursEnabled: checked })}
              />
            </div>

            {preferences.quietHoursEnabled && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">من الساعة</Label>
                    <Input
                      type="time"
                      value={preferences.quietHoursStart || '22:00'}
                      onChange={(e) => handleUpdate({ quietHoursStart: e.target.value })}
                      className="bg-white"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">إلى الساعة</Label>
                    <Input
                      type="time"
                      value={preferences.quietHoursEnd || '08:00'}
                      onChange={(e) => handleUpdate({ quietHoursEnd: e.target.value })}
                      className="bg-white"
                    />
                  </div>
                </div>
                
                <div className="text-sm text-gray-600 bg-white p-3 rounded border border-blue-200">
                  ℹ️ ملاحظة: الإشعارات المهمة جداً (مثل فك ربط واتساب) سيتم إرسالها حتى خلال ساعات الهدوء
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* إعدادات إضافية */}
        <Card>
          <CardHeader>
            <CardTitle>إعدادات إضافية</CardTitle>
            <CardDescription>خيارات متقدمة للإشعارات</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="instant">إشعارات فورية</Label>
                <p className="text-sm text-gray-600">إرسال الإشعارات فوراً</p>
              </div>
              <Switch
                id="instant"
                checked={preferences.instantNotifications}
                onCheckedChange={(checked) => handleUpdate({ instantNotifications: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="batch">تجميع الإشعارات</Label>
                <p className="text-sm text-gray-600">تجميع الإشعارات المتعددة</p>
              </div>
              <Switch
                id="batch"
                checked={preferences.batchNotifications}
                onCheckedChange={(checked) => handleUpdate({ batchNotifications: checked })}
              />
            </div>

            {preferences.batchNotifications && (
              <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                <Label className="text-sm font-medium">فترة التجميع (دقائق)</Label>
                <Input
                  type="number"
                  min="5"
                  max="60"
                  value={preferences.batchInterval || 30}
                  onChange={(e) => handleUpdate({ batchInterval: parseInt(e.target.value) || 30 })}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
