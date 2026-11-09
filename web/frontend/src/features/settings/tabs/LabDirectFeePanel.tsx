// related files:
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/backend/controllers/practiceLabDirectSettlement.controller.js
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import { LAB_PAYOUT_SETTINGS_PATH } from "@/shared/settlement/labPayoutBankbook";
import { cn } from "@/shared/ui/cn";

type Line = {
  id: string;
  transferId: string;
  patientLabel: string;
  originalAmount: number;
  amount: number;
};

type Account = {
  bankName: string;
  accountNumber: string;
  holderName: string;
} | null;

type Statement = {
  id: string;
  yearMonth: string;
  status: string;
  practiceName: string;
  originalTotal: number;
  totalOverride: number | null;
  payableAmount: number;
  lines: Line[];
  account: Account;
  locked: boolean;
};

type Payload = {
  applies: boolean;
  trusteeIssueEnabled: boolean | null;
  account: Account;
  statements: Statement[];
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "확인 전",
  ADJUSTED: "수정됨",
  DEPOSIT_CONFIRMED: "입금 확인",
  INVOICE_ISSUED: "계산서 발행",
  SELF_INVOICE: "직접 발행",
};

function wonInput(value: number) {
  return String(Math.max(0, Math.round(value || 0)));
}

export function LabDirectFeePanel() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { lines: Record<string, string>; total: string }>>({});
  const [busyId, setBusyId] = useState("");
  const [choosing, setChoosing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<{ success: boolean; data?: Payload }>({
        path: "/api/lab/direct-settlements",
        method: "GET",
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.success && res.data.data) {
        const next = res.data.data;
        setData(next);
        const seeded: Record<string, { lines: Record<string, string>; total: string }> = {};
        for (const row of next.statements) {
          const lines: Record<string, string> = {};
          for (const line of row.lines) lines[line.id] = wonInput(line.amount);
          seeded[row.id] = {
            lines,
            total: row.totalOverride == null ? "" : wonInput(row.totalOverride),
          };
        }
        setDrafts(seeded);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveChoice = async (enabled: boolean) => {
    if (!token || choosing) return;
    setChoosing(true);
    try {
      const res = await request<{ success: boolean; message?: string }>({
        path: "/api/lab/direct-settlements/trustee",
        method: "POST",
        token,
        jsonBody: { trusteeIssueEnabled: enabled },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "저장하지 못했습니다.");
      }
      await load();
    } catch (error) {
      toast({
        title: "다시 선택해 주세요",
        description: error instanceof Error ? error.message : "저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setChoosing(false);
    }
  };

  const saveStatement = async (row: Statement) => {
    if (!token) return null;
    const draft = drafts[row.id];
    const lines = row.lines.map((line) => ({
      id: line.id,
      amount: Number(String(draft?.lines[line.id] ?? line.amount).replace(/,/g, "")),
    }));
    const rawTotal = String(draft?.total ?? "").replace(/,/g, "").trim();
    const res = await request<{ success: boolean; data?: Statement; message?: string }>({
      path: `/api/lab/direct-settlements/${encodeURIComponent(row.id)}`,
      method: "PATCH",
      token,
      jsonBody: {
        lines,
        totalOverride: rawTotal === "" ? null : Number(rawTotal),
      },
    });
    if (!res.ok || !res.data?.success) {
      throw new Error(res.data?.message || "수정하지 못했습니다.");
    }
    return res.data.data || null;
  };

  const onSave = async (row: Statement) => {
    setBusyId(row.id);
    try {
      await saveStatement(row);
      toast({ title: "정산 금액을 저장했습니다." });
      await load();
    } catch (error) {
      toast({
        title: "금액을 확인해 주세요",
        description: error instanceof Error ? error.message : "수정하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setBusyId("");
    }
  };

  const onConfirm = async (row: Statement) => {
    if (!token) return;
    setBusyId(row.id);
    try {
      await saveStatement(row);
      const res = await request<{ success: boolean; message?: string }>({
        path: `/api/lab/direct-settlements/${encodeURIComponent(row.id)}/confirm-deposit`,
        method: "POST",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "입금 확인을 저장하지 못했습니다.");
      }
      toast({ title: "입금을 확인했습니다." });
      await load();
    } catch (error) {
      toast({
        title: "입금 확인을 마치지 못했습니다",
        description: error instanceof Error ? error.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyId("");
    }
  };

  if (loading && !data) {
    return <p className="px-1 py-6 text-sm text-slate-500">불러오는 중입니다.</p>;
  }
  if (!data) {
    return <p className="px-1 py-6 text-sm text-slate-500">정산서를 불러오지 못했습니다.</p>;
  }
  if (!data.applies) return null;

  const statements = data.statements || [];
  const latestMonth = statements[0]?.yearMonth || "";
  const latest = statements.filter((row) => row.yearMonth === latestMonth);
  const older = statements.filter((row) => row.yearMonth !== latestMonth);
  const ask = data.trusteeIssueEnabled == null;

  return (
    <div className="flex flex-col gap-3">
      <AlertDialog open={ask}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>계산서를 대신 발행할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <p className="text-sm text-slate-600">
                입금 확인 후 기공소 명의로 면세 계산서를 발행합니다.
                <br />
                직접 발행을 고르면 계산서는 기공소가 발행합니다.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={choosing}
              onClick={() => void saveChoice(false)}
            >
              직접 발행
            </Button>
            <Button type="button" disabled={choosing} onClick={() => void saveChoice(true)}>
              대신 발행
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-medium text-slate-800">
          지난달 기공비입니다.
          <br />
          치과 입금을 확인하면 기록해 주세요.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          커스텀어벗 제작비와는 따로입니다.
          <br />
          {data?.trusteeIssueEnabled === true
            ? "입금 확인 후 면세 계산서를 대신 발행합니다."
            : data?.trusteeIssueEnabled === false
              ? "계산서는 기공소가 직접 발행합니다."
              : "계산서 발행 방식을 먼저 선택합니다."}
        </p>
        {!data?.account ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9"
            onClick={() => navigate(LAB_PAYOUT_SETTINGS_PATH)}
          >
            입금 계좌 등록
          </Button>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            {data.account.bankName} {data.account.accountNumber}
            <br />
            예금주 {data.account.holderName}
          </p>
        )}
      </section>

      {latest.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">
          지난달 기공비가 없습니다.
        </section>
      ) : (
        latest.map((row) => {
          const draft = drafts[row.id];
          return (
            <section
              key={row.id}
              className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{row.practiceName || "치과"}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.yearMonth}</p>
                </div>
                <div className="text-right">
                  <Badge variant="outline">{STATUS_LABEL[row.status] || "확인 전"}</Badge>
                  <p className="mt-1 text-lg font-bold tabular-nums text-primary">
                    {formatRequestorWon(row.payableAmount)}원
                  </p>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/70 px-1.5">
                {row.lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 px-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">{line.patientLabel}</p>
                      {line.originalAmount !== line.amount ? (
                        <p className="text-[11px] text-slate-400 line-through">
                          {formatRequestorWon(line.originalAmount)}원
                        </p>
                      ) : null}
                    </div>
                    {row.locked ? (
                      <span className="shrink-0 text-sm tabular-nums text-slate-700">
                        {formatRequestorWon(line.amount)}원
                      </span>
                    ) : (
                      <Input
                        inputMode="numeric"
                        className="h-9 w-28 text-right tabular-nums"
                        value={draft?.lines[line.id] ?? wonInput(line.amount)}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              lines: {
                                ...(prev[row.id]?.lines || {}),
                                [line.id]: event.target.value.replace(/[^\d]/g, ""),
                              },
                              total: prev[row.id]?.total ?? "",
                            },
                          }))
                        }
                      />
                    )}
                  </li>
                ))}
              </ul>
              {row.locked ? null : (
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex items-center justify-between gap-3 text-sm text-slate-600">
                    총액
                    <Input
                      inputMode="numeric"
                      placeholder="줄 합계"
                      className="h-9 w-32 text-right tabular-nums"
                      value={draft?.total ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: {
                            lines: prev[row.id]?.lines || {},
                            total: event.target.value.replace(/[^\d]/g, ""),
                          },
                        }))
                      }
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    비우면 줄 합계입니다.
                    <br />
                    숫자를 적으면 그 금액으로 청구합니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      disabled={busyId === row.id}
                      onClick={() => void onSave(row)}
                    >
                      수정 저장
                    </Button>
                    <Button
                      type="button"
                      className="h-9"
                      disabled={busyId === row.id || ask}
                      onClick={() => void onConfirm(row)}
                    >
                      입금 확인
                    </Button>
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}

      {older.length > 0 ? (
        <section className={cn("rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm")}>
          <h2 className="text-sm font-semibold text-slate-900">이전 달</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {older.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">
                    {row.yearMonth} {row.practiceName}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    <Landmark className="h-3 w-3" />
                    {STATUS_LABEL[row.status] || "확인 전"}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  {formatRequestorWon(row.payableAmount)}원
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
