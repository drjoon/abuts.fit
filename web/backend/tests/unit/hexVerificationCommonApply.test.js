import assert from "node:assert/strict";
import {
  CNC_HEX_IMPLANT_MANUFACTURERS,
  buildVerifiedHexRowsForAllManufacturers,
} from "../../utils/designSoftwareHex.js";

describe("buildVerifiedHexRowsForAllManufacturers", () => {
  test("한 회전을 전 제조사 확정으로 채운다", () => {
    const verifiedAt = new Date("2026-10-13T00:00:00Z");
    const rows = buildVerifiedHexRowsForAllManufacturers([], "헥스30도회전", {
      verifiedAt,
      verifiedBy: "admin",
    });
    assert.equal(rows.length, CNC_HEX_IMPLANT_MANUFACTURERS.length);
    for (const manufacturer of CNC_HEX_IMPLANT_MANUFACTURERS) {
      const row = rows.find((item) => item.manufacturer === manufacturer);
      assert.ok(row);
      assert.equal(row.verifiedHex, "헥스30도회전");
      assert.equal(row.applyHex30, true);
      assert.equal(row.verifiedBy, "admin");
    }
  });

  test("기존 30° 행을 STL모델대로로 덮어쓴다", () => {
    const rows = buildVerifiedHexRowsForAllManufacturers(
      [
        {
          manufacturer: "OSSTEM",
          applyHex30: true,
          verifiedHex: "헥스30도회전",
        },
      ],
      "STL모델대로",
    );
    const osstem = rows.find((item) => item.manufacturer === "OSSTEM");
    assert.equal(osstem.verifiedHex, "STL모델대로");
    assert.equal(osstem.applyHex30, false);
    assert.equal(rows.length, CNC_HEX_IMPLANT_MANUFACTURERS.length);
  });

  test("허용되지 않은 회전은 기존 행을 유지한다", () => {
    const rows = buildVerifiedHexRowsForAllManufacturers(
      [{ manufacturer: "DIO", applyHex30: false, verifiedHex: null }],
      "nope",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].manufacturer, "DIO");
    assert.equal(rows[0].applyHex30, false);
  });
});
