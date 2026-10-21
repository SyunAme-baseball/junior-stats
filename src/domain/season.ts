// シーズン通算成績：登録チームが出た試合をすべて replay() して合計する。

import { replay, type PitcherStats, type PlayerStats } from "./engine";
import type { Game, Side, TeamProfile } from "./types";

export type SeasonBatting = Omit<PlayerStats, "side"> & { games: number };
export type SeasonPitching = Omit<PitcherStats, "side"> & { games: number; w: number; l: number };

export type GameRow = {
  game: Game;
  side: Side;
  opponent: string;
  myRuns: number;
  oppRuns: number;
  result: "win" | "loss" | "draw" | "playing";
};

export type SeasonSummary = {
  record: { win: number; loss: number; draw: number };
  games: GameRow[];
  batting: SeasonBatting[];
  pitching: SeasonPitching[];
  /** チーム合計 */
  totals: { runs: number; allowed: number; hits: number; sb: number; cs: number; errors: number; xbh: number; hr: number };
};

const BAT_KEYS = ["pa", "ab", "h", "b1", "b2", "b3", "hr", "rbi", "r", "bb", "hbp", "so", "sh", "sf", "sb", "cs", "po"] as const;
const PITCH_KEYS = ["bf", "outs", "h", "hr", "bb", "hbp", "so", "r", "pitches", "strikes", "balls", "pk"] as const;

export function sideOf(game: Game, teamId: string): Side | null {
  if (game.teams.away.id === teamId) return "away";
  if (game.teams.home.id === teamId) return "home";
  return null;
}

export type SeasonFilter = { season?: string; category?: string };

/** その登録チームの試合のシーズン・カテゴリーの一覧（新しい順） */
export function filtersOf(team: TeamProfile, allGames: Game[]) {
  const games = allGames.filter((g) => sideOf(g, team.id));
  const seasons = [...new Set(games.map((g) => g.season).filter((s): s is string => !!s))].sort().reverse();
  const categories = [...new Set(games.map((g) => g.category).filter((c): c is string => !!c))];
  return { seasons, categories };
}

export function summarizeSeason(team: TeamProfile, allGames: Game[], filter: SeasonFilter = {}): SeasonSummary {
  const batting = new Map<string, SeasonBatting>();
  const pitching = new Map<string, SeasonPitching>();
  const rows: GameRow[] = [];
  const record = { win: 0, loss: 0, draw: 0 };
  const totals = { runs: 0, allowed: 0, hits: 0, sb: 0, cs: 0, errors: 0, xbh: 0, hr: 0 };

  const games = allGames
    .filter((g) => sideOf(g, team.id))
    .filter((g) => !filter.season || g.season === filter.season)
    .filter((g) => !filter.category || g.category === filter.category)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const game of games) {
    const side = sideOf(game, team.id)!;
    const opp: Side = side === "away" ? "home" : "away";
    const s = replay(game);
    const result = !s.finished ? "playing" : s.winner === "draw" ? "draw" : s.winner === side ? "win" : "loss";
    if (result !== "playing") record[result] += 1;
    rows.push({ game, side, opponent: game.teams[opp].name, myRuns: s.runs[side], oppRuns: s.runs[opp], result });
    totals.runs += s.runs[side];
    totals.allowed += s.runs[opp];
    totals.hits += s.hits[side];
    // 失策はそのチームが守っているときに記録したもの
    totals.errors += s.errors[side];

    for (const st of Object.values(s.stats)) {
      if (st.side !== side) continue;
      // 打席にも塁にも出ていない控え選手は数えない
      if (st.pa === 0 && st.r === 0 && st.sb === 0 && st.cs === 0 && !s.lineups[side].includes(st.playerId) && !game.teams[side].lineup.includes(st.playerId)) continue;
      const acc = batting.get(st.playerId) ?? { ...Object.fromEntries(BAT_KEYS.map((k) => [k, 0])), playerId: st.playerId, games: 0 } as SeasonBatting;
      for (const k of BAT_KEYS) acc[k] += st[k];
      acc.games += 1;
      batting.set(st.playerId, acc);
      totals.sb += st.sb;
      totals.cs += st.cs;
      totals.xbh += st.b2 + st.b3 + st.hr;
      totals.hr += st.hr;
    }
    for (const id of s.pitcherOrder[side]) {
      const ps = s.pitching[id];
      const acc = pitching.get(id) ?? { ...Object.fromEntries(PITCH_KEYS.map((k) => [k, 0])), playerId: id, games: 0, w: 0, l: 0 } as SeasonPitching;
      for (const k of PITCH_KEYS) acc[k] += ps[k];
      acc.games += 1;
      if (s.decisions?.win === id) acc.w += 1;
      if (s.decisions?.loss === id) acc.l += 1;
      pitching.set(id, acc);
    }
  }

  const order = new Map(team.players.map((p, i) => [p.id, i]));
  const byTeamOrder = (a: { playerId: string }, b: { playerId: string }) => (order.get(a.playerId) ?? 999) - (order.get(b.playerId) ?? 999);
  return {
    record,
    games: rows,
    batting: [...batting.values()].sort(byTeamOrder),
    pitching: [...pitching.values()].sort(byTeamOrder),
    totals,
  };
}

/** 勝率（勝÷(勝+敗)、引き分けは除く） */
export function winningPct(w: number, l: number): string {
  if (w + l === 0) return "—";
  const v = w / (w + l);
  return v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, "");
}

/** 出塁率＝(安打＋四球＋死球)÷(打数＋四球＋死球＋犠飛) */
export function onBasePct(st: Pick<PlayerStats, "h" | "ab" | "bb" | "hbp" | "sf">): string {
  const den = st.ab + st.bb + st.hbp + st.sf;
  if (den === 0) return "—";
  const v = (st.h + st.bb + st.hbp) / den;
  return v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, "");
}

export type PlayerLine = { label: string; batting: SeasonBatting | null; pitching: SeasonPitching | null };

export type PlayerSummary = {
  /** すべての試合の合計（チーム・カテゴリーに関係なく） */
  total: PlayerLine;
  byCategory: PlayerLine[];
  bySeason: PlayerLine[];
  byTeam: PlayerLine[];
};

const NO_CATEGORY = "カテゴリーなし";

/**
 * 1人の選手の個人総合成績。名簿の選手IDが同じなら、どのチーム・カテゴリーの試合でも合計する。
 * 打席にも塁にも出ていない控えの試合は数えない（チームの成績と同じ考え方）。
 */
export function summarizePlayer(playerId: string, allGames: Game[]): PlayerSummary {
  const groups = new Map<string, Map<string, PlayerLine>>([
    ["total", new Map()],
    ["category", new Map()],
    ["season", new Map()],
    ["team", new Map()],
  ]);
  const add = (kind: string, label: string, bat: PlayerStats | null, pit: PitcherStats | null, w: boolean, l: boolean) => {
    const g = groups.get(kind)!;
    const line = g.get(label) ?? { label, batting: null, pitching: null };
    if (bat) {
      const acc = line.batting ?? ({ ...Object.fromEntries(BAT_KEYS.map((k) => [k, 0])), playerId, games: 0 } as SeasonBatting);
      for (const k of BAT_KEYS) acc[k] += bat[k];
      acc.games += 1;
      line.batting = acc;
    }
    if (pit) {
      const acc = line.pitching ?? ({ ...Object.fromEntries(PITCH_KEYS.map((k) => [k, 0])), playerId, games: 0, w: 0, l: 0 } as SeasonPitching);
      for (const k of PITCH_KEYS) acc[k] += pit[k];
      acc.games += 1;
      if (w) acc.w += 1;
      if (l) acc.l += 1;
      line.pitching = acc;
    }
    g.set(label, line);
  };

  const games = [...allGames].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const game of games) {
    const side = (["away", "home"] as const).find((sd) => game.teams[sd].roster.some((p) => p.id === playerId));
    if (!side) continue;
    const s = replay(game);
    const st = s.stats[playerId];
    const played = st && (st.pa > 0 || st.r > 0 || st.sb > 0 || st.cs > 0 || game.teams[side].lineup.includes(playerId) || s.lineups[side].includes(playerId));
    const ps = s.pitching[playerId] ?? null;
    const bat = played ? st : null;
    if (!bat && !ps) continue;
    const w = s.decisions?.win === playerId;
    const l = s.decisions?.loss === playerId;
    add("total", "通算", bat, ps, w, l);
    add("category", game.category ?? NO_CATEGORY, bat, ps, w, l);
    add("season", game.season ?? "シーズンなし", bat, ps, w, l);
    add("team", game.teams[side].name || "（名前のないチーム）", bat, ps, w, l);
  }
  const list = (kind: string) => [...groups.get(kind)!.values()];
  const catOrder = (l: PlayerLine) => {
    const i = ["6年生", "5年生", "4年生", "3年生以下", "全学年"].indexOf(l.label);
    return i < 0 ? 99 : i;
  };
  return {
    total: list("total")[0] ?? { label: "通算", batting: null, pitching: null },
    byCategory: list("category").sort((a, b) => catOrder(a) - catOrder(b)),
    bySeason: list("season").sort((a, b) => b.label.localeCompare(a.label)),
    byTeam: list("team"),
  };
}
