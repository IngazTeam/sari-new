import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { staffCatalogFields, staffCatalogPatch } from '../shared/staff-catalog';
import { serviceCatalogId, serviceCatalogDefinition } from '../shared/service-catalog-write';
import { withBookingCapacityTransaction } from './booking-capacity';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const columns = { name:'name',phone:'phone',email:'email',role:'role',workingHours:'working_hours',googleCalendarId:'google_calendar_id',isActive:'is_active' } as const;
export const staffDefinitionKey = (merchantId: number, id: number, row: Record<string,unknown>) => createHash('sha256').update(JSON.stringify(['staff',merchantId,id,Object.keys(columns).map(key=>[key,row[key]??null])])).digest('hex');
/** Share booking admission's first lock, then lock the provider row. Archive retains all history and references. */
export async function writeStaffCatalog(merchantId: number, raw: unknown, id?: number, expectedDefinition?: string) {
  serviceCatalogId.parse(merchantId); if(id!==undefined) serviceCatalogId.parse(id); if(expectedDefinition!==undefined) serviceCatalogDefinition.parse(expectedDefinition);
  const data = id===undefined ? staffCatalogFields.parse(raw) : staffCatalogPatch.parse(raw);
  try {
    return await withBookingCapacityTransaction(merchantId, async connection => {
      if(id!==undefined) {
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${Object.entries(columns).map(([key,column])=>`\`${column}\` AS \`${key}\``).join(',')} FROM staff_members WHERE id=? AND merchant_id=? FOR UPDATE`,[id,merchantId]);
        if(rows.length!==1) throw new TRPCError({code:'NOT_FOUND',message:'Staff member not found'});
        if(expectedDefinition!==undefined && staffDefinitionKey(merchantId,id,rows[0])!==expectedDefinition) throw new TRPCError({code:'CONFLICT',message:'Staff member changed; reload before saving'});
      }
      const fields = Object.entries(data).filter(([,v])=>v!==undefined);
      const values = fields.map(([key,value])=> key==='workingHours' ? value==null?null:JSON.stringify(value) : typeof value==='boolean'?Number(value):value===''?null:value);
      if(id===undefined) {
        const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO staff_members (merchant_id,${fields.map(([key])=>`\`${columns[key as keyof typeof columns]}\``).join(',')}) VALUES (?,${fields.map(()=>'?').join(',')})`,[merchantId,...values]);
        return serviceCatalogId.parse(Number(result.insertId));
      }
      await connection.execute(`UPDATE staff_members SET ${fields.map(([key])=>`\`${columns[key as keyof typeof columns]}\`=?`).join(',')} WHERE id=? AND merchant_id=?`,[...values,id,merchantId]);
      return id;
    });
  } catch(error) {
    if(error instanceof TRPCError) throw error;
    throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'Staff change unavailable'});
  }
}
