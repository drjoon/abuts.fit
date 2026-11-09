// change-log:
// - 2026-11-10: 기공소 총액만. 의뢰 줄 대신 내역 바로가기. 내역과 같은 3열.
// - 2026-11-10: 외부 기공비는 기공소 계좌로 직접 입금. 법인 사용분은 입금 중단 유지.
// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/backend/controllers/practiceLabDirectSettlement.controller.js
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, ChevronDown, ChevronRight, Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PracticeObBillingTabSkeleton } from "@/shared/ui/skeletons/RequestorCreditsPageSkeleton";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import {
  SETTLEMENT_STAT_ROW_CLASS,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { blobToImageObjectUrl, fetchS3ImageThumbObjectUrl } from "@/shared/files/s3ImageThumb";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";

type Line = {
  id: string;
  patientLabel: string;
  originalAmount: number;
  amount: number;
};

type Account = {
  bankName: string;
  accountNumber: string;
  holderName: string;
  bankbook?: {
    s3Key?: string;
    originalName?: string;
  } | null;
} | null;

function isBankbookImage(name: string) {
  return /\.(jpe?g|png|webp|gif)$/i.test(name);
}

function BankbookPreview({
  s3Key,
  fileName,
}: {
  s3Key: string;
  fileName: string;
}) {
  const { token } = useAuthStore();
  const [thumbUrl, setThumbUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [fullUrl, setFullUrl] = useState("");
  const image = isBankbookImage(fileName) || !fileName;

  useEffect(() => {
    if (!token || !s3Key || !image) return;
    let cancelled = false;
    let objectUrl = "";
    void fetchS3ImageThumbObjectUrl({
      s3Key,
      fileName: fileName || "bankbook.jpg",
      token,
    })
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setThumbUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, s3Key, fileName, image]);

  useEffect(() => {
    if (!open || !token || !s3Key || !image) return;
    let cancelled = false;
    let objectUrl = "";
    void fetchS3BlobCached({
      s3Key,
      fileName: fileName || "bankbook.jpg",
      token,
      thumbWidth: 720,
      buildUrl: (key, name) => buildS3ProxyDownloadUrl(key, name, { thumbW: 720 }),
    })
      .then((blob) => {
        const url = blobToImageObjectUrl(blob, fileName || "bankbook.jpg");
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setFullUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, token, s3Key, fileName, image]);

  const openFile = async () => {
    if (!token) return;
    const blob = await fetchS3BlobCached({
      s3Key,
      fileName: fileName || "bankbook",
      token,
      buildUrl: buildS3ProxyDownloadUrl,
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (!image) {
    return (
      <button
        type="button"
        className="mt-2 text-xs font-medium text-primary hover:underline"
        onClick={() => void openFile()}
      >
        통장 사본
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
        onClick={() => setOpen(true)}
        aria-label="통장 사본 보기"
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="통장 사본" className="h-16 w-24 object-cover" />
        ) : (
          <span className="flex h-16 w-24 items-center justify-center text-[11px] text-slate-400">
            통장 사본
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>통장 사본</DialogTitle>
          </DialogHeader>
          {fullUrl ? (
            <img
              src={fullUrl}
              alt="통장 사본"
              className="max-h-[70vh] w-full rounded-xl object-contain"
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">불러오는 중입니다.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Statement = {
  id: string;
  yearMonth: string;
  status: string;
  labName: string;
  payableAmount: number;
  lines: Line[];
  account: Account;
};

type Overview = {
  currentMonthEstimate: {
    yearMonth: string;
    abutsCorpTotal: number;
    lines: { payeeKind: string; payeeName: string; amount: number }[];
  };
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "입금 전",
  ADJUSTED: "금액 수정",
  DEPOSIT_CONFIRMED: "입금 확인",
  INVOICE_ISSUED: "계산서 발행",
  SELF_INVOICE: "직접 발행",
};

/** 내역 탭 `DENSE_PARTNER_GRID_CLASS`와 같은 열 수. */
const LAB_FEE_GRID_CLASS =
  "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4";

function ledgerDetailHref(yearMonth: string, labName?: string) {
  const params = new URLSearchParams();
  params.set("tab", "ledger");
  if (/^\d{4}-\d{2}$/.test(yearMonth)) params.set("ym", yearMonth);
  const name = String(labName || "").trim();
  if (name) params.set("q", name);
  return `/dashboard/credits?${params.toString()}`;
}

function LabFeeCard({
  row,
  showMonth,
}: {
  row: Statement;
  showMonth?: boolean;
}) {
  const status = STATUS_LABEL[row.status] || "입금 전";
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50 px-3 py-2.5">
        <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
          {row.labName || "기공소"}
        </p>
        <p className="shrink-0 text-sm font-bold tabular-nums text-slate-950">
          {formatRequestorWon(row.payableAmount)}원
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-3 py-3">
        <Badge variant="outline" className="w-fit">
          {showMonth ? `${row.yearMonth} · ${status}` : status}
        </Badge>
        {row.account ? (
          <div className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Landmark className="h-3.5 w-3.5 text-primary" aria-hidden />
                입금 계좌
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{row.account.bankName}</p>
              <p className="break-all text-base font-semibold tracking-wide text-slate-950">
                {row.account.accountNumber}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">예금주 {row.account.holderName}</p>
            </div>
            {row.account.bankbook?.s3Key ? (
              <BankbookPreview
                s3Key={row.account.bankbook.s3Key}
                fileName={row.account.bankbook.originalName || ""}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            기공소가 계좌를 등록하면 여기에 표시됩니다.
          </p>
        )}
        <Link
          to={ledgerDetailHref(row.yearMonth, row.labName)}
          className="mt-auto inline-flex items-center gap-0.5 self-start text-sm font-medium text-primary hover:underline"
        >
          상세 내역
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

export function PracticeObBillingTab() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [directRes, overviewRes] = await Promise.all([
        request<{ success: boolean; data?: { statements: Statement[] } }>({
          path: "/api/practice/billing/direct-settlements",
          method: "GET",
          token,
          skipCache: true,
        }),
        request<{ success: boolean; data?: Overview }>({
          path: "/api/practice/billing/overview",
          method: "GET",
          token,
          skipCache: true,
        }),
      ]);
      if (directRes.ok && directRes.data?.success) {
        setStatements(directRes.data.data?.statements || []);
      }
      if (overviewRes.ok && overviewRes.data?.success && overviewRes.data.data) {
        setOverview(overviewRes.data.data);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && statements.length === 0 && !overview) {
    return <PracticeObBillingTabSkeleton />;
  }

  const latestMonth = statements[0]?.yearMonth || "";
  const latest = statements.filter((row) => row.yearMonth === latestMonth);
  const older = statements.filter((row) => row.yearMonth !== latestMonth);
  const latestTotal = latest.reduce((sum, row) => sum + row.payableAmount, 0);
  const corpTotal = overview?.currentMonthEstimate?.abutsCorpTotal || 0;

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 self-start px-1.5 py-1.5 pb-2">
      <section
        className={cn(
          CONTENT_MEASURED_CHROME_CLASS,
          "rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-slate-800 shadow-sm",
        )}
      >
        <p className="text-sm font-medium">기공소 계좌로 입금해 주세요.</p>
      </section>

      <div className={SETTLEMENT_STAT_ROW_CLASS}>
        <SettlementStatCard
          label="지난달 기공비"
          value={`${formatRequestorWon(latestTotal)}원`}
          hint={latestMonth || "지난달"}
          tone="primary"
          onClick={
            latestMonth
              ? () => navigate(ledgerDetailHref(latestMonth))
              : undefined
          }
        />
      </div>

      {latest.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-500">
          지난달 기공비가 없습니다.
        </section>
      ) : (
        <div className={LAB_FEE_GRID_CLASS}>
          {latest.map((row) => (
            <LabFeeCard key={row.id} row={row} />
          ))}
        </div>
      )}

      {older.length > 0 ? (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="text-sm font-semibold text-slate-900">이전 달</span>
              <ChevronDown
                className={cn("h-4 w-4 text-slate-400 transition-transform", historyOpen && "rotate-180")}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className={LAB_FEE_GRID_CLASS}>
                {older.map((row) => (
                  <LabFeeCard key={row.id} row={row} showMonth />
                ))}
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}

      {corpTotal > 0 ? (
        <section
          className={cn(
            CONTENT_MEASURED_CHROME_CLASS,
            "rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-slate-700",
          )}
        >
          <p className="text-sm font-medium">
            어벗·스토어·기공사업부 사용분은 따로입니다.
            <br />
            법인 입금은 잠시 중단되어 있습니다.
          </p>
          <p className="mt-2 text-sm font-semibold tabular-nums text-slate-900">
            {overview?.currentMonthEstimate?.yearMonth} {formatRequestorWon(corpTotal)}원
          </p>
        </section>
      ) : null}
    </div>
  );
}
