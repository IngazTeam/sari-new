export class ByaanDashboardFault extends Error {
  constructor(readonly reason: 'stale' | 'unavailable' | 'inactive' | 'forbidden' | 'missing' | 'rate_limited' | 'provider') {
    super(`byaan_dashboard:${reason}`);
  }
}
