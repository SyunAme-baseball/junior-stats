import { describe, expect, it } from "vitest";
import { categoryForGrade, isActive, mergeIntoRoster, promoteRoster, syncTeam, teamCandidates } from "./roster";
import { eligiblePlayers } from "./categories";
import type { Player, TeamProfile } from "./types";

const roster: Player[] = [
  { id: "a", name: "山田", grade: 6 },
  { id: "b", name: "佐藤", grade: 4 },
  { id: "c", name: "鈴木", grade: 3 },
  { id: "d", name: "田中", grade: 4, left: true },
  { id: "e", name: "高橋", grade: 7 },
  { id: "f", name: "伊藤" },
];

describe("名簿", () => {
  it("4年生のチームには、今いる4年生以下（学年未設定を含む）が学年の高い順に並ぶ", () => {
    expect(teamCandidates(roster, 4).map((p) => p.id)).toEqual(["b", "c", "f"]);
  });

  it("退団・卒団は今いる選手に入らない", () => {
    expect(roster.filter(isActive).map((p) => p.id)).toEqual(["a", "b", "c", "f"]);
  });

  it("進学で今いる選手の学年が1つ上がり、6年生は卒団。退団者はそのまま", () => {
    const next = promoteRoster(roster);
    expect(next.find((p) => p.id === "a")?.grade).toBe(7);
    expect(next.find((p) => p.id === "b")?.grade).toBe(5);
    expect(next.find((p) => p.id === "d")?.grade).toBe(4);
    expect(next.find((p) => p.id === "f")?.grade).toBeUndefined();
  });

  it("チームの選手の名前と学年は名簿にそろう", () => {
    const team: TeamProfile = { id: "t", name: "4年", players: [{ id: "b", name: "さとう", grade: 3 }], createdAt: 0, updatedAt: 0 };
    expect(syncTeam(team, roster).players[0]).toEqual({ id: "b", name: "佐藤", grade: 4 });
  });

  it("名簿にいない選手だけを名簿に加える", () => {
    const merged = mergeIntoRoster(roster, [{ id: "a", name: "山田", grade: 6 }, { id: "z", name: "新人", grade: 2, number: "10" }]);
    expect(merged).toHaveLength(roster.length + 1);
    expect(merged.at(-1)).toEqual({ id: "z", name: "新人", grade: 2 });
  });

  it("合同チームの他チームの選手は名簿に入れない", () => {
    const merged = mergeIntoRoster(roster, [{ id: "g", name: "佐々木", guest: true, fromTeam: "みどりジュニア" }]);
    expect(merged).toBe(roster);
  });

  it("他チームの選手は学年に関係なく試合で選べる", () => {
    const players: Player[] = [{ id: "g", name: "佐々木", guest: true, grade: 5 }, { id: "b", name: "佐藤", grade: 5 }];
    expect(eligiblePlayers(players, "4年生").map((p) => p.id)).toEqual(["g"]);
  });

  it("チームの学年から試合のカテゴリーを決める", () => {
    expect(categoryForGrade(4)).toBe("4年生");
    expect(categoryForGrade(2)).toBe("3年生以下");
    expect(categoryForGrade(undefined)).toBeUndefined();
  });
});
