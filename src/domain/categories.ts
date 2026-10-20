// 試合のカテゴリー（6年生・5年生…）と、名簿の学年による選手の絞り込み。

import type { Player, TeamProfile } from "./types";

export type Category = { id: string; grades: number[] };

export const CATEGORIES: Category[] = [
  { id: "6年生", grades: [6] },
  { id: "5年生", grades: [5] },
  { id: "4年生", grades: [4] },
  { id: "3年生以下", grades: [1, 2, 3] },
  { id: "全学年", grades: [1, 2, 3, 4, 5, 6] },
];

export const GRADUATED = 7;
export const GRADES = [1, 2, 3, 4, 5, 6];

export const gradeLabel = (g?: number) => (g === undefined ? "学年未設定" : g >= GRADUATED ? "卒団" : `${g}年`);

/**
 * そのカテゴリーの試合に出られる選手。
 * includeLower のときは下の学年の選手も含める（下級生が上の学年の試合に出る場合）。
 * 学年未設定の選手は除外しない（登録漏れで選べなくなるのを防ぐ）。
 */
export function eligiblePlayers(players: Player[], categoryId: string, includeLower = false): Player[] {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return players.filter((p) => !p.left && (p.grade ?? 0) < GRADUATED);
  const max = Math.max(...cat.grades);
  return players.filter((p) => {
    if (p.left) return false;
    if (p.grade === undefined) return true;
    if (p.grade >= GRADUATED) return false;
    return cat.grades.includes(p.grade) || (includeLower && p.grade < max);
  });
}

/** 新年度：全員の学年を1つ上げる（6年生は卒団） */
export function promoteGrades(team: TeamProfile): TeamProfile {
  return {
    ...team,
    players: team.players.map((p) => (p.grade === undefined || p.grade >= GRADUATED ? p : { ...p, grade: p.grade + 1 })),
    updatedAt: Date.now(),
  };
}

/** 旧形式（シーズン×学年ごとのチーム）を名簿形式にそろえる */
export function normalizeTeam(team: TeamProfile): TeamProfile {
  const legacyGrade = team.grade?.match(/([1-6])年/)?.[1];
  const players = team.players.map(({ number: _n, ...p }) => (p.grade === undefined && legacyGrade ? { ...p, grade: Number(legacyGrade) } : p));
  const lastLineups = team.lastLineups ?? (team.lastLineup && legacyGrade ? { [`${legacyGrade}年生`]: team.lastLineup } : undefined);
  return { ...team, players, lastLineups };
}
