function normalizeBusinessNumberDigits(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
}

const DEFAULT_BASE_URL = "https://api.odcloud.kr/api/nts-businessman";

const MAX_VALIDATE_ATTEMPTS = 5;

function normalizeWhitespace(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParenthetical(input) {
  return String(input || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCompanyNameCandidates(name) {
  const candidates = [];
  const push = (value) => {
    const normalized = normalizeWhitespace(value);
    if (normalized) {
      candidates.push(normalized);
    }
  };

  const base = normalizeWhitespace(name);
  push(base);
  if (base) {
    const withoutParen = stripParenthetical(base);
    push(withoutParen);
    const collapsedPunct = base.replace(/[“”"']/g, "");
    push(collapsedPunct);
  }

  return Array.from(new Set(candidates));
}

function buildRepresentativeNameCandidates(name) {
  const candidates = [];
  const push = (value) => {
    const normalized = normalizeWhitespace(value);
    if (normalized) {
      candidates.push(normalized);
    }
  };

  const base = normalizeWhitespace(name);
  push(base);
  if (base) {
    push(stripParenthetical(base));
    const splitTokens = base
      .split(/[,/&]|(?:\s+및\s+)|(?:\s+and\s+)/i)
      .map((token) => normalizeWhitespace(token))
      .filter(Boolean);
    splitTokens.forEach(push);
  }

  return Array.from(new Set(candidates));
}

async function callHometax(path, payload) {
  const serviceKey = String(process.env.HOMETAX_SERVICE_KEY || "").trim();
  if (!serviceKey) {
    return {
      ok: false,
      message: "HOMETAX_SERVICE_KEY 환경변수가 설정되지 않았습니다.",
    };
  }

  const baseUrl = String(
    process.env.HOMETAX_BASE_URL || DEFAULT_BASE_URL,
  ).trim();
  const url = `${baseUrl}${path}?serviceKey=${encodeURIComponent(serviceKey)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      message: isTimeout
        ? "홈택스 API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
        : `홈택스 API 연결 오류: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  clearTimeout(timeoutId);

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

export async function verifyBusinessNumber({
  businessNumber,
  companyName,
  representativeName,
  startDate, // YYYYMMDD, optional
}) {
  const digits = normalizeBusinessNumberDigits(businessNumber);
  if (!digits) {
    return {
      verified: false,
      provider: "hometax",
      message: "유효한 사업자등록번호가 아닙니다.",
    };
  }

  // 2) 상태조회를 즉시 병렬 시작 (진위확인과 동시 실행으로 속도 개선)
  const statusPromise = callHometax("/v1/status", { b_no: [digits] });

  // 1) 진위확인: 대표자명 + 개업일자가 있을 때만 시도 (누락 시 malformed 에러 방지)
  let vItem = null;
  let validMsg = "";
  if (representativeName && startDate) {
    const companyCandidates = buildCompanyNameCandidates(companyName);
    const representativeCandidates =
      buildRepresentativeNameCandidates(representativeName);

    let attempts = 0;
    let lastValidationMessage = "";
    let validateApiError = false; // validate API 서버 오류로 중단된 경우
    outer: for (const companyCandidate of companyCandidates) {
      for (const repCandidate of representativeCandidates) {
        if (attempts >= MAX_VALIDATE_ATTEMPTS) {
          break outer;
        }
        attempts += 1;

        const validatePayload = {
          businesses: [
            {
              b_no: digits,
              b_nm: companyCandidate,
              p_nm: repCandidate,
              start_dt: String(startDate || "").trim(),
            },
          ],
        };

        const validateResp = await callHometax("/v1/validate", validatePayload);
        if (!validateResp.ok) {
          // validate API 서버 오류(일시적 장애 등)는 status-only 검증으로 fallback
          // 진위확인 실패를 등록 차단 사유로 쓰지 않는다
          console.warn(
            "[hometax] validate API 서버 오류 — status-only fallback",
            {
              message: validateResp.message,
            },
          );
          validateApiError = true;
          break outer;
        }

        vItem = Array.isArray(validateResp.data?.data)
          ? validateResp.data.data[0]
          : null;

        const validCode = String(vItem?.valid || "").trim();
        validMsg = String(vItem?.valid_msg || "").trim();
        lastValidationMessage = validMsg;

        if (validCode === "01") {
          break outer;
        }
      }
    }

    // validate API 서버 오류로 중단된 경우에는 status-only 검증으로 fallback
    if (
      !validateApiError &&
      representativeCandidates.length &&
      companyCandidates.length &&
      !vItem
    ) {
      return {
        verified: false,
        provider: "hometax",
        message:
          lastValidationMessage ||
          "홈택스 진위확인에 실패했습니다. 사업자등록번호/상호를 확인해주세요.",
      };
    }
  }

  // 2) 상태조회 결과 수집 (이미 병렬로 시작됨)
  const statusResp = await statusPromise;
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
