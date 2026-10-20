// 「サンプルを入れて試す」用のデータ。実在のチーム・選手ではありません。

import { replay } from "./domain/engine";
import { newId } from "./domain/id";
import { defaultMoves, RESULTS } from "./domain/results";
import type { Game, PitchKind, Play, Position, ResultCode, TeamProfile } from "./domain/types";

const NAMES = ["山田", "佐藤", "鈴木", "田中", "高橋", "伊藤", "渡辺", "中村", "小林", "加藤", "吉田"];
const POS: Position[] = [8, 4, 6, 1, 2, 3, 5, 7, 9];

type Step = ResultCode | PitchKind | "end";

// 1イニングずつ（表・裏）。打席の前の球は ball / called_strike などで入れる
const SCRIPT: Step[][] = [
  ["ball", "called_strike", "single", "stolen_base", "go_2b", "single", "strikeout", "fo_cf"],
  ["ball", "ball", "walk", "pickoff", "swinging_strike", "go_ss", "fo_lf"],
  ["double", "sac_bunt", "sac_fly", "strikeout"],
  ["single", "home_run", "go_3b", "strikeout", "fo_rf"],
  ["go_ss", "walk", "triple", "single", "double_play"],
  ["strikeout", "go_1b", "fo_cf"],
  ["single", "stolen_base", "single", "go_p", "fo_lf", "strikeout"],
  ["walk", "caught_stealing", "single", "strikeout", "go_2b"],
  ["home_run", "go_ss", "strikeout", "fo_rf"],
  ["single", "single", "walk", "strikeout", "double_play"],
];

const FILLER: PitchKind[][] = [
  ["called_strike", "ball"],
  ["ball", "foul", "swinging_strike"],
  ["called_strike"],
  ["ball", "ball", "foul"],
  ["foul", "ball"],
];

export function makeDemo(): { team: TeamProfile; game: Game } {
  const season = new Date().getFullYear().toString();
  // 名簿は名前と学年だけ。背番号は試合ごとに入れる（ここでは試合の名簿にだけ付ける）
  // 6年生11人・5年生3人（5年生は「6年生」の試合には出ない）
  const players = [...NAMES.map((name) => ({ id: newId(), name, grade: 6 })), ...["木村", "林", "清水"].map((name) => ({ id: newId(), name, grade: 5 }))];
  const sixth = players.filter((p) => p.grade === 6);
  const gameRoster = sixth.map((p, i) => ({ id: p.id, name: p.name, number: String(i + 1) }));
  const team: TeamProfile = {
    id: newId(),
    name: "サンプル少年団",
    players,
    maxGrade: 6,
    lastNumbers: Object.fromEntries(gameRoster.map((p) => [p.id, p.number])),
    lastLineups: { "6年生": gameRoster.slice(0, 9).map((p, i) => ({ playerId: p.id, position: POS[i] })) },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const opp = Array.from({ length: 9 }, (_, i) => ({ id: newId(), name: `相手${i + 1}` }));
  let game: Game = {
    id: newId(),
    version: 2,
    season,
    category: "6年生",
    date: new Date().toISOString().slice(0, 10),
    tournament: "サンプル試合（練習試合）",
    scheduledInnings: 5,
    pitchLimit: 70,
    teams: {
      away: { id: team.id, name: team.name, roster: gameRoster, lineup: gameRoster.slice(0, 9).map((p) => p.id), positions: POS },
      home: { id: newId(), name: "みどりジュニア", roster: opp, lineup: opp.map((p) => p.id), positions: POS },
    },
    plays: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const push = (play: Play) => {
    game = { ...game, plays: [...game.plays, play] };
  };
  let paCount = 0;
  for (const half of SCRIPT) {
    for (const step of half) {
      const s = replay(game);
      if (s.finished) break;
      if (step === "ball" || step === "called_strike" || step === "swinging_strike" || step === "foul") {
        push({ id: newId(), type: "pitch", pitch: step, createdAt: Date.now() });
        continue;
      }
      if (step === "end") continue;
      // 投手の指標（ストライク率）が見えるよう、打席の前に何球か入れておく
      if (RESULTS[step].pa && s.count.balls === 0 && s.count.strikes === 0) {
        for (const pitch of FILLER[paCount++ % FILLER.length]) push({ id: newId(), type: "pitch", pitch, createdAt: Date.now() });
      }
      const moves = defaultMoves(step, s.bases, s.outs);
      if (RESULTS[step].pa) push({ id: newId(), type: "pa", result: step, batterId: s.currentBatterId!, moves, createdAt: Date.now() });
      else push({ id: newId(), type: "runner", result: step, moves, createdAt: Date.now() });
    }
  }
  return { team, game };
}
