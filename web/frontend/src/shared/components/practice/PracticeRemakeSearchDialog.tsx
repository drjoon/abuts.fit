/**
 * 치과 기공의뢰 리메이크 — 환자명·상세 검색으로 원본을 찾아 연결하거나,
 * 플랫폼 도입 전 케이스는 신규 작성(리메이크)으로 이어간다.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/shared/practice/practiceRecentTransferList.ts
 * - web/frontend/src/features/support/components/ConfirmDialog.tsx
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Repeat, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/ui/cn";
import { toKstYmd } from "@/shared/date/kst";
import {
  canRemakePracticeTransferByStatus,
  toStatusBadgeLabel,
  type PracticeRecentTransferItem,
} from "@/shared/practice/practiceRecentTransferList";
import {
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import { formatManWon } from "@/shared/practice/practiceTransferFeeQuote";

export type PracticeRemakeSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfers: PracticeRecentTransferItem[];
  busy?: boolean;
  onSelectRemake: (payload: {
    transfer: PracticeRecentTransferItem;
    arrivalYmd: string;
  }) => void;
  onPrePlatformRemake: () => void;
};

const remakeFeeTotal = (transfer: PracticeRecentTransferItem) => {
  const q = transfer.remakeFeeQuote || null;
  if (!q) return 0;
  return Math.max(0, Math.round(Number(q.total || q.labFeeTotal || 0)));
};

export function PracticeRemakeSearchDialog({
  open,
  onOpenChange,
  transfers,
  busy = false,
  onSelectRemake,
  onPrePlatformRemake,
}: PracticeRemakeSearchDialogProps) {
  const [patientQuery, setPatientQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [labQuery, setLabQuery] = useState("");
  const [toothQuery, setToothQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [arrivalYmd, setArrivalYmd] = useState("");
  const [arrivalOpen, setArrivalOpen] = useState(false);

  const todayYmd = toKstYmd(new Date()) || "";

  useEffect(() => {
    if (!open) return;
    setPatientQuery("");
    setAdvancedOpen(false);
    setLabQuery("");
    setToothQuery("");
    setDateFrom("");
    setDateTo("");
    setSelectedId("");
    setArrivalYmd("");
    setArrivalOpen(false);
  }, [open]);

  const remakeCandidates = useMemo(
    () =>
      transfers.filter((t) => canRemakePracticeTransferByStatus(t.status)),
    [transfers],
  );

  const filtered = useMemo(() => {
    const patient = patientQuery.trim().normalize("NFC").toLowerCase();
    const lab = labQuery.trim().toLowerCase();
    const tooth = toothQuery.trim().replace(/\s+/g, "");
    const from = dateFrom.trim();
    const to = dateTo.trim();

    return remakeCandidates.filter((transfer) => {
      const name = resolvePracticeTransferListPatientName(transfer)
        .normalize("NFC")
        .toLowerCase();
      if (patient && !name.includes(patient)) return false;

      if (lab) {
        const labName = String(transfer.targetLab || "").toLowerCase();
        if (!labName.includes(lab)) return false;
      }

      if (tooth) {
        const teeth = resolvePracticeTransferListToothNumbers(transfer).replace(
          /\s+/g,
          "",
        );
        if (!teeth.includes(tooth)) return false;
      }

      if (from || to) {
        const dates = [
          ...(Array.isArray(transfer.arrivalDates) ? transfer.arrivalDates : []),
          ...(Array.isArray(transfer.orderDates) ? transfer.orderDates : []),
          transfer.arrivalDate,
          transfer.orderDate,
        ]
          .map((d) => String(d || "").trim())
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
        if (dates.length === 0) return false;
        const hit = dates.some((d) => {
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
        if (!hit) return false;
      }

      return true;
    });
  }, [
    remakeCandidates,
    patientQuery,
    labQuery,
    toothQuery,
    dateFrom,
    dateTo,
  ]);

  const selected = useMemo(
    () =>
      filtered.find(
        (t) =>
          String(t.transferMongoIds?.[0] || t.id || "").trim() === selectedId,
      ) || null,
    [filtered, selectedId],
  );

  const canSubmit =
    Boolean(selected) &&
    /^\d{4}-\d{2}-\d{2}$/.test(arrivalYmd) &&
    (!todayYmd || arrivalYmd >= todayYmd) &&
    !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Repeat className="h-5 w-5 text-amber-600" />
            리메이크 의뢰
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            작업시작 이후 의뢰를 환자명으로 찾아 연결하거나, 플랫폼 도입 전
            케이스를 새로 작성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="remake-patient-search">환자명</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="remake-patient-search"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                placeholder="환자명으로 검색"
                className="pl-8"
                autoFocus
              />
            </div>
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs text-muted-foreground"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    advancedOpen && "rotate-180",
                  )}
                />
                상세 찾기
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3 rounded-lg border bg-slate-50/80 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="remake-lab-search" className="text-xs">
                  기공소명
                </Label>
                <Input
                  id="remake-lab-search"
                  value={labQuery}
                  onChange={(e) => setLabQuery(e.target.value)}
                  placeholder="기공소명"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remake-tooth-search" className="text-xs">
                  치아번호
                </Label>
                <Input
                  id="remake-tooth-search"
                  value={toothQuery}
                  onChange={(e) => setToothQuery(e.target.value)}
                  placeholder="예: 11, 21"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="remake-date-from" className="text-xs">
                    날짜 시작
                  </Label>
                  <Input
                    id="remake-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="remake-date-to" className="text-xs">
                    날짜 끝
                  </Label>
                  <Input
                    id="remake-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                검색 결과 {filtered.length}건
              </p>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-1.5">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {patientQuery.trim() || labQuery.trim() || toothQuery.trim()
                    ? "조건에 맞는 의뢰가 없습니다."
                    : "환자명을 입력하거나 상세 찾기로 검색하세요."}
                </p>
              ) : (
                filtered.map((transfer) => {
                  const key = String(
                    transfer.transferMongoIds?.[0] || transfer.id || "",
                  ).trim();
                  const patient =
                    resolvePracticeTransferListPatientName(transfer) || "—";
                  const teeth =
                    resolvePracticeTransferListToothNumbers(transfer) || "—";
                  const fee = remakeFeeTotal(transfer);
                  const active = key === selectedId;
                  return (
                    <button
                      key={key || transfer.transferId}
                      type="button"
                      disabled={busy}
                      onClick={() => setSelectedId(key)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "border-amber-400 bg-amber-50/90"
                          : "border-transparent hover:bg-slate-50",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900">
                          {patient}
                        </span>
                        <span className="text-muted-foreground">{teeth}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {toStatusBadgeLabel(transfer.status)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{transfer.targetLab || "—"}</span>
                        <span>
                          도착 {transfer.arrivalDate || "—"} · 주문{" "}
                          {transfer.orderDate || "—"}
                        </span>
                        <span className="font-medium text-slate-700">
                          리메이크{" "}
                          {fee > 0 ? formatManWon(fee) : "무료"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {selected ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <Label className="text-xs">새 치과도착일</Label>
              <Popover open={arrivalOpen} onOpenChange={setArrivalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full justify-start font-normal"
                    disabled={busy}
                  >
                    {arrivalYmd || "도착일을 선택하세요"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-auto p-0"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Calendar
                    mode="single"
                    required
                    numberOfMonths={1}
                    selected={
                      arrivalYmd
                        ? new Date(`${arrivalYmd}T12:00:00+09:00`)
                        : undefined
                    }
                    onSelect={(date) => {
                      const ymd = toKstYmd(date) || "";
                      if (!ymd) return;
                      setArrivalYmd(ymd);
                      setArrivalOpen(false);
                    }}
                    disabled={(date) => {
                      const ymd = toKstYmd(date) || "";
                      if (!ymd) return true;
                      return Boolean(todayYmd && ymd < todayYmd);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground">
                선택일=리메이크 도착일, 오늘=주문일로 반영됩니다.
              </p>
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full border-dashed"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
              onPrePlatformRemake();
            }}
          >
            플랫폼 도입 전 케이스 · 새로 작성
          </Button>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => {
              if (!selected || !canSubmit) return;
              onSelectRemake({ transfer: selected, arrivalYmd });
            }}
          >
            {busy ? "처리 중…" : "리메이크 의뢰"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
