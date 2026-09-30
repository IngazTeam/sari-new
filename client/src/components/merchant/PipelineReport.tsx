import type {
  PipelineInput,
  PipelineQueue,
  PipelineSnapshot,
  PipelineStage,
} from "@shared/pipeline-workspace";
import { pipelineLabels } from "@/lib/pipeline-labels";
import "@/styles/pipeline-workspace.css";
export const pipelineSelectionKey = (v: PipelineInput) =>
  [v.queue, v.stage ?? "", v.page, v.pageSize].join(":");
export function PipelineReport({
  data: d,
  t,
  language = "ar-SA",
  onSelect,
  onPage,
  href = (p: string) => p,
}: {
  data: PipelineSnapshot;
  t: (key: string) => string;
  language?: string;
  onSelect?: (v: PipelineInput) => void;
  onPage?: (page: number) => void;
  href?: (path: string) => string;
}) {
  const l = pipelineLabels(t),
    n = (v: number) =>
      new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(v);
  const date = (s: string | null) =>
    s
      ? new Intl.DateTimeFormat(language, {
          dateStyle: "medium",
          timeStyle: "short",
          calendar: "gregory",
          timeZone: "UTC",
        }).format(new Date(s)) + " UTC"
      : l.noDate;
  const stages: Record<PipelineStage, string> = {
    new: l.new,
    interested: l.interested,
    qualified: l.qualified,
    ready: l.readyStage,
    payment_link_sent: l.paymentLink,
    purchased: l.purchased,
    paid: l.paidStage,
    lost: l.lostStage,
    payment_failed: l.paymentFailed,
    unknown: l.unknownStage,
  };
  const queues: Record<Exclude<PipelineQueue, "stage">, string> = {
    ready: l.ready,
    "needs-human": l.needsHuman,
    pending: l.pending,
    stalled: l.stalled,
    paid: l.paid,
    lost: l.lost,
    all: l.all,
  };
  const notes: Record<PipelineQueue, string> = {
    ready: l.readyNote,
    "needs-human": l.humanNote,
    pending: l.pendingNote,
    stalled: l.stalledNote,
    paid: l.paidNote,
    lost: l.lostNote,
    all: l.allNote,
    stage: l.stageNote,
  };
  const reasons: Record<string, string> = {
    price: l.price,
    trust: l.trust,
    competitor: l.competitor,
    delivery: l.delivery,
    timing: l.timing,
    fit: l.fit,
    other: l.other,
    payment_failed: l.payment_failed,
    payment_abandoned: l.payment_abandoned,
    no_response: l.no_response,
    human_needed: l.human_needed,
    unknown: l.unclassified,
  };
  const reason = (s: string | null) =>
    s ? (Object.hasOwn(reasons, s) ? reasons[s] : s) : l.unclassified;
  const select = (value: string) => {
    const [queue, stage] = value.split(":");
    onSelect?.({
      queue: queue as PipelineQueue,
      ...(stage ? { stage: stage as PipelineStage } : {}),
      page: 1,
      pageSize: d.selection.pageSize,
    });
  };
  const selected =
    d.selection.queue + (d.selection.stage ? ":" + d.selection.stage : "");
  return (
    <div className="pl-report">
      <p className="ov-note">
        {l.asOf}:{" "}
        <time dateTime={d.windows.through}>{date(d.windows.through)}</time>
      </p>
      <div className="pl-actions" aria-label={l.queue}>
        {(["ready", "needs-human", "pending", "stalled"] as const).map(q => (
          <button
            type="button"
            key={q}
            data-pipeline-queue={q}
            aria-pressed={d.selection.queue === q}
            onClick={() => select(q)}
          >
            <span>{queues[q]}</span>
            <strong>{n(d.queues[q])}</strong>
          </button>
        ))}
      </div>
      <section className="ov-panel pl-list" aria-labelledby="pl-list-title">
        <div className="pl-list-head">
          <h2 id="pl-list-title">{l.queue}</h2>
          <label htmlFor="pl-queue">
            {l.queue}
            <select
              id="pl-queue"
              value={selected}
              onChange={e => select(e.target.value)}
            >
              {Object.entries(queues).map(([q, label]) => (
                <option key={q} value={q}>
                  {label} · {n(d.queues[q as keyof typeof queues])}
                </option>
              ))}
              <optgroup label={l.stageGroup}>
                {d.stages.map(s => (
                  <option key={s.stage} value={"stage:" + s.stage}>
                    {stages[s.stage]} · {n(s.count)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>
        <p className="ov-note">{notes[d.selection.queue]}</p>
        <p>
          {l.listTotal}: <strong>{n(d.list.total)}</strong>
        </p>
        {!d.list.items.length ? (
          <div role="status" className="pl-empty">
            <h3>{l.empty}</h3>
            <p>{l.emptyNote}</p>
            <button
              type="button"
              className="button"
              data-pipeline-queue="all"
              onClick={() => select("all")}
            >
              {l.all}
            </button>
          </div>
        ) : (
          <ul className="pl-items">
            {d.list.items.map(item => (
              <li key={item.id} data-pipeline-item={item.id}>
                <div className="pl-item-head">
                  <div>
                    <h3>{item.customerName || l.unknownName}</h3>
                    <bdi>{item.customerPhone || l.missingPhone}</bdi>
                  </div>
                  <span className="pl-stage">{stages[item.stage]}</span>
                </div>
                {item.preview && <p className="pl-preview">{item.preview}</p>}
                {item.previewTruncated && (
                  <p className="ov-note">{l.truncated}</p>
                )}
                <dl className="pl-dates">
                  <div>
                    <dt>{l.lastActivity}</dt>
                    <dd>
                      <time dateTime={item.lastMessageAt ?? undefined}>
                        {date(item.lastMessageAt)}
                      </time>
                    </dd>
                  </div>
                  {item.paymentLinkSentAt && (
                    <div>
                      <dt>{l.linkDate}</dt>
                      <dd>
                        <time dateTime={item.paymentLinkSentAt}>
                          {date(item.paymentLinkSentAt)}
                        </time>
                      </dd>
                    </div>
                  )}
                  {item.stalledSince && (
                    <div>
                      <dt>{l.stalledDate}</dt>
                      <dd>
                        <time dateTime={item.stalledSince}>
                          {date(item.stalledSince)}
                        </time>
                      </dd>
                    </div>
                  )}
                  {item.lossReason && (
                    <div>
                      <dt>{l.lossReason}</dt>
                      <dd>{reason(item.lossReason)}</dd>
                    </div>
                  )}
                </dl>
                {item.customerPhone.trim() ? (
                  <a
                    className="button"
                    href={href(
                      "/merchant/conversations?" +
                        new URLSearchParams({
                          phone: item.customerPhone,
                          ...(item.customerName
                            ? { name: item.customerName }
                            : {}),
                        })
                    )}
                  >
                    {l.open}
                  </a>
                ) : (
                  <p className="ov-note">{l.missingPhone}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="ov-note">{l.openNote}</p>
        <nav className="pl-pagination" aria-label={l.page}>
          <button
            type="button"
            className="button"
            data-pipeline-page={d.list.page - 1}
            disabled={d.list.page <= 1}
            onClick={() => onPage?.(d.list.page - 1)}
          >
            {l.previous}
          </button>
          <span>
            {l.page} {n(d.list.page)} {l.of} {n(Math.max(1, d.list.totalPages))}
          </span>
          <button
            type="button"
            className="button"
            data-pipeline-page={d.list.page + 1}
            disabled={d.list.page >= d.list.totalPages}
            onClick={() => onPage?.(d.list.page + 1)}
          >
            {l.next}
          </button>
        </nav>
      </section>
      <details className="ov-panel pl-analysis">
        <summary>{l.analysis}</summary>
        <p className="ov-note">{l.activityNote}</p>
        <p>
          {l.month}:{" "}
          <time dateTime={d.windows.monthFrom}>
            {date(d.windows.monthFrom)}
          </time>{" "}
          — {date(d.windows.through)}
        </p>
        <div className="ov-metrics">
          <article className="ov-metric">
            <p>{l.paidShare}</p>
            <strong>
              {d.outcomes.paidStageShare === null
                ? l.noSample
                : n(d.outcomes.paidStageShare) + "%"}
            </strong>
            <p>
              {l.sample}: {n(d.outcomes.paid)} /{" "}
              {n(d.outcomes.paid + d.outcomes.lost)}
            </p>
          </article>
          <article className="ov-metric">
            <p>{l.currentWeek}</p>
            <strong>{n(d.outcomes.currentWeekPaid)}</strong>
            <p>
              {date(d.windows.weekFrom)} — {date(d.windows.through)}
            </p>
          </article>
          <article className="ov-metric">
            <p>{l.previousWeek}</p>
            <strong>{n(d.outcomes.previousWeekPaid)}</strong>
            <p>
              {date(d.windows.previousFrom)} — {date(d.windows.previousThrough)}
            </p>
          </article>
        </div>
        <section aria-labelledby="pl-losses">
          <h3 id="pl-losses">{l.losses}</h3>
          {d.losses.length ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">{l.lossReason}</th>
                  <th scope="col">{l.count}</th>
                  <th scope="col">{l.share}</th>
                </tr>
              </thead>
              <tbody>
                {d.losses.map(r => (
                  <tr key={r.reason}>
                    <th scope="row">{reason(r.reason)}</th>
                    <td>{n(r.count)}</td>
                    <td>{n(r.share)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{l.noLosses}</p>
          )}
        </section>
        <section aria-labelledby="pl-values">
          <h3 id="pl-values">{l.values}</h3>
          <p className="ov-note">{l.valuesNote}</p>
          <div className="ov-grid">
            {d.values.map(v => (
              <article className="ov-subpanel" key={v.currency}>
                <h4>{v.currency}</h4>
                <dl>
                  {[
                    [l.validAmounts, n(v.count)],
                    [
                      l.value,
                      new Intl.NumberFormat(language, {
                        style: "currency",
                        currency: v.currency,
                      }).format(v.totalMinor / 100),
                    ],
                    [l.excludedAmounts, n(v.excludedAmounts)],
                  ].map(([key, value]) => (
                    <div className="ov-pair" key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <a href={href("/merchant/orders")}>{l.orders}</a>
        </section>
        <section>
          <h3>{l.limits}</h3>
          <p>{l.limitsNote}</p>
          <a href={href("/merchant/sari-brain")}>{l.brain}</a>
        </section>
      </details>
    </div>
  );
}
