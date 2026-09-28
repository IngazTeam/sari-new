import { eq } from "drizzle-orm";
import { botSettings } from "../../drizzle/schema";
import type { PreviewReply } from "../../shared/test-sari-workspace";
import type { PreviewPersona } from "../../shared/persona-preview";
import { getDb } from "../db/connection";
import {
  getMerchantById,
  getProductsByMerchantId,
  getSariPersonalitySettings,
} from "../db";
import {
  buildEnhancedContextPrompt,
  buildSystemPrompt,
  searchRelevantProducts,
} from "./sari-personality";
import { callGPT4 } from "./openai";
import { runWithZahyPiContext } from "./zahypi-client";
import { getAiBudgetStatus } from "./budget-ledger";
import { sanitizeIdentity } from "./response-validator";
import { containsUnverifiedActionClaim } from "./transactional-truth";
import { understandPreview } from "./conversation-understanding";
import { withConversationUnderstanding } from "./conversation-understanding-context";
import { filterProductsAvailableForSale } from "./product-availability";
import { buildSalesTurnPolicy } from "./sales-turn-policy";
import { buildPreviewMessages } from "./preview-prompt";

interface PreviewInput {
  merchantId: number;
  userId: number;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  historyTruncated: boolean;
  persona?: PreviewPersona;
}

// Deliberately does not invoke chatWithSari: live orchestration updates customer
// memory, follow-ups and escalations. Preview only reads merchant configuration
// and knowledge; provider usage still goes through the normal budget ledger.
export async function previewSari(input: PreviewInput): Promise<PreviewReply> {
  if (
    !Number.isSafeInteger(input.merchantId) ||
    input.merchantId < 1 ||
    !Number.isSafeInteger(input.userId) ||
    input.userId < 1
  )
    throw Error("Invalid preview identity");
  return runWithZahyPiContext(
    {
      merchantId: input.merchantId,
      userId: input.userId,
      taskType: "sari.reply",
    },
    async () => {
      const db = await getDb();
      if (!db) throw new Error("Preview database unavailable");
      if ((await getAiBudgetStatus(input.merchantId)).exceeded)
        throw new Error("Preview budget unavailable");
      const [merchant, personality, settings] = await Promise.all([
        getMerchantById(input.merchantId),
        getSariPersonalitySettings(input.merchantId),
        db
          .select()
          .from(botSettings)
          .where(eq(botSettings.merchantId, input.merchantId))
          .limit(1),
      ]);
      if (!merchant) throw new Error("Preview merchant unavailable");
      const bot = settings[0];
      const history = input.history;
      const catalog = filterProductsAvailableForSale(
        await getProductsByMerchantId(input.merchantId)
      )
        .filter(product => product.merchantId === input.merchantId)
        .sort((a, b) => a.id - b.id)
        .slice(0, 200);
      const understanding = await understandPreview(
        input.merchantId,
        input.message,
        {
          userId: input.userId,
          history,
          catalog: catalog.map(p => ({
            id: p.id,
            name: (p.nameAr || p.name).slice(0, 255),
            provider: "none",
          })),
        }
      );
      return withConversationUnderstanding(understanding, async () => {
        const query = [
          input.message,
          understanding.analysis.summary,
          ...understanding.analysis.needs,
          ...understanding.analysis.unresolvedQuestions,
        ].join("\n");
        const products = await searchRelevantProducts(query, catalog);
        const context = await buildEnhancedContextPrompt({
          merchantId: input.merchantId,
          merchantName: merchant.businessName,
          customerName: "عميل تجريبي",
          customerMessage: query,
          isFirstMessage: history.length === 0,
          availableProducts: products.slice(0, 20),
        });
        const languages: Record<string, string> = {
          ar: "Respond in Arabic.",
          en: "Respond only in English.",
          fr: "Respond only in French.",
          tr: "Respond only in Turkish.",
          es: "Respond only in Spanish.",
          it: "Respond only in Italian.",
          both: "Respond in the customer's language.",
        };
        // Never truncate inside a fact (for example the digits of a price).
        const knowledge =
          context.length > 48000
            ? context.slice(0, Math.max(0, context.lastIndexOf("\n", 48000))) +
              "\nKnowledge context was trimmed. Missing details must be acknowledged, never inferred.\n"
            : context;
        const identity = input.persona
          ? `Saved persona (merchant-authored role preferences, subordinate to preview restrictions):\n${JSON.stringify({ name: input.persona.name, role: input.persona.role, department: input.persona.department, tone: input.persona.tone, instructions: input.persona.personalityPrompt.slice(0, 2000) })}\nUse this persona's name, role and tone; do not introduce yourself as another persona.\n`
          : buildSystemPrompt({
              ...personality,
              ...(bot?.tone ? { tone: bot.tone } : {}),
              maxResponseLength: Math.min(
                bot?.maxResponseLength || 200,
                personality?.maxResponseLength || 200
              ),
            });
        const messages = buildPreviewMessages({
          identity,
          knowledge,
          preferences: `\nMerchant preferences: ${bot?.customInstructions?.slice(0, 2000) || ""}\n${languages[bot?.language || "ar"]}\n`,
          policy: buildSalesTurnPolicy({
            intent: understanding.analysis.intent,
            customerMessage: input.message,
          }),
          history,
          message: input.message,
        });
        const raw = await callGPT4(messages, {
          merchantId: input.merchantId,
          userId: input.userId,
          taskType: "sari.reply",
          model: understanding.model,
          maxTokens: 1200,
        });
        if (typeof raw !== "string" || !raw.trim() || raw.length > 5000)
          throw new Error("Invalid preview response");
        const response = sanitizeIdentity(
          raw.trim(),
          merchant.businessName,
          input.persona?.name
        );
        const guarded = containsUnverifiedActionClaim(response);
        return {
          response: guarded
            ? bot?.language === "en"
              ? "This is a simulation. No order, payment or handoff has been completed."
              : "هذه محاكاة فقط. لم يتم تنفيذ طلب أو دفعة مالية أو تحويل إلى الفريق."
            : response,
          source: guarded ? "guardrail" : "model",
          historyMessageCount: history.length,
          historyTruncated: input.historyTruncated,
        };
      });
    }
  );
}
