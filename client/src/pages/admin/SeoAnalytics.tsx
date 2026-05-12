import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Download, Calendar, TrendingUp, Users, Globe, Smartphone, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const DEVICE_COLORS: Record<string, string> = {
  desktop: "#3b82f6",
  mobile: "#10b981",
  tablet: "#f59e0b",
};

export default function SeoAnalytics() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);

  const { data: config } = trpc.googleAnalytics.getConfig.useQuery();
  const enabled = !!config?.isEnabled;

  const { data: overview, isLoading: loadingOverview } =
    trpc.googleAnalytics.getOverview.useQuery({ days }, { enabled });
  const { data: sources, isLoading: loadingSources } =
    trpc.googleAnalytics.getTrafficSources.useQuery({ days }, { enabled });
  const { data: devices, isLoading: loadingDevices } =
    trpc.googleAnalytics.getDevices.useQuery({ days }, { enabled });
  const { data: countries, isLoading: loadingCountries } =
    trpc.googleAnalytics.getCountries.useQuery({ days }, { enabled });

  if (!enabled) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-semibold mb-2">{t('seoAnalytics.auto_0')}</h3>
        <p>{t('seoAnalytics.auto_1')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('seoAnalytics.auto_2')}</h1>
          <p className="text-gray-600 mt-2">{t('seoAnalytics.auto_3')}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Calendar className="w-4 h-4 text-gray-600" />
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value={7}>{t('seoAnalytics.auto_4')}</option>
            <option value={30}>{t('seoAnalytics.auto_5')}</option>
            <option value={90}>{t('seoAnalytics.auto_6')}</option>
            <option value={365}>{t('seoAnalytics.auto_7')}</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t('seoAnalytics.auto_8')}</p>
          {loadingOverview ? <Loader2 className="h-5 w-5 animate-spin mt-2" /> : (
            <p className="text-3xl font-bold mt-2">{(overview?.newUsers || 0).toLocaleString()}</p>
          )}
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t('seoAnalytics.auto_9')}</p>
          {loadingOverview ? <Loader2 className="h-5 w-5 animate-spin mt-2" /> : (
            <p className="text-3xl font-bold mt-2">{(overview?.bounceRate || 0).toFixed(1)}%</p>
          )}
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t('seoAnalytics.auto_10')}</p>
          {loadingOverview ? <Loader2 className="h-5 w-5 animate-spin mt-2" /> : (
            <p className="text-3xl font-bold mt-2">{(overview?.sessions || 0).toLocaleString()}</p>
          )}
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t('seoAnalytics.auto_11')}</p>
          {loadingOverview ? <Loader2 className="h-5 w-5 animate-spin mt-2" /> : (
            <p className="text-3xl font-bold mt-2">{(overview?.pageViews || 0).toLocaleString()}</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Sources */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t('seoAnalytics.auto_12')}</h2>
          {loadingSources ? (
            <div className="flex items-center justify-center h-[250px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-3">
              {sources.map((src: any) => {
                const total = sources.reduce((s: number, r: any) => s + r.users, 0) || 1;
                const pct = ((src.users / total) * 100).toFixed(1);
                return (
                  <div key={src.source}>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <span className="font-medium">{src.source}</span>
                      <span className="text-muted-foreground">{src.users.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">{t('seoAnalytics.auto_13')}</p>
          )}
        </Card>

        {/* Device Distribution */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t('seoAnalytics.auto_14')}</h2>
          {loadingDevices ? (
            <div className="flex items-center justify-center h-[250px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : devices && devices.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={devices}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="users"
                    nameKey="device"
                    label={({ device, percentage }) => `${device}: ${percentage}%`}
                  >
                    {devices.map((entry: any, i: number) => (
                      <Cell key={i} fill={DEVICE_COLORS[entry.device.toLowerCase()] || "#8b5cf6"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {devices.map((d: any) => (
                  <div key={d.device} className="flex items-center gap-1.5 text-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: DEVICE_COLORS[d.device.toLowerCase()] || "#8b5cf6" }}
                    />
                    <span>{d.device}</span>
                    <span className="text-muted-foreground">({d.percentage}%)</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-8">{t('seoAnalytics.auto_15')}</p>
          )}
        </Card>
      </div>

      {/* Countries */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">{t('seoAnalytics.auto_16')}</h2>
        {loadingCountries ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : countries && countries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoAnalytics.auto_17')}</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoAnalytics.auto_18')}</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoAnalytics.auto_19')}</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoAnalytics.auto_20')}</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((row: any) => {
                  const total = countries.reduce((s: number, r: any) => s + r.users, 0) || 1;
                  return (
                    <tr key={row.country} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{row.country}</td>
                      <td className="px-4 py-3">{row.users.toLocaleString()}</td>
                      <td className="px-4 py-3">{row.sessions.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="bg-green-50 dark:bg-green-950/20">
                          {((row.users / total) * 100).toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">{t('seoAnalytics.auto_21')}</p>
        )}
      </Card>
    </div>
  );
}
