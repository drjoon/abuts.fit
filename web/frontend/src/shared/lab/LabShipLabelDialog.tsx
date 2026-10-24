// change-log:
// - 2026-10-24: 출력 프로그램은 헤더 설정의 연결 프로그램(Windows v17).
// - 2026-10-24: 치과의뢰 수신 — 보철 완료 건을 치과 탭으로 골라 택배·딜리버리 라벨 출력.
// related files:
// - web/frontend/src/shared/lab/labShipCases.ts
// - web/frontend/src/shared/lab/renderLabShipLabel.ts
// - web/frontend/src/shared/lab/labWblsClient.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - bg/lab-cad-helper/rules.md
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadBusinessMeCached } from "@/shared/components/business/settings/business/businessMeCache";
import {
  groupLabShipCasesByPractice,
  listLabShipLabelCases,
  markLabShipPrinted,
  readLabShipPrinted,
  type LabShipLabelCase,
} from "@/shared/lab/labShipCases";
import { LAB_HELPER_PRINT_MIN_VERSION } from "@/shared/files/labHelperClient";
import { useLabHelperInstallPrompt } from "@/shared/hooks/useLabHelperInstallPrompt";
import {
  labWblsIsWindows,
  isPc3ZplPrinterName,
  LAB_WBLS_PRINTER_MODEL,
  listLabWblsPrinters,
  pickPc3ZplPrinter,
  printLabWblsPng,
  probeLabWbls,
  readLabWblsPrinter,
  writeLabWblsPrinter,
} from "@/shared/lab/labWblsClient";
import {
  downloadLabShipLabel,
  LAB_SHIP_LABEL_HEIGHT_MM,
  LAB_SHIP_LABEL_WIDTH_MM,
  printLabShipLabelInBrowser,
  renderLabShipLabel,
  type LabShipLabelMode,
} from "@/shared/lab/renderLabShipLabel";
import type { PracticeTransferLabReceiveItem } from "@/shared/practice/practiceTransferLabReceive";
import { cn } from "@/shared/ui/cn";
import { CheckCircle2, Loader2, Printer, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Sender = {
  name: string;
  address: string;
  zipCode: string;
  phone: string;
};

const EMPTY_SENDER: Sender = { name: "", address: "", zipCode: "", phone: "" };

function joinAddress(line: string, detail: string) {
  return [line, detail].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function readSender(data: unknown, fallbackName: string): Sender {
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const name =
    String(meta.companyName || row.divisionName || fallbackName || "").trim() ||
    "기공소";
  return {
    name,
    address: joinAddress(String(meta.address || ""), String(meta.addressDetail || "")),
    zipCode: String(meta.zipCode || "").trim(),
    phone: String(meta.phoneNumber || "").trim(),
  };
}

function formatArrivalChip(value: string) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${Number(match[2])}/${Number(match[3])}`;
}

export function LabShipLabelAskDialog({
  open,
  practiceName,
  onLater,
  onPrint,
}: {
  open: boolean;
  practiceName: string;
  onLater: () => void;
  onPrint: () => void;
}) {
  const clinic = String(practiceName || "").trim();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onLater(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>택배 라벨</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm leading-relaxed text-muted-foreground">
              보철 작업이 끝났습니다.
              <br />
              {clinic ? `${clinic}으로 보낼 라벨을 출력할까요?` : "보낼 라벨을 출력할까요?"}
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onLater}>
            나중에
          </Button>
          <Button type="button" onClick={onPrint}>
            <Truck className="h-4 w-4" />
            출력
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LabShipLabelDialog({
  open,
  onOpenChange,
  transfers,
  token,
  businessType,
  fallbackSenderName,
  focusTransferId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfers: readonly PracticeTransferLabReceiveItem[];
  token?: string | null;
  businessType: string;
  fallbackSenderName?: string;
  focusTransferId?: string | null;
}) {
  const cases = useMemo(() => listLabShipLabelCases(transfers), [transfers]);
  const groups = useMemo(() => groupLabShipCasesByPractice(cases), [cases]);
  const [tab, setTab] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<LabShipLabelMode>("parcel");
  const [printed, setPrinted] = useState<Record<string, string>>({});
  const [sender, setSender] = useState<Sender>(EMPTY_SENDER);
  const [agent, setAgent] = useState<
    "checking" | "ready" | "missing" | "outdated" | "other"
  >("checking");
  const { promptFromSettings, dialogs: helperDialogs } = useLabHelperInstallPrompt();
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState("");
  const [busy, setBusy] = useState<"print" | "save" | null>(null);
  const [error, setError] = useState("");

  const casesRef = useRef(cases);
  const groupsRef = useRef(groups);
  casesRef.current = cases;
  groupsRef.current = groups;

  useEffect(() => {
    if (!open) return;
    const currentCases = casesRef.current;
    const currentGroups = groupsRef.current;
    const nextPrinted = readLabShipPrinted();
    setPrinted(nextPrinted);
    setError("");
    const focus = String(focusTransferId || "").trim();
    const focusCase = focus
      ? currentCases.find((row) => row.id === focus)
      : undefined;
    const firstKey = focusCase?.practiceKey || currentGroups[0]?.key || "";
    setTab(firstKey);
    if (focusCase) {
      setSelected(new Set([focusCase.id]));
      return;
    }
    const initial = new Set<string>();
    for (const row of currentCases) {
      if (row.practiceKey === firstKey && !nextPrinted[row.id]) initial.add(row.id);
    }
    setSelected(initial);
  }, [open, focusTransferId]);

  useEffect(() => {
    if (!open || !token) return;
    let stop = false;
    void loadBusinessMeCached({ token, businessType }).then((data) => {
      if (stop) return;
      setSender(readSender(data, String(fallbackSenderName || "")));
    });
    return () => {
      stop = true;
    };
  }, [open, token, businessType, fallbackSenderName]);

  const agentRef = useRef(agent);
  agentRef.current = agent;

  useEffect(() => {
    if (!open) return;
    let stop = false;
    const tick = async () => {
      if (!labWblsIsWindows()) {
        if (!stop) setAgent("other");
        return;
      }
      if (agentRef.current === "ready") return;
      const health = await probeLabWbls();
      if (stop) return;
      if (!health) {
        setAgent("missing");
        return;
      }
      if (!health.print) {
        setAgent("outdated");
        return;
      }
      setAgent("ready");
      const listed = await listLabWblsPrinters().catch(() => ({
        printers: [] as string[],
        defaultPrinter: "",
      }));
      if (stop) return;
      setPrinters(listed.printers);
      setPrinter((prev) => {
        if (prev && listed.printers.includes(prev)) return prev;
        const saved = readLabWblsPrinter();
        if (saved && listed.printers.includes(saved) && isPc3ZplPrinterName(saved)) {
          return saved;
        }
        return (
          pickPc3ZplPrinter(listed.printers, listed.defaultPrinter) ||
          listed.printers[0] ||
          ""
        );
      });
    };
    if (labWblsIsWindows()) {
      agentRef.current = "checking";
      setAgent("checking");
    }
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [open]);

  const active = groups.find((group) => group.key === tab) || groups[0] || null;
  const activeSelected = active
    ? active.cases.filter((row) => selected.has(row.id))
    : [];
  const allChecked =
    Boolean(active) && active.cases.every((row) => selected.has(row.id));

  const label = useMemo(() => {
    if (!active || activeSelected.length === 0) return null;
    const sample = activeSelected[0];
    return renderLabShipLabel({
      mode,
      recipientName: active.name,
      recipientZip: sample.zipCode,
      recipientAddress: joinAddress(sample.address, sample.addressDetail),
      recipientPhone: sample.phone,
      senderName: sender.name,
      senderZip: sender.zipCode,
      senderAddress: sender.address,
      senderPhone: sender.phone,
      items: activeSelected.map((row) => ({
        patient: row.patientName,
        teeth: row.teeth,
        arrival: row.arrivalDate,
      })),
    });
  }, [active, activeSelected, mode, sender]);

  const toggle = (row: LabShipLabelCase) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!active) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const row of active.cases) next.delete(row.id);
      } else {
        for (const row of active.cases) next.add(row.id);
      }
      return next;
    });
  };

  const fileName = `${mode === "delivery" ? "딜리버리" : "택배"}_${active?.name || "라벨"}.png`;

  const rememberPrinted = () => {
    const ids = activeSelected.map((row) => row.id);
    setPrinted(markLabShipPrinted(ids));
  };

  const onPrintAgent = async () => {
    if (!label || busy) return;
    setBusy("print");
    setError("");
    try {
      await printLabWblsPng({
        pngBase64: label.pngBase64,
        printer,
        title: fileName,
        widthMm: LAB_SHIP_LABEL_WIDTH_MM,
        heightMm: LAB_SHIP_LABEL_HEIGHT_MM,
      });
      if (printer) writeLabWblsPrinter(printer);
      rememberPrinted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "라벨 출력에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const onBrowserPrint = () => {
    if (!label) return;
    const opened = printLabShipLabelInBrowser(label.dataUrl);
    if (!opened) {
      downloadLabShipLabel(label.dataUrl, fileName);
      setError("인쇄 창이 막혀 이미지로 저장했습니다.");
    } else {
      setError("");
    }
    rememberPrinted();
  };

  const onSave = () => {
    if (!label || busy) return;
    setBusy("save");
    downloadLabShipLabel(label.dataUrl, fileName);
    rememberPrinted();
    setBusy(null);
  };

  const missingAddress = Boolean(
    active && activeSelected.length > 0 && !joinAddress(activeSelected[0].address, activeSelected[0].addressDetail),
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(40rem,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:p-0">
        <DialogHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>택배 라벨</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm leading-relaxed text-muted-foreground">
              보철이 끝난 의뢰를 고르세요.
              <br />
              한 치과당 라벨 한 장입니다.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                ["parcel", "택배"],
                ["delivery", "딜리버리"],
              ] as const
            ).map(([value, labelText]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  mode === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500",
                )}
                onClick={() => setMode(value)}
              >
                {labelText}
              </button>
            ))}
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {mode === "parcel" ? "택배 상자에 붙입니다." : "배달 기사에게 건넵니다."}
          </p>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <Truck className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">완료된 보철이 없습니다.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              보철을 올리면 여기에 모입니다.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b sm:border-b-0 sm:border-r">
              <div className="flex gap-1.5 overflow-x-auto px-4 py-3">
                {groups.map((group) => {
                  const on = group.key === active?.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                        on
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                      onClick={() => setTab(group.key)}
                    >
                      {group.name}
                      <span className={cn("ml-1.5 tabular-nums", on ? "text-white/70" : "text-slate-400")}>
                        {group.cases.length}
                      </span>
                    </button>
                  );
                })}
              </div>
              {active ? (
                <div className="flex items-center gap-2 px-5 pb-2">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                    aria-label="이 치과 전체"
                  />
                  <button type="button" className="text-xs text-slate-500" onClick={toggleAll}>
                    이 치과 전체
                  </button>
                </div>
              ) : null}
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
                {active?.cases.map((row) => {
                  const checked = selected.has(row.id);
                  const arrival = formatArrivalChip(row.arrivalDate);
                  return (
                    <li key={row.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
                          checked
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        )}
                        onClick={() => toggle(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggle(row);
                          }
                        }}
                      >
                        <Checkbox
                          checked={checked}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={() => toggle(row)}
                          aria-label={`${row.patientName} 선택`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {row.patientName}
                            {row.teeth ? (
                              <span className="ml-1.5 font-medium text-slate-500">{row.teeth}</span>
                            ) : null}
                          </span>
                        </span>
                        {printed[row.id] ? (
                          <span className="shrink-0 text-[11px] font-medium text-emerald-700">
                            출력함
                          </span>
                        ) : null}
                        {arrival ? (
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                            {arrival}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex w-full shrink-0 flex-col items-center justify-center bg-slate-50/80 px-4 py-4 sm:w-64">
              {label ? (
                <img
                  src={label.dataUrl}
                  alt="라벨 미리보기"
                  className="w-40 rounded-md border border-slate-200 bg-white shadow-md"
                />
              ) : (
                <p className="px-4 text-center text-xs leading-relaxed text-slate-500">
                  보낼 보철을 고르면
                  <br />
                  라벨이 보입니다.
                </p>
              )}
              {missingAddress ? (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-amber-800">
                  이 치과 주소가 없습니다.
                  <br />
                  라벨에 주소 없음으로 나갑니다.
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="space-y-3 border-t px-5 py-3">
          <p className="text-xs leading-relaxed text-slate-600">
            {LAB_WBLS_PRINTER_MODEL}를 구매해 쓰세요.
            <br />
            드라이버에서 ZPL을 고르세요.
          </p>
          {agent === "ready" && printer && !isPc3ZplPrinterName(printer) ? (
            <p className="text-xs leading-relaxed text-amber-800">
              고른 프린터가 {LAB_WBLS_PRINTER_MODEL}가 아닙니다.
              <br />
              라벨 크기가 맞지 않을 수 있습니다.
            </p>
          ) : null}
          {agent === "missing" || agent === "outdated" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              <p>
                {agent === "outdated" ? (
                  <>
                    연결 프로그램을 업데이트하면 라벨을 출력합니다.
                    <br />
                    설정의 연결 프로그램과 같은 파일입니다.
                  </>
                ) : (
                  <>
                    연결 프로그램이 없습니다.
                    <br />
                    설정의 연결 프로그램과 같은 파일입니다.
                  </>
                )}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 h-8"
                onClick={() => {
                  void promptFromSettings(LAB_HELPER_PRINT_MIN_VERSION);
                }}
              >
                {agent === "outdated" ? "업데이트" : "설치"}
              </Button>
            </div>
          ) : null}
          {agent === "ready" && printers.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              프린터
              <select
                className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800"
                value={printer}
                onChange={(event) => {
                  const next = event.target.value;
                  setPrinter(next);
                  writeLabWblsPrinter(next);
                }}
              >
                {printers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {agent === "ready" ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              연결 프로그램이 연결됐습니다.
            </p>
          ) : null}
          {agent === "checking" && labWblsIsWindows() ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              연결 프로그램을 확인하는 중
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={!label || busy != null}
              onClick={onSave}
            >
              이미지 저장
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={!label || busy != null}
              onClick={onBrowserPrint}
            >
              이 화면에서 인쇄
            </Button>
            {agent === "ready" ? (
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={!label || busy != null}
                onClick={() => void onPrintAgent()}
              >
                {busy === "print" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                {activeSelected.length > 0
                  ? `라벨 출력 ${activeSelected.length}건`
                  : "라벨 출력"}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {helperDialogs}
    </>
  );
}
