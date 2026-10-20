import type { Bases, Dest, From, ResultCode, RunnerMove } from "./types";

export type Category = "hit" | "out" | "onbase" | "special" | "runner";

export type ResultDef = {
  code: ResultCode;
  label: string;
  category: Category;
  /** 打席の結果か（false なら走者のプレー） */
  pa: boolean;
  /** 安打の塁打数 */
  hit?: 1 | 2 | 3 | 4;
  /** 打数に数えない（四球・死球・犠打・犠飛） */
  noAtBat?: boolean;
  /** 打点を自動計上しない */
  noRbi?: boolean;
  /** 打球方向を選べる */
  directional?: boolean;
  /** 初心者向けの説明 */
  help: string;
};

const defs: ResultDef[] = [
  { code: "infield_single", label: "内野安打", category: "hit", pa: true, hit: 1, directional: true, help: "内野にころがった打球で、バッターが一塁に間に合ったヒット" },
  { code: "single", label: "シングルヒット", category: "hit", pa: true, hit: 1, directional: true, help: "外野まで飛んだヒットで、バッターが一塁まで進んだ" },
  { code: "double", label: "二塁打", category: "hit", pa: true, hit: 2, directional: true, help: "ヒットでバッターが二塁まで進んだ" },
  { code: "triple", label: "三塁打", category: "hit", pa: true, hit: 3, directional: true, help: "ヒットでバッターが三塁まで進んだ" },
  { code: "home_run", label: "ホームラン", category: "hit", pa: true, hit: 4, directional: true, help: "バッターが一周してホームに戻った" },

  { code: "strikeout", label: "三振", category: "out", pa: true, help: "ストライク3つでアウト" },
  { code: "go_p", label: "ピッチャーゴロ", category: "out", pa: true, help: "ピッチャーが捕って投げ、バッターがアウト" },
  { code: "go_c", label: "キャッチャーゴロ", category: "out", pa: true, help: "キャッチャーが捕って投げ、バッターがアウト" },
  { code: "go_1b", label: "ファーストゴロ", category: "out", pa: true, help: "ファーストが捕って、バッターがアウト" },
  { code: "go_2b", label: "セカンドゴロ", category: "out", pa: true, help: "セカンドが捕って投げ、バッターがアウト" },
  { code: "go_3b", label: "サードゴロ", category: "out", pa: true, help: "サードが捕って投げ、バッターがアウト" },
  { code: "go_ss", label: "ショートゴロ", category: "out", pa: true, help: "ショートが捕って投げ、バッターがアウト" },
  { code: "fo_lf", label: "レフトフライ", category: "out", pa: true, help: "レフトが直接捕ってアウト" },
  { code: "fo_cf", label: "センターフライ", category: "out", pa: true, help: "センターが直接捕ってアウト" },
  { code: "fo_rf", label: "ライトフライ", category: "out", pa: true, help: "ライトが直接捕ってアウト" },
  { code: "line_out", directional: true, label: "ライナー", category: "out", pa: true, help: "ライナーの打球を野手が直接捕ってアウト" },
  { code: "foul_out", directional: true, label: "ファウルフライ", category: "out", pa: true, help: "ファウルの打球を野手が直接捕ってアウト" },
  { code: "fo_if", label: "内野フライ", category: "out", pa: true, help: "内野手が直接捕ってアウト" },
  { code: "other_out", directional: true, label: "その他のアウト", category: "out", pa: true, help: "上にないアウト" },

  { code: "walk", label: "四球", category: "onbase", pa: true, noAtBat: true, help: "ボール4つでバッターが一塁へ" },
  { code: "hbp", label: "死球", category: "onbase", pa: true, noAtBat: true, help: "ボールが体に当たってバッターが一塁へ" },
  { code: "error", directional: true, label: "エラーで出塁", category: "onbase", pa: true, noRbi: true, help: "守備のミスでバッターが塁に出た（ヒットにはならない）" },
  { code: "fielders_choice", directional: true, label: "野手選択で出塁", category: "onbase", pa: true, help: "守備が前の走者をアウトにしようとして、バッターが塁に出た" },
  { code: "dropped_third", label: "振り逃げ", category: "onbase", pa: true, help: "三振だがキャッチャーが捕れず、バッターが一塁へ" },

  { code: "sac_bunt", directional: true, label: "犠打（送りバント）", category: "special", pa: true, noAtBat: true, help: "バントでバッターはアウト、走者が進んだ" },
  { code: "sac_fly", directional: true, label: "犠牲フライ", category: "special", pa: true, noAtBat: true, help: "フライでバッターはアウト、三塁ランナーがホームイン" },
  { code: "double_play", directional: true, label: "併殺（ダブルプレー）", category: "special", pa: true, noRbi: true, help: "1つのプレーで2人アウト" },

  { code: "stolen_base", label: "盗塁", category: "runner", pa: false, help: "走者が投球の間に次の塁へ進んだ" },
  { code: "wild_pitch", label: "暴投", category: "runner", pa: false, help: "ピッチャーの投球がそれて走者が進んだ" },
  { code: "passed_ball", label: "捕逸", category: "runner", pa: false, help: "キャッチャーが捕れず走者が進んだ" },
  { code: "balk", label: "ボーク", category: "runner", pa: false, help: "ピッチャーの反則で全走者が1つ進む" },
  { code: "caught_stealing", label: "盗塁失敗", category: "runner", pa: false, help: "盗塁しようとした走者がアウト" },
  { code: "pickoff", label: "牽制死", category: "runner", pa: false, help: "ピッチャー（またはキャッチャー）の牽制球で走者がアウト" },
  { code: "runner_out", label: "走塁死", category: "runner", pa: false, help: "走者が塁の間でアウトになった（オーバーランなど）" },
  { code: "other_play", label: "その他のプレー", category: "runner", pa: false, help: "上にない走者の動き（自由に設定）" },
];

export const RESULTS: Record<ResultCode, ResultDef> = Object.fromEntries(
  defs.map((d) => [d.code, d]),
) as Record<ResultCode, ResultDef>;

export const RESULT_LIST = defs;

export const CATEGORY_LABELS: Record<Category, string> = {
  hit: "ヒット",
  out: "アウト",
  onbase: "出塁",
  special: "バント・犠飛・併殺",
  runner: "走者のプレー",
};


function forced(bases: Bases): [boolean, boolean, boolean] {
  const f1 = bases[0] !== null;
  const f2 = f1 && bases[1] !== null;
  const f3 = f2 && bases[2] !== null;
  return [f1, f2, f3];
}

function occupied(bases: Bases): (1 | 2 | 3)[] {
  return ([1, 2, 3] as const).filter((b) => bases[b - 1] !== null);
}

function adv(from: 1 | 2 | 3, n: number): Dest {
  return Math.min(4, from + n) as Dest;
}

/**
 * プレー種別ごとの「よくある結果」を初期値として返す。
 * あくまで初期値で、ユーザーが確認画面で修正できる。
 */
export function defaultMoves(code: ResultCode, bases: Bases, outs: number): RunnerMove[] {
  const occ = occupied(bases);
  const f = forced(bases);
  const runners = (fn: (b: 1 | 2 | 3) => Dest): RunnerMove[] =>
    occ.map((b) => ({ from: b as From, to: fn(b) }));
  const forcedAdvance = (b: 1 | 2 | 3): Dest => (f[b - 1] ? adv(b, 1) : b);
  const batter = (to: Dest): RunnerMove => ({ from: 0, to });
  const lead = occ[occ.length - 1];

  switch (code) {
    case "single":
      return [batter(1), ...runners((b) => adv(b, 1))];
    case "infield_single":
    case "walk":
    case "hbp":
    case "error":
    case "dropped_third":
      return [batter(1), ...runners(forcedAdvance)];
    case "double":
      return [batter(2), ...runners((b) => adv(b, 2))];
    case "triple":
    case "home_run":
      return [batter(code === "triple" ? 3 : 4), ...runners(() => 4)];
    case "strikeout":
    case "fo_lf":
    case "fo_cf":
    case "fo_rf":
    case "fo_if":
    case "foul_out":
    case "line_out":
    case "other_out":
      return [batter("out"), ...runners((b) => b)];
    case "go_p":
    case "go_c":
    case "go_1b":
    case "go_2b":
    case "go_3b":
    case "go_ss":
      // 2アウトなら第3アウトで終わるので走者は動かさない
      return [batter("out"), ...runners((b) => (outs >= 2 ? b : forcedAdvance(b)))];
    case "sac_bunt":
      return [batter("out"), ...runners((b) => adv(b, 1))];
    case "sac_fly":
      return [batter("out"), ...runners((b) => (b === 3 ? 4 : b))];
    case "fielders_choice": {
      if (bases[0] !== null) {
        return [
          batter(1),
          ...occ.map((b): RunnerMove =>
            b === 1 ? { from: 1, to: "out", force: true } : { from: b, to: forcedAdvance(b) },
          ),
        ];
      }
      return [
        batter(1),
        ...occ.map((b): RunnerMove => (b === lead ? { from: b, to: "out" } : { from: b, to: b })),
      ];
    }
    case "double_play": {
      if (bases[0] !== null) {
        return [
          batter("out"),
          ...occ.map((b): RunnerMove => (b === 1 ? { from: 1, to: "out", force: true } : { from: b, to: b })),
        ];
      }
      return [
        batter("out"),
        ...occ.map((b): RunnerMove => (b === lead ? { from: b, to: "out" } : { from: b, to: b })),
      ];
    }
    case "stolen_base": {
      // 次の塁が空いている一番前の走者が盗塁
      const stealer = [...occ].reverse().find((b) => b === 3 || bases[b] === null);
      return occ.map((b) => ({ from: b, to: b === stealer ? adv(b, 1) : b }));
    }
    case "wild_pitch":
    case "passed_ball":
    case "balk":
      return runners((b) => adv(b, 1));
    case "pickoff":
      // 牽制で刺されるのは一塁走者が多いので、一番後ろの走者を初期値にする
      return occ.map((b) => ({ from: b, to: b === occ[0] ? "out" : b }));
    case "caught_stealing":
    case "runner_out":
      return occ.map((b) => ({ from: b, to: b === lead ? "out" : b }));
    case "other_play":
      return runners((b) => b);
  }
}

/** そのプレーが今の状況で選べるか（理由つき） */
export function availability(code: ResultCode, bases: Bases, outs: number): string | null {
  const def = RESULTS[code];
  const hasRunner = occupied(bases).length > 0;
  if (!def.pa && !hasRunner) return "走者がいません";
  if (code === "double_play" && !hasRunner) return "走者がいません";
  if (code === "double_play" && outs >= 2) return "2アウトでは併殺になりません";
  if (code === "fielders_choice" && !hasRunner) return "走者がいません";
  if (code === "sac_fly" && bases[2] === null) return "三塁走者がいません";
  if (code === "sac_bunt" && !hasRunner) return "走者がいません";
  return null;
}
