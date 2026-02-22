import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Bell, Check, X, Clock } from 'lucide-react';

import { useTranslation } from 'react-i18next';
export default function OrderNotificationsSettings() {
  const { t } = useTranslation();

  const { data: templates, isLoading, refetch } = trpc.orderNotifications.getTemplates.useQuery();
  const updateTemplate = trpc.orderNotifications.updateTemplate.useMutation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState('');

  const statusLabels: Record<string, string> = {
    pending: t('orderNotificationsSettingsPage.text21'),
    confirmed: t('orderNotificationsSettingsPage.text22'),
    processing: t('orderNotificationsSettingsPage.text23'),
    shipped: t('orderNotificationsSettingsPage.text24'),
    delivered: t('orderNotificationsSettingsPage.text25'),
    cancelled: t('orderNotificationsSettingsPage.text26'),
  };

  const statusDescriptions: Record<string, string> = {
    pending: t('orderNotificationsSettingsPage.text27'),
    confirmed: t('orderNotificationsSettingsPage.text28'),
    processing: t('orderNotificationsSettingsPage.text29'),
    shipped: t('orderNotificationsSettingsPage.text30'),
    delivered: t('orderNotificationsSettingsPage.text31'),
    cancelled: t('orderNotificationsSettingsPage.text32'),
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await updateTemplate.mutateAsync({ id, enabled });
      toast.success(enabled ? t('orderNotificationsSettingsPage.text11') : t('orderNotificationsSettingsPage.text12'));
      refetch();
    } catch (error) {
      toast.error(t('toast.notifications.msg3'));
    }
  };

  const handleEdit = (id: number, template: string) => {
    setEditingId(id);
    setEditingTemplate(template);
  };

  const handleSave = async (id: number) => {
    try {
      await updateTemplate.mutateAsync({ id, template: editingTemplate });
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
              {templates && templates.length > 0
                ? new Date(Math.max(...templates.map(t => t.updatedAt ? new Date(t.updatedAt).getTime() : 0))).toLocaleDateString('ar-SA')
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
        {templates?.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{statusLabels[template.status]}</CardTitle>
                  <CardDescription>{statusDescriptions[template.status]}</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={template.enabled || false}
                      onCheckedChange={(checked) => handleToggle(template.id, checked)}
                    />
                    <Label className="text-sm">
                      {template.enabled ? t('orderNotificationsSettingsPage.text13') : t('orderNotificationsSettingsPage.text14')}
                    </Label>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {editingId === template.id ? (
                <>
                  <div>
                    <Label>{t('orderNotificationsSettingsPage.text5')}</Label>
                    <Textarea
                      value={editingTemplate}
                      onChange={(e) => setEditingTemplate(e.target.value)}
                      rows={6}
                      className="mt-2 font-arabic"
                      dir="rtl"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('orderNotificationsSettingsPage.text34')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSave(template.id)} size="sm">
                      <Check className="h-4 w-4 ml-2" />
                      {t('orderNotificationsSettingsPage.text18')}
                    </Button>
                    <Button onClick={handleCancel} variant="outline" size="sm">
                      <X className="h-4 w-4 ml-2" />
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
                    onClick={() => handleEdit(template.id, template.template)}
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
    </div>
  );
}
