/** Only fixed mockup destinations may leave an embedded preview. */
export type BrainPreviewDestination = "upload" | "documents" | "products" | "pages" | "faqs" | "sections" | "settings" | "conflicts" | "sales";
export function navigateBrainPreview(destination: BrainPreviewDestination): boolean {
  if (window.parent === window || new URLSearchParams(window.location.search).get("embed") !== "brain") return false;
  window.parent.postMessage({ type: "sary-brain-preview", action: "navigate", destination }, window.location.origin);
  return true;
}
