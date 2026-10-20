import { describe, expect, it } from "vitest";
import { replay } from "./engine";
import { decodePayload, encodePayload, makePayload, remapTeam } from "./share";
import type { Game, Position, TeamProfile } from "./types";

const mine: TeamProfile = {
  id: "my",
  season: "2026",
  name: "フェニックス",
  grade: "6年生",
  players: [
    { id: "m1", name: "山田" },
    { id: "m2", name: "佐藤" },
  ],
  createdAt: 0,
  updatedAt: 0,
};

/** 別の保護者が「その場で入力」したチームで記録した試合 */
const theirs: Game = {
  id: "g1",
  version: 2,
  date: "2026-06-01",
  tournament: "",
  scheduledInnings: 7,
  teams: {
    away: { id: "x", name: "フェニックス", roster: [{ id: "x1", name: "山田くん" }, { id: "x2", name: "佐藤" }, { id: "x3", name: "新人" }], lineup: ["x1", "x2", "x3"], positions: [1, 2, 3] as Position[] },
    home: { id: "o", name: "相手", roster: [{ id: "o1", name: "A" }], lineup: ["o1"], positions: [1] as Position[] },
  },
  plays: [{ id: "p1", type: "pa", result: "home_run", batterId: "x1", moves: [{ from: 0, to: 4 }], createdAt: 0 }],
  createdAt: 0,
  updatedAt: 0,
};

describe("共有", () => {
  it("圧縮したリンク用の文字列から元に戻せる", async () => {
    const payload = makePayload([theirs], [mine]);
    const text = await encodePayload(payload);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePayload(text)).toEqual(payload);
  });

  it("他人が入力した試合を、名前で自分の登録チームの選手に付け替える", () => {
    const { game, newPlayers } = remapTeam(theirs, "x", mine);
    expect(game.teams.away.id).toBe("my");
    expect(game.teams.away.lineup).toEqual(["m1", "m2", "x3"]);
    expect(newPlayers.map((p) => p.name)).toEqual(["新人"]);
    const s = replay(game);
    expect(s.stats.m1.hr).toBe(1);
  });
});
