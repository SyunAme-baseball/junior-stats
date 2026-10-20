import { describe, expect, it } from "vitest";
import { isRosterPayload, makeRosterPayload, planRosterImport } from "./share";
import type { Player, TeamProfile } from "./types";

const team = (id: string, players: Player[], extra: Partial<TeamProfile> = {}): TeamProfile => ({ id, name: id, players, createdAt: 0, updatedAt: 0, ...extra });

describe("名簿の共有", () => {
  it("名簿の共有データには試合を入れず、打順・背番号の履歴も送らない", () => {
    const p = makeRosterPayload([{ id: "a", name: "山田", grade: 6 }], [team("t", [{ id: "a", name: "山田" }], { lastNumbers: { a: "10" } })]);
    expect(p.games).toEqual([]);
    expect(p.teams[0].lastNumbers).toBeUndefined();
    expect(isRosterPayload(p)).toBe(true);
  });

  it("空の端末にはそのまま入り、チームも登録される", () => {
    const incoming = [{ id: "a", name: "山田", grade: 6 }, { id: "b", name: "佐藤", grade: 5 }];
    const r = planRosterImport([], [], incoming, [team("t", incoming)]);
    expect(r.added).toBe(2);
    expect(r.roster.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.teamsAdded).toBe(1);
    expect(r.teams[0].players.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("同じIDは送り主の学年に合わせ、同じ名前の別IDは同じ人として扱う", () => {
    const local: Player[] = [{ id: "a", name: "山田", grade: 5 }, { id: "x", name: "佐藤 一郎", grade: 5 }];
    const incoming = [{ id: "a", name: "山田", grade: 6 }, { id: "b", name: "佐藤一郎", grade: 5 }, { id: "c", name: "鈴木", grade: 4 }];
    const r = planRosterImport(local, [team("t", [{ id: "a", name: "山田" }])], incoming, [team("t", incoming), team("u", [incoming[1]])]);
    expect(r.updated).toBe(1);
    expect(r.matched).toBe(1);
    expect(r.added).toBe(1);
    expect(r.roster.find((p) => p.id === "a")?.grade).toBe(6);
    // 既にあるチームには足りない選手を足す（佐藤は端末側のIDに付け替え）
    expect(r.teams.find((t) => t.id === "t")?.players.map((p) => p.id)).toEqual(["a", "x", "c"]);
    expect(r.teams.find((t) => t.id === "u")?.players.map((p) => p.id)).toEqual(["x"]);
    expect(r.teamsAdded).toBe(1);
  });
});
