import { useEffect, useMemo, useState } from "react";
import { other, pitcherOf, replay, stateBefore } from "../domain/engine";
import { inningLabel, makeNameOf, sentence } from "../domain/describe";
import { newId } from "../domain/id";
import { availability, defaultMoves, RESULT_LIST, RESULTS, type Category } from "../domain/results";
import { POSITION_SHORT } from "../domain/positions";
import { limitOf, pitchLevel } from "../domain/pitchCount";
import type { BattedKind, BattingPlay, Direction, EndPlay, Game, PitchKind, Play, ResultCode, RunnerPlay } from "../domain/types";
import { BALL_KIND_LABELS, BattedBallDialog, type BallKind } from "./BattedBall";
import { PlayEditor } from "./PlayEditor";
import { ask } from "./confirm";
import { LineScore, Scoreboard } from "./Scoreboard";
import { DefenseDialog, EndGameDialog, PinchDialog, type SubSave } from "./dialogs";
import { GameClock } from "./GameClock";

type Props = {
  game: Game;
  onChange: (game: Game) => void;
  onShowResult: () => void;
  onBack: () => void;
  /** 同じ日のほかの試合で投げた球数（球数制限の合算用） */
  earlierPitches: Record<string, number>;
  onShare: () => void;
};

type Editing = { index: number; result: ResultCode; direction?: Direction; batted?: BattedKind; existing?: BattingPlay | RunnerPlay };

const QUICK: ResultCode[] = ["strikeout", "walk"];
// 一覧から選ぶボタン（3列で並べたとき、打球 → 三振・四球 → その他 の順になる）
const MORE: [Category | "misc", string][] = [
  ["onbase", "死球・エラー等の出塁"],
  ["special", "バント・犠飛・併殺"],
  ["runner", "盗塁・走者のプレー"],
  ["out", "その他のアウト"],
  ["hit", "ヒット（一覧）"],
  ["misc", "交代・試合終了"],
];

export function GameScreen({ game, onChange, onShowResult, onBack, earlierPitches, onShare }: Props) {
  const state = useMemo(() => replay(game), [game]);
  const nameOf = useMemo(() => makeNameOf(game), [game]);
  // 試合を開いたときは、スコアボードと入力ボタンが見える一番上から始める
  useEffect(() => window.scrollTo(0, 0), []);
  const [category, setCategory] = useState<Category | "misc" | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // 打球の入力（結果→方向のポップアップ）
  const [ball, setBall] = useState<BallKind | null>(null);
  const [dialog, setDialog] = useState<"pinch_hitter" | "pinch_runner" | "defense" | "end" | "foul" | null>(null);

  const setPlays = (plays: Play[], teams = game.teams) => onChange({ ...game, teams, plays, updatedAt: Date.now() });

  const savePlay = (play: BattingPlay | RunnerPlay) => {
    if (!editing) return;
    const plays = [...game.plays];
    if (editing.existing) plays[editing.index] = play;
    else plays.push(play);
    setPlays(plays);
    setEditing(null);
    setCategory(null);
  };

  const removePlay = async (index: number) => {
    if (!(await ask("このプレーを削除します。後のプレーの得点や成績もすべて計算し直します。", "削除する"))) return;
    setPlays(game.plays.filter((_, i) => i !== index));
    setEditing(null);
  };

  const openPlay = async (index: number) => {
    const play = game.plays[index];
    if (play.type === "pa" || play.type === "runner") {
      setEditing({ index, result: play.result, existing: play });
    } else if (await ask(`「${play.type === "sub" ? "選手交代" : "試合終了"}」の記録を削除しますか？`, "削除する")) {
      setPlays(game.plays.filter((_, i) => i !== index));
    }
  };

  const saveSubs: SubSave = (subs, side, newPlayers) => {
    const team = game.teams[side];
    const teams = { ...game.teams, [side]: { ...team, roster: [...team.roster, ...newPlayers] } };
    setPlays([...game.plays, ...subs], teams);
    setDialog(null);
    setCategory(null);
  };

  const defense = other(state.offense);
  // 指名打者の枠は守備につかなくてよい
  const unassigned = state.lineups[defense].filter((_, i) => state.positions[defense][i] === null && i !== state.dhSlot[defense]);
  const noPitcher = !pitcherOf(state, defense);

  const undo = () => setPlays(game.plays.slice(0, -1));

  // 1球ごとの入力。4つ目のボール・3つ目のストライクは打席の結果（四球・三振）の確認画面を開く
  const recordPitch = (pitch: PitchKind) => {
    if (pitch === "ball" && state.count.balls >= 3) return setEditing({ index: game.plays.length, result: "walk" });
    if ((pitch === "called_strike" || pitch === "swinging_strike") && state.count.strikes >= 2)
      return setEditing({ index: game.plays.length, result: "strikeout" });
    setPlays([...game.plays, { id: newId(), type: "pitch", pitch, createdAt: Date.now() }]);
  };

  // ファウルの打球がアウトになった場合など、確認画面を出さずにそのまま記録する（あとで経過から修正できる）
  const recordOut = (result: ResultCode, extra: Partial<BattingPlay> = {}) => {
    const batterId = state.currentBatterId ?? state.lineups[state.offense][0];
    if (!batterId) return;
    const play: BattingPlay = {
      id: newId(),
      type: "pa",
      result,
      batterId,
      moves: defaultMoves(result, state.bases, state.outs),
      createdAt: Date.now(),
      ...extra,
    };
    setPlays([...game.plays, play]);
    setDialog(null);
  };

  const pitcherId = pitcherOf(state, defense);
  const limit = limitOf(game);
  const pitchesNow = pitcherId ? (state.pitching[pitcherId]?.pitches ?? 0) : 0;
  const pitchesToday = pitcherId ? pitchesNow + (earlierPitches[pitcherId] ?? 0) : 0;
  const level = pitchLevel(pitchesToday, limit);

  const editBefore = editing ? (editing.existing ? stateBefore(game, editing.index) : state) : null;

  return (
    <main className={state.finished ? "app" : "app with-pad"}>
      <header className="topbar">
        <button className="link-button" onClick={onBack}>
          ← 戻る
        </button>
        <span className="topbar-title">
          {game.tournament || "試合"} {game.date && `・${game.date}`}
        </span>
        <span className="topbar-actions">
          <button className="link-button" onClick={onShare}>
            共有
          </button>
          <button className="link-button" onClick={onShowResult}>
            {state.finished ? "結果" : "経過"} →
          </button>
        </span>
      </header>

      <Scoreboard
        game={game}
        state={state}
        nameOf={nameOf}
        pitchInfo={pitcherId ? { now: pitchesNow, today: pitchesToday, limit, level, earlier: earlierPitches[pitcherId] ?? 0 } : null}
      />
      <GameClock game={game} onChange={(patch) => onChange({ ...game, ...patch, updatedAt: Date.now() })} />
      {!state.finished && level === "over" && (
        <p className="pitch-alert over">
          ⚠ {nameOf(pitcherId)}は今日{pitchesToday}球で、球数制限（{limit}球）に達しました。
        </p>
      )}


      {state.finished ? (
        <section className="panel finished-panel">
          <h2>試合終了</h2>
          <p>記録を直したいときは、下の「試合経過」からプレーを選んでください。</p>
          <button className="primary-button" onClick={onShowResult}>
            試合結果を見る
          </button>
        </section>
      ) : (
        <section className="panel input-panel">
          <p className="input-heading">
            <span className="status-badge">{game.teams[state.offense].name}の攻撃</span>
            打席の結果・プレーを選ぶ
          </p>

          {(noPitcher || unassigned.length > 0) && (
            <div className="notice">
              <p>
                {game.teams[defense].name}の守備位置が決まっていない選手がいます
                {unassigned.length > 0 && `（${unassigned.map(nameOf).join("、")}）`}
                {noPitcher && "。ピッチャーがいないため、投手成績に入りません"}。
              </p>
              <button className="secondary-button" onClick={() => setDialog("defense")}>
                守備位置を決める
              </button>
            </div>
          )}

          <div className="category-grid">
            {(Object.keys(BALL_KIND_LABELS) as BallKind[]).map((k) => (
              <button key={k} className="cat ball-kind" onClick={() => (setCategory(null), setBall(k))}>
                {BALL_KIND_LABELS[k]}
              </button>
            ))}
            {QUICK.map((code) => (
              <button
                key={code}
                className="cat quick"
                disabled={!!availability(code, state.bases, state.outs)}
                onClick={() => (setCategory(null), setEditing({ index: game.plays.length, result: code }))}
              >
                {RESULTS[code].label}
              </button>
            ))}
            {MORE.map(([c, label]) => (
              <button key={c} className={category === c ? "cat on" : "cat"} onClick={() => setCategory(category === c ? null : c)}>
                {label}
              </button>
            ))}
          </div>

          {category && category !== "misc" && (
            <div className="option-grid">
              {RESULT_LIST.filter((d) => d.category === category).map((d) => {
                const why = availability(d.code, state.bases, state.outs);
                return (
                  <button
                    key={d.code}
                    className="option"
                    disabled={!!why}
                    title={why ?? d.help}
                    onClick={() => setEditing({ index: game.plays.length, result: d.code })}
                  >
                    {d.label}
                    {why && <small>{why}</small>}
                  </button>
                );
              })}
            </div>
          )}
          {category === "misc" && (
            <div className="option-grid">
              <button className="option" onClick={() => setDialog("pinch_hitter")}>
                代打
              </button>
              <button className="option" disabled={!state.bases.some(Boolean)} onClick={() => setDialog("pinch_runner")}>
                代走
              </button>
              <button className="option" onClick={() => setDialog("defense")}>
                守備交代・ピッチャー交代
              </button>
              <button className="option" onClick={() => setDialog("end")}>
                試合を終了する（コールドなど）
              </button>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <LineScore game={game} state={state} />
      </section>

      <details className="panel lineup-panel">
        <summary>
          <h2>打順と守備位置</h2>
          <button
            className="link-button"
            onClick={(e) => {
              e.preventDefault();
              setDialog("defense");
            }}
          >
            守備交代
          </button>
        </summary>
        <div className="lineup-columns">
          {(["away", "home"] as const).map((side) => (
            <div key={side}>
              <h3>{game.teams[side].name}</h3>
              <ol className="lineup-list">
                {state.lineups[side].map((id, i) => {
                  const pos = state.positions[side][i];
                  return (
                    <li key={id} className={!state.finished && side === state.offense && id === state.currentBatterId ? "now" : ""}>
                      <span className="order">{i + 1}</span>
                      <span className="pname">{nameOf(id)}</span>
                      <span className={pos ? "pos" : "pos none"}>{pos ? POSITION_SHORT[pos] : i === state.dhSlot[side] ? "指" : "守備なし"}</span>
                    </li>
                  );
                })}
                {state.dhPitcher[side] && (
                  <li>
                    <span className="order">－</span>
                    <span className="pname">{nameOf(state.dhPitcher[side])}</span>
                    <span className="pos">投</span>
                  </li>
                )}
              </ol>
            </div>
          ))}
        </div>
      </details>

      <section className="panel">
        <div className="section-heading">
          <h2>試合経過</h2>
          <button className="secondary-button" onClick={undo} disabled={game.plays.length === 0}>
            直前の記録を取り消す
          </button>
        </div>
        {state.outcomes.length === 0 ? (
          <p className="empty-state">まだプレーが記録されていません。上のボタンから最初のプレーを記録してください。</p>
        ) : (
          <ol className="play-list">
            {[...state.outcomes]
              .reverse()
              .filter((o) => o.play.type !== "pitch")
              .map((o) => {
              const p = o.play;
              const review = (p.type === "pa" || p.type === "runner") && p.needsReview;
              return (
                <li key={p.id}>
                  <button className={`play-item ${o.ignored ? "ignored" : ""}`} onClick={() => openPlay(o.index)}>
                    <span className="play-time">{inningLabel(o.inning, o.half)}</span>
                    <span className="play-content">
                      <strong>{sentence(o, nameOf)}</strong>
                      <span>
                        {game.teams[p.type === "sub" ? p.side : o.offense].name}
                        {(p.type === "pa" || p.type === "runner") && `・${o.outsAfter}アウト`}
                        {o.endsHalf && "・チェンジ"}
                        {p.type === "pa" && o.rbi > 0 && `・打点${o.rbi}`}
                        {p.type === "pa" && (o.countBefore.balls > 0 || o.countBefore.strikes > 0) && `・${o.countBefore.balls}ボール${o.countBefore.strikes}ストライクから`}
                      </span>
                      {(p.type === "pa" || p.type === "runner") && p.note && <span className="note">メモ：{p.note}</span>}
                      {o.warnings.map((w) => (
                        <span key={w} className="warning">
                          ⚠ {w}
                        </span>
                      ))}
                    </span>
                    {o.scored.length > 0 && <span className="run-badge">{o.scored.length}点</span>}
                    {review && <span className="review-badge">要確認</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="muted small">プレーを押すと修正・削除できます。途中のプレーを直しても、得点・アウト・打順・成績は自動で計算し直されます。</p>
      </section>

      {!state.finished && (
        <nav className="pitch-pad" aria-label="1球ごとの入力">
          <div className={`pad-status ${level}`}>
            <span className="pad-bso">
              B<b>{state.count.balls}</b> S<b>{state.count.strikes}</b> O<b>{state.outs}</b>
            </span>
            {pitcherId ? (
              <>
                {limit > 0 && (
                  <span className="pad-meter" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (pitchesToday / limit) * 100)}%` }} />
                  </span>
                )}
                <span className="pad-pitch-num" aria-label={`今日の球数${pitchesToday}球`}>
                  <b>{pitchesToday}</b>球{limit > 0 && <small>/{limit}</small>}
                  <small className="pad-left">{limit === 0 ? "制限なし" : pitchesToday >= limit ? "到達" : `あと${limit - pitchesToday}`}</small>
                </span>
              </>
            ) : (
              <span className="pad-left">ピッチャー未設定</span>
            )}
          </div>
          <button className="pad ball" onClick={() => recordPitch("ball")}>
            ボール
          </button>
          <button className="pad strike" onClick={() => recordPitch("called_strike")}>
            見逃し
          </button>
          <button className="pad strike" onClick={() => recordPitch("swinging_strike")}>
            空振り
          </button>
          <button className="pad foul" onClick={() => setDialog("foul")}>
            ファウル
          </button>
          <button className="pad undo" onClick={undo} disabled={game.plays.length === 0} aria-label="直前の記録を取り消す">
            ↶
          </button>
        </nav>
      )}

      {editing && editBefore && (
        <PlayEditor
          key={`${editing.index}-${editing.result}`}
          game={game}
          before={editBefore}
          index={editing.index}
          initialResult={editing.result}
          initialDirection={editing.direction}
          initialBatted={editing.batted}
          existing={editing.existing}
          nameOf={nameOf}
          onSave={savePlay}
          onDelete={editing.existing ? () => removePlay(editing.index) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {(dialog === "pinch_hitter" || dialog === "pinch_runner") && (
        <PinchDialog kind={dialog} game={game} state={state} nameOf={nameOf} onClose={() => setDialog(null)} onSave={saveSubs} />
      )}
      {ball && (
        <BattedBallDialog
          kind={ball}
          batter={nameOf(state.currentBatterId ?? undefined)}
          bases={state.bases}
          outs={state.outs}
          onClose={() => setBall(null)}
          onDone={(result, direction, batted) => {
            setBall(null);
            setEditing({ index: game.plays.length, result, direction, batted });
          }}
        />
      )}
      {dialog === "foul" && (
        <FoulDialog
          strikes={state.count.strikes}
          batter={nameOf(state.currentBatterId ?? undefined)}
          onFoul={() => {
            recordPitch("foul");
            setDialog(null);
          }}
          onFoulOut={(direction) => recordOut("foul_out", { direction })}
          onStrikeout={(note) => recordOut("strikeout", { note })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "defense" && <DefenseDialog game={game} state={state} nameOf={nameOf} onClose={() => setDialog(null)} onSave={saveSubs} />}
      {dialog === "end" && (
        <EndGameDialog
          onClose={() => setDialog(null)}
          onSave={(reason, note) => {
            const end: EndPlay = { id: newId(), type: "end", reason, note, createdAt: Date.now() };
            setPlays([...game.plays, end]);
            setDialog(null);
            setCategory(null);
          }}
        />
      )}
    </main>
  );
}

const FOUL_FIELDERS: { id: Direction; label: string }[] = [
  { id: "c", label: "キャッチャー" },
  { id: "1b", label: "ファースト" },
  { id: "3b", label: "サード" },
  { id: "p", label: "ピッチャー" },
  { id: "2b", label: "セカンド" },
  { id: "ss", label: "ショート" },
  { id: "lf", label: "レフト" },
  { id: "rf", label: "ライト" },
];

/** ファウルのあとに「ファウルのまま」か「捕られてアウト」かを選ぶ */
function FoulDialog({
  strikes,
  batter,
  onFoul,
  onFoulOut,
  onStrikeout,
  onClose,
}: {
  strikes: number;
  batter: string;
  onFoul: () => void;
  onFoulOut: (d: Direction) => void;
  onStrikeout: (note: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="ファウルの打球">
      <div className="sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{batter}</p>
            <h2>ファウルの打球はどうなった？</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>
        <button className="primary-button big foul-main" onClick={onFoul}>
          ファウル（打ち直し）
          <small>{strikes >= 2 ? "2ストライクなのでカウントはそのまま" : `${strikes + 1}ストライクになります`}</small>
        </button>
        <div className="field">
          捕られてアウト（ファウルフライ）：捕った人を選ぶ
          <div className="option-grid foul-grid">
            {FOUL_FIELDERS.map((f) => (
              <button key={f.id} className="option" onClick={() => onFoulOut(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {strikes >= 2 && (
          <div className="field">
            2ストライクからの三振
            <div className="option-grid">
              <button className="option" onClick={() => onStrikeout("ファウルチップ")}>
                ファウルチップを捕手が捕った
              </button>
              <button className="option" onClick={() => onStrikeout("スリーバント失敗")}>
                バントがファウル（スリーバント失敗）
              </button>
            </div>
          </div>
        )}
        <p className="muted small">記録したあとでも、試合経過から修正できます。</p>
      </div>
    </div>
  );
}
