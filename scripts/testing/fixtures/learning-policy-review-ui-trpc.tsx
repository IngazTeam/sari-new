import { useEffect, useState } from 'react';
import { learningPolicyReviewAr as copy } from '../../../client/src/locales/learning-policy-review';
import { supportedLearningPolicyReviewSuiteDigest } from '../../../client/src/lib/learning-policy-review-version';
const mode = new URL(location.href).searchParams.get('case')?.replace('learning-review-', '') || 'ready';
const ids = ['need','comparison','price','consent','refusal','truth','handoff','injection'] as const;
const suite = { version: 'sales-style-human-review.v1', cases: ids.map(id => ({ id, scenario: copy[`${id}Scenario`], criterion: copy[`${id}Criterion`] })) };
const win = window as any;
const xss = '<img src=x onerror="window.__policyXss=1">' + 'LongUnbrokenValue'.repeat(35);
export const learningPolicyReviewFixture = {
  query: { useQuery: ({ proposalId }: { proposalId: number }) => {
    const [change,setChange] = useState(0), [recovered,setRecovered] = useState(false), [fetching,setFetching] = useState(false), [revoked,setRevoked] = useState(false);
    useEffect(() => {
      win.__policyReads = (win.__policyReads || 0) + 1;
      const changed = () => setChange(n => n + 1), revoked = () => setRevoked(true);
      window.addEventListener('policy-source-change',changed); window.addEventListener('policy-role-change',revoked);
      win.__changePolicySource = () => window.dispatchEvent(new Event('policy-source-change'));
      win.__revokePolicyRole = () => window.dispatchEvent(new Event('policy-role-change'));
      return () => { window.removeEventListener('policy-source-change',changed); window.removeEventListener('policy-role-change',revoked); };
    }, []);
    function value() {
      const saved = win.__policyStored, audited = !!saved || ['passed','failed','stale','xss'].includes(mode);
      const outcome = saved?.cases.some((row: any) => row.candidateVerdict === 'fail') || mode === 'failed' ? 'failed' : 'passed';
      const cases = saved?.cases || ids.map(caseId => ({ caseId, baselineResponse: mode === 'xss' ? xss : 'Synthetic baseline', candidateResponse: 'Synthetic candidate', baselineVerdict:'pass',candidateVerdict:'pass',reason:'Synthetic reviewer rationale, not actual sales evidence.' }));
      const revision = mode==='refresh-stale' ? 0 : (audited ? 1 : 0) + change;
      const receipt = { id: 1, revision, outcome, passedCases: outcome === 'passed' ? 8 : 7, totalCases: 8, regressions: outcome === 'passed' ? 0 : 1, assessment:'human_offline_review',activationAllowed:false };
      return { proposal:{id:proposalId,dimension:'objection_handling',insight:mode === 'xss' ? xss : 'Compare benefits relevant to the customer’s needs.'},
        sourceDigest:(change ? 'c' : 'a').repeat(64), suiteDigest:mode==='changed-suite'?'f'.repeat(64):supportedLearningPolicyReviewSuiteDigest, revision, suite:mode==='unsupported'?{...suite,version:'unrecognized.v2'}:suite,
        eligible:mode !== 'ineligible',canReview:mode !== 'readonly'&&!revoked,independentConversations:3,evidenceLinks:27,activationAllowed:false,
        evidencePreview:[{signalId:21,relation:'supporting',excerpt:mode==='xss'?xss:'Synthetic supporting excerpt'},{signalId:22,relation:'contrary',excerpt:'Synthetic contrary excerpt'}],
        stage:mode==='stale'?'stale':audited?`offline_review_${outcome}`:'not_reviewed',
        history:audited?[{...receipt,current:mode!=='stale',actorUserId:7,createdAt:'2026-09-25T00:00:00Z'}]:[],
        latestReview:audited?{...receipt,proposal:{insight:mode==='xss'?xss:'Proposal at review time'},assessmentDetail:{kind:'human_offline_review',suite,styleOnly:true,cases}}:null };
    }
    const isError=(mode==='error'&&!recovered)||(mode==='refresh-error'&&recovered);
    return { data:mode==='loading'?undefined:value(),isLoading:mode==='loading',isError,isFetching:fetching||mode==='fetching'||mode==='loading',
      refetch:async()=>{setFetching(true);win.__policyRefreshes=(win.__policyRefreshes||0)+1;await new Promise(r=>setTimeout(r,250));setRecovered(true);setFetching(false);
        const data=value();return{isError:mode==='refresh-error',data:mode==='refresh-stale'?{...data,revision:0}:data};} };
  } },
  mutation: { useMutation: () => {
    const [pending,setPending]=useState(false);
    return {isPending:pending,mutateAsync:async(input:any)=>{
      setPending(true);win.__policyInputs=[...(win.__policyInputs||[]),structuredClone(input)];await new Promise(r=>setTimeout(r,200));setPending(false);
      if(mode==='write-conflict')throw {data:{code:'PRECONDITION_FAILED'},message:'private SQL diagnostics'};
      if(mode==='write-outage'&&win.__policyInputs.length===1)throw Error('private transport failure');
      win.__policyStored ||= structuredClone(input);
      if(mode==='write-unknown'&&win.__policyInputs.length===1)throw Error('private commit acknowledgement');
      return{revision:1,outcome:input.cases.some((row:any)=>row.candidateVerdict==='fail')?'failed':'passed',activationAllowed:false};
    }};
  } },
};
