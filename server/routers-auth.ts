/**
 * Auth Router Module
 * Handles authentication (login, signup, password reset, etc.)
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 * Contains the core authentication procedures.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from 'bcryptjs';
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { createSessionToken } from "./_core/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import * as db from "./db";

// FIX #11: In-memory rate limiting for login
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip: string): void {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (record) {
        // Reset window if expired
        if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
            loginAttempts.set(ip, { count: 1, firstAttempt: now });
            return;
        }
        if (record.count >= MAX_LOGIN_ATTEMPTS) {
            const remainingMs = LOGIN_WINDOW_MS - (now - record.firstAttempt);
            const remainingMin = Math.ceil(remainingMs / 60000);
            throw new TRPCError({
                code: 'TOO_MANY_REQUESTS',
                message: `تم تجاوز عدد محاولات تسجيل الدخول. حاول بعد ${remainingMin} دقيقة.`,
            });
        }
        record.count++;
    } else {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
    }
}

function clearLoginAttempts(ip: string): void {
    loginAttempts.delete(ip);
}

export const authRouter = router({
    // Get current user
    me: protectedProcedure.query(opts => opts.ctx.user),

    // Login with email and password
    login: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(1),
        }))
        .mutation(async ({ input, ctx }) => {
            console.log('🔵 [AUTH] Login attempt:', input.email);

            // FIX #11: Rate limit login attempts by IP
            const clientIp = ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown';
            checkLoginRateLimit(clientIp);

            const user = await db.getUserByEmail(input.email);

            if (!user || !user.password) {
                console.warn(`[Auth] ❌ Failed login: email=${input.email} ip=${ctx.req.ip} reason=user_not_found`);
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
            }

            const isValidPassword = await bcrypt.compare(input.password, user.password);

            if (!isValidPassword) {
                console.warn(`[Auth] ❌ Failed login: email=${input.email} ip=${ctx.req.ip} reason=wrong_password`);
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
            }

            // Update last signed in
            await db.updateUserLastSignedIn(user.id);

            // Create session token
            const sessionToken = await createSessionToken(String(user.id), {
                name: user.name || '',
                email: user.email || '',
                expiresInMs: THIRTY_DAYS_MS,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);

            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

            console.log('🟢 [AUTH] Login successful for:', user.email);
            // Clear rate limit on successful login
            clearLoginAttempts(clientIp);
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

    // Sign up with email and password
    signup: publicProcedure
        .input(z.object({
            name: z.string().min(2),
            email: z.string().email(),
            password: z.string().min(8, 'Password must be at least 8 characters')
                .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
                .regex(/[0-9]/, 'Password must contain at least one number'),
            businessName: z.string().min(2),
            phone: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            // SEC-07 FIX: Rate limit signup attempts by IP
            const { checkRateLimit } = await import('./_core/rateLimiter');
            const clientIp = ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown';
            const signupCheck = checkRateLimit(`signup_ip:${clientIp}`, 10, 3600000); // 10 per hour
            if (!signupCheck.allowed) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تم تجاوز عدد محاولات التسجيل. حاول لاحقاً.' });
            }

            // Check if email already exists (generic message to prevent enumeration)
            const existingUser = await db.getUserByEmail(input.email);
            if (existingUser) {
                console.warn(`[Auth] Signup attempt with existing email: ${input.email} ip=${ctx.req.ip}`);
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unable to create account. Please try again or use a different email.' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(input.password, 10);

            // Generate unique openId
            const crypto = await import('node:crypto');
            const openId = `local_${crypto.randomBytes(16).toString('hex')}`;

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

            await db.createMerchant({
                userId: user.id,
                businessName: input.businessName,
                phone: input.phone || null,
                status: 'active', // LAUNCH-FIX: Set active immediately (was 'pending' with no activation path)
            });

            // Send welcome email
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
            }

            // Create session token
            const sessionToken = await createSessionToken(String(user.id), {
                name: user.name || '',
                email: user.email || '',
                expiresInMs: THIRTY_DAYS_MS,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

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

    // Logout
    logout: protectedProcedure.mutation(async ({ ctx }) => {
        ctx.res.clearCookie(COOKIE_NAME);
        return { success: true };
    }),

    // LAUNCH-FIX: Forgot password — sends reset link via email
    forgotPassword: publicProcedure
        .input(z.object({
            email: z.string().email(),
        }))
        .mutation(async ({ input, ctx }) => {
            // Rate limit by IP
            const { checkRateLimit } = await import('./_core/rateLimiter');
            const clientIp = ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown';
            const check = checkRateLimit(`forgot_ip:${clientIp}`, 5, 3600000); // 5 per hour
            if (!check.allowed) {
                // Always return success to prevent email enumeration
                return { success: true, message: 'إذا كان البريد مسجلاً، ستصلك رسالة بالتعليمات.' };
            }

            // Log attempt
            await db.trackResetAttempt({ email: input.email, ipAddress: clientIp });

            const user = await db.getUserByEmail(input.email);
            if (!user) {
                // Don't reveal if email exists — return same message
                return { success: true, message: 'إذا كان البريد مسجلاً، ستصلك رسالة بالتعليمات.' };
            }

            // Delete old tokens for this user
            await db.deletePasswordResetTokensByUserId(user.id);

            // Generate reset token
            const crypto = await import('node:crypto');
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            await db.createPasswordResetToken({
                userId: user.id,
                email: input.email,
                token,
                expiresAt,
            });

            // Send email
            const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'https://sary.live';
            const resetUrl = `${appUrl}/reset-password?token=${token}`;

            try {
                const { sendEmail } = await import('./_core/smtpEmail');
                await sendEmail({
                    to: input.email,
                    subject: '🔐 إعادة تعيين كلمة المرور — ساري',
                    html: `
                        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center; color: white;">
                                <h1 style="margin: 0;">🔐 إعادة تعيين كلمة المرور</h1>
                            </div>
                            <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                <p style="font-size: 16px; color: #333;">مرحباً ${user.name}،</p>
                                <p style="font-size: 16px; color: #666;">تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك.</p>
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold;">إعادة تعيين كلمة المرور</a>
                                </div>
                                <p style="font-size: 14px; color: #999;">الرابط صالح لمدة ساعة واحدة فقط.</p>
                                <p style="font-size: 14px; color: #999;">إذا لم تطلب هذا، تجاهل هذه الرسالة.</p>
                            </div>
                        </div>
                    `,
                });
            } catch (error) {
                console.error('[Auth] Failed to send password reset email:', error);
            }

            return { success: true, message: 'إذا كان البريد مسجلاً، ستصلك رسالة بالتعليمات.' };
        }),

    // LAUNCH-FIX: Reset password with token
    resetPassword: publicProcedure
        .input(z.object({
            token: z.string().min(1),
            newPassword: z.string().min(8)
                .regex(/[A-Z]/, 'يجب أن تحتوي على حرف كبير')
                .regex(/[0-9]/, 'يجب أن تحتوي على رقم'),
        }))
        .mutation(async ({ input }) => {
            const validation = await db.validatePasswordResetToken(input.token);
            if (!validation.valid || !validation.token) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: validation.reason || 'رابط إعادة التعيين غير صالح أو منتهي.',
                });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(input.newPassword, 10);

            // Update password
            await db.updateUser(validation.token.userId, { password: hashedPassword });

            // Mark token as used
            await db.markPasswordResetTokenAsUsed(validation.token.id);

            // Delete all tokens for this user (invalidate any other reset links)
            await db.deletePasswordResetTokensByUserId(validation.token.userId);

            return { success: true, message: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.' };
        }),

    // LAUNCH-FIX: Change password for logged-in user
    changePassword: protectedProcedure
        .input(z.object({
            currentPassword: z.string().min(1),
            newPassword: z.string().min(8)
                .regex(/[A-Z]/, 'يجب أن تحتوي على حرف كبير')
                .regex(/[0-9]/, 'يجب أن تحتوي على رقم'),
        }))
        .mutation(async ({ ctx, input }) => {
            const user = await db.getUserById(ctx.user.id);
            if (!user || !user.password) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكن تغيير كلمة المرور لهذا الحساب.' });
            }

            const isValid = await bcrypt.compare(input.currentPassword, user.password);
            if (!isValid) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'كلمة المرور الحالية غير صحيحة.' });
            }

            const hashedPassword = await bcrypt.hash(input.newPassword, 10);
            await db.updateUser(ctx.user.id, { password: hashedPassword });

            // Clear cookie to force re-login with new password (session invalidation)
            ctx.res.clearCookie(COOKIE_NAME);

            return { success: true, message: 'تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى.' };
        }),
});

export type AuthRouter = typeof authRouter;
