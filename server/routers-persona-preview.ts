import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import {
  personaPreviewInput,
  PersonaPreviewUnavailable,
} from "../shared/persona-preview";
import { getMerchantVirtualAgent } from "./ai/virtual-agent-context";
import { previewRateLimit } from "./routers-test-workspace";

export const personaPreviewProcedure = permissionProcedure(
  "bot_settings.manage"
)
  .input(personaPreviewInput)
  .mutation(async ({ ctx, input }) => {
    previewRateLimit(ctx.merchantId, ctx.user.id);
    try {
      const { previewSari } = await import("./ai/sari-preview");
      if (input.mode === "automatic") {
        const result = await previewSari({
          merchantId: ctx.merchantId,
          userId: ctx.user.id,
          message: input.message,
          history: input.history,
          historyTruncated: input.historyTruncated,
          automaticPersona: {
            time: input.time,
            currentAgentId: input.currentAgentId,
          },
        });
        return { ...result, time: input.time };
      }
      // Resolve from current persisted rows, never trust a prompt or selection sent by the client.
      const selection = {
        agent: await getMerchantVirtualAgent(ctx.merchantId, input.agentId),
        reason: "manual" as const,
      };
      if (!selection?.agent)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No saved persona available for this preview",
        });
      const { agent, reason } = selection;
      const result = await previewSari({
        merchantId: ctx.merchantId,
        userId: ctx.user.id,
        message: input.message,
        history: [],
        historyTruncated: false,
        persona: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          department: agent.department,
          tone: agent.tone,
          personalityPrompt: agent.personalityPrompt,
        },
      });
      return {
        ...result,
        persona: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          isActive: Boolean(agent.isActive),
          reason,
        },
        time: null,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof PersonaPreviewUnavailable)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No saved persona available for this preview",
        });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Persona preview unavailable",
      });
    }
  });
