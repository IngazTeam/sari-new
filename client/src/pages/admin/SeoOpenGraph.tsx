import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Save, Upload } from "lucide-react";

export default function SeoOpenGraph() {
  const [selectedPage, setSelectedPage] = useState("home");
  const [ogData, setOgData] = useState({
    title: "ساري - وكيل مبيعات ذكي للواتساب",
    description: "منصة ساري تساعدك في إدارة مبيعاتك عبر الواتساب بذكاء اصطناعي",
    image: "/og-image.jpg",
    type: "website",
    url: "https://sari.app",
  });

  const pages = ["home", "pricing", "features", "blog"];

  const handleChange = (field: string, value: string) => {
    setOgData({ ...ogData, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">محرر Open Graph</h1>
        <p className="text-gray-600 mt-2">أدر كيفية ظهور صفحاتك على وسائل التواصل الاجتماعي</p>
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

      <div className="grid grid-cols-3 gap-6">
        {/* Editor */}
        <div className="col-span-2 space-y-4">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-6">بيانات Open Graph</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">العنوان</label>
                <Input
                  value={ogData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="أدخل عنوان Open Graph"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">الوصف</label>
                <Textarea
                  value={ogData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="أدخل وصف Open Graph"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">رابط الصورة</label>
                <Input
                  value={ogData.image}
                  onChange={(e) => handleChange("image", e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">النوع</label>
                  <select
                    value={ogData.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="website">موقع ويب</option>
                    <option value="article">مقالة</option>
                    <option value="video">فيديو</option>
                    <option value="image">صورة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">الرابط</label>
                  <Input
                    value={ogData.url}
                    onChange={(e) => handleChange("url", e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
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

        {/* Preview */}
        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">معاينة Facebook</h2>
            <div className="border rounded-lg overflow-hidden">
              <img
                src={ogData.image}
                alt="OG Preview"
                className="w-full h-40 object-cover bg-gray-200"
              />
              <div className="p-3 bg-white">
                <p className="text-blue-600 text-xs font-semibold">SARI.APP</p>
                <p className="font-semibold text-sm mt-1">{ogData.title}</p>
                <p className="text-gray-600 text-xs mt-1">{ogData.description.substring(0, 60)}...</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">معاينة Twitter</h2>
            <div className="border rounded-lg overflow-hidden bg-gray-50">
              <img
                src={ogData.image}
                alt="Twitter Preview"
                className="w-full h-40 object-cover bg-gray-200"
              />
              <div className="p-3">
                <p className="font-semibold text-sm">{ogData.title}</p>
                <p className="text-gray-600 text-xs mt-1">{ogData.description.substring(0, 60)}...</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
