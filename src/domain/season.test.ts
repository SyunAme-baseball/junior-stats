import { describe, expect, it } from "vitest";
import { defaultMoves } from "./results";
import { replay } from "./engine";
import { onBasePct, summarizePlayer, summarizeSeason, winningPct } from "./season";
import type { Game, Play, Position, ResultCode, TeamProfile } from "./types";

const players = Array.from({ length: 9 }, (_, i) => ({ id: `p${i + 1}`, name: `選手${i + 1}` }));
const profile: TeamProfile = { id: "my", season: "2026", name: "フェニックス", grade: "6年生", players, createdAt: 0, updatedAt: 0 };

function game(id: string, mySide: "away" | "home"): Game {
  const mine = { id: "my", name: "フェニックス", roster: players, lineup: players.map((p) => p.id), positions: [1, 2, 3, 4, 5, 6, 7, 8, 9] as Position[] };
  const oppPlayers = players.map((p) => ({ ...p, id: `${id}-o${p.id}` }));
  const opp = { id: `opp-${id}`, name: "相手", roster: oppPlayers, lineup: oppPlayers.map((p) => p.id), positions: [1, 2, 3, 4, 5, 6, 7, 8, 9] as Position[] };
  return {
    id, version: 2, season: "2026", date: `2026-05-0${id.length}`, tournament: "", scheduledInnings: 1,
    teams: mySide === "away" ? { away: mine, home: opp } : { away: opp, home: mine },
    plays: [], createdAt: 0, updatedAt: 0,
  };
}

let n = 0;
function add(g: Game, result: ResultCode, type: "pa" | "runner" = "pa"): Game {
  const s = replay(g);
  const base = { id: `x${n++}`, result, moves: defaultMoves(result, s.bases, s.outs), createdAt: 0 };
  const play = (type === "pa" ? { ...base, type, batterId: s.currentBatterId! } : { ...base, type }) as Play;
  return { ...g, plays: [...g.plays, play] };
}
const k3 = (g: Game) => add(add(add(g, "strikeout"), "strikeout"), "strikeout");

describe("シーズン通算", () => {
  it("同じ登録チームの試合を合計し、勝敗と投手の勝ち負けを数える", () => {
    // 試合1：先攻で1点取って勝ち（p1 本塁打、p1 は投手）
    let g1 = add(game("a", "away"), "home_run");
    g1 = k3(k3(g1));
    // 試合2：後攻で0-1の負け。p1 が出塁→盗塁
    let g2 = add(game("bb", "home"), "home_run");
    g2 = k3(g2);
    g2 = add(g2, "single");
    g2 = add(g2, "stolen_base", "runner");
    g2 = k3(g2);

    const sum = summarizeSeason(profile, [g1, g2]);
    expect(sum.record).toEqual({ win: 1, loss: 1, draw: 0 });
    expect(winningPct(sum.record.win, sum.record.loss)).toBe(".500");
    const p1 = sum.batting.find((b) => b.playerId === "p1")!;
    expect(p1).toMatchObject({ games: 2, pa: 2, h: 2, hr: 1, sb: 1 });
    const pit = sum.pitching.find((p) => p.playerId === "p1")!;
    expect(pit).toMatchObject({ games: 2, w: 1, l: 1, outs: 6 });
    expect(sum.totals).toMatchObject({ runs: 1, allowed: 1, sb: 1 });
  });
});

describe("個人総合成績", () => {
  it("別のチーム・カテゴリーの試合も、同じ選手IDなら合計する", () => {
    // 試合1：6年生カテゴリー（フェニックス）で p1 が本塁打
    let g1 = add({ ...game("a", "away"), category: "6年生" }, "home_run");
    g1 = k3(k3(g1));
    // 試合2：5年生カテゴリーの別チームで p1 が四球
    const g2base = game("bb", "away");
    g2base.teams.away = { ...g2base.teams.away, id: "my5", name: "フェニックス5年" };
    let g2 = add({ ...g2base, category: "5年生" }, "walk");
    g2 = k3(k3(g2));
    const sum = summarizePlayer("p1", [g1, g2]);
    expect(sum.total.batting).toMatchObject({ games: 2, pa: 2, ab: 1, h: 1, hr: 1, bb: 1 });
    expect(onBasePct(sum.total.batting!)).toBe("1.000");
    expect(sum.byCategory.map((l) => l.label)).toEqual(["6年生", "5年生"]);
    expect(sum.byTeam.map((l) => l.label)).toEqual(["フェニックス", "フェニックス5年"]);
    // p1 は両方の試合で投手（試合2は0-0の引き分け）
    expect(sum.total.pitching).toMatchObject({ games: 2, w: 1 });
  });

  it("出塁率と、チームの長打・失策の合計", () => {
    expect(onBasePct({ h: 3, ab: 10, bb: 1, hbp: 1, sf: 0 })).toBe(".417");
    expect(onBasePct({ h: 0, ab: 0, bb: 0, hbp: 0, sf: 0 })).toBe("—");
    let g = add(game("a", "away"), "double");
    g = add(g, "home_run");
    g = k3(g);
    // 1回裏：相手の打者がエラーで出塁＝守っているこちらの失策
    g = add(g, "error");
    g = k3(g);
    const sum = summarizeSeason(profile, [g]);
    expect(sum.totals).toMatchObject({ xbh: 2, hr: 1, errors: 1 });
    const opp = summarizeSeason({ ...profile, id: "opp-a" }, [g]);
    expect(opp.totals.errors).toBe(0);
  });
});
