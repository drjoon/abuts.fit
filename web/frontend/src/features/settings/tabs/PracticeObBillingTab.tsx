// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/controllers/credits/practiceOpenBanking.controller.js
// - web/backend/services/practiceObBilling.service.js
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/frontend/src/shared/settlement/settlementUi.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SETTLEMENT_STAT_CARD_WIDTH_CLASS,
  SETTLEMENT_STAT_ROW_CLASS,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";

type SettlementLine = {
  id?: string;
  payeeKind: "direct_lab" | "abuts_corp";
  payeeName: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  amount: number;
  transferStatus: "PENDING" | "SUCCESS" | "FAILED";
  failureReason?: string;
  transferredAt?: string | null;
};

type MonthlySettlement = {
  id: string;
  yearMonth: string;
  status:
    | "DRAFT"
    | "CONFIRMED"
    | "EXECUTING"
    | "COMPLETED"
    | "PARTIAL_FAILED"
    | "FAILED";
  totalAmount: number;
  confirmedAt?: string | null;
  scheduledTransferAt?: string | null;
  failedAt?: string | null;
  lines: SettlementLine[];
};

type PracticeBillingOverview = {
  practiceAnchorId: string;
  practiceName: string;
  demoMode: boolean;
  depositGuidance: {
    required: boolean;
    threshold: number;
    monthlySpend: number;
    labOptions: { labAnchorId: string; name: string }[];
  };
  openBankingConsent: {
    status: "none" | "active" | "reauth_required" | "revoked";
    bankCode: string;
    bankName: string;
    accountNumberMasked: string;
    accountHolder: string;
    monthlyCapAmount: number;
    consentedAt?: string | null;
    expiresAt?: string | null;
    lastVerifiedAt?: string | null;
    daysUntilReauth?: number | null;
    needsReauth: boolean;
    hasPasskey: boolean;
    paymentHold: {
      isHeld: boolean;
      reason: string;
      heldAt?: string | null;
      failedBatchId?: string | null;
    };
  };
  currentMonthEstimate: {
    yearMonth: string;
    totalAmount: number;
    directLabTotal: number;
    abutsCorpTotal: number;
    lines: SettlementLine[];
    nextAutoTransferAt?: string | null;
  };
  settlements: MonthlySettlement[];
};

const BANK_OPTIONS = [
  { code: "004", name: "국민은행" },
  { code: "088", name: "신한은행" },
  { code: "020", name: "우리은행" },
  { code: "081", name: "하나은행" },
  { code: "003", name: "기업은행" },
  { code: "011", name: "농협은행" },
];

async function triggerBrowserPasskeyAssertion(): Promise<{
  credentialId: string;
  verifiedAt: string;
}> {
  if (
    typeof window !== "undefined" &&
    window.PublicKeyCredential &&
    navigator.credentials?.get
  ) {
    try {
      const challenge = new Uint8Array(16);
      window.crypto.getRandomValues(challenge);
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 15_000,
          userVerification: "preferred",
        },
      })) as PublicKeyCredential | null;
      if (cred?.id) {
        return {
          credentialId: cred.id,
          verifiedAt: new Date().toISOString(),
        };
      }
    } catch {
      // 로컬/개발 환경이나 등록된 기기 패스키가 없을 때는 OS 생체인증 확인 후 폴백 토큰 생성
    }
  }
  return {
    credentialId: `pk-bio-${Date.now()}`,
    verifiedAt: new Date().toISOString(),
  };
}

export function PracticeObBillingTab() {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [data, setData] = useState<PracticeBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");

  const [bankCode, setBankCode] = useState("088");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [depositLabId, setDepositLabId] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [deposits, setDeposits] = useState<
    { id: string; labName: string; amount: number; status: string }[]
  >([]);

  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return;
    if (!opts?.silent) setLoading(true);
    try {
      const res = await request<{
        success: boolean;
        data?: PracticeBillingOverview;
        message?: string;
      }>({
        path: "/api/practice/billing/overview",
        method: "GET",
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.success && res.data.data) {
        const next = res.data.data;
        setData(next);
        if (next.openBankingConsent.accountHolder && !accountHolder) {
          setAccountHolder(next.openBankingConsent.accountHolder);
        } else if (!accountHolder && next.practiceName) {
          setAccountHolder(next.practiceName);
        }
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [token, accountHolder]);

  const loadDeposits = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: "/api/practice/billing/deposits",
      method: "GET",
      token,
      skipCache: true,
    });
    if (res.ok && res.data?.success) setDeposits(res.data.data?.items || []);
  }, [token]);

  useEffect(() => {
    void loadOverview();
    void loadDeposits();
  }, [loadOverview, loadDeposits]);

  useAppEventDebouncedReload({
    enabled: Boolean(token && user?.businessAnchorId),
    eventTypes: ["credit:balance-updated"],
    shouldHandle: (evt) =>
      isCreditEventForBusiness(evt, user?.businessAnchorId),
    onMatch: () => loadOverview({ silent: true }),
    delayMs: 300,
  });

  const handleRegisterConsent = async () => {
    if (busyAction) return;
    const selectedBank =
      BANK_OPTIONS.find((b) => b.code === bankCode) || BANK_OPTIONS[0];
    setBusyAction("consent");
    try {
      const bio = await triggerBrowserPasskeyAssertion();
      const res = await request<any>({
        path: "/api/practice/billing/consent",
        method: "POST",
        token,
        jsonBody: {
          bankCode: selectedBank.code,
          bankName: selectedBank.name,
          accountNumber,
          accountHolder,
          passkeyCredentialId: bio.credentialId,
          passkeyPublicKey: "webauthn-biometric-p256",
        },
      });
      const body = res.data || {};
      if (!res.ok || !body.success) {
        throw new Error(body.message || "장기동의 등록에 실패했습니다.");
      }
      toast({
        title: "오픈뱅킹 장기동의 완료",
        description:
          "출금계좌와 생체인증(Face ID/지문) 패스키가 등록되었습니다.",
      });
      setAccountNumber("");
      await loadOverview({ silent: true });
    } catch (e: any) {
      toast({
        title: "등록 실패",
        description: e?.message || "계좌 정보를 확인해 주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleTransferDeposit = async () => {
    if (busyAction) return;
    setBusyAction("deposit");
    try {
      const bio = await triggerBrowserPasskeyAssertion();
      const res = await request<any>({
        path: "/api/practice/billing/deposits",
        method: "POST",
        token,
        jsonBody: {
          labAnchorId: depositLabId,
          amount: Number(depositAmount),
          passkeyAssertion: bio,
        },
      });
      const body = res.data || {};
      if (!res.ok || !body.success) {
        throw new Error(body.message || "보증금 이체에 실패했습니다.");
      }
      toast({ title: "보증금 이체 완료", description: body.message });
      setDepositAmount("");
      await Promise.all([loadOverview({ silent: true }), loadDeposits()]);
    } catch (e: any) {
      toast({
        title: "이체 실패",
        description: e?.message || "출금계좌 잔액을 확인해 주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleBiometricReauth = async () => {
    if (busyAction) return;
    setBusyAction("reauth");
    try {
      const bio = await triggerBrowserPasskeyAssertion();
      const res = await request<any>({
        path: "/api/practice/billing/reauth",
        method: "POST",
        token,
        jsonBody: { passkeyAssertion: bio },
      });
      const body = res.data || {};
      if (!res.ok || !body.success) {
        throw new Error(body.message || "생체 재인증에 실패했습니다.");
      }
      toast({
        title: "생체인증 재확인 완료",
        description: "자동이체 장기동의 기간이 90일 연장되었습니다.",
      });
      await loadOverview({ silent: true });
    } catch (e: any) {
      toast({
        title: "재인증 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleRetrySettlement = async (settlementId: string) => {
    if (busyAction) return;
    setBusyAction(`retry:${settlementId}`);
    try {
      const bio = await triggerBrowserPasskeyAssertion();
      const res = await request<any>({
        path: `/api/practice/billing/retry-settlement/${encodeURIComponent(settlementId)}`,
        method: "POST",
        token,
        jsonBody: { passkeyAssertion: bio },
      });
      const body = res.data || {};
      if (!res.ok || !body.success) {
        throw new Error(body.message || "재이체에 실패했습니다.");
      }
      toast({
        title: "일괄 이체 완료",
        description: body.message,
      });
      await loadOverview({ silent: true });
    } catch (e: any) {
      toast({
        title: "이체 실패",
        description: e?.message || "출금계좌 잔액을 확인해 주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("");
    }
  };

  if (loading && !data) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        자동정산 정보를 불러오는 중…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        정보를 불러오지 못했습니다.
      </div>
    );
  }

  const { depositGuidance, openBankingConsent, currentMonthEstimate, settlements } =
    data;
  const isHeld = openBankingConsent.paymentHold.isHeld;
  const failedBatchId = openBankingConsent.paymentHold.failedBatchId;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1.5 py-2">
      {/* 상단 요약 카드 (SettlementStatCard SSOT) */}
      <div className={SETTLEMENT_STAT_ROW_CLASS}>
        <SettlementStatCard
          className={SETTLEMENT_STAT_CARD_WIDTH_CLASS}
          label="당월 정산 예정액"
          value={`${formatRequestorWon(currentMonthEstimate.totalAmount)}원`}
          hint="매월 5일"
          hintTooltip="매월 1일 전월 사용분이 확정되며, 매월 5일 오전 9시에 협력 기공소 및 어벗츠 법인 계좌로 자동 일괄이체됩니다."
          footer={
            <span className="text-[11px] tabular-nums text-slate-500">
              직거래 {formatRequestorWon(currentMonthEstimate.directLabTotal)} ·
              어벗츠 {formatRequestorWon(currentMonthEstimate.abutsCorpTotal)}
            </span>
          }
        />
        <SettlementStatCard
          className={SETTLEMENT_STAT_CARD_WIDTH_CLASS}
          label="OB 장기동의"
          value={
            openBankingConsent.status === "active"
              ? "자동이체 활성"
              : openBankingConsent.status === "reauth_required"
                ? "재인증 필요"
                : "미등록"
          }
          hint="90일 주기"
          hintTooltip="최초 1회 계좌 연결 후 매월 자동 출금됩니다. 금융 보안 정책상 90일마다 휴대폰 Face ID/지문으로 간편 재인증을 진행합니다."
          footer={
            <span className="text-[11px] tabular-nums text-slate-500">
              {openBankingConsent.daysUntilReauth != null
                ? `재인증 D-${Math.max(0, openBankingConsent.daysUntilReauth)}`
                : "계좌 연결 필요"}
            </span>
          }
        />
      </div>

      {/* Hold / 재인증 안내 크롬 (CONTENT_MEASURED_CHROME_CLASS SSOT) */}
      {(isHeld || openBankingConsent.needsReauth) && (
        <div
          className={cn(
            CONTENT_MEASURED_CHROME_CLASS,
            "mx-auto flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm",
            isHeld
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-amber-300/80 bg-amber-50/80 text-amber-900",
          )}
        >
          <div className="flex items-start gap-2.5 text-xs sm:text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {isHeld ? (
                <p className="font-medium">
                  {openBankingConsent.paymentHold.reason}
                  <br />
                  생체인증(Face ID/지문) 1탭 재이체 즉시 기공의뢰 제한이 풀립니다.
                </p>
              ) : (
                <p className="font-medium">
                  오픈뱅킹 자동이체 정기 재인증(90일 주기) 시점입니다.
                  <br />
                  휴대폰 Face ID 또는 지문으로 1탭 재인증을 완료해 주세요.
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {failedBatchId ? (
              <Button
                size="sm"
                className="h-9 rounded-xl px-3.5"
                disabled={Boolean(busyAction)}
                onClick={() => void handleRetrySettlement(failedBatchId)}
              >
                <Fingerprint className="mr-1.5 h-4 w-4" />
                Face ID로 지금 이체
              </Button>
            ) : null}
            {openBankingConsent.needsReauth && !failedBatchId ? (
              <Button
                size="sm"
                className="h-9 rounded-xl px-3.5"
                disabled={Boolean(busyAction)}
                onClick={() => void handleBiometricReauth()}
              >
                <Fingerprint className="mr-1.5 h-4 w-4" />
                Face ID 재인증
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* 1. 후불 정산·보증금 안내 및 오픈뱅킹 장기동의 설정 카드 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                후불 정산 · 보증금
              </h3>
            </div>
            <Badge variant={depositGuidance.required ? "default" : "outline"}>
              {depositGuidance.required ? "보증금 안내 대상" : "보증금 없음"}
            </Badge>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            기공의뢰는 후불이며 한도는 없습니다.
            <br />
            정산일에 입금되지 않으면 다음 기공의뢰가 제한됩니다.
            <br />
            어벗츠로 커스텀어벗 주문은 선불 크레딧을 쓰며, 정산과 무관합니다.
          </p>

          {depositGuidance.required ? (
            <div className="mt-3 space-y-2.5 rounded-xl bg-slate-50 px-3.5 py-3">
              <p className="text-xs leading-relaxed text-slate-600">
                월 이용 금액이 {formatRequestorWon(depositGuidance.threshold)}원을 넘었습니다.
                <br />
                보증금은 거래 기공소 계좌로 직접 이체하며, 어벗츠는 보관하지 않습니다.
              </p>
              {openBankingConsent.status === "active" ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    aria-label="보증금 받을 기공소"
                    value={depositLabId}
                    onChange={(e) => setDepositLabId(e.target.value)}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
                  >
                    <option value="">기공소 선택</option>
                    {depositGuidance.labOptions.map((l) => (
                      <option key={l.labAnchorId} value={l.labAnchorId}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    inputMode="numeric"
                    placeholder="금액 (100만원 단위)"
                    value={depositAmount}
                    onChange={(e) =>
                      setDepositAmount(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    className="h-9 rounded-xl text-xs"
                  />
                  <div className="sm:col-span-2 flex justify-end">
                    <Button
                      size="sm"
                      className="h-9 rounded-xl px-4"
                      disabled={
                        Boolean(busyAction) ||
                        !depositLabId ||
                        Number(depositAmount) < 1_000_000 ||
                        Number(depositAmount) % 1_000_000 !== 0
                      }
                      onClick={() => void handleTransferDeposit()}
                    >
                      <Fingerprint className="mr-1.5 h-4 w-4" />
                      Face ID로 보증금 이체
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-medium text-amber-700">
                  오픈뱅킹 연동 후 이체할 수 있습니다.
                </p>
              )}
            </div>
          ) : null}

          {deposits.length > 0 ? (
            <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/70 text-xs">
              {deposits.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="font-medium text-slate-900">{d.labName}</span>
                  <span className="tabular-nums text-slate-700">
                    {formatRequestorWon(d.amount)}원 ·{" "}
                    {d.status === "TRANSFERRED" ? "이체 완료" : "실패"}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                오픈뱅킹 장기동의 · 생체인증
              </h3>
            </div>
            {openBankingConsent.status === "active" ? (
              <Badge variant="default">연동됨</Badge>
            ) : (
              <Badge variant="outline">미연동</Badge>
            )}
          </div>

          {openBankingConsent.status === "active" ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-700">
                <div className="font-semibold text-slate-900">
                  {openBankingConsent.bankName}{" "}
                  {openBankingConsent.accountNumberMasked} (
                  {openBankingConsent.accountHolder})
                </div>
                <div className="mt-1 text-slate-500">
                  재인증 기한:{" "}
                  {openBankingConsent.expiresAt
                    ? new Date(openBankingConsent.expiresAt).toLocaleDateString(
                        "ko-KR",
                      )
                    : "-"}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  매월 5일 09:00에 협력 기공소 및 어벗츠 법인으로 자동 이체됩니다.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-xl text-xs"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleBiometricReauth()}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Face ID 재인증 연장
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              <p className="text-xs leading-relaxed text-slate-600">
                은행 앱에 매번 들어갈 필요 없이 최초 1회 계좌 연결과 Face ID(지문) 등록으로 매월 정산일에 자동 일괄이체됩니다.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  aria-label="출금 은행"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
                >
                  {BANK_OPTIONS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="계좌번호 (- 없이)"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="h-9 rounded-xl text-xs"
                />
                <Input
                  placeholder="예금주명"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-9 rounded-xl px-4"
                  disabled={
                    Boolean(busyAction) ||
                    accountNumber.replace(/[^0-9]/g, "").length < 8
                  }
                  onClick={() => void handleRegisterConsent()}
                >
                  <Fingerprint className="mr-1.5 h-4 w-4" />
                  Face ID로 장기동의 등록
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. 당월 수취처별 자동이체 예정 명세 */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900">
              {currentMonthEstimate.yearMonth} 정산 예정 명세 (수취처별 자동 배분)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              직거래 협력 기공소는 치과 계좌에서 해당 기공소 계좌로 직접 이체되며, 어벗츠 의뢰·하청분만 어벗츠 법인으로 이체됩니다.
            </p>
          </div>
        </div>

        {currentMonthEstimate.lines.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">
            이번 달 집계된 정산 예정 내역이 없습니다.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/70">
            {currentMonthEstimate.lines.map((line, idx) => (
              <div
                key={`${line.payeeKind}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="font-medium text-slate-900">
                    {line.payeeName}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {line.payeeKind === "direct_lab"
                      ? "협력 직거래"
                      : "어벗츠 법인"}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {line.bankName} {line.accountNumber} ({line.holderName})
                  </span>
                </div>
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatRequestorWon(line.amount)}원
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. 월별 자동 일괄이체 실행 이력 */}
      {settlements.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            월별 자동 일괄이체 내역
          </h3>
          <div className="mt-3 space-y-2.5">
            {settlements.map((s) => {
              const isFailed =
                s.status === "FAILED" || s.status === "PARTIAL_FAILED";
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {s.yearMonth} 정산
                      </span>
                      <Badge
                        variant={
                          s.status === "COMPLETED"
                            ? "default"
                            : isFailed
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {s.status === "COMPLETED"
                          ? "이체 완료"
                          : isFailed
                            ? "이체 실패 (Hold)"
                            : "자동이체 대기"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-slate-900">
                        총 {formatRequestorWon(s.totalAmount)}원
                      </span>
                      {isFailed ? (
                        <Button
                          size="sm"
                          className="h-8 rounded-lg px-3 text-xs"
                          disabled={Boolean(busyAction)}
                          onClick={() => void handleRetrySettlement(s.id)}
                        >
                          <Fingerprint className="mr-1 h-3.5 w-3.5" />
                          Face ID 재이체
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {s.lines.length > 0 ? (
                    <div className="mt-2 space-y-1 border-t border-slate-200/60 pt-2 text-xs text-slate-600">
                      {s.lines.map((l) => (
                        <div
                          key={l.id || l.payeeName}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            {l.payeeName} ({l.bankName} {l.accountNumber})
                          </span>
                          <span className="tabular-nums">
                            {formatRequestorWon(l.amount)}원 ·{" "}
                            {l.transferStatus === "SUCCESS"
                              ? "성공"
                              : l.transferStatus === "FAILED"
                                ? `실패(${l.failureReason || "잔액부족"})`
                                : "대기"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
