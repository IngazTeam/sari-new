/** Compatibility entry point. Automatic cart sending has no reviewed authority. */
export function startAbandonedCartJob(){
  return {scheduled:false as const,reason:'review_required' as const};
}
