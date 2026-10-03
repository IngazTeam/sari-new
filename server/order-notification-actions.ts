import { acknowledgeOrderNoticesInput, acknowledgeOrderNoticesResult, saveOrderNoticeTemplateInput, saveOrderNoticeTemplateResult } from '../shared/order-notification-actions';
import { NOTICE_FROM, NOTICE_SELECT, noticeRows, OrderNoticeError, projectNoticeTemplate, projectOrderNotice, withOrderNoticeAuthority } from './order-notification-workspace';

/** Settings affect subsequent order reviews. Saving never dispatches or regenerates an existing outbox message. */
export async function saveReviewedOrderNoticeTemplate(actorId:number, merchantId:number, input:unknown) {
  const value = saveOrderNoticeTemplateInput.parse(input);
  return withOrderNoticeAuthority(actorId,merchantId,'write',async tx => {
    const sql = 'SELECT id,status,template,enabled,created_at,updated_at FROM notification_templates WHERE merchant_id=? AND status=? FOR UPDATE';
    const args = [merchantId,value.status], before = await noticeRows(tx,sql,args);
    if (before.length > 1) throw new OrderNoticeError('unavailable');
    let template = projectNoticeTemplate(before[0],value.status,actorId,merchantId);
    const same = template.stored && template.template === value.template && template.enabled === value.enabled;
    if (!same) {
      if (template.revision !== value.revision) throw new OrderNoticeError('stale');
      // The merchant lock serializes insertion of an absent status as well as edits.
      const [result] = await tx.execute<any>(before.length
        ? 'UPDATE notification_templates SET template=?,enabled=?,updated_at=UTC_TIMESTAMP() WHERE merchant_id=? AND status=?'
        : 'INSERT INTO notification_templates (template,enabled,merchant_id,status,updated_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',
      [value.template,value.enabled?1:0,merchantId,value.status]);
      if (result.affectedRows !== 1) throw new OrderNoticeError('unavailable');
      const [after] = await noticeRows(tx,sql,args); if (!after) throw new OrderNoticeError('unavailable');
      template = projectNoticeTemplate(after,value.status,actorId,merchantId);
      if (template.template !== value.template || template.enabled !== value.enabled) throw new OrderNoticeError('unavailable');
    }
    return saveOrderNoticeTemplateResult.parse({ actorId,merchantId,template,effect:same?'already_current':'saved',sendsMessage:false });
  });
}

/** All-or-nothing close of an explicitly reviewed set; a later incident is never included. No resend. */
export async function acknowledgeReviewedOrderNotices(actorId:number, merchantId:number, input:unknown) {
  const value = acknowledgeOrderNoticesInput.parse(input), ids = value.records.map(r=>r.id).sort((a,b)=>a-b), marks = ids.map(()=>'?').join(',');
  return withOrderNoticeAuthority(actorId,merchantId,'write',async tx => {
    const source = await noticeRows(tx,`SELECT ${NOTICE_SELECT} FROM ${NOTICE_FROM} WHERE n.merchant_id=? AND n.id IN (${marks}) ORDER BY n.id FOR UPDATE`,[merchantId,...ids]);
    if (source.length !== ids.length) throw new OrderNoticeError('missing');
    for (const raw of source) {
      const row = projectOrderNotice(raw,actorId,merchantId);
      if (row.integrity !== 'linked' || !row.hasEvent) throw new OrderNoticeError('reference');
      if (row.state !== 'manual_review' || row.revision !== value.records.find(r=>r.id===row.id)?.revision) throw new OrderNoticeError('stale');
    }
    const [result] = await tx.execute<any>(`UPDATE order_notifications SET delivery_status='suppressed',error='merchant_acknowledged',
      reviewed_at=UTC_TIMESTAMP(3),reviewed_by_user_id=? WHERE merchant_id=? AND id IN (${marks}) AND delivery_status='manual_review'`,[actorId,merchantId,...ids]);
    if (result.affectedRows !== ids.length) throw new OrderNoticeError('unavailable');
    return acknowledgeOrderNoticesResult.parse({ actorId,merchantId,acknowledgedIds:ids,sendsMessage:false });
  });
}
