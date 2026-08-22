import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Store, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { Link } from 'wouter';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type SignupErrorField = 'password' | 'confirmPassword' | 'phone' | 'legal' | 'form';

type SignupError = {
  field: SignupErrorField;
  message: string;
};

export default function SignUp() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  // Read query params for prefill (from SignupPromptDialog) and Byaan integration
  const urlParams = new URLSearchParams(window.location.search);
  const byaanDomain = urlParams.get('domain') || '';
  const byaanPlatform = urlParams.get('platform') || '';
  const prefillName = urlParams.get('name') || '';
  const prefillEmail = urlParams.get('email') || '';
  const prefillPhone = urlParams.get('phone') || '';

  const [formData, setFormData] = useState({
    name: prefillName,
    email: prefillEmail,
    password: '',
    confirmPassword: '',
    businessName: '',
    phone: prefillPhone,
  });
  const [error, setError] = useState<SignupError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  const showError = (field: SignupErrorField, message: string) => {
    setError({ field, message });
    window.requestAnimationFrame(() => errorRef.current?.focus());
  };

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: (data: any) => {
      if (data.verificationEmailSent) {
        toast.success(t('authUx.signup.verificationSent'));
      } else {
        toast.info(t('authUx.signup.verificationDeferred'));
      }
      // Redirect based on role
      if (data.user.role === 'admin' || data.user.role === 'superadmin') {
        setLocation('/admin/dashboard');
      } else {
        // Redirect new merchants to Setup Wizard
        setLocation('/merchant/setup-wizard');
      }
    },
    onError: (mutationError: any) => {
      showError(
        'form',
        mutationError?.data?.code === 'TOO_MANY_REQUESTS'
          ? t('authUx.signup.signupRateLimited')
          : t('authUx.signup.signupFailed'),
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      showError('confirmPassword', t('authUx.signup.passwordMismatch'));
      return;
    }

    if (formData.password.length < 8) {
      showError('password', t('authUx.signup.passwordMinimumError'));
      return;
    }

    if (!/[A-Z]/.test(formData.password)) {
      showError('password', t('authUx.signup.passwordUppercaseError'));
      return;
    }

    if (!/[0-9]/.test(formData.password)) {
      showError('password', t('authUx.signup.passwordNumberError'));
      return;
    }

    if (!formData.phone) {
      showError('phone', t('authUx.signup.phoneRequiredError'));
      return;
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      showError('legal', t('authUx.signup.legalRequiredError'));
      return;
    }

    signupMutation.mutate({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      businessName: formData.businessName,
      phone: formData.phone,
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error?.field === e.target.name) setError(null);
  };

  const passwordRequirements = [
    { met: formData.password.length >= 8, label: t('authUx.signup.passwordMinimum') },
    { met: /[A-Z]/.test(formData.password), label: t('authUx.signup.passwordUppercase') },
    { met: /[0-9]/.test(formData.password), label: t('authUx.signup.passwordNumber') },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                <Store className="w-6 h-6 text-white" aria-hidden="true" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">{t('authUx.signup.title')}</CardTitle>
            <CardDescription className="text-center">{t('authUx.signup.subtitle')}</CardDescription>
            <p id="signup-required-hint" className="text-center text-xs text-muted-foreground">
              {t('authUx.signup.requiredFieldsHint')}
            </p>
          </CardHeader>
          <form onSubmit={handleSubmit} aria-describedby="signup-required-hint">
            <CardContent className="space-y-4">
              {error && (
                <div ref={errorRef} id="signup-error" tabIndex={-1} className="focus:outline-none">
                  <Alert variant="destructive" role="alert" aria-live="assertive">
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                </div>
              )}

              {byaanPlatform === 'byaan' && byaanDomain && (
                <Alert>
                  <AlertDescription className="text-sm">
                    ✨ {t('authUx.signup.byaanNotice', { domain: byaanDomain })}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">{t('authUx.signup.nameLabel')}</Label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder={t('authUx.signup.namePlaceholder')}
                    value={formData.name}
                    onChange={handleChange}
                    required
                    autoComplete="name"
                    maxLength={120}
                    className="ps-10"
                    disabled={signupMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('authUx.signup.emailLabel')}</Label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t('authUx.signup.emailPlaceholder')}
                    value={formData.email}
                    onChange={handleChange}
                    required
                    autoComplete="email"
                    maxLength={320}
                    className="ps-10"
                    disabled={signupMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">{t('authUx.signup.businessNameLabel')}</Label>
                <div className="relative">
                  <Store className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="businessName"
                    name="businessName"
                    type="text"
                    placeholder={t('authUx.signup.businessNamePlaceholder')}
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                    autoComplete="organization"
                    maxLength={255}
                    className="ps-10"
                    disabled={signupMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('authUx.signup.phoneLabel')}</Label>
                <PhoneInput
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={(val) => {
                    setFormData(prev => ({ ...prev, phone: val }));
                    if (error?.field === 'phone') setError(null);
                  }}
                  autoComplete="tel-national"
                  ariaDescribedBy={error?.field === 'phone' ? 'phone-hint signup-error' : 'phone-hint'}
                  ariaInvalid={error?.field === 'phone'}
                  error={error?.field === 'phone'}
                  required
                  disabled={signupMutation.isPending}
                />
                <p id="phone-hint" className="text-xs text-muted-foreground">
                  {t('authUx.signup.phoneHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('authUx.signup.passwordLabel')}</Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    className="ps-10 pe-10"
                    disabled={signupMutation.isPending}
                    aria-invalid={error?.field === 'password'}
                    aria-describedby={error?.field === 'password'
                      ? 'password-requirements signup-error'
                      : 'password-requirements'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    aria-label={showPassword
                      ? t('authUx.signup.hidePassword')
                      : t('authUx.signup.showPassword')}
                    aria-controls="password"
                    aria-pressed={showPassword}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                      : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <ul
                  id="password-requirements"
                  className="text-xs space-y-1 mt-1"
                  aria-label={t('authUx.signup.passwordRequirementsLabel')}
                  aria-live="polite"
                >
                  {passwordRequirements.map((requirement) => (
                    <li
                      key={requirement.label}
                      className={requirement.met ? 'text-green-600' : 'text-muted-foreground'}
                      aria-label={`${requirement.label}: ${t(requirement.met
                        ? 'authUx.signup.requirementMet'
                        : 'authUx.signup.requirementPending')}`}
                    >
                      <span aria-hidden="true">{requirement.met ? '✅' : '○'} {requirement.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('authUx.signup.confirmPasswordLabel')}</Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    className="ps-10 pe-10"
                    disabled={signupMutation.isPending}
                    aria-invalid={error?.field === 'confirmPassword'}
                    aria-describedby={error?.field === 'confirmPassword' ? 'signup-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    aria-label={showConfirmPassword
                      ? t('authUx.signup.hideConfirmPassword')
                      : t('authUx.signup.showConfirmPassword')}
                    aria-controls="confirmPassword"
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword
                      ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                      : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <fieldset
                className="space-y-3 rounded-lg border p-4 text-sm"
                aria-describedby={error?.field === 'legal' ? 'signup-error' : undefined}
              >
                <legend className="px-1 text-sm font-medium">
                  {t('authUx.signup.legalGroupLabel')}
                </legend>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="acceptedTerms"
                    checked={acceptedTerms}
                    onCheckedChange={(value) => {
                      setAcceptedTerms(value === true);
                      if (error?.field === 'legal') setError(null);
                    }}
                    aria-required="true"
                    aria-invalid={error?.field === 'legal'}
                  />
                  <Label htmlFor="acceptedTerms" className="font-normal leading-5">
                    {t('authUx.signup.termsPrefix')}{' '}
                    <Link
                      href="/company/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {t('authUx.signup.termsLink')}
                      <span className="sr-only"> ({t('authUx.signup.opensInNewTab')})</span>
                    </Link>
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="acceptedPrivacy"
                    checked={acceptedPrivacy}
                    onCheckedChange={(value) => {
                      setAcceptedPrivacy(value === true);
                      if (error?.field === 'legal') setError(null);
                    }}
                    aria-required="true"
                    aria-invalid={error?.field === 'legal'}
                  />
                  <Label htmlFor="acceptedPrivacy" className="font-normal leading-5">
                    {t('authUx.signup.privacyPrefix')}{' '}
                    <Link
                      href="/company/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {t('authUx.signup.privacyLink')}
                      <span className="sr-only"> ({t('authUx.signup.opensInNewTab')})</span>
                    </Link>
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="marketingConsent"
                    checked={marketingConsent}
                    onCheckedChange={(value) => setMarketingConsent(value === true)}
                  />
                  <Label htmlFor="marketingConsent" className="font-normal leading-5">
                    {t('authUx.signup.marketingConsent')}
                  </Label>
                </div>
              </fieldset>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={signupMutation.isPending}
              >
                {signupMutation.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('authUx.signup.submitting')}
                  </>
                ) : (
                  t('authUx.signup.submit')
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                {t('authUx.signup.hasAccount')}{' '}
                <Link href="/login" className="text-primary hover:underline">{t('authUx.signup.signIn')}</Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
