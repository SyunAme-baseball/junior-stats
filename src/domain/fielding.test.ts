import { describe, expect, it } from "vitest";
import { fielderFromDirection, fieldingText } from "./fielding";

describe("守備の流れ", () => {
  it("セカンドゴロを本塁へ送球し、キャッチャーが捕れなかった", () => {
    expect(fieldingText({ batted: "grounder", fieldedBy: 4, throwTo: 4, fielder: 2, errorType: "receiving" })).toBe(
      "セカンドゴロ、本塁へ送球、キャッチャーが送球を捕れずエラー",
    );
  });
  it("悪送球・打球のエラー・未入力", () => {
    expect(fieldingText({ batted: "grounder", fieldedBy: 6, throwTo: 1, fielder: 6, errorType: "throwing" })).toBe("ショートゴロ、一塁へ送球、ショートが悪送球");
    expect(fieldingText({ batted: "fly", fieldedBy: 7, fielder: 7, errorType: "fielding" })).toBe("レフトフライ、レフトが打球を捕れずエラー");
    expect(fieldingText({})).toBeNull();
  });
  it("方向から捕った人の初期値", () => {
    expect(fielderFromDirection("2b")).toBe(4);
    expect(fielderFromDirection("lcf")).toBeUndefined();
  });
});

describe("ヒットのあとのエラーの見出し", () => {
  it("ライト前ヒット、二塁へ送球、ライトが悪送球", async () => {
    const { headline, makeNameOf } = await import("./describe");
    void makeNameOf;
    const o = { play: { id: "x", type: "pa", result: "single", batterId: "b", moves: [], direction: "rf", fielder: 9, errorType: "throwing", throwTo: 2, createdAt: 0 } } as never;
    expect(headline(o, () => "山田選手")).toBe("山田選手：ライト前ヒット、二塁へ送球、ライトが悪送球");
  });
});
