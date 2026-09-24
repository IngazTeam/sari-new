import { z } from 'zod';

export const signupFields = ['name', 'businessName', 'email', 'phone', 'password', 'confirmPassword', 'acceptedTerms', 'acceptedPrivacy'] as const;
export type SignupField = typeof signupFields[number];
export const signupErrorCopy = {
  required: { ar: 'هذه الخانة مطلوبة.', en: 'This field is required.' },
  name: { ar: 'اكتب اسمك من حرفين إلى 120 حرفًا.', en: 'Enter your name using 2–120 characters.' },
  businessName: { ar: 'اكتب اسم النشاط من حرفين إلى 255 حرفًا.', en: 'Enter a business name using 2–255 characters.' },
  email: { ar: 'أدخل بريدًا إلكترونيًا صحيحًا.', en: 'Enter a valid email address.' },
  phone: { ar: 'أدخل رقم جوال صحيحًا مع رمز الدولة، مثل +966501234567.', en: 'Enter a valid phone number with country code, such as +966501234567.' },
  password: { ar: 'استخدم من 8 إلى 128 حرفًا، مع حرف إنجليزي كبير ورقم.', en: 'Use 8–128 characters, including an uppercase letter and a number.' },
  confirmPassword: { ar: 'كلمتا المرور غير متطابقتين.', en: 'The passwords do not match.' },
  acceptedTerms: { ar: 'وافق على الشروط والأحكام للمتابعة.', en: 'Accept the terms of use to continue.' },
  acceptedPrivacy: { ar: 'وافق على سياسة الخصوصية للمتابعة.', en: 'Accept the privacy policy to continue.' },
  emailUsed: { ar: 'هذا البريد الإلكتروني مستخدم. سجّل الدخول أو استخدم بريدًا آخر.', en: 'This email address is already in use. Sign in or use another email.' },
  phoneUsed: { ar: 'رقم الجوال هذا مستخدم. سجّل الدخول أو استخدم رقمًا آخر.', en: 'This phone number is already in use. Sign in or use another number.' },
} as const;
export type SignupErrorCode = keyof typeof signupErrorCopy;
export type SignupFieldErrors = Partial<Record<SignupField, SignupErrorCode>>;

export function normalizeSignupPhone(value: string): string {
  let phone = value.trim().replace(/[ ()-]/g, '').replace(/^\+|^00/, '');
  if (/^05[0-9]{8}$/.test(phone)) phone = `966${phone.slice(1)}`;
  return phone;
}

// Both registration interfaces and the API use the same field rules.
export const signupSchema = z.object({
  name: z.string().trim().min(2, 'name').max(120, 'name'),
  businessName: z.string().trim().min(2, 'businessName').max(255, 'businessName'),
  email: z.string().trim().email('email').max(320, 'email').transform(value => value.toLowerCase()),
  phone: z.string().max(30, 'phone').transform(normalizeSignupPhone).pipe(z.string().regex(/^[1-9][0-9]{8,14}$/, 'phone')),
  password: z.string().min(8, 'password').max(128, 'password').regex(/[A-Z]/, 'password').regex(/[0-9]/, 'password'),
  acceptedTerms: z.literal(true),
  acceptedPrivacy: z.literal(true),
  marketingConsent: z.boolean().default(false),
});

export function signupZodErrors(error: z.ZodError): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as SignupField;
    if (signupFields.includes(field)) errors[field] = field;
  }
  return errors;
}

export function validateSignup(values: Record<string, unknown>): SignupFieldErrors {
  const parsed = signupSchema.safeParse(values);
  const errors = parsed.success ? {} : signupZodErrors(parsed.error);
  if (!values.confirmPassword) errors.confirmPassword = 'required';
  else if (values.password !== values.confirmPassword) errors.confirmPassword = 'confirmPassword';
  return errors;
}

// Only known codes are rendered; API/SQL messages are never inserted in the form.
export function readSignupFieldErrors(value: unknown): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  if (!value || typeof value !== 'object') return errors;
  for (const field of signupFields) {
    const code = (value as Record<string, unknown>)[field];
    if (typeof code === 'string' && Object.hasOwn(signupErrorCopy, code)) errors[field] = code as SignupErrorCode;
  }
  return errors;
}

export function signupErrorText(code: SignupErrorCode, language: string): string {
  return signupErrorCopy[code][language.startsWith('en') ? 'en' : 'ar'];
}
