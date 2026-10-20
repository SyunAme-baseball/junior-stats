import { describe, expect, it } from "vitest";
import { clockStatus, defaultTimeLimit, durationLabel, formatDuration } from "./gameClock";

describe("試合時間", () => {
  it("5・6年生は90分、それ以外は80分", () => {
    expect(defaultTimeLimit("6年生")).toBe(90);
    expect(defaultTimeLimit("5年生")).toBe(90);
    expect(defaultTimeLimit("4年生")).toBe(80);
    expect(defaultTimeLimit("3年生以下")).toBe(80);
  });

  it("経過時間の表示", () => {
    expect(formatDuration(65_000)).toBe("01:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(durationLabel(92 * 60000 + 30_000)).toBe("1時間32分");
    expect(durationLabel(45 * 60000)).toBe("45分");
  });

  it("残り10分で注意、時間を過ぎたら時間切れ", () => {
    const start = 1_000_000;
    expect(clockStatus(undefined, undefined, 90, 0)).toBe("ready");
    expect(clockStatus(start, undefined, 90, start + 79 * 60000)).toBe("running");
    expect(clockStatus(start, undefined, 90, start + 81 * 60000)).toBe("soon");
    expect(clockStatus(start, undefined, 90, start + 91 * 60000)).toBe("over");
    expect(clockStatus(start, undefined, 0, start + 200 * 60000)).toBe("running");
    expect(clockStatus(start, start + 50 * 60000, 90, start + 91 * 60000)).toBe("ended");
  });
});
