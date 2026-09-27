// related files:
// - web/backend/utils/labDesignPresets.js
import { normalizeLabDesignPresets } from "../../utils/labDesignPresets.js";

const params = (patch = {}) => ({
  method: "milling",
  material: "zirconia",
  toolRadiusMm: 0.6,
  minThicknessMm: 0.5,
  cementGapMm: 0.03,
  extraGapMm: 0.03,
  sealGapMm: 0.02,
  sealHeightMm: 1,
  marginWidthMm: 0.15,
  marginAngleDeg: 45,
  ...patch,
});

const preset = (id, patch = {}) => ({
  id,
  name: `프리셋 ${id}`,
  crown: params(),
  cavity: params(),
  implant: params(),
  ...patch,
});

describe("normalizeLabDesignPresets", () => {
  test("empty list returns null", () => {
    expect(normalizeLabDesignPresets({ presets: [] })).toBeNull();
    expect(normalizeLabDesignPresets(null)).toBeNull();
  });

  test("clamps numbers and drops print tool radius", () => {
    const out = normalizeLabDesignPresets({
      presets: [
        preset("a", {
          crown: params({ method: "print", material: "zirconia", cementGapMm: 5 }),
        }),
      ],
      defaultId: "a",
    });
    expect(out.presets[0].crown).toMatchObject({
      method: "print",
      material: "resin",
      toolRadiusMm: 0,
      cementGapMm: 0.3,
    });
  });

  test("drops rows with missing numbers, duplicate ids, unknown default", () => {
    const out = normalizeLabDesignPresets({
      presets: [
        preset("a"),
        preset("a"),
        preset("b", { implant: params({ sealGapMm: "x" }) }),
        preset("c"),
      ],
      defaultId: "zzz",
    });
    expect(out.presets.map((row) => row.id)).toEqual(["a", "c"]);
    expect(out.defaultId).toBe("a");
  });
});
