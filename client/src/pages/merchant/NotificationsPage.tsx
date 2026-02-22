import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  Info, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useTranslation } from 'react-i18next';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery();

  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      toast.success(t('notificationsPagePage.text0'));
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const deleteMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      toast.success(t('notificationsPagePage.text1'));
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const handleMarkAsRead = async (id: number) => {
    await markAsReadMutation.mutateAsync({ id });
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsReadMutation.mutateAsync();
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('notificationsPagePage.text14'))) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'success':
        return <Badge variant="default" className="bg-green-600">{t('notificationsPagePage.text2')}</Badge>;
      case 'warning':
        return <Badge variant="default" className="bg-yellow-600">{t('notificationsPagePage.text3')}</Badge>;
      case 'error':
        return <Badge variant="destructive">{t('notificationsPagePage.text4')}</Badge>;
      default:
        return <Badge variant="default">{t('notificationsPagePage.text5')}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            {t('notificationsPagePage.text9')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount ? t('notificationsPagePage.text13', { var0: unreadCount }) : t('notificationsPagePage.text8')}
          </p>
        </div>

        {unreadCount && unreadCount > 0 && (
          <Button
            onClick={handleMarkAllAsRead}
            disabled={markAllAsReadMutation.isPending}
          >
            <CheckCheck className="ml-2 h-4 w-4" />
            {t('notificationsPagePage.text10')}
          </Button>
        )}
      </div>

      {/* Notifications List */}
      {!notifications || notifications.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Bell className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{t('notificationsPagePage.text6')}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {t('notificationsPagePage.text11')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                !notification.isRead ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="mt-1">
                    {getTypeIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{notification.title}</h3>
                        {!notification.isRead && (
                          <Badge variant="default" className="text-xs">{t('notificationsPagePage.text7')}</Badge>
                        )}
                      </div>
                      {getTypeBadge(notification.type)}
                    </div>

                    <p className="text-sm text-muted-foreground mb-3">
                      {notification.message}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(notification.createdAt).toLocaleDateString('ar-SA', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      <div className="flex gap-2">
                        {notification.link && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <ExternalLink className="ml-2 h-3 w-3" />
                            {t('notificationsPagePage.text12')}
                          </Button>
                        )}

                        {!notification.isRead && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleMarkAsRead(notification.id)}
                            disabled={markAsReadMutation.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(notification.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
