// related files:
// - web/backend/utils/labPracticeScrewSupply.js
import {
  findLabPracticeScrewSupply,
  normalizeScrewSupply,
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
});
