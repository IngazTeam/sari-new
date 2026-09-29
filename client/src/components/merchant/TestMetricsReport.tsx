import {
  testMetricIds,
  type TestMetricId,
  type TestMetricsSnapshot,
} from "@shared/test-metrics-workspace";
import { testMetricsLabels } from "@/lib/test-metrics-labels";
import { testMetricNotes } from "@/lib/test-metrics-report";
import "@/styles/overview-workspace.css";
import "@/styles/test-metrics-workspace.css";
export function TestMetricsReport({
  data: d,
  t,
  language = "ar-SA",
  href = (s: string) => s,
}: {
  data: TestMetricsSnapshot;
  t: (key: string) => string;
  language?: string;
  href?: (s: string) => string;
}) {
  const l = testMetricsLabels(t),
    n = (v: number) =>
      new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(v),
    ratio = (v: number | null) => (v === null ? l.unavailable : n(v) + "%");
  const value = (id: TestMetricId) => {
    const m = d.metrics[id];
    if (m.meaning === "unmeasured") return l.unmeasured;
    if (m.value === null) return l.unavailable;
    return m.unit === "percent" ? ratio(m.value) : n(m.value);
  };
  const unit = (id: TestMetricId) => {
    const u = d.metrics[id].unit;
    return u === "ms"
      ? l.ms
      : u === "seconds"
        ? l.seconds
        : u === "messages"
          ? l.unitMessages
          : u === "stored_value"
            ? l.unitValue
            : "";
  };
  const row = (title: string, value: string) => (
    <div className="ov-pair">
      <dt>{title}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <div className="ov-report tm-report">
      <div className="ov-period">
        <strong>{l.scope}</strong>
      </div>
      <div className="ov-metrics">
        {[
          [l.sessions, n(d.sessions)],
          [l.messages, n(d.messages)],
          [l.replies, n(d.replies)],
          [l.salesSkill, l.unmeasured],
        ].map(([title, value]) => (
          <div className="ov-metric" key={title}>
            <p>{title}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="ov-panel" aria-labelledby="tm-observed">
        <h2 id="tm-observed">{l.observed}</h2>
        <div className="ov-grid">
          {testMetricIds
            .filter(id => d.metrics[id].meaning !== "unmeasured")
            .map(id => (
              <article key={id} className="ov-subpanel" data-metric={id}>
                <h3>{l[id]}</h3>
                <p className="tm-value">{value(id)}</p>
                <p className="ov-note">{unit(id)}</p>
                <dl>
                  {row(
                    l.sample,
                    n(d.metrics[id].sample) +
                      (d.metrics[id].denominator === null
                        ? ""
                        : ` / ${n(d.metrics[id].denominator!)}`)
                  )}
                </dl>
                <p className="ov-note">{l[testMetricNotes[id]]}</p>
              </article>
            ))}
        </div>
      </section>
      <section className="ov-panel" aria-labelledby="tm-feedback">
        <h2 id="tm-feedback">{l.feedback}</h2>
        <p className="ov-note">{l.feedbackNote}</p>
        <dl>
          {row(l.eligibleReplies, n(d.feedback.eligibleReplies))}
          {row(l.excludedGuardrails, n(d.feedback.excludedGuardrails))}
          {row(l.unknownSourceReplies, n(d.feedback.unknownSourceReplies))}
          {row(l.positive, n(d.feedback.positive))}
          {row(l.negative, n(d.feedback.negative))}
          {row(l.unrated, n(d.feedback.unrated))}
          {row(l.positiveShare, ratio(d.feedback.positiveShare))}
        </dl>
        <h3>{l.longSessions}</h3>
        <p>
          {n(d.longSessions.count)} / {n(d.longSessions.total)} ·{" "}
          {ratio(d.longSessions.share)}
        </p>
        <p className="ov-note">{l.longNote}</p>
      </section>
      <section className="ov-panel" aria-labelledby="tm-quality">
        <h2 id="tm-quality">{l.quality}</h2>
        <dl>
          {row(l.dealRecords, n(d.dealRecords))}
          {row(l.duplicateDeals, n(d.duplicateDeals))}
          {row(l.invalidDeals, n(d.invalidDeals))}
          {row(l.invalidLatency, n(d.invalidLatency))}
        </dl>
      </section>
      <section className="ov-panel" aria-labelledby="tm-unmeasured">
        <h2 id="tm-unmeasured">{l.unmeasuredTitle}</h2>
        <p className="ov-note">{l.missingNote}</p>
        <div className="ov-grid">
          {testMetricIds
            .filter(id => d.metrics[id].meaning === "unmeasured")
            .map(id => (
              <article className="ov-subpanel" key={id} data-metric={id}>
                <h3>{l[id]}</h3>
                <p className="tm-unmeasured">{l.unmeasured}</p>
                <p className="ov-note">{l[testMetricNotes[id]]}</p>
              </article>
            ))}
        </div>
      </section>
      <section className="ov-panel" aria-labelledby="tm-next">
        <h2 id="tm-next">{l.evidence}</h2>
        <p className="ov-note">{l.evidenceNote}</p>
        <a href={href("/merchant/test-sari")}>{l.openTest}</a>
        <a href={href("/merchant/overview-analytics")}>{l.openReal}</a>
        <a href={href("/merchant/sari-brain")}>{l.openKnowledge}</a>
      </section>
    </div>
  );
}
