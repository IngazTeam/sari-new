import { orderNoticeSelection, orderNoticeWorkspace, orderNoticeDetail, type OrderNoticeSelection } from '@shared/order-notification-workspace';
export function orderNoticeNavigation(search:string):OrderNoticeSelection {
  const p=new URLSearchParams(search), parsed=orderNoticeSelection.safeParse({query:p.get('q')??'',status:p.get('status'),state:p.get('state'),evidence:p.get('evidence'),
    integrity:p.get('integrity')??'all',sort:p.get('sort')??'newest',page:p.has('page')?Number(p.get('page')):1});
  return parsed.success?parsed.data:orderNoticeSelection.parse({});
}
export function scopedOrderNoticeWorkspace(raw:unknown,actorId:number,merchantId:number,selection:OrderNoticeSelection) {
  const r=orderNoticeWorkspace.safeParse(raw);return r.success&&r.data.actorId===actorId&&r.data.merchantId===merchantId&&JSON.stringify(r.data.selection)===JSON.stringify(selection)?r.data:null;
}
export function scopedOrderNoticeDetail(raw:unknown,actorId:number,merchantId:number,id:number) {
  const r=orderNoticeDetail.safeParse(raw);return r.success&&r.data.actorId===actorId&&r.data.merchantId===merchantId&&r.data.row.id===id?r.data:null;
}
