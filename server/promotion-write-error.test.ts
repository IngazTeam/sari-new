import {it,expect} from 'vitest';
import {promotionWriteError} from '../client/src/lib/promotion-write-error';
import {promotionWritesAr,promotionWritesEn} from '../client/src/locales/promotion-writes';
it.each([promotionWritesAr,promotionWritesEn])('explains code boundaries without exposing internal failures',copy=>{const t=(key:string)=>copy[key.split('.').at(-1) as keyof typeof copy];for(const key of ['code_scope','code_start','code_quantity','code_expired','invalid','limit','forbidden','missing','unknown'] as const)expect(promotionWriteError(Error('promotion_write:'+key),t)).toBe(copy[key]);expect(promotionWriteError(Error('PRIVATE SQL'),t)).toBe(copy.unavailable);});
it('keeps both language dictionaries complete',()=>expect(Object.keys(promotionWritesAr).sort()).toEqual(Object.keys(promotionWritesEn).sort()));
