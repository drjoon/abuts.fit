// related files:
// - web/backend/utils/labPracticeScrewSupply.js
import {
  ensureCanonicalPackingScrewLotItems,
  findLabPracticeScrewSupply,
  normalizeScrewSupply,
  formatPrintedScrewLine,
  resolvePackingScrewType,
  resolveScrewSupply,
  toPracticeNameKey,
  upsertLabPracticeScrewSupplyList,
} from "../../utils/labPracticeScrewSupply.js";

const OID_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OID_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("labPracticeScrewSupply", () => {
  test("normalizeScrewSupply accepts the two choices", () => {
    expect(normalizeScrewSupply("abuts")).toBe("abuts");
    expect(normalizeScrewSupply("manufacturer")).toBe("manufacturer");
    expect(normalizeScrewSupply("  ")).toBeNull();
    expect(normalizeScrewSupply("A")).toBeNull();
  });

  test("toPracticeNameKey ignores spaces and case", () => {
    expect(toPracticeNameKey(" 테스트 치과 ")).toBe("테스트치과");
    expect(toPracticeNameKey("Osstem Dental")).toBe("osstemdental");
  });

  test("upsert replaces the same practice and keeps the other", () => {
    const first = upsertLabPracticeScrewSupplyList([], {
      practiceAnchorId: OID_A,
      practiceName: "테스트치과",
      screwSupply: "abuts",
    });
    expect(findLabPracticeScrewSupply(first, { practiceAnchorId: OID_A })).toBe(
      "abuts",
    );

    const second = upsertLabPracticeScrewSupplyList(first, {
      practiceName: "테스트 치과",
      screwSupply: "manufacturer",
    });
    expect(second).toHaveLength(1);
    expect(
      findLabPracticeScrewSupply(second, { practiceName: "테스트치과" }),
    ).toBe("manufacturer");

    const both = upsertLabPracticeScrewSupplyList(second, {
      practiceAnchorId: OID_B,
      practiceName: "다른치과",
      screwSupply: "abuts",
    });
    expect(both).toHaveLength(2);
    expect(findLabPracticeScrewSupply(both, { practiceAnchorId: OID_B })).toBe(
      "abuts",
    );
  });

  test("anchor id wins over a different name key", () => {
    const rows = upsertLabPracticeScrewSupplyList(
      [
        {
          practiceAnchorId: OID_A,
          practiceNameKey: "테스트치과",
          screwSupply: "manufacturer",
        },
      ],
      {
        practiceAnchorId: OID_A,
        practiceName: "바뀐이름",
        screwSupply: "abuts",
      },
    );
    expect(findLabPracticeScrewSupply(rows, { practiceAnchorId: OID_A })).toBe(
      "abuts",
    );
    expect(findLabPracticeScrewSupply(rows, { practiceName: "바뀐이름" })).toBe(
      "abuts",
    );
  });

  test("resolveScrewSupply falls through to the pair default then abuts", () => {
    expect(resolveScrewSupply("manufacturer", "abuts")).toBe("manufacturer");
    expect(resolveScrewSupply("", "manufacturer")).toBe("manufacturer");
    expect(resolveScrewSupply("", "")).toBe("abuts");
  });

  test("packing screw type is A-E for abuts and a full manufacturer name otherwise", () => {
    expect(
      resolvePackingScrewType({
        screwSupply: "abuts",
        implantManufacturer: "NEOBIOTECH",
        connectionScrewType: "a",
      }),
    ).toBe("A");
    expect(
      resolvePackingScrewType({
        screwSupply: "manufacturer",
        implantManufacturer: "네오바이오텍",
        connectionScrewType: "A",
      }),
    ).toBe("4");
    expect(
      resolvePackingScrewType({
        screwSupply: "manufacturer",
        implantManufacturer: "osstem",
      }),
    ).toBe("2");
    expect(
      resolvePackingScrewType({
        screwSupply: "manufacturer",
        implantManufacturer: "Unknown",
      }),
    ).toBe("");
  });

  test("canonical lot rows keep saved lots and append manufacturer types", () => {
    const next = ensureCanonicalPackingScrewLotItems([
      { type: "A", lotNumber: "JUN26-04" },
      { type: "custom", lotNumber: "X" },
    ]);
    expect(next.map((row) => row.type)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "CUSTOM",
    ]);
    expect(next[0].lotNumber).toBe("JUN26-04");
    expect(next.find((row) => row.type === "4")?.lotNumber).toBe("");
    expect(next.find((row) => row.type === "CUSTOM")?.lotNumber).toBe("X");
  });

  test("legacy manufacturer names remap onto numbers and keep the number lot", () => {
    const next = ensureCanonicalPackingScrewLotItems([
      { type: "DENTIUM", lotNumber: "FROM-NAME" },
      { type: "1", lotNumber: "FROM-NUMBER" },
      { type: "OSSTEM", lotNumber: "LOT-2" },
    ]);
    expect(next.find((row) => row.type === "1")?.lotNumber).toBe("FROM-NUMBER");
    expect(next.find((row) => row.type === "2")?.lotNumber).toBe("LOT-2");
    expect(next.some((row) => row.type === "DENTIUM")).toBe(false);
  });

  test("printed screw line keeps A-E then manufacturer numbers", () => {
    expect(
      formatPrintedScrewLine(["NEOBIOTECH", "-", "A", "neobiotech", "OSSTEM"]),
    ).toBe("스크류 A · 2 · 4");
    expect(formatPrintedScrewLine(["-", ""])).toBe("");
  });
});
