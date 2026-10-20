import { useState } from "react";
import type { Dest, From, RunnerMove } from "../domain/types";

const BASE_NAME = ["バッター", "1塁ランナー", "2塁ランナー", "3塁ランナー"];
const DEST_LABEL = (from: From, to: Dest) => (to === "out" ? "アウト" : to === 4 ? "ホームイン" : to === from ? "そのまま" : `${to}塁へ`);

// ベースの位置（viewBox 0..240 × 0..220）。0 と 4 は本塁
const POS: Record<number, [number, number]> = { 0: [120, 192], 1: [206, 108], 2: [120, 24], 3: [34, 108], 4: [120, 192] };

type Props = {
  /** 入力する順（バッター → 3塁 → 2塁 → 1塁） */
  rows: From[];
  idOf: (from: From) => string | null | undefined;
  nameOf: (id: string | null | undefined) => string;
  moveOf: (from: From) => RunnerMove;
  setMove: (from: From, patch: Partial<RunnerMove>) => void;
  /** 最初からポップアップを出さない（修正のときや、聞くまでもない場面） */
  startDone?: boolean;
};

/**
 * 打者・走者の動きを、ベースの図をタップして1人ずつ入力する。
 * 1人ずつポップアップで聞き（バッター → 3塁 → 2塁 → 1塁ランナー）、タップすると次の人のポップアップへ進む。
 * 全員終わると、確認画面には全員の行き先と図だけを出す。名前を押すとその人のポップアップを開き直す。
 */
export function RunnerStepper({ rows, idOf, nameOf, moveOf, setMove, startDone }: Props) {
  const [step, setStep] = useState(startDone ? rows.length : 0);
  const done = step >= rows.length;
  const from = done ? null : rows[step];

  const choose = (to: Dest, force?: boolean) => {
    if (from === null) return;
    setMove(from, { to, force: to === "out" && from !== 0 ? !!force : undefined });
    setStep((s) => s + 1);
  };

  // 各ベースに今いる（いることになる）人の名前
  const at = new Map<number, string[]>();
  for (const f of rows) {
    const m = moveOf(f);
    if (m.to === "out") continue;
    const key = m.to === 4 ? 4 : m.to;
    at.set(key, [...(at.get(key) ?? []), nameOf(idOf(f))]);
  }

  const canTap = (b: number) => {
    if (from === null) return false;
    if (from === 0) return b >= 1;
    return b >= from;
  };

  const field = (
    <svg className={done ? "stepper-field done" : "stepper-field"} viewBox="0 0 240 232" role="group" aria-label="ベース">
      <path className="stepper-lines" d={`M ${POS[0].join(" ")} L ${POS[1].join(" ")} L ${POS[2].join(" ")} L ${POS[3].join(" ")} Z`} />
      {from !== null && from > 0 && <circle className="stepper-origin" cx={POS[from][0]} cy={POS[from][1]} r="30" />}
      {([1, 2, 3, 4] as const).map((b) => {
        const [x, y] = POS[b];
        const enabled = canTap(b);
        const label = b === 4 ? "本塁" : `${b}塁`;
        const names = at.get(b) ?? [];
        const isCur = from !== null && moveOf(from).to === b;
        return (
          <g
            key={b}
            className={`stepper-base${enabled ? "" : " disabled"}${isCur ? " current" : ""}`}
            role="button"
            aria-label={from === b ? `${label}（そのまま）` : label}
            aria-disabled={!enabled}
            tabIndex={enabled ? 0 : -1}
            onClick={() => enabled && choose(b as Dest)}
            onKeyDown={(e) => enabled && (e.key === "Enter" || e.key === " ") && choose(b as Dest)}
          >
            {/* 押しやすいよう、見た目より広い当たり判定 */}
            <rect className="hit" x={x - 34} y={y - 30} width="68" height="60" />
            {b === 4 ? (
              <path className="plate" d={`M ${x - 13} ${y - 10} h 26 v 10 l -13 12 l -13 -12 Z`} />
            ) : (
              <rect className="plate" x={x - 13} y={y - 13} width="26" height="26" transform={`rotate(45 ${x} ${y})`} />
            )}
            <text className="base-label" x={b === 2 ? x + 24 : x} y={b === 2 ? y + 5 : y - 20} textAnchor={b === 2 ? "start" : "middle"}>
              {from === b ? "そのまま" : label}
            </text>
            {names.length > 0 && (
              <text className="base-names" x={x} y={y + 32} textAnchor="middle">
                {names.join("・")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className="runner-stepper">
      <ol className="stepper-chips">
        {rows.map((f, i) => (
          <li key={f}>
            <button className="chip done" onClick={() => setStep(i)}>
              <span>{BASE_NAME[f]}</span>
              <b>{nameOf(idOf(f))}</b>
              <small>
                {DEST_LABEL(f, moveOf(f).to)}
                {moveOf(f).force ? "（フォース）" : ""}
              </small>
            </button>
          </li>
        ))}
      </ol>
      {done && field}
      {done && <p className="muted small">直すときは上の名前を押してください。</p>}

      {!done && (
        <div className="sheet-backdrop runner-popup" role="dialog" aria-modal="true" aria-label={`${BASE_NAME[from!]}の動き`}>
          <div className="sheet">
            <header className="sheet-header">
              <div>
                <p className="eyebrow">
                  {step + 1} / {rows.length}　{BASE_NAME[from!]}
                </p>
                <h2>
                  {nameOf(idOf(from!))}はどこまで進んだ？
                </h2>
              </div>
              <button className="icon-button" onClick={() => setStep(rows.length)} aria-label="閉じる">
                ✕
              </button>
            </header>
            <p className="muted small">{from === 0 ? "ベースをタップしてください。" : "ベースをタップしてください。元の塁（点線）をタップすると「そのまま」です。"}</p>
            {field}
            <div className="stepper-actions">
              {from === 0 ? (
                <button className="danger-soft" onClick={() => choose("out")}>
                  アウト
                </button>
              ) : (
                <>
                  <button className="danger-soft" onClick={() => choose("out", false)}>
                    アウト（タッチ等）
                  </button>
                  <button className="danger-soft" onClick={() => choose("out", true)}>
                    フォースアウト
                  </button>
                </>
              )}
              <button className="primary-button" onClick={() => setStep((s) => s + 1)}>
                このまま（{DEST_LABEL(from!, moveOf(from!).to)}）
              </button>
            </div>
            {step > 0 && (
              <button className="link-button" onClick={() => setStep((s) => s - 1)}>
                ← ひとつ前（{BASE_NAME[rows[step - 1]]}）に戻る
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
