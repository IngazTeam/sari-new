import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Copy, Eye, EyeOff } from "lucide-react";

export default function SeoTracking() {
  const [trackingCodes, setTrackingCodes] = useState([
    {
      id: 1,
      type: "Google Analytics",
      trackingId: "G-XXXXXXXXXX",
      code: "<!-- Google Analytics -->\n<script async src=\"https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX\"></script>",
      isActive: true,
    },
    {
      id: 2,
      type: "Facebook Pixel",
      trackingId: "1234567890",
      code: "<!-- Facebook Pixel Code -->\n<img height=\"1\" width=\"1\" style=\"display:none\" src=\"https://www.facebook.com/tr?id=1234567890&ev=PageView&noscript=1\" />",
      isActive: true,
    },
    {
      id: 3,
      type: "Google Tag Manager",
      trackingId: "GTM-XXXXXXX",
      code: "<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>",
      isActive: false,
    },
  ]);

  const [showCode, setShowCode] = useState<number | null>(null);

  const toggleActive = (id: number) => {
    setTrackingCodes(trackingCodes.map(code =>
      code.id === id ? { ...code, isActive: !code.isActive } : code
    ));
  };

  const deleteCode = (id: number) => {
    setTrackingCodes(trackingCodes.filter(code => code.id !== id));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إدارة رموز التتبع</h1>
        <p className="text-gray-600 mt-2">أدر رموز Google Analytics و Facebook Pixel والخدمات الأخرى</p>
      </div>

      {/* Add New Code */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">رموز التتبع النشطة</h2>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            إضافة رمز تتبع
          </Button>
        </div>

        <div className="space-y-4">
          {trackingCodes.map(code => (
            <Card key={code.id} className="p-4 border">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="font-semibold">{code.type}</h3>
                    <p className="text-sm text-gray-600">معرّف: {code.trackingId}</p>
                  </div>
                </div>
                <Badge variant={code.isActive ? "default" : "outline"}>
                  {code.isActive ? "نشط" : "معطل"}
                </Badge>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg mb-4 font-mono text-sm max-h-24 overflow-y-auto">
                {showCode === code.id ? (
                  <pre className="whitespace-pre-wrap break-words text-xs">{code.code}</pre>
                ) : (
                  <p className="text-gray-500">انقر لعرض الرمز</p>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCode(showCode === code.id ? null : code.id)}
                  className="gap-2"
                >
                  {showCode === code.id ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      إخفاء
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      عرض
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(code.code)}
                  className="gap-2"
                >
                  <Copy className="w-4 h-4" />
                  نسخ
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActive(code.id)}
                >
                  {code.isActive ? "تعطيل" : "تفعيل"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteCode(code.id)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {/* Integration Guide */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">دليل التكامل</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Google Analytics 4</h3>
            <p className="text-sm text-gray-600 mb-2">أضف هذا الرمز في قسم &lt;head&gt; من موقعك:</p>
            <div className="bg-gray-50 p-3 rounded-lg text-xs font-mono overflow-x-auto">
              &lt;script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"&gt;&lt;/script&gt;
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Facebook Pixel</h3>
            <p className="text-sm text-gray-600 mb-2">أضف هذا الرمز في قسم &lt;head&gt; من موقعك:</p>
            <div className="bg-gray-50 p-3 rounded-lg text-xs font-mono overflow-x-auto">
              &lt;img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=..."&gt;
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
  );
}
