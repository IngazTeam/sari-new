/**
 * AI Directives Router Module — SuperAdmin Training Center
 * Handles CRUD for AI training directives (Admin only)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";

function assertAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

const CATEGORIES = ['sales', 'culture', 'persuasion', 'examples', 'limits'] as const;

export const aiDirectivesRouter = router({
  // List all directives
  list: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { getAllDirectives } = await import("./db/ai-directives");
    return await getAllDirectives();
  }),

  // Create new directive
  create: protectedProcedure
    .input(z.object({
      category: z.enum(CATEGORIES),
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(5000),
      isActive: z.boolean().default(true),
      priority: z.number().min(0).max(100).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { createDirective } = await import("./db/ai-directives");
      const id = await createDirective(input);
      return { id, success: true };
    }),

  // Update directive
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      category: z.enum(CATEGORIES).optional(),
      title: z.string().min(1).max(200).optional(),
      content: z.string().min(1).max(5000).optional(),
      isActive: z.boolean().optional(),
      priority: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { updateDirective } = await import("./db/ai-directives");
      const { id, ...data } = input;
      await updateDirective(id, data);
      return { success: true };
    }),

  // Delete directive
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { deleteDirective } = await import("./db/ai-directives");
      await deleteDirective(input.id);
      return { success: true };
    }),

  // Toggle active status
  toggle: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { updateDirective } = await import("./db/ai-directives");
      await updateDirective(input.id, { isActive: input.isActive });
      return { success: true };
    }),
});

export type AiDirectivesRouter = typeof aiDirectivesRouter;
