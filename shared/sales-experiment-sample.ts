import { z } from 'zod';

export const salesExperimentSample = z.object({
  minimumCustomersPerArm: z.number().int().min(30).max(1_000_000),
  baselineConversionBps: z.number().int().min(1).max(9999), minimumAbsoluteLiftBps: z.number().int().min(1).max(9999),
  alphaBps: z.literal(500), powerBps: z.literal(8000), calculationReference: z.string().trim().min(30).max(3000),
}).strict().refine(s => s.baselineConversionBps + s.minimumAbsoluteLiftBps < 10000, 'Baseline plus lift must be below 100%');

export const salesSampleCalculation = z.object({
  version: z.literal('equal-proportions-normal.v1'), scope: z.literal('approximate_planning_only'),
  baselineConversionBps: z.number().int().positive(), targetConversionBps: z.number().int().positive(),
  alphaBps: z.literal(500), powerBps: z.literal(8000), sides: z.literal(2),
  plannedPerArm: z.number().int().positive(), powerFloorPerArm: z.number().int().positive(), approximationFloorPerArm: z.number().int().positive(),
  requiredPerArm: z.number().int().positive(), requiredTotal: z.number().int().positive(), shortfallPerArm: z.number().int().nonnegative(),
  status: z.enum(['meets_calculated_floor', 'insufficient', 'exceeds_platform_limit']), activationAllowed: z.literal(false),
}).strict();
export type SalesSampleCalculation = z.infer<typeof salesSampleCalculation>;

/** Two independent binomial proportions, equal allocation, no continuity correction.
 * Solve the conventional normal planning equation for 80% power, two-sided alpha .05.
 * Counts exclude rejection in the opposite tail (conservative, R strict=FALSE convention).
 * The 10 expected successes/failures rule is an additional approximation guard.
 * This does not validate independence, baseline truth, recruitment or launch approval.
 */
export function calculateSalesExperimentSample(value: unknown): SalesSampleCalculation {
  const s = salesExperimentSample.parse(value), p = s.baselineConversionBps / 10000,
    q = (s.baselineConversionBps + s.minimumAbsoluteLiftBps) / 10000, delta = s.minimumAbsoluteLiftBps / 10000,
    mean = (p + q) / 2;
  // Standard normal quantiles Φ⁻¹(.975) and Φ⁻¹(.8), fixed by this version's contract.
  const zAlpha = 1.959963984540054, zPower = 0.8416212335729143;
  const powerFloorPerArm = Math.ceil(((zAlpha * Math.sqrt(2 * mean * (1 - mean)) + zPower * Math.sqrt(p * (1 - p) + q * (1 - q))) / delta) ** 2);
  // Integer basis points avoid rounding a count such as 10 / .0001 above 100,000.
  const approximationFloorPerArm = Math.ceil(100000 / Math.min(s.baselineConversionBps, 10000 - s.baselineConversionBps,
    s.baselineConversionBps + s.minimumAbsoluteLiftBps, 10000 - s.baselineConversionBps - s.minimumAbsoluteLiftBps));
  const requiredPerArm = Math.max(30, powerFloorPerArm, approximationFloorPerArm);
  return salesSampleCalculation.parse({ version: 'equal-proportions-normal.v1', scope: 'approximate_planning_only',
    baselineConversionBps: s.baselineConversionBps, targetConversionBps: s.baselineConversionBps + s.minimumAbsoluteLiftBps,
    alphaBps: 500, powerBps: 8000, sides: 2, plannedPerArm: s.minimumCustomersPerArm, powerFloorPerArm, approximationFloorPerArm,
    requiredPerArm, requiredTotal: requiredPerArm * 2, shortfallPerArm: Math.max(0, requiredPerArm - s.minimumCustomersPerArm),
    status: requiredPerArm > 1_000_000 ? 'exceeds_platform_limit' : s.minimumCustomersPerArm < requiredPerArm ? 'insufficient' : 'meets_calculated_floor',
    activationAllowed: false });
}

export function matchesSalesSampleCalculation(value: unknown, sample: unknown) {
  const parsed = salesSampleCalculation.safeParse(value), input = salesExperimentSample.safeParse(sample);
  if (!parsed.success || !input.success) return false;
  const expected = calculateSalesExperimentSample(input.data);
  return (Object.keys(expected) as Array<keyof SalesSampleCalculation>).every(key => parsed.data[key] === expected[key]);
}
