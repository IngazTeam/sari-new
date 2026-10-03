import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
it('keeps competitor-specific style classes isolated from other page styles',()=>{
  const folder='client/src/styles/',source=readFileSync(folder+'competitor-workspace.css','utf8');
  const own=new Set(Array.from(source.matchAll(/\.([a-z][\w-]*)/g),m=>m[1]).filter(c=>c!=='sc-search'));
  expect(own.size).toBeGreaterThan(15);
  for(const file of readdirSync(folder).filter(f=>f.endsWith('.css')&&f!=='competitor-workspace.css')){
    const other=new Set(Array.from(readFileSync(folder+file,'utf8').matchAll(/\.([a-z][\w-]*)/g),m=>m[1]));
    expect([...own].filter(c=>other.has(c)),file).toEqual([]);
  }
});
it('preserves readable prototype Arabic and valid UTF-8 source',()=>{
  const file=readFileSync('prototypes/tenant-dashboard/src/service-preview.tsx');const text=new TextDecoder('utf-8',{fatal:true}).decode(file);
  expect(text).not.toContain('\uFFFD');expect(text).toContain('موك أب المنافسين');expect(text).toContain('تعذر قراءة تقرير المنافس');
});
