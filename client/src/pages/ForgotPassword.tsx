import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Mail, CheckCircle2, AlertCircle, Clock, KeyRound } from 'lucide-react';
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
        <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">تم إرسال الرابط!</CardTitle>
                <CardDescription className="text-base mt-2">
                  تحقق من بريدك الإلكتروني
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="border-blue-200 bg-blue-50">
                <Mail className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm text-gray-700 leading-relaxed">
                  إذا كان هناك حساب مسجل بالبريد الإلكتروني <strong className="text-primary">{email}</strong>،
                  فسوف تتلقى رسالة تحتوي على رابط لإعادة تعيين كلمة المرور خلال بضع دقائق.
                </AlertDescription>
              </Alert>

              <div className="space-y-3 pt-4">
                <p className="text-sm text-muted-foreground text-center">
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
                    <span className="text-sm text-primary hover:underline cursor-pointer inline-flex items-center gap-1">
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
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div>
              <CardTitle className="text-3xl font-bold">نسيت كلمة المرور؟</CardTitle>
              <CardDescription className="text-base mt-2">
                لا تقلق، سنرسل لك رابطاً لإعادة تعيينها
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                      <p className="text-xs text-muted-foreground mt-2">
                        هذا الإجراء لحماية حسابك من الوصول غير المصرح به.
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={requestResetMutation.isPending || remainingTime !== null}
                  dir="ltr"
                  className="text-left"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  أدخل البريد الإلكتروني المسجل في حسابك
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
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

              <div className="mt-4 text-center text-sm">
                <Link href="/login">
                  <span className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1">
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
