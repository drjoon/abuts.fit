import assert from "node:assert/strict";
import { buildHexRowsFromManufacturerChoices, resolveExoCadManufacturerHexRotation } from "../../utils/designSoftwareHex.js";

describe("buildHexRowsFromManufacturerChoices", () => {
  test("제조사마다 다른 회전을 유지한다", () => {
    const verifiedAt = new Date("2026-10-13T00:00:00Z");
    const rows = buildHexRowsFromManufacturerChoices(
      [],
      [
        { manufacturer: "OSSTEM", applyHex30: true, confirmed: true },
        { manufacturer: "DENTIUM", applyHex30: false, confirmed: true },
      ],
      { verifiedAt, verifiedBy: "admin" },
    );
    const osstem = rows.find((item) => item.manufacturer === "OSSTEM");
    const dentium = rows.find((item) => item.manufacturer === "DENTIUM");
    assert.equal(osstem.verifiedHex, "헥스30도회전");
    assert.equal(osstem.applyHex30, true);
    assert.equal(osstem.verifiedBy, "admin");
    assert.equal(dentium.verifiedHex, "STL모델대로");
    assert.equal(dentium.applyHex30, false);
    assert.equal(rows.length, 2);
  });

  test("미확정이면 회전만 두고 확정값을 지운다", () => {
    const rows = buildHexRowsFromManufacturerChoices(
      [
        {
          manufacturer: "OSSTEM",
          applyHex30: true,
          verifiedHex: "헥스30도회전",
          verifiedBy: "old",
        },
      ],
      [{ manufacturer: "OSSTEM", applyHex30: false, confirmed: false }],
    );
    const osstem = rows.find((item) => item.manufacturer === "OSSTEM");
    assert.equal(osstem.applyHex30, false);
    assert.equal(osstem.verifiedHex, null);
    assert.equal(osstem.verifiedBy, null);
  });

  test("선택이 없으면 기존 행을 유지한다", () => {
    const rows = buildHexRowsFromManufacturerChoices(
      [{ manufacturer: "DIO", applyHex30: false, verifiedHex: null }],
      [],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].manufacturer, "DIO");
    assert.equal(rows[0].applyHex30, false);
  });
});

describe("resolveExoCadManufacturerHexRotation", () => {
  test("ExoCAD 3.2는 계정에 심긴 30° 기본값으로 덮지 않는다", () => {
    const mode = resolveExoCadManufacturerHexRotation({
      designSoftware: "ExoCAD",
      exoCadVersion: "ge_3_2",
      implantManufacturer: "NEOBIOTECH",
      manufacturerDefault: "헥스30도회전",
      userRequestSettings: {
        defaultManufacturerHexRotation: "헥스30도회전",
        hexByImplantManufacturer: [
          { manufacturer: "NEOBIOTECH", applyHex30: true, verifiedHex: "헥스30도회전" },
        ],
      },
    });
    assert.equal(mode, "STL모델대로");
  });

  test("ExoCAD 3.0 이하는 제조사별 시드를 유지한다", () => {
    const mode = resolveExoCadManufacturerHexRotation({
      designSoftware: "ExoCAD",
      exoCadVersion: "le_3_0",
      implantManufacturer: "DENTIUM",
      manufacturerDefault: "STL모델대로",
      userRequestSettings: {
        hexByImplantManufacturer: [
          { manufacturer: "DENTIUM", applyHex30: true },
        ],
      },
    });
    assert.equal(mode, "헥스30도회전");
  });

  test("3Shape는 계정 기본 플러스 모드를 유지한다", () => {
    const mode = resolveExoCadManufacturerHexRotation({
      designSoftware: "3Shape",
      manufacturerDefault: "STL모델+",
    });
    assert.equal(mode, "STL모델+");
  });
});
