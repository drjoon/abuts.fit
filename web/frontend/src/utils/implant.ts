export type ImplantDisplaySource = {
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantSystem?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
};

function normalizeImplantPart(value?: string | null) {
  return String(value || "").trim();
}

function isKnownImplantFamily(value?: string | null) {
  const normalized = normalizeImplantPart(value).toLowerCase();
  return [
    "regular",
    "mini",
    "narrow",
    "wide",
    "anyone regular",
    "bone level",
    "tissue level",
  ].includes(normalized);
}

export function formatImplantDisplay(source?: ImplantDisplaySource | null) {
  const manufacturer = normalizeImplantPart(source?.implantManufacturer);
  const rawBrand = normalizeImplantPart(
    source?.implantBrand || source?.implantSystem,
  );
  const rawFamily = normalizeImplantPart(source?.implantFamily);
  const rawType = normalizeImplantPart(source?.implantType);

  const family = rawFamily || (isKnownImplantFamily(rawBrand) ? rawBrand : "");
  const brand = rawFamily
    ? rawBrand
    : isKnownImplantFamily(rawBrand)
      ? "-"
      : rawBrand;
  const type = rawType;

  if (!manufacturer && !rawBrand && !family && !type) {
    return "-";
  }

  return `${manufacturer || "-"} / ${brand || "-"} / ${family || "-"} / ${type || "-"}`;
}
