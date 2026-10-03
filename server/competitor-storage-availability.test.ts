import { expect, it, vi } from 'vitest';
vi.mock('./db/connection', async original => ({ ...(await original<typeof import('./db/connection')>()), getDb: async () => null }));
import { getCompetitorAnalysisById, getCompetitorAnalysesByMerchant } from './db';
it('does not turn absent storage into a successful empty competitor list', async () => {
  await expect(getCompetitorAnalysesByMerchant(20)).rejects.toThrow('Competitor storage unavailable');
});
it('does not turn absent storage into a not-found competitor result', async () => {
  await expect(getCompetitorAnalysisById(8)).rejects.toThrow('Competitor storage unavailable');
});
