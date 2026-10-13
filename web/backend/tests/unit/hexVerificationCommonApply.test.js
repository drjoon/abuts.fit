import assert from "node:assert/strict";
import { buildHexRowsFromManufacturerChoices } from "../../utils/designSoftwareHex.js";

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
