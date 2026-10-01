// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { brainNavigationUrl, brainViewIds, knowledgePaneIds, readBrainNavigation, useBrainNavigation } from "../client/src/lib/brain-navigation";
let root:Root,container:HTMLDivElement;
function Harness(){const state=useBrainNavigation();const [draft,setDraft]=useState('unsaved draft');return React.createElement('div',null,
  React.createElement('output',null,state.brainView+':'+state.knowledgePane),
  React.createElement('input',{value:draft,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setDraft(e.target.value)}),
  React.createElement('button',{onClick:()=>state.changeBrainView('sources')},'Sources'),
  React.createElement('button',{onClick:()=>state.changeBrainView('knowledge','pages')},'Pages'),
  React.createElement('button',{onClick:()=>state.setKnowledgePane('faq')},'FAQ'));
}
const render=()=>act(async()=>root.render(React.createElement(Harness)));
const click=(text:string)=>act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text)!.click());
const current=()=>container.querySelector('output')?.textContent;
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);history.replaceState({kept:true},'','/merchant/sari-brain?keep=1#anchor');container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it.each(brainViewIds)('restores the %s main view from a URL',view=>{expect(readBrainNavigation('?view='+view).brainView).toBe(view);});
it.each(knowledgePaneIds)('restores the %s nested pane from a URL',pane=>{expect(readBrainNavigation('?view=knowledge&pane='+pane)).toEqual({brainView:'knowledge',knowledgePane:pane});});
it.each(['','?view=unknown&pane=hidden','?view=%3Cscript%3E&pane=__proto__'])('uses safe defaults for malformed links %s',search=>{expect(readBrainNavigation(search)).toEqual({brainView:'overview',knowledgePane:'sections'});});
it('preserves unrelated query parameters and the fragment',()=>{expect(brainNavigationUrl('https://example.test/merchant/sari-brain?keep=1&view=sales#anchor','knowledge','pages')).toBe('/merchant/sari-brain?keep=1&view=knowledge&pane=pages#anchor');});
it('rejects unknown destinations before constructing a navigation URL',()=>{expect(()=>brainNavigationUrl('https://example.test/merchant/sari-brain','foreign' as any)).toThrow();expect(()=>brainNavigationUrl('https://example.test/merchant/sari-brain','knowledge','foreign' as any)).toThrow();});
it('remembers nested panes across main tabs and a remount without resetting mounted drafts',async()=>{await render();await click('Pages');expect(location.search).toContain('pane=pages');expect(current()).toBe('knowledge:pages');await click('Sources');expect(current()).toBe('sources:pages');expect(container.querySelector('input')?.value).toBe('unsaved draft');await act(async()=>root.unmount());root=createRoot(container);await render();expect(current()).toBe('sources:pages');await click('FAQ');expect(current()).toBe('knowledge:faq');expect(location.hash).toBe('#anchor');expect(new URLSearchParams(location.search).get('keep')).toBe('1');expect(history.state).toEqual({kept:true});});
it('responds to browser back and forward and avoids duplicate history entries',async()=>{await render();await click('Pages');await click('FAQ');const length=history.length;await click('FAQ');expect(history.length).toBe(length);
  await act(async()=>{const pop=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));history.back();await pop;});expect(current()).toBe('knowledge:pages');
  await act(async()=>{const pop=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));history.forward();await pop;});expect(current()).toBe('knowledge:faq');
});
