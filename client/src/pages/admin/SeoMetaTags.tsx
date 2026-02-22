import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function SeoMetaTags() {
  const { t } = useTranslation();
  const [selectedPage, setSelectedPage] = useState("home");
  const [metaTags, setMetaTags] = useState([
    { id: 1, name: "description", content: t('adminSeoMetaTagsPage.text0') },
    { id: 2, name: "keywords", content: t('adminSeoMetaTagsPage.text1') },
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
        <h1 className="text-3xl font-bold">{t('adminSeoMetaTagsPage.text2')}</h1>
        <p className="text-gray-600 mt-2">{t('adminSeoMetaTagsPage.text3')}</p>
      </div>

      {/* Page Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium mb-3">{t('adminSeoMetaTagsPage.text4')}</label>
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
          <h2 className="text-lg font-semibold">{t('adminSeoMetaTagsPage.text5', { var0: selectedPage })}</h2>
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
                  <label className="block text-sm font-medium mb-2">{t('adminSeoMetaTagsPage.text6')}</label>
                  <Input
                    value={tag.name}
                    onChange={(e) => updateMetaTag(tag.id, "name", e.target.value)}
                    placeholder={t('adminSeoMetaTagsPage.text7')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('adminSeoMetaTagsPage.text8')}</label>
                <Textarea
                  value={tag.content}
                  onChange={(e) => updateMetaTag(tag.id, "content", e.target.value)}
                  placeholder={t('adminSeoMetaTagsPage.text9')}
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
        <h2 className="text-lg font-semibold mb-4">{t('adminSeoMetaTagsPage.text10')}</h2>
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <p className="text-blue-600 text-lg font-semibold">{t('adminSeoMetaTagsPage.text11')}</p>
          <p className="text-gray-600">{t('adminSeoMetaTagsPage.text12')}</p>
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
