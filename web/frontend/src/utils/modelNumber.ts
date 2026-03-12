export function generateModelNumber(
  caseInfos?: {
    taperAngle?: number | null;
    maxDiameter?: number | null;
    totalLength?: number | null;
  } | null,
  lotNumber?: string | null
): string {
  if (!caseInfos) return "";

  const formatPart = (val?: number | null) => {
    if (typeof val !== "number" || isNaN(val)) return "000";
    return Math.round(val * 10)
      .toString()
      .padStart(3, "0");
  };

  const aaa = formatPart(caseInfos.taperAngle);
  const ddd = formatPart(caseInfos.maxDiameter);
  const lll = formatPart(caseInfos.totalLength);

  if (aaa === "000" && ddd === "000" && lll === "000") return "";

  let shortLot = "000";
  if (lotNumber) {
    shortLot = lotNumber
      .trim()
      .replace(/^CA(P)?/i, "")
      .slice(-3)
      .toUpperCase();
  }

  return `${aaa}${ddd}${lll}-${shortLot}`;
}
