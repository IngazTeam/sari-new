/** Owner-reported snapshot; not an analytics export or a retention cohort. */
export const PUBLIC_EVIDENCE = {
  asOf: '2026-09-19',
  source: 'owner_report',
  payingActiveClients: 12,
  operatingMonths: 4,
  sectors: ['training', 'recruitment', 'commerce'],
} as const;
