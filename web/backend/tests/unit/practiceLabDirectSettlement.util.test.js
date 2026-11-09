// related files:
// - web/backend/utils/practiceLabDirectSettlement.util.js
import { resolveTrusteeIssueEnabled } from "../../utils/trusteeIssueConsent.js";
import {
  isDirectPayLabAnchor,
  isEligibleDirectSettlementMonth,
  livePayoutAccount,
  patientLabelFromTransfer,
  resolvePayableAmount,
} from "../../utils/practiceLabDirectSettlement.util.js";

describe("resolveTrusteeIssueEnabled", () => {
  test("updatedAt 없으면 옛 true도 미응답", () => {
    expect(resolveTrusteeIssueEnabled({ trusteeIssueEnabled: true })).toBeNull();
    expect(resolveTrusteeIssueEnabled(null)).toBeNull();
  });

  test("저장한 true와 false만 답으로 본다", () => {
    const updatedAt = new Date("2026-11-10T00:00:00+09:00");
    expect(resolveTrusteeIssueEnabled({ trusteeIssueEnabled: true, updatedAt })).toBe(true);
    expect(resolveTrusteeIssueEnabled({ trusteeIssueEnabled: false, updatedAt })).toBe(false);
  });
});

describe("direct lab settlement amounts", () => {
  test("총액을 비우면 줄 합계", () => {
    expect(resolvePayableAmount([{ amount: 10000 }, { amount: 2500 }], null)).toBe(12500);
  });

  test("총액을 지정하면 그 금액", () => {
    expect(resolvePayableAmount([{ amount: 10000 }], 8000)).toBe(8000);
  });

  test("2026-10부터 닫힌 달만 정산", () => {
    expect(isEligibleDirectSettlementMonth("2026-09", "2026-10")).toBe(false);
    expect(isEligibleDirectSettlementMonth("2026-10", "2026-10")).toBe(true);
    expect(isEligibleDirectSettlementMonth("2026-11", "2026-10")).toBe(false);
  });

  test("환자명과 치아를 한 줄로", () => {
    expect(
      patientLabelFromTransfer({
        files: { patientName: "김민수" },
        toothWorks: [{ toothNumber: "21" }, { toothNumber: "22" }],
      }),
    ).toBe("김민수 · 21,22");
  });

  test("계좌가 있으면 통장 사본은 있을 때만 붙인다", () => {
    expect(
      livePayoutAccount({
        payoutAccount: { bankName: "국민", accountNumber: "110", holderName: "기공소" },
      }),
    ).toEqual({
      bankName: "국민",
      accountNumber: "110",
      holderName: "기공소",
      bankbook: null,
    });
    expect(
      livePayoutAccount({
        payoutAccount: {
          bankName: "국민",
          accountNumber: "110",
          holderName: "기공소",
          bankbook: { s3Key: "book/a.jpg", fileId: "f1", originalName: "통장.jpg" },
        },
      }).bankbook,
    ).toEqual({ s3Key: "book/a.jpg", fileId: "f1", originalName: "통장.jpg" });
    expect(livePayoutAccount({ payoutAccount: { bankName: "국민" } })).toBeNull();
  });

  test("외부 기공소만 직접 입금", () => {
    expect(isDirectPayLabAnchor({ businessType: "requestor", requestorKind: "lab" })).toBe(true);
    expect(isDirectPayLabAnchor({ businessType: "internalLab", requestorKind: "lab" })).toBe(false);
    expect(isDirectPayLabAnchor({ businessType: "requestor", requestorKind: "practice" })).toBe(
      false,
    );
  });
});
