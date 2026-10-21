import { useMemo, useState } from "react";
import { gradeLabel } from "../domain/categories";
import { battingAverage, inningsPitched } from "../domain/engine";
import { onBasePct, summarizePlayer, type PlayerLine } from "../domain/season";
import type { Game, Player } from "../domain/types";

type Props = {
  player: Player;
  games: Game[];
  onBack: () => void;
};

const TABS = [
  ["byCategory", "カテゴリー別"],
  ["bySeason", "シーズン別"],
  ["byTeam", "チーム別"],
] as const;

/** 個人総合成績：出場したチーム・カテゴリーに関係なく、その選手の全試合を合計する */
export function PlayerScreen({ player, games, onBack }: Props) {
  const summary = useMemo(() => summarizePlayer(player.id, games), [player.id, games]);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("byCategory");
  const rows = [summary.total, ...summary[tab]];
  const bat = summary.total.batting;
  const pit = summary.total.pitching;

  return (
    <main className="app">
      <header className="topbar">
        <button className="link-button" onClick={onBack}>
          ← 戻る
        </button>
        <span className="topbar-title">個人総合成績</span>
        <span />
      </header>

      <section className="panel result-hero">
        <p className="eyebrow light">ALL GAMES</p>
        <h1 className="team-title">{player.name}</h1>
        <p className="muted light">
          {player.left ? "退団" : gradeLabel(player.grade)}
          {player.guest && player.fromTeam ? `・${player.fromTeam}` : ""}
        </p>
        {bat ? (
          <p className="verdict">
            打率 {battingAverage(bat)}　出塁率 {onBasePct(bat)}
          </p>
        ) : (
          !pit && <p className="verdict">まだ試合の記録がありません</p>
        )}
        {bat && (
          <p className="muted light">
            {bat.games}試合　安打 {bat.h}　本塁打 {bat.hr}　打点 {bat.rbi}　得点 {bat.r}　盗塁 {bat.sb}
          </p>
        )}
        {pit && (
          <p className="muted light">
            投手 {pit.games}登板　{pit.w}勝{pit.l}敗　{inningsPitched(pit.outs)}回　奪三振 {pit.so}
          </p>
        )}
      </section>

      {(bat || pit) && (
        <section className="panel filter-panel">
          <div className="segmented">
            {TABS.map(([k, label]) => (
              <button key={k} className={tab === k ? "seg on" : "seg"} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <p className="muted small">1行目は、出場したチーム・カテゴリーに関係なく全試合を合計した成績です。</p>
        </section>
      )}

      {bat && <BattingTable rows={rows} />}
      {pit && <PitchingTable rows={rows} />}
    </main>
  );
}

function BattingTable({ rows }: { rows: PlayerLine[] }) {
  const list = rows.filter((r) => r.batting);
  return (
    <section className="panel">
      <h2>打撃成績</h2>
      <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th>区分</th>
              <th>打率</th>
              <th>出塁率</th>
              <th>試合</th>
              <th>打席</th>
              <th>打数</th>
              <th>安打</th>
              <th>二塁打</th>
              <th>三塁打</th>
              <th>本塁打</th>
              <th>打点</th>
              <th>得点</th>
              <th>四球</th>
              <th>死球</th>
              <th>三振</th>
              <th>犠打</th>
              <th>犠飛</th>
              <th>盗塁</th>
              <th>盗塁死</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ label, batting: b }, i) => (
              <tr key={label} className={i === 0 ? "total-row" : undefined}>
                <th>{label}</th>
                <td>{battingAverage(b!)}</td>
                <td>{onBasePct(b!)}</td>
                <td>{b!.games}</td>
                <td>{b!.pa}</td>
                <td>{b!.ab}</td>
                <td>{b!.h}</td>
                <td>{b!.b2}</td>
                <td>{b!.b3}</td>
                <td>{b!.hr}</td>
                <td>{b!.rbi}</td>
                <td>{b!.r}</td>
                <td>{b!.bb}</td>
                <td>{b!.hbp}</td>
                <td>{b!.so}</td>
                <td>{b!.sh}</td>
                <td>{b!.sf}</td>
                <td>{b!.sb}</td>
                <td>{b!.cs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PitchingTable({ rows }: { rows: PlayerLine[] }) {
  const list = rows.filter((r) => r.pitching);
  return (
    <section className="panel">
      <h2>投手成績</h2>
      <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th>区分</th>
              <th>登板</th>
              <th>勝</th>
              <th>敗</th>
              <th>投球回</th>
              <th>球数</th>
              <th>打者</th>
              <th>被安打</th>
              <th>奪三振</th>
              <th>与四球</th>
              <th>与死球</th>
              <th>失点</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ label, pitching: p }, i) => (
              <tr key={label} className={i === 0 ? "total-row" : undefined}>
                <th>{label}</th>
                <td>{p!.games}</td>
                <td>{p!.w}</td>
                <td>{p!.l}</td>
                <td>{inningsPitched(p!.outs)}</td>
                <td>{p!.pitches}</td>
                <td>{p!.bf}</td>
                <td>{p!.h}</td>
                <td>{p!.so}</td>
                <td>{p!.bb}</td>
                <td>{p!.hbp}</td>
                <td>{p!.r}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
