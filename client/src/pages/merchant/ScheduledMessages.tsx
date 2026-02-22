import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Edit,
  Save,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';

const DAYS_OF_WEEK = [
  { value: 0, label: t('scheduledMessagesPage.text23') },
  { value: 1, label: t('scheduledMessagesPage.text24') },
  { value: 2, label: t('scheduledMessagesPage.text25') },
  { value: 3, label: t('scheduledMessagesPage.text26') },
  { value: 4, label: t('scheduledMessagesPage.text27') },
  { value: 5, label: t('scheduledMessagesPage.text28') },
  { value: 6, label: t('scheduledMessagesPage.text29') },
];

export default function ScheduledMessages() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  
  // Get scheduled messages
  const { data: messages, isLoading } = trpc.scheduledMessages.list.useQuery();
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    dayOfWeek: 4, // Thursday by default
    time: '10:00',
    isActive: true,
  });

  // Create mutation
  const createMutation = trpc.scheduledMessages.create.useMutation({
    onSuccess: () => {
      toast.success(t('scheduledMessagesPage.text0'));
      utils.scheduledMessages.list.invalidate();
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل إنشاء الرسالة: ' + error.message);
    },
  });

  // Update mutation
  const updateMutation = trpc.scheduledMessages.update.useMutation({
    onSuccess: () => {
      toast.success(t('scheduledMessagesPage.text1'));
      utils.scheduledMessages.list.invalidate();
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل تحديث الرسالة: ' + error.message);
    },
  });

  // Delete mutation
  const deleteMutation = trpc.scheduledMessages.delete.useMutation({
    onSuccess: () => {
      toast.success(t('scheduledMessagesPage.text2'));
      utils.scheduledMessages.list.invalidate();
    },
    onError: (error) => {
      toast.error('فشل حذف الرسالة: ' + error.message);
    },
  });

  // Toggle mutation
  const toggleMutation = trpc.scheduledMessages.toggle.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.list.invalidate();
    },
    onError: (error) => {
      toast.error('فشل تغيير الحالة: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
      dayOfWeek: 4,
      time: '10:00',
      isActive: true,
    });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (message: any) => {
    setFormData({
      title: message.title,
      message: message.message,
      dayOfWeek: message.dayOfWeek,
      time: message.time,
      isActive: message.isActive,
    });
    setEditingId(message.id);
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (confirm(t('scheduledMessagesPage.text30'))) {
      deleteMutation.mutate({ id });
    }
  };

  const handleToggle = (id: number, isActive: boolean) => {
    toggleMutation.mutate({ id, isActive: !isActive });
  };

  if (isLoading) {
    return <div className="p-6">{t('scheduledMessagesPage.text3')}</div>;
  }

  return (
    <div className="container max-w-6xl py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{t('scheduledMessagesPage.text4')}</h1>
        <p className="text-muted-foreground">
          {t('scheduledMessagesPage.text19')}
        </p>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{editingId ? t('scheduledMessagesPage.text15') : t('scheduledMessagesPage.text16')}</span>
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">{t('scheduledMessagesPage.text6')}</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('scheduledMessagesPage.text7')}
                  required
                />
              </div>

              <div>
                <Label htmlFor="message">{t('scheduledMessagesPage.text8')}</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder={t('scheduledMessagesPage.text9')}
                  rows={4}
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dayOfWeek">{t('scheduledMessagesPage.text10')}</Label>
                  <Select
                    value={formData.dayOfWeek.toString()}
                    onValueChange={(value) => setFormData({ ...formData, dayOfWeek: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day.value} value={day.value.toString()}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="time">{t('scheduledMessagesPage.text11')}</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label>{t('scheduledMessagesPage.text12')}</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  <Save className="h-4 w-4 ml-2" />
                  {editingId ? t('scheduledMessagesPage.text17') : t('scheduledMessagesPage.text18')}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  {t('scheduledMessagesPage.text20')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Add Button */}
      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="mb-6">
          <Plus className="h-4 w-4 ml-2" />
          {t('scheduledMessagesPage.text21')}
        </Button>
      )}

      {/* Messages List */}
      <div className="grid gap-4">
        {messages && messages.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t('scheduledMessagesPage.text22')}
            </CardContent>
          </Card>
        )}

        {messages?.map((message) => (
          <Card key={message.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    {message.title}
                    {message.isActive ? (
                      <Badge variant="default">{t('scheduledMessagesPage.text13')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('scheduledMessagesPage.text14')}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-2 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {DAYS_OF_WEEK.find(d => d.value === message.dayOfWeek)?.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {message.time}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Switch
                    checked={message.isActive}
                    onCheckedChange={() => handleToggle(message.id, message.isActive)}
                    disabled={toggleMutation.isPending}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(message)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(message.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{message.message}</p>
              {message.lastSentAt && (
                <p className="text-xs text-muted-foreground mt-3">
                  {t('scheduledMessagesPage.text31', { var0: new Date(message.lastSentAt).toLocaleString('ar-SA') })}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
