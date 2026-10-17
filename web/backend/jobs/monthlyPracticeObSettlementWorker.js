// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/models/practiceMonthlySettlement.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/server.js
//
// 1. 매월 1일 KST: 전월 치과 사용분(기공소별 기공물 N건 + 어벗츠 법인 커스텀어벗 1건) 정산서 확정 생성.
// 2. 매월 5일 09:00 KST 이후: 확정된 정산서를 대상으로 OB 장기동의 자동 일괄이체 실행(실패 시 즉시 Hold).
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeMonthlySettlement from "../models/practiceMonthlySettlement.model.js";
import {
  confirmPracticeMonthlySettlement,
  getKstYearMonth,
  resolvePreviousKstYearMonth,
  runPracticeMonthlySettlementTransfer,
} from "../services/practiceObBilling.service.js";

let timerHandle = null;
let running = false;
let lastConfirmMonthKey = "";
let lastExecuteMonthKey = "";

function getKstHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart?.value || 0);
}

export async function runMonthlyObSettlementTick(now = new Date()) {
  const { year, month, day } = getKstYearMonth(now);
  const hour = getKstHour(now);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const prevYearMonth = resolvePreviousKstYearMonth(now);

  const summary = {
    confirmedCount: 0,
    executedCount: 0,
  };

  // 1) 매월 1일: 전월 정산서 확정 생성
  if (day >= 1 && lastConfirmMonthKey !== monthKey) {
    const practices = await BusinessAnchor.find({
      businessType: "requestor",
      $or: [
        { requestorKind: "practice" },
        { "requestorCapabilities.practice": true },
      ],
    })
      .select({ _id: 1 })
      .lean();

    for (const p of practices) {
      await confirmPracticeMonthlySettlement({
        practiceAnchorId: p._id,
        yearMonth: prevYearMonth,
        now,
      });
      summary.confirmedCount += 1;
    }
    lastConfirmMonthKey = monthKey;
  }

  // 2) 매월 5일 09:00 KST 이후: CONFIRMED 상태의 정산서 자동 일괄이체 실행
  if (
    (day > 5 || (day === 5 && hour >= 9)) &&
    lastExecuteMonthKey !== monthKey
  ) {
    const pendingSettlements = await PracticeMonthlySettlement.find({
      yearMonth: prevYearMonth,
      status: "CONFIRMED",
      totalAmount: { $gt: 0 },
    })
      .select({ _id: 1 })
      .lean();

    for (const s of pendingSettlements) {
      await runPracticeMonthlySettlementTransfer({
        settlementId: s._id,
        now,
      });
      summary.executedCount += 1;
    }
    lastExecuteMonthKey = monthKey;
  }

  return summary;
}

async function loop() {
  if (running) return;
  running = true;
  try {
    await runMonthlyObSettlementTick();
  } catch (error) {
    console.error("[monthlyPracticeObSettlementWorker] failed", error);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, 60 * 60 * 1000);
    timerHandle.unref?.();
  }
}

export function startMonthlyPracticeObSettlementWorker() {
  if (
    process.env.PRACTICE_OB_SETTLEMENT_WORKER_ENABLED === "false" ||
    timerHandle
  ) {
    return;
  }
  loop();
}
