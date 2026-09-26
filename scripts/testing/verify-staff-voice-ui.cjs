const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),esbuild=require('esbuild'),puppeteer=require('puppeteer-core');
(async()=>{
  const dir=path.resolve('.tmp/staff-voice-ui'),output=path.resolve(process.env.STAFF_VOICE_UI_OUTPUT||'.tmp/staff-voice-ui/results');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(output,{recursive:true});
  await esbuild.build({entryPoints:['scripts/testing/fixtures/staff-dashboard-ui-entry.tsx'],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('client/src')}});
  const publicDir=path.resolve('dist/public'),styles=fs.readdirSync(path.join(publicDir,'assets')).filter(n=>/^(?:index|App)-[\w-]+\.css$/.test(n));
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles.map(n=>`<link rel="stylesheet" href="/assets/${n}">`).join('')}<body><div id="root"></div><script src="/fixture.js"></script></body></html>`);return;}
    const file=pathname==='/fixture.js'?path.join(dir,'fixture.js'):path.resolve(publicDir,'.'+pathname);
    if(file!==path.join(dir,'fixture.js')&&!file.startsWith(publicDir+path.sep)){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});const results=[],errors=[];
  try{
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
    page.on('request',r=>[origin,'data:','blob:'+origin].some(prefix=>r.url().startsWith(prefix))?r.continue():r.abort());
    const phase=async(value)=>page.waitForFunction(value=>document.querySelector('[data-voice-recorder]')?.getAttribute('data-voice-phase')===value,{},value);
    const visit=async(mode,lang,extra='')=>{await page.goto(`${origin}/?voice=1&case=${mode}&lang=${lang}${extra}`,{waitUntil:'networkidle0'});await page.evaluate(()=>sessionStorage.clear());await page.waitForSelector('[data-staff-conversation="4"]');await page.click('[data-staff-conversation="4"]');await page.$eval('[data-voice-recorder]',n=>{n.closest('details').open=true;});await phase('idle');};
    const recordAudio=async()=>{await page.click('[data-voice-start]');await phase('recording');await new Promise(resolve=>setTimeout(resolve,150));await page.click('[data-voice-stop]');await phase('draft');};
    const send=async(count)=>{await page.click('[data-voice-send]');await page.waitForFunction(n=>window.__staffWrites.length===n,{},count);await page.waitForFunction(()=>document.querySelector('[data-voice-recorder]')?.getAttribute('data-voice-phase')!=='sending');};
    const check=async()=>{const r=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,raw:/staffVoice\./.test(document.body.innerText),private:/private (microphone|recorder|token)/.test(document.body.innerText),
      readableStatus:document.querySelector('[data-voice-recorder] [role="status"]').getBoundingClientRect().height<=48,
      controls:[...document.querySelectorAll('[data-voice-recorder] button')].every(n=>n.getBoundingClientRect().height>=44&&Boolean(n.getAttribute('aria-label')||n.textContent.trim()))}));assert.equal(r.overflow,false);assert.equal(r.raw,false);assert.equal(r.private,false);assert.equal(r.readableStatus,true);assert.equal(r.controls,true);assert.deepEqual(errors,[]);};
    const passed=(mode,lang,extra={})=>results.push({mode,lang,...extra,passed:true});
    for(const lang of ['ar','en']){
      for(const width of [320,375,430,1440]){
        await page.setViewport({width,height:900});await visit('pending',lang);await recordAudio();await check();
        assert.equal(await page.evaluate(()=>window.__staffWrites.length),0);assert.equal(await page.evaluate(()=>window.__tracksStopped),1);
        assert.equal(await page.$eval('[data-staff-draft]',n=>n.disabled),true);
        if(width===1440){await page.click('[data-staff-conversation="5"]');assert.equal(await page.$eval('[data-voice-recorder]',n=>n.getAttribute('data-voice-phase')),'draft');}
        await page.click('[data-voice-send]');await page.click('[data-voice-send]');await phase('draft');assert.equal(await page.evaluate(()=>window.__staffWrites.length),1);
        await send(2);const writes=await page.evaluate(()=>window.__staffWrites);assert.deepEqual(writes[1],writes[0]);assert.equal(writes[0].conversationId,4);assert.ok(writes[0].audioBase64);assert.match(writes[0].requestId,/^[0-9a-f-]{36}$/i);
        assert.ok(await page.$('[data-voice-preview]'));passed('pending_keeps_recording_and_reuses_attempt',lang,{width});
        if([375,1440].includes(width))await page.screenshot({path:path.join(output,`voice-${lang}-${width}.png`),fullPage:true});
        await page.evaluate(()=>window.__staffResult='accepted');await send(3);await phase('idle');assert.equal(await page.$('[data-voice-preview]'),null);
        assert.equal(await page.evaluate(()=>window.__revokedUrls.length),1);assert.equal(await page.$eval('[data-staff-draft]',n=>n.disabled),false);passed('acceptance_releases_recording_and_navigation',lang,{width});
      }
      await page.setViewport({width:375,height:900});
      await visit('pending',lang);await recordAudio();await page.evaluate(()=>{window.__hideSelected=true;window.__refreshQueries();});await page.waitForFunction(()=>!document.querySelector('[data-staff-conversation="4"]'));
      await phase('draft');assert.equal(await page.$eval('input[maxlength="200"]',n=>n.disabled),true);await send(1);assert.equal(await page.evaluate(()=>window.__staffWrites[0].conversationId),4);await phase('draft');passed('list_refresh_cannot_destroy_or_retarget_recording',lang);
      for(const mode of ['accepted','failed','projection','error']){await visit(mode,lang);await recordAudio();await send(1);await phase(['accepted','projection'].includes(mode)?'idle':'draft');await check();passed(mode,lang);}
      await visit('pending',lang);await page.evaluate(()=>window.__micMode='denied');await page.click('[data-voice-start]');await phase('idle');assert.equal(await page.evaluate(()=>window.__recordersStarted),0);await check();passed('permission_denied',lang);
      await visit('pending',lang);await page.evaluate(()=>window.__recorderFailure=true);await page.click('[data-voice-start]');await phase('idle');assert.equal(await page.evaluate(()=>window.__tracksStopped),1);passed('constructor_failure_stops_capture',lang);
      await visit('pending',lang);await page.evaluate(()=>window.__micMode='deferred');await page.click('[data-voice-start]');await phase('permission');await page.click('[data-voice-cancel]');await page.evaluate(()=>window.__resolveMic());await phase('idle');await page.waitForFunction(()=>window.__tracksStopped===1);assert.equal(await page.evaluate(()=>window.__recordersStarted),0);passed('cancel_before_permission_resolution',lang);
      await visit('pending',lang);await page.click('[data-voice-start]');await phase('recording');await page.click('[data-voice-cancel]');await phase('idle');assert.equal(await page.$('[data-voice-preview]'),null);assert.equal(await page.evaluate(()=>window.__tracksStopped),1);passed('cancel_during_recording_cannot_resurrect_blob',lang);
      await visit('pending',lang);await page.click('[data-voice-start]');await phase('recording');await page.evaluate(()=>window.__unmount());assert.equal(await page.evaluate(()=>window.__tracksStopped),1);passed('unmount_stops_active_microphone',lang);
      await visit('pending',lang);await page.evaluate(()=>window.__micMode='deferred');await page.click('[data-voice-start]');await phase('permission');await page.evaluate(()=>{window.__unmount();window.__resolveMic();});await page.waitForFunction(()=>window.__tracksStopped===1);assert.equal(await page.evaluate(()=>window.__recordersStarted),0);passed('unmount_before_permission_resolution',lang);
      await visit('pending',lang);await page.click('[data-voice-start]');await phase('recording');await page.evaluate(()=>window.__clockOffset=121000);await phase('draft');assert.equal(await page.evaluate(()=>window.__tracksStopped),1);passed('maximum_duration_stops_recorder',lang);
      await visit('pending',lang);await page.evaluate(()=>window.__emptyRecording=true);await page.click('[data-voice-start]');await phase('recording');await page.click('[data-voice-stop]');await phase('idle');assert.equal(await page.evaluate(()=>window.__staffWrites.length),0);passed('empty_recording_not_sendable',lang);
      await visit('accepted',lang,'&format=mp4');await recordAudio();await send(1);assert.equal(await page.evaluate(()=>window.__staffWrites[0].mimeType),'audio/mp4');passed('mp4_recorder_fallback',lang);
      await visit('accepted',lang);await recordAudio();await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('private storage');};});await page.click('[data-voice-send]');await phase('draft');assert.equal(await page.evaluate(()=>window.__staffWrites.length),0);assert.ok(await page.$('[data-voice-preview]'));passed('storage_failure_preserves_audio_without_send',lang);
      await visit('accepted',lang,'&mic=real');await recordAudio();await page.waitForFunction(()=>document.querySelector('[data-voice-preview]').readyState>=1);await send(1);
      const actual=await page.evaluate(()=>window.__staffWrites[0]);assert.ok(Buffer.from(actual.audioBase64,'base64').length>100);assert.match(actual.mimeType,/^audio\/(webm|ogg|mp4)$/);passed('real_chromium_recorder_with_synthetic_microphone',lang);
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:await browser.version(),actualComponents:true,fixtureApi:true,externalRequestsBlocked:true,
      scope:'Actual Conversations and VoiceRecorder with simulated API/media lifecycle plus real Chromium MediaRecorder using a synthetic microphone. No production or physical iPhone/Safari.',results,errors,screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))},null,2)+'\n');console.log(JSON.stringify({scenarios:results.length,errors}));
  }catch(e){console.error({completed:results.length,last:results.at(-1),stack:e.stack});const page=(await browser.pages()).at(-1);if(page){await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true});console.error(await page.evaluate(()=>({text:document.body.innerText,writes:window.__staffWrites,tracks:window.__tracksStopped})));}throw e;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
