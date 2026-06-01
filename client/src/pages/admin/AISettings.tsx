import { useTranslation } from 'react-i18next';
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Key, Zap, BarChart3, TrendingUp, Clock, Users, CheckCircle,
  AlertCircle, Loader2, Eye, EyeOff, RefreshCw, Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AISettings() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");

  // Queries
  const { data: settings, refetch: refetchSettings } = trpc.aiSettings.getSettings.useQuery();
  const { data: monthStats } = trpc.aiSettings.getUsageStats.useQuery({ period: "month" });
  const { data: todayStats } = trpc.aiSettings.getUsageStats.useQuery({ period: "today" });
  const { data: dailyUsage } = trpc.aiSettings.getDailyUsage.useQuery({ days: 30 });
  const { data: topMerchants } = trpc.aiSettings.getTopMerchants.useQuery();
  const { data: recentLogs } = trpc.aiSettings.getRecentLogs.useQuery({ limit: 20 });

  // Sync model from server settings
  useEffect(() => {
    if (settings?.model) {
      setSelectedModel(settings.model);
    }
  }, [settings?.model]);

  // Mutations
  const updateMutation = trpc.aiSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("�� ��� ��������� ����� ?");
      refetchSettings();
      setApiKey("");
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.aiSettings.testConnection.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(data.message || "�� ������� �����!");
      } else {
        toast.error(data.error || "��� �������");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSaveSettings = () => {
    const data: Record<string, any> = { model: selectedModel };
    if (apiKey.trim()) data.openaiApiKey = apiKey.trim();
    updateMutation.mutate(data);
  };

  const formatCost = (cost: string | number) => {
    const num = typeof cost === "string" ? parseFloat(cost) : cost;
    return `$${num.toFixed(4)}`;
  };

  const formatNumber = (n: number) => n?.toLocaleString("ar-SA") || "0";

  // Chart: simple bar visualization
  const maxTokens = dailyUsage ? Math.max(...dailyUsage.map((d: any) => d.tokens || 0), 1) : 1;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <Zap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('aISettings.auto_0')}</h1>
          <p className="text-sm text-muted-foreground">{t('aISettings.auto_1')}</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span>{t('aISettings.auto_2')}</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(todayStats?.totalRequests || 0)}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" />
              <span>{t('aISettings.auto_3')}</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(monthStats?.totalRequests || 0)}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span>{t('aISettings.auto_4')}</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(monthStats?.totalTokens || 0)}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span>{t('aISettings.auto_5')}</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{formatCost(monthStats?.totalCost || "0")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Key Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />{t('aISettings.auto_6')}</CardTitle>
            <CardDescription>{t('aISettings.auto_7')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Status */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              {settings?.hasKey ? (
                <>
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium">{t('aISettings.auto_8')}</p>
                    <p className="text-xs text-muted-foreground font-mono">{settings.openaiApiKey}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-amber-600">{t('aISettings.auto_9')}</p>
                    <p className="text-xs text-muted-foreground">{t('aISettings.auto_10')}</p>
                  </div>
                </>
              )}
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <Label htmlFor="api-key">{t('aISettings.auto_11')}</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="pr-10 font-mono text-sm"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label>{t('aISettings.auto_12')}</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">{t('aISettings.auto_13')}</SelectItem>
                  <SelectItem value="gpt-4o">{t('aISettings.auto_14')}</SelectItem>
                  <SelectItem value="gpt-4-turbo">{t('aISettings.auto_15')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleSaveSettings}
                disabled={updateMutation.isPending}
                className="flex-1"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : null}
                ��� ���������
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // AI-01 FIX: For new key, pass it; for existing, let server use stored key
                  const newKey = apiKey.trim();
                  if (newKey) {
                    testMutation.mutate({ apiKey: newKey });
                  } else if (settings?.hasKey) {
                    testMutation.mutate({}); // Server uses stored key
                  } else {
                    toast.error("���� ����� API �����");
                  }
                }}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 ml-2" />
                )}
                ������ �������
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Usage Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />{t('aISettings.auto_16')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Chat vs Whisper */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{t('aISettings.auto_17')}</span>
                <Badge variant="secondary">{formatNumber(monthStats?.chatRequests || 0)} ���</Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all"
                  style={{
                    width: `${monthStats?.totalRequests
                      ? ((monthStats.chatRequests || 0) / monthStats.totalRequests * 100)
                      : 0}%`,
                  }}
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{t('aISettings.auto_18')}</span>
                <Badge variant="secondary">{formatNumber(monthStats?.whisperRequests || 0)} ���</Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-all"
                  style={{
                    width: `${monthStats?.totalRequests
                      ? ((monthStats.whisperRequests || 0) / monthStats.totalRequests * 100)
                      : 0}%`,
                  }}
                />
              </div>
            </div>

            <hr className="my-2" />

            {/* Detail stats */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Prompt Tokens</p>
                <p className="font-semibold">{formatNumber(monthStats?.totalPromptTokens || 0)}</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Completion Tokens</p>
                <p className="font-semibold">{formatNumber(monthStats?.totalCompletionTokens || 0)}</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">{t('aISettings.auto_19')}</p>
                <p className="font-semibold">{Math.round((monthStats?.totalAudioDuration || 0) / 60)} �����</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">{t('aISettings.auto_20')}</p>
                <p className="font-semibold">{Math.round(monthStats?.avgDurationMs || 0)} ms</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />{t('aISettings.auto_21')}</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyUsage && dailyUsage.length > 0 ? (
            <div className="flex items-end gap-1 h-40">
              {dailyUsage.map((day: any, i: number) => (
                <div
                  key={i}
                  className="flex-1 group relative"
                >
                  <div
                    className="w-full bg-emerald-500/80 hover:bg-emerald-500 rounded-t transition-all cursor-pointer"
                    style={{
                      height: `${Math.max(4, (day.tokens / maxTokens) * 100)}%`,
                    }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-2 text-xs whitespace-nowrap">
                      <p className="font-medium">{day.date}</p>
                      <p>{formatNumber(day.requests)} ���</p>
                      <p>{formatNumber(day.tokens)} token</p>
                      <p>{formatCost(day.cost)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p>{t('aISettings.auto_22')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Merchants */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />{t('aISettings.auto_23')}</CardTitle>
          </CardHeader>
          <CardContent>
            {topMerchants && topMerchants.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('aISettings.auto_24')}</TableHead>
                    <TableHead>{t('aISettings.auto_25')}</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>{t('aISettings.auto_26')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topMerchants.map((m: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">#{m.merchantId}</TableCell>
                      <TableCell>{formatNumber(m.requests)}</TableCell>
                      <TableCell>{formatNumber(m.totalTokens)}</TableCell>
                      <TableCell className="text-amber-600">{formatCost(m.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-4">{t('aISettings.auto_27')}</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />{t('aISettings.auto_28')}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs && recentLogs.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('aISettings.auto_29')}</TableHead>
                      <TableHead>{t('aISettings.auto_30')}</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>{t('aISettings.auto_31')}</TableHead>
                      <TableHead>{t('aISettings.auto_32')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant={log.requestType === "chat" ? "default" : "secondary"}>
                            {log.requestType === "chat" ? "??" : "??"} {log.requestType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.model}</TableCell>
                        <TableCell>{formatNumber(log.totalTokens)}</TableCell>
                        <TableCell className="text-amber-600">{formatCost(log.estimatedCost || "0")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.durationMs ? `${log.durationMs}ms` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">{t('aISettings.auto_33')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
