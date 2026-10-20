import { useState } from "react";
import { directionDef } from "../domain/directions";
import { availability, RESULTS } from "../domain/results";
import type { BattedKind, Bases, Direction, ResultCode } from "../domain/types";
import { FieldPicker } from "./FieldPicker";

export type BallKind = "hit" | "grounder" | "fly" | "liner";

export const BALL_KIND_LABELS: Record<BallKind, string> = { hit: "ヒット", grounder: "ゴロ", fly: "フライ", liner: "ライナー" };

/** 打球が「アウト」だったとき、打球の種類と位置から結果を決める */
export function outResult(kind: Exclude<BallKind, "hit">, direction: Direction): ResultCode {
  const d = directionDef(direction);
  const id = d?.id;
  if (kind === "liner") return "line_out";
  if (kind === "grounder") {
    const map: Record<string, ResultCode> = { p: "go_p", c: "go_c", "1b": "go_1b", "1b2b": "go_2b", "2b": "go_2b", mid: "go_ss", ss: "go_ss", ss3b: "go_ss", "3b": "go_3b" };
    return (id && map[id]) || "other_out";
  }
  if (d?.zone === "infield") return "fo_if";
  if (id === "lf" || id === "lf_line") return "fo_lf";
  if (id === "rf" || id === "rf_line") return "fo_rf";
  return "fo_cf";
}

type Choice = { label: string; sub?: string; code: ResultCode | "out" };

const CHOICES: Record<BallKind, Choice[]> = {
  hit: [
    { label: "単打", sub: "シングルヒット", code: "single" },
    { label: "二塁打", code: "double" },
    { label: "三塁打", code: "triple" },
    { label: "本塁打", sub: "ホームラン", code: "home_run" },
    { label: "内野安打", code: "infield_single" },
  ],
  grounder: [
    { label: "アウト", code: "out" },
    { label: "併殺", sub: "ダブルプレー", code: "double_play" },
    { label: "犠打", sub: "送りバント", code: "sac_bunt" },
    { label: "野手選択", sub: "バッターは出塁", code: "fielders_choice" },
    { label: "エラー", sub: "バッターは出塁", code: "error" },
  ],
  fly: [
    { label: "アウト", code: "out" },
    { label: "犠牲フライ", code: "sac_fly" },
    { label: "エラー", sub: "バッターは出塁", code: "error" },
  ],
  liner: [
    { label: "アウト", code: "out" },
    { label: "併殺", sub: "ダブルプレー", code: "double_play" },
    { label: "エラー", sub: "バッターは出塁", code: "error" },
  ],
};

type Props = {
  kind: BallKind;
  batter: string;
  bases: Bases;
  outs: number;
  onDone: (result: ResultCode, direction: Direction | undefined, batted: BattedKind | undefined) => void;
  onClose: () => void;
};

/**
 * 打球の入力：①結果（ヒットなら塁打数）→ ②打球の方向 の順にポップアップで選ぶ。
 * 選び終わると、走者の動きを確かめる確認画面へ進む。
 */
export function BattedBallDialog({ kind, batter, bases, outs, onDone, onClose }: Props) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const isOut = choice?.code === "out";

  const finish = (d: Direction | undefined) => {
    if (!choice) return;
    const code = choice.code === "out" ? outResult(kind as Exclude<BallKind, "hit">, d!) : choice.code;
    onDone(code, d, kind === "hit" ? undefined : kind);
  };

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={`${BALL_KIND_LABELS[kind]}の入力`}>
      <div className="sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">
              {batter}・{BALL_KIND_LABELS[kind]}
              {choice && `・${choice.label}`}
            </p>
            <h2>{!choice ? (kind === "hit" ? "何塁打？" : "結果は？") : "打球が飛んだ方向は？"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>

        {!choice ? (
          <div className="option-grid choice-grid">
            {CHOICES[kind].map((c) => {
              const why = c.code === "out" ? null : availability(c.code, bases, outs);
              return (
                <button key={c.label} className="option" disabled={!!why} title={c.code === "out" ? undefined : RESULTS[c.code].help} onClick={() => setChoice(c)}>
                  {c.label}
                  {(why ?? c.sub) && <small>{why ?? c.sub}</small>}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            {/* 位置をタップしたらそのまま確認画面へ進む */}
            <FieldPicker value={undefined} onChange={(d) => d && finish(d)} hint={isOut ? "捕った場所をタップ" : "打球が飛んだ場所をタップ"} />
            <div className="sheet-actions">
              <button className="secondary-button" onClick={() => setChoice(null)}>
                ← 戻る
              </button>
              {!isOut && (
                <button className="secondary-button" onClick={() => finish(undefined)}>
                  方向なしで進む
                </button>
              )}
            </div>
            {isOut && <p className="muted small">アウトは、捕った守備位置を決めるために方向が必要です。</p>}
          </>
        )}
      </div>
    </div>
  );
}
