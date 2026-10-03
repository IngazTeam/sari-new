import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool:m.pool }));
import { withOrderNoticeAuthority } from './order-notification-workspace';
import { acknowledgeOrderNoticesInput, saveOrderNoticeTemplateInput } from '../shared/order-notification-actions';
import { acknowledgeReviewedOrderNotices, saveReviewedOrderNoticeTemplate } from './order-notification-actions';
const base = { status:'paid',revision:'a'.repeat(64),template:'Order {{orderNumber}}: {{total}} {{currency}}',enabled:true };
beforeEach(()=>vi.resetAllMocks());
it.each([{ revision:'invalid' },{status:'confirmed'},{template:'{{secret}}'},{template:'{{orderNumber}'},{template:'orderNumber}}'},{template:'a\0b'},{template:' '},{template:'a'.repeat(3501)},{merchantId:1}])('rejects invalid settings %j',patch=>expect(saveOrderNoticeTemplateInput.safeParse({...base,...patch}).success).toBe(false));
it('accepts literal names and all supported template variables',()=>expect(saveOrderNoticeTemplateInput.parse(base).template).toBe(base.template));
it.each([[],Array.from({length:26},(_,i)=>({id:i+1,revision:'a'.repeat(64)})),[{id:1,revision:'a'.repeat(64)},{id:1,revision:'b'.repeat(64)}],[{id:1,revision:'x'}]])('rejects an empty, duplicate, unbounded or invalid review set %#',records=>expect(acknowledgeOrderNoticesInput.safeParse({records}).success).toBe(false));
const transaction=()=>{
  const tx={query:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn(),execute:vi.fn()};
  tx.execute.mockResolvedValueOnce([[{id:2,userId:7,status:'active'}]]).mockResolvedValueOnce([[{id:7,account_status:'active'}]]).mockResolvedValueOnce([[]]);
  m.pool.mockResolvedValue({getConnection:vi.fn().mockResolvedValue(tx)});return tx;
};
it('reports an uncertain commit without retrying or returning a successful write',async()=>{
  const tx=transaction();tx.commit.mockRejectedValue(new Error('private'));await expect(withOrderNoticeAuthority(7,2,'write',async()=>1)).rejects.toMatchObject({reason:'unknown'});expect(tx.destroy).toHaveBeenCalledOnce();expect(tx.rollback).not.toHaveBeenCalled();expect(tx.commit).toHaveBeenCalledOnce();
});
it('rolls back a stale template before issuing an insert or update',async()=>{
  const tx=transaction();tx.execute.mockResolvedValueOnce([[]]);await expect(saveReviewedOrderNoticeTemplate(7,2,base)).rejects.toMatchObject({reason:'stale'});expect(tx.rollback).toHaveBeenCalledOnce();expect(tx.execute.mock.calls.some(([s])=>/^(UPDATE|INSERT)/.test(s))).toBe(false);
});
it('rolls back a missing reviewed record without closing a partial set',async()=>{
  const tx=transaction();tx.execute.mockResolvedValueOnce([[]]);await expect(acknowledgeReviewedOrderNotices(7,2,{records:[{id:1,revision:'a'.repeat(64)}]})).rejects.toMatchObject({reason:'missing'});expect(tx.rollback).toHaveBeenCalledOnce();expect(tx.execute.mock.calls.some(([s])=>/^UPDATE/.test(s))).toBe(false);
});
