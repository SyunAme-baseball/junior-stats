import { describe, expect, it } from "vitest";
import { resultLabel } from "./describe";

describe("打球の位置つきの結果名", () => {
  it("外野の正面は「〇〇前ヒット」", () => {
    expect(resultLabel("single", "lf")).toBe("レフト前ヒット");
    expect(resultLabel("single", "cf")).toBe("センター前ヒット");
  });
  it("線際・野手の間・内野", () => {
    expect(resultLabel("double", "lf_line")).toBe("レフト線への二塁打");
    expect(resultLabel("triple", "rcf")).toBe("右中間への三塁打");
    expect(resultLabel("single", "ss3b")).toBe("三遊間を破るヒット");
    expect(resultLabel("infield_single", "ss")).toBe("ショートへの内野安打");
    expect(resultLabel("error", "2b")).toBe("エラーで出塁（セカンド）");
  });
  it("以前の版の3方向も読める", () => {
    expect(resultLabel("single", "right")).toBe("ライト前ヒット");
    expect(resultLabel("home_run", "left")).toBe("レフトへのホームラン");
  });
  it("位置なしは結果名だけ", () => {
    expect(resultLabel("double")).toBe("二塁打");
  });
});

describe("アウトの結果名（守備位置が名前に入るものは方向を重ねない）", () => {
  it("ゴロ・フライ・ライナー", () => {
    expect(resultLabel("go_ss", "ss3b")).toBe("ショートゴロ");
    expect(resultLabel("fo_lf", "lf_line")).toBe("レフトフライ");
    expect(resultLabel("fo_if", "2b")).toBe("セカンドフライ");
    expect(resultLabel("line_out", "ss")).toBe("ショートライナー");
  });
});
