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
      
      toast.success(t('sariPersonalityPage.text0'));
    } catch (error) {
      toast.error(t('sariPersonalityPage.text1'));
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
          {t('sariPersonalityPage.text21')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t('sariPersonalityPage.text22')}
        </p>
      </div>
      
      <div className="grid gap-6">
        {/* Tone Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              {t('sariPersonalityPage.text23')}
            </CardTitle>
            <CardDescription>
              {t('sariPersonalityPage.text24')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('sariPersonalityPage.text2')}</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">{t('sariPersonalityPage.text3')}</SelectItem>
                    <SelectItem value="professional">{t('sariPersonalityPage.text4')}</SelectItem>
                    <SelectItem value="casual">{t('sariPersonalityPage.text5')}</SelectItem>
                    <SelectItem value="enthusiastic">{t('sariPersonalityPage.text6')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {tone === "friendly"  && t('sariPersonalityPage.text34')}
                  {tone === "professional"  && t('sariPersonalityPage.text35')}
                  {tone === "casual"  && t('sariPersonalityPage.text36')}
                  {tone === "enthusiastic"  && t('sariPersonalityPage.text37')}
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
              {t('sariPersonalityPage.text25')}
            </CardTitle>
            <CardDescription>
              {t('sariPersonalityPage.text26')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('sariPersonalityPage.text7')}</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saudi_dialect">{t('sariPersonalityPage.text8')}</SelectItem>
                    <SelectItem value="formal_arabic">{t('sariPersonalityPage.text9')}</SelectItem>
                    <SelectItem value="english">{t('sariPersonalityPage.text10')}</SelectItem>
                    <SelectItem value="bilingual">{t('sariPersonalityPage.text11')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {style === "saudi_dialect"  && t('sariPersonalityPage.text38')}
                  {style === "formal_arabic"  && t('sariPersonalityPage.text39')}
                  {style === "english"  && t('sariPersonalityPage.text40')}
                  {style === "bilingual"  && t('sariPersonalityPage.text41')}
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
              {t('sariPersonalityPage.text27')}
            </CardTitle>
            <CardDescription>
              {t('sariPersonalityPage.text28')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('sariPersonalityPage.text12')}</Label>
                <Select value={emojiUsage} onValueChange={setEmojiUsage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('sariPersonalityPage.text13')}</SelectItem>
                    <SelectItem value="minimal">{t('sariPersonalityPage.text14')}</SelectItem>
                    <SelectItem value="moderate">{t('sariPersonalityPage.text15')}</SelectItem>
                    <SelectItem value="frequent">{t('sariPersonalityPage.text16')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  {emojiUsage === "none"  && t('sariPersonalityPage.text42')}
                  {emojiUsage === "minimal"  && t('sariPersonalityPage.text43')}
                  {emojiUsage === "moderate"  && t('sariPersonalityPage.text44')}
                  {emojiUsage === "frequent"  && t('sariPersonalityPage.text45')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Custom Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('sariPersonalityPage.text17')}</CardTitle>
            <CardDescription>
              {t('sariPersonalityPage.text29')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder={t('sariPersonalityPage.text18')}
              rows={5}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground mt-2">
              {t('sariPersonalityPage.text30')}
            </p>
          </CardContent>
        </Card>
        
        {/* Brand Voice */}
        <Card>
          <CardHeader>
            <CardTitle>{t('sariPersonalityPage.text19')}</CardTitle>
            <CardDescription>
              {t('sariPersonalityPage.text31')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder={t('sariPersonalityPage.text20')}
              rows={5}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground mt-2">
              {t('sariPersonalityPage.text32')}
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
            {t('sariPersonalityPage.text33')}
          </Button>
        </div>
      </div>
    </div>
  );
}
