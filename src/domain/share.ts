// 試合データ・チームを別の端末に渡す仕組み（リンク／ファイル）と、
// 受け取った試合を自分の登録チームの成績として取り込むための選手IDの付け替え。

import type { Game, Play, Player, TeamProfile } from "./types";

export type SharePayload = { kind: "mieru-score-share"; v: 1; teams: TeamProfile[]; games: Game[] };

export function makePayload(games: Game[], profiles: TeamProfile[]): SharePayload {
  const ids = new Set(games.flatMap((g) => [g.teams.away.id, g.teams.home.id]));
  return { kind: "mieru-score-share", v: 1, teams: profiles.filter((t) => ids.has(t.id)), games };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** データを圧縮して、URLに入れられる文字列にする */
export async function encodePayload(payload: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodePayload(text: string): Promise<SharePayload> {
  const json = new TextDecoder().decode(await pipe(fromBase64Url(text), new DecompressionStream("deflate-raw")));
  const parsed = JSON.parse(json) as SharePayload;
  if (parsed?.kind !== "mieru-score-share" || !Array.isArray(parsed.games)) throw new Error("共有データを読み取れませんでした");
  return parsed;
}

/** LINE などで送れるリンクの長さの目安。これを超えたらファイルで送る */
export const MAX_LINK_LENGTH = 8000;

/** 取り込む試合に出てくるチーム（登録チームかどうかに関係なく） */
export function teamsInGames(games: Game[]): { id: string; name: string; season?: string }[] {
  const map = new Map<string, { id: string; name: string; season?: string }>();
  for (const g of games) for (const t of [g.teams.away, g.teams.home]) if (!map.has(t.id)) map.set(t.id, { id: t.id, name: t.name, season: g.season });
  return [...map.values()];
}

const norm = (name: string) => name.replace(/\s+/g, "").replace(/(くん|君|さん|ちゃん|選手)$/, "");

/**
 * 試合の中の1チームを、自分の登録チームの選手として付け替える。
 * 選手は「同じID」か「同じ名前」で対応させ、見つからない選手は登録チームに新しく加える。
 */
export function remapTeam(game: Game, fromTeamId: string, target: TeamProfile): { game: Game; newPlayers: Player[] } {
  const side = game.teams.away.id === fromTeamId ? "away" : game.teams.home.id === fromTeamId ? "home" : null;
  if (!side) return { game, newPlayers: [] };
  const team = game.teams[side];
  const idMap = new Map<string, string>();
  const newPlayers: Player[] = [];
  for (const p of team.roster) {
    const match = target.players.find((x) => x.id === p.id) ?? target.players.find((x) => norm(x.name) === norm(p.name));
    if (match) idMap.set(p.id, match.id);
    else {
      idMap.set(p.id, p.id);
      newPlayers.push(p);
    }
  }
  const m = (id: string | undefined) => (id ? (idMap.get(id) ?? id) : id);
  const plays: Play[] = game.plays.map((p) => {
    if (p.type === "pa") return { ...p, batterId: m(p.batterId)! };
    if (p.type === "sub" && p.side === side) return { ...p, outPlayerId: m(p.outPlayerId), inPlayerId: m(p.inPlayerId)! };
    return p;
  });
  // 名前は登録チームのものを使い、背番号はその試合のものを残す
  const roster = team.roster.map((p) => {
    const match = target.players.find((x) => x.id === m(p.id));
    return match ? { ...match, number: p.number } : p;
  });
  const pd = game.pitcherDecisions;
  return {
    game: {
      ...game,
      season: game.season ?? target.season,
      category: game.category,
      teams: {
        ...game.teams,
        [side]: { ...team, id: target.id, name: target.name, roster, lineup: team.lineup.map((id) => m(id)!), pitcherId: m(team.pitcherId) },
      },
      plays,
      pitcherDecisions: pd ? { win: m(pd.win), loss: m(pd.loss) } : undefined,
    },
    newPlayers,
  };
}
