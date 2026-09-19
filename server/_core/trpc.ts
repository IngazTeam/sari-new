import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { Permission, MerchantRole } from "./permissions";
import { resolveMerchantAccess } from '../accounts/merchant-access';
import { hasPermission } from "./permissions";
import { parseMerchantSelection, withMerchantRequest } from '../accounts/merchant-context';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  const user = ctx.user;

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});

const selectedMerchantScope = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) return next();
  let selectedMerchantId: number | undefined;
  try { selectedMerchantId = parseMerchantSelection(ctx.req?.headers?.['x-merchant-id']); }
  catch { throw new TRPCError({ code: 'BAD_REQUEST', message: 'اختيار المتجر غير صالح' }); }
  return withMerchantRequest({ userId: ctx.user.id, selectedMerchantId }, () => next());
});

export const protectedProcedure = t.procedure.use(requireUser).use(selectedMerchantScope);

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
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
  let membership;
  try {
    const selected = parseMerchantSelection(ctx.req?.headers?.['x-merchant-id']);
    membership = await resolveMerchantAccess(ctx.user.id, selected);
  } catch {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر التحقق من صلاحيات المتجر. حاول لاحقاً.' });
  }
  if (!membership) throw new TRPCError({ code: 'FORBIDDEN', message: 'ليس لديك صلاحية الوصول لهذا المتجر' });
  return next({ ctx: { ...ctx, user: ctx.user, merchantId: membership.merchantId, merchantRole: membership.role } });
});

/**
 * merchantProcedure — For any logged-in merchant member (any role).
 * Injects merchantId + merchantRole into context.
 */
export const merchantProcedure = t.procedure.use(selectedMerchantScope).use(requireMerchantMember);

/**
 * Create a procedure that requires a specific permission.
 * 
 * Usage:
 *   permissionProcedure('products.manage').mutation(...)
 */
export function permissionProcedure(permission: Permission) {
  return merchantProcedure.use(
    async opts => {
      const { ctx, next } = opts;
      const role = ctx.merchantRole;

      if (!role || !hasPermission(role, permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `ليس لديك صلاحية: ${permission}`,
        });
      }

      return next({ ctx });
    },
  );
}
