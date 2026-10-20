import type { Position } from "./types";

export const POSITIONS: Position[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const POSITION_LABELS: Record<Position, string> = {
  1: "ピッチャー",
  2: "キャッチャー",
  3: "ファースト",
  4: "セカンド",
  5: "サード",
  6: "ショート",
  7: "レフト",
  8: "センター",
  9: "ライト",
};

/** スコアブックでよく使う1文字表記（表の中だけで使う） */
export const POSITION_SHORT: Record<Position, string> = {
  1: "投",
  2: "捕",
  3: "一",
  4: "二",
  5: "三",
  6: "遊",
  7: "左",
  8: "中",
  9: "右",
};

/** 同じ守備位置に2人以上いないか、ピッチャーがいるかを調べる */
export function positionProblems(positions: (Position | null)[]): string[] {
  const problems: string[] = [];
  for (const p of POSITIONS) {
    const n = positions.filter((x) => x === p).length;
    if (n > 1) problems.push(`${POSITION_LABELS[p]}が${n}人います`);
  }
  if (!positions.includes(1)) problems.push("ピッチャーがいません（投手成績を集計できません）");
  return problems;
}
