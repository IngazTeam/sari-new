import { createHash } from 'node:crypto';
import { z } from 'zod';

const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const sheetIntentSchema = z.object({
  version:z.literal(1), integrationId:z.number().int().positive().max(2147483647),
  destinationHash:digest, payloadHash:digest,
}).strict();
export const sheetReceiptSchema = z.object({
  version:z.literal(1), intentHash:digest, updatedRangeHash:digest,
  rows:z.literal(1), columns:z.literal(10), cells:z.literal(10),
}).strict();
export type SheetIntent = z.infer<typeof sheetIntentSchema>;
export type SheetReceipt = z.infer<typeof sheetReceiptSchema>;
export type SheetEvidenceHooks = {
  prepare:(intent:SheetIntent)=>Promise<void>;
  accept:(receipt:SheetReceipt)=>Promise<void>;
};
// Hash canonical arrays, not MySQL JSON object property order. No copied row,
// spreadsheet identifier or OAuth secret belongs in the receipt ledger.
export const sheetHash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sheetIntentHash = (value:unknown) => {
  const v=sheetIntentSchema.parse(value);return sheetHash([v.version,v.integrationId,v.destinationHash,v.payloadHash]);
};
export const sheetReceiptHash = (value:unknown) => {
  const v=sheetReceiptSchema.parse(value);return sheetHash([v.version,v.intentHash,v.updatedRangeHash,v.rows,v.columns,v.cells]);
};
export function makeSheetIntent(integrationId:number,spreadsheetId:string,range:string,values:unknown):SheetIntent {
  z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/).parse(spreadsheetId);
  z.literal('الطلبات!A:J').parse(range);
  z.array(z.array(z.string().max(50000)).length(10)).length(1).parse(values);
  if(Buffer.byteLength(JSON.stringify(values))>500000)throw Error('Sheet row too large');
  return sheetIntentSchema.parse({version:1,integrationId,destinationHash:sheetHash([spreadsheetId,range]),payloadHash:sheetHash(values)});
}
/** Google must confirm the exact destination, one complete RAW row and its values. */
export function verifySheetAppend(data:unknown,intent:SheetIntent,spreadsheetId:string,values:string[][]):SheetReceipt {
  const response=z.object({spreadsheetId:z.literal(spreadsheetId),updates:z.object({
    spreadsheetId:z.literal(spreadsheetId),updatedRange:z.string().max(256),updatedRows:z.literal(1),
    updatedColumns:z.literal(10),updatedCells:z.literal(10),updatedData:z.object({
      range:z.string().max(256),majorDimension:z.literal('ROWS').optional(),values:z.array(z.array(z.string())).length(1),
    }),
  })}).parse(data);
  const u=response.updates,match=/^(?:الطلبات|'الطلبات')!A([1-9][0-9]{0,8}):J\1$/.exec(u.updatedRange);
  if(!match||u.updatedData.range!==u.updatedRange||sheetHash(u.updatedData.values)!==intent.payloadHash
    ||sheetHash(values)!==intent.payloadHash||sheetHash([spreadsheetId,'الطلبات!A:J'])!==intent.destinationHash) {
    throw Error('Sheet append evidence mismatch');
  }
  return sheetReceiptSchema.parse({version:1,intentHash:sheetIntentHash(intent),updatedRangeHash:sheetHash(u.updatedRange),rows:1,columns:10,cells:10});
}
