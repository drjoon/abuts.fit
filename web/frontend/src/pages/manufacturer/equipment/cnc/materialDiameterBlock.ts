export type MaterialDiameterBlocker = {
  requestId: string;
  patientName: string;
  clinicName: string;
  tooth: string;
  maxDiameter: number;
  requiredGroup: string;
  inProgress: boolean;
};

export class MaterialDiameterBlockedError extends Error {
  diameter: number;
  items: MaterialDiameterBlocker[];

  constructor(
    diameter: number,
    items: MaterialDiameterBlocker[],
    message?: string,
  ) {
    super(message || "이 직경으로 가공할 수 없는 대기 건이 있습니다.");
    this.name = "MaterialDiameterBlockedError";
    this.diameter = diameter;
    this.items = items;
  }
}

export function readMaterialDiameterBlocked(
  body: unknown,
): MaterialDiameterBlockedError | null {
  if (!body || typeof body !== "object") return null;
  const record = body as {
    code?: unknown;
    message?: unknown;
    data?: { diameter?: unknown; items?: unknown };
  };
  if (record.code !== "MATERIAL_DIAMETER_BLOCKED") return null;
  const rawItems = Array.isArray(record.data?.items) ? record.data.items : [];
  const diameter = Number(record.data?.diameter);
  const items = rawItems
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const maxDiameter = Number(item.maxDiameter);
      return {
        requestId: String(item.requestId || "").trim(),
        patientName: String(item.patientName || "").trim(),
        clinicName: String(item.clinicName || "").trim(),
        tooth: String(item.tooth || "").trim(),
        maxDiameter: Number.isFinite(maxDiameter) ? maxDiameter : 0,
        requiredGroup: String(item.requiredGroup || "").trim(),
        inProgress: item.inProgress === true,
      } satisfies MaterialDiameterBlocker;
    })
    .filter((row): row is MaterialDiameterBlocker => Boolean(row?.requestId));
  return new MaterialDiameterBlockedError(
    Number.isFinite(diameter) ? diameter : 0,
    items,
    typeof record.message === "string" ? record.message : undefined,
  );
}
