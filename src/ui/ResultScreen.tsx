import { useMemo } from "react";
import { fmtKbb, fmtPct, fmtRatio, strikeRate, whip } from "../domain/pitchingMetrics";
import { battingAverage, inningsPitched, replay, type PlayerStats } from "../domain/engine";
import { POSITION_SHORT } from "../domain/positions";
import { highlights, inningLabel, makeNameOf, sentence } from "../domain/describe";
import type { Game, Side } from "../domain/types";
import { clockTime, durationLabel } from "../domain/gameClock";
import { LineScore } from "./Scoreboard";

const END_LABEL = { regulation: "", walkoff: "サヨナラ", called: "コールドゲーム", time: "時間切れ", other: "" } as const;

function achievements(st: PlayerStats): string {
  const parts: string[] = [];
  if (st.hr) parts.push(`${st.hr}本塁打`);
  if (st.h) parts.push(`${st.h}安打`);
  if (st.rbi) parts.push(`${st.rbi}打点`);
  if (st.r) parts.push(`${st.r}得点`);
  if (st.sb) parts.push(`${st.sb}盗塁`);
  if (st.bb + st.hbp) parts.push(`${st.bb + st.hbp}四死球`);
  if (st.sh + st.sf) parts.push(`犠打・犠飛${st.sh + st.sf}`);
  return parts.join("　");
}

export function ResultScreen({ game, onChange, onBack }: { game: Game; onChange: (g: Game) => void; onBack: () => void }) {
  const state = useMemo(() => replay(game), [game]);
  const nameOf = useMemo(() => makeNameOf(game), [game]);
  const events = highlights(state.outcomes, nameOf);
  const reviewCount = state.outcomes.filter(
    (o) => o.warnings.length > 0 || ((o.play.type === "pa" || o.play.type === "runner") && o.play.needsReview),
  ).length;

  const verdict = () => {
    if (!state.finished) return `${inningLabel(state.inning, state.half)}の途中です`;
    const { away, home } = state.runs;
    if (state.winner === "draw") return `${away} - ${home} で引き分け`;
    const w = state.winner as Side;
    const end = END_LABEL[state.endReason ?? "other"];
    return `${Math.max(away, home)} - ${Math.min(away, home)} で${game.teams[w].name}の${end ? `${end}` : ""}勝利！`;
  };

  // 打順に出た選手（交代で入った選手も含む）を出場順に並べる
  const playersOf = (side: Side) => {
    const ids = game.teams[side].roster.map((p) => p.id).filter((id) => state.stats[id]);
    return ids.map((id) => state.stats[id]);
  };

  return (
    <main className="app">
      <header className="topbar">
        <button className="link-button" onClick={onBack}>
          ← スコアボードへ
        </button>
        <span className="topbar-title">{game.tournament || "試合結果"}</span>
        <span />
      </header>

      <section className="panel result-hero">
        <p className="eyebrow light">{state.finished ? "GAME SET" : "途中経過"}</p>
        {(["away", "home"] as const).map((side) => (
          <div key={side} className={`team-row ${state.winner === side ? "winner" : ""}`}>
            <span className="team-name">{game.teams[side].name}</span>
            <strong className="team-runs">{state.runs[side]}</strong>
          </div>
        ))}
        <p className="verdict">{verdict()}</p>
        {state.decisions && (
          <p className="decisions">
            {state.decisions.win && <span>勝：{nameOf(state.decisions.win)}</span>}
            {state.decisions.loss && <span>負：{nameOf(state.decisions.loss)}</span>}
          </p>
        )}
        {game.date && <p className="muted light">{game.date}</p>}
        {game.startedAt && (
          <p className="muted light">
            {clockTime(game.startedAt)}〜{game.endedAt ? `${clockTime(game.endedAt)}（${durationLabel(game.endedAt - game.startedAt)}）` : ""}
            {game.timeLimit ? `　試合時間 ${game.timeLimit}分` : ""}
          </p>
        )}
      </section>

      {reviewCount > 0 && (
        <p className="notice">
          ⚠ 確認が必要な記録が{reviewCount}件あります。公式記録と異なる可能性があります（スコアボードの「試合経過」で確認できます）。
        </p>
      )}

      <section className="panel">
        <h2>イニング別得点</h2>
        <LineScore game={game} state={state} />
      </section>

      <section className="panel">
        <h2>選手の活躍</h2>
        {(["away", "home"] as const).map((side) => {
          const list = playersOf(side).filter((st) => achievements(st));
          return (
            <div key={side} className="achievements">
              <h3>{game.teams[side].name}</h3>
              {list.length === 0 ? (
                <p className="muted">記録された活躍はまだありません。</p>
              ) : (
                <ul>
                  {list.map((st) => (
                    <li key={st.playerId}>
                      <strong>{nameOf(st.playerId)}</strong>
                      <span>{achievements(st)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="panel">
        <h2>主な出来事</h2>
        {events.length === 0 ? (
          <p className="muted">得点や長打はまだありません。</p>
        ) : (
          <ul className="events">
            {events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      {(["away", "home"] as const).map((side) => (
        <section key={side} className="panel">
          <h2>{game.teams[side].name} 打撃成績</h2>
          <div className="table-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>選手</th>
                  <th>守備</th>
                  <th>打率</th>
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
                {playersOf(side).map((st) => (
                  <tr key={st.playerId}>
                    <th>{nameOf(st.playerId)}</th>
                    <td>{(state.positionHistory[st.playerId] ?? []).map((p) => POSITION_SHORT[p]).join("→") || "—"}</td>
                    <td>{battingAverage(st)}</td>
                    <td>{st.pa}</td>
                    <td>{st.ab}</td>
                    <td>{st.h}</td>
                    <td>{st.b2}</td>
                    <td>{st.b3}</td>
                    <td>{st.hr}</td>
                    <td>{st.rbi}</td>
                    <td>{st.r}</td>
                    <td>{st.bb}</td>
                    <td>{st.hbp}</td>
                    <td>{st.so}</td>
                    <td>{st.sh}</td>
                    <td>{st.sf}</td>
                    <td>{st.sb}</td>
                    <td>{st.cs}</td>
                    <td>{st.po}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            打率＝安打÷打数（打数は打席から四球・死球・犠打・犠飛を除いた数）。チーム合計：{state.hits[side]}安打・{state.runs[side]}得点・{playersOf(side).reduce((n, st) => n + st.sb, 0)}盗塁
          </p>
        </section>
      ))}

      <section className="panel">
        <h2>投手成績</h2>
        {state.decisions && state.winner && state.winner !== "draw" && (
          <div className="decision-edit">
            {(
              [
                ["win", "勝利投手", state.winner],
                ["loss", "敗戦投手", state.winner === "away" ? "home" : "away"],
              ] as const
            ).map(([key, label, side]) => {
              const auto = key === "win" ? state.decisions!.autoWin : state.decisions!.autoLoss;
              return (
                <label key={key} className="field">
                  {label}
                  <select
                    value={game.pitcherDecisions?.[key] ?? ""}
                    onChange={(e) => {
                      const next = { ...game.pitcherDecisions, [key]: e.target.value || undefined };
                      onChange({ ...game, pitcherDecisions: next, updatedAt: Date.now() });
                    }}
                  >
                    <option value="">自動（{auto ? nameOf(auto) : "該当なし"}）</option>
                    {state.pitcherOrder[side].map((id) => (
                      <option key={id} value={id}>
                        {nameOf(id)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        )}
        {(["away", "home"] as const).map((side) => (
          <div key={side} className="achievements">
            <h3>{game.teams[side].name}</h3>
            {state.pitcherOrder[side].length === 0 ? (
              <p className="muted">記録された投手はいません。</p>
            ) : (
              <div className="table-scroll">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>投手</th>
                      <th>勝敗</th>
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
                    {state.pitcherOrder[side].map((id) => {
                      const p = state.pitching[id];
                      return (
                        <tr key={id}>
                          <th>{nameOf(id)}</th>
                          <td>{state.decisions?.win === id ? "勝" : state.decisions?.loss === id ? "負" : ""}</td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        <p className="muted small">
          投球回はその投手が取ったアウト数÷3。球数は1球ごとに入力した球＋打席の結果になった球（1球ごとの入力をしない場合は少なく出ます）。牽制刺は牽制でアウトにした数。失点は「その投手が出した走者がホームにかえった数」です（自責点は未対応）。勝敗は「最後にリードを奪ったときの投手」で自動判定し、先発が規定の回（7回以上の試合は5回、それ未満は予定回数の6割）に満たないときは最も長く投げた救援投手を勝利投手にします。判定が違う場合は上で変更できます。
        </p>
      </section>

      <section className="panel">
        <h2>試合経過</h2>
        <ol className="timeline">
          {state.outcomes
            .filter((o) => !o.ignored)
            .map((o) => (
              <li key={o.play.id}>
                <span className="play-time">{inningLabel(o.inning, o.half)}</span>
                <span>{sentence(o, nameOf)}</span>
              </li>
            ))}
        </ol>
      </section>
    </main>
  );
}
