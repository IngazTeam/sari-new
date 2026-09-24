import { describe, expect, it } from 'vitest';
import {
  SETUP_STAGE_ENDS,
  setupStageForStep,
  setupStageAvailable,
  completedSetupStage,
} from '../client/src/lib/merchant-setup-navigation';

describe('short merchant setup and existing drafts', () => {
  it.each([
    [1, 0], [2, 0], [3, 0], [4, 1], [5, 1], [6, 1],
    [7, 2], [8, 2], [9, 2], [10, 3],
  ])('restores legacy step %i into visible stage %i', (legacyStep, visibleStage) => {
    expect(setupStageForStep(legacyStep)).toBe(visibleStage);
  });

  it('allows only the first screen for a new account', () => {
    expect(SETUP_STAGE_ENDS.map((_, stage) => setupStageAvailable(stage, []))).toEqual([true, false, false, false]);
  });

  it('can resume an old draft mid-catalog and review its earlier profile', () => {
    const completed = [1, 2, 3, 4];
    expect(setupStageAvailable(0, completed)).toBe(true);
    expect(setupStageAvailable(setupStageForStep(5), completed)).toBe(true);
    expect(setupStageAvailable(2, completed)).toBe(false);
  });

  it('completes the grouped legacy steps without duplicates when going back and forward', () => {
    const completed = completedSetupStage(0, [1, 2]);
    expect(completed).toEqual([1, 2, 3]);
    expect(completedSetupStage(0, completed)).toEqual(completed);
    expect(setupStageAvailable(1, completed)).toBe(true);
  });

  it('keeps final confirmation outstanding after all three input screens', () => {
    let completed: number[] = [];
    for (const stage of [0, 1, 2]) completed = completedSetupStage(stage, completed);
    expect(completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(completed).not.toContain(10);
    expect(setupStageAvailable(3, completed)).toBe(true);
  });

  it('preserves later completed steps when editing an earlier screen', () => {
    expect(completedSetupStage(0, [1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
