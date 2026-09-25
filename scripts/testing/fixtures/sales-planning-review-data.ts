import { outputCaseIds, supportedOutputRubricDigest } from '../../../client/src/lib/learning-policy-evaluation-state';
import { getSalesSectorPlaybook } from '../../../shared/sales-sector-playbooks';
import { calculateSalesExperimentSample } from '../../../shared/sales-experiment-sample';
import { syntheticSalesExperimentDesign } from '../../../server/tests/helpers/sales-experiment-design';

export function planningReviewFixtureRecord(): any {
  const design = syntheticSalesExperimentDesign(), registeredAt = new Date(Date.now() - 86400000).toISOString();
  return { protocolId: 45, protocolDigest: '5'.repeat(64), state: 'registered', eligibility: 'not_checked', activationAllowed: false, experimentStarted: false,
    actorUserId: 7, createdAt: registeredAt, withdrawal: null, protocol: { version: 'sales-experiment-protocol.v1', merchantId: 20, registeredAt,
      candidate: { id: 4, artifactDigest: 'c'.repeat(64), baselineDigest: 'b'.repeat(64), sourceDigest: 'a'.repeat(64), preparationReviewId: 2 },
      sector: { revision: 0, playbook: getSalesSectorPlaybook('general'), digest: 'd'.repeat(64) }, design,
      sampleCalculation: calculateSalesExperimentSample(design.sample), sampleAdequacy: 'not_independently_verified', cohortExecution: 'not_implemented', activationAllowed: false } };
}
export function planningReviewFixtureWorkspace(record = planningReviewFixtureRecord()): any {
  const now = new Date().toISOString();
  const basis = { version: 'sales-experiment-review-basis.v1', merchantId: 20, protocolId: 45, protocolDigest: record.protocolDigest,
    cohortId: 6, cohortDigest: '6'.repeat(64), candidateId: 4, artifactDigest: 'c'.repeat(64), sourceDigest: 'a'.repeat(64), sectorDigest: 'd'.repeat(64),
    runId: 9, runDigest: '9'.repeat(64), routeDigest: '8'.repeat(64), provider: 'openai', model: 'fixture-model', observedModel: 'fixture-model',
    outputReviewId: 7, outputReviewRevision: 1, outputReviewDigest: '7'.repeat(64), rubricDigest: supportedOutputRubricDigest, participantUserIds: [7] };
  const pairs = outputCaseIds.map((caseId, i) => ({ caseId, sector: caseId.split(':')[0], criterion: 'Explain value accurately without pressure or invented promises.',
    userPrompt: `المقارنة ${i + 1}: أريد معرفة الخيار الأنسب لاحتياجي قبل الشراء.`, systemPrompt: 'Fixture context: explain the recorded offer, respect the customer and verify the price.', candidateStyleInstruction: 'اربط المزايا باحتياج العميل، ثم اقترح خطوة واحدة واضحة.',
    ...Object.fromEntries(['baseline', 'candidate'].map((arm, offset) => [arm, { ordinal: i * 2 + offset, caseId, arm, inputDigest: 'a'.repeat(64), reservationKey: 'b'.repeat(64),
      response: arm === 'baseline' ? 'يمكنك الاطلاع على الخيارات المتاحة. أخبرني بما تحتاجه وسأساعدك في المقارنة.' : 'يساعدك هذا الخيار على تنظيم طلباتك ومتابعة العملاء من مكان واحد. ما أهم نتيجة تريد تحقيقها الآن؟',
      metadata: { id: 'fixture', model: 'fixture-model', finishReason: 'stop', usage: { prompt_tokens: 20, completion_tokens: 10 } }, responseDigest: 'd'.repeat(64) }])) }));
  const cases = pairs.map((pair: any) => ({ caseId: pair.caseId, baseline: { verdict: 'pass', quote: pair.baseline.response, reason: 'Accurate baseline response without an invented claim.' },
    candidate: { verdict: 'pass', quote: pair.candidate.response, reason: 'Connects the product benefit to the customer need without pressure.' }, preference: 'candidate' }));
  return { basis, basisDigest: 'e'.repeat(64), checkedAt: now, reviewerUserId: 8, expectedRevision: 0, canReview: true, stage: 'not_reviewed', latestReview: null,
    planningReviewCurrent: false, activationAllowed: false, experimentStarted: false, evidence: { protocol: structuredClone(record),
      cohort: { cohortId: 6, cohortDigest: '6'.repeat(64), actorUserId: 7, createdAt: now, eligibility: 'not_checked', activationAllowed: false, experimentStarted: false,
        snapshot: { version: 'sales-cohort-snapshot.v1', merchantId: 20, protocolId: 45, protocolDigest: record.protocolDigest, frozenAt: now,
          population: record.protocol.design.cohort.population, enrollmentStartsAt: record.protocol.design.window.enrollmentStartsAt, enrollmentEndsAt: record.protocol.design.window.enrollmentEndsAt,
          rules: { version: 'sales-cohort-rules.v1', historyDefinition: 'owned_inbound_before_enrollment', messageType: 'text', minimumCharacters: 3, maximumCharacters: 4000,
            requiredAnyTerms: [], allowedDealStages: ['interested', 'new', 'qualified', 'ready'], excludedPhones: [], requireActiveConversation: true, excludeHumanTakeover: true, requireLatestInbound: true, requirePostHandoffInbound: true },
          matchesRegisteredDefinition: true, mappingReview: 'The frozen predicates reflect the registered definition and exclusions.', mappingApproval: 'operator_attestation_only', activationAllowed: false } },
      pairs, outputReview: { kind: 'human_paired_output_review', runId: 9, runDigest: basis.runDigest, revision: 1, rubric: { version: 'sales-style-output-human-review.v1' },
        reviewedAllOutputs: true, activationAllowed: false, cases, score: { totalCases: 32, baselinePassed: 32, candidatePassed: 32, regressions: 0, candidateWins: 32, baselineWins: 0, ties: 0, outcome: 'passed' } } } };
}
export function planningReviewFixtureReceipt(w: any, revision = 1): any {
  const reason = 'The supplied evidence supports this synthetic planning assessment with documented limitations.';
  return { reviewId: 100 + revision, reviewDigest: 'f'.repeat(64), reviewerPresent: true, eligibility: 'not_checked', activationAllowed: false, experimentStarted: false,
    snapshot: { version: 'sales-experiment-independent-review.v1', merchantId: 20, protocolId: 45, runId: w.basis.runId, revision,
      reviewerUserId: w.reviewerUserId, reviewedAt: new Date().toISOString(), basis: structuredClone(w.basis), basisDigest: w.basisDigest, verdict: 'approved',
      assessment: { baselineAndSample: reason, recruitmentFeasibility: reason, qualificationMapping: reason, safetyAndMeasurement: reason },
      reviewedFrozenDesignAndOutputs: true, understandsNoActivation: true, scope: 'independent_planning_review', independence: 'distinct_authenticated_user', activationAllowed: false, experimentStarted: false } };
}
