import { describe, expect, it } from "vitest";
import { planTitle, remapPlan, type LineupPlan } from "./plan";
import { isPlanPayload, isRosterPayload, makePlanPayload } from "./share";
import type { TeamProfile } from "./types";

const plan: LineupPlan = {
  id: "plan1",
  date: "2026-10-26",
  season: "2026",
  category: "6年生",
  includeLower: false,
  tournament: "市民大会",
  innings: 6,
  pitchLimit: 70,
  timeLimit: 90,
  teams: {
    away: { kind: "profile", teamId: "t6", rows: [{ playerId: "a", number: "1", position: 1 }], benchNumbers: { b: "10" }, pitcherId: "b" },
    home: { kind: "manual", name: "みどりジュニア", rows: [{ name: "相手1", position: 1 }] },
  },
  createdAt: 0,
  updatedAt: 0,
};
const team: TeamProfile = { id: "t6", name: "6年生チーム", players: [{ id: "a", name: "山田" }, { id: "b", name: "佐藤" }], lastNumbers: { a: "1" }, createdAt: 0, updatedAt: 0 };

describe("メンバー表", () => {
  it("一覧の名前は日付・大会・対戦カード", () => {
    expect(planTitle(plan, [team])).toBe("10/26 市民大会 6年生チーム 対 みどりジュニア");
  });

  it("共有データには、メンバー表に出てくるチームとその選手だけを入れる", () => {
    const other: TeamProfile = { ...team, id: "t4", name: "4年生チーム", players: [{ id: "z", name: "鈴木" }] };
    const p = makePlanPayload(plan, [team, other], [{ id: "a", name: "山田", grade: 6 }, { id: "b", name: "佐藤", grade: 6 }, { id: "z", name: "鈴木", grade: 4 }]);
    expect(p.teams.map((t) => t.id)).toEqual(["t6"]);
    expect(p.teams[0].lastNumbers).toBeUndefined();
    expect(p.roster?.map((x) => x.id)).toEqual(["a", "b"]);
    expect(isPlanPayload(p)).toBe(true);
    expect(isRosterPayload(p)).toBe(false);
  });

  it("取り込み先の選手IDに付け替える（打順・控えの背番号・DHの投手）", () => {
    const m = remapPlan(plan, new Map([["a", "A"], ["b", "B"]]));
    const away = m.teams.away;
    if (away.kind !== "profile") throw new Error();
    expect(away.rows[0].playerId).toBe("A");
    expect(away.benchNumbers).toEqual({ B: "10" });
    expect(away.pitcherId).toBe("B");
    expect(m.teams.home).toEqual(plan.teams.home);
  });
});
