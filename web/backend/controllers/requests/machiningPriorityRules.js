// related files:
// - web/backend/rules.md
// - web/backend/controllers/requests/production.utils.js
// - web/backend/controllers/requests/common.review.machine.js
// - web/backend/controllers/requests/expressDeadlineRebalance.utils.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx

/**
 * 가공 우선순위 / 장비 배정 룰 SSOT (UI·문서 공유용).
 * 실제 정렬/배정 구현은 production.utils / common.review.machine / expressDeadlineRebalance 를 따른다.
 */
export const MACHINING_PRIORITY_RULES = {
  version: "2026-08-05",
  title: "가공 우선순위 룰",
  sections: [
    {
      id: "queue-order",
      title: "장비 큐 정렬 (재생목록 / Next Up)",
      items: [
        "가공중(Now Playing) 건이 항상 맨 앞",
        "아노다이징 ON + 신속배송",
        "아노다이징 ON + 묶음배송",
        "아노다이징 OFF + 신속배송",
        "아노다이징 OFF + 묶음배송",
        "같은 그룹 안에서는 queuePosition → 발송예정(scheduledShipPickup) → requestId",
      ],
    },
    {
      id: "machine-assign",
      title: "준비→가공 승인 시 장비 배정",
      items: [
        "활성 CNC + 배정 허용(allowRequestAssign) + 현재 소재 직경이 있는 장비만 후보",
        "요청 maxDiameter(또는 스케줄 직경)를 현재 소재로 커버 가능한 장비만 선택 (소재 직경 ≥ 요청 직경)",
        "우선순위: ① 큐 부하(적은 쪽) ② 커버 가능한 소재 중 가장 작은 직경 ③ 최근 배정이 오래된 장비 ④ machineId",
        "배정 후 해당 장비 큐를 정책 순위로 재번호(placeRequestAtPolicyQueuePosition)",
      ],
    },
    {
      id: "express-deadline-rebalance",
      title: "신속배송 14:00 완료 — 빠른 가공 재배치",
      items: [
        "당일 발송 신속배송 건은 낮 14:00(KST)까지 가공 완료를 목표로 한다 (패킹 컷오프)",
        "한쪽 장비는 예상 완료가 14:00을 넘기고, 다른 장비는 여유가 있으며 해당 건을 가공 가능하면(소재 직경 ≥ maxDiameter) 여유 장비로 옮긴다",
        "예: maxDiameter 7.5mm → 8mm 장비(M4)가 바쁘고 10mm 장비(M5)에 여유가 있으면 M5로 이동",
        "소재 직경이 바뀌면 Esprit를 다시 돌려 해당 소재 직경에 맞는 NC를 생성한다",
        "재배치된 건에는 「빠른 가공 재배치」 뱃지를 표시하고, Alert로 장비별 배정·예상 가공시간·예상 완료 시각을 안내한다",
        "예상 가공시간은 최근 완료 건의 (가공시간 ÷ 최대길이) 중 최댓값(보수적)으로 책정한다",
      ],
    },
  ],
};

export function getMachiningPriorityRules() {
  return MACHINING_PRIORITY_RULES;
}
