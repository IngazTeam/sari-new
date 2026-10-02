import { referralProgramProfile } from '../shared/referral-program';
import { createHash } from 'node:crypto';
import { referralWorkspaceInput, referralWorkspaceSchema, type ReferralSelection, type ReferralWorkspaceRow } from '../shared/referral-workspace';
type Source = { codes: any[]; referrals: any[]; rewards: any[]; program?: unknown };
export function projectReferralWorkspace(actorId: number, merchantId: number, canManage: boolean, input: ReferralSelection, source: Source, now = new Date()) {
  const selection = referralWorkspaceInput.parse(input);
  if ([source.codes, source.referrals, source.rewards].some(rows => rows.some(row => row.merchantId !== merchantId))) throw Error('Invalid referral source scope');
  const encode = (raw: any, kind: 'code' | 'referral' | 'reward'): ReferralWorkspaceRow => {
    const issues: string[] = [];
    const text = (v: any, field: string, max: number, nullable = false) => { if (nullable && v == null) return ''; if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) { issues.push(field); return ''; } return v; };
    const flag = (v: any, field: string) => { if (v !== 0 && v !== 1) { issues.push(field); return null; } return v === 1; };
    const date = (v: any, field: string, nullable = false) => {
      if (nullable && v == null) return null;
      const value = v instanceof Date && Number.isFinite(v.getTime()) ? v.toISOString() : typeof v === 'string' ? v.replace(' ', 'T') : '';
      const d = new Date(value.endsWith('Z') ? value : value + 'Z');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 19) !== value.slice(0, 19)) { issues.push(field); return null; } return d.toISOString();
    };
    const createdAt = date(raw.createdAt, 'created'), updatedAt = date(raw.updatedAt, 'updated');
    // Hash only the exact persisted projection and joins, never the changing current time.
    const common = { id: raw.id, createdAt, updatedAt, issues, revision: createHash('sha256').update(JSON.stringify([kind, raw])).digest('hex') };
    if (kind === 'code') {
      const code = text(raw.code, 'code', 50); if (!code.trim()) issues.push('code');
      const referrerName = text(raw.referrerName, 'name', 255), referrerPhone = text(raw.referrerPhone, 'phone', 20), isActive = flag(raw.isActive, 'activation'), rewardGiven = flag(raw.rewardGiven, 'reward');
      const recordedCount = typeof raw.referralCount === 'number' && Number.isSafeInteger(raw.referralCount) && raw.referralCount >= 0 ? raw.referralCount : null; if (recordedCount === null) issues.push('count');
      return { ...common, kind, code, referrerName, referrerPhone, isActive, recordedCount, rewardGiven, state: issues.length ? 'invalid' : isActive ? 'active' : 'inactive' };
    }
    if (kind === 'referral') {
      const code = text(raw.code, 'code', 50), referredName = text(raw.referredName, 'name', 255), referredPhone = text(raw.referredPhone, 'phone', 20), orderCompleted = flag(raw.orderCompleted, 'completion');
      return { ...common, kind, codeId: raw.referralCodeId, code, referredName, referredPhone, orderCompleted, state: issues.length ? 'invalid' : orderCompleted ? 'completed' : 'pending' };
    }
    const type = ['discount_10', 'free_month', 'analytics_upgrade'].includes(raw.rewardType) ? raw.rewardType : null; if (!type) issues.push('type');
    const storedState = ['pending', 'claimed', 'expired'].includes(raw.status) ? raw.status : null; if (!storedState) issues.push('status');
    const expiresAt = date(raw.expiresAt, 'expiry'), claimedAt = date(raw.claimedAt, 'claimed', true), description = text(raw.description, 'description', 100000, true), referralAvailable = raw.scopedReferralId === raw.referralId;
    if (!referralAvailable) issues.push('referral'); if (storedState === 'claimed' && !claimedAt || storedState !== 'claimed' && claimedAt) issues.push('claim_state');
    return { ...common, kind, referralId: raw.referralId, type, storedState, description, expiresAt, claimedAt, referralAvailable, state: issues.length ? 'invalid' : storedState === 'pending' && expiresAt! <= now.toISOString() ? 'expired' : storedState };
  };
  let invitation: {state:'not_created'|'ready'|'inactive'|'invalid';codeId:number|null;code:string|null;applied:boolean} = {state:'not_created',codeId:null,code:null,applied:false};
  try { const profile=referralProgramProfile(source.program);invitation.applied=!!profile.applied;if(profile.codeId){const raw=source.codes.find(row=>row.id===profile.codeId),record=raw?encode(raw,'code'):null;invitation=record?.kind==='code'&&record.state!=='invalid'?{state:record.isActive?'ready':'inactive',codeId:record.id,code:record.code,applied:!!profile.applied}:{state:'invalid',codeId:profile.codeId,code:null,applied:!!profile.applied};}}catch{invitation.state='invalid';}
  const all = (selection.tab === 'codes' ? source.codes.map(row => encode(row, 'code')) : selection.tab === 'referrals' ? source.referrals.map(row => encode(row, 'referral')) : source.rewards.map(row => encode(row, 'reward')));
  const counts = { active: 0, inactive: 0, pending: 0, completed: 0, claimed: 0, expired: 0, invalid: 0 };
  for (const row of all) counts[row.state]++;
  const query = selection.query.toLocaleLowerCase('en');
  const matches = all.filter(row => (selection.state === 'all' || row.state === selection.state) && (!query || String(row.id) === query || (row.kind === 'code' ? [row.code, row.referrerName, row.referrerPhone] : row.kind === 'referral' ? [row.code, row.referredName, row.referredPhone] : [row.description, String(row.referralId)]).some(value => value.toLocaleLowerCase('en').includes(query))));
  return referralWorkspaceSchema.parse({ actorId, merchantId, checkedAt: now.toISOString(), canManage, selection, totals: { codes: source.codes.length, referrals: source.referrals.length, rewards: source.rewards.length }, counts, invitation, rewardFulfillment: 'not_verified', pageSize: 25, matched: matches.length, pages: Math.ceil(matches.length / 25), rows: matches.slice((selection.page - 1) * 25, selection.page * 25) });
}
