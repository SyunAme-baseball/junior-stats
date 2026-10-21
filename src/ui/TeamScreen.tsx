import { useMemo, useState } from "react";
import { gradeLabel } from "../domain/categories";
import { fmtKbb, fmtPct, fmtRatio, strikeRate, whip } from "../domain/pitchingMetrics";
import { battingAverage, inningsPitched } from "../domain/engine";
import { filtersOf, onBasePct, summarizeSeason, winningPct } from "../domain/season";
import type { Game, Player, TeamProfile } from "../domain/types";
import { isActive, playerLabel, teamGradeLabel } from "../domain/roster";
import { ask } from "./confirm";
import { PitchingCharts } from "./PitchingCharts";
import { TeamMembers } from "./TeamMembers";
import { TeamIcon, TeamIconPicker } from "./TeamIcon";

type Props = {
  team: TeamProfile;
  roster: Player[];
  onOpenRoster: () => void;
  games: Game[];
  onSave: (team: TeamProfile) => void;
  onDelete: () => void;
  onNewGame: () => void;
  onOpenGame: (id: string) => void;
  onShare: () => void;
  /** 選手の個人総合成績を開く */
  onOpenPlayer: (playerId: string) => void;
  onBack: () => void;
};

const ALL = "すべて";
const RESULT_LABEL = { win: "勝", loss: "負", draw: "分", playing: "途中" } as const;

export function TeamScreen({ team, roster, onOpenRoster, games, onSave, onDelete, onNewGame, onOpenGame, onShare, onOpenPlayer, onBack }: Props) {
  const [editing, setEditing] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);
  const members = useMemo(() => team.players.filter(isActive), [team]);
  const filters = useMemo(() => filtersOf(team, games), [team, games]);
  const [season, setSeason] = useState<string>(() => filters.seasons[0] ?? ALL);
  const [category, setCategory] = useState<string>(ALL);
  const summary = useMemo(
    () => summarizeSeason(team, games, { season: season === ALL ? undefined : season, category: category === ALL ? undefined : category }),
    [team, games, season, category],
  );
  const byGrade = useMemo(() => {
    const groups = new Map<number | undefined, Player[]>();
    for (const p of members.filter((m) => !m.guest)) groups.set(p.grade, [...(groups.get(p.grade) ?? []), p]);
    return [...groups.entries()].sort(([a], [b]) => (b ?? 0) - (a ?? 0));
  }, [members]);

  // 試合中に加わった選手の名前も引けるようにする
  const names = useMemo(() => {
    const m = new Map<string, Player>();
    for (const g of games) for (const t of [g.teams.away, g.teams.home]) if (t.id === team.id) for (const p of t.roster) m.set(p.id, p);
    for (const p of team.players) m.set(p.id, p);
    return m;
  }, [team, games]);
  const nameOf = (id: string) => names.get(id)?.name ?? "不明な選手";

  const { record, totals } = summary;

  return (
    <main className="app">
      <header className="topbar">
        <button className="link-button" onClick={onBack}>
          ← 一覧
        </button>
        <span className="topbar-title">{team.name}</span>
        <span />
      </header>

      <section className="panel result-hero">
        <p className="eyebrow light">
          {season === ALL ? "ALL SEASONS" : `${season} SEASON`}
          {category !== ALL && `・${category}`}
        </p>
        <button className="team-icon-button" onClick={() => setPickingIcon(true)} aria-label="チームのアイコンを変える">
          <TeamIcon team={team} className="home-team-icon large" />
          <small>アイコンを変える</small>
        </button>
        <h1 className="team-title">{team.name}</h1>
        <p className="verdict">
          {record.win}勝 {record.loss}敗 {record.draw}分
        </p>
        <p className="muted light">
          勝率 {winningPct(record.win, record.loss)}　得点 {totals.runs}　失点 {totals.allowed}　安打 {totals.hits}　長打 {totals.xbh}（本塁打 {totals.hr}）　盗塁 {totals.sb}　失策 {totals.errors}
        </p>
      </section>

      {(filters.seasons.length > 0 || filters.categories.length > 0) && (
        <section className="panel filter-panel">
          {filters.seasons.length > 0 && (
            <div className="segmented">
              {[...filters.seasons, ALL].map((s) => (
                <button key={s} className={season === s ? "seg on" : "seg"} onClick={() => setSeason(s)}>
                  {s === ALL ? "全シーズン" : `${s}`}
                </button>
              ))}
            </div>
          )}
          {filters.categories.length > 0 && (
            <div className="segmented">
              {[...filters.categories, ALL].map((c) => (
                <button key={c} className={category === c ? "seg on" : "seg"} onClick={() => setCategory(c)}>
                  {c === ALL ? "全カテゴリー" : c}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <button className="primary-button big" onClick={onNewGame}>
        ＋ このチームで試合を作る
      </button>

      {editing ? (
        <TeamMembers
          roster={roster}
          team={team}
          onOpenRoster={onOpenRoster}
          onCancel={() => setEditing(false)}
          onSave={(t) => {
            onSave(t);
            setEditing(false);
          }}
        />
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h2>
              選手（{members.length}人）{team.maxGrade !== undefined && <small className="muted">　{teamGradeLabel(team.maxGrade)}</small>}
            </h2>
            <button className="secondary-button" onClick={() => setEditing(true)}>
              メンバーを選び直す
            </button>
          </div>
          {members.length === 0 && <p className="empty-state">メンバーがいません。「メンバーを選び直す」で名簿から選んでください。</p>}
          {byGrade.map(([grade, players]) => (
            <div key={grade ?? "none"} className="grade-group">
              <h3>
                {gradeLabel(grade)}（{players.length}人）
              </h3>
              <p className="player-chips">
                {players.map((p) => (
                  <span key={p.id}>{p.name}</span>
                ))}
              </p>
            </div>
          ))}
          {members.some((m) => m.guest) && (
            <div className="grade-group">
              <h3>他チームの選手（合同）</h3>
              <p className="player-chips">
                {members
                  .filter((m) => m.guest)
                  .map((p) => (
                    <span key={p.id}>{playerLabel(p)}</span>
                  ))}
              </p>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>試合（{summary.games.length}）</h2>
        {summary.games.length === 0 ? (
          <p className="empty-state">まだ試合がありません。</p>
        ) : (
          <ul className="game-list">
            {[...summary.games].reverse().map((r) => (
              <li key={r.game.id}>
                <button className="game-item" onClick={() => onOpenGame(r.game.id)}>
                  <strong>
                    <span className={`result-mark ${r.result}`}>{RESULT_LABEL[r.result]}</span> {r.myRuns} - {r.oppRuns} 対 {r.opponent}
                  </strong>
                  <span>
                    {r.game.date} {r.game.tournament}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>打撃成績（通算）</h2>
        <p className="muted small">選手名を押すと、チームやカテゴリーに関係なく合計した個人総合成績が見られます。</p>
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>選手</th>
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
                <th>牽制死</th>
              </tr>
            </thead>
            <tbody>
              {summary.batting.map((b) => (
                <tr key={b.playerId}>
                  <th>
                    <button className="link-button player-link" onClick={() => onOpenPlayer(b.playerId)}>
                      {nameOf(b.playerId)}
                    </button>
                  </th>
                  <td>{battingAverage(b)}</td>
                  <td>{onBasePct(b)}</td>
                  <td>{b.games}</td>
                  <td>{b.pa}</td>
                  <td>{b.ab}</td>
                  <td>{b.h}</td>
                  <td>{b.b2}</td>
                  <td>{b.b3}</td>
                  <td>{b.hr}</td>
                  <td>{b.rbi}</td>
                  <td>{b.r}</td>
                  <td>{b.bb}</td>
                  <td>{b.hbp}</td>
                  <td>{b.so}</td>
                  <td>{b.sh}</td>
                  <td>{b.sf}</td>
                  <td>{b.sb}</td>
                  <td>{b.cs}</td>
                  <td>{b.po}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>投手成績（通算）</h2>
        {summary.pitching.length === 0 ? (
          <p className="muted">まだ記録がありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>投手</th>
                  <th>登板</th>
                  <th>勝</th>
                  <th>敗</th>
                  <th>投球回</th>
                  <th>球数</th>
                  <th>打者</th>
                  <th>被安打</th>
                  <th>被本塁打</th>
                  <th>奪三振</th>
                  <th>与四球</th>
                  <th>与死球</th>
                  <th>失点</th>
                  <th>牽制刺</th>
                  <th>K/BB</th>
                  <th>ストライク率</th>
                  <th>WHIP</th>
                </tr>
              </thead>
              <tbody>
                {summary.pitching.map((p) => (
                  <tr key={p.playerId}>
                    <th>
                      <button className="link-button player-link" onClick={() => onOpenPlayer(p.playerId)}>
                        {nameOf(p.playerId)}
                      </button>
                    </th>
                    <td>{p.games}</td>
                    <td>{p.w}</td>
                    <td>{p.l}</td>
                    <td>{inningsPitched(p.outs)}</td>
                    <td>{p.pitches}</td>
                    <td>{p.bf}</td>
                    <td>{p.h}</td>
                    <td>{p.hr}</td>
                    <td>{p.so}</td>
                    <td>{p.bb}</td>
                    <td>{p.hbp}</td>
                    <td>{p.r}</td>
                    <td>{p.pk}</td>
                    <td>{fmtKbb(p)}</td>
                    <td>{fmtPct(strikeRate(p))}</td>
                    <td>{fmtRatio(whip(p))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">勝敗は試合終了時に自動判定（試合結果画面で変更可）。途中の試合は勝敗に数えず、成績には含めています。</p>
      </section>

      {summary.pitching.length > 0 && (
        <section className="panel">
          <h2>投手の指標</h2>
          <PitchingCharts pitching={summary.pitching} nameOf={nameOf} />
        </section>
      )}

      <section className="panel">
        <h2>チームの管理</h2>
        <div className="stack">
          <button className="secondary-button" onClick={onShare}>
            このチームの全試合を共有（ほかの保護者・端末へ）
          </button>
          <button className="secondary-button" onClick={onOpenRoster}>
            名簿を開く（選手の追加・学年・進学・卒団）
          </button>
          <button
            className="danger-button"
            onClick={async () => {
              if (await ask(`${team.name}を削除します。試合の記録は残りますが、このチームの通算成績は見られなくなります。`, "削除する")) onDelete();
            }}
          >
            このチームを削除
          </button>
        </div>
      </section>
      {pickingIcon && (
        <TeamIconPicker
          team={team}
          onClose={() => setPickingIcon(false)}
          onSave={(icon) => {
            onSave({ ...team, icon, updatedAt: Date.now() });
            setPickingIcon(false);
          }}
        />
      )}
    </main>
  );
}
