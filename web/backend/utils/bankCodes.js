// related files:
// - web/backend/services/payoutAccountVerify.service.js
// - web/backend/services/bankbookOcr.service.js
// - web/frontend/src/shared/components/business/settings/LabPayoutAccountCard.tsx
// change-log:
// - 2026-09-16: 팝빌 예금주조회용 금융기관 코드·은행명 매핑 SSOT.

/** 팝빌 예금주조회 은행 코드(4자리). 증권사는 필요 시 확장. */
export const POPBILL_BANK_ENTRIES = [
  { code: "0002", name: "산업은행", aliases: ["한국산업은행", "kdb", "kdb산업"] },
  { code: "0003", name: "기업은행", aliases: ["ibk", "ibk기업"] },
  { code: "0004", name: "국민은행", aliases: ["kb", "kb국민", "kb국민은행"] },
  { code: "0007", name: "수협은행", aliases: ["수협", "sh수협"] },
  { code: "0011", name: "농협은행", aliases: ["농협", "nh", "nh농협", "nh농협은행"] },
  { code: "0012", name: "농축협", aliases: ["단위농협", "지역농협"] },
  { code: "0020", name: "우리은행", aliases: ["우리"] },
  { code: "0023", name: "SC제일은행", aliases: ["sc", "sc제일", "제일은행", "스탠다드차타드"] },
  { code: "0027", name: "씨티은행", aliases: ["citibank", "씨티"] },
  { code: "0031", name: "아이엠뱅크", aliases: ["대구은행", "imbank", "i.m뱅크", "im뱅크"] },
  { code: "0032", name: "부산은행", aliases: ["bnk부산"] },
  { code: "0034", name: "광주은행", aliases: [] },
  { code: "0035", name: "제주은행", aliases: [] },
  { code: "0037", name: "전북은행", aliases: [] },
  { code: "0039", name: "경남은행", aliases: ["bnk경남"] },
  { code: "0045", name: "새마을금고", aliases: ["마을금고", "mg", "mg새마을"] },
  { code: "0048", name: "신협중앙회", aliases: ["신협", "신용협동조합"] },
  { code: "0050", name: "상호저축은행", aliases: ["저축은행"] },
  { code: "0054", name: "HSBC은행", aliases: ["hsbc"] },
  { code: "0055", name: "도이치은행", aliases: ["deutsche"] },
  { code: "0057", name: "JP모간체이스은행", aliases: ["jp모건", "jpmorgan"] },
  { code: "0060", name: "BOA은행", aliases: ["boa", "뱅크오브아메리카"] },
  { code: "0061", name: "비엔피파리바은행", aliases: ["bnp", "bnp파리바"] },
  { code: "0062", name: "중국공상은행", aliases: ["공상은행"] },
  { code: "0063", name: "중국은행", aliases: [] },
  { code: "0064", name: "산림조합중앙회", aliases: ["산림조합"] },
  { code: "0067", name: "중국건설은행", aliases: [] },
  { code: "0071", name: "우체국", aliases: ["우체국은행", "우체국예금"] },
  { code: "0081", name: "하나은행", aliases: ["하나", "케이에프씨하나", "외환은행"] },
  { code: "0088", name: "신한은행", aliases: ["신한"] },
  { code: "0089", name: "케이뱅크", aliases: ["k뱅크", "kbank"] },
  { code: "0090", name: "카카오뱅크", aliases: ["카카오", "kakao"] },
  { code: "0092", name: "토스뱅크", aliases: ["토스", "toss"] },
];

function normalizeBankKey(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\(주\)|주식회사|㈜|유한회사|유\s*한/g, "")
    .replace(/은행$/, "은행");
}

/**
 * 은행명(또는 별칭) → 팝빌 기관코드·표준 은행명.
 * @returns {{ code: string, name: string } | null}
 */
export function resolvePopbillBank(bankNameOrCode) {
  const raw = String(bankNameOrCode || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 4 || digits.length === 3) {
    const code = digits.padStart(4, "0");
    const hit = POPBILL_BANK_ENTRIES.find((e) => e.code === code);
    if (hit) return { code: hit.code, name: hit.name };
  }

  const key = normalizeBankKey(raw);
  if (!key) return null;

  for (const entry of POPBILL_BANK_ENTRIES) {
    const candidates = [entry.name, ...(entry.aliases || [])].map(normalizeBankKey);
    if (candidates.some((c) => c && (key === c || key.includes(c) || c.includes(key)))) {
      return { code: entry.code, name: entry.name };
    }
  }

  return null;
}

/** 예금주/상호 비교용 정규화. */
export function normalizeAccountHolderName(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\(주\)|주식회사|㈜|유한회사|유\s*한|사단법인|재단법인/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function accountHoldersMatch(a, b) {
  const left = normalizeAccountHolderName(a);
  const right = normalizeAccountHolderName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
