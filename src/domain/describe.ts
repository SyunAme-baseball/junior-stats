// プレーを自然な日本語にする。記録されたデータだけから文章を作り、推測で出来事を足さない。

import type { PlayOutcome } from "./engine";
import { POSITION_LABELS } from "./positions";
import { directionDef } from "./directions";
import { fieldingText } from "./fielding";
import { RESULTS } from "./results";
import type { Direction, Game, Half, PitchKind, Player, ResultCode } from "./types";

export type NameOf = (id: string | null | undefined) => string;

export function makeNameOf(game: Game): NameOf {
  const map = new Map<string, Player>();
  for (const t of [game.teams.away, game.teams.home]) for (const p of t.roster) map.set(p.id, p);
  return (id) => {
    if (!id) return "—";
    const name = map.get(id)?.name ?? "不明な選手";
    return /(くん|君|さん|ちゃん)$|選手/.test(name) ? name : `${name}選手`;
  };
}

export const PITCH_LABELS: Record<PitchKind, string> = {
  ball: "ボール",
  called_strike: "見逃しストライク",
  swinging_strike: "空振りストライク",
  foul: "ファウル",
};

export const halfLabel = (h: Half) => (h === "top" ? "表" : "裏");
export const inningLabel = (inning: number, half: Half) => `${inning}回${halfLabel(half)}`;
const BASE = ["", "一塁", "二塁", "三塁", "ホーム"];

export function resultLabel(code: ResultCode, direction?: Direction): string {
  const d = directionDef(direction);
  const label = RESULTS[code].label;
  if (!d) return label;
  const outfieldFront = d.zone === "outfield" && !d.gap && !d.id.endsWith("_line");
  switch (code) {
    case "single":
      if (outfieldFront) return `${d.label}前ヒット`;
      if (d.zone === "infield" && d.gap) return `${d.label}を破るヒット`;
      return `${d.label}へのヒット`;
    case "infield_single":
      return `${d.label}への内野安打`;
    case "double":
      return `${d.label}への二塁打`;
    case "triple":
      return `${d.label}への三塁打`;
    case "home_run":
      return `${d.label}へのホームラン`;
    case "line_out":
      return `${d.label}ライナー`;
    case "fo_if":
      return `${d.label}フライ`;
    case "go_p":
    case "go_c":
    case "go_1b":
    case "go_2b":
    case "go_3b":
    case "go_ss":
    case "fo_lf":
    case "fo_cf":
    case "fo_rf":
      // 守備位置が結果の名前に入っているので、方向は付けない
      return label;
    case "foul_out":
      return `${d.label}ファウルフライ`;
    default:
      return `${label}（${d.label}）`;
  }
}

/** 見出し：「山田選手：センター前ヒット」 */
export function headline(o: PlayOutcome, nameOf: NameOf): string {
  const p = o.play;
  switch (p.type) {
    case "pa":
      if (p.result === "error" || p.result === "fielders_choice") {
        const flow = fieldingText(p);
        if (flow) return `${nameOf(p.batterId)}：${flow}${p.result === "error" ? "で出塁" : "（野手選択）で出塁"}`;
      }
      // ワンヒットワンエラー：「ライト前ヒット、二塁へ送球、ライトが悪送球」
      if (RESULTS[p.result].hit && p.fielder) {
        const flow = fieldingText({ throwTo: p.throwTo, fielder: p.fielder, errorType: p.errorType });
        return `${nameOf(p.batterId)}：${resultLabel(p.result, p.direction)}、${flow}`;
      }
      return `${nameOf(p.batterId)}：${resultLabel(p.result, p.direction)}`;
    case "runner": {
      if (p.result === "stolen_base" || p.result === "caught_stealing" || p.result === "pickoff") {
        const who = p.moves
          .filter((m) => m.from > 0 && (p.result === "stolen_base" ? m.to !== "out" && m.to > m.from : m.to === "out"))
          .map((m) => nameOf(o.basesBefore[m.from - 1]));
        if (who.length) return `${who.join("・")}：${RESULTS[p.result].label}`;
      }
      return RESULTS[p.result].label;
    }
    case "sub": {
      const pos = p.position ? `（${POSITION_LABELS[p.position]}）` : "";
      switch (p.kind) {
        case "pinch_hitter":
          return `代打：${nameOf(p.outPlayerId)} → ${nameOf(p.inPlayerId)}`;
        case "pinch_runner":
          return `代走：${nameOf(p.outPlayerId)} → ${nameOf(p.inPlayerId)}`;
        case "defense":
          return p.position === 1
            ? `ピッチャー交代：${nameOf(p.outPlayerId)} → ${nameOf(p.inPlayerId)}`
            : `守備交代：${nameOf(p.outPlayerId)} → ${nameOf(p.inPlayerId)}${pos}`;
        case "position":
          return p.position ? `守備位置の変更：${nameOf(p.inPlayerId)}が${POSITION_LABELS[p.position]}へ` : `守備位置の変更：${nameOf(p.inPlayerId)}が守備から外れる`;
      }
    }
    case "pitch":
      return PITCH_LABELS[p.pitch];
    case "end":
      return p.reason === "called" ? "コールドゲームで試合終了" : p.reason === "time" ? "時間切れで試合終了" : "試合終了";
  }
}

/** 走者の動きの説明：「二塁ランナー佐藤選手がホームイン」など */
export function runnerDetails(o: PlayOutcome, nameOf: NameOf): string[] {
  const p = o.play;
  if (p.type !== "pa" && p.type !== "runner") return [];
  const lines: string[] = [];
  const sorted = [...p.moves].sort((a, b) => b.from - a.from);
  for (const m of sorted) {
    if (m.from === 0) {
      if (p.type === "pa" && m.to === "out" && !["strikeout"].includes(p.result) && RESULTS[p.result].category !== "out") {
        lines.push("バッターはアウト");
      }
      continue;
    }
    const id = o.basesBefore[m.from - 1];
    if (!id) continue;
    const who = `${BASE[m.from]}ランナー${nameOf(id)}`;
    if (m.to === "out") lines.push(`${who}がアウト${m.force ? "（フォースアウト）" : ""}`);
    else if (m.to === 4) {
      const counted = o.scored.includes(id);
      lines.push(counted ? `${who}がホームイン` : `${who}がホームイン（得点にならず）`);
    } else if (m.to !== m.from) lines.push(`${who}が${BASE[m.to]}へ`);
  }
  if (p.type === "pa") {
    const b = p.moves.find((m) => m.from === 0);
    const def = RESULTS[p.result];
    if (b && b.to !== "out" && def.hit && b.to !== def.hit) {
      lines.push(b.to === 4 ? "バッターもホームイン" : `バッターは${BASE[b.to]}へ`);
    }
  }
  return lines;
}

export function sentence(o: PlayOutcome, nameOf: NameOf): string {
  const details = runnerDetails(o, nameOf);
  return details.length ? `${headline(o, nameOf)}（${details.join("、")}）` : headline(o, nameOf);
}

/** 主要な出来事：得点が入ったプレー、長打、盗塁 */
export function highlights(outcomes: PlayOutcome[], nameOf: NameOf): string[] {
  const list: string[] = [];
  for (const o of outcomes) {
    if (o.ignored) continue;
    const p = o.play;
    if (p.type !== "pa" && p.type !== "runner") continue;
    const def = RESULTS[p.result];
    const when = inningLabel(o.inning, o.half);
    if (p.result === "stolen_base") {
      for (const m of [...p.moves].sort((a, b) => b.from - a.from)) {
        const id = m.from > 0 ? o.basesBefore[m.from - 1] : null;
        if (id && m.to !== "out" && m.to > m.from) list.push(`${when}、${nameOf(id)}が${m.to === 4 ? "本盗（ホームスチール）" : `${BASE[m.to]}へ盗塁`}${o.scored.includes(id) ? "で1点" : ""}`);
      }
      continue;
    }
    const big = def.hit && def.hit >= 2;
    if (!big && o.scored.length === 0) continue;
    const label = p.type === "pa" ? `${nameOf(p.batterId)}が${resultLabel(p.result, p.direction)}` : `${def.label}`;
    const runs = o.scored.length ? `で${o.scored.length}点` : "";
    list.push(`${when}、${label}${runs}`);
  }
  return list;
}
