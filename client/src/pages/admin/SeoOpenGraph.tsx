import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SeoOpenGraph() {
  const { data: pages } = trpc.seo.getPages.useQuery();
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);

  const activePageId = selectedPageId || (pages?.[0]?.id ?? null);

  const { data: ogData, isLoading } = trpc.seo.getOpenGraph.useQuery(
    { pageId: activePageId! },
    { enabled: !!activePageId }
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [ogType, setOgType] = useState("website");

  const createMutation = trpc.seo.createOpenGraph.useMutation({
    onSuccess: () => toast.success("تم الحفظ ✅"),
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!activePageId) return;
    createMutation.mutate({
      pageId: activePageId,
      ogTitle: title,
      ogDescription: description,
      ogImage: image || undefined,
      ogType: ogType || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Open Graph</h1>
        <p className="text-muted-foreground mt-2">إعدادات المشاركة على وسائل التواصل الاجتماعي</p>
      </div>

      {/* Page Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium mb-3">اختر الصفحة</label>
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
            <p className="text-muted-foreground">لا توجد صفحات</p>
          )}
        </div>
      </Card>

      {/* Existing OG Data */}
      {activePageId && ogData && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">البيانات الحالية</h2>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">العنوان:</span> {ogData.ogTitle || "—"}</div>
              <div><span className="text-muted-foreground">الوصف:</span> {ogData.ogDescription || "—"}</div>
              <div><span className="text-muted-foreground">الصورة:</span> {ogData.ogImage || "—"}</div>
              <div><span className="text-muted-foreground">النوع:</span> {ogData.ogType || "—"}</div>
            </div>
          )}
        </Card>
      )}

      {/* Add/Update Form */}
      {activePageId && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">إضافة / تحديث Open Graph</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">og:title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المشاركة" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">og:type</label>
              <select value={ogType} onChange={(e) => setOgType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="website">website</option>
                <option value="article">article</option>
                <option value="product">product</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">og:description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المشاركة" rows={3} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">og:image (URL)</label>
            <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." dir="ltr" />
          </div>
          <Button onClick={handleSave} disabled={createMutation.isPending || !title.trim()} className="gap-2">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ
          </Button>
        </Card>
      )}
    </div>
  );
}
