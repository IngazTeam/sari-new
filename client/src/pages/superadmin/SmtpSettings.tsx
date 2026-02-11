import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail, Send, CheckCircle2, AlertCircle, Server } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function SmtpSettings() {
  const [testEmail, setTestEmail] = useState("");
  const [smtpProvider, setSmtpProvider] = useState<string>("custom");

  const { data: settings, isLoading, refetch } = trpc.smtp.getSettings.useQuery();
  const updateSettings = trpc.smtp.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات SMTP بنجاح");
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل حفظ الإعدادات: ${error.message}`);
    },
  });

  const testConnection = trpc.smtp.testConnection.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال البريد التجريبي بنجاح! تحقق من صندوق الوارد.");
    },
    onError: (error) => {
      toast.error(`فشل إرسال البريد: ${error.message}`);
    },
  });

  const { data: emailLogs } = trpc.smtp.getEmailLogs.useQuery(
    { limit: 50 },
    { refetchInterval: 10000 }
  );

  const { data: stats } = trpc.smtp.getStats.useQuery();

  const [formData, setFormData] = useState({
    host: "",
    port: 587,
    username: "",
    password: "",
    fromEmail: "",
    fromName: "ساري",
  });

  // Sync form data when settings load from the server
  useEffect(() => {
    if (settings) {
      setFormData((prev) => ({
        host: settings.host || prev.host,
        port: settings.port || prev.port,
        username: settings.username || prev.username,
        password: "", // Never pre-fill password
        fromEmail: settings.fromEmail || prev.fromEmail,
        fromName: settings.fromName || prev.fromName,
      }));
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(formData);
  };

  const handleTestEmail = () => {
    if (!testEmail) {
      toast.error("الرجاء إدخال عنوان البريد الإلكتروني");
      return;
    }
    testConnection.mutate({ email: testEmail });
  };

  const handleProviderChange = (provider: string) => {
    setSmtpProvider(provider);

    // Pre-fill settings based on provider
    const presets: Record<string, { host: string; port: number }> = {
      smtp2go: { host: "mail.smtp2go.com", port: 2525 },
      gmail: { host: "smtp.gmail.com", port: 587 },
      sendgrid: { host: "smtp.sendgrid.net", port: 587 },
      aws: { host: "email-smtp.us-east-1.amazonaws.com", port: 587 },
    };

    if (presets[provider]) {
      setFormData((prev) => ({
        ...prev,
        host: presets[provider].host,
        port: presets[provider].port,
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Server className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">إعدادات SMTP</h1>
          <p className="text-muted-foreground">إدارة خادم البريد الإلكتروني واختبار الإرسال</p>
        </div>
      </div>

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings">الإعدادات</TabsTrigger>
          <TabsTrigger value="test">اختبار الإرسال</TabsTrigger>
          <TabsTrigger value="logs">سجل الرسائل</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          {/* Statistics Cards */}
          {stats && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">إجمالي الرسائل</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalEmails}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">تم الإرسال</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.sentEmails}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.totalEmails > 0 ? Math.round((stats.sentEmails / stats.totalEmails) * 100) : 0}% معدل النجاح
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">فشل</CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{stats.failedEmails}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">معلق</CardTitle>
                  <Loader2 className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{stats.pendingEmails}</div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>إعدادات خادم SMTP</CardTitle>
              <CardDescription>قم بتكوين خادم البريد الإلكتروني الخاص بك</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">مزود الخدمة</Label>
                  <Select value={smtpProvider} onValueChange={handleProviderChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر مزود الخدمة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smtp2go">SMTP2GO</SelectItem>
                      <SelectItem value="gmail">Gmail</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="aws">AWS SES</SelectItem>
                      <SelectItem value="custom">مخصص</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="host">عنوان الخادم (Host)</Label>
                    <Input
                      id="host"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      placeholder="smtp.example.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="port">المنفذ (Port)</Label>
                    <Input
                      id="port"
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      placeholder="587"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="username">اسم المستخدم</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="user@example.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">كلمة المرور</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="اتركه فارغاً لعدم التغيير"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">البريد الإلكتروني للمرسل</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      value={formData.fromEmail}
                      onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                      placeholder="noreply@example.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fromName">اسم المرسل</Label>
                    <Input
                      id="fromName"
                      value={formData.fromName}
                      onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                      placeholder="ساري"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" disabled={updateSettings.isPending} className="w-full">
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  حفظ الإعدادات
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <Card>
            <CardHeader>
              <CardTitle>اختبار إرسال البريد الإلكتروني</CardTitle>
              <CardDescription>أرسل بريداً تجريبياً للتحقق من صحة الإعدادات</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testEmail">عنوان البريد الإلكتروني</Label>
                <Input
                  id="testEmail"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                />
              </div>

              <Button
                onClick={handleTestEmail}
                disabled={testConnection.isPending || !testEmail}
                className="w-full"
              >
                {testConnection.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    جاري الإرسال...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    إرسال بريد تجريبي
                  </>
                )}
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <h4 className="font-medium mb-2">محتوى البريد التجريبي:</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• الموضوع: اختبار SMTP - ساري</li>
                  <li>• المحتوى: رسالة تجريبية للتحقق من إعدادات SMTP</li>
                  <li>• التاريخ والوقت: {new Date().toLocaleString("ar-SA")}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>سجل الرسائل المرسلة</CardTitle>
              <CardDescription>آخر 50 رسالة بريد إلكتروني</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {emailLogs && emailLogs.length > 0 ? (
                  emailLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.subject}</span>
                          <Badge
                            variant={
                              log.status === "sent"
                                ? "default"
                                : log.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {log.status === "sent" ? "تم الإرسال" : log.status === "failed" ? "فشل" : "معلق"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          إلى: {log.toEmail} • {new Date(log.createdAt).toLocaleString("ar-SA")}
                        </div>
                        {log.error && (
                          <div className="text-sm text-red-600 mt-1">خطأ: {log.error}</div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>لا توجد رسائل مسجلة</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
