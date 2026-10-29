import type { Metadata } from "next";
import { Notice, PageHeading } from "@/components/ui";
import {
  demoReport as r,
  levelLabels,
  type Level,
} from "@/features/reflection/demo-report";
import { PrintButton } from "./print-button";
import styles from "./reflection.module.css";

export const metadata: Metadata = { title: "Reflection report" };

const count = (level: Level) => r.energy.filter((x) => x === level).length;

export default function Page() {
  const low = count("low");
  const okay = count("okay");
  const more = count("more");
  const summary = `Low on ${low} days, okay on ${okay}, more on ${more}.`;
  const max = Math.max(...r.weeks.map((w) => w.done + w.partly + w.notToday));
  return (
    <>
      <PageHeading
        eyebrow="More · Reflection"
        description="A summary of the last 4 weeks, to read yourself or bring to an appointment."
      >
        Reflection report
      </PageHeading>
      <Notice>
        Demo data. These values are made up to show the layout. This is not a
        medical record or a diagnosis.
      </Notice>
      <article className={styles.report}>
        <div className={styles.toolbar}>
          <PrintButton />
        </div>
        <dl className={styles.meta}>
          <div>
            <dt>Name</dt>
            <dd>{r.name}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>{r.period}</dd>
          </div>
          <div>
            <dt>Prepared</dt>
            <dd>{r.prepared}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{r.source}</dd>
          </div>
        </dl>

        <section className={styles.section}>
          <h2>Energy at check-in</h2>
          <div
            className={styles.days}
            role="img"
            aria-label={`Energy at check-in for each of 28 days, 1 Oct to 28 Oct. ${summary}`}
          >
            {r.energy.map((level, i) => (
              <span key={i} className={styles.day}>
                <span className={styles.bar} data-level={level} />
              </span>
            ))}
          </div>
          <div className={styles.axis} aria-hidden="true">
            <span>1 Oct</span>
            <span>28 Oct</span>
          </div>
          <ul className={styles.legend}>
            {(Object.keys(levelLabels) as Level[]).map((k) => (
              <li key={k}>
                <span className={styles.swatch} data-swatch={k} />
                {levelLabels[k]}
              </li>
            ))}
          </ul>
          <p>{summary}</p>
        </section>

        <section className={styles.section}>
          <h2>What moved</h2>
          <div
            className={styles.weeks}
            role="img"
            aria-label="Done, partly and not today counts for each of 4 weeks. The table has the numbers."
          >
            {r.weeks.map((w) => (
              <div key={w.label} className={styles.weekRow}>
                <span>{w.label}</span>
                <span className={styles.stack}>
                  {(
                    [
                      ["done", w.done],
                      ["partly", w.partly],
                      ["not", w.notToday],
                    ] as const
                  ).map(([k, n]) => (
                    <span
                      key={k}
                      className={styles.seg}
                      data-kind={k}
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  ))}
                </span>
              </div>
            ))}
          </div>
          <ul className={styles.legend}>
            {(
              [
                ["done", "Done"],
                ["partly", "Partly"],
                ["not", "Not today"],
              ] as const
            ).map(([k, label]) => (
              <li key={k}>
                <span className={styles.swatch} data-kind={k} />
                {label}
              </li>
            ))}
          </ul>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Done</th>
                <th scope="col">Partly</th>
                <th scope="col">Not today</th>
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((w) => (
                <tr key={w.label}>
                  <th scope="row">{w.label}</th>
                  <td>{w.done}</td>
                  <td>{w.partly}</td>
                  <td>{w.notToday}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.section}>
          <h2>This week things</h2>
          <ul className={styles.list}>
            {r.things.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h2>What helped, in your words</h2>
          <ul className={styles.quotes}>
            {r.helped.map((q) => (
              <li key={q}>&ldquo;{q}&rdquo;</li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Notes to bring</h2>
          <ul className={styles.list}>
            {r.notes.map((n) => (
              <li key={n.date}>
                <span className={styles.date}>{n.date}</span> {n.text}
              </li>
            ))}
          </ul>
        </section>

        <p className={styles.foot}>
          Made from your own check-ins and entries. Not a diagnosis.
        </p>
      </article>
    </>
  );
}
