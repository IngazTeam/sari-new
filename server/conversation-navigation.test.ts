import {expect,it} from 'vitest';
import {conversationNavigation,conversationHref} from '../client/src/lib/conversation-navigation';
it('reads a combined pipeline link and direct conversation id',()=>{
  expect(conversationNavigation('phone=%20ساري%20&page=2&conversationId=53&stage=stalled&needs_human=1')).toEqual({search:'ساري',page:2,conversationId:53,stage:'stalled',needsHuman:true});
});
it.each(['-1','0','1.5','1e2','Infinity','NaN','9007199254740992','x','01',''])('rejects invalid integer route values %s',value=>{
  const result=conversationNavigation(`page=${value}&conversationId=${value}`);expect(result.page).toBe(1);expect(result.conversationId).toBeNull();
});
it('bounds page and search inputs and ignores unsupported filters',()=>{
  const result=conversationNavigation('page=100001&phone='+encodeURIComponent('a'.repeat(201))+'&stage=unknown&needs_human=true');
  expect(result.page).toBe(1);expect(result.search).toHaveLength(200);expect(result.stage).toBeUndefined();expect(result.needsHuman).toBeUndefined();
});
it('patches one selection without losing combined filters or language',()=>{
  const href=conversationHref('/merchant/conversations','phone=ABC&stage=ready&needs_human=1&lang=en&page=2',{conversationId:7,page:null});
  const params=new URL(href,'https://local.test').searchParams;expect(Object.fromEntries(params)).toEqual({phone:'ABC',stage:'ready',needs_human:'1',lang:'en',conversationId:'7'});
});
it('encodes a search as data and removes empty parameters',()=>{
  const href=conversationHref('/merchant/conversations','phone=old&conversationId=7',{phone:'أحمد & stage=lost',conversationId:null});
  expect(conversationNavigation(href.split('?')[1]).search).toBe('أحمد & stage=lost');expect(conversationNavigation(href.split('?')[1]).stage).toBeUndefined();
  expect(conversationHref('/merchant/conversations','page=2',{page:null})).toBe('/merchant/conversations');
});
