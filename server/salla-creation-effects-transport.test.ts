import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),log:vi.fn(),update:vi.fn(),push:vi.fn(),subscriptions:vi.fn(),
  integration:vi.fn(),oauth:vi.fn(),append:vi.fn(),order:vi.fn(),database:vi.fn()}));
vi.mock('./_core/env',()=>({ENV:{forgeApiUrl:'https://synthetic.example.test',forgeApiKey:'synthetic'}}));
vi.mock('./db_smtp',()=>({createEmailLog:m.log,updateEmailLogStatus:m.update}));
vi.mock('web-push',()=>({default:{setVapidDetails:vi.fn(),sendNotification:m.push}}));
vi.mock('./db_push',()=>({getActivePushSubscriptions:m.subscriptions,createPushNotificationLog:m.log,updatePushNotificationLogStatus:m.update,deactivatePushSubscription:vi.fn()}));
vi.mock('./db',()=>({getDb:m.database,getOrderById:m.order,getGoogleIntegration:m.integration,getGoogleOAuthSettings:m.oauth,updateGoogleIntegration:m.update,
  createGoogleIntegration:vi.fn(),createProduct:vi.fn(),getConversationById:vi.fn(),getMerchantById:vi.fn(),getMessagesByConversationId:vi.fn(),getProductsByMerchantId:vi.fn(),updateProduct:vi.fn()}));
vi.mock('./_core/google-api-clients',()=>({google:{auth:{OAuth2:class {setCredentials(){} }},sheets:()=>({spreadsheets:{values:{append:m.append}}})}}));
import { notifyNewOrder as ownerNotice } from './_core/emailNotifications';
import { notifyNewOrder as merchantNotice, sendNotification } from './_core/notificationService';
import { sendEmail } from './_core/emailService';
import { sendPushNotification } from './_core/pushNotifications';
import { appendToSheet } from './_core/googleSheets';
import { syncOrderToSheets } from './sheetsSync';
import { merchants,notificationPreferences,notificationSettings } from '../drizzle/schema';
import { formatMinorMoney } from '../shared/product-money';
const subscription={id:1,merchantId:7,endpoint:'https://synthetic.example.test/push',p256dh:'synthetic',auth:'synthetic'};
const integration=()=>({id:1,merchantId:7,isActive:1,sheetId:'synthetic-sheet',credentials:JSON.stringify({refresh_token:'synthetic-account',access_token:'synthetic-access'})});
const ownerData={merchantName:'Synthetic',businessName:'Synthetic',orderNumber:'1',customerName:'Synthetic',customerPhone:'966500000000',totalAmount:123.45,itemsCount:1,orderDate:new Date('2026-09-27T12:00:00Z')};
let prefs:any,settings:any,inserted:any[],recipient:any;
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal('fetch',m.fetch);vi.stubEnv('SMTP2GO_API_KEY','synthetic');vi.stubEnv('VAPID_PUBLIC_KEY','synthetic');vi.stubEnv('VAPID_PRIVATE_KEY','synthetic');
  m.fetch.mockResolvedValue({ok:true,json:async()=>({data:{succeeded:1}})});m.push.mockResolvedValue(undefined);m.log.mockResolvedValue([{insertId:1}]);m.update.mockResolvedValue(undefined);
  m.subscriptions.mockReset().mockResolvedValue([subscription]);m.integration.mockReset().mockImplementation(async()=>integration());
  m.oauth.mockResolvedValue({clientId:'synthetic',clientSecret:'synthetic',isEnabled:1});m.append.mockReset().mockResolvedValue({data:{}});
  m.order.mockResolvedValue({id:4,merchantId:7,totalAmount:12345,customerName:'=HYPERLINK("x")',customerPhone:'+966500000000',items:'[{"name":"Synthetic","quantity":1}]',status:'pending',createdAt:'2026-09-27T12:00:00Z'});
  prefs={newOrdersEnabled:true,preferredMethod:'push',quietHoursEnabled:false};settings={newOrdersGlobalEnabled:true};inserted=[];recipient={userId:9,email:'owner@example.test'};
  m.database.mockResolvedValue({select:()=>({from:(table:any)=>{const chain:any={innerJoin:()=>chain,where:()=>chain,limit:async()=>table===notificationPreferences?[prefs]:table===notificationSettings?[settings]:table===merchants&&recipient?[recipient]:[]};return chain;}}),
    insert:()=>({values:async(value:any)=>{inserted.push(value);return [{insertId:1}];}}),update:()=>({set:()=>({where:async()=>{}})})});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('Salla effect last-mile guards through the real notification and Sheets adapters',()=>{
  it('owner notice invokes its guard once, immediately before the outbound request',async()=>{
    const guard=vi.fn(async()=>{expect(m.fetch).not.toHaveBeenCalled();});expect(await ownerNotice(ownerData,guard)).toBe(true);expect(guard).toHaveBeenCalledTimes(1);expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(m.fetch.mock.calls[0][1].body).content).toContain('123.45 ريال');
  });
  it('owner notice refuses transport when its guard fails',async()=>{
    expect(await ownerNotice(ownerData,async()=>{throw Error('guard rejected');})).toBe(false);expect(m.fetch).not.toHaveBeenCalled();
  });
  it('email checks the guard after logging and before SMTP transport',async()=>{
    const guard=vi.fn(async()=>{expect(m.log).toHaveBeenCalledTimes(1);expect(m.fetch).not.toHaveBeenCalled();throw Error('guard rejected');});
    expect(await sendEmail({to:'synthetic@example.test',subject:'Test',html:'Test',beforeSend:guard})).toBe(false);expect(m.fetch).not.toHaveBeenCalled();
  });
  it('each push target is rechecked and guarded before transport',async()=>{
    const guard=vi.fn().mockResolvedValue(undefined);expect(await sendPushNotification(7,{title:'Test',body:'Test'},guard)).toEqual({success:1,failed:0});expect(guard).toHaveBeenCalledTimes(1);expect(m.subscriptions).toHaveBeenCalledTimes(2);
  });
  it.each(['deleted','endpoint','auth','p256dh'])('push subscription %s change cannot receive the notice',async mode=>{
    m.subscriptions.mockResolvedValueOnce([subscription]).mockResolvedValueOnce(mode==='deleted'?[]:[{...subscription,[mode]:'changed'}]);
    const guard=vi.fn();expect(await sendPushNotification(7,{title:'Test',body:'Test'},guard)).toEqual({success:0,failed:1});expect(guard).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
  });
  it('a push guard rejection cannot reach its provider',async()=>{
    expect(await sendPushNotification(7,{title:'Test',body:'Test'},async()=>{throw Error('guard rejected');})).toEqual({success:0,failed:1});expect(m.push).not.toHaveBeenCalled();
  });
  it('merchant notice formats minor units and forwards the guard to the actual push call',async()=>{
    const guard=vi.fn().mockResolvedValue(undefined);expect(await merchantNotice(7,4,12345,guard)).toBe(true);expect(guard).toHaveBeenCalledTimes(1);
    expect(inserted[0]).toMatchObject({url:'/merchant/orders',body:`لديك طلب جديد بقيمة ${formatMinorMoney(12345)}`});
  });
  it.each(['disabled','method'])('merchant %s preference change during preparation blocks transport',async mode=>{
    m.subscriptions.mockImplementation(async()=>{if(mode==='disabled')prefs.newOrdersEnabled=false;else prefs.preferredMethod='email';return [subscription];});
    const guard=vi.fn();expect(await merchantNotice(7,4,12345,guard)).toBe(false);expect(guard).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
  });
  it('a disabled merchant preference never acquires a transport marker',async()=>{
    prefs.newOrdersEnabled=false;const guard=vi.fn();expect(await merchantNotice(7,4,12345,guard)).toBe(false);expect(guard).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
  });
  it('merchant email reaches the verified owner with the transport guard',async()=>{
    vi.stubEnv('VITE_APP_URL','https://sary.live');prefs.preferredMethod='email';const guard=vi.fn().mockResolvedValue(undefined);expect(await merchantNotice(7,4,12345,guard)).toBe(true);
    expect(JSON.parse(m.fetch.mock.calls[0][1].body).to).toEqual(['owner@example.test']);expect(guard).toHaveBeenCalledTimes(1);
    expect(JSON.parse(m.fetch.mock.calls[0][1].body).html_body).toContain('href="https://sary.live/merchant/orders"');
  });
  it('email treats customer-controlled title and body as text',async()=>{
    prefs.preferredMethod='email';
    expect(await sendNotification({merchantId:7,type:'custom',title:'<img src=x onerror="bad()">',body:'<a href="https://evil.test">Click & pay</a>'})).toBe(true);
    const html=JSON.parse(m.fetch.mock.calls[0][1].body).html_body;
    expect(html).not.toContain('<img');expect(html).not.toContain('<a');expect(html).toContain('&lt;img');expect(html).toContain('Click &amp; pay');
  });
  it.each(['javascript:alert(1)','data:text/html,<h1>bad</h1>','https://evil.test/pay','//evil.test/pay','https://sary.live@evil.test/','https://user:pass@sary.live/'])('email excludes an unsafe details link: %s',async url=>{
    vi.stubEnv('VITE_APP_URL','https://sary.live');prefs.preferredMethod='email';
    expect(await sendNotification({merchantId:7,type:'custom',title:'Test',body:'Test',url})).toBe(true);
    expect(JSON.parse(m.fetch.mock.calls[0][1].body).html_body).not.toContain('<a ');
  });
  it('email uses the configured application origin and escapes its link attributes',async()=>{
    vi.stubEnv('VITE_APP_URL','https://app.example.test');prefs.preferredMethod='email';
    expect(await sendNotification({merchantId:7,type:'custom',title:'Test',body:'Test',url:'/merchant/orders?filter=a&next=b'})).toBe(true);
    expect(JSON.parse(m.fetch.mock.calls[0][1].body).html_body).toContain('href="https://app.example.test/merchant/orders?filter=a&amp;next=b"');
  });
  it.each(['email','owner','missing'])('merchant email %s change after logging blocks SMTP',async mode=>{
    prefs.preferredMethod='email';m.log.mockImplementationOnce(async()=>{recipient=mode==='missing'?null:mode==='owner'?{...recipient,userId:10}:{...recipient,email:'changed@example.test'};return [{insertId:1}];});
    const guard=vi.fn();expect(await merchantNotice(7,4,12345,guard)).toBe(false);expect(m.fetch).not.toHaveBeenCalled();expect(guard).not.toHaveBeenCalled();
  });
  it('Sheets preserves customer text as RAW and formats the amount from minor units',async()=>{
    const guard=vi.fn().mockResolvedValue(undefined);expect((await syncOrderToSheets(4,{merchantId:7,beforeSend:guard})).success).toBe(true);expect(guard).toHaveBeenCalledTimes(1);
    const request=m.append.mock.calls[0][0];expect(request.valueInputOption).toBe('RAW');expect(request.requestBody.values[0][3]).toBe('=HYPERLINK("x")');expect(request.requestBody.values[0][6]).toBe(formatMinorMoney(12345));
  });
  it('Sheets calls its guard after client preparation, directly before append',async()=>{
    const guard=vi.fn(async()=>{expect(m.oauth).toHaveBeenCalled();expect(m.append).not.toHaveBeenCalled();throw Error('guard rejected');});
    expect((await appendToSheet(7,'synthetic','A:A',[['test']],{beforeSend:guard,raw:true})).success).toBe(false);expect(m.append).not.toHaveBeenCalled();
  });
  it.each(['merchant','sheet','credentials','disabled','connection'])('Sheets %s change never writes the row',async mode=>{
    if(mode==='merchant')m.order.mockResolvedValueOnce({...await m.order(),merchantId:8});
    else {let count=0;m.integration.mockImplementation(async()=>{count++;const result=integration();if(count>=3){if(mode==='sheet')result.sheetId='other';if(mode==='connection')result.id=2;if(mode==='disabled')result.isActive=0;if(mode==='credentials')result.credentials='{"refresh_token":"other"}';}return result;});}
    const guard=vi.fn();expect((await syncOrderToSheets(4,{merchantId:7,beforeSend:guard})).success).toBe(false);expect(m.append).not.toHaveBeenCalled();expect(guard).not.toHaveBeenCalled();
  });
  it('legacy append callers keep their original input mode',async()=>{
    expect((await appendToSheet(7,'synthetic','A:A',[['test']])).success).toBe(true);expect(m.append.mock.calls[0][0].valueInputOption).toBe('USER_ENTERED');
  });
});
