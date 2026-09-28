import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import { personaPreviewInput } from "../shared/persona-preview";
import { selectVirtualAgent } from "../shared/virtual-agent-routing";
import {
  getMerchantVirtualAgent,
  listMerchantVirtualAgents,
} from "./ai/virtual-agent-context";
import { previewRateLimit } from "./routers-test-workspace";

export const personaPreviewProcedure = permissionProcedure(
  "bot_settings.manage"
)
  .input(personaPreviewInput)
  .mutation(async ({ ctx, input }) => {
    previewRateLimit(ctx.merchantId, ctx.user.id);
    try {
      // Resolve from current persisted rows, never trust a prompt or selection sent by the client.
      const selection =
        input.mode === "manual"
          ? {
              agent: await getMerchantVirtualAgent(
                ctx.merchantId,
                input.agentId
              ),
              reason: "manual" as const,
            }
          : selectVirtualAgent(
              await listMerchantVirtualAgents(ctx.merchantId),
              input.message,
              input.time
            );
      if (!selection?.agent)
        throw new TRPCError({
          code: input.mode === "manual" ? "NOT_FOUND" : "PRECONDITION_FAILED",
          message: "No saved persona available for this preview",
        });
      const { agent, reason } = selection;
      const { previewSari } = await import("./ai/sari-preview");
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
        time: input.mode === "automatic" ? input.time : null,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Persona preview unavailable",
      });
    }
  });
