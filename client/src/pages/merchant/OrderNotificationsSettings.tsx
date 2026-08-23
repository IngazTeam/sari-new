import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AlertTriangle, Bell, Check, Clock, Loader2, X } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

type OrderNotificationStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export default function OrderNotificationsSettings() {
  const { t } = useTranslation();

  const { data: templates, isLoading, refetch } = trpc.orderNotifications.getTemplates.useQuery();
  const { data: health, refetch: refetchHealth } = trpc.orderNotifications.getHealth.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const updateTemplate = trpc.orderNotifications.updateTemplate.useMutation();
  const acknowledgeIncidents = trpc.orderNotifications.acknowledgeIncidents.useMutation({
    onSuccess: async ({ acknowledged }) => {
      setReviewOpen(false);
      await refetchHealth();
      toast.success(t('orderNotificationsSettingsPage.healthReviewSuccess', { count: acknowledged }));
    },
    onError: () => toast.error(t('orderNotificationsSettingsPage.healthReviewFailure')),
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);

  const statusLabels: Record<OrderNotificationStatus, string> = {
    pending: t('orderNotificationsSettingsPage.text21'),
    paid: t('orderNotificationsSettingsPage.text22'),
    processing: t('orderNotificationsSettingsPage.text23'),
    shipped: t('orderNotificationsSettingsPage.text24'),
    delivered: t('orderNotificationsSettingsPage.text25'),
    cancelled: t('orderNotificationsSettingsPage.text26'),
  };

  const statusDescriptions: Record<OrderNotificationStatus, string> = {
    pending: t('orderNotificationsSettingsPage.text27'),
    paid: t('orderNotificationsSettingsPage.text28'),
    processing: t('orderNotificationsSettingsPage.text29'),
    shipped: t('orderNotificationsSettingsPage.text30'),
    delivered: t('orderNotificationsSettingsPage.text31'),
    cancelled: t('orderNotificationsSettingsPage.text32'),
  };

  const handleToggle = async (status: OrderNotificationStatus, template: string, enabled: boolean) => {
    try {
      await updateTemplate.mutateAsync({ status, template, enabled });
      toast.success(enabled ? t('orderNotificationsSettingsPage.text11') : t('orderNotificationsSettingsPage.text12'));
      await refetch();
    } catch (error) {
      toast.error(t('toast.notifications.msg3'));
    }
  };

  const handleEdit = (index: number, template: string) => {
    setEditingId(index);
    setEditingTemplate(template);
  };

  const handleSave = async (status: OrderNotificationStatus, enabled: boolean) => {
    try {
      await updateTemplate.mutateAsync({ status, template: editingTemplate, enabled });
      toast.success(t('toast.notifications.msg4'));
      setEditingId(null);
      refetch();
    } catch (error) {
      toast.error(t('toast.notifications.msg5'));
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingTemplate('');
  };

  const updatedTimes = templates
    ?.map(template => template.updatedAt ? new Date(template.updatedAt).getTime() : 0)
    .filter(timestamp => Number.isFinite(timestamp) && timestamp > 0) || [];
  const latestTemplateUpdate = updatedTimes.length > 0 ? Math.max(...updatedTimes) : null;

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">{t('orderNotificationsSettingsPage.text0')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('orderNotificationsSettingsPage.text1')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('orderNotificationsSettingsPage.text15')}
        </p>
      </div>

      {health && health.manualReview > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
              <div>
                <p className="font-medium">{t('orderNotificationsSettingsPage.healthReviewTitle')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('orderNotificationsSettingsPage.healthReviewDescription', { count: health.manualReview })}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => setReviewOpen(true)}>
              {t('orderNotificationsSettingsPage.healthReviewButton')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('orderNotificationsSettingsPage.text2')}</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templates?.filter(t => t.enabled).length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('orderNotificationsSettingsPage.text33', { var0: templates?.length || 0 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('orderNotificationsSettingsPage.text3')}</CardTitle>
            <X className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templates?.filter(t => !t.enabled).length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('orderNotificationsSettingsPage.text16')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('orderNotificationsSettingsPage.text4')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestTemplateUpdate
                ? new Date(latestTemplateUpdate).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('orderNotificationsSettingsPage.text17')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Templates */}
      <div className="space-y-4">
        {templates?.map((template, index) => (
          <Card key={template.status}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{statusLabels[template.status]}</CardTitle>
                  <CardDescription>{statusDescriptions[template.status]}</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`order-notification-${template.status}`}
                      checked={template.enabled || false}
                      onCheckedChange={(checked) => handleToggle(template.status, template.template, checked)}
                      aria-label={`${statusLabels[template.status]}: ${template.enabled ? t('orderNotificationsSettingsPage.text13') : t('orderNotificationsSettingsPage.text14')}`}
                    />
                    <Label htmlFor={`order-notification-${template.status}`} className="text-sm">
                      {template.enabled ? t('orderNotificationsSettingsPage.text13') : t('orderNotificationsSettingsPage.text14')}
                    </Label>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {editingId === index ? (
                <>
                  <div>
                    <Label>{t('orderNotificationsSettingsPage.text5')}</Label>
                    <Textarea
                      value={editingTemplate}
                      onChange={(e) => setEditingTemplate(e.target.value)}
                      maxLength={3500}
                      rows={6}
                      className="mt-2 font-arabic"
                      dir="rtl"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('orderNotificationsSettingsPage.text34')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => handleSave(template.status, template.enabled)} size="sm" disabled={updateTemplate.isPending}>
                      <Check className="h-4 w-4 ml-2" aria-hidden="true" />
                      {t('orderNotificationsSettingsPage.text18')}
                    </Button>
                    <Button type="button" onClick={handleCancel} variant="outline" size="sm">
                      <X className="h-4 w-4 ml-2" aria-hidden="true" />
                      {t('orderNotificationsSettingsPage.text19')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-muted p-4 rounded-lg">
                    <pre className="text-sm whitespace-pre-wrap font-arabic" dir="rtl">
                      {template.template}
                    </pre>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleEdit(index, template.template)}
                    variant="outline"
                    size="sm"
                  >
                    {t('orderNotificationsSettingsPage.text20')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Help Section */}
      <Card className="bg-primary/10 dark:bg-blue-950 border-primary/30 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-primary dark:text-blue-100">{t('orderNotificationsSettingsPage.text6')}</CardTitle>
        </CardHeader>
        <CardContent className="text-primary dark:text-blue-200 space-y-2">
          <p>{t('orderNotificationsSettingsPage.text7')}</p>
          <p>{t('orderNotificationsSettingsPage.text8')}</p>
          <p>{t('orderNotificationsSettingsPage.text9')}</p>
          <p>{t('orderNotificationsSettingsPage.text10')}</p>
        </CardContent>
      </Card>

      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('orderNotificationsSettingsPage.healthReviewDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('orderNotificationsSettingsPage.healthReviewDialogDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acknowledgeIncidents.isPending}>
              {t('orderNotificationsSettingsPage.healthReviewCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!health?.manualReview || acknowledgeIncidents.isPending}
              onClick={(event) => {
                event.preventDefault();
                acknowledgeIncidents.mutate();
              }}
            >
              {acknowledgeIncidents.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" aria-hidden="true" />}
              {t('orderNotificationsSettingsPage.healthReviewConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
