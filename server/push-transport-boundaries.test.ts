import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({subscriptions:vi.fn(),log:vi.fn(),update:vi.fn(),generate:vi.fn(),fetch:vi.fn()}));
vi.mock('./db_push',()=>({getActivePushSubscriptions:m.subscriptions,createPushNotificationLog:m.log,updatePushNotificationLogStatus:m.update}));
vi.mock('web-push',()=>({default:{generateRequestDetails:m.generate}}));
import { sendPushNotification, getVapidPublicKey } from './_core/pushNotifications';
import { pushEndpoint } from './_core/push-transport';
const sub={id:2,merchantId:7,endpoint:'https://fcm.googleapis.com/push/test-token',p256dh:'key',auth:'auth'};
const run=(guard?:()=>Promise<void>)=>sendPushNotification(7,{title:'Test',body:'Test'},guard);
beforeEach(()=>{
  vi.stubEnv('VAPID_PUBLIC_KEY','public');vi.stubEnv('VAPID_PRIVATE_KEY','private');vi.stubGlobal('fetch',m.fetch);
  m.subscriptions.mockReset().mockResolvedValue([sub]);m.log.mockReset().mockResolvedValue([{insertId:3}]);m.update.mockReset().mockResolvedValue(undefined);
  m.generate.mockReset().mockImplementation(s=>({endpoint:s.endpoint,method:'POST',headers:{TTL:3600},body:Buffer.from('encrypted')}));
  m.fetch.mockReset().mockImplementation(async()=>new Response('',{status:201,headers:{location:'/messages/test'}}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('Every browser push transport has the same bounded service policy',()=>{
  it.each(['fcm.googleapis.com','android.googleapis.com','web.push.apple.com','new.push.apple.com','updates.push.services.mozilla.com','wns.notify.windows.com'])('accepts service %s',host=>{
    expect(pushEndpoint('https://'+host+'/token').hostname).toBe(host);
  });
  it.each(['http://fcm.googleapis.com/t','https://127.0.0.1/t','https://[::1]/','https://169.254.169.254/','https://evil.test/','https://web.push.apple.com.evil.test/','https://evilpush.apple.com/','https://fcm.googleapis.com@evil.test/','https://u:p@fcm.googleapis.com/','https://fcm.googleapis.com:444/','https://fcm.googleapis.com/t#x','https://fcm.googleapis.com./t','https://fcm.googleapis.com/\nx','https://fcm.googleapis.com\\@evil.test/','https://fcm.googleapis.com/'+ 'x'.repeat(4096)])('blocks persisted unsafe endpoint %s before encryption/log/network',async endpoint=>{
    m.subscriptions.mockResolvedValue([{...sub,endpoint}]);
    expect(await run()).toEqual({success:0,failed:1});expect(m.generate).not.toHaveBeenCalled();expect(m.log).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
  });
  it('requires exact provider acceptance and prevents redirect following',async()=>{
    expect(await run()).toEqual({success:1,failed:0});
    expect(m.fetch).toHaveBeenCalledOnce();expect(m.fetch.mock.calls[0][1]).toMatchObject({method:'POST',redirect:'error',body:new Uint8Array(Buffer.from('encrypted'))});
    expect(m.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);expect(m.update).toHaveBeenCalledWith(3,'accepted',undefined);
  });
  it.each([200,202,204,301,429,500])('HTTP %s is not a delivery/acceptance claim',async status=>{
    m.fetch.mockResolvedValue(new Response(status===204?null:'private',{status}));
    expect(await run()).toEqual({success:0,failed:1});expect(m.update).toHaveBeenCalledWith(3,'unknown','push:acceptance_unknown');expect(m.fetch).toHaveBeenCalledOnce();
  });
  it.each([400,401,403,404,410,413])('records explicit HTTP %s rejection without provider details',async status=>{
    m.fetch.mockResolvedValue(new Response('private-token',{status}));expect(await run()).toEqual({success:0,failed:1});
    expect(m.update).toHaveBeenCalledWith(3,'rejected','push:provider_rejected');expect(JSON.stringify(m.update.mock.calls)).not.toContain('private-token');
  });
  it.each(['','http://evil.test/t','https://u:p@evil.test/t','/x#private','x'.repeat(4097)])('does not accept an invalid receipt reference',async location=>{
    m.fetch.mockResolvedValue(new Response('',{status:201,headers:{location}}));expect((await run()).success).toBe(0);
  });
  it.each(['response','timeout','redirect'])('keeps %s uncertainty and never retries',async mode=>{
    if(mode==='response')m.fetch.mockResolvedValue(new Response('x'.repeat(64001),{status:201,headers:{location:'/message'}}));
    else m.fetch.mockRejectedValue(Error('private-token'));
    const spy=vi.spyOn(console,'error');expect(await run()).toEqual({success:0,failed:1});expect(m.fetch).toHaveBeenCalledOnce();
    expect(m.update).toHaveBeenCalledWith(3,'unknown','push:acceptance_unknown');expect(spy).not.toHaveBeenCalled();
  });
  it('preserves acceptance when writing the display log fails',async()=>{
    m.update.mockRejectedValue(Error('private SQL'));expect(await run()).toEqual({success:1,failed:0});expect(m.update).toHaveBeenCalledOnce();expect(m.fetch).toHaveBeenCalledOnce();
  });
  it.each([0,undefined,-1,1.2])('requires a valid log acknowledgement before sending: %s',async insertId=>{
    m.log.mockResolvedValue([{insertId}]);expect((await run()).success).toBe(0);expect(m.fetch).not.toHaveBeenCalled();
  });
  it('rechecks subscription even without an optional caller guard',async()=>{
    m.subscriptions.mockResolvedValueOnce([sub]).mockResolvedValueOnce([]);expect((await run()).success).toBe(0);expect(m.fetch).not.toHaveBeenCalled();
  });
  it('blocks VAPID configuration changes before sending',async()=>{
    m.log.mockImplementation(async()=>{vi.stubEnv('VAPID_PRIVATE_KEY','changed');return [{insertId:3}];});expect((await run()).success).toBe(0);expect(m.fetch).not.toHaveBeenCalled();
  });
  it.each(['duplicate','capacity'])('refuses %s fan-out before any side effect',async mode=>{
    m.subscriptions.mockResolvedValue(mode==='duplicate'?[sub,{...sub,id:3,endpoint:'https://fcm.googleapis.com:443/push/test-token'}]:Array.from({length:64},(_,i)=>({...sub,id:i+1,endpoint:sub.endpoint+i})));
    expect((await run()).success).toBe(0);expect(m.log).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
  });
  it('bounds UTF-8 payload bytes before encryption',async()=>{
    expect((await sendPushNotification(7,{title:'Test',body:'ع'.repeat(2000)})).success).toBe(0);expect(m.generate).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
  });
  it('does not expose an unusable key when private configuration is absent',async()=>{
    vi.stubEnv('VAPID_PRIVATE_KEY','');expect(getVapidPublicKey()).toBe('');expect(await run()).toEqual({success:0,failed:0});expect(m.subscriptions).not.toHaveBeenCalled();
  });
});
