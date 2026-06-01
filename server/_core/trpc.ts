import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { Permission, MerchantRole } from "./permissions";
import { hasPermission } from "./permissions";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Merchant member middleware — resolves the user's role within the merchant tenant.
 * 
 * Flow:
 * 1. User must be authenticated
 * 2. Finds their merchant_members record (or falls back to legacy merchants.userId)
 * 3. Injects merchantId + merchantRole into context
 * 
 * Used by merchantProcedure and permissionProcedure.
 */
const requireMerchantMember = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  try {
    const { getMerchantMemberByUserId } = await import('../db');
    const membership = await getMerchantMemberByUserId(ctx.user.id);

    if (membership) {
      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
          merchantId: membership.merchantId,
          merchantRole: membership.role as MerchantRole,
        },
      });
    }
  } catch {
    // merchant_members table may not exist yet — fall through to legacy
  }

  // Legacy fallback: check old merchants.userId column
  try {
    const { getMerchantByUserId } = await import('../db');
    const merchant = await getMerchantByUserId(ctx.user.id);

    if (merchant) {
      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
          merchantId: merchant.id,
          merchantRole: 'owner' as MerchantRole, // Legacy users are always owners
        },
      });
    }
  } catch { /* ignore */ }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "ليس لديك صلاحية الوصول لهذا المتجر",
  });
});

/**
 * merchantProcedure — For any logged-in merchant member (any role).
 * Injects merchantId + merchantRole into context.
 */
export const merchantProcedure = t.procedure.use(requireMerchantMember);

/**
 * Create a procedure that requires a specific permission.
 * 
 * Usage:
 *   permissionProcedure('products.manage').mutation(...)
 */
export function permissionProcedure(permission: Permission) {
  return t.procedure.use(requireMerchantMember).use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      const role = ctx.merchantRole;

      if (!role || !hasPermission(role, permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `ليس لديك صلاحية: ${permission}`,
        });
      }

      return next({ ctx });
    }),
  );
}
