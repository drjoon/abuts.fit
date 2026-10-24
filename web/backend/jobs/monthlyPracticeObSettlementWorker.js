// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/models/practiceMonthlySettlement.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/server.js
//
// 익월 1일 09:00 KST 이후: 전월 기공료 정산서 확정 + 안내 문자.
// 1차 입금 영업일 12:00: 아직 확인되지 않으면 재안내 문자.
// 계좌 이체는 하지 않는다. 담당자가 입금 확인·기공소 송금을 직접 한다.
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  confirmPracticeMonthlySettlement,
  dispatchPracticeSettlementNotices,
  resolvePreviousKstYearMonth,
} from "../services/practiceObBilling.service.js";
import { resolvePracticeSettlementCalendar } from "../utils/practiceSettlementCalendar.js";

let timerHandle = null;
let running = false;
let lastConfirmCycleKey = "";

export async function runMonthlyObSettlementTick(now = new Date()) {
  const prevYearMonth = resolvePreviousKstYearMonth(now);
  const calendar = resolvePracticeSettlementCalendar(prevYearMonth);
  const summary = {
    confirmedCount: 0,
    noticed: 0,
    reminded: 0,
  };

  if (now < calendar.noticeAt) return summary;

  if (lastConfirmCycleKey !== calendar.noticeYmd) {
    const practices = await BusinessAnchor.find({
      businessType: "requestor",
      $or: [
        { requestorKind: "practice" },
        { "requestorCapabilities.practice": true },
      ],
    })
      .select({ _id: 1 })
      .lean();

    for (const practice of practices) {
      await confirmPracticeMonthlySettlement({
        practiceAnchorId: practice._id,
        yearMonth: prevYearMonth,
        now,
      });
      summary.confirmedCount += 1;
    }
    lastConfirmCycleKey = calendar.noticeYmd;
  }

  const sent = await dispatchPracticeSettlementNotices({ now });
  summary.noticed = sent.noticed;
  summary.reminded = sent.reminded;
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
