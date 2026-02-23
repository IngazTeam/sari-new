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

export const authRouter = router({
    // Get current user
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

            if (!user || !user.password) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
            }

            const isValidPassword = await bcrypt.compare(input.password, user.password);

            if (!isValidPassword) {
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

            // Generate unique openId
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

            // Create merchant profile
            await db.createMerchant({
                userId: user.id,
                businessName: input.businessName,
                phone: input.phone || null,
                status: 'pending',
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
});

export type AuthRouter = typeof authRouter;
