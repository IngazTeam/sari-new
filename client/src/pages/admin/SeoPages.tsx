import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Search, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SeoPages() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: pages, isLoading, refetch } = trpc.seo.getPages.useQuery();

  const createMutation = trpc.seo.createPage.useMutation({
    onSuccess: () => { toast.success("تمت الإضافة ✅"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const filteredPages = (pages || []).filter(
    (page: any) =>
      page.pageSlug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.pageTitle?.includes(searchQuery)
  );

  const indexed = (pages || []).filter((p: any) => p.isIndexed).length;
  const priority = (pages || []).filter((p: any) => p.isPriority).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">إدارة الصفحات</h1>
        <Button
          className="gap-2"
          onClick={() => createMutation.mutate({
            pageSlug: `page-${Date.now()}`,
            pageTitle: "صفحة جديدة",
            pageDescription: "",
          })}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          صفحة جديدة
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex gap-2">
          <Search className="w-5 h-5 text-gray-400" />
          <Input
            placeholder="بحث بالاسم أو الرابط..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-0"
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">إجمالي الصفحات</div>
          <div className="text-2xl font-bold">{pages?.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">مؤرشفة</div>
          <div className="text-2xl font-bold">{indexed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">ذات أولوية</div>
          <div className="text-2xl font-bold">{priority}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">التغطية</div>
          <div className="text-2xl font-bold">
            {pages?.length ? Math.round((indexed / pages.length) * 100) : 0}%
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPages.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">لا توجد صفحات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-3 text-right text-sm font-semibold">الرابط</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold">العنوان</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold">الكلمات المفتاحية</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredPages.map((page: any) => (
                  <tr key={page.id} className="border-b hover:bg-muted/30">
                    <td className="px-6 py-4 font-mono text-sm" dir="ltr">{page.pageSlug}</td>
                    <td className="px-6 py-4 text-sm">{page.pageTitle}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{page.keywords || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {page.isIndexed ? <Badge variant="outline" className="bg-green-50">مؤرشفة</Badge> : null}
                        {page.isPriority ? <Badge variant="outline" className="bg-blue-50">أولوية</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
