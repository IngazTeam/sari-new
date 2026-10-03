import {expect,it} from 'vitest';
import {competitorComparisonInput,competitorComparisonChoices} from '../shared/competitor-comparison';
it.each([{analysisId:0,competitorIds:[1]},{analysisId:1,competitorIds:[]},{analysisId:1,competitorIds:[1,1]},{analysisId:1,competitorIds:[1,2,3,4,5,6]},{analysisId:1,competitorIds:[-1]},{analysisId:1,competitorIds:[1],merchantId:5},{analysisId:1,competitorIds:[1],actorId:7}])('rejects incomplete or forged comparison selection %j',input=>expect(competitorComparisonInput.safeParse(input).success).toBe(false));
it.each([{source:'UNION'},{source:'website',page:0},{source:'website',query:'x'.repeat(201)},{source:'website',merchantId:2}])('rejects invalid choices selection %j',input=>expect(competitorComparisonChoices.safeParse(input).success).toBe(false));
