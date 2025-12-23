function normalizeBusinessNumberDigits(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
}

const DEFAULT_BASE_URL = "https://api.odcloud.kr/api/nts-businessman";

async function callHometax(path, payload) {
  const serviceKey = String(process.env.HOMETAX_SERVICE_KEY || "").trim();
  if (!serviceKey) {
    return {
      ok: false,
      message: "HOMETAX_SERVICE_KEY 환경변수가 설정되지 않았습니다.",
    };
  }

  const baseUrl = String(
    process.env.HOMETAX_BASE_URL || DEFAULT_BASE_URL
  ).trim();
  const url = `${baseUrl}${path}?serviceKey=${encodeURIComponent(serviceKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      message:
        text ||
        `홈택스 API 응답 오류(status ${resp.status}). 관리자에게 문의해주세요.`,
    };
  }

  const data = await resp.json().catch(() => null);
  return { ok: true, data };
}

export async function verifyBusinessNumber({ businessNumber, companyName }) {
  const digits = normalizeBusinessNumberDigits(businessNumber);
  if (!digits) {
    return {
      verified: false,
      provider: "hometax",
      message: "유효한 사업자등록번호가 아닙니다.",
    };
  }

  // 1) 진위확인: 번호 + 상호명으로 검증
  const validatePayload = {
    businesses: [
      {
        b_no: digits,
        b_nm: String(companyName || "").trim(),
      },
    ],
  };

  const validateResp = await callHometax("/v1/validate", validatePayload);
  if (!validateResp.ok) {
    return {
      verified: false,
      provider: "hometax",
      message: validateResp.message,
    };
  }

  const vItem = Array.isArray(validateResp.data?.data)
    ? validateResp.data.data[0]
    : null;

  const validCode = String(vItem?.valid || "").trim(); // "01" 정상, "02" 불일치
  const validMsg = String(vItem?.valid_msg || "").trim();

  if (validCode && validCode !== "01") {
    return {
      verified: false,
      provider: "hometax",
      message:
        validMsg ||
        "홈택스 진위확인에 실패했습니다. 사업자등록번호/상호를 확인해주세요.",
    };
  }

  // 2) 상태조회: 휴업/폐업 여부 체크
  const statusPayload = { b_no: [digits] };
  const statusResp = await callHometax("/v1/status", statusPayload);
  if (!statusResp.ok) {
    return {
      verified: false,
      provider: "hometax",
      message: statusResp.message,
    };
  }

  const sItem = Array.isArray(statusResp.data?.data)
    ? statusResp.data.data[0]
    : null;

  const statusCode = String(sItem?.b_stt_cd || "").trim(); // 01 계속, 02 휴업, 03 폐업
  const taxType = String(sItem?.tax_type || "").trim();

  if (statusCode === "02") {
    return {
      verified: false,
      provider: "hometax",
      message: "휴업 상태의 사업자등록번호입니다.",
      raw: { status: sItem, validate: vItem },
    };
  }

  if (statusCode === "03") {
    return {
      verified: false,
      provider: "hometax",
      message: "폐업된 사업자등록번호입니다.",
      raw: { status: sItem, validate: vItem },
    };
  }

  return {
    verified: true,
    provider: "hometax",
    message:
      validMsg ||
      (taxType ? `검증 완료 (${taxType})` : "사업자등록번호가 확인되었습니다."),
    raw: { validate: vItem, status: sItem },
  };
}

export default {
  verifyBusinessNumber,
};
