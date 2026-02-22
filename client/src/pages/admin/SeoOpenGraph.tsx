import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Save, Upload } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function SeoOpenGraph() {
  const { t } = useTranslation();
  const [selectedPage, setSelectedPage] = useState("home");
  const [ogData, setOgData] = useState({
    title: t('adminSeoOpenGraphPage.text0'),
    description: t('adminSeoOpenGraphPage.text1'),
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
        <h1 className="text-3xl font-bold">{t('adminSeoOpenGraphPage.text2')}</h1>
        <p className="text-gray-600 mt-2">{t('adminSeoOpenGraphPage.text3')}</p>
      </div>

      {/* Page Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium mb-3">{t('adminSeoOpenGraphPage.text4')}</label>
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
            <h2 className="text-lg font-semibold mb-6">{t('adminSeoOpenGraphPage.text5')}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('adminSeoOpenGraphPage.text6')}</label>
                <Input
                  value={ogData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder={t('adminSeoOpenGraphPage.text7')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('adminSeoOpenGraphPage.text8')}</label>
                <Textarea
                  value={ogData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder={t('adminSeoOpenGraphPage.text9')}
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('adminSeoOpenGraphPage.text10')}</label>
                <Input
                  value={ogData.image}
                  onChange={(e) => handleChange("image", e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('adminSeoOpenGraphPage.text11')}</label>
                  <select
                    value={ogData.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="website">{t('adminSeoOpenGraphPage.text12')}</option>
                    <option value="article">{t('adminSeoOpenGraphPage.text13')}</option>
                    <option value="video">{t('adminSeoOpenGraphPage.text14')}</option>
                    <option value="image">{t('adminSeoOpenGraphPage.text15')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t('adminSeoOpenGraphPage.text16')}</label>
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
            <h2 className="text-lg font-semibold mb-4">{t('adminSeoOpenGraphPage.text17')}</h2>
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
            <h2 className="text-lg font-semibold mb-4">{t('adminSeoOpenGraphPage.text18')}</h2>
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
