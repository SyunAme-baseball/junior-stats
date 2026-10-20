import { useMemo, useState } from "react";
import { other, replay, type GameState } from "../domain/engine";
import { resultLabel, type NameOf } from "../domain/describe";
import { newId } from "../domain/id";
import { availability, defaultMoves, RESULT_LIST, RESULTS } from "../domain/results";
import { FieldPicker } from "./FieldPicker";
import { RunnerStepper } from "./RunnerStepper";
import { BATTED_LABELS, ERROR_TYPE_LABELS, fielderFromDirection, fieldingText, THROW_LABELS } from "../domain/fielding";
import { POSITION_SHORT, POSITIONS } from "../domain/positions";
import type { BattedKind, BattingPlay, Dest, ErrorType, Position, Direction, From, Game, ResultCode, RunnerMove, RunnerPlay } from "../domain/types";

type Props = {
  game: Game;
  /** このプレーの直前の状況 */
  before: GameState;
  /** 新規の場合は plays.length、修正の場合はそのプレーの位置 */
  index: number;
  initialResult: ResultCode;
  /** 打球の位置を先に選んでいた場合 */
  initialDirection?: Direction;
  /** 打球の種類（ゴロ・フライ・ライナー）を先に選んでいた場合 */
  initialBatted?: BattedKind;
  existing?: BattingPlay | RunnerPlay;
  nameOf: NameOf;
  onSave: (play: BattingPlay | RunnerPlay) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const HIT_CODES: ResultCode[] = ["infield_single", "single", "double", "triple", "home_run"];
const HIT_SHORT: Partial<Record<ResultCode, string>> = { infield_single: "内野安打", single: "単打", double: "二塁打", triple: "三塁打", home_run: "本塁打" };


export function PlayEditor({ game, before, index, initialResult, initialDirection, initialBatted, existing, nameOf, onSave, onDelete, onClose }: Props) {
  const [result, setResult] = useState<ResultCode>(existing?.result ?? initialResult);
  const isPa = RESULTS[result].pa;
  const [batterId, setBatterId] = useState<string>(
    (existing?.type === "pa" ? existing.batterId : before.currentBatterId) ?? before.lineups[before.offense][0] ?? "",
  );
  const [direction, setDirection] = useState<Direction | undefined>(existing?.type === "pa" ? existing.direction : initialDirection);
  const [moves, setMoves] = useState<RunnerMove[]>(existing?.moves ?? defaultMoves(initialResult, before.bases, before.outs));
  const [fielder, setFielder] = useState<Position | undefined>(existing?.type === "pa" ? existing.fielder : undefined);
  // 守備の流れ（エラー・野手選択）
  const ex = existing?.type === "pa" ? existing : undefined;
  const [batted, setBatted] = useState<BattedKind | undefined>(ex ? ex.batted : initialBatted);
  const [fieldedBy, setFieldedBy] = useState<Position | undefined>(ex ? ex.fieldedBy : fielderFromDirection(initialDirection));
  const [throwTo, setThrowTo] = useState<1 | 2 | 3 | 4 | undefined>(ex?.throwTo);
  const [errorType, setErrorType] = useState<ErrorType | undefined>(ex?.errorType);
  const hasFlow = result === "error" || result === "fielders_choice";
  // ヒットのあとのエラー（ワンヒットワンエラー）
  const isHit = !!RESULTS[result].hit;
  const [hitError, setHitError] = useState<boolean>(!!(ex && RESULTS[ex.result].hit && ex.fielder));
  const errorOn = result === "error" || (isHit && hitError);
  const hitFlowText = fieldingText({ throwTo, fielder, errorType });
  const flowText = hasFlow ? fieldingText({ batted, fieldedBy, throwTo, fielder: result === "error" ? fielder : undefined, errorType: result === "error" ? errorType : undefined }) : null;
  // 守備位置のボタン（守っている選手の名前つき）。もう一度押すと解除
  const PositionButtons = ({ value, onChange }: { value: Position | undefined; onChange: (p: Position | undefined) => void }) => {
    const def = other(before.offense);
    return (
      <div className="segmented">
        {POSITIONS.map((p) => {
          const i = before.positions[def].indexOf(p);
          return (
            <button key={p} className={value === p ? "seg on" : "seg"} onClick={() => onChange(value === p ? undefined : p)}>
              {POSITION_SHORT[p]}
              {i >= 0 && <small className="seg-sub">{nameOf(before.lineups[def][i])}</small>}
            </button>
          );
        })}
      </div>
    );
  };
  const [rbiOverride, setRbiOverride] = useState<number | undefined>(existing?.type === "pa" ? existing.rbiOverride : undefined);
  const [runsCount, setRunsCount] = useState<boolean | undefined>(existing?.runsCountOverride);
  const [note, setNote] = useState(existing?.note ?? "");
  const [needsReview, setNeedsReview] = useState(existing?.needsReview ?? false);

  const changeResult = (code: ResultCode) => {
    setResult(code);
    setMoves(defaultMoves(code, before.bases, before.outs));
    setRbiOverride(undefined);
    setRunsCount(undefined);
    if (!RESULTS[code].directional) setDirection(undefined);
  };

  const build = (): BattingPlay | RunnerPlay => {
    const common = {
      id: existing?.id ?? newId(),
      result,
      // 今の塁状況に存在しない走者の動き（修正で前のプレーが変わった場合など）は捨てる
      moves: moves.filter((m) => (m.from === 0 ? isPa : before.bases[m.from - 1] !== null)),
      runsCountOverride: runsCount,
      note: note.trim() || undefined,
      needsReview: needsReview || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    return isPa
      ? {
          ...common,
          type: "pa",
          batterId,
          direction,
          rbiOverride,
          fielder: errorOn ? fielder : undefined,
          errorType: errorOn ? errorType : undefined,
          batted: hasFlow ? batted : undefined,
          fieldedBy: hasFlow ? fieldedBy : undefined,
          throwTo: hasFlow || errorOn ? throwTo : undefined,
        }
      : { ...common, type: "runner" };
  };

  // 同じルールエンジンで「記録したらどうなるか」を先に計算する
  const preview = useMemo(() => {
    const play = build();
    const s = replay({ ...game, plays: [...game.plays.slice(0, index), play] });
    const auto = replay({
      ...game,
      plays: [...game.plays.slice(0, index), { ...play, ...(play.type === "pa" ? { rbiOverride: undefined } : {}) }],
    });
    return { o: s.outcomes[index], autoRbi: auto.outcomes[index].rbi };
  }, [game, index, result, batterId, direction, moves, rbiOverride, runsCount, fielder, errorType, batted, fieldedBy, throwTo, hitError]);

  const o = preview.o;
  // バッターのあと、先の塁のランナーから（3塁 → 2塁 → 1塁）入力する
  const runnersOn = ([3, 2, 1] as const).filter((b) => before.bases[b - 1] !== null);
  const rows: From[] = isPa ? [0, ...runnersOn] : [...runnersOn];

  const moveOf = (from: From): RunnerMove => moves.find((m) => m.from === from) ?? { from, to: from === 0 ? 1 : (from as Dest) };
  const setMove = (from: From, patch: Partial<RunnerMove>) => {
    setMoves((prev) => {
      const cur = prev.find((m) => m.from === from) ?? moveOf(from);
      const next = { ...cur, ...patch };
      if (next.to !== "out") delete next.force;
      return [...prev.filter((m) => m.from !== from), next];
    });
  };

  const thirdOut = o.outsBefore + o.outsOnPlay >= 3;
  const someoneHome = moves.some((m) => m.to === 4);
  const blockedByRule = moves.some((m) => m.to === "out" && (m.from === 0 || m.force));
  const errors = o.warnings.filter((w) => /いません|2人|戻る|設定されていません|設定できません|追い越/.test(w));
  const otherWarnings = o.warnings.filter((w) => !errors.includes(w));
  const pickable = RESULT_LIST.filter((d) => d.pa === RESULTS[result].pa);

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="プレーの確認">
      <div className="sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{existing ? "記録を修正" : "プレーの確認"}</p>
            <h2>{resultLabel(result, direction)}</h2>
            <p className="help">{RESULTS[result].help}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>

        <label className="field">
          プレーの種類
          <select value={result} onChange={(e) => changeResult(e.target.value as ResultCode)}>
            {pickable.map((d) => {
              const why = availability(d.code, before.bases, before.outs);
              return (
                <option key={d.code} value={d.code} disabled={!!why && d.code !== result}>
                  {d.label}
                  {why ? `（${why}）` : ""}
                </option>
              );
            })}
          </select>
        </label>

        {isPa && (
          <label className="field">
            バッター
            <select value={batterId} onChange={(e) => setBatterId(e.target.value)}>
              {game.teams[before.offense].roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameOf(p.id)}
                  {p.id === before.currentBatterId ? "（打順どおり）" : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {RESULTS[result].category === "hit" && (
          <div className="field">
            結果
            <div className="segmented">
              {HIT_CODES.map((code) => (
                <button key={code} className={result === code ? "seg on" : "seg"} onClick={() => changeResult(code)}>
                  {HIT_SHORT[code]}
                </button>
              ))}
            </div>
          </div>
        )}

        {RESULTS[result].directional && (
          <div className="field">
            打球の位置（任意）
            <FieldPicker value={direction} onChange={setDirection} />
          </div>
        )}

        {hasFlow && (
          <div className="field fielding-flow">
            守備の流れ（任意）
            {flowText && <p className="flow-preview">{flowText}</p>}
            <p className="flow-step">① 打球の種類</p>
            <div className="segmented">
              {(Object.keys(BATTED_LABELS) as BattedKind[]).map((k) => (
                <button key={k} className={batted === k ? "seg on" : "seg"} onClick={() => setBatted(batted === k ? undefined : k)}>
                  {BATTED_LABELS[k]}
                </button>
              ))}
            </div>
            <p className="flow-step">② 打球を捕った人</p>
            <PositionButtons value={fieldedBy} onChange={setFieldedBy} />
            <p className="flow-step">③ 送球した塁</p>
            <div className="segmented">
              {([1, 2, 3, 4] as const).map((b) => (
                <button key={b} className={throwTo === b ? "seg on" : "seg"} onClick={() => setThrowTo(throwTo === b ? undefined : b)}>
                  {THROW_LABELS[b]}
                </button>
              ))}
            </div>
            {result === "error" && (
              <>
                <p className="flow-step">④ エラーした人</p>
                <PositionButtons value={fielder} onChange={setFielder} />
                <p className="flow-step">⑤ エラーの種類</p>
                <div className="segmented">
                  {(Object.keys(ERROR_TYPE_LABELS) as ErrorType[]).map((t) => (
                    <button key={t} className={errorType === t ? "seg on" : "seg"} onClick={() => setErrorType(errorType === t ? undefined : t)}>
                      {ERROR_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {isHit && (
          <div className="field fielding-flow">
            <label className="check">
              <input
                type="checkbox"
                checked={hitError}
                onChange={(e) => {
                  const on = e.target.checked;
                  setHitError(on);
                  if (on) {
                    // よくある形：外野手が捕って返球がそれ、バッターが1つ余計に進む
                    if (!fielder) setFielder(fielderFromDirection(direction));
                    if (!errorType) setErrorType("throwing");
                    const hb = RESULTS[result].hit!;
                    if (hb < 4 && moveOf(0).to === hb) setMove(0, { to: (hb + 1) as Dest });
                  }
                }}
              />
              ヒットのあとにエラーがあった（ワンヒットワンエラーなど）
            </label>
            {hitError && (
              <>
                {hitFlowText && <p className="flow-preview">{hitFlowText}</p>}
                <p className="flow-step">送球した塁</p>
                <div className="segmented">
                  {([1, 2, 3, 4] as const).map((b) => (
                    <button key={b} className={throwTo === b ? "seg on" : "seg"} onClick={() => setThrowTo(throwTo === b ? undefined : b)}>
                      {THROW_LABELS[b]}
                    </button>
                  ))}
                </div>
                <p className="flow-step">エラーした人</p>
                <PositionButtons value={fielder} onChange={setFielder} />
                <p className="flow-step">エラーの種類</p>
                <div className="segmented">
                  {(Object.keys(ERROR_TYPE_LABELS) as ErrorType[]).map((t) => (
                    <button key={t} className={errorType === t ? "seg on" : "seg"} onClick={() => setErrorType(errorType === t ? undefined : t)}>
                      {ERROR_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <p className="muted small">下の「バッターとランナーはどうなった？」で、エラーで進んだ塁まで設定してください（バッターは1つ先の塁にしてあります）。ヒットの数え方（単打など）は変わりません。</p>
              </>
            )}
          </div>
        )}

        <div className="field">
          {isPa ? "バッターとランナーはどうなった？" : "ランナーはどうなった？"}
          {rows.length === 0 ? (
            <p className="muted">ランナーがいません。</p>
          ) : (
            <RunnerStepper
              key={result}
              rows={rows}
              idOf={(from) => (from === 0 ? batterId : before.bases[from - 1])}
              nameOf={nameOf}
              moveOf={moveOf}
              setMove={setMove}
              // 修正のとき、ランナーがいなくてバッターの行き先が決まっている結果（三振・四球・ゴロアウトなど）は聞かない
              startDone={!!existing || (rows.length === 1 && !RESULTS[result].hit && !["error", "fielders_choice", "dropped_third"].includes(result))}
            />
          )}
        </div>

        {thirdOut && someoneHome && (
          <div className="notice">
            {blockedByRule ? (
              <p>このプレーで3アウトになり、3つめのアウトが「バッターのアウト」または「フォースアウト」のため、ホームインしても得点になりません（野球規則）。</p>
            ) : (
              <>
                <p>このプレーで3アウトです。ランナーは3つめのアウトより先にホームを踏みましたか？</p>
                <div className="segmented">
                  <button className={runsCount !== false ? "seg on" : "seg"} onClick={() => setRunsCount(undefined)}>
                    先にホームイン（得点）
                  </button>
                  <button className={runsCount === false ? "seg on" : "seg"} onClick={() => setRunsCount(false)}>
                    間に合わなかった
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="preview">
          <div>
            <span>アウト</span>
            <strong>
              {o.outsBefore} → {o.outsAfter}
            </strong>
          </div>
          <div>
            <span>得点</span>
            <strong>{o.scored.length}点</strong>
          </div>
          {isPa && (
            <div>
              <span>打点{rbiOverride === undefined ? "（自動）" : "（手動）"}</span>
              <div className="stepper">
                <button onClick={() => setRbiOverride(Math.max(0, o.rbi - 1))} aria-label="打点を減らす">
                  −
                </button>
                <strong>{o.rbi}</strong>
                <button onClick={() => setRbiOverride(Math.min(4, o.rbi + 1))} aria-label="打点を増やす">
                  ＋
                </button>
              </div>
              {rbiOverride !== undefined && (
                <button className="link-button" onClick={() => setRbiOverride(undefined)}>
                  自動（{preview.autoRbi}）に戻す
                </button>
              )}
            </div>
          )}
        </div>
        {o.notCounted.length > 0 && <p className="muted">ホームインしたが得点にならない走者：{o.notCounted.map(nameOf).join("、")}</p>}
        {otherWarnings.map((w) => (
          <p key={w} className="warning">
            ⚠ {w}
          </p>
        ))}
        {errors.map((w) => (
          <p key={w} className="error">
            ✕ {w}
          </p>
        ))}

        <label className="field">
          メモ（任意）
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：ショートの送球がそれた" />
        </label>
        <label className="check">
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
          判断に迷ったので、あとで確認する
        </label>

        <div className="sheet-actions">
          {onDelete && (
            <button className="danger-button" onClick={onDelete}>
              このプレーを削除
            </button>
          )}
          <button className="primary-button" disabled={errors.length > 0} onClick={() => onSave(build())}>
            {existing ? "修正を保存" : "記録する"}
          </button>
        </div>
      </div>
    </div>
  );
}
