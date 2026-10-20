// 保存先の抽象。UI はこのインターフェースだけを使う。
// 将来クラウド同期にする場合は、同じインターフェースの実装を差し替える。

import { normalizeTeam } from "../domain/categories";
import type { Game, Player, TeamProfile } from "../domain/types";

export type GameSummary = Pick<Game, "id" | "date" | "tournament" | "updatedAt" | "season"> & {
  awayName: string;
  homeName: string;
};

export interface GameRepository {
  list(): GameSummary[];
  get(id: string): Game | null;
  save(game: Game): void;
  remove(id: string): void;
  getCurrentId(): string | null;
  setCurrentId(id: string | null): void;
  /** 全試合（シーズン集計用） */
  allGames(): Game[];
  listTeams(): TeamProfile[];
  getTeam(id: string): TeamProfile | null;
  /** 選手を名簿にも加えて保存する */
  saveTeam(team: TeamProfile): void;
  removeTeam(id: string): void;
  /** クラブ全体の名簿 */
  getRoster(): Player[];
  /** 名簿を保存し、各チームの選手の名前・学年もそろえる */
  saveRoster(players: Player[]): void;
}

export function isGame(value: unknown): value is Game {
  const g = value as Game;
  return (
    !!g &&
    typeof g.id === "string" &&
    g.version === 2 &&
    Array.isArray(g.plays) &&
    !!g.teams?.away &&
    !!g.teams?.home &&
    Array.isArray(g.teams.away.lineup) &&
    Array.isArray(g.teams.home.lineup)
  );
}

/** 古い形式のデータ（守備位置なし）を今の形式にそろえる */
export function normalizeGame(game: Game): Game {
  const fix = (t: Game["teams"]["away"]) => ({
    ...t,
    positions: t.lineup.map((_, i) => t.positions?.[i] ?? null),
  });
  return { ...game, teams: { away: fix(game.teams.away), home: fix(game.teams.home) } };
}

export function exportGame(game: Game): string {
  return JSON.stringify(game, null, 2);
}

export type Backup = { kind: "mieru-score-backup"; exportedAt: number; teams: TeamProfile[]; games: Game[]; roster?: Player[] };

export function exportAll(repo: GameRepository): string {
  const backup: Backup = { kind: "mieru-score-backup", exportedAt: Date.now(), teams: repo.listTeams(), games: repo.allGames(), roster: repo.getRoster() };
  return JSON.stringify(backup);
}

/** 試合1件のファイルと、全データのバックアップのどちらも読み込める */
export function importData(json: string): { games: Game[]; teams: TeamProfile[]; roster?: Player[] } {
  const parsed = JSON.parse(json) as Partial<Backup>;
  const kind = (parsed as { kind?: string })?.kind;
  if ((kind === "mieru-score-backup" || kind === "mieru-score-share") && Array.isArray(parsed.games) && Array.isArray(parsed.teams)) {
    return {
      games: parsed.games.filter(isGame).map(normalizeGame),
      teams: parsed.teams.map(normalizeTeam),
      roster: Array.isArray(parsed.roster) ? parsed.roster : undefined,
    };
  }
  if (isGame(parsed)) return { games: [normalizeGame(parsed)], teams: [] };
  throw new Error("ジュニアスタッツのデータではありません");
}
