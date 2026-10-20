// 球数制限：同じ日の試合をまたいで、投手ごとの球数を合計する。

import { replay } from "./engine";
import type { Game } from "./types";

/** 学童野球（全日本軟式野球連盟）の1日の球数制限。大会規定に合わせて試合ごとに変えられる */
export const DEFAULT_PITCH_LIMIT = 70;

export const limitOf = (game: Game) => game.pitchLimit ?? DEFAULT_PITCH_LIMIT;

/** 同じ日付の「ほかの試合」で投げた球数（選手IDごと） */
export function pitchesEarlierToday(games: Game[], current: Game): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of games) {
    if (g.id === current.id || !g.date || g.date !== current.date) continue;
    for (const [id, p] of Object.entries(replay(g).pitching)) out[id] = (out[id] ?? 0) + p.pitches;
  }
  return out;
}

export type PitchLevel = "ok" | "near" | "over";

/** 制限の10球前から注意、制限に達したら警告 */
export function pitchLevel(total: number, limit: number): PitchLevel {
  if (!limit) return "ok";
  if (total >= limit) return "over";
  if (total >= limit - 10) return "near";
  return "ok";
}
