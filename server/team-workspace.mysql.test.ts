import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomBytes} from 'node:crypto';
const m=vi.hoisted(()=>({send:vi.fn()}));vi.mock('./_core/emailService',()=>({sendEmail:m.send}));
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {createSessionId,hashSessionId} from './_core/session-security';
import {teamRouter} from './routers-team';
import {readTeamWorkspace,revokeTeamInvitation,type TeamScope} from './accounts/team-workspace';
import {apiRateLimitBucketHash} from './api/distributed-rate-limit';
describe.skipIf(!process.env.DATABASE_URL)('Tenant team workspace on disposable MySQL',()=>{
 let a:Awaited<ReturnType<typeof createDisposableMerchant>>,b:typeof a,scope:TeamScope,caller:ReturnType<typeof teamRouter.createCaller>;
 const q=async(sql:string,args:any[]=[]) =>(await (await getPool())!.execute<any>(sql,args))[0];
 const member=async(userId:number,role:string)=>Number((await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)',[a.merchantId,userId,role])).insertId);
 const invite=async(merchantId=a.merchantId,expired=false)=>Number((await q("INSERT INTO merchant_invitations(merchant_id,email,role,token,status,invited_by,expires_at) VALUES (?,'pending@example.test','viewer',?,'pending',?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? DAY))",[merchantId,randomBytes(32).toString('hex'),a.userId,expired?-1:7])).insertId);
 beforeEach(async()=>{
  a=await createDisposableMerchant('team520');b=await createDisposableMerchant('team520-other');
  scope={actorId:a.userId,merchantId:a.merchantId,sessionId:createSessionId()};
  await q('INSERT INTO auth_sessions(user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',[a.userId,hashSessionId(scope.sessionId)]);
  caller=teamRouter.createCaller({user:{id:a.userId,role:'user'},session:{sessionId:scope.sessionId},req:{headers:{'x-merchant-id':String(a.merchantId)}}} as any);m.send.mockReset().mockResolvedValue(true);
 });
 afterEach(async()=>{
  vi.restoreAllMocks();for(const x of [a,b])if(x)await q('DELETE FROM api_rate_limit_windows WHERE bucket_hash=?',[apiRateLimitBucketHash('team:invite',String(x.merchantId))]);
  await cleanupDisposableMerchants([a?.userId,b?.userId].filter(Boolean));
 });afterAll(closeDb);
 it('includes a legacy owner without creating a membership, with bound actor and tenant',async()=>{
  const d=await caller.workspace();expect(d).toMatchObject({actorId:a.userId,merchantId:a.merchantId,actorRole:'owner',canManageOwners:true,counts:{members:1,owners:1}});
  expect(d.members).toMatchObject([{id:null,userId:a.userId,role:'owner',legacy:true}]);expect(await q('SELECT id FROM merchant_members WHERE merchant_id=?',[a.merchantId])).toEqual([]);
 });
 it('requires explicit review before team mutations',async()=>{
  const target=await member(b.userId,'viewer'),id=await invite();
  await expect(caller.invite({email:'unreviewed@example.test',role:'viewer'} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(caller.remove({memberId:target} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(caller.updateRole({memberId:target,role:'manager'} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(caller.revokeInvite({invitationId:id} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
  expect(m.send).not.toHaveBeenCalled();expect((await q('SELECT role,is_active FROM merchant_members WHERE id=?',[target]))[0]).toMatchObject({role:'viewer',is_active:1});
 });
 it('separates pending and expired invitations without exposing bearer tokens or another tenant',async()=>{
  const pending=await invite(),expired=await invite(a.merchantId,true);await invite(b.merchantId);
  const d=await caller.workspace();expect(d.counts).toMatchObject({pending:1,expired:1});expect(d.invitations.map(i=>[i.id,i.status])).toEqual([[expired,'expired'],[pending,'pending']]);expect(JSON.stringify(d)).not.toMatch(/token|recipientHash/);
 });
 it('limits invitation history with truthful totals',async()=>{
  for(let i=0;i<101;i++)await invite();const d=await caller.workspace();expect(d.invitations).toHaveLength(100);expect(d.hasMoreInvitations).toBe(true);expect(d.counts.pending).toBe(101);
 });
 it.each(['revoked','expired','missing','foreign'])('refuses %s sessions for reads, mutations and invitations',async mode=>{
  const target=await member(b.userId,'viewer'),id=await invite();
  if(mode==='revoked')await q('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?',[a.userId]);
  if(mode==='expired')await q('UPDATE auth_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE user_id=?',[a.userId]);
  if(mode==='missing')await q('DELETE FROM auth_sessions WHERE user_id=?',[a.userId]);
  if(mode==='foreign')await q('UPDATE auth_sessions SET user_id=? WHERE user_id=?',[b.userId,a.userId]);
  await expect(caller.workspace()).rejects.toMatchObject({code:'UNAUTHORIZED'});
  await expect(caller.remove({reviewed:true,memberId:target,expectedRole:'viewer'})).rejects.toMatchObject({code:'UNAUTHORIZED'});
  await expect(caller.revokeInvite({reviewed:true,invitationId:id})).rejects.toMatchObject({code:'UNAUTHORIZED'});
  await expect(caller.invite({reviewed:true,email:'new@example.test',role:'viewer'})).rejects.toMatchObject({code:'UNAUTHORIZED'});expect(m.send).not.toHaveBeenCalled();
 });
 it('rejects foreign member/invitation IDs and stale expected roles without modifying them',async()=>{
  const target=await member(b.userId,'viewer'),foreign=await invite(b.merchantId);
  await expect(caller.updateRole({reviewed:true,memberId:target,expectedRole:'manager',role:'manager'})).rejects.toMatchObject({code:'CONFLICT'});
  await expect(caller.revokeInvite({reviewed:true,invitationId:foreign})).rejects.toMatchObject({code:'NOT_FOUND'});
  expect((await q('SELECT role FROM merchant_members WHERE id=?',[target]))[0].role).toBe('viewer');
 });
 it('returns exact member and invitation receipts after writes',async()=>{
  const target=await member(b.userId,'viewer');
  expect(await caller.updateRole({reviewed:true,memberId:target,expectedRole:'viewer',role:'manager'})).toMatchObject({success:true,actorId:a.userId,merchantId:a.merchantId,memberId:target});
  const id=await invite();expect(await caller.revokeInvite({reviewed:true,invitationId:id})).toEqual({success:true,actorId:a.userId,merchantId:a.merchantId,invitationId:id});await expect(caller.revokeInvite({reviewed:true,invitationId:id})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('rechecks team authority when a previously authorized actor is downgraded',async()=>{
  const id=await member(a.userId,'owner'),invitationId=await invite();await caller.workspace();
  await q("UPDATE merchant_members SET role='viewer' WHERE id=?",[id]);await expect(revokeTeamInvitation(scope,invitationId)).rejects.toMatchObject({code:'FORBIDDEN'});expect((await q('SELECT status FROM merchant_invitations WHERE id=?',[invitationId]))[0].status).toBe('pending');
 });
 it.each(['suspended-store','disabled-owner'])('does not serve or change a %s team',async mode=>{
  if(mode==='suspended-store')await q("UPDATE merchants SET status='suspended' WHERE id=?",[a.merchantId]);
  else await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[a.userId]);
  await expect(readTeamWorkspace(scope)).rejects.toBeDefined();expect(m.send).not.toHaveBeenCalled();
 });
 it('does not count a disabled user as the remaining usable owner',async()=>{
  const own=await member(a.userId,'owner');await member(b.userId,'owner');await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[b.userId]);
  expect((await caller.workspace()).counts.owners).toBe(1);await expect(caller.updateRole({reviewed:true,expectedRole:'owner',memberId:own,role:'viewer'})).rejects.toMatchObject({code:'BAD_REQUEST'});
 });
 it('limits invitation sends and revokes a failed-delivery link',async()=>{
  m.send.mockResolvedValue(false);await expect(caller.invite({reviewed:true,email:'failed@example.test',role:'viewer'})).rejects.toMatchObject({code:'BAD_GATEWAY'});
  expect((await q("SELECT status FROM merchant_invitations WHERE merchant_id=? AND email='failed@example.test'",[a.merchantId]))[0].status).toBe('revoked');
  m.send.mockResolvedValue(true);for(let i=0;i<9;i++)await caller.invite({reviewed:true,email:'test'+i+'@example.test',role:'viewer'});
  await expect(caller.invite({reviewed:true,email:'limit@example.test',role:'viewer'})).rejects.toMatchObject({code:'TOO_MANY_REQUESTS'});expect(m.send).toHaveBeenCalledTimes(10);
 });
});
