// ルールエンジン：プレー履歴（正本）から試合状況と成績をすべて再計算する。
// 取り消し・修正はプレー履歴を書き換えて replay() し直すだけなので、常に整合する。

import { RESULTS } from "./results";
import type { Bases, Game, Half, Play, Position, RunnerMove, Side } from "./types";

export type PlayerStats = {
  playerId: string;
  side: Side;
  pa: number; // 打席
  ab: number; // 打数
  h: number;
  b1: number;
  b2: number;
  b3: number;
  hr: number;
  rbi: number;
  r: number;
  bb: number;
  hbp: number;
  so: number;
  sh: number;
  sf: number;
  sb: number;
  cs: number; // 盗塁死
  po: number; // 牽制死
};

export type PitcherStats = {
  playerId: string;
  side: Side;
  bf: number; // 対戦打者
  outs: number; // 取ったアウト数（投球回 = outs / 3）
  h: number; // 被安打
  hr: number; // 被本塁打
  bb: number; // 与四球
  hbp: number; // 与死球
  so: number; // 奪三振
  r: number; // 失点（その投手が出した走者がかえった数）
  pitches: number; // 球数
  strikes: number; // ストライク（ファウル・打球を含む）
  balls: number;
  pk: number; // 牽制でアウトにした数
};

export type Count = { balls: number; strikes: number };

export type PitcherDecisions = {
  win: string | null;
  loss: string | null;
  /** 自動判定の結果（手動で変えた場合の比較用） */
  autoWin: string | null;
  autoLoss: string | null;
};

export type EndReason = "regulation" | "walkoff" | "called" | "time" | "other";

export type PlayOutcome = {
  play: Play;
  index: number;
  inning: number;
  half: Half;
  offense: Side;
  outsBefore: number;
  basesBefore: Bases;
  outsAfter: number;
  batterId?: string;
  /** このプレーの前のボールカウント */
  countBefore: Count;
  /** そのとき投げていたピッチャー */
  pitcherId?: string;
  /** 得点が認められた走者 */
  scored: string[];
  /** ホームインしたが得点にならなかった走者（第3アウト・サヨナラ） */
  notCounted: string[];
  rbi: number;
  outsOnPlay: number;
  endsHalf: boolean;
  /** 試合終了後に記録されていて無視されたプレー */
  ignored: boolean;
  warnings: string[];
};

export type GameState = {
  inning: number;
  half: Half;
  offense: Side;
  outs: number;
  bases: Bases;
  /** 今の打者のボールカウント */
  count: Count;
  lineups: Record<Side, string[]>;
  /** 打順の枠ごとの今の守備位置（lineups と同じ並び） */
  positions: Record<Side, (Position | null)[]>;
  /** DH制で打順に入っていないピッチャー（いなければ null） */
  dhPitcher: Record<Side, string | null>;
  /** 指名打者の打順の枠（0始まり）。代打が出てもその枠は指名打者のまま */
  dhSlot: Record<Side, number | null>;
  battingIndex: Record<Side, number>;
  currentBatterId: string | null;
  nextBatterId: string | null;
  /** 次の次のバッター */
  nextNextBatterId: string | null;
  /** lineScore[side][inning-1]。null はまだ攻撃していない回 */
  lineScore: Record<Side, (number | null)[]>;
  runs: Record<Side, number>;
  hits: Record<Side, number>;
  errors: Record<Side, number>;
  finished: boolean;
  endReason?: EndReason;
  winner: Side | "draw" | null;
  outcomes: PlayOutcome[];
  stats: Record<string, PlayerStats>;
  pitching: Record<string, PitcherStats>;
  /** 選手ごとに守った位置の履歴（例：中→投） */
  positionHistory: Record<string, Position[]>;
  /** 勝利投手・敗戦投手（試合終了後のみ） */
  decisions: PitcherDecisions | null;
  /** 投手の登板順 */
  pitcherOrder: Record<Side, string[]>;
};

export const offenseOf = (half: Half): Side => (half === "top" ? "away" : "home");
export const other = (side: Side): Side => (side === "away" ? "home" : "away");

export function pitcherOf(s: Pick<GameState, "lineups" | "positions" | "dhPitcher">, side: Side): string | null {
  const i = s.positions[side].indexOf(1);
  return i >= 0 ? s.lineups[side][i] : (s.dhPitcher?.[side] ?? null);
}

function dhSlotOf(team: Game["teams"]["away"]): number | null {
  if (!team.pitcherId) return null;
  const i = team.lineup.findIndex((_, j) => (team.positions?.[j] ?? null) === null);
  return i >= 0 ? i : null;
}

export function inningsPitched(outs: number): string {
  const whole = Math.floor(outs / 3);
  const rest = outs % 3;
  return rest ? `${whole} ${rest}/3` : `${whole}`;
}

function emptyStats(playerId: string, side: Side): PlayerStats {
  return { playerId, side, pa: 0, ab: 0, h: 0, b1: 0, b2: 0, b3: 0, hr: 0, rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sh: 0, sf: 0, sb: 0, cs: 0, po: 0 };
}

/** 走者の動きの矛盾をチェックする（確認画面でも使う） */
export function validateMoves(moves: RunnerMove[], bases: Bases, isPa: boolean): string[] {
  const errors: string[] = [];
  const seen = new Set<number>();
  for (const m of moves) {
    if (seen.has(m.from)) errors.push("同じ走者に2つの動きが設定されています");
    seen.add(m.from);
    if (m.from > 0 && bases[m.from - 1] === null) errors.push(`${m.from}塁に走者がいません`);
    if (m.from > 0 && m.to !== "out" && m.to < m.from) errors.push("走者が前の塁に戻る動きは設定できません");
    if (m.from === 0 && !isPa) errors.push("打者の動きは打席の結果でのみ設定できます");
  }
  if (isPa && !moves.some((m) => m.from === 0)) errors.push("バッターの結果が設定されていません");
  const finals = new Map<number, number>();
  for (const b of [1, 2, 3] as const) {
    if (bases[b - 1] === null) continue;
    const m = moves.find((x) => x.from === b);
    const to = m ? m.to : b;
    if (to !== "out" && to !== 4) finals.set(to, (finals.get(to) ?? 0) + 1);
  }
  const bm = moves.find((x) => x.from === 0);
  if (bm && bm.to !== "out" && bm.to !== 4) finals.set(bm.to, (finals.get(bm.to) ?? 0) + 1);
  for (const [base, n] of finals) if (n > 1) errors.push(`${base}塁に2人の走者がいます`);

  // 追い越し：後ろの走者（バッターを含む）は、前の走者より先の塁に進めない。アウトになった走者は除く
  const RUNNER = ["バッター", "一塁走者", "二塁走者", "三塁走者"];
  const present = ([0, 1, 2, 3] as const).filter((f) => (f === 0 ? isPa : bases[f - 1] !== null));
  const toOf = (f: number) => {
    const m = moves.find((x) => x.from === f);
    return m ? m.to : f === 0 ? null : f;
  };
  for (const rear of present) {
    for (const front of present) {
      if (front <= rear) continue;
      const a = toOf(rear);
      const b = toOf(front);
      if (a === null || b === null || a === "out" || b === "out") continue;
      if (a > b) errors.push(`${RUNNER[rear]}が${RUNNER[front]}を追い越しています（${RUNNER[front]}の進んだ塁を確認してください）`);
    }
  }
  return errors;
}

export function replay(game: Game): GameState {
  const N = game.scheduledInnings;
  const sideOfPlayer = new Map<string, Side>();
  for (const side of ["away", "home"] as const) for (const p of game.teams[side].roster) sideOfPlayer.set(p.id, side);

  const s: GameState = {
    inning: 1,
    half: "top",
    offense: "away",
    outs: 0,
    bases: [null, null, null],
    count: { balls: 0, strikes: 0 },
    lineups: { away: [...game.teams.away.lineup], home: [...game.teams.home.lineup] },
    positions: {
      away: game.teams.away.lineup.map((_, i) => game.teams.away.positions?.[i] ?? null),
      home: game.teams.home.lineup.map((_, i) => game.teams.home.positions?.[i] ?? null),
    },
    dhPitcher: { away: game.teams.away.pitcherId ?? null, home: game.teams.home.pitcherId ?? null },
    dhSlot: { away: dhSlotOf(game.teams.away), home: dhSlotOf(game.teams.home) },
    battingIndex: { away: 0, home: 0 },
    currentBatterId: null,
    nextBatterId: null,
    nextNextBatterId: null,
    lineScore: { away: [0], home: [] },
    runs: { away: 0, home: 0 },
    hits: { away: 0, home: 0 },
    errors: { away: 0, home: 0 },
    finished: false,
    winner: null,
    outcomes: [],
    stats: {},
    pitching: {},
    positionHistory: {},
    pitcherOrder: { away: [], home: [] },
    decisions: null,
  };
  /** 走者を出した（責任のある）投手 */
  const responsible = new Map<string, string>();
  /** そのチームで最後に投げた投手（代打で退いた投手も含む「責任投手」） */
  const lastPitcher: Record<Side, string | null> = { away: null, home: null };
  /** 最後にリードを奪ったときの勝ち投手候補・負け投手候補 */
  const leadTaken: Record<Side, { win: string | null; loss: string | null } | null> = { away: null, home: null };

  const stat = (id: string): PlayerStats => {
    if (!s.stats[id]) s.stats[id] = emptyStats(id, sideOfPlayer.get(id) ?? s.offense);
    return s.stats[id];
  };
  for (const side of ["away", "home"] as const) for (const id of s.lineups[side]) stat(id);

  const assignPos = (id: string, pos: Position | null) => {
    if (pos === null) return;
    const h = (s.positionHistory[id] ??= []);
    if (h[h.length - 1] !== pos) h.push(pos);
  };
  for (const side of ["away", "home"] as const) {
    s.lineups[side].forEach((id, i) => assignPos(id, s.positions[side][i]));
    const dh = s.dhPitcher[side];
    if (dh) assignPos(dh, 1);
  }

  const pitch = (id: string, side: Side): PitcherStats => {
    if (!s.pitching[id]) {
      s.pitching[id] = { playerId: id, side, bf: 0, outs: 0, h: 0, hr: 0, bb: 0, hbp: 0, so: 0, r: 0, pitches: 0, strikes: 0, balls: 0, pk: 0 };
      s.pitcherOrder[side].push(id);
    }
    return s.pitching[id];
  };

  const finish = (reason: EndReason) => {
    s.finished = true;
    s.endReason = reason;
  };

  const endHalf = () => {
    s.outs = 0;
    s.count = { balls: 0, strikes: 0 };
    s.bases = [null, null, null];
    if (s.half === "top") {
      // 最終回の表が終わってホームがリードしていれば裏は行わない
      if (s.inning >= N && s.runs.home > s.runs.away) return finish("regulation");
      s.half = "bottom";
    } else {
      if (s.inning >= N && s.runs.home !== s.runs.away) return finish("regulation");
      s.inning += 1;
      s.half = "top";
    }
    s.offense = offenseOf(s.half);
    const ls = s.lineScore[s.offense];
    if (ls[s.inning - 1] == null) ls[s.inning - 1] = 0;
  };

  game.plays.forEach((play, index) => {
    const outcome: PlayOutcome = {
      play,
      index,
      inning: s.inning,
      half: s.half,
      offense: s.offense,
      outsBefore: s.outs,
      basesBefore: [...s.bases] as Bases,
      countBefore: { ...s.count },
      outsAfter: s.outs,
      scored: [],
      notCounted: [],
      rbi: 0,
      outsOnPlay: 0,
      endsHalf: false,
      ignored: false,
      warnings: [],
    };
    s.outcomes.push(outcome);

    if (s.finished) {
      outcome.ignored = true;
      outcome.warnings.push("試合終了後のプレーのため集計していません");
      return;
    }

    if (play.type === "pitch") {
      const defense = other(s.offense);
      const pid = pitcherOf(s, defense);
      outcome.pitcherId = pid ?? undefined;
      if (pid) {
        lastPitcher[defense] = pid;
        const ps = pitch(pid, defense);
        ps.pitches += 1;
        if (play.pitch === "ball") ps.balls += 1;
        else ps.strikes += 1;
      } else outcome.warnings.push("ピッチャーが決まっていないため、球数に入っていません");
      if (play.pitch === "ball") {
        if (s.count.balls >= 3) outcome.warnings.push("4球目のボールは「四球」として記録してください");
        else s.count.balls += 1;
      } else if (play.pitch === "foul") {
        if (s.count.strikes < 2) s.count.strikes += 1;
      } else if (s.count.strikes >= 2) outcome.warnings.push("3つ目のストライクは「三振」として記録してください");
      else s.count.strikes += 1;
      return;
    }

    if (play.type === "end") {
      finish(play.reason);
      return;
    }

    if (play.type === "sub") {
      const lineup = s.lineups[play.side];
      const positions = s.positions[play.side];
      // DH制で打順に入っていないピッチャーの交代
      if (play.outPlayerId && play.outPlayerId === s.dhPitcher[play.side] && !lineup.includes(play.outPlayerId)) {
        s.dhPitcher[play.side] = play.inPlayerId;
        assignPos(play.inPlayerId, 1);
        sideOfPlayer.set(play.inPlayerId, play.side);
        return;
      }
      // 打順の中の選手がピッチャーになったら、打順に入っていないピッチャーは退く
      if (play.position === 1) {
        s.dhPitcher[play.side] = null;
        s.dhSlot[play.side] = null;
      }
      if (play.kind === "position") {
        const i = lineup.indexOf(play.inPlayerId);
        if (i >= 0) {
          positions[i] = play.position ?? null;
          if (i === s.dhSlot[play.side] && positions[i] !== null) s.dhSlot[play.side] = null;
          assignPos(play.inPlayerId, positions[i]);
        }
        else outcome.warnings.push("守備位置を変える選手が打順にいません");
        return;
      }
      const i = play.outPlayerId ? lineup.indexOf(play.outPlayerId) : -1;
      if (i >= 0) {
        lineup[i] = play.inPlayerId;
        // 代打・代走はまだ守備位置が決まっていない（守備につくときに守備交代で設定する）
        if (play.position !== undefined) positions[i] = play.position;
        else if (play.kind !== "defense") positions[i] = null;
        if (i === s.dhSlot[play.side] && positions[i] !== null) s.dhSlot[play.side] = null;
        assignPos(play.inPlayerId, positions[i]);
      } else outcome.warnings.push("交代する選手が打順にいません");
      if (play.kind === "pinch_runner" && play.base) {
        if (s.bases[play.base - 1] === play.outPlayerId) {
          s.bases[play.base - 1] = play.inPlayerId;
          const r = responsible.get(play.outPlayerId!);
          if (r) responsible.set(play.inPlayerId, r);
        }
        else outcome.warnings.push("代走する塁にその選手がいません");
      }
      sideOfPlayer.set(play.inPlayerId, play.side);
      stat(play.inPlayerId);
      return;
    }

    const def = RESULTS[play.result];
    const isPa = play.type === "pa";
    const batterId = isPa ? play.batterId : undefined;
    outcome.batterId = batterId;
    const defense = other(s.offense);
    const pitcherId = pitcherOf(s, defense) ?? undefined;
    outcome.pitcherId = pitcherId;
    const ps = pitcherId ? pitch(pitcherId, defense) : null;
    if (pitcherId) lastPitcher[defense] = pitcherId;
    if (!ps && isPa) outcome.warnings.push("守備側のピッチャーが決まっていないため、投手成績に入っていません");
    outcome.warnings.push(...validateMoves(play.moves, s.bases, isPa));

    // 先頭の走者から処理する（サヨナラ時の得点の順番のため）
    const moves = [...play.moves].sort((a, b) => b.from - a.from);
    const newBases: Bases = [null, null, null];
    const scored: string[] = [];
    const outs: RunnerMove[] = [];
    for (const b of [1, 2, 3] as const) {
      const id = s.bases[b - 1];
      if (id && !moves.some((m) => m.from === b)) newBases[b - 1] = id;
    }
    for (const m of moves) {
      const id = m.from === 0 ? batterId : s.bases[m.from - 1];
      if (!id) continue;
      if (m.to === "out") outs.push(m);
      else if (m.to === 4) scored.push(id);
      else newBases[m.to - 1] = id;
      if (m.from === 0 && m.to !== "out" && pitcherId) responsible.set(id, pitcherId);
    }

    const outsOnPlay = Math.min(outs.length, 3 - s.outs);
    const totalOuts = s.outs + outsOnPlay;
    let counted = scored;
    let notCounted: string[] = [];

    if (totalOuts >= 3 && scored.length > 0) {
      // 野球規則：第3アウトが「打者が一塁に達する前のアウト」か「フォースアウト」なら得点は認められない
      const noRunsByRule = outs.some((m) => m.from === 0 || m.force);
      const allow = !noRunsByRule && (play.runsCountOverride ?? true);
      if (!allow) {
        counted = [];
        notCounted = scored;
      }
      if (noRunsByRule && play.runsCountOverride === true) {
        outcome.warnings.push("第3アウトが打者またはフォースアウトのため、得点は認められません");
      }
    }

    // サヨナラ：最終回以降の裏にホームが勝ち越したら、その時点で試合終了。
    // 本塁打以外は勝ち越しに必要な点数までを得点とする。
    let walkoff = false;
    if (s.half === "bottom" && s.inning >= N && s.runs.home + counted.length > s.runs.away) {
      walkoff = true;
      if (play.result !== "home_run") {
        const needed = s.runs.away - s.runs.home + 1;
        notCounted = [...notCounted, ...counted.slice(needed)];
        counted = counted.slice(0, needed);
      }
    }

    for (const id of counted) {
      const before = s.runs[s.offense];
      s.runs[s.offense] += 1;
      stat(id).r += 1;
      const charged = responsible.get(id) ?? pitcherId;
      if (charged) pitch(charged, defense).r += 1;
      // リードを奪った瞬間を記録（最後に奪ったリードが勝敗を決める）
      const opp = s.runs[defense];
      if (before <= opp && before + 1 > opp) {
        leadTaken[s.offense] = { win: lastPitcher[s.offense] ?? pitcherOf(s, s.offense), loss: charged ?? null };
      }
    }
    const ls = s.lineScore[s.offense];
    ls[s.inning - 1] = (ls[s.inning - 1] ?? 0) + counted.length;
    if (ps) ps.outs += outsOnPlay;

    outcome.scored = counted;
    outcome.notCounted = notCounted;
    outcome.outsOnPlay = outsOnPlay;

    if (isPa && batterId) {
      const st = stat(batterId);
      // 2アウトからの犠打・犠飛は記録上成立しない
      const sacrificeInvalid = (play.result === "sac_bunt" || play.result === "sac_fly") && outcome.outsBefore >= 2;
      if (sacrificeInvalid) outcome.warnings.push("2アウトからの犠打・犠飛は記録上成立しないため、打数に数えています");
      st.pa += 1;
      if (!def.noAtBat || sacrificeInvalid) st.ab += 1;
      if (def.hit) {
        st.h += 1;
        s.hits[s.offense] += 1;
        if (def.hit === 1) st.b1 += 1;
        if (def.hit === 2) st.b2 += 1;
        if (def.hit === 3) st.b3 += 1;
        if (def.hit === 4) st.hr += 1;
      }
      if (play.result === "walk") st.bb += 1;
      if (play.result === "hbp") st.hbp += 1;
      if (play.result === "strikeout" || play.result === "dropped_third") st.so += 1;
      if (play.result === "sac_bunt" && !sacrificeInvalid) st.sh += 1;
      if (play.result === "sac_fly" && !sacrificeInvalid) st.sf += 1;
      // エラーで出塁、またはヒットのあとのエラー（ワンヒットワンエラー）を失策に数える
      if (play.result === "error" || (RESULTS[play.result].hit && play.fielder)) s.errors[other(s.offense)] += 1;
      if (ps) {
        // 打席の結果になった1球も球数に数える
        ps.pitches += 1;
        if (play.result === "walk") ps.balls += 1;
        else if (play.result !== "hbp") ps.strikes += 1;
        ps.bf += 1;
        if (def.hit) ps.h += 1;
        if (def.hit === 4) ps.hr += 1;
        if (play.result === "walk") ps.bb += 1;
        if (play.result === "hbp") ps.hbp += 1;
        if (play.result === "strikeout" || play.result === "dropped_third") ps.so += 1;
      }
      const rbi = play.rbiOverride ?? (def.noRbi ? 0 : counted.length);
      outcome.rbi = rbi;
      st.rbi += rbi;

      // 打順：今の打者の次へ（打順外の選手が打った場合は1つ進める）
      const lineup = s.lineups[s.offense];
      const i = lineup.indexOf(batterId);
      const base = i >= 0 ? i : s.battingIndex[s.offense];
      if (i < 0) outcome.warnings.push("打順に入っていない選手の打席です");
      s.battingIndex[s.offense] = (base + 1) % Math.max(1, lineup.length);
      s.count = { balls: 0, strikes: 0 };
    }

    if (play.result === "pickoff") {
      for (const m of play.moves) {
        const id = m.from > 0 ? s.bases[m.from - 1] : null;
        if (id && m.to === "out") {
          stat(id).po += 1;
          if (ps) ps.pk += 1;
        }
      }
    }
    if (play.result === "caught_stealing") {
      for (const m of play.moves) {
        const id = m.from > 0 ? s.bases[m.from - 1] : null;
        if (id && m.to === "out") stat(id).cs += 1;
      }
    }
    if (play.result === "stolen_base") {
      for (const m of play.moves) {
        const id = m.from > 0 ? s.bases[m.from - 1] : null;
        if (id && m.to !== "out" && m.to > m.from) stat(id).sb += 1;
      }
    }

    s.bases = newBases;
    s.outs = totalOuts;
    outcome.outsAfter = totalOuts;

    if (walkoff) {
      finish("walkoff");
      return;
    }
    if (s.outs >= 3) {
      outcome.endsHalf = true;
      endHalf();
    }
  });

  const lineup = s.lineups[s.offense];
  if (!s.finished && lineup.length > 0) {
    s.currentBatterId = lineup[s.battingIndex[s.offense] % lineup.length];
    s.nextBatterId = lineup[(s.battingIndex[s.offense] + 1) % lineup.length];
    s.nextNextBatterId = lineup[(s.battingIndex[s.offense] + 2) % lineup.length];
  }
  if (s.finished) {
    s.winner = s.runs.away > s.runs.home ? "away" : s.runs.home > s.runs.away ? "home" : "draw";
    if (s.winner !== "draw") s.decisions = decide(s, s.winner, leadTaken[s.winner], N, game.pitcherDecisions);
  }
  return s;
}

/**
 * 勝利投手・敗戦投手（公式記録規則 9.17・9.18 を簡略化）
 * - 勝ったチームが最後にリードを奪ったとき、そのチームで投げていた投手が勝利投手
 * - ただし先発投手が規定の回（7回以上の試合は5回、それ未満は予定回数の6割）を投げていなければ、
 *   救援投手のうち最も多くアウトを取った投手を勝利投手とする
 * - そのリードのきっかけになった走者を出した投手が敗戦投手
 */
function decide(
  s: GameState,
  winner: Side,
  lead: { win: string | null; loss: string | null } | null,
  scheduled: number,
  manual?: { win?: string; loss?: string },
): PitcherDecisions {
  let autoWin = lead?.win ?? null;
  const starter = s.pitcherOrder[winner][0];
  const requiredOuts = (scheduled >= 7 ? 5 : Math.ceil(scheduled * 0.6)) * 3;
  if (autoWin && autoWin === starter && (s.pitching[starter]?.outs ?? 0) < requiredOuts) {
    const relievers = s.pitcherOrder[winner].slice(1).map((id) => s.pitching[id]);
    if (relievers.length > 0) autoWin = relievers.reduce((a, b) => (b.outs > a.outs ? b : a)).playerId;
  }
  const autoLoss = lead?.loss ?? null;
  return { autoWin, autoLoss, win: manual?.win ?? autoWin, loss: manual?.loss ?? autoLoss };
}

/** index 番目のプレーの直前の状況（修正画面用） */
export function stateBefore(game: Game, index: number): GameState {
  return replay({ ...game, plays: game.plays.slice(0, index) });
}

export function battingAverage(st: Pick<PlayerStats, "h" | "ab">): string {
  if (st.ab === 0) return "—";
  const avg = st.h / st.ab;
  return avg >= 1 ? "1.000" : avg.toFixed(3).replace(/^0/, "");
}
