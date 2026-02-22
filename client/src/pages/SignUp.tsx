import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Store, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { Link } from 'wouter';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from 'react-i18next';

export default function SignUp() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: (data) => {
      // Redirect based on role
      if (data.user.role === 'admin') {
        setLocation('/admin/dashboard');
      } else {
        // Redirect new merchants to Setup Wizard
        setLocation('/merchant/setup-wizard');
      }
    },
    onError: (error) => {
      setError(error.message || 'فشل التسجيل. يرجى المحاولة مرة أخرى.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('كلمات المرور غير متطابقة');
      return;
    }

    if (formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    if (!formData.phone) {
      setError('رقم الهاتف مطلوب');
      return;
    }

    signupMutation.mutate({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      businessName: formData.businessName,
      phone: formData.phone,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <Store className="w-6 h-6 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">{t('signUpPage.text0')}</CardTitle>
            <CardDescription className="text-center">
              انضم إلى ساري وابدأ في تحسين مبيعاتك عبر الواتساب
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">{t('signUpPage.text1')}</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder={t('signUpPage.text2')}
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="pr-10"
                    disabled={signupMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('signUpPage.text3')}</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="pr-10"
                    disabled={signupMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">{t('signUpPage.text4')}</Label>
                <div className="relative">
                  <Store className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="businessName"
                    name="businessName"
                    type="text"
                    placeholder={t('signUpPage.text5')}
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                    className="pr-10"
                    disabled={signupMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('signUpPage.text6')}</Label>
                <PhoneInput
                  value={formData.phone}
                  onChange={(val) => setFormData(prev => ({ ...prev, phone: val }))}
                  required
                  disabled={signupMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('signUpPage.text7')}</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="pr-10 pl-10"
                    disabled={signupMutation.isPending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('signUpPage.text8')}</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="pr-10 pl-10"
                    disabled={signupMutation.isPending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={signupMutation.isPending}
              >
                {signupMutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري التسجيل...
                  </>
                ) : (
                  'إنشاء حساب'
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                لديك حساب بالفعل؟{' '}
                <Link href="/login" className="text-primary hover:underline">
                  تسجيل الدخول
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
