/** Legacy bot_settings stores three tones; the fourth lives in personality settings. */
export function effectiveAssistantTone(
  botTone: string | null | undefined,
  personalityTone: string | null | undefined
) {
  if (
    personalityTone === "enthusiastic" &&
    (!botTone || botTone === "friendly")
  )
    return "enthusiastic";
  return botTone || personalityTone || "friendly";
}

export function assistantSettingsView<B extends { tone: string }>(
  bot: B,
  personality: {
    tone: string;
    style: string;
    emojiUsage: string;
    customInstructions: string | null;
    brandVoice: string | null;
  }
) {
  return {
    ...bot,
    tone: effectiveAssistantTone(bot.tone, personality.tone) as
      | "friendly"
      | "professional"
      | "casual"
      | "enthusiastic",
    style: personality.style as
      | "saudi_dialect"
      | "formal_arabic"
      | "english"
      | "bilingual",
    emojiUsage: personality.emojiUsage as
      | "none"
      | "minimal"
      | "moderate"
      | "frequent",
    personalityInstructions: personality.customInstructions ?? "",
    brandVoice: personality.brandVoice ?? "",
  };
}
