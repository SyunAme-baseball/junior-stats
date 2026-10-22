import { describe, expect, it } from "vitest";
import { eligiblePlayers, normalizeTeam, promoteGrades, teamGamePlayers } from "./categories";
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

describe("登録チームで試合をするときの選手", () => {
  it("学年に関係なくチームの今いる選手全員。カテゴリーの学年が先、あとは学年の高い順", () => {
    const players = [
      { id: "g3", name: "3年", grade: 3 },
      { id: "g6", name: "6年", grade: 6 },
      { id: "g5", name: "5年", grade: 5 },
      { id: "g4", name: "4年", grade: 4 },
      { id: "out", name: "退団", grade: 5, left: true },
      { id: "grad", name: "卒団", grade: 7 },
      { id: "guest", name: "他チーム", guest: true },
    ];
    expect(teamGamePlayers(players, "5年生").map((p) => p.id)).toEqual(["g5", "g6", "g4", "g3", "guest"]);
    expect(teamGamePlayers(players, "6年生").map((p) => p.id)).toEqual(["g6", "g5", "g4", "g3", "guest"]);
  });
});
