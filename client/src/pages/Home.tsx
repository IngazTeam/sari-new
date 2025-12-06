import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'admin') {
        setLocation('/admin/dashboard');
      } else {
        setLocation('/merchant/dashboard');
      }
    }
  }, [isAuthenticated, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold">ساري</span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground">
                  مرحباً، {user?.name}
                </span>
                <Button variant="outline" onClick={() => logout()}>
                  تسجيل الخروج
                </Button>
              </>
            ) : (
              <Button asChild>
                <a href={getLoginUrl()}>تسجيل الدخول</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            وكيل مبيعات ذكي يعمل بالذكاء الاصطناعي
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight">
            حوّل الواتساب إلى
            <span className="text-primary block mt-2">آلة مبيعات ذكية</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            ساري هو مساعد مبيعات ذكي يعمل على الواتساب، يفهم عملائك ويرد عليهم
            باللهجة السعودية، ويساعدك على زيادة مبيعاتك تلقائياً
          </p>

          <div className="flex gap-4 justify-center">
            {isAuthenticated ? (
              <Button size="lg" onClick={() => setLocation('/merchant/dashboard')}>
                الذهاب إلى لوحة التحكم
              </Button>
            ) : (
              <Button size="lg" asChild>
                <a href={getLoginUrl()}>ابدأ الآن مجاناً</a>
              </Button>
            )}
            <Button size="lg" variant="outline">
              شاهد العرض التوضيحي
            </Button>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="p-6 bg-white rounded-lg shadow-sm border">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">ردود ذكية</h3>
              <p className="text-muted-foreground">
                يفهم الرسائل النصية والصوتية ويرد باللهجة السعودية الطبيعية
              </p>
            </div>

            <div className="p-6 bg-white rounded-lg shadow-sm border">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">اقتراحات ذكية</h3>
              <p className="text-muted-foreground">
                يقترح المنتجات المناسبة ويرسل الصور والأسعار تلقائياً
              </p>
            </div>

            <div className="p-6 bg-white rounded-lg shadow-sm border">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">تقارير مفصلة</h3>
              <p className="text-muted-foreground">
                احصل على تقارير شاملة عن المحادثات والمبيعات والأداء
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2024 ساري. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
