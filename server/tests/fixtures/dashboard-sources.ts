import type {DashboardSources} from '../../../shared/dashboard-sources';
export function dashboardSourcesFixture(merchantId=20):DashboardSources{return {
 version:1,merchantId,checkedAt:'2026-10-01T12:00:00Z',audience:{kind:'customers',count:2},integration:{source:'none',state:'not_connected',records:[]},
 groups:{merchantId,businessName:'Fixture store',documents:{total:2,textReady:1,empty:0,pending:0,processing:0,failed:1,latestUploadedAt:'2026-09-30T12:00:00Z',removalAnchorId:1},products:{total:2,visible:1,activeVisible:1,latestModifiedAt:null},website:{analyses:0,pages:0,enabledPages:0,pagesWithText:0,latestAnalysisAt:null,latestPageUpdateAt:null,removalAnchorId:null},faqs:{total:0,enabled:0,archived:0,latestModifiedAt:null},sections:{total:0,switchedOn:0,latestModifiedAt:null},settings:{createdAt:null,modifiedAt:null}},
};}
