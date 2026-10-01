import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));
vi.mock('./db/connection',()=>({getDb:mocks.db}));
import {readCampaignPerformance,CampaignWorkspaceUnavailableError} from './campaign-workspace';
beforeEach(()=>{mocks.db.mockReset();mocks.db.mockResolvedValue(null);});
it.each([{days:0},{days:1},{days:7.5},{days:365},{days:'7'},{actorId:7},{merchantId:8}])('rejects invalid or forged scope %j before reading storage',async input=>{await expect(readCampaignPerformance(1,2,input)).rejects.toThrow();expect(mocks.db).not.toHaveBeenCalled();});
it.each([0,-1,NaN,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects unsafe identities %s',async id=>{await expect(readCampaignPerformance(id,2,{})).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);await expect(readCampaignPerformance(1,id,{})).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);expect(mocks.db).not.toHaveBeenCalled();});
it('rejects an invalid clock without fabricating a date window',async()=>{await expect(readCampaignPerformance(1,2,{},new Date(NaN))).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);expect(mocks.db).not.toHaveBeenCalled();});
it('sanitizes storage outages instead of showing a successful empty period',async()=>{await expect(readCampaignPerformance(1,2,{})).rejects.toThrow('Campaign workspace is unavailable');mocks.db.mockRejectedValue(Error('PRIVATE SQL'));await expect(readCampaignPerformance(1,2,{})).rejects.toThrow('Campaign workspace is unavailable');});
