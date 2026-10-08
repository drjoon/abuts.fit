// related files:
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/public/TermsPage.tsx
// - web/frontend/src/pages/public/HelpPage.tsx
// - web/backend/utils/remakePricingPolicy.js
// change-log:
// - 2026-10-09: 치과 본인 정책은 어벗츠에 건당 1만원 한 줄 유지(사이드바는 기공소에·어벗츠에).
// - 2026-10-08: 치과 안내 모달 — 어벗츠에 페이지로 주문하므로 건당 1만원 한 줄만 표시.
// - 2026-10-07: 리메이크 행 라벨에 플랫폼 이용 조건 병합. 하단 노트=180일·배송비.
// - 2026-10-07: 리메이크 과금 카피 SSOT — 어벗츠로부터/기공소에=무료, 어벗츠로/어벗츠에=건당 1만원.

/** 어벗츠로(Request) 리메이크 단가(원). 배송비 별도. */
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
    // 치과 리메이크는 「어벗츠에」 페이지로 주문한다. 건당 1만원만 안내.
    return [{ pathLabel: "어벗츠에", priceLabel: "건당 1만원" }];
  }
  if (audience === "public") {
    return [
      {
        pathLabel: "어벗츠로부터 · 기공소에 (치과·기공소 모두 플랫폼 이용)",
        priceLabel: "무료",
      },
      {
        pathLabel: "어벗츠로 · 어벗츠에 (기공소만 플랫폼 이용)",
        priceLabel: "건당 1만원",
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
      priceLabel: "건당 1만원",
    },
  ];
}

/** 정책 모달·안내 하단 조건(문장 단위). 경로별 조건은 pathLabel에 둠. */
export function remakePolicyNoteLines(
  _audience: RemakePolicyAudience,
): string[] {
  return ["동일 치과·환자·치식·최근 180일.", "배송비는 별도."];
}

/** 한 줄 요약(설정·헬프·토스트). */
export function remakePolicySummaryLine(
  audience: RemakePolicyAudience = "lab",
): string {
  if (audience === "practice") {
    return "리메이크는 기공소에 무료, 어벗츠에 건당 1만원입니다.";
  }
  if (audience === "public") {
    return "리메이크는 어벗츠로부터(기공소에) 무료, 어벗츠로(어벗츠에) 건당 1만원입니다.";
  }
  return "리메이크는 어벗츠로부터 무료, 어벗츠로 건당 1만원입니다.";
}

/** 이용약관 제6조 본문(문장 배열 — 호출측에서 br). */
export const REMAKE_TERMS_ARTICLE_LINES = [
  "리메이크는 어벗츠로부터(치과·기공소 모두 플랫폼 이용·기공소에)는 무료이며,",
  "어벗츠로(기공소만 플랫폼 이용·어벗츠에)는 건당 10,000원입니다. 배송비는 별도입니다.",
  "상세는 서비스 화면의 가격·출고 정책 안내를 따릅니다.",
] as const;
