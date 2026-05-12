import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function SeoKeywords() {
  const { t } = useTranslation();
  const { data: pages } = trpc.seo.getPages.useQuery();
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);

  const activePageId = selectedPageId || (pages?.[0]?.id ?? null);

  const { data: keywords, isLoading } = trpc.seo.getKeywords.useQuery(
    { pageId: activePageId! },
    { enabled: !!activePageId }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('seoKeywords.auto_0')}</h1>
        <p className="text-muted-foreground mt-2">{t('seoKeywords.auto_1')}</p>
      </div>

      {/* Page Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium mb-3">{t('seoKeywords.auto_2')}</label>
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
            <p className="text-muted-foreground">{t('seoKeywords.auto_3')}</p>
          )}
        </div>
      </Card>

      {/* Keywords Table */}
      {activePageId && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t('seoKeywords.auto_4')}</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (keywords || []).length === 0 ? (
            <div className="text-center py-12">
              <Key className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">{t('seoKeywords.auto_5')}</h3>
              <p className="text-muted-foreground">{t('seoKeywords.auto_6')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoKeywords.auto_7')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoKeywords.auto_8')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoKeywords.auto_9')}</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">{t('seoKeywords.auto_10')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(keywords || []).map((kw: any) => (
                    <tr key={kw.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{kw.keyword}</td>
                      <td className="px-4 py-3">
                        <Badge variant={kw.currentRank <= 10 ? "default" : "outline"}>
                          #{kw.currentRank || "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{kw.searchVolume?.toLocaleString() || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={
                          kw.competition === 'high' ? 'bg-red-50' :
                          kw.competition === 'medium' ? 'bg-yellow-50' : 'bg-green-50'
                        }>
                          {kw.competition || "—"}
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
