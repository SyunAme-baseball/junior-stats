import { other, pitcherOf, type GameState } from "../domain/engine";
import { inningLabel, sentence, type NameOf } from "../domain/describe";
import type { Bases, Game, Side } from "../domain/types";

function Dots({ label, n, max, kind }: { label: string; n: number; max: number; kind: "ball" | "strike" | "out" }) {
  return (
    <div className="count-row" aria-label={`${label}${n}`}>
      <span className="count-label">{kind === "ball" ? "B" : kind === "strike" ? "S" : "O"}</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? `dot dot-on ${kind}` : "dot"} />
      ))}
    </div>
  );
}

function basesText(bases: Bases) {
  const on = ([1, 2, 3] as const).filter((b) => bases[b - 1]);
  if (on.length === 0) return "ランナーなし";
  if (on.length === 3) return "満塁";
  return on.map((b) => `${b}塁`).join("・");
}

export function LineScore({ game, state }: { game: Game; state: GameState }) {
  const innings = Math.max(game.scheduledInnings, state.inning, state.lineScore.away.length, state.lineScore.home.length);
  const cols = Array.from({ length: innings }, (_, i) => i + 1);
  const cell = (side: Side, inning: number) => {
    const v = state.lineScore[side][inning - 1];
    if (v != null) return v;
    if (state.finished && side === "home" && inning === state.inning) return "X";
    return "";
  };
  return (
    <div className="table-scroll">
      <table className="line-score">
        <thead>
          <tr>
            <th>チーム</th>
            {cols.map((i) => (
              <th key={i}>{i}</th>
            ))}
            <th className="sum">計</th>
            <th>安</th>
            <th>失</th>
          </tr>
        </thead>
        <tbody>
          {(["away", "home"] as const).map((side) => (
            <tr key={side}>
              <th>{game.teams[side].name}</th>
              {cols.map((i) => (
                <td
                  key={i}
                  className={!state.finished && state.inning === i && state.offense === side ? "current" : ""}
                >
                  {cell(side, i)}
                </td>
              ))}
              <td className="sum">{state.runs[side]}</td>
              <td>{state.hits[side]}</td>
              <td>{state.errors[side]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type PitchInfo = { now: number; today: number; earlier: number; limit: number; level: "ok" | "near" | "over" };

/** 小さな塁の図（ランナーのいる塁を塗る） */
function MiniDiamond({ bases }: { bases: Bases }) {
  const pos = { 1: [40, 26], 2: [24, 10], 3: [8, 26] } as const;
  return (
    <svg className="mini-diamond" viewBox="0 0 48 44" role="img" aria-label={`ランナー：${basesText(bases)}`}>
      {([1, 2, 3] as const).map((b) => {
        const [x, y] = pos[b];
        return <rect key={b} x={x - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${x} ${y})`} className={bases[b - 1] ? "base base-on" : "base"} />;
      })}
      <rect x="20" y="34" width="8" height="8" transform="rotate(45 24 38)" className="diamond-home" />
    </svg>
  );
}

/**
 * 試合中のスコアボード。結果入力のボタンがスクロールせずに見えるよう、要点だけを小さくまとめる。
 * イニングごとの得点（LineScore）は入力パネルの下に置く。
 */
export function Scoreboard({ game, state, nameOf, pitchInfo }: { game: Game; state: GameState; nameOf: NameOf; pitchInfo?: PitchInfo | null }) {
  // 打順の何番か（「3番」）
  const orderOf = (ahead: number) => {
    const len = state.lineups[state.offense].length;
    return len ? `${((state.battingIndex[state.offense] + ahead) % len) + 1}番` : "";
  };
  const last = [...state.outcomes].reverse().find((o) => o.play.type === "pa" || o.play.type === "runner");
  const pitcherId = pitcherOf(state, other(state.offense));
  const runners = ([1, 2, 3] as const).filter((b) => state.bases[b - 1]);
  return (
    <section className="scoreboard sb">
      <div className="sb-top">
        <div className="sb-scores">
          {(["away", "home"] as const).map((side) => (
            <div key={side} className={!state.finished && state.offense === side ? "sb-team batting" : "sb-team"}>
              <span className="sb-team-name">{game.teams[side].name}</span>
              <strong>{state.runs[side]}</strong>
            </div>
          ))}
        </div>
        <div className="sb-inning">
          {state.finished ? (
            <b>試合終了</b>
          ) : (
            <>
              <b>{inningLabel(state.inning, state.half)}</b>
              <span>{state.outs}アウト</span>
            </>
          )}
        </div>
      </div>

      {!state.finished && (
        <>
          <div className="sb-mid">
            <MiniDiamond bases={state.bases} />
            <div className="counts sb-counts">
              <Dots label="ボール" n={state.count.balls} max={3} kind="ball" />
              <Dots label="ストライク" n={state.count.strikes} max={2} kind="strike" />
              <Dots label="アウト" n={state.outs} max={2} kind="out" />
            </div>
            <div className="sb-batters">
              <p className="sb-now">
                <span>{orderOf(0)}</span>
                <strong>{nameOf(state.currentBatterId)}</strong>
              </p>
              <p>
                <span>次 {orderOf(1)}</span>
                {nameOf(state.nextBatterId)}
              </p>
              <p>
                <span>次々 {orderOf(2)}</span>
                {nameOf(state.nextNextBatterId)}
              </p>
            </div>
          </div>
          <p className="sb-line">
            <span>
              投 {pitcherId ? nameOf(pitcherId) : "未設定"}
              {pitchInfo && (
                <span className={`pitch-count ${pitchInfo.level}`}>
                  {pitchInfo.today}球{pitchInfo.limit > 0 && `/${pitchInfo.limit}`}
                </span>
              )}
            </span>
            <span className="sb-runners">{runners.length ? runners.map((b) => `${b}塁 ${nameOf(state.bases[b - 1])}`).join("・") : "ランナーなし"}</span>
          </p>
        </>
      )}
      {last && (
        <p className="sb-last">
          <span>直前</span>
          {sentence(last, nameOf)}
        </p>
      )}
    </section>
  );
}
