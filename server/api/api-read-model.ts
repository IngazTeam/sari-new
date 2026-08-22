import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import type { ApiListPagination } from './api-read-model-core';

export interface ApiProductReadModel {
  id: number;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  productType: string;
  status: 'active';
  isActive: true;
  stock: number | null;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiFaqReadModel {
  id: number;
  question: string;
  answer: string;
  category: string | null;
  isActive: boolean;
  useInBot: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiConversationReadModel {
  id: number;
  customerPhone: string;
  customerName: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  messageCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKnowledgeOverview {
  products: number;
  conversations: number;
  faqs: number;
  enabledFaqs: number;
  usableFaqs: number;
  document: null | {
    name: string;
    status: string;
    textLength: number;
  };
}

interface CountRow {
  total: number | string | bigint;
}

function positiveMerchantId(merchantId: number): void {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for API read model');
  }
}

function exactCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid API aggregate result');
  return count;
}

async function requiredPool() {
  const pool = await getPool();
  if (!pool) throw new Error('API read data unavailable');
  return pool;
}

export async function listApiProducts(
  merchantId: number,
  pagination: ApiListPagination,
): Promise<{ total: number; data: ApiProductReadModel[] }> {
  positiveMerchantId(merchantId);
  await assertRuntimeSchema('API product read model', [
    {
      table: 'products',
      columns: [
        'id', 'merchantId', 'name', 'description', 'price', 'currency', 'category',
        'isActive', 'status', 'trackInventory', 'stock', 'registrationOpen',
        'productType', 'imageUrl', 'productUrl', 'createdAt', 'updatedAt',
      ],
    },
  ]);
  const pool = await requiredPool();
  const [countResult, dataResult] = await Promise.all([
    pool.execute(
      "SELECT COUNT(*) AS total FROM products WHERE `merchantId` = ? AND `isActive` = 1 AND status = 'active'",
      [merchantId],
    ),
    pool.execute(
      `SELECT id, name, description, price, currency, category,
              \`imageUrl\` AS imageUrl, \`productUrl\` AS productUrl,
              \`productType\` AS productType, status, \`isActive\` AS isActive,
              stock, \`trackInventory\` AS trackInventory,
              \`registrationOpen\` AS registrationOpen,
              \`createdAt\` AS createdAt, \`updatedAt\` AS updatedAt
         FROM products
        WHERE \`merchantId\` = ? AND \`isActive\` = 1 AND status = 'active'
        ORDER BY id DESC
        LIMIT ? OFFSET ?`,
      [merchantId, pagination.limit, pagination.offset],
    ),
  ]);
  const countRows = countResult[0] as CountRow[];
  const rows = dataResult[0] as Array<Record<string, any>>;

  return {
    total: exactCount(countRows[0]?.total ?? 0),
    data: rows.map(row => {
      const inventoryAvailable = Number(row.trackInventory) !== 1 || (row.stock !== null && Number(row.stock) > 0);
      const registrationAvailable = row.productType !== 'service' || Number(row.registrationOpen) === 1;
      return {
        id: Number(row.id),
        name: row.name,
        description: row.description ?? null,
        price: Number(row.price),
        currency: row.currency,
        category: row.category ?? null,
        imageUrl: row.imageUrl ?? null,
        productUrl: row.productUrl ?? null,
        productType: row.productType,
        status: 'active',
        isActive: true,
        stock: row.stock === null ? null : Number(row.stock),
        inStock: inventoryAvailable && registrationAvailable,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),
  };
}

export async function listApiFaqs(
  merchantId: number,
  pagination: ApiListPagination,
): Promise<{ total: number; data: ApiFaqReadModel[] }> {
  positiveMerchantId(merchantId);
  await assertRuntimeSchema('API FAQ read model', [
    {
      table: 'extracted_faqs',
      columns: [
        'id', 'merchant_id', 'source_status', 'question', 'answer', 'category', 'priority',
        'is_active', 'use_in_bot', 'created_at', 'updated_at',
      ],
    },
  ]);
  const pool = await requiredPool();
  const [countResult, dataResult] = await Promise.all([
    pool.execute(
      "SELECT COUNT(*) AS total FROM extracted_faqs WHERE merchant_id = ? AND source_status = 'active'",
      [merchantId],
    ),
    pool.execute(
      `SELECT id, question, answer, category, is_active AS isActive, use_in_bot AS useInBot,
              created_at AS createdAt, updated_at AS updatedAt
         FROM extracted_faqs
        WHERE merchant_id = ? AND source_status = 'active'
        ORDER BY priority DESC, id DESC
        LIMIT ? OFFSET ?`,
      [merchantId, pagination.limit, pagination.offset],
    ),
  ]);
  const countRows = countResult[0] as CountRow[];
  const rows = dataResult[0] as Array<Record<string, any>>;

  return {
    total: exactCount(countRows[0]?.total ?? 0),
    data: rows.map(row => ({
      id: Number(row.id),
      question: row.question,
      answer: row.answer,
      category: row.category ?? null,
      isActive: Number(row.isActive) === 1,
      useInBot: Number(row.useInBot) === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  };
}

export async function listApiConversations(
  merchantId: number,
  pagination: ApiListPagination,
): Promise<{ total: number; data: ApiConversationReadModel[] }> {
  positiveMerchantId(merchantId);
  await assertRuntimeSchema('API conversation read model', [
    {
      table: 'conversations',
      columns: [
        'id', 'merchantId', 'customerPhone', 'customerName', 'lastMessage', 'lastMessageAt',
        'status', 'createdAt', 'updatedAt',
      ],
    },
    { table: 'messages', columns: ['id', 'conversationId'] },
  ]);
  const pool = await requiredPool();
  const [countResult, dataResult] = await Promise.all([
    pool.execute('SELECT COUNT(*) AS total FROM conversations WHERE `merchantId` = ?', [merchantId]),
    pool.execute(
      `SELECT page.id, page.customerPhone, page.customerName, page.lastMessage,
              page.lastMessageAt, page.status, page.createdAt, page.updatedAt,
              COUNT(messages.id) AS messageCount
         FROM (
           SELECT id, \`customerPhone\` AS customerPhone, \`customerName\` AS customerName,
                  \`lastMessage\` AS lastMessage, \`lastMessageAt\` AS lastMessageAt,
                  status, \`createdAt\` AS createdAt, \`updatedAt\` AS updatedAt
             FROM conversations
            WHERE \`merchantId\` = ?
            ORDER BY \`lastMessageAt\` DESC, id DESC
            LIMIT ? OFFSET ?
         ) AS page
         LEFT JOIN messages ON messages.\`conversationId\` = page.id
        GROUP BY page.id, page.customerPhone, page.customerName, page.lastMessage,
                 page.lastMessageAt, page.status, page.createdAt, page.updatedAt
        ORDER BY page.lastMessageAt DESC, page.id DESC`,
      [merchantId, pagination.limit, pagination.offset],
    ),
  ]);
  const countRows = countResult[0] as CountRow[];
  const rows = dataResult[0] as Array<Record<string, any>>;

  return {
    total: exactCount(countRows[0]?.total ?? 0),
    data: rows.map(row => ({
      id: Number(row.id),
      customerPhone: row.customerPhone,
      customerName: row.customerName ?? null,
      lastMessage: row.lastMessage ?? null,
      lastMessageAt: row.lastMessageAt,
      messageCount: exactCount(row.messageCount),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  };
}

export async function getApiKnowledgeOverview(merchantId: number): Promise<ApiKnowledgeOverview> {
  positiveMerchantId(merchantId);
  await assertRuntimeSchema('API knowledge overview', [
    { table: 'products', columns: ['merchantId', 'isActive', 'status'] },
    { table: 'conversations', columns: ['merchantId'] },
    { table: 'extracted_faqs', columns: ['merchant_id', 'source_status', 'is_active', 'use_in_bot'] },
    {
      table: 'merchant_knowledge_docs',
      columns: ['id', 'merchant_id', 'file_name', 'extraction_status', 'extracted_text', 'uploaded_at'],
    },
  ]);
  const pool = await requiredPool();
  const [rows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM products
         WHERE \`merchantId\` = ? AND \`isActive\` = 1 AND status = 'active') AS products,
       (SELECT COUNT(*) FROM conversations WHERE \`merchantId\` = ?) AS conversations,
       (SELECT COUNT(*) FROM extracted_faqs
         WHERE merchant_id = ? AND source_status = 'active') AS faqs,
       (SELECT COUNT(*) FROM extracted_faqs
         WHERE merchant_id = ? AND source_status = 'active' AND is_active = 1) AS enabledFaqs,
       (SELECT COUNT(*) FROM extracted_faqs
         WHERE merchant_id = ? AND source_status = 'active' AND is_active = 1 AND use_in_bot = 1) AS usableFaqs,
       (SELECT file_name FROM merchant_knowledge_docs
         WHERE merchant_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1) AS documentName,
       (SELECT extraction_status FROM merchant_knowledge_docs
         WHERE merchant_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1) AS documentStatus,
       (SELECT CHAR_LENGTH(extracted_text) FROM merchant_knowledge_docs
         WHERE merchant_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1) AS documentTextLength`,
    [merchantId, merchantId, merchantId, merchantId, merchantId, merchantId, merchantId, merchantId],
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) throw new Error('API knowledge overview unavailable');
  const documentStatus = row.documentStatus === null || row.documentStatus === undefined
    ? null
    : String(row.documentStatus);

  return {
    products: exactCount(row.products),
    conversations: exactCount(row.conversations),
    faqs: exactCount(row.faqs),
    enabledFaqs: exactCount(row.enabledFaqs),
    usableFaqs: exactCount(row.usableFaqs),
    document: documentStatus === null ? null : {
      name: String(row.documentName ?? ''),
      status: documentStatus,
      textLength: exactCount(row.documentTextLength ?? 0),
    },
  };
}
