// change-log:
// - 2026-09-03: ExoCAD 3.0 이하 × 임플란트 제조사별 verifiedHex/applyHex30 해석·잠금.
// - 2026-08-29: 헥스40도회전 → STL모델+(base=0) / 헥스30+(base=30) 분기. NC: T4848=C0.0(always), T0909/T0606만 addDeg=30+appliedDeg.
// - 2026-08-25: 관리자 헥스 확정 시 제조사 persist/승인 경로에서 저장 API 호출 스킵.
// - 2026-08-22: ExoCAD 관리자 헥스 확인 뱃지(확정/미정) SSOT helper.
// - 2026-08-06: 준비 단계 헥스 회전 기본값을 designSoftware 정책으로 우선(미저장 finalHexRotation STL 오적용 수정).
// related: NcFileGenerator.ApplyManufacturerHexRotationToNc, PreviewModal hex select

export type ManufacturerHexRotationCanonicalMode = "STL모델대로" | "헥스30도회전";
export type ManufacturerHexRotationPlusMode = "STL모델+" | "헥스30+";
export type ManufacturerHexRotationMode =
  | ManufacturerHexRotationCanonicalMode
  | ManufacturerHexRotationPlusMode;
export type ManufacturerHexRotationDraftMode = ManufacturerHexRotationMode | "";

export type HexByImplantManufacturerRow = {
  manufacturer?: string | null;
  applyHex30?: boolean | null;
  verifiedHex?: string | null;
  verifiedAt?: string | Date | null;
  verifiedBy?: string | null;
};

export const CNC_HEX_IMPLANT_MANUFACTURERS = [
  "OSSTEM",
  "DENTIUM",
  "NEOBIOTECH",
  "DIO",
  "MEGAGEN",
  "DENTIS",
] as const;

const MANUFACTURER_ALIASES: Record<string, string[]> = {
  OSSTEM: ["OSSTEM", "오스템"],
  DENTIUM: ["DENTIUM", "덴티움"],
  NEOBIOTECH: ["NEOBIOTECH", "NEO", "네오", "네오바이오텍"],
  DIO: ["DIO", "디오"],
  MEGAGEN: ["MEGAGEN", "메가젠"],
  DENTIS: ["DENTIS", "덴티스"],
};

export const normalizeImplantManufacturerKey = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  for (const [canonical, aliases] of Object.entries(MANUFACTURER_ALIASES)) {
    for (const alias of aliases) {
      const a = String(alias || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (a && (upper === a || raw === alias)) return canonical;
    }
    if (aliases.includes(raw)) return canonical;
  }
  return upper;
};

export const normalizeManufacturerHexRotationMode = (
  value: unknown,
): ManufacturerHexRotationMode | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "STL모델대로") return "STL모델대로";
  if (raw === "헥스30도회전") return "헥스30도회전";
  if (raw === "STL모델+") return "STL모델+";
  if (raw === "헥스30+") return "헥스30+";

  if (raw === "0") return "STL모델대로";
  if (raw === "30") return "헥스30도회전";

  // 레거시 헥스40/헥스10/기타 헥스X도회전 → STL모델+ (modeBase=0)
  if (raw === "헥스40도회전" || raw === "헥스10도회전") return "STL모델+";
  const matched = raw.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (!matched) return null;
  const parsedX = Number(matched[1]);
  if (!Number.isFinite(parsedX)) return null;
  if (parsedX === 30) return "헥스30도회전";
  return "STL모델+";
};

export const toManufacturerHexRotationLabel = (
  mode: ManufacturerHexRotationCanonicalMode,
): "STL모델대로" | "헥스30도회전" => {
  switch (mode) {
    case "STL모델대로":
      return "STL모델대로";
    case "헥스30도회전":
      return "헥스30도회전";
    default:
      throw new Error(`지원하지 않는 헥스 회전 모드: ${String(mode)}`);
  }
};

export const resolveRequestorHexRotationByDesignSoftware = (
  designSoftwareRaw: unknown,
  exoCadVersionRaw: unknown = null,
): ManufacturerHexRotationCanonicalMode | null => {
  const designSoftware = String(designSoftwareRaw || "").trim();
  if (!designSoftware) return null;
  if (designSoftware !== "ExoCAD") return "STL모델대로";
  const version = String(exoCadVersionRaw || "").trim();
  if (version === "ge_3_2" || version === "3.2" || version === ">=3.2") {
    return "STL모델대로";
  }
  return "헥스30도회전";
};

export const HEX_VERIFICATION_SAMPLE_LABEL = "헥스 확인용 무료 샘플";

export type HexVerificationBadgeLabel = "확정" | "미정";

type HexRequestSettingsLike = {
  designSoftware?: unknown;
  exoCadVersion?: unknown;
  hexVerificationResultHex?: unknown;
  hexByImplantManufacturer?: HexByImplantManufacturerRow[] | null;
} | null | undefined;

type HexRequestLike = {
  caseInfos?: HexCaseInfos;
  rnd?: { manufacturerHexRotation?: unknown } | null;
  business?: {
    requestSettings?: HexRequestSettingsLike;
  } | null;
  requestor?: {
    requestSettings?: HexRequestSettingsLike;
  } | null;
} | null | undefined;

export const normalizeHexVerificationResultHex = (
  value: unknown,
): ManufacturerHexRotationCanonicalMode | null => {
  const raw = String(value || "").trim();
  if (raw === "STL모델대로" || raw === "0") return "STL모델대로";
  if (raw === "헥스30도회전" || raw === "30") return "헥스30도회전";
  return null;
};

export const findHexByImplantManufacturerEntry = (
  settings: HexRequestSettingsLike,
  implantManufacturerRaw: unknown,
): HexByImplantManufacturerRow | null => {
  const key = normalizeImplantManufacturerKey(implantManufacturerRaw);
  if (!key) return null;
  const rows = Array.isArray(settings?.hexByImplantManufacturer)
    ? settings.hexByImplantManufacturer
    : [];
  return (
    rows.find(
      (row) => normalizeImplantManufacturerKey(row?.manufacturer) === key,
    ) || null
  );
};

/** User → (legacy BA) 임플란트 제조사별 관리자 확정 헥스 */
export const resolveAdminVerifiedHexFromRequest = (
  req?: HexRequestLike | null,
  implantManufacturerRaw?: unknown,
): ManufacturerHexRotationCanonicalMode | null => {
  const implantM =
    implantManufacturerRaw ?? req?.caseInfos?.implantManufacturer ?? null;
  const userRs = req?.requestor?.requestSettings;
  const baRs = req?.business?.requestSettings;

  if (implantM != null && String(implantM).trim()) {
    const fromUser = normalizeHexVerificationResultHex(
      findHexByImplantManufacturerEntry(userRs, implantM)?.verifiedHex,
    );
    if (fromUser) return fromUser;
    const fromBa = normalizeHexVerificationResultHex(
      findHexByImplantManufacturerEntry(baRs, implantM)?.verifiedHex,
    );
    if (fromBa) return fromBa;
  }

  return (
    normalizeHexVerificationResultHex(userRs?.hexVerificationResultHex) ||
    normalizeHexVerificationResultHex(baRs?.hexVerificationResultHex)
  );
};

export const resolveApplyHex30FromRequest = (
  req?: HexRequestLike | null,
  implantManufacturerRaw?: unknown,
): boolean => {
  const implantM =
    implantManufacturerRaw ?? req?.caseInfos?.implantManufacturer ?? null;
  const entry = findHexByImplantManufacturerEntry(
    req?.requestor?.requestSettings,
    implantM,
  );
  if (entry && typeof entry.applyHex30 === "boolean") return entry.applyHex30;
  return true;
};

/** ExoCAD 3.0 이하만 헥스 확인 뱃지. 그 외 null. */
export const resolveHexVerificationBadgeLabel = (
  req?: HexRequestLike | null,
): HexVerificationBadgeLabel | null => {
  const designSoftware = String(
    req?.caseInfos?.designSoftware ||
      req?.requestor?.requestSettings?.designSoftware ||
      req?.business?.requestSettings?.designSoftware ||
      "",
  ).trim();
  if (designSoftware !== "ExoCAD") return null;
  const exoCadVersion = String(
    req?.caseInfos?.exoCadVersion ||
      req?.requestor?.requestSettings?.exoCadVersion ||
      req?.business?.requestSettings?.exoCadVersion ||
      "",
  ).trim();
  if (
    exoCadVersion === "ge_3_2" ||
    exoCadVersion === "3.2" ||
    exoCadVersion === ">=3.2"
  ) {
    return null;
  }
  return resolveAdminVerifiedHexFromRequest(req) ? "확정" : "미정";
};

type HexCaseInfos = {
  hexRotation?: { mode?: unknown } | null;
  manufacturerHexRotation?: unknown;
  requestorHexRotation?: unknown;
  finalHexRotation?: unknown;
  designSoftware?: unknown;
  exoCadVersion?: unknown;
  implantManufacturer?: unknown;
  hexVerificationSample?: boolean | null;
  hexVerificationSampleManufacturer?: unknown;
  anodizingEnabled?: boolean | null;
  wideSplitEnabled?: boolean | null;
} | null | undefined;

export const isHexVerificationSampleRequest = (
  req?: HexRequestLike | null,
): boolean => Boolean(req?.caseInfos?.hexVerificationSample === true);

type HexCancelCompanionLike = {
  _id?: unknown;
  requestId?: unknown;
  referenceIds?: unknown;
  caseInfos?: HexCaseInfos;
} | null | undefined;

/**
 * 헥스 확인용 원본↔샘플 중 하나가 취소되면 목록에서 짝도 함께 제거한다.
 */
export const filterOutHexVerificationCancelCompanions = <
  T extends HexCancelCompanionLike,
>(
  list: T[],
  canceled: HexCancelCompanionLike,
): T[] => {
  const rows = Array.isArray(list) ? list : [];
  if (!canceled) return rows;

  const canceledRid = String(canceled.requestId || "").trim();
  const canceledRefs = (
    Array.isArray(canceled.referenceIds) ? canceled.referenceIds : []
  )
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const canceledIsSample = isHexVerificationSampleRequest(canceled);

  return rows.filter((item) => {
    const itemRid = String(item?.requestId || "").trim();
    if (canceledIsSample && itemRid && canceledRefs.includes(itemRid)) {
      return false;
    }
    if (
      isHexVerificationSampleRequest(item) &&
      canceledRid &&
      (Array.isArray(item?.referenceIds) ? item.referenceIds : [])
        .map((id) => String(id || "").trim())
        .includes(canceledRid)
    ) {
      return false;
    }
    return true;
  });
};

export const resolveDefaultPrepHexRotationMode = (
  req: HexRequestLike,
): ManufacturerHexRotationMode | null => {
  const savedHexRotationMode = normalizeManufacturerHexRotationMode(
    req?.caseInfos?.hexRotation?.mode,
  );
  const savedManufacturerHexMode =
    savedHexRotationMode ||
    normalizeManufacturerHexRotationMode(req?.rnd?.manufacturerHexRotation) ||
    normalizeManufacturerHexRotationMode(
      req?.caseInfos?.manufacturerHexRotation,
    );

  if (savedManufacturerHexMode) return savedManufacturerHexMode;

  const verified = resolveAdminVerifiedHexFromRequest(req);
  if (verified) return toManufacturerHexRotationLabel(verified);

  const designSoftware = String(req?.caseInfos?.designSoftware || "").trim();
  const exoCadVersion = req?.caseInfos?.exoCadVersion;
  if (
    designSoftware === "ExoCAD" &&
    String(exoCadVersion || "").trim() !== "ge_3_2" &&
    req?.caseInfos?.implantManufacturer
  ) {
    const applyHex30 = resolveApplyHex30FromRequest(req);
    return applyHex30 === false ? "STL모델대로" : "헥스30도회전";
  }

  const byDesignSoftware = resolveRequestorHexRotationByDesignSoftware(
    req?.caseInfos?.designSoftware,
    req?.caseInfos?.exoCadVersion,
  );
  if (byDesignSoftware) {
    return toManufacturerHexRotationLabel(byDesignSoftware);
  }

  return (
    normalizeManufacturerHexRotationMode(req?.caseInfos?.requestorHexRotation) ||
    null
  );
};

export const resolvePrepHexModeToPersist = (
  req: HexRequestLike,
  hexDraft?: unknown,
):
  | { persist: false }
  | { persist: true; mode: ManufacturerHexRotationMode }
  | { persist: false; missing: true } => {
  // 해당 임플란트 제조사 관리자 확정: 제조사 저장 API 호출 금지.
  if (resolveAdminVerifiedHexFromRequest(req)) {
    return { persist: false };
  }

  if (normalizeManufacturerHexRotationMode(req?.caseInfos?.hexRotation?.mode)) {
    return { persist: false };
  }

  const fromDraft = normalizeManufacturerHexRotationMode(hexDraft);
  if (fromDraft) return { persist: true, mode: fromDraft };

  const resolved = resolveDefaultPrepHexRotationMode(req);
  if (resolved) return { persist: true, mode: resolved };

  return { persist: false, missing: true };
};

export const resolvePrepAnodizingToPersist = (
  req: HexRequestLike,
): boolean | null => {
  if (typeof req?.caseInfos?.anodizingEnabled === "boolean") return null;
  const businessDefault = req?.business?.requestSettings?.anodizingEnabled;
  if (typeof businessDefault === "boolean") return businessDefault;
  return true;
};

export const resolvePrepWideSplitToPersist = (
  req: HexRequestLike,
): boolean | null => {
  if (typeof req?.caseInfos?.wideSplitEnabled === "boolean") return null;
  return true;
};

export const PREP_HEX_SAVE_MISSING_HANDLER =
  "헥스 회전 저장 핸들러가 없어 승인할 수 없습니다.";
export const PREP_HEX_MISSING_MODE =
  "헥스 회전값이 비어 있습니다. 'STL모델대로', '헥스30도회전', 'STL모델+', '헥스30+' 중 하나를 선택해 주세요.";

export async function persistPrepApprovalSettings(opts: {
  req: HexRequestLike;
  hexDraft?: unknown;
  saveHex?: (
    req: HexRequestLike,
    mode: ManufacturerHexRotationMode,
  ) => Promise<void>;
  saveAnodizing?: (req: HexRequestLike, next: boolean) => Promise<void>;
  saveWideSplit?: (req: HexRequestLike, next: boolean) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; title: string; description: string }> {
  const hexPlan = resolvePrepHexModeToPersist(opts.req, opts.hexDraft);
  if ("missing" in hexPlan && hexPlan.missing) {
    return {
      ok: false,
      title: "승인 불가",
      description: PREP_HEX_MISSING_MODE,
    };
  }
  if (hexPlan.persist) {
    if (!opts.saveHex) {
      return {
        ok: false,
        title: "승인 불가",
        description: PREP_HEX_SAVE_MISSING_HANDLER,
      };
    }
    await opts.saveHex(opts.req, hexPlan.mode);
  }

  const anodizingToPersist = resolvePrepAnodizingToPersist(opts.req);
  if (anodizingToPersist !== null && opts.saveAnodizing) {
    await opts.saveAnodizing(opts.req, anodizingToPersist);
  }

  const wideSplitToPersist = resolvePrepWideSplitToPersist(opts.req);
  if (wideSplitToPersist !== null && opts.saveWideSplit) {
    await opts.saveWideSplit(opts.req, wideSplitToPersist);
  }

  return { ok: true };
}
