import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({settings:vi.fn(),receive:vi.fn(),remove:vi.fn(),clear:vi.fn(),connection:vi.fn(),accept:vi.fn()}));
vi.mock('./whatsapp',()=>({getWebhookSettings:mocks.settings,receiveNotification:mocks.receive,deleteNotification:mocks.remove,clearWebhookUrl:mocks.clear}));
vi.mock('./db',()=>({getWhatsAppConnectionRequestByMerchantId:mocks.connection,getAllWhatsAppConnectionRequests:vi.fn()}));
vi.mock('./messaging/ingress',()=>({acceptWhatsAppEvent:mocks.accept}));
import { startPolling, stopAllPolling } from './polling';

describe('polling transport and durable acknowledgement',()=>{
 beforeEach(()=>{
  vi.resetAllMocks();vi.useFakeTimers();
  mocks.connection.mockResolvedValue({status:'connected',instanceId:'123456',apiToken:'fixture'});
  mocks.settings.mockResolvedValue({webhookUrl:''});
  mocks.receive.mockResolvedValue({notification:{typeWebhook:'incomingMessageReceived',idMessage:'event'},receiptId:17});
  mocks.accept.mockResolvedValue({success:true});mocks.remove.mockResolvedValue({success:true});
 });
 afterEach(()=>{stopAllPolling();vi.useRealTimers();});
 it.each([{error:'network'},{}])('does not start or clear a webhook when delivery mode is unknown',async settings=>{
  mocks.settings.mockResolvedValue(settings);
  expect((await startPolling(7)).success).toBe(false);
  expect(mocks.clear).not.toHaveBeenCalled();expect(mocks.receive).not.toHaveBeenCalled();
 });
 it('preserves configured webhook delivery and never logs its secret URL',async()=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  try{
   mocks.settings.mockResolvedValue({webhookUrl:'https://example.test/secret-fixture'});
   expect(await startPolling(7)).toEqual({success:true});
   expect(mocks.clear).not.toHaveBeenCalled();expect(mocks.receive).not.toHaveBeenCalled();
   expect(JSON.stringify(log.mock.calls)).not.toContain('secret-fixture');
  }finally{log.mockRestore();}
 });
 it('acknowledges only after durable acceptance and pins the polled account identity',async()=>{
  let resolve!:()=>void;
  mocks.accept.mockImplementation(()=>new Promise(done=>{resolve=()=>done({success:true});}));
  const pending=startPolling(7);
  await vi.waitFor(()=>expect(mocks.accept).toHaveBeenCalled());
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.accept).toHaveBeenCalledWith(expect.objectContaining({instanceData:{idInstance:'123456'}}),'polling',7);
  resolve();await pending;
  expect(mocks.remove).toHaveBeenCalledWith('123456','fixture',17,'https://api.green-api.com');
  expect(mocks.clear).not.toHaveBeenCalled();
 });
 it('retains the provider notification when queue persistence fails',async()=>{
  mocks.accept.mockRejectedValue(new Error('Queue unavailable'));
  await startPolling(7);
  expect(mocks.remove).not.toHaveBeenCalled();
 });
 it('does not overlap long polling requests within a process',async()=>{
  let resolve!:(value:unknown)=>void;
  mocks.receive.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const pending=startPolling(7);
  await vi.waitFor(()=>expect(mocks.receive).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(6000);
  expect(mocks.receive).toHaveBeenCalledTimes(1);
  resolve({notification:null,receiptId:null});await pending;
 });
});
