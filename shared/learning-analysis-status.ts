export type LearningAnalysisStatus = {
  state: 'idle' | 'preparing' | 'budget_wait' | 'awaiting_result' | 'uncertain' | 'saved' | 'recovering'
    | 'retry_scheduled' | 'applied' | 'stale' | 'invalid';
  updatedAt: string | null;
  nextAttemptAt: string | null;
  recoveryAttempts: number;
  proposalCount: number | null;
};
