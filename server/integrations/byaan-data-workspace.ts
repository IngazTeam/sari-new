import { byaanDataInteger as integer, byaanDataStamp, byaanFaqRevision } from './byaan-data-values';
import { getPool } from '../db/connection';
import { bookingReadId } from '../../shared/booking-read';
import { byaanDataInput, byaanDataWorkspaceSchema, byaanDataStates, byaanDataPageSize, type ByaanDataSelection } from '../../shared/byaan-data-workspace';
import { ByaanDashboardFault } from './byaan-dashboard-fault';

function courseNames(value: unknown) {
  const result = { courses: [] as string[], coursesTruncated: false, courseDataInvalid: false };
  if (value == null || value === '') return result;
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) throw Error();
    result.coursesTruncated = parsed.length > 100;
    for (const item of parsed.slice(0, 100)) {
      const name = typeof item === 'string' ? item.trim() : item && typeof item.name === 'string' ? item.name.trim() : null;
      if (!name) { result.courseDataInvalid = true; continue; }
      if (name.length > 255) result.coursesTruncated = true;
      result.courses.push(name.slice(0, 255));
    }
  } catch { result.courseDataInvalid = true; }
  return result;
}
const configuration = {
  trainees: {
    table: 'byaan_trainees', search: ['external_id','name','phone','email'],
    state: "CASE WHEN status IN ('active','archived') THEN status ELSE 'unknown' END",
    columns: 'id,merchant_id AS merchantId,external_id AS externalId,name,phone,email,enrolled_courses AS courseData,synced_at AS syncedAt,created_at AS createdAt',
  },
  faqs: {
    table: 'byaan_faqs', search: ['question','answer','category'],
    state: "CASE WHEN is_active NOT IN (0,1) OR use_in_bot NOT IN (0,1) THEN 'unknown' WHEN is_active=0 THEN 'disabled' WHEN use_in_bot=1 THEN 'included' ELSE 'excluded' END",
    columns: 'id,merchant_id AS merchantId,question,answer,category,is_active AS isActive,use_in_bot AS useInBot,synced_at AS syncedAt',
  },
  site: {
    table: 'byaan_site_content', search: ['title','content','page_type'],
    state: "CASE WHEN LENGTH(TRIM(content))=0 THEN 'empty' ELSE 'content' END",
    columns: 'id,merchant_id AS merchantId,page_type AS pageType,title,content,synced_at AS syncedAt',
  },
} as const;
function normalize(row: Record<string, any>, kind: ByaanDataSelection['kind']) {
  const base = { id: integer(row.id), merchantId: integer(row.merchantId), syncedAt: byaanDataStamp(row.syncedAt), kind, state: row.state };
  if (kind === 'trainees') return { ...base, externalId: row.externalId, name: row.name, phone: row.phone, email: row.email, ...courseNames(row.courseData), createdAt: byaanDataStamp(row.createdAt) };
  if (kind === 'faqs') return { ...base, question: row.question, answer: row.answer, category: row.category, isActive: row.isActive === 1 ? true : row.isActive === 0 ? false : null, useInBot: row.useInBot === 1 ? true : row.useInBot === 0 ? false : null, revision: byaanFaqRevision(row) };
  return { ...base, pageType: ['about','vision','mission','policies','custom'].includes(row.pageType) ? row.pageType : 'unknown', title: row.title, content: row.content };
}
/** Connection, search counts, state counts and page share one read-only snapshot. */
export async function readByaanDataWorkspace(actorId: number, merchantId: number, input: unknown) {
  bookingReadId.parse(actorId); bookingReadId.parse(merchantId); const selection = byaanDataInput.parse(input);
  const pool = await getPool(); if (!pool) throw new ByaanDashboardFault('unavailable');
  const tx = await pool.getConnection(); let committing = false, reusable = true;
  try {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await tx.query('START TRANSACTION READ ONLY');
    const read = async (sql: string, args: any[]): Promise<any[]> => { const result = await tx.execute(sql, args); if (!Array.isArray(result[0])) throw new ByaanDashboardFault('unavailable'); return result[0]; };
    const connection = await read(`SELECT m.integration_source AS source,c.is_active AS active,c.verified_at AS verifiedAt
      FROM merchants m LEFT JOIN byaan_connections c ON c.merchant_id=m.id WHERE m.id=?`, [merchantId]);
    if (connection.length !== 1 || connection[0].source !== 'byaan' || connection[0].active !== 1 || !connection[0].verifiedAt) throw new ByaanDashboardFault('inactive');
    const config = configuration[selection.kind], args: any[] = [merchantId];
    let search = '';
    if (selection.search) {
      search = ' AND (' + config.search.map(column => `${column} LIKE ? ESCAPE '!'`).join(' OR ') + ')';
      const pattern = '%' + selection.search.replace(/[!%_]/g, value => '!' + value) + '%';
      args.push(...config.search.map(() => pattern));
    }
    // All interpolated SQL fragments are selected from the fixed configuration above.
    const storedRows = await read(`SELECT COUNT(*) AS count FROM ${config.table} WHERE merchant_id=?`, [merchantId]);
    if (storedRows.length !== 1) throw new ByaanDashboardFault('unavailable');
    const stored = integer(storedRows[0].count);
    const groupRows = await read(`SELECT ${config.state} AS state,COUNT(*) AS count FROM ${config.table} WHERE merchant_id=?${search} GROUP BY state`, args);
    const keys = byaanDataStates[selection.kind] as readonly string[];
    if (groupRows.some(row => !keys.includes(row.state)) || new Set(groupRows.map(row => row.state)).size !== groupRows.length) throw new ByaanDashboardFault('unavailable');
    const groups = keys.map(key => ({ key, count: integer(groupRows.find(row => row.state === key)?.count ?? 0) }));
    const matched = groups.reduce((sum, row) => sum + row.count, 0);
    const total = selection.state === 'all' ? matched : groups.find(row => row.key === selection.state)!.count;
    const stateFilter = selection.state === 'all' ? '' : ` AND (${config.state})=?`;
    const pageArgs = [...args, ...(selection.state === 'all' ? [] : [selection.state]), byaanDataPageSize, (selection.page - 1) * byaanDataPageSize];
    const page = await read(`SELECT ${config.columns},${config.state} AS state FROM ${config.table} WHERE merchant_id=?${search}${stateFilter} ORDER BY id ASC LIMIT ? OFFSET ?`, pageArgs);
    const result = byaanDataWorkspaceSchema.parse({ actorId, merchantId, checkedAt: new Date().toISOString(), selection,
      summary: { stored, matched, groups }, pagination: { page: selection.page, pageSize: byaanDataPageSize, total, pages: Math.ceil(total / byaanDataPageSize) }, rows: page.map(row => normalize(row, selection.kind)) });
    committing = true; await tx.commit(); return result;
  } catch (error) {
    if (committing) reusable = false; else try { await tx.rollback(); } catch { reusable = false; }
    if (error instanceof ByaanDashboardFault) throw error; throw new ByaanDashboardFault('unavailable');
  } finally { if (reusable) tx.release(); else tx.destroy(); }
}
