import { randomUUID } from "node:crypto";
import { getPool } from "../../db/connection";
import { createDisposableMerchant } from "./disposable-merchant";
import {
  enqueueInbound,
  assertInboundOwned,
} from "../../messaging/inbound-jobs";
import {
  withInboundExecution,
  type InboundExecution,
} from "../../messaging/inbound-context";
import { readTeachingSource } from "../../knowledge/whatsapp-teaching-source";
import {
  readTeachingDialogue,
  commitTeachingDialogue,
  type TeachingDialogueContext,
} from "../../knowledge/teaching-dialogue";
import type { TeachingDialogueDecision } from "../../ai/teaching-dialogue-understanding";
export const dialogueQuery = async (
  s: string,
  args: (string | number | null)[] = []
): Promise<any> => (await (await getPool())!.execute(s, args))[0];
export const dialogueDecision = (
  c: TeachingDialogueContext,
  intent: TeachingDialogueDecision["intent"] = "submit",
  includeCurrent = true
): TeachingDialogueDecision => ({
  version: 2,
  basisHash: c.input.basisHash,
  intent,
  includeCurrent,
  complete: intent === "submit",
  general: true,
  explicit: true,
  ambiguous: false,
  conditional: false,
  businessKnowledge: true,
  confidence: 0.99,
  title: ["not_teaching", "clarify", "cancel"].includes(intent)
    ? ""
    : "سياسة الضمان",
  evidence: c.source.text,
  reason: "fixture",
});
export async function createTeachingFixture() {
  const owner = await createDisposableMerchant("dialogue"),
    author = "966500000052",
    account = randomUUID();
  await dialogueQuery("UPDATE merchants SET phone=? WHERE id=?", [
    author,
    owner.merchantId,
  ]);
  const instanceId = (
    await dialogueQuery(
      "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,provider) VALUES (?,?,'fixture','active','green_api')",
      [owner.merchantId, account]
    )
  ).insertId;
  async function event(text: string, sender = author) {
    const payload = {
      typeWebhook: "incomingMessageReceived",
      instanceData: { idInstance: account },
      idMessage: randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      senderData: { sender: sender + "@c.us", chatId: sender + "@c.us" },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: text },
      },
    };
    const queued = await enqueueInbound({
        payload,
        source: "webhook",
        expectedMerchantId: owner.merchantId,
      }),
      token = randomUUID();
    await dialogueQuery(
      "UPDATE whatsapp_inbound_jobs SET status='running',lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE id=?",
      [token, queued.id]
    );
    const [r] = await dialogueQuery(
      "SELECT * FROM whatsapp_inbound_jobs WHERE id=?",
      [queued.id]
    );
    const execution: InboundExecution = {
      id: r.id,
      merchantId: owner.merchantId,
      instanceId,
      token,
      eventKey: r.event_key,
      partitionKey: r.partition_key,
      sendOrdinal: 0,
      assertOwned: () => assertInboundOwned({ id: r.id, lease_token: token }),
    };
    const within = <T>(run: () => Promise<T>) =>
      withInboundExecution({ ...execution }, run);
    const read = () =>
      within(async () =>
        readTeachingDialogue(await readTeachingSource(owner.merchantId, text))
      );
    const commit = async (
      intent: TeachingDialogueDecision["intent"] = "submit",
      includeCurrent = true
    ) => {
      const context = await read();
      return within(() =>
        commitTeachingDialogue(
          context,
          dialogueDecision(context, intent, includeCurrent)
        )
      );
    };
    return { text, execution, within, read, commit };
  }
  return {
    ...owner,
    author,
    account,
    instanceId,
    event,
    drafts: () =>
      dialogueQuery(
        "SELECT * FROM merchant_teaching_drafts WHERE merchant_id=?",
        [owner.merchantId]
      ),
    turns: () =>
      dialogueQuery(
        "SELECT * FROM merchant_teaching_turns WHERE merchant_id=?",
        [owner.merchantId]
      ),
    sections: () =>
      dialogueQuery("SELECT * FROM knowledge_sections WHERE merchant_id=?", [
        owner.merchantId,
      ]),
  };
}
