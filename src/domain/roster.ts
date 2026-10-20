// 名簿：クラブ全体の選手を1か所で管理する（追加・退団・進学・卒団）。
// チームは名簿から選手を選んで作り、名前と学年はいつも名簿のものを使う。

import { CATEGORIES, GRADUATED } from "./categories";
import type { Player, TeamProfile } from "./types";

/** 今いる選手（退団・卒団していない） */
export const isActive = (p: Player) => !p.left && (p.grade === undefined || p.grade < GRADUATED);

/** 名簿の並び順：学年の高い順、同じ学年は名簿に入れた順（学年未設定は最後） */
export function sortRoster(players: Player[]): Player[] {
  return [...players].sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));
}

/** 「4年生チーム」を作るときに並べる選手：今いる4年生以下（学年未設定も含める） */
export function teamCandidates(roster: Player[], maxGrade: number): Player[] {
  return sortRoster(roster.filter((p) => isActive(p) && (p.grade === undefined || p.grade <= maxGrade)));
}

export const teamGradeLabel = (maxGrade?: number) =>
  maxGrade === undefined ? "" : maxGrade <= 1 ? "1年生" : `${maxGrade}年生以下`;

/** チームの学年から、試合のカテゴリーの初期値を決める */
export function categoryForGrade(maxGrade?: number): string | undefined {
  if (maxGrade === undefined) return undefined;
  const id = maxGrade <= 3 ? "3年生以下" : `${maxGrade}年生`;
  return CATEGORIES.some((c) => c.id === id) ? id : undefined;
}

/** チームの選手の名前・学年・退団を名簿にそろえる（名簿にいない選手はそのまま） */
export function syncTeam(team: TeamProfile, roster: Player[]): TeamProfile {
  const byId = new Map(roster.map((p) => [p.id, p]));
  let changed = false;
  const players = team.players.map((p) => {
    const r = byId.get(p.id);
    if (!r || (r.name === p.name && r.grade === p.grade && !!r.left === !!p.left)) return p;
    changed = true;
    return { id: p.id, name: r.name, grade: r.grade, ...(r.left ? { left: true } : {}) };
  });
  return changed ? { ...team, players } : team;
}

/** チームの選手のうち名簿にいない人を名簿に加える（旧データの移行・取り込み・試合中の追加） */
export function mergeIntoRoster(roster: Player[], players: Player[]): Player[] {
  const ids = new Set(roster.map((p) => p.id));
  // 他チームの選手（合同チーム）は名簿に入れない
  const added = players.filter((p) => !p.guest && !ids.has(p.id) && p.name.trim()).map(({ id, name, grade, left }) => ({ id, name, grade, ...(left ? { left } : {}) }));
  return added.length ? [...roster, ...added] : roster;
}

/** 新年度：今いる選手の学年を1つ上げる（6年生は卒団） */
export function promoteRoster(roster: Player[]): Player[] {
  return roster.map((p) => (p.left || p.grade === undefined || p.grade >= GRADUATED ? p : { ...p, grade: p.grade + 1 }));
}

/** 選手名の表示。他チームの選手は所属チームを添える（例：佐々木（みどりジュニア）） */
export const playerLabel = (p: Player) => (p.guest && p.fromTeam ? `${p.name}（${p.fromTeam}）` : p.name);
