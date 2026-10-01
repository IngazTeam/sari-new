import { useLocation, useSearch } from "wouter";
export const brainViewIds = ["overview", "sources", "knowledge", "sales", "testing", "history"] as const;
export const knowledgePaneIds = ["sections", "conflicts", "faq", "pages"] as const;
export type BrainView = typeof brainViewIds[number];
export type KnowledgePane = typeof knowledgePaneIds[number];
export function readBrainNavigation(search: string) {
  const params = new URLSearchParams(search), view = params.get("view"), pane = params.get("pane");
  return {
    brainView: brainViewIds.includes(view as BrainView) ? view as BrainView : "overview" as const,
    knowledgePane: knowledgePaneIds.includes(pane as KnowledgePane) ? pane as KnowledgePane : "sections" as const,
  };
}
export function brainNavigationUrl(href: string, view: BrainView, pane?: KnowledgePane) {
  if (!brainViewIds.includes(view) || (pane !== undefined && !knowledgePaneIds.includes(pane))) throw Error("Invalid brain destination");
  const url = new URL(href);
  url.searchParams.set("view", view);
  // Retain the last pane when changing main tabs, including across reloads.
  if (pane !== undefined) url.searchParams.set("pane", pane);
  else if (view === "knowledge") url.searchParams.set("pane", readBrainNavigation(url.search).knowledgePane);
  return url.pathname + url.search + url.hash;
}
export function useBrainNavigation() {
  const search = useSearch(), [, navigate] = useLocation();
  const state = readBrainNavigation(search);
  const changeBrainView = (view: BrainView, pane?: KnowledgePane) => {
    const next = brainNavigationUrl(window.location.href, view, pane);
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (current !== next) navigate(next, { state: window.history.state });
  };
  return { ...state, changeBrainView, setKnowledgePane: (pane: KnowledgePane) => changeBrainView("knowledge", pane) };
}
