/**
 * Virtual Agents Router Module
 * CRUD operations for virtual AI team personas
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { getDb, getMerchantById } from "./db";
import { eq, and } from "drizzle-orm";
import { isCompleteAgentOrder } from "../shared/virtual-agent-routing";
import { merchants, virtualAgents } from "../drizzle/schema";
import type { SariDb } from "./db/connection";
import { personaPreviewProcedure } from "./routers-persona-preview";
import { virtualTeamRevision } from "./virtual-team-version";
import { hasPermission } from "./_core/permissions";

const expectedRevision = z.string().regex(/^[a-f0-9]{64}$/);

function checkShift(start: unknown, end: unknown) {
  if (Boolean(start) !== Boolean(end) || (start && start === end))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "أدخل وقتين مختلفين للدوام أو أفرغهما معًا",
    });
}

type TeamTransaction = Parameters<Parameters<SariDb["transaction"]>[0]>[0];

async function writeTeam<T>(
  merchantId: number,
  revision: string,
  write: (tx: TeamTransaction) => Promise<T>
): Promise<T> {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  try {
    return await db.transaction(async tx => {
      // Lock the parent even for an empty team. Every team mutation follows this
      // lock order, so limits, defaults and reorder validation share one snapshot.
      const [merchant] = await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .for("update");
      if (!merchant)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Merchant not found",
        });
      const agents = await tx
        .select()
        .from(virtualAgents)
        .where(eq(virtualAgents.merchantId, merchantId));
      if (virtualTeamRevision(merchantId, agents) !== revision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "VIRTUAL_TEAM_CHANGED",
        });
      return write(tx);
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to save virtual team",
    });
  }
}

export const virtualAgentsRouter = router({
  preview: personaPreviewProcedure,
  listReview: merchantProcedure.query(async ({ ctx }) => {
    const pool = await getDb();
    if (!pool)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    const agents = await pool
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.merchantId, ctx.merchantId))
      .orderBy(virtualAgents.sortOrder);
    return {
      agents,
      revision: virtualTeamRevision(ctx.merchantId, agents),
      canManage: hasPermission(ctx.merchantRole, "bot_settings.manage"),
    };
  }),
  // List all agents for the current merchant
  list: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant)
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });

    const pool = await getDb();
    if (!pool)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    const agents = await pool
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.merchantId, merchant.id))
      .orderBy(virtualAgents.sortOrder);
    return agents;
  }),

  // Create a new agent
  create: permissionProcedure("bot_settings.manage")
    .input(
      z.object({
        expectedRevision,
        name: z.string().trim().min(1).max(100),
        role: z.string().trim().min(1).max(100),
        department: z.string().max(100).optional(),
        personalityPrompt: z.string().trim().min(1).max(2000),
        tone: z
          .enum([
            "friendly",
            "professional",
            "casual",
            "empathetic",
            "persuasive",
          ])
          .optional(),
        avatarEmoji: z.string().max(10).optional(),
        isDefault: z.boolean().optional(),
        triggerKeywords: z.string().max(2000).optional(), // JSON
        triggerIntents: z.string().max(2000).optional(), // JSON
        shiftStart: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(), // HH:mm
        shiftEnd: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(), // HH:mm
      })
    )
    .mutation(async ({ input, ctx }) =>
      writeTeam(ctx.merchantId, input.expectedRevision, async pool => {
        const merchant = { id: ctx.merchantId };

        checkShift(input.shiftStart, input.shiftEnd);
        // Get max sort order + enforce limit
        const existing = await pool
          .select()
          .from(virtualAgents)
          .where(eq(virtualAgents.merchantId, merchant.id));
        if (existing.length >= 10) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "الحد الأقصى 10 شخصيات",
          });
        }
        // If setting as default, unset existing default
        if (input.isDefault) {
          await pool
            .update(virtualAgents)
            .set({ isDefault: 0 })
            .where(eq(virtualAgents.merchantId, merchant.id));
        }

        const maxSort =
          existing.length > 0
            ? Math.max(...existing.map(a => a.sortOrder))
            : -1;

        const result = await pool.insert(virtualAgents).values({
          merchantId: merchant.id,
          name: input.name,
          role: input.role,
          department: input.department || null,
          personalityPrompt: input.personalityPrompt,
          tone: input.tone || "friendly",
          avatarEmoji: input.avatarEmoji || "👩‍💼",
          isDefault: input.isDefault ? 1 : 0,
          isActive: 1,
          triggerKeywords: input.triggerKeywords || null,
          triggerIntents: input.triggerIntents || null,
          shiftStart: input.shiftStart || null,
          shiftEnd: input.shiftEnd || null,
          sortOrder: maxSort + 1,
        });

        return { success: true, id: result[0].insertId };
      })
    ),

  // Update an agent
  update: permissionProcedure("bot_settings.manage")
    .input(
      z.object({
        expectedRevision,
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(100).optional(),
        role: z.string().trim().min(1).max(100).optional(),
        department: z.string().max(100).optional(),
        personalityPrompt: z.string().trim().min(1).max(2000).optional(),
        tone: z
          .enum([
            "friendly",
            "professional",
            "casual",
            "empathetic",
            "persuasive",
          ])
          .optional(),
        avatarEmoji: z.string().max(10).optional(),
        isDefault: z.boolean().optional(),
        isActive: z.boolean().optional(),
        triggerKeywords: z.string().max(2000).optional(),
        triggerIntents: z.string().max(2000).optional(),
        shiftStart: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable()
          .optional(),
        shiftEnd: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      writeTeam(ctx.merchantId, input.expectedRevision, async pool => {
        const merchant = { id: ctx.merchantId };
        const { id, ...data } = input;

        // Verify ownership
        const existing = await pool
          .select()
          .from(virtualAgents)
          .where(
            and(
              eq(virtualAgents.id, id),
              eq(virtualAgents.merchantId, merchant.id)
            )
          );
        if (!existing.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Agent not found",
          });

        checkShift(
          data.shiftStart !== undefined
            ? data.shiftStart
            : existing[0].shiftStart,
          data.shiftEnd !== undefined ? data.shiftEnd : existing[0].shiftEnd
        );
        // If setting as default, unset existing default
        if (data.isDefault === true) {
          await pool
            .update(virtualAgents)
            .set({ isDefault: 0 })
            .where(eq(virtualAgents.merchantId, merchant.id));
        }

        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.department !== undefined)
          updateData.department = data.department;
        if (data.personalityPrompt !== undefined)
          updateData.personalityPrompt = data.personalityPrompt;
        if (data.tone !== undefined) updateData.tone = data.tone;
        if (data.avatarEmoji !== undefined)
          updateData.avatarEmoji = data.avatarEmoji;
        if (data.isDefault !== undefined)
          updateData.isDefault = data.isDefault ? 1 : 0;
        if (data.isActive !== undefined)
          updateData.isActive = data.isActive ? 1 : 0;
        if (data.triggerKeywords !== undefined)
          updateData.triggerKeywords = data.triggerKeywords;
        if (data.triggerIntents !== undefined)
          updateData.triggerIntents = data.triggerIntents;
        if (data.shiftStart !== undefined)
          updateData.shiftStart = data.shiftStart;
        if (data.shiftEnd !== undefined) updateData.shiftEnd = data.shiftEnd;

        if (Object.keys(updateData).length) {
          await pool
            .update(virtualAgents)
            .set(updateData)
            .where(
              and(
                eq(virtualAgents.id, id),
                eq(virtualAgents.merchantId, merchant.id)
              )
            );
        }

        return { success: true };
      })
    ),

  // Delete an agent
  delete: permissionProcedure("bot_settings.manage")
    .input(z.object({ expectedRevision, id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) =>
      writeTeam(ctx.merchantId, input.expectedRevision, async pool => {
        const merchant = { id: ctx.merchantId };
        const result = await pool
          .delete(virtualAgents)
          .where(
            and(
              eq(virtualAgents.id, input.id),
              eq(virtualAgents.merchantId, merchant.id)
            )
          );
        if (result[0].affectedRows !== 1)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Agent not found",
          });

        return { success: true };
      })
    ),

  // Reorder agents
  reorder: permissionProcedure("bot_settings.manage")
    .input(
      z.object({
        expectedRevision,
        orderedIds: z.array(z.number().int().positive()).max(10),
      })
    )
    .mutation(async ({ input, ctx }) =>
      writeTeam(ctx.merchantId, input.expectedRevision, async pool => {
        const merchant = { id: ctx.merchantId };

        // Validate all IDs belong to this merchant
        const existing = await pool
          .select()
          .from(virtualAgents)
          .where(eq(virtualAgents.merchantId, merchant.id));
        const existingIds = new Set(existing.map(a => a.id));
        const allValid = isCompleteAgentOrder(
          Array.from(existingIds),
          input.orderedIds
        );
        if (!allValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid agent IDs",
          });
        }

        for (let i = 0; i < input.orderedIds.length; i++) {
          await pool
            .update(virtualAgents)
            .set({ sortOrder: i })
            .where(
              and(
                eq(virtualAgents.id, input.orderedIds[i]),
                eq(virtualAgents.merchantId, merchant.id)
              )
            );
        }

        return { success: true };
      })
    ),

  // Seed template agents (convenience)
  seedTemplates: permissionProcedure("bot_settings.manage")
    .input(z.object({ expectedRevision }))
    .mutation(async ({ ctx, input }) =>
      writeTeam(ctx.merchantId, input.expectedRevision, async pool => {
        const merchant = { id: ctx.merchantId };

        // Check if already has agents
        const existing = await pool
          .select()
          .from(virtualAgents)
          .where(eq(virtualAgents.merchantId, merchant.id));
        if (existing.length > 0) {
          return { success: false, message: "Already has agents" };
        }

        const templates = [
          {
            name: "سارة",
            role: "موظفة استقبال",
            department: "الاستقبال",
            personalityPrompt:
              "أنتِ سارة، موظفة استقبال ودودة ومرحبة. ترحبين بالعملاء بحرارة وتوجهينهم للقسم المناسب. أسلوبك دافئ ومحترف.",
            tone: "friendly" as const,
            avatarEmoji: "👩‍💼",
            isDefault: 1,
            triggerKeywords: JSON.stringify([
              "مرحبا",
              "السلام",
              "هلا",
              "أهلين",
            ]),
            triggerIntents: JSON.stringify(["greeting", "general_inquiry"]),
          },
          {
            name: "فهد",
            role: "مسؤول مبيعات",
            department: "المبيعات",
            personalityPrompt:
              "أنت فهد، مسؤول مبيعات خبير ومقنع. تفهم احتياجات العميل وتقدم الحلول المناسبة. أسلوبك واثق ومقنع بدون ضغط.",
            tone: "persuasive" as const,
            avatarEmoji: "👨‍💼",
            isDefault: 0,
            triggerKeywords: JSON.stringify([
              "سعر",
              "كم",
              "شراء",
              "طلب",
              "عرض",
            ]),
            triggerIntents: JSON.stringify([
              "price_inquiry",
              "purchase_intent",
              "product_question",
            ]),
          },
          {
            name: "نورة",
            role: "أخصائية دعم فني",
            department: "الدعم الفني",
            personalityPrompt:
              "أنتِ نورة، أخصائية دعم فني متعاطفة وصبورة. تساعدين العملاء في حل مشاكلهم بأسلوب هادئ ومتفهم.",
            tone: "empathetic" as const,
            avatarEmoji: "👩‍💻",
            isDefault: 0,
            triggerKeywords: JSON.stringify([
              "مشكلة",
              "خطأ",
              "ما يشتغل",
              "ارجاع",
              "استبدال",
              "شكوى",
            ]),
            triggerIntents: JSON.stringify([
              "complaint",
              "support_request",
              "return_request",
            ]),
          },
        ];

        for (let i = 0; i < templates.length; i++) {
          await pool.insert(virtualAgents).values({
            merchantId: merchant.id,
            ...templates[i],
            isActive: 1,
            sortOrder: i,
          });
        }

        return { success: true, count: templates.length };
      })
    ),
});

export type VirtualAgentsRouter = typeof virtualAgentsRouter;
