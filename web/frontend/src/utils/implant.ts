// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
export type ImplantDisplaySource = {
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
  newSystemRequest?: {
    requested?: boolean;
    manufacturer?: string | null;
    brand?: string | null;
    family?: string | null;
  } | null;
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
  const nsr = source?.newSystemRequest;
  if (nsr?.requested) {
    const parts = [nsr.manufacturer, nsr.brand, nsr.family]
      .map(normalizeImplantPart)
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" / ");
    }
  }

  const manufacturer = normalizeImplantPart(source?.implantManufacturer);
  const rawBrand = normalizeImplantPart(source?.implantBrand);
  const rawFamily = normalizeImplantPart(source?.implantFamily);
  const rawType = normalizeImplantPart(source?.implantType);
  const family = rawFamily || (isKnownImplantFamily(rawBrand) ? rawBrand : "");
  const brand = isKnownImplantFamily(rawBrand) ? "-" : rawBrand;
  const type = rawType;

  if (!manufacturer && !rawBrand && !family && !type) {
    return "-";
  }

  return `${manufacturer || "-"} / ${brand || "-"} / ${family || "-"} / ${type || "-"}`;
}
