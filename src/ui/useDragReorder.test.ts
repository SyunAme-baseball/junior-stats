import { describe, expect, it } from "vitest";
import { moveItem } from "./useDragReorder";

describe("打順の並べ替え", () => {
  it("1番を4番へ動かすと、2〜4番が1つずつ繰り上がる", () => {
    expect(moveItem(["A", "B", "C", "D", "E"], 0, 3)).toEqual(["B", "C", "D", "A", "E"]);
  });
  it("4番を1番へ動かすと、1〜3番が1つずつ繰り下がる", () => {
    expect(moveItem(["A", "B", "C", "D", "E"], 3, 0)).toEqual(["D", "A", "B", "C", "E"]);
  });
});
