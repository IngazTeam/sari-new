import { ZodError } from 'zod';
import { signupZodErrors, type SignupFieldErrors } from '@shared/signup-validation';

export class SignupConflictError extends Error {
  constructor(readonly fieldErrors: SignupFieldErrors) {
    super('SIGNUP_FIELDS_IN_USE');
  }
}

export function signupErrorDetails(path: string | undefined, code: string, cause: unknown): SignupFieldErrors | null {
  if (path !== 'auth.signup') return null;
  if (code === 'BAD_REQUEST' && cause instanceof ZodError) return signupZodErrors(cause);
  if (code === 'CONFLICT' && cause instanceof SignupConflictError) return cause.fieldErrors;
  return null;
}
