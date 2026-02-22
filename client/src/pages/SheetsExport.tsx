import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Download, MessageSquare, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from 'react-i18next';

export default function SheetsExport() {
  const { t } = useTranslation();
  const [selectedConversations, setSelectedConversations] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // جلب المحادثات
  const { data: conversations, isLoading } = trpc.conversations.list.useQuery();

  // تصدير المحادثات
  const exportMutation = trpc.sheets.exportConversations.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'نجح التصدير',
          description: data.message,
        });
        setSelectedConversations([]);
        setSelectAll(false);
      } else {
        toast({
          title: 'فشل التصدير',
          description: data.message,
          variant: 'destructive',
        });
      }
    },
  });

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked && conversations) {
      setSelectedConversations(conversations.map(c => c.id));
    } else {
      setSelectedConversations([]);
    }
  };

  const handleSelectConversation = (conversationId: number, checked: boolean) => {
    if (checked) {
      setSelectedConversations([...selectedConversations, conversationId]);
    } else {
      setSelectedConversations(selectedConversations.filter(id => id !== conversationId));
      setSelectAll(false);
    }
  };

  const handleExport = () => {
    if (selectedConversations.length === 0) {
      toast({
        title: 'تنبيه',
        description: 'الرجاء اختيار محادثة واحدة على الأقل',
        variant: 'destructive',
      });
      return;
    }

    exportMutation.mutate({
      conversationIds: selectedConversations,
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container max-w-6xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{t('sheetsExportPage.text0')}</h1>
          <p className="text-muted-foreground">
            تصدير المحادثات المحددة إلى Google Sheets
          </p>
        </div>

        {/* إحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">{t('sheetsExportPage.text1')}</p>
                <p className="text-2xl font-bold">{conversations?.length || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">{t('sheetsExportPage.text2')}</p>
                <p className="text-2xl font-bold">{selectedConversations.length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-center">
            <Button
              onClick={handleExport}
              disabled={exportMutation.isPending || selectedConversations.length === 0}
              size="lg"
              className="w-full"
            >
              {exportMutation.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              <Download className="w-5 h-5 ml-2" />
              تصدير المحادثات المحددة
            </Button>
          </Card>
        </div>

        {/* قائمة المحادثات */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">{t('sheetsExportPage.text3')}</h2>
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectAll}
                onCheckedChange={handleSelectAll}
              />
              <label
                htmlFor="select-all"
                className="text-sm font-medium cursor-pointer"
              >
                تحديد الكل
              </label>
            </div>
          </div>

          {!conversations || conversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('sheetsExportPage.text4')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={`conv-${conversation.id}`}
                    checked={selectedConversations.includes(conversation.id)}
                    onCheckedChange={(checked) =>
                      handleSelectConversation(conversation.id, checked as boolean)
                    }
                  />

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium">
                        {conversation.customerName || 'عميل غير محدد'}
                      </h3>
                      <span className="text-sm text-muted-foreground">
                        {new Date(conversation.createdAt).toLocaleDateString('ar-SA')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{conversation.customerPhone}</span>
                      <span>•</span>
                      <span>
                        {conversation.status === 'active' ? 'نشط' : 'مغلق'}
                      </span>
                    </div>
                  </div>

                  <div className="text-left">
                    <p className="text-sm text-muted-foreground">
                      {new Date(conversation.createdAt).toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ملاحظة */}
        <Card className="p-4 mt-6 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800">
            💡 <strong>{t('sheetsExportPage.text5')}</strong> سيتم تصدير جميع الرسائل في المحادثات المحددة إلى صفحة "المحادثات" في Google Sheets
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
