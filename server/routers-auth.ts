/**
 * Authentication Router
 * Extracted from routers.ts for better maintainability
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from './_core/trpc';
import { COOKIE_NAME, ONE_YEAR_MS } from '@shared/const';
import { getSessionCookieOptions } from './_core/cookies';
import { createSessionToken } from './_core/auth';
import * as db from './db';
import bcrypt from 'bcryptjs';

export const authRouter = router({
    me: protectedProcedure.query(opts => opts.ctx.user),

    // Login with email and password
    login: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(6),
        }))
        .mutation(async ({ input, ctx }) => {
            console.log('🔵 [AUTH] Login attempt:', input.email);
            const user = await db.getUserByEmail(input.email);
            console.log('🔵 [AUTH] User found:', user?.email);

            if (!user || !user.password) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
            }

            const isValidPassword = await bcrypt.compare(input.password, user.password);

            if (!isValidPassword) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
            }

            // Update last signed in
            await db.updateUserLastSignedIn(user.id);

            // Create session token using SDK
            const sessionToken = await createSessionToken(String(user.id), {
                name: user.name || '',
                email: user.email || '',
                expiresInMs: ONE_YEAR_MS,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);

            // Set cookie using both methods to ensure it works
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

            // Also set via header as backup
            const securePart = cookieOptions.secure ? '; Secure' : '';
            const cookieString = `${COOKIE_NAME}=${sessionToken}; Path=${cookieOptions.path}; HttpOnly; SameSite=${cookieOptions.sameSite}${securePart}; Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`;
            const existingCookies = ctx.res.getHeader('Set-Cookie');
            if (existingCookies) {
                const cookieArray = Array.isArray(existingCookies) ? existingCookies : [String(existingCookies)];
                ctx.res.setHeader('Set-Cookie', [...cookieArray, cookieString] as string[]);
            } else {
                ctx.res.setHeader('Set-Cookie', cookieString);
            }

            console.log('🟢 [AUTH] Login successful for:', user.email);
            return {
                success: true,
                token: sessionToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            };
        }),

    // Email Verification
    emailVerification: router({
        sendVerificationEmail: publicProcedure
            .input(z.object({ email: z.string().email(), userId: z.number() }))
            .mutation(async ({ input }) => {
                const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

                await db.createEmailVerificationToken({
                    userId: input.userId,
                    email: input.email,
                    token,
                    expiresAt,
                });

                // In production, send email here
                return { token, expiresAt };
            }),

        verifyEmail: publicProcedure
            .input(z.object({ token: z.string() }))
            .mutation(async ({ input }) => {
                const verificationToken = await db.getEmailVerificationToken(input.token);

                if (!verificationToken) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Token not found' });
                }

                if (verificationToken.isUsed) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Token already used' });
                }

                if (new Date(verificationToken.expiresAt) < new Date()) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Token expired' });
                }

                await db.markEmailVerificationTokenAsUsed(verificationToken.id);
                await db.updateUserEmailVerified(verificationToken.userId, verificationToken.email);

                return { success: true };
            }),
    }),

    // Sign up with email and password
    signup: publicProcedure
        .input(z.object({
            name: z.string().min(2),
            email: z.string().email(),
            password: z.string().min(6),
            businessName: z.string().min(2),
            phone: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            // Check if email already exists
            const existingUser = await db.getUserByEmail(input.email);
            if (existingUser) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already registered' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(input.password, 10);

            // Generate unique openId for the user
            const openId = `local_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            // Create user
            const user = await db.createUser({
                openId,
                name: input.name,
                email: input.email,
                password: hashedPassword,
                loginMethod: 'email',
                role: 'user',
            });

            if (!user) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create user' });
            }

            // Activate trial period (7 days)
            await db.activateUserTrial(user.id);

            // Create merchant profile automatically
            await db.createMerchant({
                userId: user.id,
                businessName: input.businessName,
                phone: input.phone || null,
                status: 'pending',
            });

            // Send welcome email with trial information
            try {
                const { sendWelcomeEmail } = await import('./_core/email');
                const trialEndDate = new Date();
                trialEndDate.setDate(trialEndDate.getDate() + 7);
                await sendWelcomeEmail({
                    name: input.name,
                    email: input.email,
                    trialEndDate: trialEndDate.toLocaleDateString('ar-SA', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                });
            } catch (error) {
                console.error('[Signup] Failed to send welcome email:', error);
                // Don't fail signup if email fails
            }

            // Create session token
            const sessionToken = await createSessionToken(String(user.id), {
                name: user.name || '',
                email: user.email || '',
                expiresInMs: ONE_YEAR_MS,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            };
        }),

    logout: publicProcedure.mutation(({ ctx }) => {
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        return {
            success: true,
        } as const;
    }),

    // Request password reset
    requestPasswordReset: publicProcedure
        .input(z.object({
            email: z.string().email(),
        }))
        .mutation(async ({ input }) => {
            const user = await db.getUserByEmail(input.email);

            if (!user) {
                // Don't reveal if email exists for security
                return { success: true, message: 'إذا كان البريد الإلكتروني موجوداً، سيتم إرسال رابط إعادة التعيين' };
            }

            // Generate secure token
            const token = Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15) +
                Date.now().toString(36);

            // Token expires in 24 hours
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            // Delete any existing tokens for this user
            await db.deletePasswordResetTokensByUserId(user.id);

            // Create new token
            await db.createPasswordResetToken({
                userId: user.id,
                email: user.email!,
                token,
                expiresAt,
                used: 0,
            });

            // Send reset email
            try {
                const { sendPasswordResetEmail } = await import('./notifications/email-notifications');
                const resetLink = `${process.env.VITE_FRONTEND_URL || 'https://sari.sa'}/reset-password?token=${token}`;
                await sendPasswordResetEmail(user.email!, user.name || 'المستخدم', resetLink);
            } catch (error) {
                console.error('[Password Reset] Failed to send email:', error);
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل إرسال البريد الإلكتروني' });
            }

            return { success: true, message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني' };
        }),

    // Verify reset token
    verifyResetToken: publicProcedure
        .input(z.object({
            token: z.string(),
        }))
        .query(async ({ input }) => {
            const resetToken = await db.getPasswordResetTokenByToken(input.token);

            if (!resetToken) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'الرمز غير صحيح' });
            }

            if (resetToken.used) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'تم استخدام هذا الرمز بالفعل' });
            }

            if (new Date(resetToken.expiresAt) < new Date()) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'انتهت صلاحية الرمز' });
            }

            return { valid: true, email: resetToken.email };
        }),

    // Reset password
    resetPassword: publicProcedure
        .input(z.object({
            token: z.string(),
            newPassword: z.string().min(6),
        }))
        .mutation(async ({ input }) => {
            const resetToken = await db.getPasswordResetTokenByToken(input.token);

            if (!resetToken) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'الرمز غير صحيح' });
            }

            if (resetToken.used) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'تم استخدام هذا الرمز بالفعل' });
            }

            if (new Date(resetToken.expiresAt) < new Date()) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'انتهت صلاحية الرمز' });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(input.newPassword, 10);

            // Update user password
            await db.updateUserPassword(resetToken.userId, hashedPassword);

            // Mark token as used
            await db.markPasswordResetTokenAsUsed(resetToken.id);

            return { success: true, message: 'تم تغيير كلمة المرور بنجاح' };
        }),

    // Update user profile
    updateProfile: protectedProcedure
        .input(z.object({
            name: z.string().optional(),
            email: z.string().email().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            await db.updateUser(ctx.user.id, input);
            return { success: true };
        }),

    // Check rate limiting first for password reset
    checkResetRateLimit: publicProcedure
        .input(z.object({
            email: z.string().email(),
        }))
        .query(async ({ input }) => {
            const rateLimitCheck = await db.canRequestReset(input.email);

            if (!rateLimitCheck.allowed) {
                const minutes = Math.floor(rateLimitCheck.remainingTime! / 60);
                const seconds = rateLimitCheck.remainingTime! % 60;
                const timeString = minutes > 0
                    ? `${minutes} دقيقة و ${seconds} ثانية`
                    : `${seconds} ثانية`;

                throw new TRPCError({
                    code: 'TOO_MANY_REQUESTS',
                    message: `لقد تجاوزت الحد الأقصى للمحاولات (3 محاولات). يرجى الانتظار ${timeString} قبل المحاولة مرة أخرى.`,
                    cause: {
                        remainingTime: rateLimitCheck.remainingTime,
                        attemptsCount: rateLimitCheck.attemptsCount,
                    }
                });
            }

            // Track this attempt
            await db.trackResetAttempt({ email: input.email });

            const user = await db.getUserByEmail(input.email);

            // Don't reveal if user exists or not (security best practice)
            if (!user) {
                return { success: true, message: 'If an account exists with this email, a password reset link has been sent.' };
            }

            // Generate unique token
            const token = `${Date.now()}_${Math.random().toString(36).substring(2)}_${Math.random().toString(36).substring(2)}`;

            // Token expires in 1 hour
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

            // Create reset token in database
            await db.createPasswordResetToken({
                userId: user.id,
                email: user.email!,
                token,
                expiresAt,
            });

            // Send email with reset link
            try {
                const { sendEmail } = await import('./reports/email-sender');
                const { getPasswordResetEmailTemplate } = await import('./email/templates/passwordReset');

                const resetLink = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/reset-password/${token}`;

                const emailTemplate = getPasswordResetEmailTemplate({
                    userName: user.name || 'المستخدم',
                    resetLink,
                    expiryHours: 1,
                });

                await sendEmail({
                    to: user.email!,
                    subject: emailTemplate.subject,
                    html: emailTemplate.html,
                });
            } catch (error) {
                console.error('[Password Reset] Failed to send email:', error);
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send reset email' });
            }

            return { success: true, message: 'If an account exists with this email, a password reset link has been sent.' };
        }),

    // Validate reset token
    validateResetToken: publicProcedure
        .input(z.object({
            token: z.string(),
        }))
        .query(async ({ input }) => {
            const validation = await db.validatePasswordResetToken(input.token);

            if (!validation.valid) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: validation.reason === 'invalid_token' ? 'Invalid reset token' :
                        validation.reason === 'token_already_used' ? 'This reset link has already been used' :
                            validation.reason === 'token_expired' ? 'This reset link has expired' :
                                'Invalid reset token'
                });
            }

            return { valid: true };
        }),
});
