// change-log:
// - 2026-10-24: 미납 치과 창 — 구간 색·금액 오른쪽. 안내는 한 사실.
// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/utils/practiceSettlementDelinquency.js
// - web/frontend/src/pages/admin/finance/AdminPracticeLabFeeTab.tsx
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import { DashStat, DashTile } from "@/shared/ui/dashboard/DashTile";
import { cn } from "@/shared/ui/cn";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MonthRow = {
  id: string;
  yearMonth: string;
  totalAmount: number;
  amountReceived: number;
  remaining: number;
  kind: "ongoing" | "ongoing_partial" | "partial" | "paid_late" | "open";
};

type ClinicRow = {
  practiceAnchorId: string;
  practiceName: string;
  unpaidRecordCount: number;
  openRemaining: number;
  partialRemaining: number;
  prepaidCandidate: boolean;
  months: MonthRow[];
};

type DelinquencyData = {
  ongoing: ClinicRow[];
  repeat: ClinicRow[];
  partial: ClinicRow[];
  prepaidCandidates: ClinicRow[];
  planLines: string[];
};

const EMPTY: DelinquencyData = {
  ongoing: [],
  repeat: [],
  partial: [],
  prepaidCandidates: [],
  planLines: [],
};

const KIND_LABEL: Record<MonthRow["kind"], string> = {
  ongoing: "전액 확인 전",
  ongoing_partial: "일부만 들어옴",
  partial: "일부만 들어옴",
  paid_late: "기한 후 입금",
  open: "",
};

function won(amount: number) {
  return `${formatRequestorWon(amount)}원`;
}

function ClinicList({
  clinics,
  empty,
  amountClassName,
  onOpen,
}: {
  clinics: ClinicRow[];
  empty: string;
  amountClassName: string;
  onOpen: (practiceAnchorId: string) => void;
}) {
  if (!clinics.length) {
    return <p className="text-xs text-slate-500">{empty}</p>;
  }
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {clinics.map((clinic) => (
        <li
          key={clinic.practiceAnchorId}
          className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm"
        >
          <button
            type="button"
            className="flex w-full items-baseline justify-between gap-3 text-left"
            onClick={() => onOpen(clinic.practiceAnchorId)}
          >
            <span className="min-w-0">
              <span className="font-semibold text-slate-950">{clinic.practiceName}</span>
              <span className="ml-2 text-xs tabular-nums text-slate-500">
                {clinic.unpaidRecordCount}회
              </span>
            </span>
          </button>
          <ul className="mt-1.5 space-y-1">
            {clinic.months.map((month) => (
              <li
                key={`${clinic.practiceAnchorId}-${month.id || month.yearMonth}`}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="text-slate-500">
                  {month.yearMonth}
                  {KIND_LABEL[month.kind] ? ` · ${KIND_LABEL[month.kind]}` : ""}
                </span>
                {month.remaining > 0 ? (
                  <span className={cn("shrink-0 font-semibold tabular-nums", amountClassName)}>
                    {won(month.remaining)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function DelinquencySection({
  title,
  hint,
  count,
  tone,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  tone: "danger" | "warn" | "neutral";
  children: ReactNode;
}) {
  const active = count > 0 && tone !== "neutral";
  return (
    <section
      className={cn(
        "rounded-2xl border px-3 py-3",
        active && tone === "danger" && "border-rose-200 bg-rose-50/80",
        active && tone === "warn" && "border-amber-200 bg-amber-50/80",
        !active && "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className={cn(
            "text-sm font-semibold",
            active && tone === "danger" && "text-rose-900",
            active && tone === "warn" && "text-amber-950",
            !active && "text-slate-900",
          )}
        >
          {title}
        </h3>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            active && tone === "danger" && "text-rose-700",
            active && tone === "warn" && "text-amber-800",
            !active && "text-slate-500",
          )}
        >
          {count.toLocaleString("ko-KR")}곳
        </span>
      </div>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{hint}</p>
      ) : null}
      {children}
    </section>
  );
}

export function AdminPracticeDelinquencyCard({
  className,
  enabled = true,
}: {
  className?: string;
  enabled?: boolean;
}) {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState<DelinquencyData>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || !token) return;
    setLoading(true);
    try {
      const res = await request<{ success?: boolean; data?: DelinquencyData }>({
        path: "/api/admin/practice-lab-fees/delinquency",
        method: "GET",
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.success && res.data.data) {
        setData({ ...EMPTY, ...res.data.data });
      }
    } catch {
      /* 카드는 빈 수로 둔다 */
    } finally {
      setLoading(false);
    }
  }, [enabled, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const ongoingCount = data.ongoing.length;
  const repeatCount = data.repeat.length;
  const partialCount = data.partial.length;
  const attention = ongoingCount + repeatCount + partialCount;

  const openPractice = (practiceAnchorId: string) => {
    setOpen(false);
    navigate(`/dashboard/finance?tab=labfee&practice=${encodeURIComponent(practiceAnchorId)}`);
  };

  return (
    <>
      <DashTile
        title="미납 치과"
        className={className}
        tone={ongoingCount > 0 ? "danger" : attention > 0 ? "warn" : "default"}
        icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        onClick={() => setOpen(true)}
      >
        <div className="grid h-full grid-cols-3 content-center gap-1.5">
          <DashStat
            label="미납 지속"
            value={loading ? "…" : `${ongoingCount.toLocaleString("ko-KR")}곳`}
            tone={ongoingCount > 0 ? "danger" : undefined}
          />
          <DashStat
            label="2회 이상"
            value={loading ? "…" : `${repeatCount.toLocaleString("ko-KR")}곳`}
            tone={repeatCount > 0 ? "warn" : undefined}
          />
          <DashStat
            label="부분 납부"
            value={loading ? "…" : `${partialCount.toLocaleString("ko-KR")}곳`}
            tone={partialCount > 0 ? "warn" : undefined}
          />
        </div>
      </DashTile>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto px-5 py-5 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>미납 치과</DialogTitle>
            <DialogDescription>
              한 치과가 여러 묶음에 나올 수 있습니다.
              <br />
              이름을 누르면 기공료 화면으로 갑니다.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex flex-col gap-3">
            <DelinquencySection
              title="미납 지속"
              hint="2차 기한이 지났고, 전액이 아직 확인되지 않았습니다."
              count={ongoingCount}
              tone="danger"
            >
              <ClinicList
                clinics={data.ongoing}
                empty="없습니다."
                amountClassName="text-rose-700"
                onOpen={openPractice}
              />
            </DelinquencySection>
            <DelinquencySection
              title="2회 이상"
              hint="기한을 넘긴 달이 2번 이상입니다."
              count={repeatCount}
              tone="warn"
            >
              <ClinicList
                clinics={data.repeat}
                empty="없습니다."
                amountClassName="text-amber-800"
                onOpen={openPractice}
              />
            </DelinquencySection>
            <DelinquencySection
              title="부분 납부"
              hint="일부만 들어온 금액은 전액 확인 뒤에 기공소로 보냅니다."
              count={partialCount}
              tone="warn"
            >
              <ClinicList
                clinics={data.partial}
                empty="없습니다."
                amountClassName="text-amber-800"
                onOpen={openPractice}
              />
            </DelinquencySection>
            <DelinquencySection
              title="선불 전환"
              hint=""
              count={data.prepaidCandidates.length}
              tone="neutral"
            >
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {(data.planLines.length ? data.planLines : []).map((line, index) => (
                  <span key={line}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </p>
              {data.prepaidCandidates.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">없습니다.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {data.prepaidCandidates.map((clinic) => (
                    <li key={clinic.practiceAnchorId}>
                      <button
                        type="button"
                        className="flex w-full items-baseline justify-between gap-3 text-left"
                        onClick={() => openPractice(clinic.practiceAnchorId)}
                      >
                        <span className="font-semibold text-slate-950">
                          {clinic.practiceName}
                          {clinic.unpaidRecordCount >= 2 ? (
                            <span className="ml-2 text-xs font-medium text-slate-500">
                              {clinic.unpaidRecordCount}회
                            </span>
                          ) : null}
                        </span>
                        {clinic.partialRemaining > 0 ? (
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                            {won(clinic.partialRemaining)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DelinquencySection>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
