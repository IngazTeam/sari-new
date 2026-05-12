import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Code, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SeoTracking() {
  const { t } = useTranslation();
  const { data: trackingCodes, isLoading, refetch } = trpc.seo.getTrackingCodes.useQuery();

  const createMutation = trpc.seo.createTrackingCode.useMutation({
    onSuccess: () => { toast.success("تمت الإضافة ✅"); refetch(); setNewId(""); setNewCode(""); },
    onError: (err) => toast.error(err.message),
  });

  const [newType, setNewType] = useState("google_analytics");
  const [newId, setNewId] = useState("");
  const [newCode, setNewCode] = useState("");

  const handleAdd = () => {
    if (!newId.trim()) return;
    createMutation.mutate({
      trackingType: newType,
      trackingId: newId,
      trackingCode: newCode || undefined,
      isActive: 1,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('seoTracking.auto_0')}</h1>
        <p className="text-muted-foreground mt-2">{t('seoTracking.auto_1')}</p>
      </div>

      {/* Existing Codes */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">{t('seoTracking.auto_2')}</h2>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (trackingCodes || []).length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t('seoTracking.auto_3')}</p>
        ) : (
          <div className="space-y-3">
            {(trackingCodes || []).map((code: any) => (
              <div key={code.id} className="p-4 border rounded-lg flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Code className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <span className="font-medium">{code.trackingType}</span>
                    <p className="text-sm text-muted-foreground font-mono" dir="ltr">{code.trackingId}</p>
                  </div>
                </div>
                <Badge variant={code.isActive ? "default" : "outline"}>
                  {code.isActive ? "مفعّل" : "معطّل"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add New */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">{t('seoTracking.auto_4')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t('seoTracking.auto_5')}</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="google_analytics">Google Analytics</option>
              <option value="google_tag_manager">Google Tag Manager</option>
              <option value="facebook_pixel">Facebook Pixel</option>
              <option value="tiktok_pixel">TikTok Pixel</option>
              <option value="snapchat_pixel">Snapchat Pixel</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Tracking ID</label>
            <Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="G-XXXXXXXXXX" dir="ltr" className="font-mono" />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">{t('seoTracking.auto_6')}</label>
          <Textarea value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="<script>...</script>" dir="ltr" rows={4} className="font-mono text-xs" />
        </div>
        <Button onClick={handleAdd} disabled={createMutation.isPending || !newId.trim()} className="gap-2">
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          إضافة
        </Button>
      </Card>
    </div>
  );
}
