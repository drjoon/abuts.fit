// related files:
// - web/backend/models/practiceTransfer.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/requests/creation.request.controller.js
// - web/backend/models/request.model.js
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-04: Request 생성 전 CNC 주문가능 스펙 검증(미도입 US 등 폴백·유입 금지).
// - 2026-09-04: 헥스 샘플은 design-handoff/워크시트 백필만(ensure 시점 designCompletedAt 전 생성 금지).
// - 2026-09-03: ensureAbutmentRequestsForHandoff — 수락이 아니라 STL handoff 직전 생성.
// - 2026-09-03: 구강스캔은 designSourceFiles만 — caseInfos.file에 넣지 않음(제조사·헥스 고스트 방지).
// - 2026-09-03: tryStartAbutmentProduction는 designCompletedAt만 인정(스캔 s3Key로 생산 시작 금지).
// - 2026-09-03: 기공소 작업취소 시 헥스 확인용 복사샘플도 referenceIds로 함께 취소.
// - 2026-09-03: already_created PTX도 미확정 제조사 헥스 샘플 누락분을 fire-and-forget 보정.
// - 2026-09-03: reprice scheduleMode=holdFast — 리드타임 스케줄 생략(핸드오프 critical path).
// - 2026-09-03: reprice — 호출측 labOrg 재사용·creditSettings에 requestorAnchor 전달(BA 재조회 제거).
//   mirror — labDesignConfirm를 같은 update에 합쳐 Transfer 왕복 1회 절약.
// - 2026-09-03: 헥스 확인 샘플 생성 후 worksheet/stage 소켓 emit(준비 목록 즉시 반영).
// - 2026-09-03: PTX 준비 등록 시에도 헥스 미확정 제조사면 확인용 복사샘플 생성(relatedRequestIds 제외).
// - 2026-09-03: PTX 헥스 시드도 from-draft와 동일 — case별 implantManufacturer로 hexByImplantManufacturer 해석.
// - 2026-08-31: PTX CA 생산·배송 크레딧 hold는 수락이 아니라 design-handoff에서 잡음.
// - 2026-08-31: 수락 취소 시 어벗디자인비도 revoke(design-handoff cancel과 동일).
// - 2026-08-28: 심플어벗(치과 재고)은 어벗츠 CA Request 생성 대상에서 제외.
// - 2026-08-22: 치과 멤버십/일반 청구 이중가 제거. 고시 membership* 단일가. pricingTier 분기 삭제.
// - 2026-08-22: PTX 작업취소 시 연동 CA Request 크레딧 hold도 즉시 해제(내역·잔액 지연 방지).
// - 2026-08-22: already_created여도 연동 CA 크레딧 hold를 다시 시도(누락 hold 보정, 기존은 idempotent skip).
// - 2026-08-21: PTX CA 배송비는 Request 박스 hold(디자인 핸드오프 시 holdRequestCreditsOnSubmit).
// - 2026-08-21: PTX 작업취소 시 연동 CA 취소 후 어벗츠로의뢰 건수·목록 캐시·소켓 갱신.
// - 2026-08-21: 헥스 확인 샘플은 relatedRequestIds에 넣지 않음(어벗 개수 오인 방지).
// - 2026-08-21: tryStartAbutmentProduction — Request 가공 진입을 병렬(다치아 confirm 지연 완화).
// - 2026-08-21: CA Request — 구강스캔 없이 수락·생성(어벗 STL 업로드 가능).
// - 2026-08-21: 연동 CA Request 한진 배송 요약(mapAbutmentDeliveryByTransferDocs) — 구강스캔으로 UI.
// - 2026-08-21: 환봉·제조사 추가요청(요청중) CA는 어벗츠 Request 생성 제외 — 지정 기공소가 커스텀어벗 수행.
// - 2026-08-19: 출고 목표=치과도착−2영업일. 지정 도착일 1영업일 전 배송이 목표.
// - 2026-08-18: 기공의뢰 CA 생산 견적은 치과 공급 단가(기공소 공급 단가 제외).
// - 2026-08-17: PTX CA Request에 shippingReceiver(치과 수취인) 스냅샷·practiceBusinessAnchorId 저장.
// - 2026-08-17: PTX CA 제조 모드는 2·3영업일 포함 항상 묶음. 타이트 납기는 지연고지·도착−1 스케줄.
// - 2026-08-17: ≤3영업일 → 제조 express+지연고지. 출고 스케줄은 항상 묶음(도착−1 clamp).
// - 2026-08-17: 출고 목표=치과도착−1영업일. 2영업일만 express·할증 없음. ≥3은 묶음.
// - 2026-08-17: 신속처리 CA — 12시 전 express, 12시 이후 묶음. 일반은 항상 묶음.
// - 2026-08-17: 신속처리 CA는 제조사 express 고정(선택가능 강등·견적 normal 위장 제거). 일반은 묶음.
// - 2026-08-17: 일반 PTX CA는 항상 묶음(normal). 신속처리는 익영업일 16시 출고·expressFee 0(배수는 PTX 과금).
// - 2026-08-16: 준비 복귀 시 abutmentProductionStartedAt 클리어·pastReady는 라이브 stage SSOT.
// - 2026-08-16: past-ready 판정 — partnerBilling 링크 + actualCamStart. 가공 진입 시 startedAt 기록.
// - 2026-08-16: 어벗 가공(준비 아님) 시 release·생산취소 가드 + 목록 abutmentPastReady.
// - 2026-08-16: PTX CA — 개인/사업체 requestSettings 중 화면 effective(개인 우선)로 designSoftware·아노·유지홈·헥스 반영. 핸드오프와 공용 loader.
// - 2026-08-16: PTX CA 제조 주문에 기공소 requestSettings.designSoftware·아노다이징·헥스 반영.
// - 2026-08-16: PTX CA 납품=치과 직납. 출고목표=치과도착일−2영업일(기공소 경유 −3 폐기).
// - 2026-08-16: PTX 출고모드·스케줄은 생산(custom_abutment) 리드로 판정(디자인+1일 오판으로 신속 승격 방지).
// - 2026-08-16: PTX Request 생성 시 rnd.manufacturerHexRotation·PRC 파일명 시드(request-meta 500 방지).
// - 2026-08-15: PTX 핸드오프 재견적 — productMode·스케줄을 custom_abutment(생산)로.
// - 2026-08-15: 재견적 시 timeline 필드만 갱신(shipOutcome undefined Cast 방지).
// - 2026-08-15: 작업취소(release) 시 연동 CA Request 취소·디자인 미러 정리. 재수락 시 소유 동기화.
// - 2026-08-15: PTX CA — 치과 멤버십/일반 생산단가·출고목표·묶음 우선. 디자인비는 기공소 지급 분리.
// - 2026-08-15: 지정 CA — 스캔 없이 수락 가능. 스캔은 수락 후 업로드 후 Request 생성.
// - 2026-08-19: 생성 시 구강스캔은 선택(어벗츠기공소/자동매칭·지정 공통).
// - 2026-08-15: 구강스캔 — 자동매칭은 치과 필수, 지정은 수락 기공소 업로드 허용.
// - 2026-08-15: Abuts-first — 수락 시 스캔(files)로 Request 생성, 기일 기준 스케줄, 디자인 컨펌 후 생산.
// - 2026-08-13: 치아별 abutmentProductMode(생산만/디자인+생산)를 어벗츠 의뢰 productMode로 전달.
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import {
  normalizeExoCadVersion,
  isHexVerificationPending,
  resolveExoCadManufacturerHexRotation,
  resolveHexRotationByDesignSoftware,
  isHexVerificationSampleCase,
} from "../utils/designSoftwareHex.js";
import {
  findActiveHexVerificationSampleObjectIdsForSources,
} from "./hexVerificationSample.service.js";
import {
  normalizeCaseInfosImplantFields,
  assertOrderableImplantPresetOrThrow,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  normalizeKoreanBusinessDay,
} from "../controllers/requests/utils.js";
import { calculateInitialProductionSchedule } from "../controllers/requests/production.utils.js";
import {
  countDesignAbutmentQty,
} from "../controllers/requests/designPrice.utils.js";
import { resolvePrcFileNames } from "../controllers/requests/prcMapping.utils.js";
import { resolveQuotedPriceWithExpressFee } from "../controllers/requests/expressPrice.utils.js";
import { getManufacturerLeadTimesUtil } from "../controllers/businesses/leadTime.controller.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import {
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  pickAbutsAbutmentCreditPrices,
} from "../utils/abutsAbutmentService.js";
import { checkCreditLock } from "../utils/creditLock.util.js";
import {
  isPracticeTransferRushProcessing,
  normalizeConfiguredRushFeeMultiplier,
  resolveRushFeeMultiplier,
} from "../utils/practiceTransferRush.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "./requestSnapshotTriggers.service.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "./bulkShippingSnapshot.service.js";
import { releaseRequestCreditHoldsOnCancel } from "./requestCreditHold.service.js";
import { updateReviewStatusByStage } from "../controllers/requests/common.review.controller.js";
import { prevKoreanBusinessDayYmd } from "../utils/krBusinessDays.js";
import { isPendingRoundBarAbutment, isSimpleAbutmentModeForFee } from "../utils/labFeeSchedule.js";
import { emitAppEventToRoles } from "../socket.js";

/** 커스텀어벗 치식(요청중 포함). 심플어벗(치과 재고) 제외. */
const isCustomAbutmentToothWorkRow = (row) =>
  Boolean(row?.customAbutment) &&
  String(row?.toothNumber || "").trim() &&
  !isSimpleAbutmentModeForFee(row);

const hasCustomAbutmentToothWorks = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).some((row) =>
    isCustomAbutmentToothWorkRow(row),
  );

/**
 * 어벗츠 CA Request 대상.
 * 환봉·제조사 추가요청(요청중)·심플어벗(치과 재고)은 지정 기공소/재고로 처리.
 */
const listCustomAbutmentToothWorks = (toothWorks, implantFavorites = null) =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) =>
      isCustomAbutmentToothWorkRow(row) &&
      !isPendingRoundBarAbutment(row, implantFavorites),
  );

const normalizeResultFiles = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((row) => {
      const file = row?.file && typeof row.file === "object" ? row.file : row;
      const originalName = String(
        file?.originalName || file?.name || row?.originalName || "",
      ).trim();
      const s3Key = String(file?.s3Key || file?.key || row?.s3Key || "").trim();
      if (!originalName || !s3Key) return null;
      return {
        patientName: String(row?.patientName || "").trim(),
        tooth: String(row?.tooth || "").trim(),
        file: {
          originalName,
          mimetype: String(
            file?.mimetype || row?.mimetype || "application/octet-stream",
          ).trim(),
          size: Number(file?.size || row?.size || 0) || 0,
          s3Key,
        },
      };
    })
    .filter(Boolean);
};

/** @deprecated 생성 시 구강스캔은 선택. 메시지·코드는 레거시 클라이언트용 */
export const ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE =
  "자동매칭으로 보낼 때는 구강스캔 파일을 첨부해주세요.";

/** @deprecated 수락·생성 모두 구강스캔 선택. 레거시 클라이언트용 */
export const ORAL_SCAN_REQUIRED_FROM_PRACTICE =
  "자동매칭 커스텀어벗 의뢰는 치과에서 구강스캔을 첨부해야 합니다.";

/** @deprecated 수락 기공소 CA 디자인 — 기공소 구강스캔 업로드 UI 없음 */
export const ORAL_SCAN_REQUIRED_FROM_LAB =
  "커스텀어벗 디자인을 위해 구강스캔 파일을 업로드해주세요.";

/**
 * 커스텀어벗 수락 시 구강스캔(선택).
 * - 이미 transfer.files 있으면 그대로
 * - 자동매칭: 치과 첨부만 반영(기공소 body.files 무시). 스캔 없어도 수락
 * - 지정: 스캔 없이 수락 가능(레거시 body.files 첨부는 허용)
 */
export function resolveOralScanFilesForAccept({
  transferDoc,
  incomingFiles = null,
} = {}) {
  const existing = normalizeResultFiles(transferDoc?.files);
  if (!hasCustomAbutmentToothWorks(transferDoc?.toothWorks)) {
    return { files: existing, attachedByLab: false };
  }
  if (existing.length > 0) {
    return { files: existing, attachedByLab: false };
  }

  const isAuto = String(transferDoc?.matchingMode || "").trim() === "auto";
  const incoming = normalizeResultFiles(incomingFiles);

  // 자동매칭: 기공소가 수락 시 스캔을 붙이지 않음(치과 전송분만). 미첨부는 허용.
  if (isAuto || incoming.length === 0) {
    return { files: [], attachedByLab: false };
  }

  return { files: incoming, attachedByLab: true };
}

/** 생성 시 구강스캔은 선택. 어벗츠기공소(auto)·지정 모두 첨부 없이 전송 가능. */
export function assertOralScanFilesForCreate() {
  return;
}

const parsePatientNameFromMemo = (memo) => {
  const raw = String(memo || "").trim();
  const matched = raw.match(/\[\s*환자명\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const parseArrivalYmdFromMemo = (memo) => {
  const raw = String(memo || "").trim();
  const matched = raw.match(
    /\[\s*(?:치과도착일|도착일)\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]/i,
  );
  return String(matched?.[1] || "").trim() || null;
};

const pickFileForTooth = (files, toothNumber, index) => {
  const tooth = String(toothNumber || "").trim();
  if (tooth) {
    const byTooth = files.find((f) => String(f?.tooth || "").trim() === tooth);
    if (byTooth) return byTooth;
  }
  if (files[index]) return files[index];
  return files[0] || null;
};

const resolveLabRequestorUserId = async ({ transferDoc, fallbackUserId }) => {
  const completedBy = String(transferDoc?.autoMatch?.completedBy || "").trim();
  if (completedBy && Types.ObjectId.isValid(completedBy)) return completedBy;

  const acceptedBy = String(transferDoc?.requestorDownloadedBy || "").trim();
  if (acceptedBy && Types.ObjectId.isValid(acceptedBy)) return acceptedBy;

  const labAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();
  if (labAnchorId && Types.ObjectId.isValid(labAnchorId)) {
    const owner = await User.findOne({
      role: "requestor",
      businessAnchorId: new Types.ObjectId(labAnchorId),
      subRole: "owner",
    })
      .select({ _id: 1 })
      .lean();
    if (owner?._id) return String(owner._id);
  }

  const fallback = String(fallbackUserId || "").trim();
  if (fallback && Types.ObjectId.isValid(fallback)) return fallback;
  return null;
};

export { resolveHexRotationByDesignSoftware };

const normalizeManufacturerHexRotationOrNull = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "STL모델대로" || raw === "0") return "STL모델대로";
  if (raw === "헥스30도회전" || raw === "30") return "헥스30도회전";
  if (raw === "STL모델+") return "STL모델+";
  if (raw === "헥스30+") return "헥스30+";
  if (raw === "헥스40도회전" || raw === "헥스10도회전") return "STL모델+";
  const matched = raw.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (!matched) return null;
  const parsedX = Number(matched[1]);
  if (!Number.isFinite(parsedX)) return null;
  if (parsedX === 30) return "헥스30도회전";
  return "STL모델+";
};

/**
 * 제조사 헥스 기본값 SSOT (ExoCAD):
 * case별 implantManufacturer → verifiedHex / applyHex30 → manufacturerDefault → designSoftware.
 * related: creation.from-draft.controller.js, common.requests.controller.js updateRndHexRotation
 */
export function pickLabManufacturerHexRotation(
  labUser,
  labOrg,
  designSoftware,
  exoCadVersion = null,
  {
    hexVerificationPending = null,
    implantManufacturer = null,
  } = {},
) {
  const manufacturerDefault =
    normalizeManufacturerHexRotationOrNull(
      labUser?.requestSettings?.defaultManufacturerHexRotation,
    ) ||
    normalizeManufacturerHexRotationOrNull(
      labOrg?.requestSettings?.defaultManufacturerHexRotation,
    );

  const pending =
    hexVerificationPending == null
      ? pickLabHexVerificationPending(labUser, labOrg, implantManufacturer)
      : Boolean(hexVerificationPending);

  return resolveExoCadManufacturerHexRotation({
    designSoftware,
    exoCadVersion,
    implantManufacturer,
    userRequestSettings: labUser?.requestSettings,
    anchorRequestSettings: labOrg?.requestSettings,
    manufacturerDefault,
    hexVerificationPending: pending,
  });
}

/**
 * loadLabRequestMetaForProduction 결과 + case implantManufacturer → 헥스 시드.
 * from-draft resolveExoCadManufacturerHexRotation 과 동일 우선순위.
 */
export function resolveLabManufacturerHexForImplant(
  labMeta,
  implantManufacturer = null,
) {
  return pickLabManufacturerHexRotation(
    labMeta?.labUser,
    labMeta?.labOrg,
    labMeta?.designSoftware,
    labMeta?.exoCadVersion || null,
    { implantManufacturer },
  );
}

const normalizeRetentionGrooveValue = (value, fallback = "none") => {
  const rg = String(value || "")
    .trim()
    .toLowerCase();
  if (rg === "deep") return "deep";
  if (rg === "none" || rg === "shallow") return "none";
  return fallback;
};

/**
 * UI effectiveDesign과 동일: 의뢰자 개인 설정 → 사업체 설정.
 * (사업체만 오래된 값으로 남아 있어도 화면/제조 주문이 어긋나지 않게)
 */
export function pickLabDesignSoftware(labUser, labOrg) {
  return (
    String(labUser?.requestSettings?.designSoftware || "").trim() ||
    String(labOrg?.requestSettings?.designSoftware || "").trim() ||
    ""
  );
}

export function pickLabExoCadVersion(labUser, labOrg) {
  return (
    normalizeExoCadVersion(labUser?.requestSettings?.exoCadVersion) ||
    normalizeExoCadVersion(labOrg?.requestSettings?.exoCadVersion)
  );
}

export function pickLabHexVerificationPending(
  labUser,
  labOrg,
  implantManufacturer = null,
) {
  const designSoftware = pickLabDesignSoftware(labUser, labOrg);
  const exoCadVersion = pickLabExoCadVersion(labUser, labOrg);
  return isHexVerificationPending({
    designSoftware,
    exoCadVersion,
    implantManufacturer,
    userRequestSettings: labUser?.requestSettings,
    anchorRequestSettings: labOrg?.requestSettings,
  });
}

export function pickLabAnodizingEnabled(labUser, labOrg) {
  if (typeof labUser?.requestSettings?.anodizingEnabled === "boolean") {
    return labUser.requestSettings.anodizingEnabled;
  }
  if (typeof labOrg?.requestSettings?.anodizingEnabled === "boolean") {
    return labOrg.requestSettings.anodizingEnabled;
  }
  return true;
}

export function pickLabRetentionGroove(labUser, labOrg) {
  return normalizeRetentionGrooveValue(
    labUser?.requestSettings?.retentionGroove ||
      labOrg?.requestSettings?.retentionGroove,
    "none",
  );
}

/**
 * PTX Request 생성·디자인 핸드오프 공통: 기공소 의뢰 메타.
 */
export async function loadLabRequestMetaForProduction({
  labAnchorId,
  labUserId,
}) {
  const anchorId = String(labAnchorId || "").trim();
  const userId = String(labUserId || "").trim();

  const [labOrg, labUser] = await Promise.all([
    anchorId && Types.ObjectId.isValid(anchorId)
      ? BusinessAnchor.findById(anchorId)
          .select({
            "requestSettings.designSoftware": 1,
            "requestSettings.exoCadVersion": 1,
            "requestSettings.hexVerificationResultHex": 1,
            "requestSettings.hexByImplantManufacturer": 1,
            "requestSettings.anodizingEnabled": 1,
            "requestSettings.retentionGroove": 1,
            "requestSettings.defaultManufacturerHexRotation": 1,
            "shippingPolicy.weeklyBatchDays": 1,
            requestorKind: 1,
          })
          .lean()
      : null,
    userId && Types.ObjectId.isValid(userId)
      ? User.findById(userId)
          .select({
            "requestSettings.designSoftware": 1,
            "requestSettings.exoCadVersion": 1,
            "requestSettings.hexVerificationResultHex": 1,
            "requestSettings.hexByImplantManufacturer": 1,
            "requestSettings.anodizingEnabled": 1,
            "requestSettings.retentionGroove": 1,
            "requestSettings.defaultManufacturerHexRotation": 1,
          })
          .lean()
      : null,
  ]);

  const designSoftware = pickLabDesignSoftware(labUser, labOrg);
  const exoCadVersion = pickLabExoCadVersion(labUser, labOrg);
  // implant 미지정 fallback(레거시). case별 시드는 resolveLabManufacturerHexForImplant 사용.
  const hexVerificationSamplePending = pickLabHexVerificationPending(
    labUser,
    labOrg,
  );
  const anodizingEnabled = pickLabAnodizingEnabled(labUser, labOrg);
  const retentionGroove = pickLabRetentionGroove(labUser, labOrg);
  const manufacturerHexRotation = pickLabManufacturerHexRotation(
    labUser,
    labOrg,
    designSoftware,
    exoCadVersion,
  );

  return {
    designSoftware,
    exoCadVersion,
    hexVerificationSamplePending,
    anodizingEnabled,
    retentionGroove,
    manufacturerHexRotation,
    labOrg,
    labUser,
  };
}

const ymdToUtcNoonMs = (ymd) => {
  const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return Date.UTC(y, mo - 1, d, 12);
};

/**
 * PTX CA 치과 직납 배송 lead(영업일).
 * 제조사 출고 목표 = 치과도착일 − 이 값 (기공소 경유 시절 −3 → −2).
 * 지정 도착일 1영업일 전 배송이 목표.
 */
export const PTX_CA_SHIP_BEFORE_ARRIVAL_BUSINESS_DAYS = 2;

/**
 * 제조사 출고 목표 = 치과도착일 − 2영업일 (치과 직납).
 */
export async function resolveManufacturerTargetShipYmd(arrivalYmd) {
  let ymd = String(arrivalYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  for (let i = 0; i < PTX_CA_SHIP_BEFORE_ARRIVAL_BUSINESS_DAYS; i += 1) {
    ymd = await prevKoreanBusinessDayYmd({ fromYmd: ymd });
  }
  return ymd;
}

/**
 * PTX CA 어벗츠 생산 몫 견적(관리자·제조 의뢰비 표시).
 * 치과 청구(디자인+생산)와 분리: 고시 2.5만 → 어벗츠 생산 1.5만 + 기공소 디자인 1만.
 * 배송 3,500은 치과→어벗츠(면세). 제조사 정산 장부(과세): 의뢰 매입가(부가세 포함) + 배송 매입가.
 * 치과 멤버십 폐지 — 항상 플랫폼 고시(membership*) 단일가.
 */
export function buildPtxAbutsProductionQuote({
  creditSettings,
  shippingMode,
  abutmentQty = 1,
  expressFeePerRequest = 2000,
  quotedAt = new Date(),
}) {
  const picked = pickAbutsAbutmentCreditPrices(creditSettings || {});
  const unit = Math.max(
    0,
    Number(picked.productionPrice) || ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  );
  const practiceUnit = Math.max(
    0,
    Number(picked.designAndProductionPrice) || unit,
  );
  const qty = Math.max(1, Math.floor(Number(abutmentQty) || 1));
  const base = {
    baseAmount: unit,
    discountAmount: 0,
    amount: unit * qty,
    currency: "KRW",
    rule: "ptx_abuts_production_membership",
    designFee: null,
    abutmentQty: qty,
    quotedAt,
    discountMeta: {
      pricingTier: "membership",
      // 치과 지불(디자인+생산) vs 어벗츠 생산 수취 vs 기공소 디자인비
      practiceDesignAndProductionUnit: practiceUnit,
      abutsProductionUnit: unit,
      labDesignFeeUnit: Math.max(0, practiceUnit - unit),
    },
  };
  return resolveQuotedPriceWithExpressFee({
    price: base,
    shippingMode,
    expressFee: expressFeePerRequest,
    expressQty: qty,
  });
}

/**
 * PTX CA: 디자인은 수락 기공소가 하므로 출고 ETA/신속 판정은 생산 리드(custom_abutment).
 * Request.caseInfos.productMode는 생성 시점부터 custom_abutment(생산만).
 */
const PTX_SHIP_SCHEDULE_PRODUCT_MODE = "custom_abutment";

/**
 * PTX CA 출고모드(제조사 주문 shippingMode).
 * 2·3영업일 신속처리 포함 항상 묶음배송(normal).
 * 출고 스케줄도 묶음 규칙(주간 묶음일·도착−2 clamp).
 */
export async function resolveShippingModeForPracticeTransferArrival({
  transferDoc,
  weeklyBatchDays = [],
  requestedAt = new Date(),
  maxDiameter = 8,
}) {
  void transferDoc;
  void weeklyBatchDays;
  void requestedAt;
  void maxDiameter;
  return "normal";
}

function applyRushMultiplierToPtxQuote(quote, rushFeeMultiplier) {
  const base = quote && typeof quote === "object" ? quote : {};
  const m = normalizeConfiguredRushFeeMultiplier(rushFeeMultiplier);
  const scale = (n) => Math.max(0, Math.round(Number(n || 0) * m));
  return {
    ...base,
    baseAmount: scale(base.baseAmount),
    amount: scale(base.amount),
    expressFee: 0,
    discountMeta: {
      ...(base.discountMeta && typeof base.discountMeta === "object"
        ? base.discountMeta
        : {}),
      rushFeeMultiplier: m,
    },
  };
}

const clampScheduleToTarget = async (productionSchedule, targetYmd) => {
  if (!targetYmd || !productionSchedule) return productionSchedule;
  const targetMs = ymdToUtcNoonMs(targetYmd);
  if (targetMs == null) return productionSchedule;
  const next = { ...productionSchedule };
  const pickup = next.scheduledShipPickup
    ? new Date(next.scheduledShipPickup)
    : null;
  if (pickup && !Number.isNaN(pickup.getTime()) && pickup.getTime() > targetMs) {
    next.scheduledShipPickup = new Date(targetMs);
  }
  return next;
};

/**
 * 커스텀어벗 → 어벗츠 생산 의뢰 생성(어벗 STL handoff 직전).
 * 소스 파일 = PTX 구강스캔(files, 선택). productMode 고정 custom_abutment(생산만).
 */
export async function createAbutmentRequestsFromPracticeTransfer({
  transferDoc,
  shippingMode: _shippingModeRaw = null,
  actorUserId = null,
}) {
  const customRows = listCustomAbutmentToothWorks(
    transferDoc?.toothWorks,
    transferDoc?.implantFavorites ||
      transferDoc?.billing?.implantFavorites ||
      null,
  );
  if (customRows.length === 0) {
    return { created: [], skippedReason: "no_custom_abutment", requestIds: [] };
  }

  const existingIds = Array.isArray(transferDoc?.production?.relatedRequestIds)
    ? transferDoc.production.relatedRequestIds
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
    : [];
  if (existingIds.length > 0) {
    // 신규 생성은 스킵. 헥스 확인 샘플은 designCompletedAt(어벗 STL handoff) 이후
    // designHandoff / worksheet backfill에서만 만든다.
    return {
      created: [],
      skippedReason: "already_created",
      requestIds: existingIds,
    };
  }

  // 구강스캔은 선택 — 없어도 CA Request 생성(어벗 STL 핸드오프용 relatedRequestIds).
  const scanFiles = normalizeResultFiles(transferDoc?.files);

  const labAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();
  if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) {
    throw new Error("기공소 정보가 없어 어벗츠 의뢰를 생성할 수 없습니다.");
  }

  const lockStatus = await checkCreditLock(labAnchorId);
  if (lockStatus.isLocked) {
    throw new Error(
      `기공소 크레딧 사용이 제한되어 있습니다. 사유: ${lockStatus.reason || "-"}`,
    );
  }

  const labUserId = await resolveLabRequestorUserId({
    transferDoc,
    fallbackUserId: actorUserId,
  });
  if (!labUserId) {
    throw new Error("기공소 의뢰자 계정을 찾지 못해 어벗츠 의뢰를 생성할 수 없습니다.");
  }

  const labMeta = await loadLabRequestMetaForProduction({
    labAnchorId,
    labUserId,
  });
  const labOrgShipping = await BusinessAnchor.findById(labAnchorId)
    .select({
      name: 1,
      "shippingPolicy.weeklyBatchDays": 1,
    })
    .lean();
  const labOrg = {
    ...(labMeta.labOrg || {}),
    name: labOrgShipping?.name,
    shippingPolicy: labOrgShipping?.shippingPolicy,
  };

  const weeklyBatchDays = Array.isArray(labOrg?.shippingPolicy?.weeklyBatchDays)
    ? labOrg.shippingPolicy.weeklyBatchDays
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];

  const designSoftware = String(labMeta.designSoftware || "").trim();
  if (!designSoftware) {
    throw new Error(
      "기공소 디자인 소프트웨어가 설정되지 않았습니다. 기공의뢰수신 또는 어벗생산의뢰에서 먼저 설정해주세요.",
    );
  }
  const exoCadVersion = labMeta.exoCadVersion || null;
  const anodizingEnabled = labMeta.anodizingEnabled;
  const retentionGroove = labMeta.retentionGroove;

  const requestedAt = new Date();
  const rush = isPracticeTransferRushProcessing(transferDoc);
  // 제조 shippingMode는 항상 묶음. caller shippingModeRaw 무시.
  const shippingMode = await resolveShippingModeForPracticeTransferArrival({
    transferDoc,
    weeklyBatchDays,
    requestedAt,
  });
  const scheduleRequestedAt = requestedAt;

  const practiceAnchorId = transferDoc?.practiceBusinessAnchorId || null;
  const practiceAnchor = practiceAnchorId
    ? await BusinessAnchor.findById(practiceAnchorId)
        .select({ name: 1 })
        .lean()
    : null;
  const clinicName =
    String(practiceAnchor?.name || "").trim() ||
    String(labOrg?.name || "").trim() ||
    "치과";
  const patientNameFallback =
    parsePatientNameFromMemo(transferDoc?.transferMemo) ||
    String(scanFiles[0]?.patientName || "").trim() ||
    "환자";
  const arrivalYmd = parseArrivalYmdFromMemo(transferDoc?.transferMemo);
  // 항상 도착−2 출고 목표(묶음). 지정 도착일 1영업일 전 배송.
  const targetShipYmd = arrivalYmd
    ? await resolveManufacturerTargetShipYmd(arrivalYmd)
    : null;

  const billing =
    transferDoc?.billing && typeof transferDoc.billing === "object"
      ? transferDoc.billing
      : {};
  const isTradingPartner = Boolean(billing.isTradingPartner);
  // 치과가 PTX에서 어벗츠 단가(abutmentRetail)를 선납한 경우만 prepaid.
  // 기공소 수가로 청구된 CA는 기공소→어벗츠 Request가 생산비(1.5만)를 부담.
  const abutmentRetailTotal = Math.max(
    0,
    Number(billing.abutmentRetailTotal || 0) || 0,
  );
  const practicePrepaidAbutment = abutmentRetailTotal > 0;

  let expressFeePerRequest = 2000;
  let creditSettingsForQuote = {};
  try {
    creditSettingsForQuote = await loadCreditSettingsDefaults({
      requestorOrgId: labAnchorId,
      applyLabSupplyPrices: false,
    });
    expressFeePerRequest = Math.max(
      0,
      Number(creditSettingsForQuote?.expressFee ?? 2000) || 2000,
    );
  } catch {
    expressFeePerRequest = 2000;
    creditSettingsForQuote = {};
  }
  // PTX 신속처리는 flat expressFee 대신 배수 할증(PTX hold). Request 표시가도 동일.
  if (rush) expressFeePerRequest = 0;

  const manufacturerSettings = await getManufacturerLeadTimesUtil();
  const leadTimes = manufacturerSettings?.leadTimes || {};
  const created = [];

  for (let i = 0; i < customRows.length; i += 1) {
    const row = customRows[i];
    const tooth = String(row.toothNumber || "").trim();
    const scanFile = pickFileForTooth(scanFiles, tooth, i);
    if (scanFiles.length > 0 && !scanFile?.file?.s3Key) {
      throw new Error(`치아 #${tooth} 구강스캔 파일을 찾지 못했습니다.`);
    }

    const patientName =
      String(scanFile?.patientName || "").trim() || patientNameFallback;
    const implantManufacturer = String(row.implantManufacturer || "").trim();
    const implantBrand = String(row.implantBrand || "").trim();
    const implantFamily = String(row.implantFamily || "").trim();
    const implantType = String(row.implantType || "").trim();
    if (!implantManufacturer || !implantBrand || !implantFamily || !implantType) {
      throw new Error(
        `치아 #${tooth} 임플란트 규격(Manufacturer/Brand/Family/Type)이 부족합니다.`,
      );
    }

    // 미도입/비활성 스펙은 Request 생성 금지(폴백으로 다른 brand 넣지 않음).
    try {
      await assertOrderableImplantPresetOrThrow({
        implantManufacturer,
        implantBrand,
        implantFamily,
        implantType,
      });
    } catch (presetErr) {
      const err = new Error(
        String(presetErr?.message || "").trim() ||
          `치아 #${tooth} 임플란트 스펙을 제조 카탈로그에서 확인할 수 없습니다.`,
      );
      err.statusCode = 409;
      err.code = "implant_catalog_mismatch";
      err.implant = {
        implantManufacturer,
        implantBrand,
        implantFamily,
        implantType,
        tooth,
      };
      throw err;
    }

    // Abuts-first: Request는 생산만(custom_abutment). 디자인은 수주 기공소·labFeeSchedule.
    // 기공소→어벗츠 과금=플랫폼 생산 1.5만. 디자인 대기 여부는 labDesignedAbutment+designCompletedAt.
    const productMode = "custom_abutment";
    const scheduleProductMode = PTX_SHIP_SCHEDULE_PRODUCT_MODE;

    const diameterRaw = String(row.abutmentDiameter || "").trim();
    const diameterNum = Number(diameterRaw.replace(/[^\d.]/g, ""));
    const maxDiameter =
      Number.isFinite(diameterNum) && diameterNum > 0 ? diameterNum : undefined;

    const caseInfosRaw = {
      clinicName,
      patientName,
      tooth,
      workType: "abutment",
      productMode,
      implantManufacturer,
      implantBrand,
      implantFamily,
      implantType,
      abutmentManufacturer: String(row.abutmentManufacturer || "").trim() || undefined,
      abutmentDiameter: diameterRaw || undefined,
      abutmentHeight: String(row.abutmentHeight || "").trim() || undefined,
      maxDiameter,
      designSoftware,
      anodizingEnabled,
      retentionGroove,
      // 구강스캔은 어벗 디자인이 아님 — primary file에 넣지 않는다.
      // 취소 시 복원용으로 designSourceFiles에만 보관. 실제 STL은 design-handoff.
      ...(scanFile?.file?.s3Key
        ? {
            designSourceFiles: [
              {
                originalName: scanFile.file.originalName,
                mimetype: scanFile.file.mimetype,
                size: scanFile.file.size,
                s3Key: scanFile.file.s3Key,
              },
            ],
          }
        : {}),
      toothWorks: [row],
    };

    const normalizedCaseInfos =
      await normalizeCaseInfosImplantFields(caseInfosRaw);

    const abutmentQty = Math.max(
      1,
      countDesignAbutmentQty(normalizedCaseInfos) || 1,
    );
    let quotedPrice = buildPtxAbutsProductionQuote({
      creditSettings: creditSettingsForQuote,
      // 신속처리 할증 없음(expressFee=0). shippingMode는 항상 묶음.
      shippingMode,
      abutmentQty,
      expressFeePerRequest,
      quotedAt: requestedAt,
    });
    if (rush) {
      quotedPrice = applyRushMultiplierToPtxQuote(
        quotedPrice,
        resolveRushFeeMultiplier({
          rushProcessing: true,
          rushFeeMultiplier: billing?.rushFeeMultiplier,
          configuredMultiplier:
            creditSettingsForQuote?.practiceRushFeeMultiplier,
        }),
      );
    }

    let productionSchedule = await calculateInitialProductionSchedule({
      shippingMode,
      maxDiameter: normalizedCaseInfos?.maxDiameter,
      requestedAt: scheduleRequestedAt,
      weeklyBatchDays,
      productMode: scheduleProductMode,
    });
    productionSchedule = await clampScheduleToTarget(
      productionSchedule,
      targetShipYmd,
    );

    const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
    const pickupYmd = productionSchedule?.scheduledShipPickup
      ? toKstYmd(productionSchedule.scheduledShipPickup)
      : null;

    let estimatedShipYmdRaw = pickupYmd || targetShipYmd || arrivalYmd;
    if (!estimatedShipYmdRaw) {
      const d =
        typeof normalizedCaseInfos?.maxDiameter === "number" &&
        !Number.isNaN(normalizedCaseInfos.maxDiameter)
          ? normalizedCaseInfos.maxDiameter
          : 8;
      let diameterKey = "d8";
      if (d <= 6) diameterKey = "d6";
      else if (d <= 8) diameterKey = "d8";
      else if (d <= 10) diameterKey = "d10";
      else diameterKey = "d12";
      const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;
      estimatedShipYmdRaw = await addKoreanBusinessDays({
        startYmd: createdYmd,
        days: Math.max(1, leadDays),
      });
    }

    if (targetShipYmd) {
      const targetMs = ymdToUtcNoonMs(targetShipYmd);
      const estMs = ymdToUtcNoonMs(estimatedShipYmdRaw);
      if (targetMs != null && estMs != null && estMs > targetMs) {
        estimatedShipYmdRaw = targetShipYmd;
      }
    }

    const estimatedShipYmd = await normalizeKoreanBusinessDay({
      ymd: estimatedShipYmdRaw,
    });

    let resolvedPrc = { faceHolePrcFileName: "", connectionPrcFileName: "" };
    try {
      resolvedPrc = await resolvePrcFileNames(normalizedCaseInfos);
    } catch {
      // best-effort — request-meta에서도 동적 계산
    }

    // from-draft와 동일: 기공소 requestSettings + case implantManufacturer로 헥스 시드.
    const manufacturerHexRotation = resolveLabManufacturerHexForImplant(
      labMeta,
      implantManufacturer ||
        normalizedCaseInfos?.implantManufacturer ||
        null,
    );

    const newRequest = new Request({
      caseInfos: {
        ...normalizedCaseInfos,
        shippingMode,
        designSoftware,
        exoCadVersion: exoCadVersion || undefined,
        anodizingEnabled,
        retentionGroove,
        requestorHexRotation: manufacturerHexRotation,
        manufacturerHexRotation,
        finalHexRotation: manufacturerHexRotation,
        hexRotation: {
          mode: manufacturerHexRotation,
        },
        faceHolePrcFileName: resolvedPrc.faceHolePrcFileName || undefined,
        connectionPrcFileName: resolvedPrc.connectionPrcFileName || undefined,
        reviewByStage: {
          request: {
            status: "PENDING",
            updatedAt: requestedAt,
            updatedBy: labUserId,
            reason: "",
          },
        },
      },
      rnd: {
        manufacturerHexRotation,
      },
      requestor: labUserId,
      businessAnchorId: labAnchorId,
      price: quotedPrice,
      shippingMode,
      originalShipping: { mode: shippingMode, requestedAt },
      finalShipping: { mode: shippingMode, updatedAt: requestedAt },
      productionSchedule,
      manufacturerStage: "준비",
      partnerBilling: {
        practicePrepaidAbutment,
        isTradingPartner,
        labTradingPartnerId: billing.labTradingPartnerId || null,
        relatedPracticeTransferId: transferDoc._id,
        billingOwnerAnchorId: isTradingPartner ? labAnchorId : null,
        labDesignedAbutment: true,
        practiceBusinessAnchorId:
          transferDoc.practiceBusinessAnchorId || null,
      },
      timeline: {
        originalEstimatedShipYmd: estimatedShipYmd,
        nextEstimatedShipYmd: estimatedShipYmd,
        estimatedShipYmd,
      },
    });

    await newRequest.save();
    created.push(newRequest);
  }

  // 헥스 확인 샘플은 어벗 STL handoff(designCompletedAt) 이후에만 생성.
  // (이 시점의 신규 Request는 아직 designCompletedAt이 없어 schedule해도 no-op)

  try {
    await triggerDashboardSummaryRefreshForAnchorId(labAnchorId);
  } catch {
    // best-effort
  }
  try {
    await recomputeBulkShippingSnapshotForBusinessAnchorId(labAnchorId);
  } catch {
    // best-effort
  }

  return {
    created,
    skippedReason: null,
    requestIds: created.map((doc) => String(doc._id)),
    shippingMode,
  };
}

/**
 * CA 포함이면 Request 생성(이미 있으면 no-op) 후 production.relatedRequestIds·shippingMode 갱신.
 * 어벗 STL design-handoff 직전에만 호출한다(수락 시 빈 준비 건 금지).
 * 이미 생성된 Request는 현재 수락 기공소(targetLabAnchorId)로 소유를 맞춘다.
 * relatedRequestIds에는 헥스 확인 샘플을 넣지 않는다(레거시 혼입분도 정리).
 */
export async function ensureAbutmentRequestsForHandoff({
  transferDoc,
  actorUserId = null,
}) {
  if (!hasCustomAbutmentToothWorks(transferDoc?.toothWorks)) {
    return { created: false, requestIds: [], shippingMode: null };
  }

  const result = await createAbutmentRequestsFromPracticeTransfer({
    transferDoc,
    actorUserId,
  });
  if (result.skippedReason === "no_custom_abutment") {
    return { created: false, requestIds: [], shippingMode: null };
  }

  let requestIds = Array.isArray(result.requestIds) ? result.requestIds : [];
  const shippingMode = result.shippingMode || transferDoc?.production?.shippingMode || null;

  // 레거시: 헥스 확인 샘플이 relatedRequestIds에 섞인 경우 제거
  const candidateOids = requestIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (candidateOids.length > 0) {
    const docs = await Request.find({ _id: { $in: candidateOids } })
      .select({ "caseInfos.hexVerificationSample": 1 })
      .lean();
    const productionIds = docs
      .filter((doc) => !isHexVerificationSampleCase(doc?.caseInfos))
      .map((doc) => String(doc._id));
    if (productionIds.length !== requestIds.length) {
      requestIds = productionIds;
    }
  }

  const oidList = requestIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  transferDoc.production = {
    ...(transferDoc.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {}),
    relatedRequestIds: oidList,
    ...(shippingMode ? { shippingMode } : {}),
  };
  await PracticeTransfer.updateOne(
    { _id: transferDoc._id },
    {
      $set: {
        "production.relatedRequestIds": oidList,
        ...(shippingMode ? { "production.shippingMode": shippingMode } : {}),
      },
    },
  );

  if (result.skippedReason === "already_created") {
    await syncRelatedRequestOwnershipToAcceptingLab(transferDoc);
  }

  // 생산·배송 크레딧 hold는 design-handoff에서 잡음.

  return {
    created: result.skippedReason !== "already_created" && requestIds.length > 0,
    skippedReason: result.skippedReason || null,
    requestIds,
    shippingMode,
  };
}

/** @deprecated use ensureAbutmentRequestsForHandoff — accept-time create removed */
export const ensureAbutmentRequestsOnAccept = ensureAbutmentRequestsForHandoff;

/**
 * relatedRequestIds 중 tooth와 일치하는 CA Request를 찾는다.
 */
export async function findRelatedAbutmentRequestIdForTooth({
  relatedRequestIds = [],
  tooth = "",
}) {
  const toothKey = String(tooth || "").trim();
  const ids = (Array.isArray(relatedRequestIds) ? relatedRequestIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id));
  if (!ids.length) return null;

  const docs = await Request.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    "caseInfos.hexVerificationSample": { $ne: true },
  })
    .select({ "caseInfos.tooth": 1, designCompletedAt: 1 })
    .lean();

  if (toothKey) {
    const exact = docs.find(
      (doc) => String(doc?.caseInfos?.tooth || "").trim() === toothKey,
    );
    if (exact) return String(exact._id);
  }

  // tooth 미지정·미매칭: 아직 디자인 미완료인 첫 Request
  const pending = docs.find((doc) => !doc?.designCompletedAt);
  if (pending) return String(pending._id);
  return docs[0] ? String(docs[0]._id) : null;
}

/**
 * 제조사 Request 단계가 준비(또는 취소)가 아니면 가공 시작으로 본다.
 * 빈 값·준비·취소만 취소 가능.
 */
export function isAbutmentManufacturerStagePastReady(stage) {
  const s = String(stage || "").trim();
  if (!s || s === "준비" || s === "취소") return false;
  return true;
}

/**
 * 제조사 Request가 준비 단계를 벗어났거나(또는 가공 진입 트리거됨) 취소 불가인지.
 * - manufacturerStage가 준비/취소가 아님
 * - 준비인데 productionSchedule.actualCamStart 있음(승인 직후 stage 전환 전)
 * - 이미 취소된 Request는 무시
 */
export function isAbutmentRequestPastReadyForCancel(requestDoc) {
  const stage = String(requestDoc?.manufacturerStage || "").trim();
  if (stage === "취소") return false;
  if (isAbutmentManufacturerStagePastReady(stage)) return true;
  if (stage === "준비" && requestDoc?.productionSchedule?.actualCamStart) {
    return true;
  }
  return false;
}

const collectRelatedRequestObjectIds = (transferDoc) => {
  const raw = Array.isArray(transferDoc?.production?.relatedRequestIds)
    ? transferDoc.production.relatedRequestIds
    : [];
  return raw
    .map((id) => String(id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
};

/**
 * PTX에 묶인 CA Request _id 목록.
 * relatedRequestIds + partnerBilling.relatedPracticeTransferId(과거·재업로드 잔존 포함).
 */
export async function collectLinkedAbutmentRequestObjectIds(transferDoc) {
  const byRelated = collectRelatedRequestObjectIds(transferDoc);
  const transferMongoId = String(transferDoc?._id || "").trim();
  if (!transferMongoId || !Types.ObjectId.isValid(transferMongoId)) {
    return byRelated;
  }

  const partnerRows = await Request.find({
    "partnerBilling.relatedPracticeTransferId": new Types.ObjectId(
      transferMongoId,
    ),
  })
    .select({ _id: 1 })
    .lean();

  const merged = new Map();
  for (const id of byRelated) merged.set(String(id), id);
  for (const row of partnerRows) {
    const id = String(row?._id || "").trim();
    if (id && Types.ObjectId.isValid(id)) {
      merged.set(id, new Types.ObjectId(id));
    }
  }
  return [...merged.values()];
}

/**
 * 연동 CA Request 중 하나라도 준비 단계를 지났는지.
 * relatedRequestIds가 비거나 stale여도 partnerBilling 링크로 판정한다.
 * 라이브 stage가 SSOT — sticky abutmentProductionStartedAt만으로 true 고정하지 않는다
 * (가공→준비 복귀 후 취소 재개).
 * linkedRequestIds를 함께 돌려 작업취소 핫패스에서 재조회를 피한다.
 */
export async function resolveRelatedAbutmentPastReady(transferDoc) {
  const linkedRequestIds =
    await collectLinkedAbutmentRequestObjectIds(transferDoc);
  if (linkedRequestIds.length === 0) {
    if (transferDoc?.production?.abutmentProductionStartedAt && transferDoc?._id) {
      await clearPracticeTransferAbutmentMachiningStartedByTransferId(
        transferDoc._id,
      );
    }
    return { pastReady: false, linkedRequestIds };
  }
  const rows = await Request.find({ _id: { $in: linkedRequestIds } })
    .select({
      manufacturerStage: 1,
      "productionSchedule.actualCamStart": 1,
    })
    .lean();
  const pastReady = rows.some((row) => isAbutmentRequestPastReadyForCancel(row));
  if (
    !pastReady &&
    transferDoc?.production?.abutmentProductionStartedAt &&
    transferDoc?._id
  ) {
    await clearPracticeTransferAbutmentMachiningStartedByTransferId(
      transferDoc._id,
    );
  }
  return { pastReady, linkedRequestIds };
}

export async function hasRelatedAbutmentPastReady(transferDoc) {
  const { pastReady } = await resolveRelatedAbutmentPastReady(transferDoc);
  return pastReady;
}

/**
 * 수신 목록용 — transfer Mongo _id → 연동 어벗이 준비 단계를 지났는지.
 */
export async function mapAbutmentPastReadyByTransferDocs(docs) {
  const result = new Map();
  const list = Array.isArray(docs) ? docs : [];
  const transferMongoIds = [];
  const relatedIdsByTransfer = new Map();
  const stickyStartedTransferIds = [];

  for (const doc of list) {
    const transferKey = String(doc?._id || "").trim();
    if (!transferKey) continue;
    if (doc?.production?.abutmentProductionStartedAt) {
      stickyStartedTransferIds.push(transferKey);
    }
    const relatedIds = collectRelatedRequestObjectIds(doc).map((id) =>
      String(id),
    );
    relatedIdsByTransfer.set(transferKey, relatedIds);
    if (Types.ObjectId.isValid(transferKey)) {
      transferMongoIds.push(transferKey);
    }
  }

  const pendingKeys = [...relatedIdsByTransfer.keys()];
  if (pendingKeys.length === 0) return result;

  const partnerRows =
    transferMongoIds.length > 0
      ? await Request.find({
          "partnerBilling.relatedPracticeTransferId": {
            $in: transferMongoIds.map((id) => new Types.ObjectId(id)),
          },
        })
          .select({
            _id: 1,
            manufacturerStage: 1,
            partnerBilling: 1,
            "productionSchedule.actualCamStart": 1,
          })
          .lean()
      : [];

  const partnerIdsByTransfer = new Map();
  const allRequestIds = new Set();
  for (const [transferKey, relatedIds] of relatedIdsByTransfer) {
    for (const id of relatedIds) allRequestIds.add(id);
    partnerIdsByTransfer.set(transferKey, []);
  }
  for (const row of partnerRows) {
    const transferKey = String(
      row?.partnerBilling?.relatedPracticeTransferId || "",
    ).trim();
    if (!transferKey) continue;
    const reqId = String(row?._id || "").trim();
    if (!reqId) continue;
    const bucket = partnerIdsByTransfer.get(transferKey) || [];
    bucket.push(reqId);
    partnerIdsByTransfer.set(transferKey, bucket);
    allRequestIds.add(reqId);
    if (isAbutmentRequestPastReadyForCancel(row)) {
      result.set(transferKey, true);
    }
  }

  const needStageLookup = [...allRequestIds].filter((id) =>
    Types.ObjectId.isValid(id),
  );

  const stageRows =
    needStageLookup.length > 0
      ? await Request.find({
          _id: { $in: needStageLookup.map((id) => new Types.ObjectId(id)) },
        })
          .select({
            manufacturerStage: 1,
            "productionSchedule.actualCamStart": 1,
          })
          .lean()
      : [];
  const requestById = new Map(
    stageRows.map((row) => [String(row?._id || ""), row]),
  );

  for (const transferKey of pendingKeys) {
    if (result.has(transferKey)) continue;
    const ids = [
      ...(relatedIdsByTransfer.get(transferKey) || []),
      ...(partnerIdsByTransfer.get(transferKey) || []),
    ];
    const unique = [...new Set(ids)];
    result.set(
      transferKey,
      unique.some((id) =>
        isAbutmentRequestPastReadyForCancel(requestById.get(id)),
      ),
    );
  }

  const healIds = stickyStartedTransferIds.filter(
    (id) => result.get(id) !== true && Types.ObjectId.isValid(id),
  );
  if (healIds.length > 0) {
    await PracticeTransfer.updateMany(
      { _id: { $in: healIds.map((id) => new Types.ObjectId(id)) } },
      { $unset: { "production.abutmentProductionStartedAt": "" } },
    );
  }

  return result;
}

/**
 * 작업취소·자동매칭 재공개 시: 이전 기공소가 만든 CA Request/디자인 미러를 정리.
 * 다음 수락 기공소가 소유·디자인 권한을 깨끗이 받도록 한다.
 * 준비 단계가 아닌 Request는 취소하지 않는다(가공 중 강제 취소 방지).
 *
 * @param {object} [options]
 * @param {import("mongoose").Types.ObjectId[]} [options.linkedRequestIds] — 사전 조회 재사용
 * @param {boolean} [options.skipPastReadyCheck] — 호출자가 이미 past-ready 검사함
 */
export async function clearRelatedAbutmentProductionOnRelease(
  transferDoc,
  options = {},
) {
  if (!transferDoc?._id) {
    return { cleared: false, canceledRequestCount: 0, blockedPastReady: false };
  }

  const linkedRequestIds = Array.isArray(options.linkedRequestIds)
    ? options.linkedRequestIds
    : null;
  const skipPastReadyCheck = Boolean(options.skipPastReadyCheck);

  let objectIds = [
    ...(linkedRequestIds != null
      ? linkedRequestIds
      : await collectLinkedAbutmentRequestObjectIds(transferDoc)),
  ];

  // 헥스 확인용 샘플은 relatedRequestIds에 넣지 않으므로 referenceIds로 별도 수집.
  // partnerBilling.relatedPracticeTransferId가 비어 있어도 원본 취소와 함께 제거한다.
  if (objectIds.length > 0) {
    try {
      const sampleIds =
        await findActiveHexVerificationSampleObjectIdsForSources(objectIds);
      if (sampleIds.length > 0) {
        const merged = new Map(objectIds.map((id) => [String(id), id]));
        for (const sid of sampleIds) {
          merged.set(String(sid), sid);
        }
        objectIds = [...merged.values()];
      }
    } catch (sampleLookupErr) {
      console.warn(
        "[clearRelatedAbutmentProductionOnRelease] hex sample lookup failed",
        sampleLookupErr?.message || sampleLookupErr,
      );
    }
  }

  let canceledRequestCount = 0;
  if (objectIds.length > 0) {
    if (!skipPastReadyCheck) {
      const stageRows = await Request.find({ _id: { $in: objectIds } })
        .select({
          manufacturerStage: 1,
          "productionSchedule.actualCamStart": 1,
        })
        .lean();
      const blockedPastReady = stageRows.some((row) =>
        isAbutmentRequestPastReadyForCancel(row),
      );
      if (blockedPastReady) {
        return {
          cleared: false,
          canceledRequestCount: 0,
          blockedPastReady: true,
        };
      }
    }

    const cancelResult = await Request.updateMany(
      {
        _id: { $in: objectIds },
        manufacturerStage: { $in: ["준비", "취소"] },
      },
      {
        $set: { manufacturerStage: "취소" },
        $unset: {
          designCompletedAt: "",
          designCompletedBy: "",
          designLabBusinessAnchorId: "",
        },
      },
    );
    canceledRequestCount = Number(cancelResult?.modifiedCount || 0);

    // 어벗츠로의뢰 헤더 건수·진행중 목록이 PTX 작업취소 후에도 맞도록 갱신.
    if (canceledRequestCount > 0) {
      const labAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();
      const canceledRows = await Request.find({ _id: { $in: objectIds } })
        .select({
          _id: 1,
          requestId: 1,
          businessAnchorId: 1,
          manufacturerStage: 1,
        })
        .lean();

      // 준비 단계 취소 SSOT와 동일: 미전환 Request hold를 즉시 해제한다.
      // (예전: manufacturerStage만 취소 → hold 저널이 남아 크레딧 내역/잔액이 늦게 맞거나 어긋남)
      const excludeSiblingIds = objectIds.map((id) => String(id));
      const holdReleaseRows = await Request.find({ _id: { $in: objectIds } });
      const transferIdStr = String(transferDoc._id || "").trim();
      const labAnchorForFee =
        labAnchorId ||
        String(holdReleaseRows[0]?.businessAnchorId || "").trim() ||
        "";
      let revokeAbutmentDesignLabFee = null;
      try {
        ({ revokeAbutmentDesignLabFee } = await import(
          "./practiceTransferBilling.service.js"
        ));
      } catch (importErr) {
        console.warn(
          "[clearRelatedAbutmentProductionOnRelease] design fee revoke import failed",
          importErr?.message || importErr,
        );
      }
      for (const requestDoc of holdReleaseRows) {
        if (String(requestDoc?.manufacturerStage || "").trim() !== "취소") continue;
        try {
          await releaseRequestCreditHoldsOnCancel({
            request: requestDoc,
            excludeSiblingIds,
          });
        } catch (holdErr) {
          console.warn(
            "[clearRelatedAbutmentProductionOnRelease] credit hold release failed",
            String(requestDoc?._id || ""),
            holdErr?.message || holdErr,
          );
        }
        if (typeof revokeAbutmentDesignLabFee === "function" && transferIdStr) {
          try {
            await revokeAbutmentDesignLabFee({
              requestDoc,
              transferId: transferIdStr,
              labAnchorId: labAnchorForFee,
              actorUserId: null,
            });
          } catch (feeErr) {
            console.warn(
              "[clearRelatedAbutmentProductionOnRelease] design fee revoke failed",
              String(requestDoc?._id || ""),
              feeErr?.message || feeErr,
            );
          }
        }
      }

      const refreshAnchorId =
        labAnchorId ||
        String(canceledRows[0]?.businessAnchorId || "").trim() ||
        null;

      try {
        const { clearMyRequestsCache } = await import(
          "../controllers/requests/common.requests.controller.js"
        );
        clearMyRequestsCache();
      } catch (cacheErr) {
        console.warn(
          "[clearRelatedAbutmentProductionOnRelease] clearMyRequestsCache failed",
          cacheErr?.message || cacheErr,
        );
      }

      if (refreshAnchorId) {
        try {
          await triggerDashboardSummaryRefreshForAnchorId(
            refreshAnchorId,
            `ptx-release-cancel:${String(transferDoc._id)}`,
          );
        } catch (refreshErr) {
          console.warn(
            "[clearRelatedAbutmentProductionOnRelease] dashboard refresh failed",
            refreshErr?.message || refreshErr,
          );
        }
        try {
          await recomputeBulkShippingSnapshotForBusinessAnchorId(
            refreshAnchorId,
          );
        } catch {
          // best-effort
        }
      }

      for (const row of canceledRows) {
        if (String(row?.manufacturerStage || "").trim() !== "취소") continue;
        const requestorAnchorId = String(row?.businessAnchorId || "").trim();
        emitAppEventToRoles(
          ["requestor", "manufacturer", "admin"],
          "request:stage-changed",
          {
            source: "ptx-work-cancel",
            requestId: row.requestId || null,
            requestMongoId: row._id ? String(row._id) : null,
            fromStage: "준비",
            toStage: "취소",
            businessAnchorId: requestorAnchorId || null,
            ownerBusinessAnchorId: requestorAnchorId || null,
            requestorBusinessAnchorId: requestorAnchorId || null,
            manufacturerStage: "취소",
          },
        );
      }
    }
  }

  const productionNext = {
    ...(transferDoc.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {}),
    relatedRequestIds: [],
    designFiles: [],
    designReadyAt: null,
    labDesignConfirmedAt: null,
    labDesignConfirmedBy: null,
    practiceDesignConfirmedAt: null,
    practiceDesignConfirmedBy: null,
    abutmentProductionStartedAt: null,
  };
  transferDoc.production = productionNext;

  await PracticeTransfer.updateOne(
    { _id: transferDoc._id },
    {
      $set: {
        "production.relatedRequestIds": [],
        "production.designFiles": [],
      },
      $unset: {
        "production.designReadyAt": "",
        "production.labDesignConfirmedAt": "",
        "production.labDesignConfirmedBy": "",
        "production.practiceDesignConfirmedAt": "",
        "production.practiceDesignConfirmedBy": "",
        "production.abutmentProductionStartedAt": "",
      },
    },
  );

  return { cleared: true, canceledRequestCount, blockedPastReady: false };
}

/**
 * PTX 연동 Request가 가공 진입하면 transfer에 abutmentProductionStartedAt을 남긴다.
 * (목록 API 배치 조회 없이도 취소 불가 플래그가 유지되도록)
 */
export async function markPracticeTransferAbutmentMachiningStarted(
  requestDoc,
  { at = new Date() } = {},
) {
  const transferId = String(
    requestDoc?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  if (!transferId || !Types.ObjectId.isValid(transferId)) {
    return { updated: false };
  }
  const result = await PracticeTransfer.updateOne(
    {
      _id: new Types.ObjectId(transferId),
      $or: [
        { "production.abutmentProductionStartedAt": null },
        { "production.abutmentProductionStartedAt": { $exists: false } },
      ],
    },
    { $set: { "production.abutmentProductionStartedAt": at } },
  );
  return { updated: Number(result?.modifiedCount || 0) > 0 };
}

export async function clearPracticeTransferAbutmentMachiningStartedByTransferId(
  transferId,
) {
  const id = String(transferId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return { updated: false };
  const result = await PracticeTransfer.updateOne(
    { _id: new Types.ObjectId(id) },
    { $unset: { "production.abutmentProductionStartedAt": "" } },
  );
  return { updated: Number(result?.modifiedCount || 0) > 0 };
}

/**
 * 가공→준비 복귀 시 sticky 생산시작 플래그를 지운다(수락/생산 취소 재개).
 */
export async function clearPracticeTransferAbutmentMachiningStarted(
  requestDoc,
) {
  const transferId = String(
    requestDoc?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  return clearPracticeTransferAbutmentMachiningStartedByTransferId(transferId);
}

/**
 * 재수락 등으로 relatedRequestIds는 유지됐지만 Request.businessAnchorId가
 * 이전 기공소로 남은 경우, 현재 targetLabAnchorId로 맞춘다.
 */
export async function syncRelatedRequestOwnershipToAcceptingLab(transferDoc) {
  const labAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();
  if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) {
    return { updated: 0 };
  }

  const requestIds = Array.isArray(transferDoc?.production?.relatedRequestIds)
    ? transferDoc.production.relatedRequestIds
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
    : [];
  if (requestIds.length === 0) return { updated: 0 };

  const labOid = new Types.ObjectId(labAnchorId);
  const result = await Request.updateMany(
    {
      _id: { $in: requestIds.map((id) => new Types.ObjectId(id)) },
      manufacturerStage: { $ne: "취소" },
      businessAnchorId: { $ne: labOid },
    },
    { $set: { businessAnchorId: labOid } },
  );
  return { updated: Number(result?.modifiedCount || 0) };
}

export function isAbutmentDesignReady(transferDoc) {
  const files = normalizeResultFiles(transferDoc?.production?.designFiles);
  return files.length > 0 || Boolean(transferDoc?.production?.designReadyAt);
}

/**
 * 기공소: 예전 Abuts 선디자인 정책에서 구강스캔 다운로드를 잠갔.
 * 수락 기공소가 디자인하는 현재 정책에서는 잠그지 않는다.
 */
export function shouldLockLabOralScanDownload(_transferDoc) {
  return false;
}

export function canStartAbutmentProduction(transferDoc) {
  if (!isAbutmentDesignReady(transferDoc)) return false;
  if (!transferDoc?.production?.labDesignConfirmedAt) return false;
  const skip = transferDoc?.production?.skipDesignConfirm !== false;
  if (skip) return true;
  return Boolean(
    transferDoc?.production?.practiceDesignConfirmedAt ||
      transferDoc?.production?.confirmedAt,
  );
}

const invokeMachiningApproval = (requestId, actorUserId) =>
  new Promise((resolve, reject) => {
    const fakeReq = {
      params: { id: String(requestId) },
      user: {
        role: "admin",
        _id: actorUserId || undefined,
      },
      body: {
        status: "APPROVED",
        stage: "machining",
        nextUpCamRunGuard: true,
        forceReprocess: false,
        approvalTriggerSource: "practice-transfer-design-confirm",
      },
      __designPartner: false,
    };
    const fakeRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if ((this.statusCode || 200) >= 400) {
          reject(
            Object.assign(new Error(payload?.message || "가공 진입 실패"), {
              statusCode: this.statusCode,
              payload,
            }),
          );
        } else {
          resolve(payload);
        }
        return this;
      },
    };
    Promise.resolve(updateReviewStatusByStage(fakeReq, fakeRes)).catch(reject);
  });

/**
 * 디자인 컨펌 게이트 충족 시 연결 Request를 가공(생산) 단계로 진입.
 */
export async function tryStartAbutmentProduction({
  transferDoc,
  actorUserId = null,
}) {
  if (!canStartAbutmentProduction(transferDoc)) {
    return { started: false, reason: "gates_not_met" };
  }
  if (transferDoc?.production?.abutmentProductionStartedAt) {
    return { started: false, reason: "already_started" };
  }

  const requestIds = Array.isArray(transferDoc?.production?.relatedRequestIds)
    ? transferDoc.production.relatedRequestIds.map((id) => String(id || "").trim())
    : [];
  if (requestIds.length === 0) {
    return { started: false, reason: "no_requests" };
  }

  const startedIds = [];
  const toApprove = [];
  for (const requestId of requestIds) {
    if (!Types.ObjectId.isValid(requestId)) continue;
    const reqDoc = await Request.findById(requestId).select({
      manufacturerStage: 1,
      designCompletedAt: 1,
      "caseInfos.file": 1,
    });
    if (!reqDoc) continue;
    const stage = String(reqDoc.manufacturerStage || "").trim();
    if (stage !== "준비") {
      startedIds.push(requestId);
      continue;
    }
    // 구강스캔 s3Key만 있는 건 디자인 미완료 — handoff의 designCompletedAt만 인정
    if (!reqDoc.designCompletedAt) {
      continue;
    }
    toApprove.push(requestId);
  }

  if (toApprove.length > 0) {
    const settled = await Promise.allSettled(
      toApprove.map((requestId) => invokeMachiningApproval(requestId, actorUserId)),
    );
    settled.forEach((result, idx) => {
      const requestId = toApprove[idx];
      if (result.status === "fulfilled") {
        startedIds.push(requestId);
        return;
      }
      console.error(
        "[tryStartAbutmentProduction] machining approval failed",
        requestId,
        result.reason?.message || result.reason,
      );
    });
    const firstReject = settled.find((r) => r.status === "rejected");
    if (startedIds.length === 0 && firstReject?.status === "rejected") {
      throw firstReject.reason;
    }
  }

  if (startedIds.length === 0) {
    return { started: false, reason: "no_ready_requests" };
  }

  const now = new Date();
  transferDoc.production = {
    ...(transferDoc.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {}),
    abutmentProductionStartedAt: now,
  };
  await PracticeTransfer.updateOne(
    { _id: transferDoc._id },
    { $set: { "production.abutmentProductionStartedAt": now } },
  );

  return { started: true, requestIds: startedIds };
}

/**
 * design-handoff 후 PTX에 디자인 파일 미러 (가공 진입은 컨펌 후).
 * @param {object} [options.labDesignConfirm] — 수락 lab 자동 confirm 시 같은 update에 합침
 */
export async function mirrorDesignFileToPracticeTransfer({
  transferId,
  file,
  tooth = "",
  patientName = "",
  labDesignConfirm = null,
}) {
  if (!transferId || !Types.ObjectId.isValid(String(transferId))) {
    return null;
  }
  const normalized = normalizeResultFiles([
    {
      patientName,
      tooth,
      file,
    },
  ]);
  if (normalized.length === 0) return null;

  const now = new Date();
  const $set = {
    "production.designReadyAt": now,
  };
  if (labDesignConfirm && typeof labDesignConfirm === "object") {
    if (labDesignConfirm.at) {
      $set["production.labDesignConfirmedAt"] = labDesignConfirm.at;
    }
    if (labDesignConfirm.by != null) {
      $set["production.labDesignConfirmedBy"] = labDesignConfirm.by;
    }
  }
  const doc = await PracticeTransfer.findByIdAndUpdate(
    transferId,
    {
      $set,
      $push: {
        "production.designFiles": { $each: normalized },
      },
    },
    { new: true },
  );
  if (
    doc?.arrivalDeadlineExpiredAt &&
    !practiceTransferNeedsMoreAbutmentDesigns(doc)
  ) {
    await PracticeTransfer.updateOne(
      { _id: doc._id },
      { $unset: { arrivalDeadlineExpiredAt: "" } },
    );
    doc.arrivalDeadlineExpiredAt = undefined;
  }
  return doc;
}

const countPracticeTransferDesignFiles = (doc) => {
  const designFiles = Array.isArray(doc?.production?.designFiles)
    ? doc.production.designFiles
    : [];
  return Math.max(
    designFiles.length,
    Number(doc?.production?.designFileCount || 0) || 0,
  );
};

const countExpectedAbutmentDesigns = (doc) => {
  const toothWorks = Array.isArray(doc?.toothWorks) ? doc.toothWorks : [];
  const caTeeth = listCustomAbutmentToothWorks(toothWorks).length;
  if (caTeeth > 0) return caTeeth;
  const related = Array.isArray(doc?.production?.relatedRequestIds)
    ? doc.production.relatedRequestIds.filter((id) =>
        Boolean(String(id || "").trim()),
      ).length
    : 0;
  return Math.max(related, 0);
};

/** 어벗츠 CNC 대상 CA가 있고 치아별 어벗 디자인 STL이 아직 부족한지 */
function practiceTransferNeedsMoreAbutmentDesigns(doc) {
  const toothWorks = Array.isArray(doc?.toothWorks) ? doc.toothWorks : [];
  if (listCustomAbutmentToothWorks(toothWorks).length === 0) return false;
  const designCount = countPracticeTransferDesignFiles(doc);
  const expected = countExpectedAbutmentDesigns(doc);
  if (expected <= 0) return designCount === 0;
  return designCount < expected;
}

export {
  hasCustomAbutmentToothWorks,
  listCustomAbutmentToothWorks,
  normalizeResultFiles,
  parseArrivalYmdFromMemo,
  pickFileForTooth,
  practiceTransferNeedsMoreAbutmentDesigns,
};

/**
 * 디자인 핸드오프 시 PTX CA Request 가격·출고모드·스케줄을
 * 생산만/치과도착일−2영업일(직납) 기준으로 재계산.
 * 제조 단계는 준비로 유지(취소·재업로드 가능).
 * @param {object} [options.labOrg] — loadLabRequestMetaForProduction 결과 재사용(BA 재조회 생략)
 * @param {"full"|"holdFast"} [options.scheduleMode="full"]
 *   holdFast: 크레딧 hold에 필요한 price·shippingMode·estimatedShipYmd만.
 *   calculateInitialProductionSchedule(리드타임 DB)은 생략 — 응답 후 full로 채움.
 */
export async function repriceAndReschedulePtxAbutmentRequest({
  requestDoc,
  transferDoc,
  requestedAt = new Date(),
  labOrg: labOrgArg = null,
  scheduleMode = "full",
}) {
  if (!requestDoc || !transferDoc) return requestDoc;

  const holdFast = scheduleMode === "holdFast";

  const labAnchorId = String(
    requestDoc.businessAnchorId || transferDoc.targetLabAnchorId || "",
  ).trim();
  const labOrg =
    labOrgArg && typeof labOrgArg === "object"
      ? labOrgArg
      : !holdFast && labAnchorId && Types.ObjectId.isValid(labAnchorId)
        ? await BusinessAnchor.findById(labAnchorId)
            .select({
              "shippingPolicy.weeklyBatchDays": 1,
              requestorKind: 1,
            })
            .lean()
        : null;
  const weeklyBatchDays = Array.isArray(labOrg?.shippingPolicy?.weeklyBatchDays)
    ? labOrg.shippingPolicy.weeklyBatchDays
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];

  let expressFeePerRequest = 2000;
  let creditSettingsForQuote = {};
  try {
    creditSettingsForQuote = await loadCreditSettingsDefaults({
      requestorOrgId: labAnchorId || null,
      requestorAnchor: labOrg || { requestorKind: "lab" },
      applyLabSupplyPrices: false,
    });
    expressFeePerRequest = Math.max(
      0,
      Number(creditSettingsForQuote?.expressFee ?? 2000) || 2000,
    );
  } catch {
    // defaults
  }

  const rush = isPracticeTransferRushProcessing(transferDoc);
  if (rush) expressFeePerRequest = 0;

  const maxDiameter =
    typeof requestDoc?.caseInfos?.maxDiameter === "number" &&
    !Number.isNaN(requestDoc.caseInfos.maxDiameter)
      ? requestDoc.caseInfos.maxDiameter
      : 8;

  // PTX CA는 항상 묶음(normal) — resolveShippingMode…는 sync return.
  const shippingMode = await resolveShippingModeForPracticeTransferArrival({
    transferDoc,
    weeklyBatchDays,
    requestedAt,
    maxDiameter,
  });
  const scheduleRequestedAt = requestedAt;

  const abutmentQty = Math.max(
    1,
    countDesignAbutmentQty(requestDoc.caseInfos) || 1,
  );
  let quotedPrice = buildPtxAbutsProductionQuote({
    creditSettings: creditSettingsForQuote,
    shippingMode,
    abutmentQty,
    expressFeePerRequest,
    quotedAt: requestedAt,
  });
  if (rush) {
    quotedPrice = applyRushMultiplierToPtxQuote(
      quotedPrice,
      resolveRushFeeMultiplier({
        rushProcessing: true,
        rushFeeMultiplier: transferDoc?.billing?.rushFeeMultiplier,
        configuredMultiplier: creditSettingsForQuote?.practiceRushFeeMultiplier,
      }),
    );
  }

  const arrivalYmd = parseArrivalYmdFromMemo(transferDoc?.transferMemo);
  const targetShipYmd = arrivalYmd
    ? await resolveManufacturerTargetShipYmd(arrivalYmd)
    : null;

  if (!requestDoc.caseInfos || typeof requestDoc.caseInfos !== "object") {
    requestDoc.caseInfos = {};
  }
  requestDoc.caseInfos.productMode = "custom_abutment";
  requestDoc.caseInfos.shippingMode = shippingMode;

  let productionSchedule = requestDoc.productionSchedule || null;
  let estimatedShipYmd = null;

  if (holdFast) {
    // hold 박스 키용 출고일만 — 도착−2 또는 기존 timeline. 무거운 리드타임 스케줄은 생략.
    const existingYmd = String(
      requestDoc?.timeline?.estimatedShipYmd ||
        requestDoc?.timeline?.nextEstimatedShipYmd ||
        "",
    ).trim();
    const raw = targetShipYmd || existingYmd || arrivalYmd || null;
    estimatedShipYmd = raw
      ? await normalizeKoreanBusinessDay({ ymd: raw })
      : null;
  } else {
    productionSchedule = await calculateInitialProductionSchedule({
      shippingMode,
      maxDiameter,
      requestedAt: scheduleRequestedAt,
      weeklyBatchDays,
      productMode: "custom_abutment",
    });
    productionSchedule = await clampScheduleToTarget(
      productionSchedule,
      targetShipYmd,
    );

    const pickupYmd = productionSchedule?.scheduledShipPickup
      ? toKstYmd(productionSchedule.scheduledShipPickup)
      : null;
    let estimatedShipYmdRaw = pickupYmd || targetShipYmd || arrivalYmd;
    if (targetShipYmd) {
      const targetMs = ymdToUtcNoonMs(targetShipYmd);
      const estMs = ymdToUtcNoonMs(estimatedShipYmdRaw);
      if (targetMs != null && estMs != null && estMs > targetMs) {
        estimatedShipYmdRaw = targetShipYmd;
      }
    }
    estimatedShipYmd = estimatedShipYmdRaw
      ? await normalizeKoreanBusinessDay({ ymd: estimatedShipYmdRaw })
      : null;
  }

  requestDoc.price = quotedPrice;
  requestDoc.shippingMode = shippingMode;
  requestDoc.originalShipping = {
    ...(requestDoc.originalShipping && typeof requestDoc.originalShipping === "object"
      ? requestDoc.originalShipping
      : {}),
    mode: shippingMode,
    requestedAt,
  };
  requestDoc.finalShipping = {
    mode: shippingMode,
    updatedAt: requestedAt,
  };
  if (productionSchedule) {
    requestDoc.productionSchedule = productionSchedule;
  }
  if (!requestDoc.partnerBilling || typeof requestDoc.partnerBilling !== "object") {
    requestDoc.partnerBilling = {};
  }
  requestDoc.partnerBilling.labDesignedAbutment = true;
  if (transferDoc.practiceBusinessAnchorId) {
    requestDoc.partnerBilling.practiceBusinessAnchorId =
      transferDoc.practiceBusinessAnchorId;
  }
  // shippingReceiver는 포장.발송 진입 시 live BA로 스냅샷한다.
  // timeline 통째 교체(…spread) 시 shipOutcome: undefined 가 들어가면
  // Cast to Object failed — 필드만 갱신한다.
  if (estimatedShipYmd) {
    if (!requestDoc.timeline || typeof requestDoc.timeline !== "object") {
      requestDoc.timeline = {};
    }
    if (!requestDoc.timeline.originalEstimatedShipYmd) {
      requestDoc.timeline.originalEstimatedShipYmd = estimatedShipYmd;
    }
    requestDoc.timeline.nextEstimatedShipYmd = estimatedShipYmd;
    requestDoc.timeline.estimatedShipYmd = estimatedShipYmd;
    if (typeof requestDoc.markModified === "function") {
      requestDoc.markModified("timeline");
    }
  }

  return requestDoc;
}

const DELIVERY_POPULATE_SELECT =
  "shippedAt pickedUpAt deliveredAt carrier tracking events.statusCode events.statusText events.occurredAt events.location";

const toMs = (value) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const slimDeliveryInfo = (di) => {
  if (!di || typeof di !== "object") return null;
  const tracking =
    di.tracking && typeof di.tracking === "object" ? di.tracking : {};
  const events = Array.isArray(di.events)
    ? di.events.map((e) => ({
        statusCode: e?.statusCode != null ? String(e.statusCode) : undefined,
        statusText: e?.statusText != null ? String(e.statusText) : undefined,
        occurredAt: e?.occurredAt || undefined,
        location: e?.location != null ? String(e.location) : undefined,
      }))
    : [];
  return {
    carrier: di.carrier != null ? String(di.carrier) : undefined,
    shippedAt: di.shippedAt || undefined,
    pickedUpAt: di.pickedUpAt || undefined,
    deliveredAt: di.deliveredAt || undefined,
    tracking: {
      lastStatusCode: tracking.lastStatusCode,
      lastStatusText: tracking.lastStatusText,
      lastLocation: tracking.lastLocation,
      lastEventAt: tracking.lastEventAt,
      lastSyncedAt: tracking.lastSyncedAt,
    },
    events,
  };
};

/**
 * 기공의뢰(PTX) 연동 커스텀어벗 Request들의 한진 배송·공정 요약.
 * relatedRequestIds + partnerBilling.relatedPracticeTransferId 모두 사용.
 * @param {object[]} transferDocs
 * @returns {Promise<Map<string, object|null>>} transferMongoId → summary
 */
export async function mapAbutmentDeliveryByTransferDocs(transferDocs = []) {
  const docs = Array.isArray(transferDocs) ? transferDocs : [];
  const transferIds = [];
  const transferToRequestIds = new Map();

  for (const doc of docs) {
    const transferId = String(doc?._id || "").trim();
    if (!transferId || !Types.ObjectId.isValid(transferId)) continue;
    transferIds.push(transferId);
    const ids = (
      Array.isArray(doc?.production?.relatedRequestIds)
        ? doc.production.relatedRequestIds
        : []
    )
      .map((id) => String(id || "").trim())
      .filter((id) => id && Types.ObjectId.isValid(id));
    transferToRequestIds.set(transferId, new Set(ids));
  }

  const out = new Map();
  if (!transferIds.length) return out;

  const transferOids = transferIds.map((id) => new Types.ObjectId(id));
  const relatedIdList = [
    ...new Set(
      [...transferToRequestIds.values()].flatMap((set) => [...set]),
    ),
  ];

  const orClauses = [
    { "partnerBilling.relatedPracticeTransferId": { $in: transferOids } },
  ];
  if (relatedIdList.length) {
    orClauses.unshift({
      _id: { $in: relatedIdList.map((id) => new Types.ObjectId(id)) },
    });
  }

  const linkedRequests = await Request.find({ $or: orClauses })
    .select({
      deliveryInfoRef: 1,
      manufacturerStage: 1,
      "partnerBilling.relatedPracticeTransferId": 1,
    })
    .populate("deliveryInfoRef", DELIVERY_POPULATE_SELECT)
    .lean();

  for (const req of linkedRequests) {
    const ptxId = String(
      req?.partnerBilling?.relatedPracticeTransferId || "",
    ).trim();
    if (!ptxId || !transferToRequestIds.has(ptxId)) continue;
    transferToRequestIds.get(ptxId).add(String(req._id));
  }

  const reqById = new Map(
    linkedRequests.map((req) => [String(req._id), req]),
  );

  for (const transferId of transferIds) {
    const requestIds = [...(transferToRequestIds.get(transferId) || [])];
    const reqs = requestIds
      .map((id) => reqById.get(id))
      .filter(Boolean)
      .filter((req) => String(req.manufacturerStage || "").trim() !== "취소");

    if (!reqs.length) {
      out.set(transferId, null);
      continue;
    }

    const infos = reqs
      .map((req) => slimDeliveryInfo(req.deliveryInfoRef))
      .filter(Boolean);
    const manufacturerStages = [
      ...new Set(
        reqs
          .map((req) => String(req.manufacturerStage || "").trim())
          .filter(Boolean),
      ),
    ];

    let base = null;
    if (infos.length) {
      const delivered = infos.filter((di) => di.deliveredAt);
      if (delivered.length && delivered.length === infos.length) {
        delivered.sort((a, b) => toMs(b.deliveredAt) - toMs(a.deliveredAt));
        base = delivered[0];
      } else {
        const inTransit = infos.filter(
          (di) => !di.deliveredAt && di.pickedUpAt,
        );
        const pool = inTransit.length
          ? inTransit
          : infos.filter((di) => !di.deliveredAt);
        if (pool.length) {
          pool.sort(
            (a, b) =>
              toMs(b.tracking?.lastEventAt || b.pickedUpAt || b.shippedAt) -
              toMs(a.tracking?.lastEventAt || a.pickedUpAt || a.shippedAt),
          );
          base = pool[0];
        } else if (delivered.length) {
          delivered.sort((a, b) => toMs(b.deliveredAt) - toMs(a.deliveredAt));
          base = delivered[0];
        }
      }
    }

    out.set(transferId, {
      ...(base || {}),
      relatedCount: reqs.length,
      manufacturerStages,
    });
  }

  return out;
}
