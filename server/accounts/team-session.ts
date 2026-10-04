import type { PoolConnection } from 'mysql2/promise';
import { TRPCError } from '@trpc/server';
import { hashSessionId, isSessionId } from '../_core/session-security';
export async function assertTeamSession(
  connection: Pick<PoolConnection, 'execute'>,
  actorId: number,
  sessionId: string
) {
  if (!isSessionId(sessionId)) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const [rows] = await connection.execute<any[]>(
    'SELECT id FROM auth_sessions WHERE user_id=? AND token_id_hash=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP() LIMIT 2 FOR SHARE',
    [actorId, hashSessionId(sessionId)]
  );
  if (rows.length !== 1) throw new TRPCError({ code: 'UNAUTHORIZED' });
}
