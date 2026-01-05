import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SeoDashboard from "./SeoDashboard";
import SeoPages from "./SeoPages";
import SeoMetaTags from "./SeoMetaTags";
import SeoOpenGraph from "./SeoOpenGraph";
import SeoTracking from "./SeoTracking";
import SeoAnalytics from "./SeoAnalytics";
import SeoKeywords from "./SeoKeywords";
import SeoBacklinks from "./SeoBacklinks";
import {
  BarChart3,
  FileText,
  Tag,
  Share2,
  Code,
  TrendingUp,
  Key,
  Link2,
} from "lucide-react";

export default function SeoUnified() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="container py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">إدارة SEO</h1>
        <p className="text-muted-foreground">
          إدارة شاملة لتحسين محركات البحث (SEO) لموقعك
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 gap-2">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">لوحة التحكم</span>
          </TabsTrigger>
          <TabsTrigger value="pages" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">الصفحات</span>
          </TabsTrigger>
          <TabsTrigger value="meta-tags" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">Meta Tags</span>
          </TabsTrigger>
          <TabsTrigger value="open-graph" className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Open Graph</span>
          </TabsTrigger>
          <TabsTrigger value="tracking" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">رموز التتبع</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">الإحصائيات</span>
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">الكلمات المفتاحية</span>
          </TabsTrigger>
          <TabsTrigger value="backlinks" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">الروابط الخارجية</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <SeoDashboard />
        </TabsContent>

        <TabsContent value="pages" className="space-y-4">
          <SeoPages />
        </TabsContent>

        <TabsContent value="meta-tags" className="space-y-4">
          <SeoMetaTags />
        </TabsContent>

        <TabsContent value="open-graph" className="space-y-4">
          <SeoOpenGraph />
        </TabsContent>

        <TabsContent value="tracking" className="space-y-4">
          <SeoTracking />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <SeoAnalytics />
        </TabsContent>

        <TabsContent value="keywords" className="space-y-4">
          <SeoKeywords />
        </TabsContent>

        <TabsContent value="backlinks" className="space-y-4">
          <SeoBacklinks />
        </TabsContent>
      </Tabs>
    </div>
  );
}
