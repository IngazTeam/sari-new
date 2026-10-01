import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import merchantAr from '../client/src/locales/merchant-ux.ar';
import merchantEn from '../client/src/locales/merchant-ux.en';
// @ts-expect-error Local build helper is JavaScript.
import {loadPreviewLocales} from '../prototypes/tenant-dashboard/preview-locales.mjs';
it.each(['assistant-option','assistant-settings','persona'])('builds %s with the app split resources rather than undefined JSON entries',async name=>{
 const source=readFileSync(`prototypes/tenant-dashboard/build-${name}-preview.mjs`,'utf8');
 const namespaces=JSON.parse(source.match(/export const previewNamespaces = (\[[\s\S]*?\]);/)![1]);
 const copy=await loadPreviewLocales(namespaces);
 for(const [language,expected] of [['ar',merchantAr],['en',merchantEn]] as const){
  expect(Object.keys(copy[language])).toEqual(namespaces);
  expect(copy[language].merchantUx).toEqual(expected);
  expect(copy[language].merchantUx.knowledgeDraft.scopeError).not.toContain('merchantUx.');
  expect(copy[language].merchantUx.knowledgeIntake.retry).toBeTruthy();
  for(const value of Object.values(copy[language]))expect(typeof value).toBe('object');
 }
 if(name==='assistant-settings'){
  expect(copy.en.merchantUx.discountPolicy.saved).toBe(merchantEn.discountPolicy.saved);
  expect(copy.ar.merchantUx.marginPolicy.current).toContain('{{revision}}');
 }
});
it('fails the build rather than silently displaying an unknown namespace',async()=>{
 await expect(loadPreviewLocales(['notARealNamespace'])).rejects.toThrow('Missing preview namespace');
});
