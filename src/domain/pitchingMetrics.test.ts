import { describe, expect, it } from "vitest";
import { fmtKbb, fmtPct, fmtRatio, kPerBb, strikeRate, whip } from "./pitchingMetrics";

const base = { outs: 15, h: 4, bb: 2, so: 6, bf: 22, pitches: 80, strikes: 50 };

describe("投手の指標", () => {
  it("K/BB・ストライク率・WHIP", () => {
    expect(kPerBb(base)).toBe(3);
    expect(fmtPct(strikeRate(base))).toBe("62.5%");
    expect(fmtRatio(whip(base))).toBe("1.20"); // (2+4)/5回
  });
  it("計算できないときは —", () => {
    expect(fmtKbb({ ...base, bb: 0 })).toBe("6/0");
    expect(whip({ ...base, outs: 0 })).toBeNull();
    // 1球ごとの入力をしていない（球数＝打者数）
    expect(strikeRate({ ...base, pitches: 22, strikes: 20 })).toBeNull();
  });
});
