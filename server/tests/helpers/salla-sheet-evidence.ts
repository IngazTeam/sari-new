import { makeSheetIntent,sheetHash,sheetIntentHash } from '../../integrations/salla-sheet-evidence';
export const syntheticSheetIntent=()=>makeSheetIntent(1,'synthetic-sheet','الطلبات!A:J',[['1','date','time','Synthetic','966500000000','Product','123.45','pending','-','-']]);
export const syntheticSheetReceipt=()=>({version:1 as const,intentHash:sheetIntentHash(syntheticSheetIntent()),updatedRangeHash:sheetHash("'الطلبات'!A5:J5"),rows:1 as const,columns:10 as const,cells:10 as const});
export async function simulateAcceptedSheetAppend(_order:unknown,options:any) {
  await options.beforeSend();await options.evidence.prepare(syntheticSheetIntent());await options.evidence.accept(syntheticSheetReceipt());return {success:true};
}
