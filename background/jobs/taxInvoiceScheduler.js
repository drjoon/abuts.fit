import cron from "node-cron";
import TaxInvoiceDraft from "../model/taxInvoiceDraft.model.js";
import { issueTaxInvoice } from "../utils/popbill.util.js";

/**
 * 매일 낮 12시에 APPROVED 상태의 세금계산서를 일괄 발행
 */
export function startTaxInvoiceScheduler() {
  // 매일 12:00에 실행 (cron: 분 시 일 월 요일)
  cron.schedule("0 12 * * *", async () => {
    console.log(
      "[TaxInvoice Scheduler] 세금계산서 일괄 발행 시작:",
      new Date().toISOString()
    );

    try {
      await issuePendingTaxInvoices();
    } catch (error) {
      console.error("[TaxInvoice Scheduler] 일괄 발행 중 오류:", error);
    }
  });

  console.log("[TaxInvoice Scheduler] 스케줄러 시작됨 - 매일 12:00에 실행");
}

/**
 * APPROVED 상태의 세금계산서를 팝빌 API로 발행
 */
async function issuePendingTaxInvoices() {
  const corpNum = process.env.POPBILL_CORP_NUM || "";

  if (!corpNum) {
    console.error(
      "[TaxInvoice Scheduler] POPBILL_CORP_NUM 환경변수가 설정되지 않았습니다."
    );
    return;
  }

  // APPROVED 상태의 세금계산서 조회
  const pendingDrafts = await TaxInvoiceDraft.find({
    status: "APPROVED",
  })
    .populate("organizationId", "extracted")
    .lean();

  console.log(`[TaxInvoice Scheduler] 발행 대상: ${pendingDrafts.length}건`);

  let successCount = 0;
  let failCount = 0;

  for (const draft of pendingDrafts) {
    try {
      // 팝빌 세금계산서 객체 생성
      const taxInvoice = {
        writeDate: new Date().toISOString().split("T")[0].replace(/-/g, ""),
        chargeDirection: "정발행",
        issueType: "정발행",
        purposeType: "영수",
        taxType: "과세",

        // 공급자 정보 (어벗츠 주식회사)
        invoicerCorpNum: corpNum,
        invoicerCorpName: process.env.POPBILL_CORP_NAME || "어벗츠 주식회사",
        invoicerCEOName: process.env.POPBILL_CEO_NAME || "배태완",
        invoicerAddr: process.env.POPBILL_ADDR || "",
        invoicerBizType: process.env.POPBILL_BIZ_TYPE || "정보통신업",
        invoicerBizClass: process.env.POPBILL_BIZ_CLASS || "소프트웨어 개발",
        invoicerContactName: process.env.POPBILL_CONTACT_NAME || "",
        invoicerEmail: process.env.POPBILL_EMAIL || "",
        invoicerTEL: process.env.POPBILL_TEL || "",

        // 공급받는자 정보
        invoiceeCorpNum: draft.buyer?.bizNo || "",
        invoiceeCorpName: draft.buyer?.corpName || "",
        invoiceeCEOName: draft.buyer?.ceoName || "",
        invoiceeAddr: draft.buyer?.addr || "",
        invoiceeBizType: draft.buyer?.bizType || "",
        invoiceeBizClass: draft.buyer?.bizClass || "",
        invoiceeContactName: draft.buyer?.contactName || "",
        invoiceeEmail: draft.buyer?.contactEmail || "",
        invoiceeTEL: draft.buyer?.contactTel || "",

        // 금액 정보
        supplyCostTotal: String(draft.supplyAmount || 0),
        taxTotal: String(draft.vatAmount || 0),
        totalAmount: String(draft.totalAmount || 0),

        modifyCode: null,

        // 상세 품목
        detailList: [
          {
            serialNum: 1,
            purchaseDT: new Date()
              .toISOString()
              .split("T")[0]
              .replace(/-/g, ""),
            itemName: "크레딧 충전",
            spec: "",
            qty: "1",
            unitCost: String(draft.supplyAmount || 0),
            supplyCost: String(draft.supplyAmount || 0),
            tax: String(draft.vatAmount || 0),
            remark: "",
          },
        ],
      };

      // 팝빌 API 호출
      const result = await issueTaxInvoice(
        corpNum,
        taxInvoice,
        "자동발행",
        false
      );

      // 발행 성공 시 상태 업데이트
      await TaxInvoiceDraft.updateOne(
        { _id: draft._id },
        {
          $set: {
            status: "SENT",
            sentAt: new Date(),
            hometaxTrxId: result?.ntsconfirmNum || null,
            attemptCount: (draft.attemptCount || 0) + 1,
            lastAttemptAt: new Date(),
          },
        }
      );

      successCount++;
      console.log(
        `[TaxInvoice Scheduler] 발행 성공: ${draft._id} (${draft.buyer?.corpName})`
      );
    } catch (error) {
      // 발행 실패 시 상태 업데이트
      await TaxInvoiceDraft.updateOne(
        { _id: draft._id },
        {
          $set: {
            status: "FAILED",
            errorMessage: error.message || "발행 실패",
            attemptCount: (draft.attemptCount || 0) + 1,
            lastAttemptAt: new Date(),
          },
        }
      );

      failCount++;
      console.error(
        `[TaxInvoice Scheduler] 발행 실패: ${draft._id} (${draft.buyer?.corpName})`,
        error.message
      );
    }
  }

  console.log(
    `[TaxInvoice Scheduler] 발행 완료 - 성공: ${successCount}건, 실패: ${failCount}건`
  );
}

/**
 * 즉시 실행 (테스트용)
 */
export async function runTaxInvoiceSchedulerNow() {
  console.log(
    "[TaxInvoice Scheduler] 수동 실행 시작:",
    new Date().toISOString()
  );
  await issuePendingTaxInvoices();
}
