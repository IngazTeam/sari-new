import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function SeoKeywords() {
  const [keywords, setKeywords] = useState([
    {
      id: 1,
      keyword: "واتساب",
      searchVolume: 8900,
      difficulty: 72,
      currentRank: 3,
      targetRank: 1,
      trend: "up",
      trendValue: 15,
      competitors: 245,
    },
    {
      id: 2,
      keyword: "مبيعات ذكية",
      searchVolume: 2100,
      difficulty: 45,
      currentRank: 5,
      targetRank: 2,
      trend: "up",
      trendValue: 8,
      competitors: 89,
    },
    {
      id: 3,
      keyword: "ذكاء اصطناعي",
      searchVolume: 5600,
      difficulty: 85,
      currentRank: 12,
      targetRank: 5,
      trend: "down",
      trendValue: -5,
      competitors: 512,
    },
    {
      id: 4,
      keyword: "إدارة العملاء",
      searchVolume: 1200,
      difficulty: 38,
      currentRank: 8,
      targetRank: 3,
      trend: "up",
      trendValue: 12,
      competitors: 67,
    },
    {
      id: 5,
      keyword: "أتمتة المبيعات",
      searchVolume: 890,
      difficulty: 52,
      currentRank: 15,
      targetRank: 5,
      trend: "stable",
      trendValue: 0,
      competitors: 123,
    },
  ]);

  const [newKeyword, setNewKeyword] = useState("");

  const deleteKeyword = (id: number) => {
    setKeywords(keywords.filter(k => k.id !== id));
  };

  const getRankColor = (current: number, target: number) => {
    if (current <= target) return "text-green-600";
    if (current <= target + 5) return "text-yellow-600";
    return "text-red-600";
  };

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty <= 30) return "bg-green-50 text-green-700";
    if (difficulty <= 60) return "bg-yellow-50 text-yellow-700";
    return "bg-red-50 text-red-700";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إدارة الكلمات المفتاحية</h1>
        <p className="text-gray-600 mt-2">تتبع وتحسين أداء الكلمات المفتاحية الخاصة بك</p>
      </div>

      {/* Add New Keyword */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">إضافة كلمة مفتاحية جديدة</h2>
        <div className="flex gap-2">
          <Input
            placeholder="أدخل كلمة مفتاحية جديدة..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
          />
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            إضافة
          </Button>
        </div>
      </Card>

      {/* Keywords Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-right text-sm font-semibold">الكلمة المفتاحية</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">حجم البحث</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">الصعوبة</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">الترتيب الحالي</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">الترتيب المستهدف</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">الاتجاه</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">المنافسون</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw) => (
                <tr key={kw.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{kw.keyword}</td>
                  <td className="px-6 py-4">{kw.searchVolume.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <Badge className={getDifficultyColor(kw.difficulty)}>
                      {kw.difficulty}%
                    </Badge>
                  </td>
                  <td className={`px-6 py-4 font-semibold ${getRankColor(kw.currentRank, kw.targetRank)}`}>
                    #{kw.currentRank}
                  </td>
                  <td className="px-6 py-4 font-semibold">#{kw.targetRank}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {kw.trend === "up" && (
                        <>
                          <TrendingUp className="w-4 h-4 text-green-600" />
                          <span className="text-green-600">↑ {kw.trendValue}%</span>
                        </>
                      )}
                      {kw.trend === "down" && (
                        <>
                          <TrendingDown className="w-4 h-4 text-red-600" />
                          <span className="text-red-600">↓ {Math.abs(kw.trendValue)}%</span>
                        </>
                      )}
                      {kw.trend === "stable" && (
                        <>
                          <Minus className="w-4 h-4 text-gray-600" />
                          <span className="text-gray-600">مستقر</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">{kw.competitors}</td>
                  <td className="px-6 py-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteKeyword(kw.id)}
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

      {/* Keyword Insights */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">الكلمات ذات الأولوية العالية</h3>
          <div className="space-y-2">
            {keywords
              .filter(k => k.searchVolume > 5000)
              .map(k => (
                <div key={k.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="font-medium text-sm">{k.keyword}</span>
                  <Badge variant="outline">{k.searchVolume.toLocaleString()}</Badge>
                </div>
              ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">الكلمات في الصفحة الأولى</h3>
          <div className="space-y-2">
            {keywords
              .filter(k => k.currentRank <= 10)
              .map(k => (
                <div key={k.id} className="flex justify-between items-center p-2 bg-green-50 rounded">
                  <span className="font-medium text-sm">{k.keyword}</span>
                  <Badge className="bg-green-600">#{k.currentRank}</Badge>
                </div>
              ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">الكلمات التي تحتاج تحسين</h3>
          <div className="space-y-2">
            {keywords
              .filter(k => k.currentRank > k.targetRank + 5)
              .map(k => (
                <div key={k.id} className="flex justify-between items-center p-2 bg-red-50 rounded">
                  <span className="font-medium text-sm">{k.keyword}</span>
                  <Badge variant="destructive">#{k.currentRank}</Badge>
                </div>
              ))}
          </div>
        </Card>
      </div>

      {/* Competitor Analysis */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">تحليل المنافسين</h2>
        <div className="space-y-4">
          {keywords.slice(0, 3).map(kw => (
            <div key={kw.id} className="p-4 border rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold">{kw.keyword}</h3>
                <Badge variant="outline">{kw.competitors} منافس</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">حجم البحث</p>
                  <p className="font-semibold">{kw.searchVolume.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-600">صعوبة المنافسة</p>
                  <p className="font-semibold">{kw.difficulty}%</p>
                </div>
                <div>
                  <p className="text-gray-600">فرصة الترتيب</p>
                  <p className="font-semibold text-green-600">جيدة</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
