import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Link2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function SeoBacklinks() {
  const { t } = useTranslation();
  const { data: pages } = trpc.seo.getPages.useQuery();
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);

  const activePageId = selectedPageId || (pages?.[0]?.id ?? null);

  const { data: backlinks, isLoading } = trpc.seo.getBacklinks.useQuery(
    { pageId: activePageId! },
    { enabled: !!activePageId }
  );

  const activeLinks = (backlinks || []).filter((b: any) => b.status === "active");
  const brokenLinks = (backlinks || []).filter((b: any) => b.status === "broken");
  const avgDA = backlinks?.length
    ? Math.round((backlinks as any[]).reduce((s, b) => s + (b.domainAuthority || 0), 0) / backlinks.length)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('seoBacklinks.auto_0')}</h1>
        <p className="text-muted-foreground mt-2">{t('seoBacklinks.auto_1')}</p>
      </div>

      {/* Page Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium mb-3">{t('seoBacklinks.auto_2')}</label>
        <div className="flex gap-2 flex-wrap">
          {(pages || []).map((page: any) => (
            <Button
              key={page.id}
              variant={activePageId === page.id ? "default" : "outline"}
              onClick={() => setSelectedPageId(page.id)}
            >
              {page.pageSlug}
            </Button>
          ))}
          {(!pages || pages.length === 0) && (
            <p className="text-muted-foreground">{t('seoBacklinks.auto_3')}</p>
          )}
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('seoBacklinks.auto_4')}</p>
          <p className="text-3xl font-bold mt-2">{backlinks?.length || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('seoBacklinks.auto_5')}</p>
          <p className="text-3xl font-bold mt-2 text-green-600">{activeLinks.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('seoBacklinks.auto_6')}</p>
          <p className="text-3xl font-bold mt-2">{avgDA}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('seoBacklinks.auto_7')}</p>
          <p className="text-3xl font-bold mt-2 text-red-600">{brokenLinks.length}</p>
        </Card>
      </div>

      {/* Backlinks Table */}
      {activePageId && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t('seoBacklinks.auto_8')}</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (backlinks || []).length === 0 ? (
            <div className="text-center py-12">
              <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">{t('seoBacklinks.auto_9')}</h3>
              <p className="text-muted-foreground">{t('seoBacklinks.auto_10')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoBacklinks.auto_11')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoBacklinks.auto_12')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">DA</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoBacklinks.auto_13')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(backlinks || []).map((bl: any) => (
                    <tr key={bl.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-sm" dir="ltr">{bl.sourceDomain || bl.sourceUrl}</td>
                      <td className="px-4 py-3 text-sm">{bl.anchorText || "—"}</td>
                      <td className="px-4 py-3">{bl.domainAuthority || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={bl.status === "active" ? "default" : "destructive"}>
                          {bl.status === "active" ? "نشط" : "معطل"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
