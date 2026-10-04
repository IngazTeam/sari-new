import type {PoolConnection} from 'mysql2/promise';
import {TRPCError} from '@trpc/server';
import {sheetsConversationExportInput,SHEETS_CONVERSATION_MESSAGE_LIMIT} from '../shared/sheets-conversation-export';
import {runSheetsUserOperation,type SheetsUserScope} from './sheets-user-operation';
import {getGoogleIntegration} from './db';
import {appendToSheet} from './_core/googleSheets';

/** Exact selected tenant set; no foreign conversation's messages are ever read. */
export async function readConversationExportRows(tx:PoolConnection,merchantId:number,raw:unknown){
 const {conversationIds}=sheetsConversationExportInput.parse(raw),ids=[...conversationIds].sort((a,b)=>a-b),marks=ids.map(()=>'?').join(',');
 const [selected]=await tx.execute<any[]>(`SELECT id FROM conversations WHERE merchantId=? AND id IN (${marks}) ORDER BY id FOR SHARE`,[merchantId,...ids]);
 if(!Array.isArray(selected)||JSON.stringify(selected.map(r=>r.id))!==JSON.stringify(ids))throw new TRPCError({code:'FORBIDDEN',message:'sheets_export:selection_unavailable'});
 const [messages]=await tx.execute<any[]>(`SELECT m.id,m.createdAt,m.direction,m.content,c.customerName,c.customerPhone FROM messages m JOIN conversations c ON c.id=m.conversationId
  WHERE c.merchantId=? AND c.id IN (${marks}) ORDER BY m.createdAt,m.id LIMIT ${SHEETS_CONVERSATION_MESSAGE_LIMIT+1} FOR SHARE`,[merchantId,...ids]);
 if(!Array.isArray(messages)||messages.length>SHEETS_CONVERSATION_MESSAGE_LIMIT)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_export:too_large'});
 const rows=messages.map(message=>{
  const date=new Date(message.createdAt);
  if(!Number.isFinite(date.getTime())||!['incoming','outgoing'].includes(message.direction)||typeof message.content!=='string'||message.content.length>50000||typeof message.customerPhone!=='string'||message.customerName!==null&&typeof message.customerName!=='string')throw Error('Invalid export data');
  return [date.toISOString().slice(0,10),date.toISOString().slice(11,19)+' UTC',message.customerName||'—',message.customerPhone,message.direction==='incoming'?'وارد':'صادر',message.content||'—'];
 });
 if(Buffer.byteLength(JSON.stringify(rows),'utf8')>2*1024*1024)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_export:too_large'});
 return rows;
}
export async function exportScopedConversationsToSheets(scope:SheetsUserScope,raw:unknown){
 const input=sheetsConversationExportInput.parse(raw);
 return runSheetsUserOperation(scope,async tx=>{
  const rows=await readConversationExportRows(tx,scope.merchantId,input);
  if(!rows.length)return {success:false as const,message:'لا توجد رسائل في المحادثات المحددة'};
  const integration=await getGoogleIntegration(scope.merchantId,'sheets');
  if(!integration||!integration.isActive||!integration.sheetId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_export:connection_required'});
  const result=await appendToSheet(scope.merchantId,integration.sheetId,'المحادثات!A:F',rows,{raw:true,beforeSend:async()=>{
   // Read locks retain selected conversations; the authority lock also fences disconnect.
   const current=await getGoogleIntegration(scope.merchantId,'sheets');
   if(!current?.isActive||current.id!==integration.id||current.sheetId!==integration.sheetId)throw Error('Changed export destination');
  }});
  if(result?.success!==true)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_export:unconfirmed'});
  const [updated]=await tx.execute<any>("UPDATE google_integrations SET last_sync=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND integration_type='sheets' AND is_active=1 AND sheet_id=?",[integration.id,scope.merchantId,integration.sheetId]);
  if(updated?.affectedRows!==1)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_export:unconfirmed'});
  return {success:true as const,message:'قُبل تصدير الرسائل المحددة إلى Google Sheets'};
 });
}
