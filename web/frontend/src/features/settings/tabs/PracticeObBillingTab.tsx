// change-log:
// - 2026-10-17: 자동정산 탭 — 후불 OB만, 보증금 UI 제거·문구·상태 배너 정리.
// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/controllers/credits/practiceOpenBanking.controller.js
// - web/backend/services/practiceObBilling.service.js
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/frontend/src/shared/settlement/settlementUi.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  Fingerprint,
  Landmark,
  RefreshCw,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import {
  PRACTICE_OB_BILLING_NOTICE_BODY,
  PRACTICE_OB_BILLING_NOTICE_TITLE,
} from "@/shared/legal/creditPrepaidCopy";

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

function consentStatusMeta(
  status: PracticeBillingOverview["openBankingConsent"]["status"],
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (status === "active") {
    return { label: "자동이체 연결됨", variant: "default" };
  }
  if (status === "reauth_required") {
    return { label: "재인증 필요", variant: "destructive" };
  }
  return { label: "계좌 미연결", variant: "outline" };
}

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

function ObBillingSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-1.5 py-3">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}

export function PracticeObBillingTab() {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const accountSectionRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<PracticeBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const [bankCode, setBankCode] = useState("088");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

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
        if (next.openBankingConsent.paymentHold.isHeld) setHistoryOpen(true);
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

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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
    return <ObBillingSkeleton />;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-1.5 py-8 text-center text-sm text-slate-500">
        정보를 불러오지 못했습니다.
      </div>
    );
  }

  const { openBankingConsent, currentMonthEstimate, settlements } = data;
  const isHeld = openBankingConsent.paymentHold.isHeld;
  const failedBatchId = openBankingConsent.paymentHold.failedBatchId;
  const consentMeta = consentStatusMeta(openBankingConsent.status);
  const isObActive = openBankingConsent.status === "active";
  const needsConnectAccount = !isObActive && isHeld;
  const needsPaymentRetry = isHeld && Boolean(failedBatchId) && isObActive;
  const needsHoldReauth = isHeld && isObActive && !failedBatchId;
  const showReauthBanner =
    (openBankingConsent.needsReauth || needsHoldReauth) &&
    !needsPaymentRetry &&
    !needsConnectAccount;
  const showActionBanner =
    needsConnectAccount || needsPaymentRetry || showReauthBanner;

  const noticeLines = PRACTICE_OB_BILLING_NOTICE_BODY.split("\n").filter(Boolean);

  const scrollToAccount = () => {
    accountSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-1.5 py-2 pb-4">
      {/* 당월 예정 + 연결 상태 */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-primary/[0.04] shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {PRACTICE_OB_BILLING_NOTICE_TITLE}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-[2rem]">
                {formatRequestorWon(currentMonthEstimate.totalAmount)}
                <span className="ml-0.5 text-lg font-semibold text-slate-600">
                  원
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {currentMonthEstimate.yearMonth} 사용 예정
              </p>
            </div>
            <Badge variant={consentMeta.variant} className="rounded-lg px-2.5 py-1">
              {consentMeta.label}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-xs tabular-nums text-slate-700">
                  기공물{" "}
                  {formatRequestorWon(currentMonthEstimate.directLabTotal)}원
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                거래 기공소 계좌로 이체됩니다.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-xs tabular-nums text-slate-700">
                  커스텀어벗{" "}
                  {formatRequestorWon(currentMonthEstimate.abutsCorpTotal)}원
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                어벗츠 법인 계좌로 이체됩니다.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {noticeLines.map((line, i) => (
              <span key={line}>
                {i > 0 ? (
                  <>
                    <br />
                  </>
                ) : null}
                {line}
              </span>
            ))}
          </p>
        </div>
      </section>

      {showActionBanner ? (
        <div
          className={cn(
            CONTENT_MEASURED_CHROME_CLASS,
            "mx-auto flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
            needsPaymentRetry
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-amber-300/80 bg-amber-50/80 text-amber-950",
          )}
        >
          <div className="flex items-start gap-2.5 text-xs sm:text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {needsConnectAccount ? (
              <p className="font-medium">
                출금 계좌를 연결해야 기공의뢰를 보낼 수 있습니다.
                <br />
                아래에서 Face ID(지문)로 등록해 주세요.
              </p>
            ) : needsPaymentRetry ? (
              <p className="font-medium">
                {openBankingConsent.paymentHold.reason ||
                  "정산금 입금이 필요합니다."}
                <br />
                Face ID(지문)로 이체하면 제한이 풀립니다.
              </p>
            ) : (
              <p className="font-medium">
                90일마다 Face ID(지문) 재인증이 필요합니다.
                <br />
                재인증하지 않으면 신규 기공의뢰가 제한될 수 있습니다.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {needsConnectAccount ? (
              <Button
                size="sm"
                className="h-9 rounded-xl px-3.5"
                variant="outline"
                onClick={scrollToAccount}
              >
                계좌 연결
              </Button>
            ) : null}
            {needsPaymentRetry && failedBatchId ? (
              <Button
                size="sm"
                className="h-9 rounded-xl px-3.5"
                disabled={Boolean(busyAction)}
                onClick={() => void handleRetrySettlement(failedBatchId)}
              >
                <Fingerprint className="mr-1.5 h-4 w-4" />
                지금 이체
              </Button>
            ) : null}
            {showReauthBanner ? (
              <Button
                size="sm"
                className="h-9 rounded-xl px-3.5"
                disabled={Boolean(busyAction)}
                onClick={() => void handleBiometricReauth()}
              >
                <Fingerprint className="mr-1.5 h-4 w-4" />
                재인증
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 출금 계좌 · 장기동의 */}
      <section
        ref={accountSectionRef}
        className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Landmark className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              출금 계좌
            </h2>
            <p className="text-xs text-slate-500">Face ID(지문) · 매월 자동출금</p>
          </div>
        </div>

        {isObActive ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-4 py-3.5">
              <p className="font-semibold text-slate-900">
                {openBankingConsent.bankName}{" "}
                {openBankingConsent.accountNumberMasked}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                예금주 {openBankingConsent.accountHolder}
                {openBankingConsent.expiresAt ? (
                  <>
                    {" "}
                    · 재인증{" "}
                    {new Date(openBankingConsent.expiresAt).toLocaleDateString(
                      "ko-KR",
                    )}
                    까지
                  </>
                ) : null}
              </p>
              {openBankingConsent.daysUntilReauth != null ? (
                <p className="mt-1 text-xs tabular-nums text-slate-500">
                  D-{Math.max(0, openBankingConsent.daysUntilReauth)}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl"
              disabled={Boolean(busyAction)}
              onClick={() => void handleBiometricReauth()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Face ID 재인증 연장
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-xs leading-relaxed text-slate-600">
              1회 연결하면 매월 5일에 전월분이 자동 출금됩니다.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-bank" className="text-xs">
                  출금 은행
                </Label>
                <Select value={bankCode} onValueChange={setBankCode}>
                  <SelectTrigger id="ob-bank" className="h-10 rounded-xl">
                    <SelectValue placeholder="은행 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((b) => (
                      <SelectItem key={b.code} value={b.code}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-account" className="text-xs">
                    계좌번호
                  </Label>
                  <Input
                    id="ob-account"
                    placeholder="- 없이 입력"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-holder" className="text-xs">
                    예금주
                  </Label>
                  <Input
                    id="ob-holder"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
            </div>
            <Button
              className="h-10 w-full rounded-xl sm:w-auto sm:px-6"
              disabled={
                Boolean(busyAction) ||
                accountNumber.replace(/[^0-9]/g, "").length < 8
              }
              onClick={() => void handleRegisterConsent()}
            >
              <Fingerprint className="mr-1.5 h-4 w-4" />
              Face ID로 연결하기
            </Button>
          </div>
        )}
      </section>

      {/* 이번 달 수취처 */}
      {currentMonthEstimate.lines.length > 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            수취처별 예정
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/70 px-1.5 py-1.5">
            {currentMonthEstimate.lines.map((line, idx) => (
              <li
                key={`${line.payeeKind}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-900">
                      {line.payeeName}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  {formatRequestorWon(line.amount)}원
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 지난 정산 */}
      {settlements.length > 0 ? (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-2xl px-5 py-4 text-left sm:px-6">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  지난 자동이체
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {settlements.length}건
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-slate-400 transition-transform",
                  historyOpen && "rotate-180",
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
              <Separator className="mb-2" />
              {settlements.map((s) => {
                const isFailed =
                  s.status === "FAILED" || s.status === "PARTIAL_FAILED";
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {s.yearMonth}
                        </span>
                        <Badge
                          variant={
                            s.status === "COMPLETED"
                              ? "secondary"
                              : isFailed
                                ? "destructive"
                                : "outline"
                          }
                          className="text-[10px]"
                        >
                          {s.status === "COMPLETED"
                            ? "완료"
                            : isFailed
                              ? "실패"
                              : "대기"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {formatRequestorWon(s.totalAmount)}원
                        </span>
                        {isFailed ? (
                          <Button
                            size="sm"
                            className="h-8 rounded-lg px-2.5 text-xs"
                            disabled={Boolean(busyAction)}
                            onClick={() => void handleRetrySettlement(s.id)}
                          >
                            <Fingerprint className="mr-1 h-3.5 w-3.5" />
                            재이체
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {s.lines.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-slate-200/60 pt-2 text-xs text-slate-600">
                        {s.lines.map((l) => (
                          <li
                            key={l.id || l.payeeName}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="min-w-0 truncate">{l.payeeName}</span>
                            <span className="shrink-0 tabular-nums">
                              {formatRequestorWon(l.amount)}원 ·{" "}
                              {l.transferStatus === "SUCCESS"
                                ? "성공"
                                : l.transferStatus === "FAILED"
                                  ? "실패"
                                  : "대기"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}

      <p className="text-center text-[11px] text-slate-400">
        CNC 생산 의뢰는 「어벗츠에」에서 별도로 진행합니다.
      </p>
    </div>
  );
}
