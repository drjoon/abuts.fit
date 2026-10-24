// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/utils/practiceSettlementDelinquency.js
// - web/frontend/src/pages/admin/finance/AdminPracticeLabFeeTab.tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import { DashStat, DashTile } from "@/shared/ui/dashboard/DashTile";
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
  onOpen,
}: {
  clinics: ClinicRow[];
  empty: string;
  onOpen: (practiceAnchorId: string) => void;
}) {
  if (!clinics.length) {
    return <p className="px-1 text-xs text-slate-500">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {clinics.map((clinic) => (
        <li key={clinic.practiceAnchorId} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => onOpen(clinic.practiceAnchorId)}
          >
            <span className="font-medium text-slate-900">{clinic.practiceName}</span>
            <span className="ml-2 text-xs tabular-nums text-slate-500">
              미납 기록 {clinic.unpaidRecordCount}회
            </span>
          </button>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {clinic.months.map((month) => (
              <li key={`${clinic.practiceAnchorId}-${month.id || month.yearMonth}`}>
                {month.yearMonth}
                {KIND_LABEL[month.kind] ? ` · ${KIND_LABEL[month.kind]}` : ""}
                {month.remaining > 0 ? ` · 남은 ${won(month.remaining)}` : ""}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <div className="pr-6">
            <DialogHeader>
              <DialogTitle>미납 치과</DialogTitle>
              <DialogDescription>
                한 치과가 여러 묶음에 나올 수 있습니다.
                <br />
                이름을 누르면 기공료 화면으로 갑니다.
              </DialogDescription>
            </DialogHeader>
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">미납 지속</h3>
              <p className="mb-2 text-xs leading-relaxed text-slate-500">
                2차 기한이 지났는데 전액이 아직 확인되지 않았습니다.
                <br />
                새 기공의뢰만 잠시 쉬고, 후불은 유지합니다.
              </p>
              <ClinicList clinics={data.ongoing} empty="해당 치과가 없습니다." onOpen={openPractice} />
            </section>
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">2회 이상 미납 기록</h3>
              <p className="mb-2 text-xs leading-relaxed text-slate-500">
                기한을 넘긴 달이 2번 이상입니다.
                <br />
                나중에 입금한 달도 기록에 남습니다.
              </p>
              <ClinicList clinics={data.repeat} empty="해당 치과가 없습니다." onOpen={openPractice} />
            </section>
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">부분 납부</h3>
              <p className="mb-2 text-xs leading-relaxed text-slate-500">
                전액보다 적게 들어온 금액이 기록된 치과입니다.
                <br />
                남은 금액이 확인되기 전에는 기공소로 보내지 않습니다.
              </p>
              <ClinicList clinics={data.partial} empty="해당 치과가 없습니다." onOpen={openPractice} />
            </section>
            <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                선불 전환 대상 {data.prepaidCandidates.length.toLocaleString("ko-KR")}곳
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {(data.planLines.length ? data.planLines : EMPTY.planLines).map((line, index) => (
                  <span key={line}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {data.prepaidCandidates.length === 0 ? (
                  <li>대상 치과가 없습니다.</li>
                ) : (
                  data.prepaidCandidates.map((clinic) => (
                    <li key={clinic.practiceAnchorId}>
                      <button
                        type="button"
                        className="text-left font-medium text-slate-900"
                        onClick={() => openPractice(clinic.practiceAnchorId)}
                      >
                        {clinic.practiceName}
                      </button>
                      <span className="text-slate-500">
                        {clinic.unpaidRecordCount >= 2
                          ? ` · 미납 ${clinic.unpaidRecordCount}회`
                          : ""}
                        {clinic.partialRemaining > 0
                          ? ` · 남은 ${won(clinic.partialRemaining)}`
                          : ""}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
