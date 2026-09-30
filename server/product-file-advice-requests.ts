import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import {
  productFileAdviceStart,
  productFileAdviceRead,
  productFileAdviceReceipt,
  productFileAdviceResult,
} from "../shared/product-file-advice";
import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
} from "./product-editor";
import {
  prepareProductFileAdvice,
  parseProductFileAdvice,
  productFileAdviceMessages,
  ProductFileAdviceError,
  type ProductFileAdviceContext,
} from "./product-file-advice";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { reserveApiRateLimit } from "./api/distributed-rate-limit";
import { invokeLLM } from "./_core/llm";

export class ProductFileAdviceLimit extends Error {}
const ready = () =>
  assertRuntimeSchema("product file advice", [
    {
      table: "product_file_advice_requests",
      columns: [
        "actor_id",
        "execution_token",
        "input_hash",
        "file_digest",
        "sample_digest",
        "state",
        "result",
        "result_digest",
        "lease_until",
      ],
      uniqueIndexes: [
        {
          name: "uq_product_file_advice_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
  ]);
const scope = (merchantId: number, actorId: number) => {
  store.validId(merchantId);
  store.validId(actorId);
};
async function find(
  c: PoolConnection,
  merchantId: number,
  requestId: string,
  lock = false
) {
  const [rows] = await c.execute<any[]>(
    `SELECT *,lease_until>UTC_TIMESTAMP(3) AS lease_valid,
    DATE_FORMAT(started_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS started,DATE_FORMAT(finished_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS finished
    FROM product_file_advice_requests WHERE merchant_id=? AND request_id=?${lock ? " FOR UPDATE" : ""}`,
    [merchantId, requestId]
  );
  if (rows.length > 1) throw Error("Invalid advice request");
  return rows[0] ?? null;
}
function view(row: any, actorId: number) {
  if (Number(row.actor_id) !== actorId) throw new ProductEditorMissing();
  const result =
    row.result == null
      ? null
      : productFileAdviceResult.parse(
          typeof row.result === "string" ? JSON.parse(row.result) : row.result
        );
  if (result && store.hash(result) !== row.result_digest)
    throw Error("Invalid advice result digest");
  return productFileAdviceReceipt.parse({
    merchantId: Number(row.merchant_id),
    actorId,
    requestId: row.request_id,
    fileName: row.file_name,
    fileDigest: row.file_digest,
    sampleDigest: row.sample_digest,
    state:
      row.state === "processing" && !Number(row.lease_valid)
        ? "uncertain"
        : row.state,
    failure: row.failure_code,
    startedAt: row.started,
    finishedAt: row.finished,
    result,
  });
}
export async function readProductFileAdvice(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productFileAdviceRead.parse(raw);
  await ready();
  return store.transaction(false, async c => {
    await store.authority(c, merchantId, actorId, false);
    const row = await find(c, merchantId, input.requestId);
    if (!row) throw new ProductEditorMissing();
    return view(row, actorId);
  });
}
async function reserve(
  merchantId: number,
  actorId: number,
  requestId: string,
  inputHash: string,
  context: ProductFileAdviceContext
) {
  return store.transaction(true, async c => {
    await store.authority(c, merchantId, actorId, true);
    const prior = await find(c, merchantId, requestId, true);
    if (prior) {
      if (Number(prior.actor_id) !== actorId || prior.input_hash !== inputHash)
        throw new ProductEditorConflict();
      return { token: null, receipt: view(prior, actorId) };
    }
    const [active] = await c.execute<any[]>(
      "SELECT actor_id FROM product_file_advice_requests WHERE merchant_id=? AND state='processing' AND lease_until>UTC_TIMESTAMP(3)",
      [merchantId]
    );
    if (
      active.length >= 2 ||
      active.some(row => Number(row.actor_id) === actorId)
    )
      throw new ProductFileAdviceLimit();
    const limit = await reserveApiRateLimit({
      namespace: "merchant_product_file_advice",
      identity: String(merchantId),
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) throw new ProductFileAdviceLimit();
    const token = randomUUID();
    await c.execute(
      "INSERT INTO product_file_advice_requests (merchant_id,actor_id,request_id,execution_token,input_hash,file_name,file_digest,sample_digest,lease_until) VALUES (?,?,?,?,?,?,?,?,TIMESTAMPADD(SECOND,180,UTC_TIMESTAMP(3)))",
      [
        merchantId,
        actorId,
        requestId,
        token,
        inputHash,
        context.preview.fileName,
        context.preview.digest,
        context.sampleDigest,
      ]
    );
    return {
      token,
      receipt: view(await find(c, merchantId, requestId), actorId),
    };
  });
}
// A result may arrive after the soft deadline; its exact token can still resolve that same attempt.
// No lease takeover or automatic provider retry exists.
async function finish(
  merchantId: number,
  actorId: number,
  requestId: string,
  token: string,
  state: "completed" | "failed" | "uncertain",
  result: ReturnType<typeof productFileAdviceResult.parse> | null
) {
  await store.transaction(true, async c => {
    // Lock the tenant before the request, preserving the reservation lock order. The original actor may have been revoked while the provider ran.
    const [tenants] = await c.execute<any[]>(
      "SELECT id FROM merchants WHERE id=? FOR UPDATE",
      [merchantId]
    );
    if (tenants.length !== 1) throw new ProductEditorMissing();
    const row = await find(c, merchantId, requestId, true);
    if (
      !row ||
      Number(row.actor_id) !== actorId ||
      row.execution_token !== token
    )
      throw new ProductEditorConflict();
    if (row.state !== "processing") return;
    const checked = result ? productFileAdviceResult.parse(result) : null;
    if (
      (state === "completed") !== !!checked ||
      (checked &&
        (checked.fileDigest !== row.file_digest ||
          checked.sampleDigest !== row.sample_digest ||
          checked.fileName !== row.file_name))
    )
      throw new ProductEditorConflict();
    await c.execute(
      "UPDATE product_file_advice_requests SET state=?,failure_code=?,result=?,result_digest=?,finished_at=UTC_TIMESTAMP(3) WHERE id=? AND execution_token=? AND state='processing'",
      [
        state,
        state === "failed"
          ? "invalid_result"
          : state === "uncertain"
            ? "provider_unknown"
            : null,
        checked ? JSON.stringify(checked) : null,
        checked ? store.hash(checked) : null,
        row.id,
        token,
      ]
    );
  });
}
export async function startProductFileAdvice(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = productFileAdviceStart.parse(raw);
  await ready();
  const { requestId, reviewed, ...analysis } = input,
    inputHash = store.hash(input);
  // Authorize before parsing files or calling providers. Same-ID requests only read their reserved result.
  const prior = await store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false);
    if (!merchant.canManage) throw new ProductEditorForbidden();
    const row = await find(c, merchantId, requestId);
    if (!row) return null;
    if (Number(row.actor_id) !== actorId || row.input_hash !== inputHash)
      throw new ProductEditorConflict();
    return view(row, actorId);
  });
  if (prior) return prior;
  const context = await prepareProductFileAdvice(analysis),
    claim = await reserve(merchantId, actorId, requestId, inputHash, context);
  if (!claim.token) return claim.receipt;
  let result: ReturnType<typeof productFileAdviceResult.parse> | null = null,
    terminal: "completed" | "failed" | "uncertain" = "uncertain";
  try {
    const response = await invokeLLM({
      merchantId,
      taskType: "sari.catalog.file-extraction",
      messages: productFileAdviceMessages(context),
      maxTokens: 6000,
      responseFormat: { type: "json_object" },
    });
    try {
      result = parseProductFileAdvice(
        response.choices[0]?.message.content,
        context
      );
      terminal = "completed";
    } catch (error) {
      if (!(error instanceof ProductFileAdviceError)) throw error;
      terminal = "failed";
    }
  } catch {
    terminal = "uncertain";
  }
  await finish(merchantId, actorId, requestId, claim.token, terminal, result);
  // Revocation during analysis must not leak the response back to the original caller.
  return readProductFileAdvice(merchantId, actorId, { requestId });
}
