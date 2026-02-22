import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

interface SignupPromptDialogProps {
  open: boolean;
  onClose: () => void;
  onSignup: () => void;
}

export default function SignupPromptDialog({ open, onClose, onSignup }: SignupPromptDialogProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const handleQuickSignup = () => {
    // Navigate to signup page with pre-filled data
    const params = new URLSearchParams({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
    });
    setLocation(`/signup?${params.toString()}`);
    onSignup();
  };

  const handleLater = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-[#00d25e]" />
              <DialogTitle className="text-2xl">{t('compSignupPromptDialogPage.text0')}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-base pt-2">
            احصل على ساري لمتجرك الآن وابدأ في زيادة مبيعاتك تلقائياً عبر الواتساب!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('compSignupPromptDialogPage.text1')}</Label>
            <Input
              id="name"
              placeholder={t('compSignupPromptDialogPage.text2')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('compSignupPromptDialogPage.text3')}</Label>
            <Input
              id="email"
              type="email"
              placeholder="example@domain.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t('compSignupPromptDialogPage.text4')}</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="05xxxxxxxx"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="bg-gradient-to-r from-[#00d25e]/10 to-blue-50 p-4 rounded-lg">
            <p className="text-sm text-gray-700 font-medium">
              ✨ احصل على <span className="text-[#00d25e] font-bold">{t('compSignupPromptDialogPage.text5')}</span>
            </p>
            <p className="text-xs text-gray-600 mt-1">
              بدون الحاجة لبطاقة ائتمانية
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleQuickSignup}
            className="flex-1 bg-[#00d25e] hover:bg-[#00b84e] text-white"
            disabled={!formData.name || !formData.email || !formData.phone}
          >
            ابدأ الآن مجاناً
          </Button>
          <Button
            onClick={handleLater}
            variant="outline"
            className="flex-1"
          >
            لاحقاً
          </Button>
        </div>

        <p className="text-xs text-center text-gray-500">
          بالتسجيل، أنت توافق على{' '}
          <a href="/terms" className="text-[#00d25e] hover:underline">
            شروط الخدمة
          </a>{' '}
          و{' '}
          <a href="/privacy" className="text-[#00d25e] hover:underline">
            سياسة الخصوصية
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
