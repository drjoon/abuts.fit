// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useCardActions.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// 확장 규칙(표시/저장 통일):
// - 프론트 표시(UI)와 백엔드/Esprit 전달값 모두 total 라벨("헥스40도회전" = 30 + 10)을 사용한다.
// - legacy minor 라벨(예: 헥스10도회전)은 하위호환으로만 허용하고 total(헥스40도회전)로 정규화한다.

export type ManufacturerHexRotationCanonicalMode = "STL모델대로" | "헥스30도회전";
export type HexXRotationLabel = `헥스${number}도회전`;
export type ManufacturerHexRotationMode =
  | "STL모델대로"
  | "헥스30도회전"
  | HexXRotationLabel;
export type ManufacturerHexRotationDraftMode = ManufacturerHexRotationMode | "";

export const normalizeManufacturerHexRotationMode = (
  value: unknown,
): ManufacturerHexRotationMode | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "STL모델대로") return "STL모델대로";
  if (raw === "헥스30도회전") return "헥스30도회전";

  if (raw === "0") return "STL모델대로";
  if (raw === "30") return "헥스30도회전";

  const matched = raw.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (!matched) return null;
  const parsedX = Number(matched[1]);
  if (!Number.isFinite(parsedX)) return null;
  if (parsedX === 30) return "헥스30도회전";

  const totalDeg = parsedX < 30 ? parsedX + 30 : parsedX;
  return `헥스${String(totalDeg)}도회전` as ManufacturerHexRotationMode;
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
  // 정책 SSOT (제조사 기본값이 아직 없을 때만 사용):
  // - ExoCAD 3.0 이하(또는 버전 미지정 레거시) => 헥스30도회전
  // - ExoCAD 3.2 이상 => STL모델대로
  // - 3Shape 및 기타(custom 포함) => STL모델대로
  // 제조사가 PreviewModal에서 한 번 바꾸면 User(개인)→BusinessAnchor 기본값이
  // 우선하고, 이후 신규 의뢰는 그 값을 hexRotation.mode로 시드한다.
  if (designSoftware !== "ExoCAD") return "STL모델대로";
  const version = String(exoCadVersionRaw || "").trim();
  if (version === "ge_3_2" || version === "3.2" || version === ">=3.2") {
    return "STL모델대로";
  }
  return "헥스30도회전";
};

export const HEX_VERIFICATION_SAMPLE_LABEL = "헥스 확인용 무료 샘플";

type HexCaseInfos = {
  hexRotation?: { mode?: unknown } | null;
  manufacturerHexRotation?: unknown;
  requestorHexRotation?: unknown;
  finalHexRotation?: unknown;
  designSoftware?: unknown;
  exoCadVersion?: unknown;
  hexVerificationSample?: boolean | null;
  anodizingEnabled?: boolean | null;
} | null | undefined;

type HexRequestLike = {
  caseInfos?: HexCaseInfos;
  rnd?: { manufacturerHexRotation?: unknown } | null;
  business?: {
    requestSettings?: { anodizingEnabled?: boolean | null } | null;
  } | null;
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
export const filterOutHexVerificationCancelCompanions = <T extends HexCancelCompanionLike>(
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
): { persist: false } | { persist: true; mode: ManufacturerHexRotationMode } | { persist: false; missing: true } => {
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

export const PREP_HEX_SAVE_MISSING_HANDLER =
  "헥스 회전 저장 핸들러가 없어 승인할 수 없습니다.";
export const PREP_HEX_MISSING_MODE =
  "헥스 회전값이 비어 있습니다. 'STL모델대로', '헥스30도회전', '헥스X도회전' 중 하나를 선택해 주세요.";

export async function persistPrepApprovalSettings(opts: {
  req: HexRequestLike;
  hexDraft?: unknown;
  saveHex?: (
    req: HexRequestLike,
    mode: ManufacturerHexRotationMode,
  ) => Promise<void>;
  saveAnodizing?: (req: HexRequestLike, next: boolean) => Promise<void>;
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

  return { ok: true };
}
