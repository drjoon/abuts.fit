import { ApiError } from "./ApiError.js";
import {
  renderPackLabelToCanvas,
  buildPackLabelBitmapZpl,
} from "./packLabelRenderer.js";
import SystemSettings from "../models/systemSettings.model.js";

const PACK_PRINT_SERVER_BASE = (
  process.env.PACK_PRINT_SERVER_BASE || "http://localhost:8004"
).replace(/\/+$/, "");

const PACK_PRINT_SERVER_SHARED_SECRET = String(
  process.env.PACK_PRINT_SERVER_SHARED_SECRET || "",
).trim();

const PACK_PRINT_TIMEOUT_MS = Number(process.env.PACK_PRINT_TIMEOUT_MS || 5000);

const PACK_PRINT_DEFAULT_PRINTER = String(
  process.env.PACK_PRINT_DEFAULT_PRINTER || "",
).trim();

/**
 * pack-server에 패킹 라벨 프린트 요청
 * @param {Object} params - 패킹 라벨 데이터
 * @param {string} params.requestId - 의뢰 ID
 * @param {string} params.lotNumber - 풀 로트번호
 * @param {string} params.mailboxCode - 메일함 코드
 * @param {string} params.screwType - 스크류 타입
 * @param {string} params.clinicName - 치과명
 * @param {string} params.labName - 사업자명
 * @param {string} params.requestDate - 의뢰일 (ISO string)
 * @param {string} params.manufacturingDate - 제조일 (YYYY-MM-DD)
 * @param {string} params.implantManufacturer - 임플란트 제조사
 * @param {string} params.implantBrand - 임플란트 브랜드
 * @param {string} params.implantFamily - 임플란트 패밀리
 * @param {string} params.implantType - 임플란트 타입
 * @param {number} [params.connectionDiameter] - 커넥션 직경(mm)
 * @param {string} params.patientName - 환자명
 * @param {string} params.toothNumber - 치아번호
 * @param {string} params.material - 소재
 * @param {string} [params.printer] - 프린터명 (선택)
 * @param {string} [params.paperProfile] - 용지 프로필 (선택, 기본: PACK_80x65)
 * @param {number} [params.copies] - 출력 매수 (선택, 기본: 1)
 * @returns {Promise<{success: boolean, generated?: {requestId: string, lotNumber: string}}>}
 */
// 프론트 /web/frontend/src/utils/modelNumber.ts 와 동일한 로직.
// 디자인 수정 시 반드시 두 곳을 함께 맞춰야 함.
function generateModelNumber(caseInfos) {
  if (!caseInfos) return "";
  const formatPart = (val) => {
    if (typeof val !== "number" || Number.isNaN(val)) return "000";
    return Math.round(val * 10)
      .toString()
      .padStart(3, "0");
  };
  const aaa = formatPart(caseInfos.taperAngle);
  const ddd = formatPart(caseInfos.maxDiameter);
  const lll = formatPart(caseInfos.totalLength);
  if (aaa === "000" && ddd === "000" && lll === "000") return "";
  return `${aaa}${ddd}${lll}`;
}

export async function printPackingLabelViaBgServer({
  requestId,
  lotNumber,
  mailboxCode,
  screwType,
  clinicName,
  labName,
  requestDate,
  manufacturingDate,
  implantManufacturer,
  implantBrand,
  implantFamily,
  implantType,
  connectionDiameter,
  patientName,
  toothNumber,
  material,
  taperAngle,
  maxDiameter,
  totalLength,
  printer,
  paperProfile = "PACK_80x65",
  copies = 1,
}) {
  const startTime = Date.now();
  console.log("[packPrint] step 1/3: rendering canvas for label", {
    requestId,
  });

  // DB(SystemSettings.packLabelBranding)에서 브랜딩 정보 읽기
  // EBS 환경변수 한글 인코딩 버그로 인해 DB를 SSOT로 사용합니다. (rules.md 섹션 16)
  let branding = {};
  try {
    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    branding = doc?.packLabelBranding || {};
  } catch (err) {
    console.warn("[packPrint] failed to read branding from DB:", err.message);
  }

  // 모델명: CA + 각도(aaa) + 최대직경(ddd) + 최대높이(lll) (로트번호 미포함)
  // branding.modelName(env 기본값)보다 의뢰별로 계산된 값이 우선.
  const computedModelNumber = generateModelNumber({
    taperAngle,
    maxDiameter,
    totalLength,
  });
  const computedModelName = computedModelNumber
    ? `CA${computedModelNumber}`
    : "";

  // 백엔드에서 Canvas로 라벨 이미지 생성 후 ZPL로 변환
  const opts = {
    mailboxCode,
    screwType,
    labName,
    lotNumber,
    requestId,
    clinicName,
    requestDate,
    patientName,
    toothNumber,
    material,
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
    connectionDiameter,
    manufacturingDate,
    caseType: material || "-",
    printedAt: new Date().toISOString(),
    dpi: 600, // 출력 DPI
    designDots: { pw: 640, ll: 520, dpi: 203 }, // 디자인 좌표계 (203 DPI 기준, scale ~2.95)
    targetDots: { pw: 1890, ll: 1535 }, // 출력 크기 (600 DPI = 80x65mm)
    // pack-server에서 가져온 브랜딩 정보
    ...branding,
    // 의뢰별 계산 모델명이 있으면 branding.modelName을 덮어씀
    ...(computedModelName ? { modelName: computedModelName } : {}),
  };

  const canvasStart = Date.now();
  const canvas = await renderPackLabelToCanvas(opts);
  const zpl = buildPackLabelBitmapZpl({
    canvas,
    labelWidth: 1890,
    labelHeight: 1535,
  });
  console.log("[packPrint] step 1/3 done: canvas rendered and ZPL generated", {
    requestId,
    zplLength: zpl?.length || 0,
    elapsed: Date.now() - canvasStart,
  });

  // pack-server로 ZPL 전송 (출력만 담당)
  const url = `${PACK_PRINT_SERVER_BASE}/print-zpl`;
  console.log("[packPrint] step 2/3: sending ZPL to pack-server", {
    requestId,
    url,
    timeoutMs: PACK_PRINT_TIMEOUT_MS,
  });

  const headers = {
    "Content-Type": "application/json",
  };

  if (PACK_PRINT_SERVER_SHARED_SECRET) {
    headers["x-pack-secret"] = PACK_PRINT_SERVER_SHARED_SECRET;
  }

  const payload = {
    zpl,
    printer: printer || PACK_PRINT_DEFAULT_PRINTER || undefined,
    paperProfile,
    copies,
    title: `Custom Abutment Packing ${requestId || lotNumber || ""}`.trim(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PACK_PRINT_TIMEOUT_MS);

  try {
    const fetchStart = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    console.log("[packPrint] step 2/3 done: pack-server responded", {
      requestId,
      status: response.status,
      elapsed: Date.now() - fetchStart,
    });

    const text = await response.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data?.message || `pack-server 응답 오류 (${response.status})`;
      console.error("[packPrint] pack-server error", {
        status: response.status,
        message,
        requestId,
      });
      throw new ApiError(500, `패킹 라벨 프린트 실패: ${message}`);
    }

    if (!data?.success) {
      const message = data?.message || "pack-server가 실패를 반환했습니다.";
      console.error("[packPrint] pack-server returned failure", {
        message,
        requestId,
      });
      throw new ApiError(500, `패킹 라벨 프린트 실패: ${message}`);
    }

    console.log("[packPrint] step 3/3: pack-server print success", {
      requestId,
      lotNumber,
      generated: data?.generated || null,
      totalElapsed: Date.now() - startTime,
    });

    return data;
  } catch (error) {
    clearTimeout(timeout);

    if (error.name === "AbortError") {
      console.error("[packPrint] pack-server timeout", {
        requestId,
        timeoutMs: PACK_PRINT_TIMEOUT_MS,
      });
      throw new ApiError(
        504,
        `패킹 라벨 프린트 타임아웃 (${PACK_PRINT_TIMEOUT_MS}ms)`,
      );
    }

    if (error instanceof ApiError) {
      throw error;
    }

    console.error("[packPrint] pack-server request failed", {
      requestId,
      message: error?.message || String(error),
    });
    throw new ApiError(
      500,
      `패킹 라벨 프린트 요청 실패: ${error?.message || "알 수 없는 오류"}`,
    );
  }
}

/**
 * 제조일자 추출 헬퍼
 * @param {Object} request - Request 문서
 * @returns {string|null} - YYYY-MM-DD 형식의 제조일자 또는 null
 */
export function resolveManufacturingDateForPrint(request) {
  // 1. reviewByStage.machining.updatedAt (가공 승인일)
  const machiningApprovedAt =
    request?.caseInfos?.reviewByStage?.machining?.updatedAt;
  if (machiningApprovedAt) {
    const date = new Date(machiningApprovedAt);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // 2. productionSchedule.machiningStartedAt
  const machiningStartedAt = request?.productionSchedule?.machiningStartedAt;
  if (machiningStartedAt) {
    const date = new Date(machiningStartedAt);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // 3. productionSchedule.machiningCompletedAt
  const machiningCompletedAt =
    request?.productionSchedule?.machiningCompletedAt;
  if (machiningCompletedAt) {
    const date = new Date(machiningCompletedAt);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // 4. createdAt (의뢰일)
  if (request?.createdAt) {
    const date = new Date(request.createdAt);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  return null;
}

/**
 * 스크류 타입 추출 헬퍼
 * @param {Object} request - Request 문서
 * @returns {string} - 스크류 타입 (예: "A", "B", "C")
 */
// 패킹 라벨(제조사 공정)용 SSOT 매핑 테이블
// - 브랜드 키는 에스프릿 PRC 파일명 기준의 원본 토큰을 사용한다.
//   (TS, Superline, IS, UF, AnyOne, MiNi, SQ)
// - 요청 데이터(예: TS3, Superline2, IS2/IS3, One-Q)는
//   아래 normalizeBrandByManufacturerToken()에서 원본 토큰으로 정규화한다.
const PACK_IMPLANT_SPEC_TABLE = [
  {
    manufacturer: "OSSTEM",
    brands: ["TS"],
    family: "REGULAR",
    screwType: "A",
    connectionDiameter: 3.35,
  },
  {
    manufacturer: "OSSTEM",
    brands: ["TS"],
    family: "MINI",
    screwType: "D",
    connectionDiameter: 2.6,
  },
  {
    manufacturer: "DENTIUM",
    brands: ["SUPERLINE", "IMPLANTIUM"],
    family: "REGULAR",
    screwType: "B",
    connectionDiameter: 3.33,
  },
  {
    manufacturer: "NEOBIOTECH",
    brands: ["IS", "ALX"],
    family: "REGULAR",
    screwType: "A",
    connectionDiameter: 3.35,
  },
  {
    manufacturer: "NEOBIOTECH",
    brands: ["IS", "ALX"],
    family: "SMALLNARROW",
    screwType: "C",
    connectionDiameter: 2.6,
  },
  {
    manufacturer: "DIO",
    brands: ["UF"],
    family: "REGULAR",
    screwType: "A",
    connectionDiameter: 3.35,
  },
  {
    manufacturer: "DIO",
    brands: ["UF"],
    family: "NARROW",
    screwType: "E",
    connectionDiameter: 2.3,
  },
  {
    manufacturer: "MEGAGEN",
    brands: ["ANYONE"],
    family: "REGULAR",
    screwType: "A",
    connectionDiameter: 3.3,
  },
  {
    manufacturer: "MEGAGEN",
    brands: ["ANYONE"],
    family: "MINI",
    screwType: "C",
    connectionDiameter: 3.1,
  },
  {
    manufacturer: "MEGAGEN",
    brands: ["MINI"],
    family: "MINI",
    screwType: "E",
    connectionDiameter: 2.3,
  },
  {
    manufacturer: "DENTIS",
    brands: ["SQ"],
    family: "REGULAR",
    screwType: "A",
    connectionDiameter: 3.35,
  },
  {
    manufacturer: "DENTIS",
    brands: ["SQ"],
    family: "MINI",
    screwType: "D",
    connectionDiameter: 2.8,
  },
  {
    manufacturer: "DENTIS",
    brands: ["SQ"],
    family: "NARROW",
    screwType: "E",
    connectionDiameter: 2.3,
  },
];

const normalizeToken = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// 제조사(세척·패킹) 처리 경로에서만 적용하는 브랜드 alias 정규화.
// 의뢰자 입력값 다양성은 유지하되, 공정/라벨 매핑은 PRC 기준 토큰으로 단일화한다.
const normalizeBrandByManufacturerToken = (manufacturer, brand) => {
  if (!manufacturer || !brand) return brand;

  if (manufacturer === "OSSTEM") {
    if (brand.startsWith("TS")) return "TS";
  }

  if (manufacturer === "DENTIUM") {
    if (brand.startsWith("SUPERLINE")) return "SUPERLINE";
    if (brand === "IMPLANTIUM") return "IMPLANTIUM";
  }

  if (manufacturer === "NEOBIOTECH") {
    if (brand.startsWith("IS")) return "IS";
    if (brand === "ALX") return "ALX";
  }

  if (manufacturer === "DIO") {
    if (brand.startsWith("UF")) return "UF";
  }

  if (manufacturer === "MEGAGEN") {
    if (brand.includes("ANYONE")) return "ANYONE";
    if (brand.includes("MINI")) return "MINI";
  }

  if (manufacturer === "DENTIS") {
    if (brand === "SQ" || brand === "ONEQ") return "SQ";
  }

  return brand;
};

const normalizeFamilyToken = (value) => {
  const t = normalizeToken(value);
  if (!t) return "";
  if (t === "SMALL" || t === "MINI") return "MINI";
  if (t === "SMALLNARROW" || t === "SN") return "SMALLNARROW";
  return t;
};

function resolvePackImplantSpec(request) {
  const manufacturer = normalizeToken(request?.caseInfos?.implantManufacturer);
  const brand = normalizeBrandByManufacturerToken(
    manufacturer,
    normalizeToken(request?.caseInfos?.implantBrand),
  );
  const family = normalizeFamilyToken(request?.caseInfos?.implantFamily);

  const matched = PACK_IMPLANT_SPEC_TABLE.find((row) => {
    if (row.manufacturer !== manufacturer) return false;
    if (!row.brands.includes(brand)) return false;
    return row.family === family;
  });

  if (matched) return matched;
  return null;
}

export function resolveScrewTypeForPrint(request) {
  const matched = resolvePackImplantSpec(request);
  if (matched?.screwType) return matched.screwType;
  return "-";
}

export function resolveConnectionDiameterForPrint(request) {
  const matched = resolvePackImplantSpec(request);
  if (matched && Number.isFinite(Number(matched.connectionDiameter))) {
    return Number(matched.connectionDiameter);
  }
  const fallback = Number(request?.caseInfos?.connectionDiameter);
  if (Number.isFinite(fallback)) return fallback;
  return null;
}

export default {
  printPackingLabelViaBgServer,
  resolveManufacturingDateForPrint,
  resolveScrewTypeForPrint,
  resolveConnectionDiameterForPrint,
};
