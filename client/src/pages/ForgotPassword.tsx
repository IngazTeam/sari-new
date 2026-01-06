import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Mail, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setRemainingTime(null);
    },
    onError: (error) => {
      // Check if it's a rate limit error
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        // Extract remainingTime from error message or data
        const errorData = error.data as any;
        if (errorData?.cause?.remainingTime) {
          setRemainingTime(errorData.cause.remainingTime);
        }
      }
    },
  });

  // Countdown timer
  useEffect(() => {
    if (remainingTime === null || remainingTime <= 0) return;

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [remainingTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || remainingTime !== null) return;
    
    requestResetMutation.mutate({ email });
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
      return `${minutes} دقيقة و ${secs} ثانية`;
    }
    return `${secs} ثانية`;
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-blue-100">
          <CardHeader className="text-center space-y-4 pb-8">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">تم إرسال الرابط!</CardTitle>
            <CardDescription className="text-base text-gray-600">
              تحقق من بريدك الإلكتروني
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-blue-200 bg-blue-50">
              <Mail className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-gray-700 leading-relaxed">
                إذا كان هناك حساب مسجل بالبريد الإلكتروني <strong className="text-blue-600">{email}</strong>، 
                فسوف تتلقى رسالة تحتوي على رابط لإعادة تعيين كلمة المرور خلال بضع دقائق.
              </AlertDescription>
            </Alert>

            <div className="space-y-3 pt-4">
              <p className="text-sm text-gray-600 text-center">
                لم تتلق الرسالة؟ تحقق من مجلد البريد العشوائي (Spam)
              </p>
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
              >
                إعادة المحاولة
              </Button>

              <div className="text-center pt-2">
                <Link href="/login">
                  <span className="text-sm text-blue-600 hover:text-blue-700 hover:underline cursor-pointer inline-flex items-center gap-1">
                    العودة لتسجيل الدخول
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-blue-100">
        <CardHeader className="text-center space-y-2 pb-8">
          <CardTitle className="text-3xl font-bold text-gray-900">نسيت كلمة المرور؟</CardTitle>
          <CardDescription className="text-base text-gray-600">
            لا تقلق، سنرسل لك رابطاً لإعادة تعيينها
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {requestResetMutation.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {requestResetMutation.error.message || 'حدث خطأ أثناء إرسال الطلب'}
                </AlertDescription>
              </Alert>
            )}

            {remainingTime !== null && remainingTime > 0 && (
              <Alert className="border-orange-200 bg-orange-50">
                <Clock className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-sm text-gray-700 leading-relaxed">
                  <div className="space-y-2">
                    <p className="font-semibold text-orange-800">
                      لقد تجاوزت الحد الأقصى للمحاولات (3 محاولات)
                    </p>
                    <p>
                      يرجى الانتظار <strong className="text-orange-600 text-lg">{formatTime(remainingTime)}</strong> قبل المحاولة مرة أخرى.
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      هذا الإجراء لحماية حسابك من الوصول غير المصرح به.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                البريد الإلكتروني
              </Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="example@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={requestResetMutation.isPending || remainingTime !== null}
                  className="pr-10 h-12 text-base border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                أدخل البريد الإلكتروني المسجل في حسابك
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
              disabled={requestResetMutation.isPending || !email || remainingTime !== null}
            >
              {requestResetMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  جاري الإرسال...
                </span>
              ) : remainingTime !== null ? (
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  انتظر {formatTime(remainingTime)}
                </span>
              ) : (
                'إرسال رابط إعادة التعيين'
              )}
            </Button>

            <div className="text-center pt-4">
              <Link href="/login">
                <span className="text-sm text-blue-600 hover:text-blue-700 hover:underline cursor-pointer inline-flex items-center gap-1">
                  تذكرت كلمة المرور؟ تسجيل الدخول
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
      <Footer />
    </div>
  );
}
