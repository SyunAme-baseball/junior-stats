// 打球が飛んだ位置。ホームから見た角度（左のファウルラインが -45°、センターが 0°、右が +45°）と距離で区切る。

export type DirectionId =
  | "c"
  | "p"
  | "3b"
  | "ss3b"
  | "ss"
  | "mid"
  | "2b"
  | "1b2b"
  | "1b"
  | "lf_line"
  | "lf"
  | "lcf"
  | "cf"
  | "rcf"
  | "rf"
  | "rf_line";

export type DirectionDef = {
  id: DirectionId;
  label: string;
  zone: "infield" | "outfield";
  /** 扇形の範囲（度）。ピッチャー・キャッチャーは円で描くので持たない */
  from?: number;
  to?: number;
  /** 「左中間」など、野手と野手の間 */
  gap?: boolean;
  /** 図には出さない（以前の版で記録したデータを読むためだけに残す） */
  hidden?: boolean;
};

export const DIRECTIONS: DirectionDef[] = [
  { id: "lf_line", label: "レフト線", zone: "outfield", from: -45, to: -37 },
  { id: "lf", label: "レフト", zone: "outfield", from: -37, to: -21 },
  { id: "lcf", label: "左中間", zone: "outfield", from: -21, to: -7, gap: true },
  { id: "cf", label: "センター", zone: "outfield", from: -7, to: 7 },
  { id: "rcf", label: "右中間", zone: "outfield", from: 7, to: 21, gap: true },
  { id: "rf", label: "ライト", zone: "outfield", from: 21, to: 37 },
  { id: "rf_line", label: "ライト線", zone: "outfield", from: 37, to: 45 },
  // 内野は守備位置だけ。野手の間を抜けた打球は外野（レフト前など）で記録する
  { id: "3b", label: "サード", zone: "infield", from: -45, to: -24 },
  { id: "ss", label: "ショート", zone: "infield", from: -24, to: 0 },
  { id: "2b", label: "セカンド", zone: "infield", from: 0, to: 24 },
  { id: "1b", label: "ファースト", zone: "infield", from: 24, to: 45 },
  { id: "ss3b", label: "三遊間", zone: "infield", gap: true, hidden: true },
  { id: "mid", label: "二遊間", zone: "infield", gap: true, hidden: true },
  { id: "1b2b", label: "一二塁間", zone: "infield", gap: true, hidden: true },
  { id: "p", label: "ピッチャー", zone: "infield" },
  { id: "c", label: "キャッチャー", zone: "infield" },
];

const BY_ID = Object.fromEntries(DIRECTIONS.map((d) => [d.id, d])) as Record<DirectionId, DirectionDef>;

/** 以前の版の「レフト・センター・ライト」の3方向 */
const LEGACY: Record<string, DirectionId> = { left: "lf", center: "cf", right: "rf" };

export function directionDef(id: string | undefined): DirectionDef | undefined {
  if (!id) return undefined;
  return BY_ID[id as DirectionId] ?? BY_ID[LEGACY[id]];
}
