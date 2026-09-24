// Persist the existing 1–10 server contract while presenting four short stages.
// This also keeps older drafts and review links on the appropriate screen.
export const SETUP_STAGE_ENDS = [3, 6, 9, 10] as const;

export function setupStageForStep(step: number): number {
  return Math.max(
    0,
    SETUP_STAGE_ENDS.findIndex(end => step <= end)
  );
}

export function setupStageAvailable(
  stage: number,
  completed: readonly number[]
): boolean {
  return stage === 0 || completed.includes(SETUP_STAGE_ENDS[stage - 1]);
}

export function completedSetupStage(
  stage: number,
  completed: readonly number[]
): number[] {
  const start = stage === 0 ? 1 : SETUP_STAGE_ENDS[stage - 1] + 1;
  const end = SETUP_STAGE_ENDS[stage];
  return Array.from(
    new Set([
      ...completed,
      ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ]),
  );
}
