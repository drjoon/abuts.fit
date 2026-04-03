import { ApiError } from "./ApiError.js";

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
 * @param {string} params.patientName - 환자명
 * @param {string} params.toothNumber - 치아번호
 * @param {string} params.material - 소재
 * @param {string} [params.printer] - 프린터명 (선택)
 * @param {string} [params.paperProfile] - 용지 프로필 (선택, 기본: PACK_80x65)
 * @param {number} [params.copies] - 출력 매수 (선택, 기본: 1)
 * @returns {Promise<{success: boolean, generated?: {requestId: string, lotNumber: string}}>}
 */
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
  patientName,
  toothNumber,
  material,
  printer,
  paperProfile = "PACK_80x65",
  copies = 1,
}) {
  const url = `${PACK_PRINT_SERVER_BASE}/print-packing-label`;

  const headers = {
    "Content-Type": "application/json",
  };

  if (PACK_PRINT_SERVER_SHARED_SECRET) {
    headers["x-pack-secret"] = PACK_PRINT_SERVER_SHARED_SECRET;
  }

  const payload = {
    requestId,
    lotNumber,
    mailboxCode,
    screwType,
    clinicName,
    labName,
    requestDate,
    manufacturingDate,
    implantManufacturer,
    implantSystem: implantBrand, // pack-server는 implantSystem 필드 사용
    implantFamily,
    implantType,
    patientName,
    toothNumber,
    material,
    printer: printer || PACK_PRINT_DEFAULT_PRINTER || undefined,
    paperProfile,
    copies,
    dpi: 600, // 패킹 라벨 프린터 DPI 명시
    title: `Custom Abutment Packing ${requestId || lotNumber || ""}`.trim(),
  };

  console.log("[packPrint] sending print request to pack-server", {
    url,
    requestId,
    lotNumber,
    printer: printer || "(auto)",
    paperProfile,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PACK_PRINT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

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

    console.log("[packPrint] pack-server print success", {
      requestId,
      lotNumber,
      generated: data?.generated || null,
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
 * @returns {string} - 스크류 타입 (예: "A0", "B8")
 */
export function resolveScrewTypeForPrint(request) {
  const manufacturer = String(
    request?.caseInfos?.implantManufacturer || "",
  ).trim();
  const isDentium =
    /\bDENTIUM\b/i.test(manufacturer) || manufacturer.includes("덴티움");
  const legacy = isDentium ? "8B" : "0A";
  return legacy.split("").reverse().join("");
}

export default {
  printPackingLabelViaBgServer,
  resolveManufacturingDateForPrint,
  resolveScrewTypeForPrint,
};
