import { DIRECTIONS, directionDef, type DirectionDef } from "../domain/directions";
import type { Direction } from "../domain/types";

// グラウンドの図。ホームを (150, 250) に置き、角度 0° がセンター方向
const HX = 150;
const HY = 250;
const INNER = 34;
const INFIELD = 118;
const OUTFIELD = 210;

const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(HX + r * Math.sin(a)).toFixed(1)} ${(HY - r * Math.cos(a)).toFixed(1)}`;
};

function wedge(r1: number, r2: number, a1: number, a2: number) {
  return `M ${pt(r1, a1)} L ${pt(r2, a1)} A ${r2} ${r2} 0 0 1 ${pt(r2, a2)} L ${pt(r1, a2)} A ${r1} ${r1} 0 0 0 ${pt(r1, a1)} Z`;
}

function shapeOf(d: DirectionDef) {
  if (d.id === "p") return { kind: "circle" as const, cx: HX, cy: HY - 62, r: 15 };
  if (d.id === "c") return { kind: "circle" as const, cx: HX, cy: HY - 10, r: 13 };
  const [r1, r2] = d.zone === "infield" ? [INNER, INFIELD] : [INFIELD, OUTFIELD];
  return { kind: "path" as const, d: wedge(r1, r2, d.from!, d.to!), r1, r2 };
}

function labelPos(d: DirectionDef) {
  const s = shapeOf(d);
  if (s.kind === "circle") return { x: s.cx, y: s.cy + 4 };
  const mid = (d.from! + d.to!) / 2;
  // 線際は細いので、外側に寄せて縦に書く
  const r = d.id.endsWith("_line") ? s.r2 - 32 : d.zone === "infield" ? 102 : 170;
  // ショートとセカンドは二塁ベースをはさんで隣り合うので、文字が重ならないよう少し外側に振る
  const angle = d.id === "ss" ? -15 : d.id === "2b" ? 15 : mid;
  const [x, y] = pt(r, angle).split(" ").map(Number);
  return { x, y: y + 4 };
}

const SHORT: Partial<Record<string, string>> = { c: "捕", p: "投" };
const SHOWN = DIRECTIONS.filter((d) => !d.hidden);

type Props = {
  /** 未選択のときに図の下に出す説明 */
  hint?: string;
  value: Direction | undefined;
  onChange: (d: Direction | undefined) => void;
};

/** 打球が飛んだ位置をグラウンドの図から選ぶ（もう一度押すと解除） */
export function FieldPicker({ value, onChange, hint = "図をタップして打球の位置を選べます（任意）" }: Props) {
  const selected = directionDef(value)?.id;
  const pick = (id: Direction) => onChange(selected === id ? undefined : id);
  return (
    <div className="field-picker">
      <svg viewBox="0 30 300 232" role="group" aria-label="打球の位置">
        {SHOWN.map((d) => {
          const s = shapeOf(d);
          const cls = `zone ${d.zone}${d.gap ? " gap" : ""}${selected === d.id ? " on" : ""}`;
          const common = {
            className: cls,
            role: "button",
            "aria-label": d.label,
            "aria-pressed": selected === d.id,
            tabIndex: 0,
            onClick: () => pick(d.id),
            onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && pick(d.id),
          };
          return s.kind === "circle" ? <circle key={d.id} cx={s.cx} cy={s.cy} r={s.r} {...common} /> : <path key={d.id} d={s.d} {...common} />;
        })}
        {/* 塁 */}
        <path className="diamond" d={`M ${pt(0, 0)} L ${pt(72, -45)} L ${pt(102, 0)} L ${pt(72, 45)} Z`} />
        {SHOWN.map((d) => {
          const { x, y } = labelPos(d);
          const vertical = d.id.endsWith("_line");
          const text = SHORT[d.id] ?? d.label;
          return (
            <text
              key={d.id}
              x={x}
              y={y}
              className={`zone-label${d.zone === "infield" && !SHORT[d.id] ? " infield" : ""}${selected === d.id ? " on" : ""}`}
              textAnchor="middle"
              // 線際は細いので、ファウルラインに沿って斜めに書く
              transform={vertical ? `rotate(${d.from! < 0 ? 90 + (d.from! + d.to!) / 2 : -90 + (d.from! + d.to!) / 2} ${x} ${y - 4})` : undefined}
            >
              {text}
            </text>
          );
        })}
      </svg>
      <p className="field-picker-value">{selected ? `打球の位置：${directionDef(selected)!.label}` : hint}</p>
    </div>
  );
}
