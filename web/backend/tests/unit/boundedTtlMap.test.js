import { describe, expect, it } from "@jest/globals";
import {
  getTtlMapValue,
  observeTimestampMap,
  pruneStampListMap,
  setTtlMapValue,
} from "../../utils/boundedTtlMap.js";

describe("boundedTtlMap", () => {
  it("다른 키를 쓸 때 만료된 항목을 지운다", () => {
    const store = new Map();
    setTtlMapValue(store, "a", { n: 1 }, 1000, 10, 1_000);
    setTtlMapValue(store, "b", { n: 2 }, 1000, 10, 5_000);
    expect(store.has("a")).toBe(false);
    expect(getTtlMapValue(store, "b", 5_000)).toEqual({ n: 2 });
  });

  it("상한을 넘기면 먼저 들어온 키를 빼고, 방금 갱신한 키는 남긴다", () => {
    const store = new Map();
    setTtlMapValue(store, "a", 1, 10_000, 2, 1_000);
    setTtlMapValue(store, "b", 2, 10_000, 2, 1_100);
    setTtlMapValue(store, "a", 3, 10_000, 2, 1_200);
    setTtlMapValue(store, "c", 4, 10_000, 2, 1_300);
    expect([...store.keys()]).toEqual(["a", "c"]);
    expect(getTtlMapValue(store, "a", 1_300)).toBe(3);
  });

  it("타임스탬프 맵은 창이 지나기 전에 시각을 밀지 않고, 쉰 키는 뺀다", () => {
    const store = new Map();
    expect(observeTimestampMap(store, "job", 1_000, 60_000, 10)).toBe(true);
    expect(observeTimestampMap(store, "job", 20_000, 60_000, 10)).toBe(false);
    expect(store.get("job")).toBe(1_000);
    observeTimestampMap(store, "other", 70_000, 60_000, 10);
    expect(store.has("job")).toBe(false);
    expect(observeTimestampMap(store, "job", 70_000, 60_000, 10)).toBe(true);
  });

  it("호출 시각 목록은 오래 쉰 키를 상한과 함께 줄인다", () => {
    const store = new Map();
    store.set("old", [1_000]);
    store.set("live", [9_000]);
    pruneStampListMap(store, 5_000, 10, 10_000);
    expect(store.has("old")).toBe(false);
    expect(store.has("live")).toBe(true);

    const capped = new Map();
    capped.set("a", [10_000]);
    capped.set("b", [10_000]);
    capped.set("c", [10_000]);
    pruneStampListMap(capped, 5_000, 2, 10_000);
    expect([...capped.keys()]).toEqual(["b", "c"]);
  });
});
