export type ImplantDisplaySource = {
  implantManufacturer?: string | null;
  implantSystem?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
};

function normalizeImplantPart(value?: string | null) {
  return String(value || "").trim();
}

export function formatImplantDisplay(source?: ImplantDisplaySource | null) {
  const manufacturer = normalizeImplantPart(source?.implantManufacturer);
  const brand = normalizeImplantPart(source?.implantSystem);
  const family = normalizeImplantPart(source?.implantFamily);
  const type = normalizeImplantPart(source?.implantType);

  if (!manufacturer && !brand && !family && !type) {
    return "-";
  }

  return `${manufacturer || "-"} / ${brand || "-"} / ${family || "-"} / ${type || "-"}`;
}
