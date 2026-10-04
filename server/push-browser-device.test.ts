import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {browserPushDevice,browserDeviceHash} from '../client/src/lib/push-device';
let registration:any,subscription:any,permission:any,sw:any;
const key='B'+ 'A'.repeat(86),endpoint='https://fcm.googleapis.com/push/local';
beforeEach(()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('location',{origin:'https://sary.live'});
  subscription={endpoint,options:{},toJSON:()=>({keys:{p256dh:key,auth:'A'.repeat(22)}}),unsubscribe:vi.fn(async()=>true)};
  registration={scope:'https://sary.live/',active:{scriptURL:'https://sary.live/sw.js'},pushManager:{getSubscription:vi.fn(async()=>subscription),subscribe:vi.fn(async()=>subscription)}};
  sw={getRegistration:vi.fn(async()=>registration),register:vi.fn(async()=>registration),ready:Promise.resolve(registration)};
  permission={permission:'granted',requestPermission:vi.fn(async()=>'granted')};
  vi.stubGlobal('Notification',permission);vi.stubGlobal('window',{isSecureContext:true,Notification:permission,PushManager:{},crypto:webcrypto});
  vi.stubGlobal('navigator',{serviceWorker:sw,userAgent:'Local synthetic browser'});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each(['Notification','PushManager','crypto'])('gracefully detects missing browser feature %s',async feature=>{
  delete (window as any)[feature];expect(await browserPushDevice.read()).toMatchObject({supported:false,permission:'unsupported',deviceHash:null});expect(sw.register).not.toHaveBeenCalled();
});
it('does not wait for an absent worker just to inspect the page',async()=>{
  sw.getRegistration.mockResolvedValue(undefined);sw.ready=new Promise(()=>{});
  expect(await browserPushDevice.read()).toMatchObject({supported:true,deviceHash:null});expect(permission.requestPermission).not.toHaveBeenCalled();
});
it('requests permission within the click before asynchronous worker work',async()=>{
  const promise=browserPushDevice.enable(key);expect(permission.requestPermission).toHaveBeenCalledOnce();expect(sw.register).not.toHaveBeenCalled();
  expect(await promise).toMatchObject({endpoint,reviewed:true});expect(sw.register).toHaveBeenCalledWith('/sw.js',{scope:'/'});
});
it('does not register or subscribe when permission is denied',async()=>{
  permission.requestPermission.mockResolvedValue('denied');await expect(browserPushDevice.enable(key)).rejects.toThrow();expect(sw.register).not.toHaveBeenCalled();
});
it('does not replace a service worker belonging to another app',async()=>{
  registration.active.scriptURL='https://sary.live/other-worker.js';await expect(browserPushDevice.enable(key)).rejects.toThrow('worker_conflict');expect(sw.register).not.toHaveBeenCalled();
});
it('does not silently replace a subscription with a different server key',async()=>{
  subscription.options.applicationServerKey=new Uint8Array([1,2,3]).buffer;await expect(browserPushDevice.enable(key)).rejects.toThrow('key_changed');expect(subscription.unsubscribe).not.toHaveBeenCalled();
});
it('does not unsubscribe a different browser device',async()=>{
  await expect(browserPushDevice.disable('b'.repeat(64))).rejects.toThrow('device_changed');expect(subscription.unsubscribe).not.toHaveBeenCalled();
});
it('keeps a false browser unsubscribe result rather than claiming success',async()=>{
  subscription.unsubscribe.mockResolvedValue(false);expect(await browserPushDevice.disable(await browserDeviceHash(endpoint))).toBe(false);
});
it('bounds a stalled worker activation without claiming success',async()=>{
  vi.useFakeTimers();sw.ready=new Promise(()=>{});const result=browserPushDevice.enable(key);const checked=expect(result).rejects.toThrow('browser_timeout');await vi.advanceTimersByTimeAsync(12001);await checked;
});
