import { useMemo } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { getMachineStatusDotClass } from "@/pages/manufacturer/equipment/cnc/lib/machineStatus";
import {
  MACHINING_SECTION_LABELS,
  buildLastCompletedSummary,
  formatElapsedMMSS,
} from "@/features/manufacturer/cnc/lib/machiningUi";
import type { MachineQueueCardProps, QueueItem } from "../types";
import { formatMachiningLabel } from "../utils/label";
import { MachiningRequestLabel } from "./MachiningRequestLabel";

const isMachiningStatus = (status?: string) => {
  const s = String(status || "").trim();
  return s === "생산" || s === "가공";
};

const getNcPreloadBadge = (slot: QueueItem | null) => {
  const status = String(slot?.ncPreload?.status || "").trim();
  if (!status) return null;
  const s = status.toUpperCase();
  if (!s || s === "NONE") return null;
  if (s === "UPLOADING") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 bg-amber-50 text-[10px] font-extrabold text-amber-700 border-amber-200 px-2 py-0.5"
      >
        업로드중
      </Badge>
    );
  }
  if (s === "READY") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 bg-emerald-50 text-[10px] font-extrabold text-emerald-700 border-emerald-200 px-2 py-0.5"
      >
        준비됨
      </Badge>
    );
  }
  if (s === "FAILED") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 bg-rose-50 text-[10px] font-extrabold text-rose-700 border-rose-200 px-2 py-0.5"
      >
        실패
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 bg-slate-50 text-[10px] font-extrabold text-slate-700 border-slate-200 px-2 py-0.5"
    >
      {s}
    </Badge>
  );
};

export const MachineQueueCard = ({
  machineId,
  machineName,
  machine,
  queue,
  onOpenRequestLog,
  autoEnabled,
  onToggleAuto,
  onToggleRequestAssign,
  machineStatus,
  statusRefreshing,
  onOpenReservation,
  onOpenProgramCode,
  machiningElapsedSeconds,
  lastCompleted,
  nowPlayingHint,
  onOpenCompleted,
}: MachineQueueCardProps) => {
  useToast();

  const machiningQueueAll = (Array.isArray(queue) ? queue : []).filter((q) =>
    isMachiningStatus(q?.status),
  );

  const { currentSlot, nextSlot } = useMemo(() => {
    const items = Array.isArray(machiningQueueAll) ? machiningQueueAll : [];
    const hintRid = String(nowPlayingHint?.requestId || "").trim();
    const hintJid = String(nowPlayingHint?.jobId || "").trim();
    const hintPath = String(nowPlayingHint?.bridgePath || "").trim();

    const idx =
      hintRid || hintJid || hintPath
        ? items.findIndex((j: any) => {
            const rid = String(j?.requestId || "").trim();
            if (hintRid && rid && rid === hintRid) return true;
            const jid = String(j?.jobId || j?.id || "").trim();
            if (hintJid && jid && jid === hintJid) return true;
            const bp = String(
              j?.ncFile?.filePath || j?.bridgePath || "",
            ).trim();
            if (hintPath && bp && bp === hintPath) return true;
            return false;
          })
        : -1;

    const current = idx >= 0 ? (items[idx] ?? null) : (items[0] ?? null);
    const next = idx >= 0 ? (items[idx + 1] ?? null) : (items[1] ?? null);
    return { currentSlot: current, nextSlot: next };
  }, [machiningQueueAll, nowPlayingHint]);

  const headPreloadBadge = getNcPreloadBadge(currentSlot);
  const headRequestId = currentSlot?.requestId
    ? String(currentSlot.requestId)
    : "";

  const totalMachiningCount = machiningQueueAll.length;

  const statusColor = getMachineStatusDotClass(machineStatus?.status);

  const headerTitle = machineName || machineId;

  const materialDiameterLabel = useMemo(() => {
    const dia = machine?.currentMaterial?.diameter;
    if (typeof dia === "number" && Number.isFinite(dia) && dia > 0) {
      const v = Number.isInteger(dia) ? String(dia) : dia.toFixed(1);
      return v;
    }
    const group = machine?.currentMaterial?.diameterGroup;
    const numeric = Number.parseFloat(
      String(group || "").replace(/[^0-9.]/g, ""),
    );
    if (Number.isFinite(numeric) && numeric > 0) {
      const v = numeric > 10 ? 12 : numeric;
      return `${Number.isInteger(v) ? v : v.toFixed(1)}`;
    }
    return "";
  }, [machine]);

  const nowPlayingLabel = currentSlot
    ? formatMachiningLabel(currentSlot)
    : machineStatus?.currentProgram
      ? String(machineStatus.currentProgram)
      : "없음";

  const nextUpLabel = nextSlot
    ? formatMachiningLabel(nextSlot)
    : machineStatus?.nextProgram
      ? String(machineStatus.nextProgram)
      : "없음";

  const elapsedLabel = (() => {
    return formatElapsedMMSS(machiningElapsedSeconds);
  })();

  const lastCompletedSummary = (() =>
    buildLastCompletedSummary(lastCompleted))();

  const lastCompletedLotRaw = String(
    (lastCompleted as any)?.lotNumber?.final ||
      (lastCompleted as any)?.lotNumber?.part ||
      "",
  ).trim();

  return (
    <div className="app-glass-card app-glass-card--xl flex flex-col">
      <div className="app-glass-card-content flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-extrabold text-slate-900">
              {headerTitle}
            </div>
            {!!materialDiameterLabel && (
              <Badge
                variant="outline"
                className="shrink-0 bg-white text-[10px] font-extrabold text-slate-700 border-slate-200 px-2 py-0.5"
                title="현재 소재 직경"
              >
                {materialDiameterLabel}
              </Badge>
            )}
            <span
              className={`w-3 h-3 rounded-full ${statusColor} ${
                statusRefreshing ? "animate-pulse" : ""
              }`}
            />
            <div className="shrink-0 text-[12px] font-extrabold text-slate-700">
              {totalMachiningCount}건
            </div>
            {headPreloadBadge ? headPreloadBadge : null}
          </div>
        </div>

        <div
          className="flex items-center gap-2"
          title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
        >
          <div className="text-[11px] font-extrabold text-slate-700">
            의뢰배정
          </div>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              machine?.allowRequestAssign !== false
                ? "bg-emerald-500"
                : "bg-gray-300"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              const next = machine?.allowRequestAssign === false;
              onToggleRequestAssign?.(next);
            }}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                machine?.allowRequestAssign !== false
                  ? "translate-x-5"
                  : "translate-x-1"
              }`}
            />
          </button>

          <div className="text-[11px] font-extrabold text-slate-700">
            자동가공
          </div>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoEnabled ? "bg-emerald-500" : "bg-gray-300"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleAuto(!autoEnabled);
            }}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="app-glass-card-content mt-4 flex flex-col gap-2 text-sm">
        <div className="grid grid-cols-1 gap-2">
          <div
            role="button"
            tabIndex={0}
            className="group rounded-2xl px-4 py-3 border shadow-sm bg-white/65 border-slate-200 hover:bg-white/85 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCompleted?.(machineId, machineName);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  {MACHINING_SECTION_LABELS.complete}
                  <span className="ml-4 mr-4">
                    종료 {lastCompletedSummary?.completedAtLabel || "-"}
                  </span>
                  <span>소요 {lastCompletedSummary?.durationLabel || "-"}</span>
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {lastCompleted ? (
                    <MachiningRequestLabel
                      clinicName={(lastCompleted as any)?.clinicName}
                      patientName={(lastCompleted as any)?.patientName}
                      tooth={(lastCompleted as any)?.tooth}
                      requestId={(lastCompleted as any)?.requestId}
                      lotNumber={lastCompletedLotRaw}
                      className="text-[15px]"
                    />
                  ) : (
                    "없음"
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0" />
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`group rounded-2xl px-4 py-3 border shadow-sm transition-all ${
              !currentSlot
                ? "bg-white/55 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-white/85 border-slate-200 hover:bg-white cursor-pointer"
            }`}
            onClick={(e) => {
              if (!currentSlot) return;
              const nc = currentSlot?.ncFile ?? null;
              const bridgePath = String(nc?.filePath || "").trim();
              const s3Key = String(nc?.s3Key || "").trim();
              const prog = {
                programNo: null,
                name: formatMachiningLabel(currentSlot),
                source: bridgePath ? "bridge_store" : "s3",
                bridgePath,
                s3Key,
                requestId: currentSlot?.requestId || "",
              };
              onOpenProgramCode?.(prog, machineId);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  {MACHINING_SECTION_LABELS.nowPlaying}
                  {!!elapsedLabel ? (
                    <span className="ml-2 text-blue-600 font-extrabold">
                      {elapsedLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {currentSlot ? (
                    <MachiningRequestLabel
                      clinicName={currentSlot?.clinicName}
                      patientName={currentSlot?.patientName}
                      tooth={(currentSlot as any)?.tooth}
                      requestId={currentSlot?.requestId}
                      lotNumber={String(
                        currentSlot?.lotNumber?.final ||
                          currentSlot?.lotNumber?.part ||
                          "",
                      ).trim()}
                      className="text-[15px]"
                    />
                  ) : (
                    nowPlayingLabel
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {headRequestId ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRequestLog?.(headRequestId);
                    }}
                  >
                    로그
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`group rounded-2xl px-4 py-3 border shadow-sm transition-all ${
              !nextSlot
                ? "bg-white/55 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-white/85 border-slate-200 hover:bg-white cursor-pointer"
            }`}
            onClick={(e) => {
              if (!nextSlot) return;
              const nc = nextSlot?.ncFile ?? null;
              const bridgePath = String(nc?.filePath || "").trim();
              const s3Key = String(nc?.s3Key || "").trim();
              const prog = {
                programNo: null,
                name: formatMachiningLabel(nextSlot),
                source: bridgePath ? "bridge_store" : "s3",
                bridgePath,
                s3Key,
                requestId: nextSlot?.requestId || "",
              };

              onOpenProgramCode?.(prog, machineId);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  {MACHINING_SECTION_LABELS.nextUp}
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {nextSlot ? (
                    <MachiningRequestLabel
                      clinicName={nextSlot?.clinicName}
                      patientName={nextSlot?.patientName}
                      tooth={(nextSlot as any)?.tooth}
                      requestId={nextSlot?.requestId}
                      lotNumber={String(
                        nextSlot?.lotNumber?.final ||
                          nextSlot?.lotNumber?.part ||
                          "",
                      ).trim()}
                      className="text-[15px]"
                    />
                  ) : (
                    nextUpLabel
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0"></div>
            </div>
          </div>
        </div>

        <div className="mt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenReservation();
            }}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-xs font-extrabold text-white hover:from-blue-700 hover:to-sky-600 disabled:opacity-50 shadow-sm"
          >
            예약 관리
          </button>
        </div>
      </div>
    </div>
  );
};
