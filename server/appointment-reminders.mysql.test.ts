import { randomUUID, createHash } from "node:crypto";
import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: provider.send }),
}));
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { enqueueInbound } from "./messaging/inbound-jobs";
import { bookingAgreementDigest as hash } from "./ai/booking-agreements";
import * as capacity from "./booking-capacity";
import {
  handleAppointmentReminder,
  dispatchAppointmentReminder,
  reconcileAppointmentReminder,
  runAppointmentReminderBatch,
  appointmentReminderKey,
  canDispatchAppointmentReminder,
  readAppointmentReminders,
} from "./appointment-reminders";
import { sendMerchantWhatsApp } from "./channels/whatsapp/service";
import { sendAppointmentReminders } from "./appointmentReminders";

describe.skipIf(!process.env.DATABASE_URL)(
  "requested appointment reminders on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    let conversationId: number,
      appointmentId: number,
      serviceId: number,
      instanceId: number,
      account: string,
      sourceId: number,
      jobId: number,
      command: string;
    const phone = "966500987654";
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const identity = () => ({
      merchantId: owner.merchantId,
      conversationId,
      incomingMessageId: sourceId,
      customerPhone: phone,
    });
    const rows = () =>
      q("SELECT * FROM appointment_reminders WHERE merchant_id=? ORDER BY id", [
        owner.merchantId,
      ]);
    const row = async () => (await rows())[0];
    const request = () => handleAppointmentReminder(identity(), command);
    const dispatch = async () =>
      dispatchAppointmentReminder(owner.merchantId, (await row()).id);
    const receipt = async () =>
      (
        await q(
          "SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=?",
          [owner.merchantId]
        )
      )[0];
    async function incoming(text: string, kind = "green_api") {
      command = text;
      const job = await enqueueInbound({
        source: kind === "meta_cloud" ? "meta" : "webhook",
        payload: {
          typeWebhook: "incomingMessageReceived",
          instanceData: { idInstance: account },
          idMessage: randomUUID(),
          timestamp: Math.floor(Date.now() / 1000),
          senderData: { chatId: `${phone}@c.us` },
          messageData: {
            typeMessage: "textMessage",
            textMessageData: { textMessage: text },
          },
        },
      });
      jobId = job.id;
      const [{ event_key }] = await q(
        "SELECT event_key FROM whatsapp_inbound_jobs WHERE id=?",
        [jobId]
      );
      sourceId = (
        await q(
          "INSERT INTO messages (conversationId,direction,messageType,content,externalId) VALUES (?,'incoming','text',?,?)",
          [conversationId, text, `inbound:v1:${event_key}`]
        )
      ).insertId;
      await q(
        "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
        [jobId]
      );
    }
    // Advance only this fixture's appointment/outbox clock to a due state; all production comparisons use SQL UTC.
    async function elapse(hours = 1, minutesLate = 1) {
      const r = await row(),
        s =
          typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot;
      const now = Date.now(),
        civil = new Date(
          now + (3 + hours) * 3600000 - minutesLate * 60000
        ).toISOString();
      s.terms.date = civil.slice(0, 10);
      s.terms.startTime = civil.slice(11, 16);
      s.terms.endTime = new Date(
        Date.parse(`${s.terms.date}T${s.terms.startTime}:00+03:00`) +
          3 * 3600000 +
          30 * 60000
      )
        .toISOString()
        .slice(11, 16);
      if (s.terms.endTime < s.terms.startTime) s.terms.endTime = "23:59";
      s.due =
        Date.parse(`${s.terms.date}T${s.terms.startTime}:00+03:00`) -
        hours * 3600000;
      s.expires = s.due + 15 * 60000;
      const date = (n: number) =>
        new Date(n).toISOString().slice(0, 23).replace("T", " ");
      await q(
        "UPDATE appointments SET appointment_date=?,start_time=?,end_time=? WHERE id=?",
        [
          `${s.terms.date} 00:00:00`,
          s.terms.startTime,
          s.terms.endTime,
          appointmentId,
        ]
      );
      await q(
        "UPDATE appointment_reminders SET snapshot=?,snapshot_hash=?,terms_hash=?,due_at=?,expires_at=?,next_check_at=?,dispatch_text=? WHERE id=?",
        [
          JSON.stringify(s),
          hash(s),
          hash(s.terms),
          date(s.due),
          date(s.expires),
          date(s.due),
          `تذكير بالموعد A${s.appointmentId}\nالخدمة: ${s.terms.serviceName}\nالموعد: ${s.terms.date}، من ${s.terms.startTime} إلى ${s.terms.endTime} بتوقيت الرياض.\n${s.terms.staffName ? `الموظف: ${s.terms.staffName}\n` : ""}إذا احتجت تعديل الموعد تواصل مع الفريق واذكر رقم الموعد.`,
          r.id,
        ]
      );
    }
    beforeEach(async () => {
      vi.restoreAllMocks();
      provider.send.mockReset().mockImplementation(async () => ({
        accepted: true,
        outcome: "accepted",
        status: "sent",
        providerMessageId: randomUUID(),
      }));
      owner = await createDisposableMerchant("appt-reminder");
      other = await createDisposableMerchant("other-reminder");
      serviceId = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Reminder service',30,10000)",
          [owner.merchantId]
        )
      ).insertId;
      const civil = new Date(Date.now() + 5 * 3600000).toISOString();
      appointmentId = (
        await q(
          `INSERT INTO appointments (merchant_id,customer_phone,customer_name,service_id,appointment_date,start_time,end_time,status,calendar_sync_state)
      VALUES (?,?,'Customer',?,?,?,'23:59','confirmed','none')`,
          [
            owner.merchantId,
            phone,
            serviceId,
            `${civil.slice(0, 10)} 00:00:00`,
            civil.slice(11, 16),
          ]
        )
      ).insertId;
      conversationId = (
        await q(
          "INSERT INTO conversations (merchantId,customerPhone,customerName,status) VALUES (?,?,'Customer','active')",
          [owner.merchantId, phone]
        )
      ).insertId;
      account = randomUUID();
      instanceId = (
        await q(
          "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,api_url,status,is_primary) VALUES (?,?,'fixture','green_api','https://api.green-api.com','active',1)",
          [owner.merchantId, account]
        )
      ).insertId;
      await incoming(`ذكرني بالموعد A${appointmentId} قبل ساعة`);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    it("never auto-enrolls legacy appointments or uses legacy reminder flags", async () => {
      await sendAppointmentReminders(owner.merchantId);
      expect(await rows()).toHaveLength(0);
      expect(provider.send).not.toHaveBeenCalled();
    });
    it("records explicit consent once and waits until the correct civil time", async () => {
      expect(await request()).toContain("سجلت طلب تذكير واحد");
      const r = await row();
      expect(r.source_message_id).toBe(sourceId);
      expect(r.hours_before).toBe(1);
      await Promise.all([request(), request(), request()]);
      expect(await rows()).toHaveLength(1);
      await dispatch();
      expect(provider.send).not.toHaveBeenCalled();
      expect((await row()).state).toBe("pending");
    });
    it.each(["green_api", "meta_cloud"])(
      "sends on the exact consent account once, then projects the durable %s receipt",
      async kind => {
        if (kind === "meta_cloud") {
          await q(
            "UPDATE whatsapp_instances SET provider='meta_cloud',phone_number_id='12345678901',provider_account_id='12345678902' WHERE id=?",
            [instanceId]
          );
          await incoming(command, kind);
        }
        await request();
        await elapse();
        await Promise.all([dispatch(), dispatch(), dispatch()]);
        await reconcileAppointmentReminder(owner.merchantId, (await row()).id);
        expect(provider.send).toHaveBeenCalledOnce();
        expect(provider.send.mock.calls[0][0].instanceId).toBe(account);
        const r = await row();
        expect(r.state).toBe("accepted");
        expect(r.delivery_state).toBe("sent");
        expect(r.projection_message_id).toBeGreaterThan(0);
        const projected = await q("SELECT * FROM messages WHERE id=?", [
          r.projection_message_id,
        ]);
        expect(projected[0].content).toBe(r.dispatch_text);
        await q(
          "UPDATE whatsapp_message_deliveries SET status='read' WHERE merchant_id=?",
          [owner.merchantId]
        );
        await reconcileAppointmentReminder(owner.merchantId, r.id);
        expect((await row()).delivery_state).toBe("read");
        expect(provider.send).toHaveBeenCalledOnce();
      }
    );
    it.each([
      [
        "foreign tenant",
        async (id: any) => ({ ...id, merchantId: other.merchantId }),
      ],
      [
        "foreign phone",
        async (id: any) => ({ ...id, customerPhone: "966500987655" }),
      ],
      [
        "foreign conversation",
        async (id: any) => ({ ...id, conversationId: 99999999 }),
      ],
    ] as const)("rejects %s at consent", async (_, change) => {
      await handleAppointmentReminder(await change(identity()), command);
      expect(await rows()).toHaveLength(0);
    });
    it.each([
      ["cancelled", "UPDATE appointments SET status='cancelled' WHERE id=?"],
      [
        "ambiguous calendar",
        "UPDATE appointments SET calendar_sync_state='create_unknown' WHERE id=?",
      ],
      [
        "foreign customer",
        "UPDATE appointments SET customer_phone='966500987655' WHERE id=?",
      ],
      [
        "foreign appointment",
        "UPDATE appointments SET merchant_id=" + "?" + " WHERE id=?",
      ],
    ])("does not enroll %s", async (name, sql) => {
      await q(
        sql,
        name === "foreign appointment"
          ? [other.merchantId, appointmentId]
          : [appointmentId]
      );
      expect(await request()).not.toContain("سجلت طلب");
      expect(await rows()).toHaveLength(0);
    });
    it.each(["pending", "running"])(
      "waits for the original inbound %s reply",
      async state => {
        await request();
        await elapse();
        await q("UPDATE whatsapp_inbound_jobs SET status=? WHERE id=?", [
          state,
          jobId,
        ]);
        await dispatch();
        expect((await row()).state).toBe("pending");
        expect(provider.send).not.toHaveBeenCalled();
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
          [jobId]
        );
        await dispatch();
        expect(provider.send).toHaveBeenCalledOnce();
      }
    );
    const changes: Array<[string, () => Promise<unknown>]> = [
      [
        "appointment cancelled",
        () =>
          q("UPDATE appointments SET status='cancelled' WHERE id=?", [
            appointmentId,
          ]),
      ],
      [
        "changed time",
        () =>
          q("UPDATE appointments SET start_time='00:01' WHERE id=?", [
            appointmentId,
          ]),
      ],
      [
        "service inactive",
        () => q("UPDATE services SET is_active=0 WHERE id=?", [serviceId]),
      ],
      [
        "human takeover",
        () =>
          q("UPDATE conversations SET human_takeover=1 WHERE id=?", [
            conversationId,
          ]),
      ],
      [
        "handoff cycle",
        () =>
          q(
            "UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?",
            [conversationId]
          ),
      ],
      [
        "automation cutoff",
        () =>
          q(
            "UPDATE conversations SET automation_after_message_id=? WHERE id=?",
            [sourceId, conversationId]
          ),
      ],
      [
        "new incoming",
        () =>
          q(
            "INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','توقف')",
            [conversationId]
          ),
      ],
      [
        "changed source",
        () => q("UPDATE messages SET content='forged' WHERE id=?", [sourceId]),
      ],
      [
        "source expired",
        () =>
          q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(HOUR,-25,UTC_TIMESTAMP()) WHERE id=?",
            [sourceId]
          ),
      ],
      [
        "future source",
        () =>
          q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP()) WHERE id=?",
            [sourceId]
          ),
      ],
      [
        "instance inactive",
        () =>
          q(
            "UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",
            [instanceId]
          ),
      ],
      [
        "rotated account",
        () =>
          q("UPDATE whatsapp_instances SET instance_id=? WHERE id=?", [
            randomUUID(),
            instanceId,
          ]),
      ],
      [
        "changed provider",
        () =>
          q("UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?", [
            instanceId,
          ]),
      ],
      [
        "changed provider number",
        () =>
          q(
            "UPDATE whatsapp_instances SET phone_number_id='other' WHERE id=?",
            [instanceId]
          ),
      ],
      [
        "source dismissed",
        () =>
          q("UPDATE whatsapp_inbound_jobs SET status='dismissed' WHERE id=?", [
            jobId,
          ]),
      ],
      [
        "forged text",
        () =>
          q(
            "UPDATE appointment_reminders SET dispatch_text='pay me now' WHERE merchant_id=?",
            [owner.merchantId]
          ),
      ],
      [
        "corrupt snapshot",
        () =>
          q(
            "UPDATE appointment_reminders SET snapshot_hash=? WHERE merchant_id=?",
            ["a".repeat(64), owner.merchantId]
          ),
      ],
      [
        "consent withdrawal",
        () =>
          q(
            "INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,?,'withdrawn','v1','customer',?,UTC_TIMESTAMP(3))",
            [owner.merchantId, phone, "a".repeat(64)]
          ),
      ],
    ];
    it.each(changes)("suppresses %s before dispatch", async (_, change) => {
      await request();
      await elapse();
      await change();
      await dispatch();
      expect(provider.send).not.toHaveBeenCalled();
      expect((await row()).state).toBe("suppressed");
    });
    it.each(["pending", "running", "completed"])(
      "does not send an expired reminder with source %s",
      async state => {
        await request();
        await elapse(1, 20);
        await q("UPDATE whatsapp_inbound_jobs SET status=? WHERE id=?", [
          state,
          jobId,
        ]);
        await dispatch();
        expect(provider.send).not.toHaveBeenCalled();
        expect((await row()).state).toBe("suppressed");
      }
    );
    it("cancels a saved reminder without cancelling the appointment or reactivating on replay", async () => {
      await request();
      const original = { ...identity() },
        text = command;
      await incoming(`ألغ تذكير الموعد A${appointmentId}`);
      expect(await request()).toContain("لم ألغ الموعد");
      const r = await row();
      expect(r.state).toBe("suppressed");
      expect(r.cancelled_at).toBeTruthy();
      expect(r.cancellation_source_id).toBe(sourceId);
      expect(r.next_check_at).toBeNull();
      await handleAppointmentReminder(original, text);
      expect(await rows()).toHaveLength(1);
      expect((await row()).state).toBe("suppressed");
      expect(
        (
          await q("SELECT status FROM appointments WHERE id=?", [appointmentId])
        )[0].status
      ).toBe("confirmed");
    });
    it("rejects a request outside the source window", async () => {
      await q(
        "UPDATE appointments SET appointment_date=TIMESTAMPADD(DAY,3,appointment_date) WHERE id=?",
        [appointmentId]
      );
      expect(await request()).toContain("لم أضف");
      expect(await rows()).toHaveLength(0);
    });
    it("allows an explicit 24-hour reminder whose dispatch is inside the source window", async () => {
      await q(
        "UPDATE appointments SET appointment_date=TIMESTAMPADD(DAY,1,appointment_date) WHERE id=?",
        [appointmentId]
      );
      await incoming(`ذكرني بالموعد A${appointmentId} قبل 24 ساعة`);
      expect(await request()).toContain("سجلت");
      await elapse(24);
      await dispatch();
      expect(provider.send).toHaveBeenCalledOnce();
    });
    it("rejects missing or contradictory webhook proof", async () => {
      await q("UPDATE messages SET externalId=NULL WHERE id=?", [sourceId]);
      expect(await request()).not.toContain("سجلت");
      expect(await rows()).toHaveLength(0);
    });
    it("does not leak database or provider diagnostics", async () => {
      const pool = (await getPool())!;
      vi.spyOn(pool, "getConnection").mockRejectedValueOnce(
        Error("secret credential")
      );
      const result = await request();
      expect(result).not.toContain("secret");
      expect(result).toContain("تعذر");
    });
    it.each(["throw", "unknown", "reject", "missing-id"])(
      "never retries a %s provider result",
      async mode => {
        await request();
        await elapse();
        provider.send.mockImplementationOnce(async () => {
          if (mode === "throw") throw Error("private");
          if (mode === "missing-id")
            return { accepted: true, outcome: "accepted", status: "sent" };
          return {
            accepted: false,
            outcome: mode === "reject" ? "rejected" : "unknown",
            status: "failed",
            errorCode: "fixture",
          };
        });
        await dispatch();
        await dispatch();
        await reconcileAppointmentReminder(owner.merchantId, (await row()).id);
        expect(provider.send).toHaveBeenCalledOnce();
        expect((await row()).state).not.toBe("accepted");
        expect((await row()).projection_message_id).toBeNull();
      }
    );
    it("retains consent after a lost commit acknowledgment without creating a second row", async () => {
      const real = capacity.withBookingCapacityTransaction;
      vi.spyOn(
        capacity,
        "withBookingCapacityTransaction"
      ).mockImplementationOnce(async (m, run) => {
        await real(m, run);
        throw Error("lost commit acknowledgment");
      });
      expect(await request()).toContain("تعذر");
      expect(await rows()).toHaveLength(1);
      expect(await request()).toContain("سجلت");
      expect(await rows()).toHaveLength(1);
    });
    it("does not replay a claim whose commit acknowledgment was lost", async () => {
      await request();
      await elapse();
      const real = capacity.withBookingCapacityTransaction;
      vi.spyOn(
        capacity,
        "withBookingCapacityTransaction"
      ).mockImplementationOnce(async (m, run) => {
        await real(m, run);
        throw Error("lost commit acknowledgment");
      });
      await expect(dispatch()).rejects.toThrow();
      expect((await row()).state).toBe("dispatching");
      await dispatch();
      await reconcileAppointmentReminder(owner.merchantId, (await row()).id);
      expect(provider.send).not.toHaveBeenCalled();
      expect((await row()).state).toBe("unknown");
    });
    it.each(["text", "recipient", "token", "account"])(
      "rejects a mismatched %s receipt during recovery",
      async field => {
        await request();
        await elapse();
        await dispatch();
        const r = await row(),
          d = await receipt();
        await q(
          "UPDATE appointment_reminders SET state='unknown',accepted_at=NULL,provider_message_id=NULL,projection_message_id=NULL WHERE id=?",
          [r.id]
        );
        await q("DELETE FROM messages WHERE id=?", [r.projection_message_id]);
        const savedRequest =
          typeof d.request_json === "string"
            ? JSON.parse(d.request_json)
            : d.request_json;
        if (field === "text") savedRequest.text += " altered";
        if (field === "recipient") savedRequest.to = "966500000001";
        if (field === "token")
          savedRequest.appointmentReminderGuard.token = randomUUID();
        if (field === "account")
          await q("UPDATE whatsapp_instances SET instance_id=? WHERE id=?", [
            randomUUID(),
            instanceId,
          ]);
        await q(
          "UPDATE whatsapp_message_deliveries SET request_json=? WHERE id=?",
          [JSON.stringify(savedRequest), d.id]
        );
        await reconcileAppointmentReminder(owner.merchantId, r.id);
        expect((await row()).state).toBe("unknown");
        expect((await row()).projection_message_id).toBeNull();
        expect(provider.send).toHaveBeenCalledOnce();
      }
    );
    it("repairs a missing accepted projection from the exact durable receipt without sending", async () => {
      await request();
      await elapse();
      await dispatch();
      const r = await row();
      await q("DELETE FROM messages WHERE id=?", [r.projection_message_id]);
      await q(
        "UPDATE appointment_reminders SET state='unknown',accepted_at=NULL,provider_message_id=NULL,projection_message_id=NULL WHERE id=?",
        [r.id]
      );
      await reconcileAppointmentReminder(owner.merchantId, r.id);
      expect((await row()).state).toBe("accepted");
      expect((await row()).projection_message_id).toBeGreaterThan(0);
      expect(provider.send).toHaveBeenCalledOnce();
    });
    it("requires a valid guard even for direct transport and failed retries", async () => {
      await request();
      await elapse();
      const r = await row(),
        key = appointmentReminderKey(owner.merchantId, r.id);
      const base = {
        merchantId: owner.merchantId,
        instanceRecordId: instanceId,
        idempotencyKey: key,
        kind: "text" as const,
        to: phone,
        text: r.dispatch_text,
      };
      expect((await sendMerchantWhatsApp(base)).accepted).toBe(false);
      expect(
        (
          await sendMerchantWhatsApp({
            ...base,
            retryFailed: true,
            appointmentReminderGuard: { id: r.id, token: randomUUID() },
          })
        ).accepted
      ).toBe(false);
      expect(provider.send).not.toHaveBeenCalled();
      expect(
        await canDispatchAppointmentReminder(
          { ...base, merchantId: other.merchantId },
          { provider: "green_api", instanceId: account, token: "fixture" }
        )
      ).toBe(false);
    });
    it("scope-filtered compatibility drain leaves other tenants untouched", async () => {
      await request();
      await elapse();
      expect(await runAppointmentReminderBatch(other.merchantId)).toBe(0);
      expect(provider.send).not.toHaveBeenCalled();
      await sendAppointmentReminders(owner.merchantId);
      expect(provider.send).toHaveBeenCalledOnce();
    });
    it.each(
      changes.filter(([name]) =>
        [
          "appointment cancelled",
          "new incoming",
          "human takeover",
          "rotated account",
          "consent withdrawal",
        ].includes(name)
      )
    )(
      "rechecks %s after reserving the delivery, before provider I/O",
      async (name, change) => {
        await request();
        await elapse();
        const pool = (await getPool())!,
          real = pool.execute.bind(pool);
        let changed = false;
        vi.spyOn(pool, "execute").mockImplementation((async (
          sql: any,
          args: any
        ) => {
          const result = await real(sql, args);
          if (
            !changed &&
            String(sql).includes("INSERT INTO whatsapp_message_deliveries")
          ) {
            changed = true;
            await change();
          }
          return result;
        }) as any);
        await dispatch();
        expect(changed).toBe(true);
        expect(provider.send).not.toHaveBeenCalled();
        expect((await receipt()).error_code).toBe(
          "appointment_reminder_suppressed"
        );
        expect((await row()).state).toBe(
          name === "rotated account" ? "unknown" : "failed"
        );
      }
    );
    it.each(["unchanged", "inactive", "rotated", "target", "unknown", "event"])(
      "checks bound calendar identity at sending: %s",
      async change => {
        const integration = (
          await q(
            "INSERT INTO google_integrations (merchant_id,integration_type,credentials,calendar_id,is_active) VALUES (?,'calendar',?,'primary',1)",
            [
              owner.merchantId,
              JSON.stringify({
                refresh_token: "fixture-refresh",
                access_token: "fixture-access",
              }),
            ]
          )
        ).insertId;
        const event = "sariappt" + randomUUID().replaceAll("-", "");
        await q(
          "UPDATE appointments SET calendar_sync_state='synced',calendar_integration_id=?,calendar_target_id='primary',calendar_identity_hash=?,calendar_event_reference=?,google_event_id=? WHERE id=?",
          [
            integration,
            createHash("sha256").update("fixture-refresh").digest("hex"),
            event,
            event,
            appointmentId,
          ]
        );
        expect(await request()).toContain("سجلت");
        await elapse();
        if (change === "inactive")
          await q("UPDATE google_integrations SET is_active=0 WHERE id=?", [
            integration,
          ]);
        if (change === "rotated")
          await q("UPDATE google_integrations SET credentials=? WHERE id=?", [
            JSON.stringify({ refresh_token: "changed" }),
            integration,
          ]);
        if (change === "target")
          await q(
            "UPDATE google_integrations SET calendar_id='other' WHERE id=?",
            [integration]
          );
        if (change === "unknown")
          await q(
            "UPDATE appointments SET calendar_sync_state='create_unknown' WHERE id=?",
            [appointmentId]
          );
        if (change === "event")
          await q(
            "UPDATE appointments SET google_event_id='other' WHERE id=?",
            [appointmentId]
          );
        await dispatch();
        expect(provider.send).toHaveBeenCalledTimes(
          change === "unchanged" ? 1 : 0
        );
      }
    );
    it("keeps historical acceptance after a later failed receipt", async () => {
      await request();
      await elapse();
      await dispatch();
      const r = await row();
      await q(
        "UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",
        [owner.merchantId]
      );
      await reconcileAppointmentReminder(owner.merchantId, r.id);
      const final = await row();
      expect(final.state).toBe("accepted");
      expect(final.delivery_state).toBe("failed");
      expect(final.accepted_at).toEqual(r.accepted_at);
      expect(provider.send).toHaveBeenCalledOnce();
    });
    it("does not overwrite conflicting conversation history during projection repair", async () => {
      await request();
      await elapse();
      await dispatch();
      const r = await row();
      await q("UPDATE messages SET content='Operator message' WHERE id=?", [
        r.projection_message_id,
      ]);
      await reconcileAppointmentReminder(owner.merchantId, r.id);
      expect((await row()).last_error).toBe("projection_conflict");
      expect((await row()).projection_message_id).toBeNull();
      expect(
        (
          await q("SELECT content FROM messages WHERE id=?", [
            r.projection_message_id,
          ])
        )[0].content
      ).toBe("Operator message");
      expect(provider.send).toHaveBeenCalledOnce();
    });
    it("cancellation preserves acceptance history while stopping future work", async () => {
      await request();
      await elapse();
      await dispatch();
      const r = await row();
      await incoming(`ألغ تذكير الموعد A${appointmentId}`);
      await request();
      expect((await row()).cancelled_at).toBeTruthy();
      expect((await row()).state).toBe("accepted");
      await dispatch();
      expect(provider.send).toHaveBeenCalledOnce();
      expect((await row()).provider_message_id).toBe(r.provider_message_id);
    });
    it("cancellation cannot touch another customer's saved reminder", async () => {
      await request();
      const old = conversationId;
      conversationId = (
        await q(
          "INSERT INTO conversations (merchantId,customerPhone,customerName,status) VALUES (?,?,'Other conversation','active')",
          [owner.merchantId, phone]
        )
      ).insertId;
      await incoming(`ألغ تذكير الموعد A${appointmentId}`);
      await request();
      expect((await row()).cancelled_at).toBeNull();
      conversationId = old;
    });
    it("exposes an owned, read-only view without credentials, account IDs or snapshots", async () => {
      await request();
      const report = await readAppointmentReminders(
        owner.merchantId,
        appointmentId
      );
      expect(report.reminders[0].sourceText).toBe(command);
      expect(report.reminders[0].state).toBe("pending");
      expect(JSON.stringify(report)).not.toContain(account);
      expect(report.reminders[0]).not.toHaveProperty("snapshot");
      expect(provider.send).not.toHaveBeenCalled();
      await expect(
        readAppointmentReminders(other.merchantId, appointmentId)
      ).rejects.toThrow("unavailable");
      await q(
        "UPDATE appointment_reminders SET snapshot_hash=? WHERE merchant_id=?",
        ["f".repeat(64), owner.merchantId]
      );
      const corrupt = (
        await readAppointmentReminders(owner.merchantId, appointmentId)
      ).reminders[0];
      expect(corrupt.sourceText).toBeNull();
      expect(corrupt.attention).toBe(true);
      expect(corrupt.state).toBe("unknown");
    });
  }
);
