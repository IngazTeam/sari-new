import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { verifyGoogleToken, findOrCreateGoogleUser } from "./google-auth";
import { TRPCError } from "@trpc/server";
import { createSessionToken } from "./_core/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import * as db from "./db";

export const googleAuthRouter = router({
  /**
   * تسجيل الدخول عبر Google
   * SEC-02 FIX: Now creates a proper session token and sets cookie,
   * just like the email login endpoint.
   */
  googleLogin: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, "Google token مطلوب"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // التحقق من صحة Google Token
        const googleData = await verifyGoogleToken(input.token);

        // البحث عن المستخدم أو إنشاء واحد جديد
        const user = await findOrCreateGoogleUser(googleData);

        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "فشل في إنشاء أو جلب المستخدم",
          });
        }

        // SEC-02 FIX: Create proper session token (matching routers-auth.ts login)
        await db.updateUserLastSignedIn(user.id);

        const sessionToken = await createSessionToken(String(user.id), {
          name: user.name || '',
          email: user.email || '',
          expiresInMs: THIRTY_DAYS_MS,
        });

        const cookieOptions = getSessionCookieOptions((ctx as any).req);
        (ctx as any).res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

        return {
          success: true,
          token: sessionToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          message: "تم تسجيل الدخول بنجاح عبر Google",
        };
      } catch (error) {
        console.error("خطأ في تسجيل الدخول عبر Google:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        // SEC-11 FIX: Don't expose internal error details
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "فشل تسجيل الدخول عبر Google. حاول مرة أخرى.",
        });
      }
    }),
});
