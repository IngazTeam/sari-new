export class ByaanSyncValidationError extends Error {
  constructor(entity: 'trainee' | 'faq' | 'settings' | 'conversion') {
    super(`Invalid Byaan ${entity} sync entry`);
    this.name = 'ByaanSyncValidationError';
  }
}
