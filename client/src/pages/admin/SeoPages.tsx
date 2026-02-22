import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function SeoPages() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [pages, setPages] = useState([
    {
      id: 1,
      pageSlug: "home",
      pageTitle: t('adminSeoPagesPage.text0'),
      pageDescription: t('adminSeoPagesPage.text1'),
      keywords: t('adminSeoPagesPage.text2'),
      isIndexed: true,
      isPriority: true,
    },
    {
      id: 2,
      pageSlug: "pricing",
      pageTitle: t('adminSeoPagesPage.text3'),
      pageDescription: t('adminSeoPagesPage.text4'),
      keywords: t('adminSeoPagesPage.text5'),
      isIndexed: true,
      isPriority: false,
    },
  ]);

  const filteredPages = pages.filter(
    (page) =>
      page.pageSlug.includes(searchQuery.toLowerCase()) ||
      page.pageTitle.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('adminSeoPagesPage.text6')}</h1>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          صفحة جديدة
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="p-4">
        <div className="flex gap-2">
          <Search className="w-5 h-5 text-gray-400" />
          <Input
            placeholder={t('adminSeoPagesPage.text7')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-0"
          />
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('adminSeoPagesPage.text8')}</div>
          <div className="text-2xl font-bold">{pages.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('adminSeoPagesPage.text9')}</div>
          <div className="text-2xl font-bold">{pages.filter(p => p.isIndexed).length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('adminSeoPagesPage.text10')}</div>
          <div className="text-2xl font-bold">{pages.filter(p => p.isPriority).length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-600">{t('adminSeoPagesPage.text11')}</div>
          <div className="text-2xl font-bold">75%</div>
        </Card>
      </div>

      {/* Pages Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoPagesPage.text12')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoPagesPage.text13')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoPagesPage.text14')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoPagesPage.text15')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoPagesPage.text16')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPages.map((page) => (
                <tr key={page.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{page.pageSlug}</td>
                  <td className="px-6 py-4 text-sm">{page.pageTitle}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{page.keywords}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {page.isIndexed && <Badge variant="outline" className="bg-green-50">{t('adminSeoPagesPage.text17')}</Badge>}
                      {page.isPriority && <Badge variant="outline" className="bg-blue-50">{t('adminSeoPagesPage.text18')}</Badge>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Pencil className="w-4 h-4" />
                        تعديل
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-2 text-red-600">
                        <Trash2 className="w-4 h-4" />
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
