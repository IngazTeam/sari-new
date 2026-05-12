import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SeoMetaTags() {
  const { t } = useTranslation();
  const { data: pages } = trpc.seo.getPages.useQuery();
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);

  const activePageId = selectedPageId || (pages?.[0]?.id ?? null);

  const { data: metaTags, isLoading, refetch } = trpc.seo.getMetaTags.useQuery(
    { pageId: activePageId! },
    { enabled: !!activePageId }
  );

  const createMutation = trpc.seo.createMetaTag.useMutation({
    onSuccess: () => { toast.success("تمت الإضافة ✅"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");

  const handleAdd = () => {
    if (!activePageId || !newName.trim()) return;
    createMutation.mutate({ pageId: activePageId, metaName: newName, metaContent: newContent });
    setNewName("");
    setNewContent("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Meta Tags</h1>
        <p className="text-muted-foreground mt-2">{t('seoMetaTags.auto_0')}</p>
      </div>

      {/* Page Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium mb-3">{t('seoMetaTags.auto_1')}</label>
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
            <p className="text-muted-foreground">{t('seoMetaTags.auto_2')}</p>
          )}
        </div>
      </Card>

      {activePageId && (
        <>
          {/* Existing Meta Tags */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">{t('seoMetaTags.auto_3')}</h2>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (metaTags || []).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t('seoMetaTags.auto_4')}</p>
            ) : (
              <div className="space-y-3">
                {(metaTags || []).map((tag: any) => (
                  <div key={tag.id} className="p-3 border rounded-lg flex justify-between items-start">
                    <div>
                      <span className="font-mono text-sm font-medium">{tag.metaName}</span>
                      <p className="text-sm text-muted-foreground mt-1">{tag.metaContent}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Add New */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">{t('seoMetaTags.auto_5')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('seoMetaTags.auto_6')}</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="description, keywords, author..." dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('seoMetaTags.auto_7')}</label>
                <Input value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder={t('seoMetaTags.auto_8')} />
              </div>
            </div>
            <Button onClick={handleAdd} disabled={createMutation.isPending || !newName.trim()} className="gap-2">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              إضافة
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
