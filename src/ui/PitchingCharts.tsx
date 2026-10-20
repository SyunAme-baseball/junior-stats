import { inningsPitched } from "../domain/engine";
import { fmtKbb, fmtPct, fmtRatio, kPerBb, strikeRate, whip } from "../domain/pitchingMetrics";
import type { SeasonPitching } from "../domain/season";

type Metric = {
  title: string;
  help: string;
  value: (p: SeasonPitching) => number | null;
  format: (p: SeasonPitching) => string;
  /** 参考線 */
  guide: number;
  guideLabel: string;
  /** 小さいほど良い指標か */
  lowerIsBetter?: boolean;
  /** 目盛りの最大値（これより大きい値があればそちらに合わせる） */
  minMax: number;
};

const METRICS: Metric[] = [
  {
    title: "WHIP（1イニングに出した走者）",
    help: "(与四球＋被安打) ÷ 投球回。小さいほど走者を出していない。",
    value: whip,
    format: (p) => fmtRatio(whip(p)),
    guide: 1.3,
    guideLabel: "1.30",
    lowerIsBetter: true,
    minMax: 2.5,
  },
  {
    title: "K/BB（奪三振 ÷ 与四球）",
    help: "大きいほど、四球が少なく三振を取れている。四球0の投手は「三振数/0」と表示。",
    value: kPerBb,
    format: fmtKbb,
    guide: 2,
    guideLabel: "2.00",
    minMax: 4,
  },
  {
    title: "ストライク率",
    help: "ストライク（ファウル・打球を含む）÷ 球数。1球ごとに入力した試合だけで計算。",
    value: strikeRate,
    format: (p) => fmtPct(strikeRate(p)),
    guide: 0.6,
    guideLabel: "60%",
    minMax: 1,
  },
];

/** 投手ごとの指標を横棒で比べる */
export function PitchingCharts({ pitching, nameOf }: { pitching: SeasonPitching[]; nameOf: (id: string) => string }) {
  return (
    <div className="metric-charts">
      {METRICS.map((m) => {
        const rows = pitching
          .map((p) => ({ p, v: m.value(p) }))
          .filter((r) => r.v !== null || (m.value === kPerBb && r.p.so > 0))
          .sort((a, b) => {
            const av = a.v ?? Infinity;
            const bv = b.v ?? Infinity;
            return m.lowerIsBetter ? av - bv : bv - av;
          });
        const max = Math.max(m.minMax, ...rows.map((r) => (r.v === null ? 0 : r.v)));
        const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
        return (
          <section key={m.title} className="metric-chart">
            <h3>{m.title}</h3>
            <p className="muted small">{m.help}</p>
            {rows.length === 0 ? (
              <p className="muted small">まだ計算できる記録がありません。</p>
            ) : (
              <ul>
                {rows.map(({ p, v }) => {
                  const good = v === null ? !m.lowerIsBetter : m.lowerIsBetter ? v <= m.guide : v >= m.guide;
                  return (
                    <li key={p.playerId}>
                      <span className="metric-name">
                        {nameOf(p.playerId)}
                        <small>{inningsPitched(p.outs)}回</small>
                      </span>
                      <span className="metric-track">
                        <span className={good ? "metric-bar good" : "metric-bar"} style={{ width: v === null ? "100%" : pct(v) }} />
                        <span className="metric-guide" style={{ left: pct(m.guide) }} />
                      </span>
                      <b className="metric-value">{m.format(p)}</b>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="metric-legend">
              <span className="metric-guide-key" /> 目安 {m.guideLabel}（{m.lowerIsBetter ? "これより短いと良い" : "これより長いと良い"}）
            </p>
          </section>
        );
      })}
      <p className="muted small">目安は一般的な野球で使われる参考値です。投球回が少ない投手は数字が大きくぶれます。</p>
    </div>
  );
}
