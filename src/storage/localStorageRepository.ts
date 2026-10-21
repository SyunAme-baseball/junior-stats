import type { Game, Player, TeamProfile } from "../domain/types";
import { normalizeTeam } from "../domain/categories";
import { mergeIntoRoster, syncTeam } from "../domain/roster";
import { isGame, normalizeGame, type GameRepository, type GameSummary } from "./repository";

const PREFIX = "baseball-mieru-score:v2:";
const INDEX_KEY = `${PREFIX}index`;
const CURRENT_KEY = `${PREFIX}current`;
const TEAMS_KEY = `${PREFIX}teams`;
const ROSTER_KEY = `${PREFIX}roster`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過やプライベートモード：保存できなくても画面は動かし続ける
  }
}

export class LocalStorageRepository implements GameRepository {
  list(): GameSummary[] {
    return read<GameSummary[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Game | null {
    const g = read<unknown>(`${PREFIX}game:${id}`, null);
    return isGame(g) ? normalizeGame(g) : null;
  }

  save(game: Game) {
    write(`${PREFIX}game:${game.id}`, game);
    const summary: GameSummary = {
      id: game.id,
      date: game.date,
      tournament: game.tournament,
      season: game.season,
      updatedAt: game.updatedAt,
      awayName: game.teams.away.name,
      homeName: game.teams.home.name,
    };
    write(INDEX_KEY, [summary, ...this.list().filter((s) => s.id !== game.id)]);
  }

  remove(id: string) {
    try {
      localStorage.removeItem(`${PREFIX}game:${id}`);
    } catch {
      /* noop */
    }
    write(INDEX_KEY, this.list().filter((s) => s.id !== id));
    if (this.getCurrentId() === id) this.setCurrentId(null);
  }

  allGames(): Game[] {
    return this.list()
      .map((s) => this.get(s.id))
      .filter((g): g is Game => g !== null);
  }

  private storedTeams(): TeamProfile[] {
    return read<TeamProfile[]>(TEAMS_KEY, []).map(normalizeTeam);
  }

  listTeams(): TeamProfile[] {
    const roster = this.getRoster();
    return this.storedTeams()
      .map((t) => syncTeam(t, roster))
      .sort(
        (a, b) =>
          (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name, "ja") ||
          (b.season ?? "").localeCompare(a.season ?? ""),
      );
  }

  getTeam(id: string) {
    return this.listTeams().find((t) => t.id === id) ?? null;
  }

  saveTeam(team: TeamProfile) {
    const roster = this.getRoster();
    const merged = mergeIntoRoster(roster, team.players);
    if (merged !== roster) write(ROSTER_KEY, merged);
    write(TEAMS_KEY, [syncTeam(team, merged), ...this.storedTeams().filter((t) => t.id !== team.id)]);
  }

  removeTeam(id: string) {
    write(TEAMS_KEY, this.storedTeams().filter((t) => t.id !== id));
  }

  getRoster(): Player[] {
    const saved = read<Player[] | null>(ROSTER_KEY, null);
    if (saved) return saved;
    // 名簿がまだない（以前の版のデータ）：各チームの選手から作る
    const fromTeams = this.storedTeams().reduce<Player[]>((r, t) => mergeIntoRoster(r, t.players), []);
    if (fromTeams.length) write(ROSTER_KEY, fromTeams);
    return fromTeams;
  }

  saveRoster(players: Player[]) {
    const ids = new Set(players.map((p) => p.id));
    const removed = new Set(this.getRoster().filter((p) => !ids.has(p.id)).map((p) => p.id));
    write(ROSTER_KEY, players);
    // 名簿から削除した選手はチームからも外す。名前・学年はチーム側も名簿にそろえる
    write(
      TEAMS_KEY,
      this.storedTeams().map((t) => syncTeam({ ...t, players: t.players.filter((p) => !removed.has(p.id)) }, players)),
    );
  }

  getCurrentId() {
    return read<string | null>(CURRENT_KEY, null);
  }

  setCurrentId(id: string | null) {
    write(CURRENT_KEY, id);
  }
}
