import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** 文字列をQRコードにする。入りきらないときは null */
export function makeQr(text: string): { size: number; path: string } | null {
  try {
    // 画面に映して読み取るだけなので、たくさん入る誤り訂正レベルLにする
    const qr = qrcode(0, "L");
    qr.addData(text, "Byte");
    qr.make();
    const size = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return { size, path };
  } catch {
    return null;
  }
}

export function QrCode({ text, label }: { text: string; label: string }) {
  const qr = useMemo(() => makeQr(text), [text]);
  if (!qr) return null;
  const m = 4; // まわりの白い余白（読み取りに必要）
  return (
    <svg className="qr-code" viewBox={`${-m} ${-m} ${qr.size + m * 2} ${qr.size + m * 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-m} y={-m} width={qr.size + m * 2} height={qr.size + m * 2} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}
