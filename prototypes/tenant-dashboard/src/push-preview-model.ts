import {pushWorkspace,pushSubscriptionInput,pushUnsubscribeInput,pushTestInput,pushTestResult} from '../../../shared/push-workspace';
import type {PushDeviceAdapter,PushDeviceState} from '../../../client/src/lib/push-device';
export class PushPreviewStore {
  private registered=false;private local=true;private attempts=new Map<string,any>();
  private permission:NotificationPermission='granted';
  readonly hash='a'.repeat(64);
  constructor(private actorId:number,private merchantId:number,private mode:()=>string){
    this.registered=!['empty','unlinked'].includes(mode());this.local=mode()!=='empty';
  }
  readonly device:PushDeviceAdapter={
    read:async():Promise<PushDeviceState>=>({supported:this.mode()!=='push-unsupported',permission:this.mode()==='push-unsupported'?'unsupported':this.mode()==='push-denied'?'denied':this.permission,deviceHash:this.local?this.hash:null}),
    enable:async()=>{this.local=true;this.permission='granted';return {endpoint:'https://fcm.googleapis.com/preview-only',p256dh:'A'.repeat(87),auth:'A'.repeat(22),userAgent:'Local preview — no browser permission or provider request',reviewed:true};},
    disable:async()=>{this.local=false;return true;},
  };
  read(input:any){
    const logs=Array.from(this.attempts.values()).reverse().slice(0,20).map((r,i)=>({id:i+1,title:r.language==='en'?'Local sample test':'اختبار محلي توضيحي',body:r.language==='en'?'Simulated service response; no notification was sent.':'نتيجة محاكاة؛ لم يُرسل إشعار حقيقي.',state:r.state,createdAt:'2026-10-04T12:00:00.000Z'}));
    return pushWorkspace.parse({actorId:this.actorId,merchantId:this.merchantId,canManage:this.mode()!=='readonly',publicKey:this.mode()==='push-unconfigured'?null:'A'.repeat(87),deviceHash:input.deviceHash,deviceEnabled:this.registered&&input.deviceHash===this.hash,checkedAt:'2026-10-04T12:00:00.000Z',
      counts:{total:logs.length,accepted:logs.filter(l=>l.state==='accepted').length,rejected:logs.filter(l=>l.state==='rejected').length,unconfirmed:logs.filter(l=>l.state==='unknown').length},logs});
  }
  mutate(name:string,raw:any){
    if(name==='push.subscribe'){pushSubscriptionInput.parse(raw);this.registered=true;return {success:true,actorId:this.actorId,merchantId:this.merchantId,deviceHash:this.hash};}
    if(name==='push.unsubscribe'){const i=pushUnsubscribeInput.parse(raw);if(i.deviceHash!==this.hash)throw Error('Device changed');this.registered=false;return {success:true,actorId:this.actorId,merchantId:this.merchantId,deviceHash:this.hash};}
    const i=pushTestInput.parse(raw);
    if(!this.registered||i.deviceHash!==this.hash)throw Error('Device changed');
    if(!this.attempts.has(i.requestId))this.attempts.set(i.requestId,{...i,state:this.mode()==='uncertain-save'?'unknown':'accepted'});
    return pushTestResult.parse({actorId:this.actorId,merchantId:this.merchantId,requestId:i.requestId,state:this.attempts.get(i.requestId).state});
  }
}
