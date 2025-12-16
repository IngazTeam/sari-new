import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save } from "lucide-react";

export default function SeoMetaTags() {
  const [selectedPage, setSelectedPage] = useState("home");
  const [metaTags, setMetaTags] = useState([
    { id: 1, name: "description", content: "منصة ساري تساعدك في إدارة مبيعاتك عبر الواتساب بذكاء اصطناعي" },
    { id: 2, name: "keywords", content: "واتساب، مبيعات، ذكاء اصطناعي، تسويق" },
    { id: 3, name: "author", content: "Sari Team" },
  ]);

  const pages = ["home", "pricing", "features", "blog"];

  const addMetaTag = () => {
    setMetaTags([...metaTags, { id: Date.now(), name: "", content: "" }]);
  };

  const updateMetaTag = (id: number, field: string, value: string) => {
    setMetaTags(metaTags.map(tag => 
      tag.id === id ? { ...tag, [field]: value } : tag
    ));
  };

  const deleteMetaTag = (id: number) => {
    setMetaTags(metaTags.filter(tag => tag.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">محرر Meta Tags</h1>
        <p className="text-gray-600 mt-2">أدر علامات Meta الخاصة بصفحاتك</p>
      </div>

      {/* Page Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium mb-3">اختر الصفحة</label>
        <div className="flex gap-2 flex-wrap">
          {pages.map(page => (
            <Button
              key={page}
              variant={selectedPage === page ? "default" : "outline"}
              onClick={() => setSelectedPage(page)}
              className="capitalize"
            >
              {page}
            </Button>
          ))}
        </div>
      </Card>

      {/* Meta Tags Editor */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Meta Tags للصفحة: {selectedPage}</h2>
          <Button onClick={addMetaTag} className="gap-2">
            <Plus className="w-4 h-4" />
            إضافة Meta Tag
          </Button>
        </div>

        <div className="space-y-4">
          {metaTags.map(tag => (
            <div key={tag.id} className="p-4 border rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">الاسم</label>
                  <Input
                    value={tag.name}
                    onChange={(e) => updateMetaTag(tag.id, "name", e.target.value)}
                    placeholder="مثال: description"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">المحتوى</label>
                <Textarea
                  value={tag.content}
                  onChange={(e) => updateMetaTag(tag.id, "content", e.target.value)}
                  placeholder="أدخل محتوى Meta Tag"
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMetaTag(tag.id)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Preview */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">معاينة</h2>
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <p className="text-blue-600 text-lg font-semibold">ساري - وكيل مبيعات ذكي</p>
          <p className="text-gray-600">منصة ساري تساعدك في إدارة مبيعاتك عبر الواتساب بذكاء اصطناعي</p>
          <p className="text-gray-500 text-sm">https://sari.app</p>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="lg" className="gap-2">
          <Save className="w-4 h-4" />
          حفظ التغييرات
        </Button>
      </div>
    </div>
  );
}
