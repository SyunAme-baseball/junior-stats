import { expect, it } from "vitest";
import { makeDemo } from "./demo";
import { replay } from "./domain/engine";

it("サンプル試合は最後まで進んで終わる", () => {
  const { game } = makeDemo();
  const s = replay(game);
  console.log(s.runs, s.inning, s.half, s.finished, s.endReason, s.decisions);
  expect(s.finished).toBe(true);
  expect(s.outcomes.every((o) => o.warnings.length === 0)).toBe(true);
});
