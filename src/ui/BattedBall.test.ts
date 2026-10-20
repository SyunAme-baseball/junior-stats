import { describe, expect, it } from "vitest";
import { outResult } from "./BattedBall";

describe("打球の種類と方向からアウトの結果を決める", () => {
  it("ゴロは方向の守備位置", () => {
    expect(outResult("grounder", "ss")).toBe("go_ss");
    expect(outResult("grounder", "ss3b")).toBe("go_ss");
    expect(outResult("grounder", "1b2b")).toBe("go_2b");
    expect(outResult("grounder", "p")).toBe("go_p");
  });
  it("フライは外野3つか内野フライ", () => {
    expect(outResult("fly", "lf_line")).toBe("fo_lf");
    expect(outResult("fly", "rcf")).toBe("fo_cf");
    expect(outResult("fly", "3b")).toBe("fo_if");
  });
  it("ライナー", () => {
    expect(outResult("liner", "cf")).toBe("line_out");
  });
});
