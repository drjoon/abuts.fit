// related files:
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/backend/controllers/practiceLabDirectSettlement.controller.js
// change-log:
// - 2026-11-10: 계산서 질문은 입금 확인 뒤. 통장 사본은 선택. 안내 문단 대신 툴팁.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CircleHelp, Landmark } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRequestorWon } from "@/shared/pricing/requestorUnitPricePolicy";
import {
  LAB_PAYOUT_BANKBOOK_HINT,
  LAB_PAYOUT_SETTINGS_PATH,
} from "@/shared/settlement/labPayoutBankbook";
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
  bankbook?: {
    s3Key?: string;
    fileId?: string;
    originalName?: string;
  } | null;
} | null;

type Statement = {
  id: string;
  yearMonth: string;
  status: string;
  practiceName: string;
  originalAmount?: number;
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

function statusTone(status: string) {
  if (status === "INVOICE_ISSUED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "DEPOSIT_CONFIRMED") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (status === "SELF_INVOICE") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function wonInput(value: number) {
  return String(Math.max(0, Math.round(value || 0)));
}

function HelpTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={label}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
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
  const [askInvoice, setAskInvoice] = useState(false);

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
      setAskInvoice(false);
      toast({
        title: enabled ? "대신 발행으로 저장했습니다." : "직접 발행으로 저장했습니다.",
      });
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
    const needsChoice = data?.trusteeIssueEnabled == null;
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
      if (needsChoice) setAskInvoice(true);
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

  return (
    <div className="flex flex-col gap-3">
      <AlertDialog open={askInvoice} onOpenChange={setAskInvoice}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>계산서를 대신 발행할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <p className="text-sm text-slate-600">
                입금을 확인했습니다.
                <br />
                대신 발행은 기공소 명의 면세 계산서입니다.
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

      {latest.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-8 text-center text-sm text-slate-500">
          지난달 기공비가 없습니다.
        </section>
      ) : (
        latest.map((row) => {
          const draft = drafts[row.id];
          const hasBook = Boolean(row.account?.bankbook?.s3Key);
          return (
            <section
              key={row.id}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-primary-soft/35 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {row.practiceName || "치과"}
                    </p>
                    <HelpTip label="기공비 안내">
                      <p>
                        치과가 기공소 계좌로 입금합니다.
                        <br />
                        커스텀어벗 제작비는 포함되지 않습니다.
                      </p>
                    </HelpTip>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{row.yearMonth}</p>
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      statusTone(row.status),
                    )}
                  >
                    {STATUS_LABEL[row.status] || "확인 전"}
                  </span>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-primary-strong">
                    {formatRequestorWon(row.payableAmount)}원
                  </p>
                </div>
              </div>

              <div className="px-4 py-3">
                {row.account ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                      <Landmark className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">
                        <span className="font-medium text-slate-800">{row.account.bankName}</span>{" "}
                        {row.account.accountNumber}
                        <span className="text-slate-400"> · {row.account.holderName}</span>
                      </span>
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={hasBook ? "ghost" : "outline"}
                          className={cn(
                            "h-8 px-2.5 text-xs",
                            hasBook && "text-emerald-700 hover:text-emerald-800",
                          )}
                          onClick={() => navigate(LAB_PAYOUT_SETTINGS_PATH)}
                        >
                          {hasBook ? "통장 사본 있음" : "통장 사본"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                        <p>
                          {hasBook ? "치과 입금 화면에 표시됩니다." : LAB_PAYOUT_BANKBOOK_HINT}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}

                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200/80 px-1.5 py-1">
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
                          aria-label={`${line.patientLabel} 금액`}
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

                {row.locked ? (
                  row.status === "DEPOSIT_CONFIRMED" ? (
                    <div className="mt-3 flex justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9"
                            onClick={() => setAskInvoice(true)}
                          >
                            계산서
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                          <p>발행 방식을 고릅니다.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ) : null
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    <label className="flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        총액
                        <HelpTip label="총액 안내">
                          <p>
                            비우면 줄 합계입니다.
                            <br />
                            숫자를 적으면 그 금액으로 청구합니다.
                          </p>
                        </HelpTip>
                      </span>
                      <Input
                        inputMode="numeric"
                        placeholder="줄 합계"
                        aria-label="총액"
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
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        disabled={busyId === row.id}
                        onClick={() => void onSave(row)}
                      >
                        수정 저장
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            className="h-9"
                            disabled={busyId === row.id}
                            onClick={() => void onConfirm(row)}
                          >
                            입금 확인
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                          <p>
                            치과 입금을 기록합니다.
                            <br />
                            확인 뒤에 계산서 발행을 묻습니다.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })
      )}

      {older.length > 0 ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">이전 달</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {older.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">
                    {row.yearMonth} {row.practiceName}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {STATUS_LABEL[row.status] || "확인 전"}
                  </p>
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
