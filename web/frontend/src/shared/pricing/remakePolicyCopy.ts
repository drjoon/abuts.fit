// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/public/TermsPage.tsx
// - web/frontend/src/pages/public/HelpPage.tsx
// - web/backend/utils/remakePricingPolicy.js
// change-log:
// - 2026-10-09: 어벗츠로 리메이크 고정 1만원 폐지 — 거래처가(딜러 설정가) 또는 기본가 적용.
// - 2026-10-09: 치과 안내 모달 — 기공소에 무료 행 추가(어벗츠로부터 라벨은 기공소에).
// - 2026-10-09: 치과 본인 정책은 어벗츠에 건당 1만원 한 줄만 쓰던 표시를 되돌림.
// - 2026-10-09: 리메이크 안내의 「배송비는 별도」→「배송비 판매자 부담」.
// - 2026-10-07: 리메이크 행 라벨에 플랫폼 이용 조건 병합. 하단 노트=180일·배송비.
// - 2026-10-07: 리메이크 과금 카피 SSOT — 어벗츠로부터/기공소에=무료, 어벗츠로/어벗츠에=건당 1만원.

/** 어벗츠로(Request) 리메이크 단가(원). 배송비는 판매자 부담. */
export const REMAKE_ABUTS_FIXED_AMOUNT = 10_000;

export type RemakePolicyAudience = "lab" | "practice" | "public";

export type RemakePolicyRow = {
  pathLabel: string;
  priceLabel: string;
};

/**
 * 역할별 리메이크 경로 라벨.
 * - lab: 사이드바 「어벗츠로부터 / 어벗츠로」
 * - practice: 사이드바 「기공소에 / 어벗츠에」
 * - public: 약관·헬프 — 양쪽 표기
 */
export function remakePolicyRows(
  audience: RemakePolicyAudience,
): RemakePolicyRow[] {
  if (audience === "practice") {
    return [
      {
        pathLabel: "기공소에 (치과·기공소 모두 플랫폼 이용)",
        priceLabel: "무료",
      },
      {
        pathLabel: "어벗츠에 (기공소만 플랫폼 이용)",
        priceLabel: "일반 의뢰비와 동일",
      },
    ];
  }
  if (audience === "public") {
    return [
      {
        pathLabel: "어벗츠로부터 · 기공소에 (치과·기공소 모두 플랫폼 이용)",
        priceLabel: "무료",
      },
      {
        pathLabel: "어벗츠로 · 어벗츠에 (기공소만 플랫폼 이용)",
        priceLabel: "일반 의뢰비와 동일",
      },
    ];
  }
  return [
    {
      pathLabel: "어벗츠로부터 (치과·기공소 모두 플랫폼 이용)",
      priceLabel: "무료",
    },
    {
      pathLabel: "어벗츠로 (기공소만 플랫폼 이용)",
      priceLabel: "일반 의뢰비와 동일",
    },
  ];
}

/** 정책 모달·안내 하단 조건(문장 단위). 경로별 조건은 pathLabel에 둠. */
export function remakePolicyNoteLines(
  _audience: RemakePolicyAudience,
): string[] {
  return ["동일 치과·환자·치식·최근 180일.", "배송비 판매자 부담."];
}

/** 한 줄 요약(설정·헬프·토스트). */
export function remakePolicySummaryLine(
  audience: RemakePolicyAudience = "lab",
): string {
  if (audience === "practice") {
    return "리메이크는 기공소에 무료, 어벗츠에 일반 의뢰비와 동일합니다.";
  }
  if (audience === "public") {
    return "리메이크는 어벗츠로부터(기공소에) 무료, 어벗츠로(어벗츠에) 일반 의뢰비와 동일합니다.";
  }
  return "리메이크는 어벗츠로부터 무료, 어벗츠로 일반 의뢰비와 동일합니다.";
}

/** 이용약관 제6조 본문(문장 배열 — 호출측에서 br). */
export const REMAKE_TERMS_ARTICLE_LINES = [
  "리메이크는 어벗츠로부터(치과·기공소 모두 플랫폼 이용·기공소에)는 무료이며,",
  "어벗츠로(기공소만 플랫폼 이용·어벗츠에)는 일반 의뢰비와 동일합니다.",
  "배송비 판매자 부담.",
  "상세는 서비스 화면의 가격·출고 정책 안내를 따릅니다.",
] as const;
