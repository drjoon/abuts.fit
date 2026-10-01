import { describe, expect, test } from "@jest/globals";
import {
  collapseParsedLibraries,
  describeLibrary,
  harvestLibraryMeta,
  libraryMatchesMaker,
  splitScanbodyCode,
} from "../../utils/scanbodyLibraryIdentity.js";

describe("splitScanbodyCode", () => {
  test("규격 접미사를 연결 코드에서 뗀다", () => {
    expect(splitScanbodyCode("C1W_LL_H55")).toEqual({ family: "C1W", spec: "LL H55", code: "C1W_LL_H55" });
    expect(splitScanbodyCode("BG41_LS").family).toBe("BG41");
    expect(splitScanbodyCode("BG41_LL_H40").spec).toBe("LL H40");
    expect(splitScanbodyCode("BG41_CMFit").spec).toBe("CMFit");
    expect(splitScanbodyCode("BG37_LS").family).toBe("BG37");
    expect(splitScanbodyCode("C13_H55")).toEqual({ family: "C13", spec: "H55", code: "C13_H55" });
  });

  test("사람 이름과 규격이 없는 코드는 그대로 둔다", () => {
    expect(splitScanbodyCode("오스템US 스캔바디").spec).toBe("");
    expect(splitScanbodyCode("Regular").spec).toBe("");
  });
});

describe("describeLibrary", () => {
  test("경로의 제조사·브랜드와 코드의 연결을 한 제목으로 만든다", () => {
    const row = describeLibrary({
      systemName: "BG41_LL_H55",
      filePath: "OSSTEM/US/BG41_LL_H55.dme",
    });
    expect(row.manufacturer).toBe("OSSTEM");
    expect(row.brand).toBe("US");
    expect(row.implantType).toBe("BG41");
    expect(row.spec).toBe("LL H55");
    expect(row.title).toBe("OSSTEM US BG41");
    expect(row.groupKey).toBe(describeLibrary({ systemName: "BG41_LS", filePath: "OSSTEM/US/BG41_LS.dme" }).groupKey);
    expect(row.groupKey).not.toBe(describeLibrary({ systemName: "BG37_LS", filePath: "OSSTEM/US/BG37_LS.dme" }).groupKey);
  });

  test("메타가 없으면 같은 연결의 규격만 같은 묶음이 된다", () => {
    const ls = describeLibrary({ systemName: "BG41_LS" });
    const cm = describeLibrary({ systemName: "BG41_CMFit" });
    expect(ls.title).toBe("BG41");
    expect(ls.groupKey).toBe(cm.groupKey);
  });
});

describe("collapseParsedLibraries", () => {
  test("한 파일 안의 규격 시스템을 키트로 합친다", () => {
    const lib = (name) => ({
      source: "3shape",
      systemName: name,
      fileNames: [`${name}.dme`],
      containerVersions: ["2016-1"],
      parts: new Map([[name, { hash: name, name }]]),
      kits: new Map([[name, { kitId: name, name, scanAbutmentPartIds: [name] }]]),
    });
    const [group] = collapseParsedLibraries(
      [lib("BG41_LS"), lib("BG41_LL_H55"), lib("BG37_LS")],
      "OSSTEM/US/library.dme",
      { manufacturer: "OSSTEM", brand: "US" },
    ).sort((a, b) => a.systemName.localeCompare(b.systemName));
    expect(group.systemName).toBe("OSSTEM US BG37");
    const titles = collapseParsedLibraries(
      [lib("BG41_LS"), lib("BG41_LL_H55"), lib("BG41_CMFit")],
      "BG41.dme",
    );
    expect(titles).toHaveLength(1);
    expect(titles[0].systemName).toBe("BG41");
    expect(titles[0].implantType).toBe("BG41");
    expect([...titles[0].kits.values()].map((kit) => kit.spec).sort()).toEqual(["CMFit", "LL H55", "LS"]);
  });
});

describe("libraryMatchesMaker", () => {
  test("영문 제조사와 한글 의뢰 이름을 같은 것으로 본다", () => {
    const lib = {
      systemName: "OSSTEM US BG41",
      manufacturers: ["OSSTEM"],
      implantManufacturer: "OSSTEM",
      brand: "US",
      fileNames: [],
    };
    expect(libraryMatchesMaker(lib, "오스템US")).toBe(true);
    expect(libraryMatchesMaker(lib, "지오메디")).toBe(false);
  });
});

describe("harvestLibraryMeta", () => {
  test("Supplier와 Brand 텍스트만 고른다", () => {
    expect(
      harvestLibraryMeta({
        ImplantLibraryEntry: { Supplier: "OSSTEM", DisplayInformation: "무시", Brand: "TS3" },
      }),
    ).toMatchObject({ manufacturer: "OSSTEM", brand: "TS3" });
  });
});
