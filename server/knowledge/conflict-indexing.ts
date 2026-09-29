// Keep the existing best-effort indexing after the atomic decision. A provider
// failure must never turn a committed decision into a reported rollback.
export async function indexApprovedConflict(
  merchantId: number,
  sectionId: number
): Promise<"ready" | "unconfirmed"> {
  try {
    const { getSectionById } = await import("../db/knowledge");
    const { embedSection } = await import("../ai/rag-engine");
    const section = await getSectionById(sectionId, merchantId);
    if (!section) return "unconfirmed";
    return (await embedSection(section, merchantId)) ? "ready" : "unconfirmed";
  } catch {
    return "unconfirmed";
  }
}
