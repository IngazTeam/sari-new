import { readFileSync } from 'node:fs';
import { getPool } from '../../db/connection';
import { assertDisposableDatabase } from './disposable-merchant';

export async function ensureKnowledgeIntakeTestSchema() {
  assertDisposableDatabase();
  const connection = await (await getPool())!.getConnection();
  try {
    const [locked] = await connection.query<any[]>("SELECT GET_LOCK(CONCAT(DATABASE(), ':knowledge-receipt-test-schema'), 10) AS ok");
    if (locked[0]?.ok !== 1) throw Error('Test schema lock unavailable');
    const [docs] = await connection.query<any[]>("SHOW COLUMNS FROM merchant_knowledge_docs LIKE 'intake_request_id'");
    if (!docs.length) for (const statement of readFileSync('drizzle/0152_knowledge_intake_receipts.sql', 'utf8').split('--> statement-breakpoint')) await connection.query(statement);
    const [receipts] = await connection.query<any[]>("SHOW COLUMNS FROM knowledge_intake_receipts LIKE 'execution_token'");
    if (!receipts.length) await connection.query(readFileSync('drizzle/0153_knowledge_intake_recovery.sql', 'utf8'));
    const [review] = await connection.query<any[]>("SHOW COLUMNS FROM knowledge_intake_receipts LIKE 'review_snapshot'");
    if (!review.length) for (const statement of readFileSync('drizzle/0154_knowledge_intake_reviews.sql', 'utf8').split('--> statement-breakpoint')) await connection.query(statement);
    const [plan] = await connection.query<any[]>("SHOW COLUMNS FROM knowledge_intake_reviews LIKE 'basis_hash'");
    if (!plan.length) await connection.query(readFileSync('drizzle/0155_knowledge_intake_plans.sql', 'utf8'));
  } finally {
    try { await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':knowledge-receipt-test-schema'))"); } finally { connection.release(); }
  }
}
