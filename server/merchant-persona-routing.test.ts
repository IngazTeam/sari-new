import { describe, expect, it } from 'vitest';
import { agentLocalTime, isAgentOnShift, selectVirtualAgent, moveAgentIds, isCompleteAgentOrder } from '../shared/virtual-agent-routing';

const agent = (id:number, extra:Record<string,unknown>={}) => ({id, isActive:1, isDefault:0, sortOrder:id, triggerKeywords:'["سعر"]', shiftStart:null, shiftEnd:null, ...extra});
describe('virtual persona routing matches the merchant preview',()=>{
  it.each([
    ['09:00','17:00','09:00',true],['09:00','17:00','16:59',true],['09:00','17:00','17:00',false],
    ['22:00','06:00','23:59',true],['22:00','06:00','00:00',true],['22:00','06:00','05:59',true],
    ['22:00','06:00','06:00',false],['22:00','06:00','18:00',false],['09:00','09:00','09:00',false],
    ['25:00','06:00','05:00',false],['09:00',null,'12:00',false],[null,null,'12:00',true],
  ])('evaluates %s–%s at %s', (start,end,time,expected)=>expect(isAgentOnShift(start,end,time!)).toBe(expected));
  it('uses Riyadh time regardless of server zone',()=>expect(agentLocalTime(new Date('2026-09-28T21:30:00Z'))).toBe('00:30'));
  it('uses saved priority for overlapping words without mutating the query result',()=>{
    const agents=[agent(9,{sortOrder:0}),agent(1,{sortOrder:2,isDefault:1})];
    expect(selectVirtualAgent(agents,'كم السعر؟','12:00')).toMatchObject({agent:{id:9},reason:'keyword'});
    expect(agents.map(a=>a.id)).toEqual([9,1]);
  });
  it('uses only an available default, then the first available persona',()=>{
    const agents=[agent(1,{isDefault:1,shiftStart:'22:00',shiftEnd:'06:00'}),agent(2)];
    expect(selectVirtualAgent(agents,'مرحبا','23:00')).toMatchObject({agent:{id:1},reason:'default'});
    expect(selectVirtualAgent(agents,'مرحبا','12:00')).toMatchObject({agent:{id:2},reason:'order'});
    expect(selectVirtualAgent([agents[0]],'سعر','12:00')).toBeNull();
    expect(selectVirtualAgent([agent(3,{isActive:0})],'سعر','23:00')).toBeNull();
  });
  it('ignores malformed and empty keywords and matches case-insensitively',()=>{
    const agents=[agent(1,{triggerKeywords:'["",7,null]'}),agent(2,{triggerKeywords:'[" PRICE "]'})];
    expect(selectVirtualAgent(agents,'Price please','12:00')).toMatchObject({agent:{id:2},reason:'keyword'});
    expect(selectVirtualAgent([agent(1,{triggerKeywords:'{}'})],'anything','12:00')?.reason).toBe('order');
  });
  it('reorders only adjacent existing IDs and validates complete unique tenant membership',()=>{
    const ids=[1,2,3];expect(moveAgentIds(ids,2,-1)).toEqual([2,1,3]);expect(ids).toEqual([1,2,3]);
    expect(moveAgentIds(ids,1,-1)).toEqual(ids);expect(moveAgentIds(ids,9,1)).toEqual(ids);
    expect(isCompleteAgentOrder(ids,[3,1,2])).toBe(true);
    for(const bad of [[1,1,3],[1,2],[1,2,99],[]])expect(isCompleteAgentOrder(ids,bad)).toBe(false);
  });
});
