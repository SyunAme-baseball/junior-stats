// 投手の指標。少年野球でも使いやすいものに絞る。

type Base = { outs: number; h: number; bb: number; so: number; bf: number; pitches: number; strikes: number };

/** K/BB（奪三振 ÷ 与四球）。四球0なら計算できないので null */
export function kPerBb(p: Base): number | null {
  return p.bb > 0 ? p.so / p.bb : null;
}

/**
 * ストライク率（ストライク ÷ 球数）。ファウル・打球（インプレー）もストライクに数える。
 * 1球ごとの入力をしていない試合は打席の最後の1球しか数えないため、
 * 球数が対戦打者数の2倍に満たない（ほとんど1球ごとに入力していない）ときは計算しない。
 */
export function strikeRate(p: Base): number | null {
  return p.pitches > 0 && p.pitches >= p.bf * 2 ? p.strikes / p.pitches : null;
}

/** WHIP（1イニングあたりに出した走者＝(与四球 + 被安打) ÷ 投球回）。死球は含めない */
export function whip(p: Base): number | null {
  return p.outs > 0 ? ((p.bb + p.h) * 3) / p.outs : null;
}

export const fmtRatio = (v: number | null) => (v === null ? "—" : v.toFixed(2));
export const fmtPct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);
/** K/BB は四球0のとき「三振だけ」を示す */
export const fmtKbb = (p: Base) => (p.bb === 0 ? (p.so > 0 ? `${p.so}/0` : "—") : fmtRatio(kPerBb(p)));
