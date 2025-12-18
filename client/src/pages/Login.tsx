import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MessageSquare, AlertCircle } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("admin@sari.sa");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      console.log('🔵 Starting login with:', { email, password });

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'فشل تسجيل الدخول');
      }

      const data = await response.json();
      console.log('🟢 Login successful:', data);

      // Store token
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        console.log('🟢 Token saved to localStorage');
      }

      // Store user info
      if (data.user) {
        localStorage.setItem('user-info', JSON.stringify(data.user));
        console.log('🟢 User info saved to localStorage');
      }

      // Redirect
      setTimeout(() => {
        if (data.user.role === 'admin') {
          console.log('🟢 Redirecting to admin dashboard');
          setLocation('/admin/dashboard');
        } else {
          console.log('🟢 Redirecting to merchant dashboard');
          setLocation('/merchant/dashboard');
        }
      }, 500);
    } catch (err: any) {
      console.error('🔴 Login error:', err);
      setError(err?.message || 'فشل تسجيل الدخول');
    } finally {
      setIsLoading(false);
    }
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
                disabled={isLoading}
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">كلمة المرور</Label>
                <a href="/forgot-password" className="text-sm text-primary hover:underline">
                  نسيت كلمة المرور؟
                </a>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
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
            <span className="text-muted-foreground">لا تملك حساباً؟ </span>
            <a href="/register" className="text-primary hover:underline font-medium">
              سجل الآن
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
