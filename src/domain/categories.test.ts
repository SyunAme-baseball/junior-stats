import { describe, expect, it } from "vitest";
import { eligiblePlayers, normalizeTeam, promoteGrades } from "./categories";
import type { TeamProfile } from "./types";

const team: TeamProfile = {
  id: "t",
  name: "フェニックス",
  players: [
    { id: "a", name: "六年A", grade: 6 },
    { id: "b", name: "五年B", grade: 5 },
    { id: "c", name: "四年C", grade: 4 },
    { id: "d", name: "卒団D", grade: 7 },
    { id: "e", name: "未設定E" },
  ],
  createdAt: 0,
  updatedAt: 0,
};

describe("カテゴリーと学年", () => {
  it("カテゴリーの学年の選手だけを選べる（学年未設定は残す、卒団は除く）", () => {
    expect(eligiblePlayers(team.players, "6年生").map((p) => p.id)).toEqual(["a", "e"]);
    expect(eligiblePlayers(team.players, "5年生").map((p) => p.id)).toEqual(["b", "e"]);
  });

  it("下の学年も含めると、上の学年の試合に下級生を出せる", () => {
    expect(eligiblePlayers(team.players, "6年生", true).map((p) => p.id)).toEqual(["a", "b", "c", "e"]);
  });

  it("新年度で学年が上がり、6年生は卒団になる", () => {
    const next = promoteGrades(team);
    expect(next.players.map((p) => p.grade)).toEqual([7, 6, 5, 7, undefined]);
  });

  it("旧形式のチーム（6年生チーム）は、選手に学年を付けて移行する", () => {
    const old = { ...team, grade: "6年生", season: "2026", players: [{ id: "x", name: "X", number: "10" }] };
    const t = normalizeTeam(old);
    expect(t.players).toEqual([{ id: "x", name: "X", grade: 6 }]);
  });
});
