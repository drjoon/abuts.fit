import { describe, expect, it } from "vitest";
import {
  BUILTIN_LAB_STYLE_PROFILES,
  labStyleOverridesForTooth,
  mergeDesignParamLayers,
  parseCustomAbutmentLabStyle,
  resolveActiveLabStyleProfile,
} from "@/shared/practice/customAbutmentLabStyle";

describe("customAbutmentLabStyle", () => {
  it("defaults to uri-altoran built-in profile", () => {
    const profile = resolveActiveLabStyleProfile(null);
    expect(profile.id).toBe("uri-altoran");
    expect(BUILTIN_LAB_STYLE_PROFILES.some((p) => p.id === profile.id)).toBe(true);
  });

  it("applies anterior labial bevel from uri-altoran", () => {
    const overrides = labStyleOverridesForTooth("21", parseCustomAbutmentLabStyle(null));
    expect(overrides.postLabialBevelMm).toBe(1.8);
  });

  it("merges lab style under preference and case overrides", () => {
    const merged = mergeDesignParamLayers({
      toothNumber: "21",
      labStyle: parseCustomAbutmentLabStyle(null),
      preference: { postLabialBevelMm: 2.2 },
      caseOverrides: { marginShoulderMm: 0.35 },
    });
    expect(merged.postLabialBevelMm).toBe(2.2);
    expect(merged.marginShoulderMm).toBe(0.35);
  });

  it("neutral profile leaves no overrides", () => {
    const lib = parseCustomAbutmentLabStyle({ activeId: "neutral", profiles: [] });
    expect(labStyleOverridesForTooth("21", lib)).toEqual({});
  });
});
