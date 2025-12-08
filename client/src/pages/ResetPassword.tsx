import { useState, useEffect } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function ResetPassword() {
  const [, params] = useRoute('/reset-password/:token');
  const token = params?.token || '';
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Validate token on mount
  const { data: tokenValidation, isLoading: isValidating, error: tokenError } = trpc.auth.validateResetToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setResetSuccess(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!newPassword || !confirmPassword) {
      setValidationError('يرجى ملء جميع الحقول');
      return;
    }

    if (newPassword.length < 6) {
      setValidationError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('كلمتا المرور غير متطابقتين');
      return;
    }

    resetPasswordMutation.mutate({ token, newPassword });
  };

  // Success screen
  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-blue-100">
          <CardHeader className="text-center space-y-4 pb-8">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">تم تغيير كلمة المرور!</CardTitle>
            <CardDescription className="text-base text-gray-600">
              يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm text-gray-700">
                تم تحديث كلمة المرور بنجاح. استخدم كلمة المرور الجديدة لتسجيل الدخول.
              </AlertDescription>
            </Alert>

            <Link href="/login">
              <Button className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700">
                الذهاب لتسجيل الدخول
                <ArrowRight className="w-4 h-4 mr-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading or error states
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-blue-100">
          <CardContent className="py-12 text-center">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-600">جاري التحقق من الرابط...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tokenError || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-red-100">
          <CardHeader className="text-center space-y-4 pb-8">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">رابط غير صالح</CardTitle>
            <CardDescription className="text-base text-gray-600">
              {tokenError?.message || 'الرابط غير صالح أو منتهي الصلاحية'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                الرابط الذي استخدمته غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.
              </AlertDescription>
            </Alert>

            <Link href="/forgot-password">
              <Button className="w-full h-12 text-base font-semibold">
                طلب رابط جديد
              </Button>
            </Link>

            <div className="text-center pt-2">
              <Link href="/login">
                <span className="text-sm text-blue-600 hover:text-blue-700 hover:underline cursor-pointer inline-flex items-center gap-1">
                  العودة لتسجيل الدخول
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Reset password form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-blue-100">
        <CardHeader className="text-center space-y-2 pb-8">
          <CardTitle className="text-3xl font-bold text-gray-900">إعادة تعيين كلمة المرور</CardTitle>
          <CardDescription className="text-base text-gray-600">
            أدخل كلمة المرور الجديدة لحسابك
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {(resetPasswordMutation.error || validationError) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {validationError || resetPasswordMutation.error?.message || 'حدث خطأ أثناء تحديث كلمة المرور'}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-sm font-medium text-gray-700">
                كلمة المرور الجديدة
              </Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="أدخل كلمة المرور الجديدة"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={resetPasswordMutation.isPending}
                  className="pr-10 pl-10 h-12 text-base border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                يجب أن تكون 6 أحرف على الأقل
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                تأكيد كلمة المرور
              </Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="أعد إدخال كلمة المرور"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={resetPasswordMutation.isPending}
                  className="pr-10 pl-10 h-12 text-base border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
              disabled={resetPasswordMutation.isPending || !newPassword || !confirmPassword}
            >
              {resetPasswordMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  جاري التحديث...
                </span>
              ) : (
                'تحديث كلمة المرور'
              )}
            </Button>

            <div className="text-center pt-4">
              <Link href="/login">
                <span className="text-sm text-blue-600 hover:text-blue-700 hover:underline cursor-pointer inline-flex items-center gap-1">
                  العودة لتسجيل الدخول
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
