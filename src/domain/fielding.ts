// エラー・野手選択のときの「守備の流れ」（誰が捕って、どこへ投げ、誰がどんなエラーをしたか）

import { directionDef } from "./directions";
import { POSITION_LABELS } from "./positions";
import type { BattedKind, BattingPlay, Direction, ErrorType, Position } from "./types";

export const BATTED_LABELS: Record<BattedKind, string> = { grounder: "ゴロ", fly: "フライ", liner: "ライナー" };

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  fielding: "打球を捕れなかった",
  throwing: "悪送球",
  receiving: "送球を捕れなかった",
};

export const THROW_LABELS: Record<1 | 2 | 3 | 4, string> = { 1: "一塁", 2: "二塁", 3: "三塁", 4: "本塁" };

/** 打球の方向から、打球を捕った守備位置の初期値を決める（間の打球は決めない） */
export function fielderFromDirection(direction: Direction | undefined): Position | undefined {
  const id = directionDef(direction)?.id;
  const map: Partial<Record<string, Position>> = { p: 1, c: 2, "1b": 3, "2b": 4, "3b": 5, ss: 6, lf: 7, lf_line: 7, cf: 8, rf: 9, rf_line: 9 };
  return id ? map[id] : undefined;
}

/**
 * 守備の流れを文章にする。例：「セカンドゴロ、本塁へ送球、キャッチャーが送球を捕れなかった」
 * 何も記録されていなければ null。
 */
export function fieldingText(p: Pick<BattingPlay, "batted" | "fieldedBy" | "throwTo" | "fielder" | "errorType">): string | null {
  const parts: string[] = [];
  if (p.fieldedBy) parts.push(p.batted ? `${POSITION_LABELS[p.fieldedBy]}${BATTED_LABELS[p.batted]}` : `${POSITION_LABELS[p.fieldedBy]}が捕球`);
  else if (p.batted) parts.push(BATTED_LABELS[p.batted]);
  if (p.throwTo) parts.push(`${THROW_LABELS[p.throwTo]}へ送球`);
  if (p.fielder) {
    const who = POSITION_LABELS[p.fielder];
    if (p.errorType === "throwing") parts.push(`${who}が悪送球`);
    else if (p.errorType === "receiving") parts.push(`${who}が送球を捕れずエラー`);
    else if (p.errorType === "fielding") parts.push(`${who}が打球を捕れずエラー`);
    else parts.push(`${who}のエラー`);
  }
  return parts.length ? parts.join("、") : null;
}
