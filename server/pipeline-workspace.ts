import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import { VALID_DEAL_STAGES } from "../shared/const";
import {
  pipelineInput,
  pipelineStages,
  pipelineWindows,
  type PipelineInput,
  type PipelineItem,
  type PipelineSnapshot,
} from "../shared/pipeline-workspace";

export async function readPipelineWorkspace(
  merchantId: number,
  input: PipelineInput,
  now = new Date()
): Promise<PipelineSnapshot> {
  return (await readPipelineBundle(merchantId, input, now)).snapshot;
}
export const pipelinePreviewQueues = [
  "ready",
  "stalled",
  "pending",
  "paid",
  "lost",
] as const;
export type PipelinePreviews = Record<
  (typeof pipelinePreviewQueues)[number],
  PipelineItem[]
>;
export async function readPipelineBundle(
  merchantId: number,
  input: PipelineInput,
  now = new Date(),
  options: { previews?: boolean; days?: number } = {}
): Promise<{ snapshot: PipelineSnapshot; previews?: PipelinePreviews }> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const selection = pipelineInput.parse(input),
    windows = pipelineWindows(now, options.days ?? 30),
    db = await getDb();
  if (!db) throw Error("Pipeline unavailable");
  const stamp = (value: string) => value.slice(0, 19).replace("T", " ");
  const through = stamp(windows.through),
    month = stamp(windows.monthFrom),
    week = stamp(windows.weekFrom),
    previous = stamp(windows.previousFrom),
    beforeWeek = stamp(windows.previousThrough),
    readyAfter = stamp(windows.readyAfter);
  const n = (value: unknown) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0)
      throw Error("Invalid pipeline aggregate");
    return number;
  };
  const known = sql.join(
    VALID_DEAL_STAGES.map(stage => sql`${stage}`),
    sql`, `
  );
  const stage = sql`CASE WHEN BINARY c.deal_stage IN (${known}) THEN c.deal_stage ELSE 'unknown' END`;
  const activity = (from: string, to = through) =>
    sql`c.lastMessageAt>=${from} AND c.lastMessageAt<=${to}`;
  const filters = {
    ready: sql`BINARY c.deal_stage='ready' AND c.lastMessageAt>${readyAfter} AND c.lastMessageAt<=${through}`,
    "needs-human": sql`EXISTS (SELECT 1 FROM sari_escalation_queue e WHERE e.merchant_id=${merchantId} AND e.conversation_id=c.id AND e.status IN ('pending','notified'))`,
    pending: sql`BINARY c.deal_stage='payment_link_sent'`,
    stalled: sql`BINARY c.deal_stage IN ('interested','qualified') AND c.lastMessageAt<${readyAfter} AND c.loss_reason IS NULL`,
    paid: sql`BINARY c.deal_stage='paid' AND ${activity(week)}`,
    lost: sql`BINARY c.deal_stage='lost' AND ${activity(week)}`,
    all: sql`TRUE`,
    stage: sql`${stage}=${selection.stage ?? "unknown"}`,
  };
  return db.transaction(
    async tx => {
      const rows = async (query: ReturnType<typeof sql>) =>
        (await tx.execute(query))[0] as unknown as Record<string, any>[];
      const stages = await rows(
        sql`SELECT ${stage} stage,COUNT(*) count FROM conversations c WHERE c.merchantId=${merchantId} GROUP BY ${stage}`
      );
      const [counts] = await rows(sql`SELECT
      COALESCE(SUM(${filters.ready}),0) ready,COALESCE(SUM(${filters["needs-human"]}),0) needsHuman,
      COALESCE(SUM(${filters.pending}),0) pending,COALESCE(SUM(${filters.stalled}),0) stalled,
      COALESCE(SUM(${filters.paid}),0) paid,COALESCE(SUM(${filters.lost}),0) lost,
      COALESCE(SUM(BINARY c.deal_stage='paid' AND ${activity(month)}),0) monthPaid,
      COALESCE(SUM(BINARY c.deal_stage='lost' AND ${activity(month)}),0) monthLost,
      COALESCE(SUM(BINARY c.deal_stage='paid' AND ${activity(previous, beforeWeek)}),0) previousPaid
      FROM conversations c WHERE c.merchantId=${merchantId}`);
      const losses =
        await rows(sql`SELECT COALESCE(NULLIF(TRIM(c.loss_reason),''),'unknown') reason,COUNT(*) count FROM conversations c
      WHERE c.merchantId=${merchantId} AND BINARY c.deal_stage='lost' AND ${activity(month)}
      GROUP BY COALESCE(NULLIF(TRIM(c.loss_reason),''),'unknown') ORDER BY count DESC,reason ASC`);
      const values =
        await rows(sql`SELECT currency,COUNT(*) total,COALESCE(SUM(totalAmount>=0),0) valid,
      COALESCE(SUM(CASE WHEN totalAmount>=0 THEN totalAmount ELSE 0 END),0) totalMinor FROM orders
      WHERE merchantId=${merchantId} AND payment_status='paid' AND status!='cancelled' AND createdAt>=${month} AND createdAt<=${through} GROUP BY currency`);
      const stageCounts = pipelineStages.map(key => ({
        stage: key,
        count: n(stages.find(r => r.stage === key)?.count ?? 0),
      }));
      const total = n(stageCounts.reduce((s, r) => s + r.count, 0));
      const queues: PipelineSnapshot["queues"] = {
        ready: n(counts.ready),
        "needs-human": n(counts.needsHuman),
        pending: n(counts.pending),
        stalled: n(counts.stalled),
        paid: n(counts.paid),
        lost: n(counts.lost),
        all: total,
      };
      const listTotal =
        selection.queue === "stage"
          ? stageCounts.find(r => r.stage === selection.stage)!.count
          : queues[selection.queue];
      const readItems = async (
        selected: PipelineInput
      ): Promise<PipelineItem[]> => {
        const records =
          await rows(sql`SELECT c.id,c.customerName,c.customerPhone,${stage} stage,c.loss_reason lossReason,
      LEFT(c.lastMessage,300) preview,CHAR_LENGTH(c.lastMessage)>300 previewTruncated,
      DATE_FORMAT(c.lastMessageAt,'%Y-%m-%dT%H:%i:%s.000Z') lastMessageAt,
      DATE_FORMAT(c.payment_link_sent_at,'%Y-%m-%dT%H:%i:%s.000Z') paymentLinkSentAt,
      DATE_FORMAT(c.stalled_since,'%Y-%m-%dT%H:%i:%s.000Z') stalledSince
      FROM conversations c WHERE c.merchantId=${merchantId} AND (${filters[selected.queue]})
      ORDER BY c.lastMessageAt DESC,c.id DESC LIMIT ${selected.pageSize} OFFSET ${(selected.page - 1) * selected.pageSize}`);
        return records.map(r => ({
          id: n(r.id),
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          stage: r.stage,
          lossReason: r.lossReason,
          preview: r.preview,
          previewTruncated: Boolean(r.previewTruncated),
          lastMessageAt: r.lastMessageAt,
          paymentLinkSentAt: r.paymentLinkSentAt,
          stalledSince: r.stalledSince,
        }));
      };
      const paid = n(counts.monthPaid),
        lost = n(counts.monthLost);
      const snapshot: PipelineSnapshot = {
        merchantId,
        selection,
        windows,
        timeZone: "UTC",
        total,
        stages: stageCounts,
        queues,
        outcomes: {
          paid,
          lost,
          paidStageShare: paid + lost ? (paid / (paid + lost)) * 100 : null,
          currentWeekPaid: queues.paid,
          previousWeekPaid: n(counts.previousPaid),
        },
        losses: losses.map(r => ({
          reason: String(r.reason),
          count: n(r.count),
          share: lost ? (n(r.count) / lost) * 100 : 0,
        })),
        values: (["SAR", "USD"] as const).map(currency => {
          const r = values.find(row => row.currency === currency);
          return {
            currency,
            count: n(r?.valid ?? 0),
            totalMinor: n(r?.totalMinor ?? 0),
            excludedAmounts: n(r?.total ?? 0) - n(r?.valid ?? 0),
          };
        }),
        list: {
          items: await readItems(selection),
          total: listTotal,
          page: selection.page,
          pageSize: selection.pageSize,
          totalPages: Math.ceil(listTotal / selection.pageSize),
        },
        unmeasured: {
          salesConversion: null,
          settledRevenue: null,
          timeToClose: null,
          salesProficiency: null,
        },
      };
      if (!options.previews) return { snapshot };
      const previews = {} as PipelinePreviews;
      for (const queue of pipelinePreviewQueues)
        previews[queue] = await readItems({ queue, page: 1, pageSize: 10 });
      return { snapshot, previews };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
