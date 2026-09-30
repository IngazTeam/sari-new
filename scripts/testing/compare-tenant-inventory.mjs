import fs from 'node:fs';
const root=process.argv[2] || 'docs/audits/tenant-features-2026-09-30';
const baseline=process.argv[3] || 'docs/audits/tenant-features-2026-09-28';
const read=directory=>JSON.parse(fs.readFileSync(`${directory}/inventory.json`,'utf8'));
const before=read(baseline), after=read(root);
const prior=new Map(before.files.map(f=>[f.file,f]));
const current=new Map(after.files.map(f=>[f.file,f]));
const difference=(left,right)=>left.filter(value=>!right.includes(value));
const delta={baseline,generatedAt:after.generatedAt,scope:'Counts reflect both code changes and improved static extraction, not numbers of newly implemented features.',
  counts:{before:{routes:before.routes.length,files:before.files.length,controls:before.controls.length},after:{routes:after.routes.length,files:after.files.length,controls:after.controls.length}},
  addedFiles:[...current.keys()].filter(file=>!prior.has(file)),
  changedFiles:[...current.values()].filter(file=>prior.has(file.file)&&prior.get(file.file).hash!==file.hash).map(f=>f.file),
  noLongerReachable:[...prior.keys()].filter(file=>!current.has(file)).map(file=>({file,exists:fs.existsSync(file)})),
  priorOrphans:before.orphanFiles.map(file=>({file,exists:fs.existsSync(file),nowReachable:current.has(file)})),
  routes:after.routes.map(route=>{
    const old=before.routes.find(r=>r.route===route.route);
    return {route:route.route,controlsBefore:old?.controls.length??null,controlsNow:route.controls.length,removedQueries:difference(old?.queries||[],route.queries),addedQueries:difference(route.queries,old?.queries||[]),removedMutations:difference(old?.mutations||[],route.mutations),addedMutations:difference(route.mutations,old?.mutations||[])};
  }),
  removedRoutes:difference(before.routes.map(r=>r.route),after.routes.map(r=>r.route)),
};
fs.writeFileSync(`${root}/delta.json`,JSON.stringify(delta,null,2)+'\n');
console.log(JSON.stringify({addedFiles:delta.addedFiles.length,changedFiles:delta.changedFiles.length,noLongerReachable:delta.noLongerReachable.length,removedRoutes:delta.removedRoutes},null,2));
