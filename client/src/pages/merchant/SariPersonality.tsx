import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Sparkles, MessageCircle, Smile } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SariPersonality() {
  const { t } = useTranslation();

  
  const { data: settings, isLoading } = trpc.personality.get.useQuery();
  const updateMutation = trpc.personality.update.useMutation();
  
  const [tone, setTone] = useState<string>("friendly");
  const [style, setStyle] = useState<string>("saudi_dialect");
  const [emojiUsage, setEmojiUsage] = useState<string>("moderate");
  const [customInstructions, setCustomInstructions] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  
  useEffect(() => {
    if (settings) {
      setTone(settings.tone || "friendly");
      setStyle(settings.style || "saudi_dialect");
      setEmojiUsage(settings.emojiUsage || "moderate");
      setCustomInstructions(settings.customInstructions || "");
      setBrandVoice(settings.brandVoice || "");
    }
  }, [settings]);
  
  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        tone: tone as any,
        style: style as any,
        emojiUsage: emojiUsage as any,
        customInstructions,
        brandVoice,
      });
      
      toast.success("تم تحديث إعدادات شخصية ساري بنجاح");
    } catch (error) {
      toast.error("فشل حفظ الإعدادات");
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          إعدادات شخصية ساري
        </h1>
        <p className="text-muted-foreground mt-2">
          خصص طريقة تفاعل ساري مع عملائك لتتناسب مع هوية علامتك التجارية
        </p>
      </div>
      
      <div className="grid gap-6">
        {/* Tone Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              نبرة الصوت
            </CardTitle>
            <CardDescription>
              اختر النبرة التي تريد أن يستخدمها ساري في المحادثات
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>النبرة</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">ودود 😊</SelectItem>
                    <SelectItem value="professional">احترافي 💼</SelectItem>
                    <SelectItem value="casual">عادي 👋</SelectItem>
                    <SelectItem value="enthusiastic">متحمس 🎉</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {tone === "friendly" && "نبرة دافئة وترحيبية تناسب معظم الأعمال"}
                  {tone === "professional" && "نبرة احترافية ومحترمة للشركات الكبيرة"}
                  {tone === "casual" && "نبرة مريحة وغير رسمية للتواصل اليومي"}
                  {tone === "enthusiastic" && "نبرة متحمسة ومليئة بالطاقة"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Style Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              أسلوب الردود
            </CardTitle>
            <CardDescription>
              حدد كيف تريد أن يكون طول وشكل الردود
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>الأسلوب</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saudi_dialect">لهجة سعودية 🇸🇦</SelectItem>
                    <SelectItem value="formal_arabic">عربية فصحى 📚</SelectItem>
                    <SelectItem value="english">إنجليزي 🇬🇧</SelectItem>
                    <SelectItem value="bilingual">ثنائي اللغة 🌍</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {style === "saudi_dialect" && "استخدام اللهجة السعودية الشعبية في المحادثات"}
                  {style === "formal_arabic" && "استخدام اللغة العربية الفصحى الرسمية"}
                  {style === "english" && "التحدث باللغة الإنجليزية فقط"}
                  {style === "bilingual" && "التبديل بين العربية والإنجليزية حسب العميل"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Emoji Level */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smile className="h-5 w-5 text-primary" />
              مستوى الإيموجي
            </CardTitle>
            <CardDescription>
              حدد كمية الإيموجي التي تريد استخدامها في الردود
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>مستوى الإيموجي</Label>
                <Select value={emojiUsage} onValueChange={setEmojiUsage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون إيموجي</SelectItem>
                    <SelectItem value="minimal">قليل 😊</SelectItem>
                    <SelectItem value="moderate">متوسط 😊✨</SelectItem>
                    <SelectItem value="frequent">كثير 😊✨🎉</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {emojiUsage === "none" && "لا يستخدم إيموجي نهائياً، مناسب للأعمال الرسمية"}
                  {emojiUsage === "minimal" && "إيموجي قليل جداً، فقط عند الضرورة"}
                  {emojiUsage === "moderate" && "إيموجي معتدل، يضيف لمسة ودية"}
                  {emojiUsage === "frequent" && "إيموجي كثير، يجعل المحادثة حيوية ومرحة"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Custom Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>تعليمات مخصصة</CardTitle>
            <CardDescription>
              أضف تعليمات خاصة تريد من ساري اتباعها في المحادثات
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="مثال: دائماً اذكر اسم المتجر في بداية المحادثة، لا تعد بتوصيل مجاني إلا إذا كان الطلب أكثر من 500 ريال..."
              rows={5}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground mt-2">
              يمكنك إضافة قواعد خاصة، معلومات عن سياسات المتجر، أو أي شيء تريد من ساري تذكره
            </p>
          </CardContent>
        </Card>
        
        {/* Brand Voice */}
        <Card>
          <CardHeader>
            <CardTitle>صوت العلامة التجارية</CardTitle>
            <CardDescription>
              صف شخصية علامتك التجارية وكيف تريد أن يتحدث ساري
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="مثال: نحن علامة تجارية شبابية عصرية، نستخدم لغة بسيطة وقريبة من الشباب، نركز على الجودة والسرعة..."
              rows={5}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground mt-2">
              ساري سيحاول محاكاة شخصية علامتك التجارية في جميع المحادثات
            </p>
          </CardContent>
        </Card>
        
        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            size="lg"
          >
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            حفظ الإعدادات
          </Button>
        </div>
      </div>
    </div>
  );
}
