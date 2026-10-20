import { describe, expect, it } from "vitest";
import { battingAverage, inningsPitched, pitcherOf, replay, validateMoves } from "./engine";
import { defaultMoves } from "./results";
import type { Bases, Game, Play, Position, ResultCode, RunnerMove, Side, SubstitutionPlay } from "./types";

function makeGame(innings = 3): Game {
  const team = (side: Side) => {
    const roster = Array.from({ length: 9 }, (_, i) => ({ id: `${side[0]}${i + 1}`, name: `${side}${i + 1}` }));
    // 打順 = 守備位置番号（1番がピッチャー…）
    return { id: side, name: side, roster, lineup: roster.map((p) => p.id), positions: [1, 2, 3, 4, 5, 6, 7, 8, 9] as Position[] };
  };
  return { id: "g", version: 2, date: "", tournament: "", scheduledInnings: innings, teams: { away: team("away"), home: team("home") }, plays: [], createdAt: 0, updatedAt: 0 };
}

let seq = 0;
/** 現在の状況から打席結果を追加する（moves 省略時は初期値） */
function pa(game: Game, result: ResultCode, moves?: RunnerMove[], extra: Partial<Play> = {}): Game {
  const s = replay(game);
  const play = {
    id: `p${seq++}`,
    type: "pa",
    result,
    batterId: s.currentBatterId!,
    moves: moves ?? defaultMoves(result, s.bases, s.outs),
    createdAt: 0,
    ...extra,
  } as Play;
  return { ...game, plays: [...game.plays, play] };
}
function runner(game: Game, result: ResultCode, moves?: RunnerMove[]): Game {
  const s = replay(game);
  const play: Play = { id: `p${seq++}`, type: "runner", result, moves: moves ?? defaultMoves(result, s.bases, s.outs), createdAt: 0 };
  return { ...game, plays: [...game.plays, play] };
}
const repeat = (g: Game, n: number, r: ResultCode) => Array.from({ length: n }).reduce<Game>((acc) => pa(acc, r), g);

describe("基本の進行", () => {
  it("3アウトで攻守交代し、走者がリセットされる", () => {
    let g = pa(makeGame(), "single");
    g = repeat(g, 3, "strikeout");
    const s = replay(g);
    expect(s.half).toBe("bottom");
    expect(s.outs).toBe(0);
    expect(s.bases).toEqual([null, null, null]);
    expect(s.offense).toBe("home");
    expect(s.currentBatterId).toBe("h1");
  });

  it("打順が一巡すると1番に戻り、次の回は続きの打者から始まる", () => {
    let g = makeGame();
    // 1回表：9人がシングル→…ではなく、3アウトまでに 10 人目まで回す
    g = repeat(g, 3, "walk"); // 満塁
    g = repeat(g, 6, "single"); // 6点
    g = repeat(g, 1, "single"); // 10人目 = 1番打者
    let s = replay(g);
    expect(g.plays[9].type === "pa" && g.plays[9].batterId).toBe("a1");
    expect(s.currentBatterId).toBe("a2");
    g = repeat(g, 3, "strikeout"); // a2,a3,a4 で3アウト
    g = repeat(g, 3, "strikeout"); // 1回裏
    s = replay(g);
    expect(s.inning).toBe(2);
    expect(s.currentBatterId).toBe("a5");
  });
});

describe("押し出し", () => {
  it("満塁の四球で1点、打点1、三塁走者に得点", () => {
    let g = repeat(makeGame(), 3, "walk");
    g = pa(g, "walk");
    const s = replay(g);
    expect(s.runs.away).toBe(1);
    expect(s.bases).toEqual(["a4", "a3", "a2"]);
    expect(s.stats.a4.rbi).toBe(1);
    expect(s.stats.a1.r).toBe(1);
    expect(s.stats.a4.ab).toBe(0);
    expect(s.stats.a4.pa).toBe(1);
  });

  it("一・三塁の四球では三塁走者は進まない", () => {
    let g = pa(makeGame(), "triple");
    g = pa(g, "walk");
    g = pa(g, "walk");
    const s = replay(g);
    expect(s.bases).toEqual(["a3", "a2", "a1"]);
    expect(s.runs.away).toBe(0);
  });
});

describe("犠牲フライ", () => {
  it("三塁走者がホームインし打点1、打数に数えない", () => {
    let g = pa(makeGame(), "triple");
    g = pa(g, "sac_fly");
    const s = replay(g);
    expect(s.runs.away).toBe(1);
    expect(s.outs).toBe(1);
    expect(s.stats.a2).toMatchObject({ pa: 1, ab: 0, sf: 1, rbi: 1 });
  });

  it("2アウトからの犠飛は成立せず、得点も入らない", () => {
    let g = pa(makeGame(), "triple");
    g = repeat(g, 2, "strikeout");
    g = pa(g, "sac_fly", [{ from: 0, to: "out" }, { from: 3, to: 4 }]);
    const s = replay(g);
    expect(s.runs.away).toBe(0);
    expect(s.half).toBe("bottom");
    expect(s.stats.a4).toMatchObject({ ab: 1, sf: 0 });
  });
});

describe("併殺", () => {
  it("一塁走者と打者がアウトで2アウト増える、打点なし", () => {
    let g = pa(makeGame(), "single");
    g = pa(g, "double_play");
    const s = replay(g);
    expect(s.outs).toBe(2);
    expect(s.bases).toEqual([null, null, null]);
    expect(s.stats.a2.ab).toBe(1);
  });

  it("1アウトから併殺で3アウト、三塁走者のホームインは得点にならない", () => {
    let g = pa(makeGame(), "triple");
    g = pa(g, "single", [{ from: 0, to: 1 }, { from: 3, to: 3 }]);
    g = pa(g, "strikeout");
    g = pa(g, "double_play", [{ from: 0, to: "out" }, { from: 1, to: "out", force: true }, { from: 3, to: 4 }]);
    const s = replay(g);
    expect(s.runs.away).toBe(0);
    expect(s.half).toBe("bottom");
    expect(s.outcomes[3].notCounted).toEqual(["a1"]);
  });

  it("0アウトの併殺の間の得点は認められるが打点はつかない", () => {
    let g = pa(makeGame(), "triple");
    g = pa(g, "single", [{ from: 0, to: 1 }, { from: 3, to: 3 }]);
    g = pa(g, "double_play", [{ from: 0, to: "out" }, { from: 1, to: "out", force: true }, { from: 3, to: 4 }]);
    const s = replay(g);
    expect(s.runs.away).toBe(1);
    expect(s.outs).toBe(2);
    expect(s.stats.a3.rbi).toBe(0);
  });
});

describe("第3アウトと得点", () => {
  it("打者が一塁到達前に第3アウト → 得点なし", () => {
    let g = pa(makeGame(), "triple");
    g = repeat(g, 2, "strikeout");
    g = pa(g, "go_ss", [{ from: 0, to: "out" }, { from: 3, to: 4 }]);
    expect(replay(g).runs.away).toBe(0);
  });

  it("フォースアウトが第3アウト → 得点なし", () => {
    let g = repeat(makeGame(), 3, "walk");
    g = repeat(g, 2, "strikeout");
    g = pa(g, "fielders_choice", [{ from: 0, to: 1 }, { from: 1, to: "out", force: true }, { from: 2, to: 3 }, { from: 3, to: 4 }]);
    expect(replay(g).runs.away).toBe(0);
  });

  it("タッチアウトが第3アウトで、先にホームインしていれば得点（既定）", () => {
    let g = pa(makeGame(), "double");
    g = repeat(g, 2, "strikeout");
    g = pa(g, "single", [{ from: 0, to: "out" }, { from: 2, to: 4 }]);
    // バッターがアウト = 一塁到達前とみなすので得点なし
    expect(replay(g).runs.away).toBe(0);

    let g2 = pa(makeGame(), "double");
    g2 = repeat(g2, 2, "strikeout");
    g2 = pa(g2, "single", [{ from: 0, to: 1 }, { from: 2, to: 4 }]);
    g2 = pa(g2, "single", [{ from: 0, to: 1 }, { from: 1, to: "out" }]);
    expect(replay(g2).runs.away).toBe(1);
  });

  it("タイミングで得点を認めない設定にできる", () => {
    let g = pa(makeGame(), "double");
    g = pa(g, "single", [{ from: 0, to: 1 }, { from: 2, to: 2 }]);
    g = repeat(g, 2, "strikeout");
    g = pa(g, "single", [{ from: 0, to: 1 }, { from: 1, to: "out" }, { from: 2, to: 4 }], { runsCountOverride: false });
    expect(replay(g).runs.away).toBe(0);
  });
});

describe("安打と成績", () => {
  it("ホームランで走者全員と打者が得点、打点は得点数", () => {
    let g = pa(makeGame(), "single");
    g = pa(g, "home_run");
    const s = replay(g);
    expect(s.runs.away).toBe(2);
    expect(s.stats.a2).toMatchObject({ h: 1, hr: 1, rbi: 2, r: 1 });
    expect(s.hits.away).toBe(2);
  });

  it("打席数と打数を区別し、打率は安打÷打数", () => {
    let g = pa(makeGame(), "single"); // a1
    g = repeat(g, 8, "strikeout"); // ... a9 まで（3アウトずつ交代）
    const s = replay(g);
    expect(s.stats.a1).toMatchObject({ pa: 1, ab: 1, h: 1 });
    expect(battingAverage(s.stats.a1)).toBe("1.000");
    expect(battingAverage({ h: 1, ab: 3 })).toBe(".333");
    expect(battingAverage({ h: 0, ab: 0 })).toBe("—");
  });

  it("エラー出塁は安打にも打点にもならず、守備側の失策に数える", () => {
    let g = pa(makeGame(), "triple");
    g = pa(g, "error", [{ from: 0, to: 1 }, { from: 3, to: 4 }]);
    const s = replay(g);
    expect(s.runs.away).toBe(1);
    expect(s.stats.a2).toMatchObject({ h: 0, ab: 1, rbi: 0 });
    expect(s.errors.home).toBe(1);
  });

  it("盗塁は打席にならず、打順は進まない", () => {
    let g = pa(makeGame(), "single");
    g = runner(g, "stolen_base");
    const s = replay(g);
    expect(s.bases).toEqual([null, "a1", null]);
    expect(s.stats.a1.sb).toBe(1);
    expect(s.currentBatterId).toBe("a2");
  });
});

describe("試合終了", () => {
  const halfInning = (g: Game) => repeat(g, 3, "strikeout");

  it("最終回表終了でホームがリードしていれば裏は行わない", () => {
    let g = makeGame(1);
    g = halfInning(g);
    g = pa(g, "home_run");
    g = halfInning(g);
    // 1回裏を終えるには1回だけなので、2回制で確認
    let g2 = makeGame(2);
    g2 = halfInning(g2);
    g2 = pa(g2, "home_run");
    g2 = halfInning(g2);
    g2 = halfInning(g2); // 2回表
    const s = replay(g2);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe("home");
    expect(s.lineScore.home[1]).toBeUndefined(); // X 表示
  });

  it("サヨナラ：勝ち越した時点で終了し、必要な点数だけ数える", () => {
    let g = makeGame(1);
    g = pa(g, "home_run"); // 表 1点
    g = halfInning(g);
    g = repeat(g, 3, "walk"); // 裏 満塁
    g = pa(g, "double"); // 2点で勝ち越し（三塁・二塁走者）→ 一塁走者の得点は数えない
    const s = replay(g);
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe("walkoff");
    expect(s.runs.home).toBe(2);
    expect(s.winner).toBe("home");
  });

  it("サヨナラ本塁打は全員の得点を数える", () => {
    let g = makeGame(1);
    g = halfInning(g);
    g = repeat(g, 3, "walk");
    g = pa(g, "home_run");
    expect(replay(g).runs.home).toBe(4);
  });

  it("同点なら延長戦に入る", () => {
    let g = makeGame(1);
    g = halfInning(g);
    g = halfInning(g);
    const s = replay(g);
    expect(s.finished).toBe(false);
    expect(s.inning).toBe(2);
  });

  it("試合終了（コールド）の後のプレーは集計しない", () => {
    let g = pa(makeGame(), "home_run");
    g = { ...g, plays: [...g.plays, { id: "end", type: "end", reason: "called", createdAt: 0 }] };
    g = pa({ ...g }, "home_run" as ResultCode, [{ from: 0, to: 4 }]);
    const s = replay(g);
    expect(s.finished).toBe(true);
    expect(s.runs.away).toBe(1);
    expect(s.outcomes[2].ignored).toBe(true);
  });
});

describe("取り消しと修正", () => {
  it("途中のプレーを削除すると、得点・走者・アウト・打順がすべて再計算される", () => {
    let g = pa(makeGame(), "single"); // a1
    g = pa(g, "strikeout"); // a2
    g = pa(g, "home_run"); // a3 2点
    const before = replay(g);
    expect(before.runs.away).toBe(2);
    const removed = { ...g, plays: g.plays.filter((_, i) => i !== 1) };
    const s = replay(removed);
    expect(s.runs.away).toBe(2);
    expect(s.outs).toBe(0);
    expect(s.stats.a2.pa).toBe(0);
    // 打者は記録された選手のまま：a3 の次の a4
    expect(s.currentBatterId).toBe("a4");
  });
});

describe("代打・代走", () => {
  it("代打は打順の枠に入り、代走は塁上の走者と入れ替わる", () => {
    let g = makeGame();
    g.teams.away.roster.push({ id: "x", name: "代打" }, { id: "y", name: "代走" });
    g = { ...g, plays: [{ id: "s1", type: "sub", side: "away", kind: "pinch_hitter", outPlayerId: "a1", inPlayerId: "x", createdAt: 0 }] };
    g = pa(g, "single");
    let s = replay(g);
    expect(s.bases[0]).toBe("x");
    g = { ...g, plays: [...g.plays, { id: "s2", type: "sub", side: "away", kind: "pinch_runner", outPlayerId: "x", inPlayerId: "y", base: 1, createdAt: 0 }] };
    g = pa(g, "home_run");
    s = replay(g);
    expect(s.stats.y.r).toBe(1);
    expect(s.stats.x.r).toBe(0);
    expect(s.lineups.away[0]).toBe("y");
  });
});

describe("入力チェック", () => {
  const bases: Bases = ["a1", null, null];
  it("同じ塁に2人いる動きはエラー", () => {
    expect(validateMoves([{ from: 0, to: 1 }, { from: 1, to: 1 }], bases, true)).toContain("1塁に2人の走者がいます");
  });
  it("走者のいない塁からの動きはエラー", () => {
    expect(validateMoves([{ from: 0, to: 1 }, { from: 2, to: 3 }], bases, true).length).toBeGreaterThan(0);
  });
});

const sub = (g: Game, p: Omit<SubstitutionPlay, "id" | "type" | "createdAt">): Game => ({
  ...g,
  plays: [...g.plays, { id: `s${seq++}`, type: "sub", createdAt: 0, ...p }],
});

describe("投手成績", () => {
  it("被安打・与四死球・奪三振・投球回・失点を、そのとき投げていた投手に付ける", () => {
    let g = pa(makeGame(), "single");
    g = pa(g, "walk");
    g = pa(g, "hbp");
    g = pa(g, "home_run");
    g = repeat(g, 3, "strikeout");
    const s = replay(g);
    // 1回表はホームの投手（h1）が投げる
    expect(s.pitching.h1).toMatchObject({ bf: 7, h: 2, hr: 1, bb: 1, hbp: 1, so: 3, outs: 3, r: 4 });
    expect(inningsPitched(s.pitching.h1.outs)).toBe("1");
    expect(inningsPitched(7)).toBe("2 1/3");
    expect(s.pitching.a1).toBeUndefined();
  });

  it("盗塁死・併殺のアウトも投球回に入る", () => {
    let g = pa(makeGame(), "single");
    g = runner(g, "caught_stealing");
    g = pa(g, "single");
    g = pa(g, "double_play");
    const s = replay(g);
    expect(s.pitching.h1.outs).toBe(3);
    expect(s.half).toBe("bottom");
  });

  it("ピッチャー交代後は、新しい投手に記録が付く", () => {
    let g = makeGame();
    g.teams.home.roster.push({ id: "hp2", name: "二番手" });
    g = pa(g, "strikeout");
    g = sub(g, { side: "home", kind: "defense", outPlayerId: "h1", inPlayerId: "hp2", position: 1 });
    g = pa(g, "single");
    const s = replay(g);
    expect(s.pitching.h1).toMatchObject({ bf: 1, so: 1, outs: 1 });
    expect(s.pitching.hp2).toMatchObject({ bf: 1, h: 1 });
    expect(s.pitcherOrder.home).toEqual(["h1", "hp2"]);
    // 交代した投手は1番打者の枠を引き継ぐ
    expect(s.lineups.home[0]).toBe("hp2");
  });

  it("野手とピッチャーの入れ替え（守備位置の変更）", () => {
    let g = makeGame();
    g = sub(g, { side: "home", kind: "position", inPlayerId: "h6", position: 1 });
    g = sub(g, { side: "home", kind: "position", inPlayerId: "h1", position: 6 });
    g = pa(g, "walk");
    const s = replay(g);
    expect(pitcherOf(s, "home")).toBe("h6");
    expect(s.positions.home[0]).toBe(6);
    expect(s.pitching.h6.bb).toBe(1);
  });
});

describe("守備交代", () => {
  it("代打の選手は守備位置なしになり、守備交代で守備につける", () => {
    let g = makeGame();
    g.teams.away.roster.push({ id: "x", name: "代打" }, { id: "z", name: "守備固め" });
    g = sub(g, { side: "away", kind: "pinch_hitter", outPlayerId: "a7", inPlayerId: "x" });
    let s = replay(g);
    expect(s.positions.away[6]).toBeNull();
    g = sub(g, { side: "away", kind: "defense", outPlayerId: "x", inPlayerId: "z", position: 7 });
    s = replay(g);
    expect(s.lineups.away[6]).toBe("z");
    expect(s.stats.x).toBeDefined();
    expect(s.positions.away[6]).toBe(7);
    expect(s.positionHistory.z).toEqual([7]);
  });

  it("投手に代打を出すと、守備交代するまで投手がいない（成績は誰にも付かない）", () => {
    let g = makeGame();
    g.teams.home.roster.push({ id: "x", name: "代打" });
    g = repeat(g, 3, "strikeout");
    g = sub(g, { side: "home", kind: "pinch_hitter", outPlayerId: "h1", inPlayerId: "x" });
    g = pa(g, "strikeout");
    g = repeat(g, 2, "strikeout");
    expect(pitcherOf(replay(g), "home")).toBeNull();
    g = sub(g, { side: "home", kind: "position", inPlayerId: "x", position: 1 });
    g = pa(g, "walk");
    expect(replay(g).pitching.x.bb).toBe(1);
  });
});

describe("勝利投手・敗戦投手", () => {
  const half = (g: Game) => repeat(g, 3, "strikeout");

  it("最後にリードを奪ったときの投手が勝ち、その走者を出した投手が負け", () => {
    let g = makeGame(1);
    g = pa(g, "home_run"); // 表：away 1点（home投手 h1 が被弾）
    g = half(g);
    g = half(g); // 裏：無得点で試合終了
    const s = replay(g);
    expect(s.finished).toBe(true);
    expect(s.decisions).toMatchObject({ win: "a1", loss: "h1" });
  });

  it("前の投手が出した走者がかえった失点は、前の投手に付く", () => {
    let g = makeGame();
    g.teams.home.roster.push({ id: "hp2", name: "二番手" });
    g = pa(g, "walk"); // a1 出塁（h1 の責任）
    g = sub(g, { side: "home", kind: "defense", outPlayerId: "h1", inPlayerId: "hp2", position: 1 });
    g = pa(g, "home_run"); // a1 と a2 がかえる
    const s = replay(g);
    expect(s.pitching.h1.r).toBe(1);
    expect(s.pitching.hp2.r).toBe(1);
  });

  it("先発が規定の回を投げずに降板したら、勝ち投手は救援投手", () => {
    let g = makeGame(3); // 規定：ceil(3*0.6)=2回
    g.teams.away.roster.push({ id: "ap2", name: "救援" });
    g = pa(g, "home_run"); // 1回表 away 先制
    g = half(g);
    g = half(g); // 1回裏：a1 が1回投げる
    g = sub(g, { side: "away", kind: "defense", outPlayerId: "a1", inPlayerId: "ap2", position: 1 });
    g = half(g);
    g = half(g); // 2回裏：ap2
    g = half(g);
    g = half(g); // 3回裏：ap2 → 試合終了 1-0
    const s = replay(g);
    expect(s.winner).toBe("away");
    expect(s.decisions?.win).toBe("ap2");
    expect(s.decisions?.loss).toBe("h1");
  });

  it("逆転された投手には勝ちが付かない（最後のリードで決まる）", () => {
    let g = makeGame(2);
    g = pa(g, "home_run"); // 1表 away 1-0
    g = half(g);
    g = repeat(g, 1, "single");
    g = pa(g, "home_run"); // 1裏 home 2-1（a1 から）
    g = half(g);
    g = half(g); // 2表 無得点 → 2裏は行わず終了
    const s = replay(g);
    expect(s.winner).toBe("home");
    expect(s.decisions).toMatchObject({ win: "h1", loss: "a1" });
  });

  it("手動で勝ち投手を変えられる", () => {
    let g = makeGame(1);
    g = pa(g, "home_run");
    g = half(g);
    g = half(g);
    g = { ...g, pitcherDecisions: { win: "a2" } };
    expect(replay(g).decisions).toMatchObject({ win: "a2", autoWin: "a1" });
  });
});

describe("盗塁", () => {
  it("盗塁死は走者の盗塁死として記録され、アウトが増える", () => {
    let g = pa(makeGame(), "single");
    g = runner(g, "caught_stealing");
    const s = replay(g);
    expect(s.stats.a1).toMatchObject({ sb: 0, cs: 1 });
    expect(s.outs).toBe(1);
  });
});

describe("1球ごとの記録と球数", () => {
  const pitchP = (g: Game, pitch: "ball" | "called_strike" | "swinging_strike" | "foul"): Game => ({
    ...g,
    plays: [...g.plays, { id: `q${seq++}`, type: "pitch", pitch, createdAt: 0 }],
  });

  it("ボール・ストライク・ファウルでカウントが進み、打席が終わるとリセットされる", () => {
    let g = pitchP(makeGame(), "ball");
    g = pitchP(g, "called_strike");
    g = pitchP(g, "foul");
    g = pitchP(g, "foul"); // 2ストライク後のファウルはカウントが増えない
    let s = replay(g);
    expect(s.count).toEqual({ balls: 1, strikes: 2 });
    g = pa(g, "single");
    s = replay(g);
    expect(s.count).toEqual({ balls: 0, strikes: 0 });
    expect(s.outcomes[4].countBefore).toEqual({ balls: 1, strikes: 2 });
    // 4球 + 打った1球 = 5球
    expect(s.pitching.h1).toMatchObject({ pitches: 5, balls: 1, strikes: 4 });
  });

  it("四球・三振・死球も最後の1球を球数に数える。盗塁などは数えない", () => {
    let g = makeGame();
    for (let i = 0; i < 3; i++) g = pitchP(g, "ball");
    g = pa(g, "walk"); // 4球
    g = runner(g, "stolen_base");
    g = pitchP(g, "swinging_strike");
    g = pitchP(g, "swinging_strike");
    g = pa(g, "strikeout"); // 3球
    g = pa(g, "hbp"); // 1球
    const s = replay(g);
    expect(s.pitching.h1).toMatchObject({ pitches: 8, balls: 4, so: 1, bb: 1, hbp: 1 });
  });

  it("3アウトで交代するとカウントはリセット", () => {
    let g = pa(makeGame(), "single");
    g = repeat(g, 2, "strikeout");
    g = pitchP(g, "ball");
    g = runner(g, "pickoff");
    const s = replay(g);
    expect(s.half).toBe("bottom");
    expect(s.count).toEqual({ balls: 0, strikes: 0 });
    // 次の回は同じ打者（a4）から
    expect(s.battingIndex.away).toBe(3);
  });
});

describe("牽制死", () => {
  it("走者の牽制死と、投手の牽制アウトとして記録する", () => {
    let g = pa(makeGame(), "single");
    g = runner(g, "pickoff");
    const s = replay(g);
    expect(s.stats.a1).toMatchObject({ po: 1, cs: 0 });
    expect(s.pitching.h1).toMatchObject({ pk: 1, outs: 1 });
  });
});

describe("ファウルフライ", () => {
  it("打数1・アウト1・球数1で、走者は動かない", () => {
    let g = pa(makeGame(), "single");
    g = pa(g, "foul_out", undefined, { direction: "c" } as Partial<Play>);
    const s = replay(g);
    expect(s.outs).toBe(1);
    expect(s.bases[0]).not.toBeNull();
    const batter = g.plays[1].type === "pa" ? g.plays[1].batterId : "";
    expect(s.stats[batter].ab).toBe(1);
    expect(s.stats[batter].h).toBe(0);
  });
});

describe("走者の追い越し", () => {
  const bases: [string, null, null] = ["r1", null, null];
  it("一塁走者そのままでバッターが二塁へはエラー", () => {
    expect(validateMoves([{ from: 0, to: 2 }, { from: 1, to: 1 }], bases, true).join()).toContain("バッターが一塁走者を追い越しています");
  });
  it("一塁走者が三塁・ホームならOK、前の走者がアウトならOK", () => {
    expect(validateMoves([{ from: 0, to: 2 }, { from: 1, to: 3 }], bases, true)).toEqual([]);
    expect(validateMoves([{ from: 0, to: 2 }, { from: 1, to: 4 }], bases, true)).toEqual([]);
    expect(validateMoves([{ from: 0, to: 2 }, { from: 1, to: "out" }], bases, true)).toEqual([]);
  });
  it("ホームランで走者がホームに帰らないのもエラー", () => {
    expect(validateMoves([{ from: 0, to: 4 }, { from: 1, to: 3 }], bases, true).length).toBeGreaterThan(0);
  });
});

describe("ワンヒットワンエラー", () => {
  it("単打のまま安打1・失策1、バッターは二塁", () => {
    const g = pa(makeGame(), "single", [{ from: 0, to: 2 }], { direction: "rf", fielder: 9, errorType: "throwing", throwTo: 2 } as Partial<Play>);
    const s = replay(g);
    expect(s.hits.away).toBe(1);
    expect(s.errors.home).toBe(1);
    expect(s.bases[1]).not.toBeNull();
    const id = g.plays[0].type === "pa" ? g.plays[0].batterId : "";
    expect(s.stats[id].h).toBe(1);
    expect(s.stats[id].b2).toBe(0);
  });
});

describe("DH制（打順に入らないピッチャー）", () => {
  const dhGame = () => {
    const g = makeGame();
    // 後攻：1番は指名打者、ピッチャー hp は打順に入らない
    g.teams.home.roster.push({ id: "hp", name: "投手" }, { id: "hp2", name: "二番手" }, { id: "x", name: "代打" });
    g.teams.home.positions = [null, 2, 3, 4, 5, 6, 7, 8, 9];
    g.teams.home.pitcherId = "hp";
    return g;
  };

  it("打順に入らないピッチャーに投手成績が付き、打者成績は付かない", () => {
    let g = pa(dhGame(), "strikeout");
    const s = replay(g);
    expect(pitcherOf(s, "home")).toBe("hp");
    expect(s.pitching.hp).toMatchObject({ bf: 1, so: 1 });
    expect(s.stats.hp).toBeUndefined();
    expect(s.dhSlot.home).toBe(0);
    expect(s.positionHistory.hp).toEqual([1]);
    g = pa(g, "walk");
    expect(replay(g).pitching.hp.bb).toBe(1);
  });

  it("ピッチャー交代しても打順は変わらず、指名打者に代打を出しても指名打者のまま", () => {
    let g = dhGame();
    g = sub(g, { side: "home", kind: "defense", outPlayerId: "hp", inPlayerId: "hp2", position: 1 });
    g = sub(g, { side: "home", kind: "pinch_hitter", outPlayerId: "h1", inPlayerId: "x" });
    g = pa(g, "single");
    const s = replay(g);
    expect(pitcherOf(s, "home")).toBe("hp2");
    expect(s.pitching.hp2.h).toBe(1);
    expect(s.lineups.home).not.toContain("hp2");
    expect(s.lineups.home[0]).toBe("x");
    expect(s.dhSlot.home).toBe(0);
  });

  it("打順の選手がピッチャーになると、打順に入らないピッチャーは退く", () => {
    let g = dhGame();
    g = sub(g, { side: "home", kind: "position", inPlayerId: "h6", position: 1 });
    g = pa(g, "walk");
    const s = replay(g);
    expect(pitcherOf(s, "home")).toBe("h6");
    expect(s.dhPitcher.home).toBeNull();
    expect(s.pitching.h6.bb).toBe(1);
  });
});
