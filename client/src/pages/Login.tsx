import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MessageSquare, AlertCircle, Eye, EyeOff } from "lucide-react";
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // تحميل بيانات "تذكرني" عند تحميل الصفحة (البريد فقط - بدون كلمة المرور لأسباب أمنية)
  useEffect(() => {
    const savedEmail = localStorage.getItem('sari_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        // SECURITY: رسالة موحدة لمنع كشف وجود الحسابات (User Enumeration)
        let errorMessage = '';
        if (response.status === 401 || response.status === 404) {
          errorMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        } else if (response.status === 429) {
          errorMessage = 'تم تجاوز عدد محاولات تسجيل الدخول. يرجى المحاولة بعد قليل.';
        } else if (response.status >= 500) {
          errorMessage = 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً.';
        } else {
          errorMessage = 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.';
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // حفظ أو حذف بيانات "تذكرني" (البريد فقط - بدون كلمة المرور لأسباب أمنية)
      if (rememberMe) {
        localStorage.setItem('sari_remember_email', email);
      } else {
        localStorage.removeItem('sari_remember_email');
      }

      // تأكد من عدم حفظ كلمة المرور أبداً
      localStorage.removeItem('sari_remember_password');

      // Store token
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }

      // Store user info
      if (data.user) {
        localStorage.setItem('user-info', JSON.stringify(data.user));
      }

      // حذف بيانات الدخول من الخانات
      setEmail("");
      setPassword("");

      // Redirect
      setTimeout(() => {
        if (data.user.role === 'admin') {
          setLocation('/admin/dashboard');
        } else {
          setLocation('/merchant/dashboard');
        }
      }, 500);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || 'فشل تسجيل الدخول');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div>
              <CardTitle className="text-3xl font-bold">{t('loginPage.text0')}</CardTitle>
              <CardDescription className="text-base mt-2">
                وكيل المبيعات الذكي على الواتساب
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t('loginPage.text1')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('loginPage.text2')}</Label>
                  <a href="/forgot-password" className="text-sm text-primary hover:underline">
                    نسيت كلمة المرور؟
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10"
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
              <div className="flex items-center space-x-2 space-x-reverse">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  disabled={isLoading}
                />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal cursor-pointer"
                >
                  تذكرني على هذا الجهاز
                </Label>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                تسجيل الدخول
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">{t('loginPage.text3')}</span>
              <a href="/signup" className="text-primary hover:underline font-medium">
                سجل الآن
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
