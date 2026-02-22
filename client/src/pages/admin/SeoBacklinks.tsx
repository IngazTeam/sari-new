import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ExternalLink, Trash2, Search, Filter } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function SeoBacklinks() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [backlinks, setBacklinks] = useState([
    {
      id: 1,
      sourceUrl: "https://techblog.com/ai-sales-tools",
      sourceDomain: "techblog.com",
      anchorText: t('adminSeoBacklinksPage.text0'),
      domainAuthority: 72,
      spamScore: 2,
      status: "active",
      dateAdded: "2024-01-15",
    },
    {
      id: 2,
      sourceUrl: "https://businessnews.ae/sari-review",
      sourceDomain: "businessnews.ae",
      anchorText: t('adminSeoBacklinksPage.text1'),
      domainAuthority: 68,
      spamScore: 1,
      status: "active",
      dateAdded: "2024-01-10",
    },
    {
      id: 3,
      sourceUrl: "https://startup-directory.com/sari",
      sourceDomain: "startup-directory.com",
      anchorText: t('adminSeoBacklinksPage.text2'),
      domainAuthority: 45,
      spamScore: 5,
      status: "active",
      dateAdded: "2024-01-08",
    },
    {
      id: 4,
      sourceUrl: "https://oldsite.com/broken-link",
      sourceDomain: "oldsite.com",
      anchorText: t('adminSeoBacklinksPage.text3'),
      domainAuthority: 32,
      spamScore: 15,
      status: "broken",
      dateAdded: "2023-12-20",
    },
    {
      id: 5,
      sourceUrl: "https://arabictech.com/whatsapp-tools",
      sourceDomain: "arabictech.com",
      anchorText: t('adminSeoBacklinksPage.text4'),
      domainAuthority: 55,
      spamScore: 3,
      status: "active",
      dateAdded: "2024-01-05",
    },
  ]);

  const filteredBacklinks = backlinks.filter(bl => {
    const matchesSearch = bl.sourceDomain.includes(searchQuery.toLowerCase()) ||
                         bl.anchorText.includes(searchQuery);
    const matchesStatus = filterStatus === "all" || bl.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const deleteBacklink = (id: number) => {
    setBacklinks(backlinks.filter(bl => bl.id !== id));
  };

  const getDAColor = (da: number) => {
    if (da >= 60) return "bg-green-50 text-green-700";
    if (da >= 40) return "bg-blue-50 text-blue-700";
    return "bg-yellow-50 text-yellow-700";
  };

  const getSpamColor = (score: number) => {
    if (score <= 3) return "text-green-600";
    if (score <= 10) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('adminSeoBacklinksPage.text5')}</h1>
        <p className="text-gray-600 mt-2">{t('adminSeoBacklinksPage.text6')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <p className="text-sm text-gray-600">{t('adminSeoBacklinksPage.text7')}</p>
          <p className="text-3xl font-bold mt-2">{backlinks.length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-gray-600">{t('adminSeoBacklinksPage.text8')}</p>
          <p className="text-3xl font-bold mt-2">{backlinks.filter(b => b.status === "active").length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-gray-600">{t('adminSeoBacklinksPage.text9')}</p>
          <p className="text-3xl font-bold mt-2">
            {Math.round(backlinks.reduce((sum, b) => sum + b.domainAuthority, 0) / backlinks.length)}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-gray-600">{t('adminSeoBacklinksPage.text10')}</p>
          <p className="text-3xl font-bold mt-2 text-red-600">
            {backlinks.filter(b => b.status === "broken").length}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-gray-600" />
          <Input
            placeholder={t('adminSeoBacklinksPage.text11')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-0"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="all">{t('adminSeoBacklinksPage.text12')}</option>
            <option value="active">{t('adminSeoBacklinksPage.text13')}</option>
            <option value="broken">{t('adminSeoBacklinksPage.text14')}</option>
          </select>
        </div>
      </Card>

      {/* Backlinks Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoBacklinksPage.text15')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoBacklinksPage.text16')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">DA</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoBacklinksPage.text17')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoBacklinksPage.text18')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoBacklinksPage.text19')}</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">{t('adminSeoBacklinksPage.text20')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredBacklinks.map((bl) => (
                <tr key={bl.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <a
                      href={bl.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-2"
                    >
                      {bl.sourceDomain}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm">{bl.anchorText}</td>
                  <td className="px-6 py-4">
                    <Badge className={getDAColor(bl.domainAuthority)}>
                      DA {bl.domainAuthority}
                    </Badge>
                  </td>
                  <td className={`px-6 py-4 font-semibold ${getSpamColor(bl.spamScore)}`}>
                    {bl.spamScore}%
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={bl.status === "active" ? "default" : "destructive"}>
                      {bl.status === "active" ? t('adminSeoBacklinksPage.text21') : t('adminSeoBacklinksPage.text22')}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{bl.dateAdded}</td>
                  <td className="px-6 py-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteBacklink(bl.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Referring Domains */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">{t('adminSeoBacklinksPage.text23')}</h2>
        <div className="space-y-3">
          {Array.from(
            new Map(backlinks.map(bl => [bl.sourceDomain, bl])).values()
          )
            .sort((a, b) => b.domainAuthority - a.domainAuthority)
            .slice(0, 5)
            .map((bl) => (
              <div key={bl.sourceDomain} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-semibold">{bl.sourceDomain}</p>
                  <p className="text-sm text-gray-600">
                    {backlinks.filter(b => b.sourceDomain === bl.sourceDomain).length} رابط
                  </p>
                </div>
                <div className="text-right">
                  <Badge className={getDAColor(bl.domainAuthority)}>
                    DA {bl.domainAuthority}
                  </Badge>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
