import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertZidOrderReleaseCompatible, assertManagedWritersStopped, assertManagedWriterCompatibility } from './zid-order-release.mjs';
import { managedRelease } from './sary-update-ops.mjs';

test('accepts this built source capability and refuses older or relative targets',()=>{
  assert.doesNotThrow(()=>assertZidOrderReleaseCompatible(path.resolve('.')));
  assert.throws(()=>assertZidOrderReleaseCompatible('.'));
  assert.throws(()=>assertZidOrderReleaseCompatible(os.tmpdir()));
});
test('a malformed or unrelated marker cannot authorize rollback',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sari-zid-release-test-'));fs.mkdirSync(path.join(root,'scripts'));
  const file=path.join(root,'scripts/zid-order-store-capability.json');
  for(const body of ['{','null','{"version":1,"capabilities":[]}','{"version":2,"capabilities":["zid-order-store-identity-0127"]}']){
    fs.writeFileSync(file,body);assert.throws(()=>assertZidOrderReleaseCompatible(root));
  }
  // Remove only the exact synthetic files created above, without recursive shell operations.
  fs.unlinkSync(file);fs.rmdirSync(path.join(root,'scripts'));fs.rmdirSync(root);
});
test('draining requires stopped web and inbound processes with no live PID',()=>{
  const stopped=['sari','sari-inbound'].map(name=>({name,pid:0,pm2_env:{status:'stopped'}}));
  assert.doesNotThrow(()=>assertManagedWritersStopped(stopped));
  assert.doesNotThrow(()=>assertManagedWritersStopped([...stopped,{name:'unrelated',pid:123,pm2_env:{status:'online'}}]));
  assert.doesNotThrow(()=>assertManagedWritersStopped([]));
  for(const status of ['online','stopping','errored','launching'])assert.throws(()=>assertManagedWritersStopped([{name:'sari',pid:0,pm2_env:{status}}]));
  assert.throws(()=>assertManagedWritersStopped([{name:'sari-inbound',pid:123,pm2_env:{status:'stopped'}}]));
  assert.throws(()=>assertManagedWritersStopped([{name:'sari',pm2_env:{status:'stopped'}}]));
  assert.throws(()=>assertManagedWritersStopped(null));
});
test('a stopped release remains discoverable for a safe updater retry, never ready',()=>{
  const directory='/var/www/sari-release-12345678-abc';
  const apps=['sari','sari-inbound'].map(name=>({name,pm2_env:{status:'stopped',pm_cwd:directory,pm_exec_path:`${directory}/dist/${name==='sari'?'index':'worker'}.js`}}));
  assert.equal(managedRelease(apps,undefined,true),directory);assert.throws(()=>managedRelease(apps,directory));
});
test('writer compatibility uses actual process directories instead of a current symlink',()=>{
  const apps=[{name:'sari',pm2_env:{pm_cwd:path.resolve('.'),pm_exec_path:path.resolve('dist/index.js')}}];
  assert.doesNotThrow(()=>assertManagedWriterCompatibility(apps));
  assert.throws(()=>assertManagedWriterCompatibility([{...apps[0],pm2_env:{...apps[0].pm2_env,pm_exec_path:path.join(os.tmpdir(),'old/index.js')}}]));
  assert.throws(()=>assertManagedWriterCompatibility([...apps,{name:'sari-inbound',pm2_env:{pm_cwd:os.tmpdir()}}]));
  assert.throws(()=>assertManagedWriterCompatibility([{name:'sari'}]));
});
test('CLI refuses unknown state and incompatible rollback without provider or database access',()=>{
  const script=path.resolve('scripts/zid-order-release.mjs');
  for(const args of [['compatible',os.tmpdir()],['invalid'],['stopped']]){
    const run=spawnSync(process.execPath,[script,...args],{input:'not-json',encoding:'utf8',windowsHide:true});
    assert.equal(run.status,1);assert.match(run.stderr,/ZID_ORDER_RELEASE_GUARD_FAILED/);
  }
});
test('both deployment paths drain old writers before DDL and guard every activation',()=>{
  const update=fs.readFileSync('scripts/update-sary.sh','utf8'),deploy=fs.readFileSync('scripts/deploy-production.sh','utf8');
  assert.ok(update.indexOf('pm stop sari')<update.indexOf('"$ops" migrate'));
  assert.ok(update.indexOf('"$release_dir/scripts/zid-order-release.mjs" stopped')<update.indexOf('"$ops" migrate'));
  assert.ok(deploy.indexOf('pm2 stop "$managed_name"')<deploy.indexOf('corepack pnpm db:migrate'));
  for(const [body,start,guard,reload] of [[update,'activate()','compatible "$target"','pm startOrReload'],[deploy,'activate_pm2_release()','compatible "$target_release"','pm2 startOrReload']]){
    const fn=body.slice(body.indexOf(start));assert.ok(fn.indexOf(guard)<fn.indexOf(reload));
  }
});
test('the actual updater activation function never invokes PM2 for an incompatible release',()=>{
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
  const source=fs.readFileSync('scripts/update-sary.sh','utf8').replaceAll('\r\n','\n');
  const activate=source.match(/activate\(\) \{[\s\S]*?\n\}/)?.[0];assert.ok(activate);
  const script=`set -u\nnode_bin="$1"\nsource_dir="$2"\npm() { echo PM_CALLED; }\nmatches() { return 0; }\n${activate}\nactivate "$3"\n`;
  for(const [target,status,sends] of [[os.tmpdir(),1,false],[path.resolve('.'),0,true]]){
    const result=spawnSync(bash,['-s','--',process.execPath,path.resolve('.'),target],{input:script,encoding:'utf8',windowsHide:true});
    assert.equal(result.status,status,result.stderr);assert.equal(result.stdout.includes('PM_CALLED'),sends);
  }
});
test('shipped guard scripts remain valid Bash and keep the established invocation',()=>{
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
  for(const script of ['scripts/update-sary.sh','scripts/deploy-production.sh']){
    const r=spawnSync(bash,['-n',script],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);
  }
  assert.match(fs.readFileSync('AGENTS.md','utf8'),/bash scripts\/update-sary.sh/);
});
