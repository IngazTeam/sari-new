import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Edit, RotateCcw, Send, Loader2, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function EmailTemplates() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Fetch templates
  const { data: templates, isLoading, refetch } = trpc.emailTemplates.list.useQuery();

  // Mutations
  const updateMutation = trpc.emailTemplates.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم التحديث',
        description: 'تم تحديث القالب بنجاح',
      });
      setEditOpen(false);
      refetch();
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: error.message,
      });
    },
  });

  const resetMutation = trpc.emailTemplates.reset.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم الاستعادة',
        description: 'تم استعادة القالب الافتراضي بنجاح',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: error.message,
      });
    },
  });

  const testMutation = trpc.emailTemplates.test.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم الإرسال',
        description: 'تم إرسال البريد التجريبي بنجاح',
      });
      setTestOpen(false);
      setTestEmail('');
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: error.message,
      });
    },
  });

  const handlePreview = (template: any) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  const handleEdit = (template: any) => {
    setSelectedTemplate(template);
    setEditOpen(true);
  };

  const handleReset = (templateId: number) => {
    if (confirm('هل أنت متأكد من استعادة القالب الافتراضي؟ سيتم حذف جميع التعديلات.')) {
      resetMutation.mutate({ id: templateId });
    }
  };

  const handleTest = (template: any) => {
    setSelectedTemplate(template);
    setTestOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedTemplate) return;
    
    updateMutation.mutate({
      id: selectedTemplate.id,
      subject: selectedTemplate.subject,
      htmlContent: selectedTemplate.htmlContent,
      textContent: selectedTemplate.textContent,
    });
  };

  const handleSendTest = () => {
    if (!selectedTemplate || !testEmail) {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'يرجى إدخال البريد الإلكتروني',
      });
      return;
    }

    testMutation.mutate({
      id: selectedTemplate.id,
      email: testEmail,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">إدارة قوالب الإيميلات</h1>
        <p className="text-muted-foreground">
          إدارة وتخصيص قوالب البريد الإلكتروني المستخدمة في النظام
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            قوالب البريد الإلكتروني
          </CardTitle>
          <CardDescription>
            {templates?.length || 0} قالب متاح
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم القالب</TableHead>
                <TableHead>الموضوع</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates?.map((template: any) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.displayName}</TableCell>
                  <TableCell className="max-w-xs truncate">{template.subject}</TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                    {template.description}
                  </TableCell>
                  <TableCell>
                    {template.isCustom ? (
                      <Badge variant="secondary">معدّل</Badge>
                    ) : (
                      <Badge variant="outline">افتراضي</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-left">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(template)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTest(template)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      {template.isCustom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReset(template.id)}
                          disabled={resetMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.displayName}</DialogTitle>
            <DialogDescription>{selectedTemplate?.description}</DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="html" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="html">معاينة HTML</TabsTrigger>
              <TabsTrigger value="text">نص عادي</TabsTrigger>
              <TabsTrigger value="variables">المتغيرات</TabsTrigger>
            </TabsList>
            
            <TabsContent value="html" className="mt-4">
              <div className="border rounded-lg p-4 bg-white">
                <div dangerouslySetInnerHTML={{ __html: selectedTemplate?.htmlContent }} />
              </div>
            </TabsContent>
            
            <TabsContent value="text" className="mt-4">
              <div className="border rounded-lg p-4 bg-muted">
                <pre className="whitespace-pre-wrap text-sm">{selectedTemplate?.textContent}</pre>
              </div>
            </TabsContent>
            
            <TabsContent value="variables" className="mt-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">المتغيرات المتاحة:</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate?.variables && JSON.parse(selectedTemplate.variables).map((variable: string) => (
                    <Badge key={variable} variant="secondary">
                      {`{{${variable}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل القالب: {selectedTemplate?.displayName}</DialogTitle>
            <DialogDescription>
              قم بتعديل محتوى القالب. استخدم {`{{variableName}}`} للمتغيرات.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="subject">الموضوع</Label>
              <Input
                id="subject"
                value={selectedTemplate?.subject || ''}
                onChange={(e) => setSelectedTemplate({ ...selectedTemplate, subject: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="htmlContent">محتوى HTML</Label>
              <Textarea
                id="htmlContent"
                rows={10}
                value={selectedTemplate?.htmlContent || ''}
                onChange={(e) => setSelectedTemplate({ ...selectedTemplate, htmlContent: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
            
            <div>
              <Label htmlFor="textContent">النص العادي</Label>
              <Textarea
                id="textContent"
                rows={6}
                value={selectedTemplate?.textContent || ''}
                onChange={(e) => setSelectedTemplate({ ...selectedTemplate, textContent: e.target.value })}
              />
            </div>
            
            <div className="border rounded-lg p-4 bg-muted">
              <h4 className="font-semibold mb-2 text-sm">المتغيرات المتاحة:</h4>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate?.variables && JSON.parse(selectedTemplate.variables).map((variable: string) => (
                  <Badge key={variable} variant="secondary" className="text-xs">
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اختبار القالب: {selectedTemplate?.displayName}</DialogTitle>
            <DialogDescription>
              أدخل البريد الإلكتروني لإرسال رسالة تجريبية
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="testEmail">البريد الإلكتروني</Label>
              <Input
                id="testEmail"
                type="email"
                placeholder="example@domain.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            
            <div className="text-sm text-muted-foreground">
              سيتم إرسال القالب مع بيانات تجريبية للمعاينة
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSendTest} disabled={testMutation.isPending}>
              {testMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
