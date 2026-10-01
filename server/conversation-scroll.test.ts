// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {useConversationScroll} from '../client/src/lib/use-conversation-scroll';
let root:Root,container:HTMLDivElement,height:number,top:number,frames:FrameRequestCallback[];
function Host({context='4:latest',rows=[{id:1}],latest=true,visible=true}:{context?:string;rows?:Array<{id:number}>;latest?:boolean;visible?:boolean}){
  const state=useConversationScroll(context,rows,latest);
  return React.createElement('div',null,React.createElement('div',{'data-radix-scroll-area-viewport':'',ref:(el:HTMLDivElement|null)=>{
    if(!el)return;Object.defineProperties(el,{scrollHeight:{get:()=>height,configurable:true},clientHeight:{get:()=>300,configurable:true},scrollTop:{get:()=>top,set:value=>{top=Math.max(0,Math.min(value,height-300));},configurable:true}});
  }},visible ? React.createElement('div',{ref:state.endRef}) : null),React.createElement('button',{onClick:state.jump},'Latest'),React.createElement('span',{'data-unseen':state.unseen},String(state.unseen)));
}
const render=(props:Parameters<typeof Host>[0]={})=>act(async()=>root.render(React.createElement(Host,props)));
beforeEach(()=>{height=1000;top=0;frames=[];vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.push(fn);return frames.length;});vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('opens latest at the bottom and an earlier page at its beginning',async()=>{
  await render();expect(top).toBe(700);await render({context:'4:8',latest:false,rows:[{id:8}]});expect(top).toBe(0);
});
it('keeps a reader in place when new messages arrive and offers a jump',async()=>{
  await render();top=200;height=1200;await render({rows:[{id:1},{id:2}]});expect(top).toBe(200);expect(container.querySelector('[data-unseen=true]')).toBeTruthy();
  await act(async()=>container.querySelector('button')!.click());expect(top).toBe(900);expect(container.querySelector('[data-unseen=true]')).toBeNull();
});
it('follows new messages only while the reader is near the bottom',async()=>{
  await render();top=680;height=1200;await render({rows:[{id:1},{id:2}]});expect(top).toBe(900);expect(container.querySelector('[data-unseen=true]')).toBeNull();
});
it('does not jump after polling unchanged message ids',async()=>{
  await render();top=200;await render({rows:[{id:1}]});expect(top).toBe(200);
});
it('clears the new-message indication when the reader scrolls to the end',async()=>{
  await render();top=200;height=1200;await render({rows:[{id:2}]});expect(container.querySelector('[data-unseen=true]')).toBeTruthy();
  top=900;await act(async()=>container.querySelector('[data-radix-scroll-area-viewport]')!.dispatchEvent(new Event('scroll')));expect(container.querySelector('[data-unseen=true]')).toBeNull();
});
it('positions the first page after the viewport receives its initial layout',async()=>{
  height=0;await render();expect(top).toBe(0);height=1000;await act(async()=>frames.at(-1)!(0));expect(top).toBe(700);
});
it('positions unchanged cached rows when the message panel mounts later',async()=>{
  const rows=[{id:1}];await render({rows,visible:false});expect(top).toBe(0);
  await render({rows,visible:true});expect(top).toBe(700);
  await render({rows,visible:false});top=0;
  await render({rows,visible:true});expect(top).toBe(700);
});
