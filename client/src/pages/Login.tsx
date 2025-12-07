import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquare, AlertCircle } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      // Redirect based on role
      if (data.user.role === 'admin') {
        setLocation('/admin/dashboard');
      } else {
        setLocation('/merchant/dashboard');
      }
    },
    onError: (err) => {
      setError(err.message || 'فشل تسجيل الدخول');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">ساري</CardTitle>
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
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@sari.sa"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loginMutation.isPending}
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loginMutation.isPending}
                dir="ltr"
                className="text-left"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري تسجيل الدخول...
                </>
              ) : (
                "تسجيل الدخول"
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm font-semibold mb-2 text-center">حسابات تجريبية:</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-medium">👑 المدير:</span>
                <code className="bg-background px-2 py-1 rounded">admin@sari.sa / admin123</code>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">🏪 التاجر:</span>
                <code className="bg-background px-2 py-1 rounded">merchant@sari.sa / merchant123</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
