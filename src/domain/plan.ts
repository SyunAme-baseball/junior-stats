// メンバー表（予定の試合）：試合を始める前のスタメン・ベンチ入りを保存し、ほかの人に渡す。
// 中身は試合作成画面の入力そのもの。読み込むと試合作成画面がその状態で開く。

import type { Position, Side, TeamProfile } from "./types";

/** その場で入力するチーム（相手チームなど）。position が null の打者は指名打者（指）。bench の行は控え選手。dhPitcher は打順に入らないピッチャー */
export type ManualRow = { name: string; position: Position | null; bench?: boolean; dhPitcher?: boolean };
export type ManualForm = { kind: "manual"; name: string; rows: ManualRow[] };

/** 登録チーム：打順は名簿から選び、背番号は試合ごとに入れる。控えは背番号を入れた選手だけが出場する */
export type ProfileRow = { playerId: string; number: string; position: Position | null };
export type ProfileForm = { kind: "profile"; teamId: string; rows: ProfileRow[]; benchNumbers: Record<string, string>; pitcherId?: string };

export type TeamForm = ManualForm | ProfileForm;

export type LineupPlan = {
  id: string;
  date: string;
  season: string;
  category: string;
  includeLower: boolean;
  tournament: string;
  innings: number;
  pitchLimit: number;
  timeLimit: number;
  teams: Record<Side, TeamForm>;
  createdAt: number;
  updatedAt: number;
};

export function formTeamName(form: TeamForm, profiles: Pick<TeamProfile, "id" | "name">[]): string {
  if (form.kind === "manual") return form.name.trim() || "（チーム名なし）";
  return profiles.find((t) => t.id === form.teamId)?.name || "（登録チーム）";
}

/** 一覧に出す名前（例：10/26 市民大会 Aチーム 対 Bチーム） */
export function planTitle(plan: LineupPlan, profiles: Pick<TeamProfile, "id" | "name">[]): string {
  const d = plan.date ? `${Number(plan.date.slice(5, 7))}/${Number(plan.date.slice(8, 10))}` : "";
  return [d, plan.tournament.trim(), `${formTeamName(plan.teams.away, profiles)} 対 ${formTeamName(plan.teams.home, profiles)}`].filter(Boolean).join(" ");
}

/** メンバー表に出てくる登録チームのID */
export function planTeamIds(plan: LineupPlan): string[] {
  return (["away", "home"] as const).map((s) => plan.teams[s]).flatMap((f) => (f.kind === "profile" ? [f.teamId] : []));
}

/** 取り込み先の端末の選手IDに付け替える */
export function remapPlan(plan: LineupPlan, idMap: Map<string, string>): LineupPlan {
  const m = (id: string) => idMap.get(id) ?? id;
  const fix = (f: TeamForm): TeamForm =>
    f.kind === "manual"
      ? f
      : {
          ...f,
          rows: f.rows.map((r) => ({ ...r, playerId: r.playerId ? m(r.playerId) : r.playerId })),
          benchNumbers: Object.fromEntries(Object.entries(f.benchNumbers).map(([id, n]) => [m(id), n])),
          pitcherId: f.pitcherId ? m(f.pitcherId) : undefined,
        };
  return { ...plan, teams: { away: fix(plan.teams.away), home: fix(plan.teams.home) } };
}
