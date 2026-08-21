// change-log:
// - 2026-08-21: Next Up NC 미수신(CAM 재생성) 시 라이노와 동일 블러 오버레이.
// - 2026-08-21: Next Up 카드 드래그로 다른 장비 이동(onMoveNextUpToMachine).
// - 2026-08-08: 공구상태 모달 톤에 맞춰 카드 밀도·CTA·compact 라벨 정리.
// - 2026-08-07: Complete/Now Playing/Next Up에서 의뢰ID(requestId) 표시 제거.
// - 2026-08-07: Complete/Now Playing/Next Up에 의뢰자명(businessName) 표시.
// - 2026-08-06: 큐 슬롯→프리뷰에 rnd(헥스 회전) 전달.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningRequestLabel.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/cnc/production.js
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { CncMachineActionButtons } from "@/features/manufacturer/cnc/components/CncMachineActionButtons";
import { MaterialDiameterChip } from "@/features/manufacturer/cnc/components/MaterialDiameterChip";
import { getMachineStatusDotClass } from "@/pages/manufacturer/equipment/cnc/lib/machineStatus";
import {
  MACHINING_SECTION_LABELS,
  buildLastCompletedSummary,
  formatElapsedMMSS,
} from "@/features/manufacturer/cnc/lib/machiningUi";
import type { MachineQueueCardProps, QueueItem } from "../types";
import { buildLabelExtraProps, formatMachiningLabel } from "../utils/label";
import { MachiningRequestLabel } from "./MachiningRequestLabel";
import { getMachineStatusLabel } from "@/pages/manufacturer/equipment/cnc/lib/machineStatus";

/** Next Up → 타 장비 드롭 MIME (playlist 재정렬과 구분) */
const NEXT_UP_MOVE_MIME = "application/x-abuts-nextup-move";

const isMachiningStatus = (slot?: QueueItem) => {
  const s = String(slot?.status || "").trim();
  const recStatus = String(slot?.machiningRecord?.status || "")
    .trim()
    .toUpperCase();
  if (recStatus) {
    if (["RUNNING", "PROCESSING"].includes(recStatus)) return true;
  }
  return s === "가공";
};

const normalizeBridgePathForMatch = (raw: unknown) =>
  String(raw || "")
    .trim()
    .replace(/^nc\//i, "")
    .replace(/\.(nc|stl)$/i, "")
    .toLowerCase();

const getNcPreloadBadge = (slot: QueueItem | null) => {
  const status = String(slot?.ncPreload?.status || "").trim();
  if (!status) return null;
  const s = status.toUpperCase();
  if (!s || s === "NONE") return null;
  if (s === "UPLOADING") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 rounded-md border-accent-muted bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong"
      >
        업로드중
      </Badge>
    );
  }
  if (s === "READY") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 rounded-md border-primary-muted bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong"
      >
        준비됨
      </Badge>
    );
  }
  if (s === "FAILED") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 rounded-md border-destructive-muted bg-destructive-soft px-1.5 py-0.5 text-[10px] font-semibold text-destructive"
      >
        실패
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 rounded-md border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
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
  onUploadFiles,
  autoEnabled,
  machiningActive,
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
  onOpenMaterial,
  onOpenMachineInfo,
  onOpenQueueManager,
  onOpenTemperature,
  onOpenToolStatus,
  onOpenSettings,
  tempHealth,
  toolHealth,
  tempTooltip,
  toolTooltip,
  isActive,
  onSelect,
  onRollbackNowPlaying,
  onRollbackNextUp,
  onRollbackCompleted,
  onApproveFromRollback,
  onMoveNextUpToMachine,
  materialNeedsReplacement,
  materialAlertTooltip,
}: MachineQueueCardProps) => {
  const machiningQueueAll = (Array.isArray(queue) ? queue : []).filter((q) =>
    isMachiningStatus(q),
  );

  const { currentSlot, nextSlot } = useMemo(() => {
    const items = Array.isArray(machiningQueueAll) ? machiningQueueAll : [];
    const hintRid = String(nowPlayingHint?.requestId || "").trim();
    const hintJid = String(nowPlayingHint?.jobId || "").trim();
    const hintPath = String(nowPlayingHint?.bridgePath || "").trim();
    const normalizedHintPath = normalizeBridgePathForMatch(hintPath);

    const hintedIdx =
      hintRid || hintJid || hintPath
        ? items.findIndex((j: any) => {
            const rid = String(j?.requestId || "").trim();
            if (hintRid && rid && rid === hintRid) return true;
            const jid = String(j?.jobId || j?.id || "").trim();
            if (hintJid && jid && jid === hintJid) return true;
            const bp = String(
              j?.ncFile?.filePath || j?.bridgePath || "",
            ).trim();
            const normalizedBp = normalizeBridgePathForMatch(bp);
            if (
              normalizedHintPath &&
              normalizedBp &&
              normalizedBp === normalizedHintPath
            )
              return true;
            return false;
          })
        : -1;

    const runningIdx = items.findIndex((j: any) => {
      const rec = j?.machiningRecord;
      if (!rec || typeof rec !== "object") return false;
      const recStatus = String(rec?.status || "")
        .trim()
        .toUpperCase();
      if (recStatus === "RUNNING" || recStatus === "PROCESSING") return true;
      const startedAt = rec?.startedAt ? new Date(rec.startedAt).getTime() : 0;
      const completedAt = rec?.completedAt
        ? new Date(rec.completedAt).getTime()
        : 0;
      return startedAt > 0 && completedAt <= 0;
    });

    const idx = hintedIdx >= 0 ? hintedIdx : runningIdx >= 0 ? runningIdx : -1;

    // 정책: 실제 가공중 힌트/레코드가 없으면 Now Playing을 비워두고,
    // 큐 맨 앞 항목을 Next Up으로만 표시한다.
    const current = idx >= 0 ? (items[idx] ?? null) : null;
    const next = idx >= 0 ? (items[idx + 1] ?? null) : (items[0] ?? null);
    return { currentSlot: current, nextSlot: next };
  }, [machiningQueueAll, nowPlayingHint]);

  const headPreloadBadge = getNcPreloadBadge(currentSlot);
  const headRequestId = currentSlot?.requestId
    ? String(currentSlot.requestId)
    : "";

  const headRequestMongoId = currentSlot?.requestMongoId
    ? String(currentSlot.requestMongoId)
    : "";
  const headRollbackCount = Number((currentSlot as any)?.rollbackCount || 0);
  const headMachiningCompleted =
    String(currentSlot?.machiningRecord?.status || "").toUpperCase() ===
    "COMPLETED";
  const headCanApproveWithoutRemachining =
    (headRollbackCount > 0 || headMachiningCompleted) && !!headRequestMongoId;

  // Next Up 대기 건수는 전체 가공 대기열에서 현재 Now Playing(실행중) 1건을 제외한 값이다.
  const totalMachiningCount = Math.max(
    0,
    machiningQueueAll.length - (currentSlot ? 1 : 0),
  );

  const statusColor = getMachineStatusDotClass(machineStatus?.status);
  const statusLabel = getMachineStatusLabel(machineStatus?.status);

  const headerTitle = machineName || machineId;

  const materialDiameterLabel = useMemo(() => {
    // 1) 장비의 현재 소재 직경이 명시되어 있으면 그대로 사용 (숫자/문자열 모두 지원)
    const rawDia = (machine as any)?.currentMaterial?.diameter;
    let numeric = Number.isFinite(rawDia)
      ? Number(rawDia)
      : Number.parseFloat(String(rawDia || "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) {
      const v = Number.isInteger(numeric)
        ? String(numeric)
        : numeric.toFixed(1);
      return v;
    }

    // 2) currentMaterial.diameterGroup 이 있으면 숫자로 파싱해서 사용
    const group = (machine as any)?.currentMaterial?.diameterGroup;
    numeric = Number.parseFloat(String(group || "").replace(/[^0-9.]/g, ""));

    // 3) 가공 보드에서는 currentMaterial 이 아직 없고 maxModelDiameterGroups 만 있는 경우가 있어,
    //    그럴 때는 첫 번째 그룹을 직경으로 사용한다 (예: ["8"] → 8).
    if (!Number.isFinite(numeric) || numeric <= 0) {
      const firstGroup =
        Array.isArray((machine as any)?.maxModelDiameterGroups) &&
        (machine as any).maxModelDiameterGroups.length > 0
          ? (machine as any).maxModelDiameterGroups[0]
          : null;
      if (firstGroup != null) {
        numeric = Number.parseFloat(String(firstGroup).replace(/[^0-9.]/g, ""));
      }
    }

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
  const nowPlayingAnodizingOff =
    (currentSlot as { caseInfos?: { anodizingEnabled?: boolean } } | null)
      ?.caseInfos?.anodizingEnabled === false;

  const nextUpLabel = nextSlot
    ? formatMachiningLabel(nextSlot)
    : machineStatus?.nextProgram
      ? String(machineStatus.nextProgram)
      : "없음";
  const nextUpAnodizingOff =
    (nextSlot as { caseInfos?: { anodizingEnabled?: boolean } } | null)
      ?.caseInfos?.anodizingEnabled === false;

  const elapsedLabel = (() => {
    // 실제 Now Playing 슬롯이 없으면 타이머를 숨긴다.
    // (socket 지연/유실 등으로 잔여 elapsed 값만 남아 00:00~00:02가 반복 표시되는 현상 방지)
    if (!currentSlot) return "";
    if (machiningElapsedSeconds === -1) {
      return "가공 시작!";
    }
    return formatElapsedMMSS(machiningElapsedSeconds);
  })();

  const isNowPlayingMachining = (() => {
    const recStatus = String(currentSlot?.machiningRecord?.status || "")
      .trim()
      .toUpperCase();
    const slotStatus = String(currentSlot?.status || "").trim();

    // '가공'은 큐 단계(대기 포함)로도 사용될 수 있어 비활성 조건에서 제외한다.
    // 실제 가공중 판정은 machiningActive / machiningRecord 상태 / 명시적 '가공중'만 허용.
    return (
      !!currentSlot &&
      (machiningActive ||
        recStatus === "RUNNING" ||
        recStatus === "PROCESSING" ||
        slotStatus === "가공중")
    );
  })();

  const canRollbackNowPlaying =
    !isNowPlayingMachining && !!headRequestId && !!onRollbackNowPlaying;
  const canApproveNowPlaying =
    !isNowPlayingMachining && !!headCanApproveWithoutRemachining;

  const { token } = useAuthStore();
  const { toast } = useToast();

  const [completedRolledBack, setCompletedRolledBack] = useState(false);
  const isCompletedRolledBack = completedRolledBack;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [nextUpDropActive, setNextUpDropActive] = useState(false);
  const nextUpDragActiveRef = useRef(false);
  const nextUpMoveInFlightRef = useRef(false);

  const nextUpMongoId = String(
    (nextSlot as { requestMongoId?: string } | null)?.requestMongoId || "",
  ).trim();
  const nextUpRequestId = String(nextSlot?.requestId || "").trim();
  const canDragNextUp =
    Boolean(onMoveNextUpToMachine) && Boolean(nextUpMongoId);
  const nextUpHasNc = Boolean(
    String((nextSlot as any)?.ncFile?.s3Key || "").trim() ||
      String((nextSlot as any)?.caseInfos?.ncFile?.s3Key || "").trim(),
  );
  // 준비 탭 라이노 미완료와 동일 SSOT: NC 없으면 CAM 재생성 대기
  const nextUpCamRegenPending = Boolean(nextSlot) && !nextUpHasNc;

  const hasNextUpMoveMime = (dt: DataTransfer | null) => {
    if (!dt) return false;
    return Array.from(dt.types || []).includes(NEXT_UP_MOVE_MIME);
  };

  const parseNextUpMovePayload = (dt: DataTransfer | null) => {
    if (!dt) return null;
    const raw = dt.getData(NEXT_UP_MOVE_MIME) || "";
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        requestMongoId?: string;
        requestId?: string;
        fromMachineId?: string;
      };
      const requestMongoId = String(parsed?.requestMongoId || "").trim();
      const fromMachineId = String(parsed?.fromMachineId || "").trim();
      if (!requestMongoId || !fromMachineId) return null;
      return {
        requestMongoId,
        requestId: String(parsed?.requestId || "").trim() || undefined,
        fromMachineId,
      };
    } catch {
      return null;
    }
  };

  const [queueAdminOpen, setQueueAdminOpen] = useState(false);
  const [queueAdminLoading, setQueueAdminLoading] = useState(false);
  const [queueAdminJobs, setQueueAdminJobs] = useState<
    {
      id: string;
      fileName?: string;
      originalFileName?: string;
      source?: string;
      createdAtUtc?: string;
      paused?: boolean;
      qty?: number;
    }[]
  >([]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const loadQueueAdmin = async (options?: { silent?: boolean }) => {
    if (!token) return;
    const uid = String(machine?.uid || machineId || "").trim();
    if (!uid) return;
    if (!options?.silent) setQueueAdminLoading(true);
    try {
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "큐 조회 실패");
      }
      const list: any[] = Array.isArray(body?.data) ? body.data : [];
      setQueueAdminJobs(
        list.map((j) => ({
          id: String(j?.id || "").trim(),
          fileName: j?.fileName ? String(j.fileName) : undefined,
          originalFileName: j?.originalFileName
            ? String(j.originalFileName)
            : undefined,
          source: j?.source ? String(j.source) : undefined,
          createdAtUtc: j?.createdAtUtc ? String(j.createdAtUtc) : undefined,
          paused: j?.paused === true,
          qty:
            typeof j?.qty === "number" && Number.isFinite(j.qty)
              ? j.qty
              : undefined,
        })),
      );
      onOpenQueueManager?.();
    } catch (e: any) {
      const msg = e?.message || "큐 조회 중 오류";
      toast({
        title: "큐 조회 실패",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setQueueAdminLoading(false);
    }
  };

  const deleteQueueJobAdmin = async (jobId: string) => {
    if (!token) return;
    const uid = String(machine?.uid || machineId || "").trim();
    const jid = String(jobId || "").trim();
    if (!uid || !jid) return;
    setQueueAdminLoading(true);
    try {
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/${encodeURIComponent(jid)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "삭제 실패");
      }
      toast({ title: "삭제 완료" });
      await loadQueueAdmin({ silent: true });
    } catch (e: any) {
      const msg = e?.message || "삭제 중 오류";
      toast({ title: "삭제 실패", description: msg, variant: "destructive" });
    } finally {
      setQueueAdminLoading(false);
    }
  };

  const clearQueueAdmin = async () => {
    if (!token) return;
    const uid = String(machine?.uid || machineId || "").trim();
    if (!uid) return;
    setQueueAdminLoading(true);
    try {
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/clear`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || body?.error || "전체 삭제 실패");
      }
      toast({ title: "큐 비움 완료" });
      await loadQueueAdmin({ silent: true });
    } catch (e: any) {
      const msg = e?.message || "전체 삭제 중 오류";
      toast({
        title: "큐 비움 실패",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setQueueAdminLoading(false);
    }
  };

  const effectiveLastCompleted = isCompletedRolledBack ? null : lastCompleted;



  const lastCompletedSummary = (() =>
    buildLastCompletedSummary(effectiveLastCompleted))();
  const lastCompletedRequestId = String(
    effectiveLastCompleted?.requestId || "",
  ).trim();
  const getLotShortCode = (slot?: QueueItem | null) =>
    String(slot?.lotNumber?.value || "")
      .trim()
      .replace(/^CA(P)?/i, "")
      .slice(-3)
      .toUpperCase();

  useEffect(() => {
    setCompletedRolledBack(false);
  }, [lastCompletedRequestId]);

  const assignOn = machine?.allowRequestAssign !== false;
  const nextUpCanApprove = (() => {
    const rc = Number((nextSlot as any)?.rollbackCount || 0);
    const mc =
      String(nextSlot?.machiningRecord?.status || "").toUpperCase() ===
      "COMPLETED";
    const id = String((nextSlot as any)?.requestMongoId || "").trim();
    return (rc > 0 || mc) && !!id;
  })();
  const completedCanApprove =
    Number((effectiveLastCompleted as any)?.rollbackCount || 0) > 0 &&
    !!String((effectiveLastCompleted as any)?.requestMongoId || "").trim() &&
    !!onApproveFromRollback;

  const slotActionBtn = (enabled: boolean) =>
    `inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-opacity hover:bg-slate-50 ${
      enabled
        ? "opacity-40 group-hover:opacity-100"
        : "opacity-20 cursor-not-allowed"
    }`;

  const chipSm =
    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold";

  return (
    <div
      className={`app-glass-card app-glass-card--xl flex flex-col cursor-pointer min-h-[220px] ${
        isActive
          ? "border-slate-400 ring-2 ring-slate-200"
          : "border-slate-200/80"
      }`}
      onClick={() => {
        onSelect?.();
      }}
    >
      <div className="app-glass-card-content flex flex-col gap-2">
        <div
          className="flex flex-wrap items-center gap-2"
          title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 truncate text-base font-bold tracking-tight text-slate-900">
              {headerTitle}
            </div>
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusColor} ${
                statusRefreshing ? "animate-pulse" : ""
              }`}
              title={`장비 상태: ${statusLabel}${
                statusRefreshing ? " (갱신중)" : ""
              }`}
              aria-label={`장비 상태 ${statusLabel}`}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              배정
            </span>
            <button
              type="button"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                assignOn ? "bg-primary" : "bg-slate-300"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleRequestAssign?.(!assignOn);
              }}
              title="의뢰배정"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  assignOn ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-[11px] font-semibold text-slate-500">
              자동
            </span>
            <button
              type="button"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoEnabled ? "bg-primary" : "bg-slate-300"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleAuto(!autoEnabled);
              }}
              title="자동가공"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  autoEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".nc,.txt"
            className="hidden"
            multiple
            onChange={(e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              onUploadFiles?.(files);
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
          />
          <MaterialDiameterChip
            label={materialDiameterLabel || "-"}
            variant="circle"
            tone={materialNeedsReplacement ? "danger" : "default"}
            title={
              materialNeedsReplacement
                ? materialAlertTooltip || "소재 교체 필요"
                : "소재 설정"
            }
            onClick={(e) => {
              e.stopPropagation();
              onOpenMaterial?.();
            }}
          />
          <CncMachineActionButtons
            loading={queueAdminLoading}
            tempLevel={tempHealth}
            toolLevel={toolHealth}
            tempTooltip={tempTooltip}
            toolTooltip={toolTooltip}
            onInfoClick={(e) => {
              e.stopPropagation();
              onOpenMachineInfo?.();
            }}
            onUploadClick={(e) => {
              e.stopPropagation();
              if (!onUploadFiles) return;
              fileInputRef.current?.click();
            }}
            uploadTooltip="파일 업로드"
            onQueueClick={(e) => {
              e.stopPropagation();
              const next = !queueAdminOpen;
              setQueueAdminOpen(next);
              if (next) void loadQueueAdmin();
            }}
            queueTooltip="수동 업로드 큐관리"
            onTempClick={(e) => {
              e.stopPropagation();
              onOpenTemperature?.();
            }}
            onToolClick={(e) => {
              e.stopPropagation();
              onOpenToolStatus?.();
            }}
            onSettingsClick={(e) => {
              e.stopPropagation();
              onOpenSettings?.();
            }}
          />
        </div>
      </div>

      {queueAdminOpen && (
        <div
          className="app-glass-card-content mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-800">
              수동 업로드 큐
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={queueAdminLoading}
                onClick={() => void loadQueueAdmin()}
              >
                새로고침
              </button>
              <button
                type="button"
                className="rounded-lg border border-destructive-muted bg-white px-2.5 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive-soft disabled:opacity-50"
                disabled={queueAdminLoading}
                onClick={() => setClearConfirmOpen(true)}
              >
                전체 비우기
              </button>
            </div>
          </div>

          <div className="mt-2 max-h-[160px] overflow-auto rounded-xl border border-slate-200 bg-white">
            {queueAdminJobs.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-500">비어있음</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {queueAdminJobs.map((j) => {
                  const title =
                    j.originalFileName || j.fileName || j.id || "(unknown)";
                  return (
                    <div
                      key={j.id}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                      title={title}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-800">
                          {title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {j.source ? `source=${j.source}` : ""}
                          {j.qty ? `  qty=${j.qty}` : ""}
                          {j.paused ? "  paused" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        disabled={queueAdminLoading}
                        onClick={() => void deleteQueueJobAdmin(j.id)}
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={clearConfirmOpen}
        title="큐 전체 비우기"
        description="이 장비의 작업 큐를 모두 삭제합니다. 계속할까요?"
        confirmLabel="전체 비우기"
        cancelLabel="취소"
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={async () => {
          setClearConfirmOpen(false);
          await clearQueueAdmin();
        }}
      />

      <div className="app-glass-card-content mt-3 flex flex-col gap-1.5 text-sm">
        <div className="grid grid-cols-1 gap-1.5">
          {/* Complete */}
          <div
            role="button"
            tabIndex={0}
            className="group rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:bg-slate-50 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCompleted?.(machineId, machineName);
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 normal-case tracking-normal">
                <span className="uppercase tracking-wide text-slate-400">
                  {MACHINING_SECTION_LABELS.complete}
                </span>
                <span className="font-medium text-slate-500">
                  종료 {lastCompletedSummary?.completedAtLabel || "-"}
                </span>
                <span className="font-medium text-slate-500">
                  소요 {lastCompletedSummary?.durationLabel || "-"}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className={slotActionBtn(
                    !!(lastCompletedRequestId && onRollbackCompleted),
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!lastCompletedRequestId) return;
                    if (!onRollbackCompleted) return;
                    setCompletedRolledBack(true);
                    onRollbackCompleted(lastCompletedRequestId, machineId);
                  }}
                  disabled={!lastCompletedRequestId || !onRollbackCompleted}
                  title="준비로 되돌리기"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={slotActionBtn(completedCanApprove)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const id = String(
                      (effectiveLastCompleted as any)?.requestMongoId || "",
                    ).trim();
                    if (
                      Number(
                        (effectiveLastCompleted as any)?.rollbackCount || 0,
                      ) <= 0
                    )
                      return;
                    if (!id) return;
                    onApproveFromRollback?.(id);
                  }}
                  disabled={!completedCanApprove}
                  title="재가공 없이 세척.패킹으로 승인"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="mt-1 min-w-0">
              {effectiveLastCompleted ? (
                <MachiningRequestLabel
                  density="compact"
                  business={(effectiveLastCompleted as any)?.businessName}
                  clinicName={(effectiveLastCompleted as any)?.clinicName}
                  patientName={(effectiveLastCompleted as any)?.patientName}
                  tooth={(effectiveLastCompleted as any)?.tooth}
                  requestId={(effectiveLastCompleted as any)?.requestId}
                  hideRequestId
                  lotShortCode={getLotShortCode(effectiveLastCompleted as any)}
                  caseInfos={(effectiveLastCompleted as any)?.caseInfos}
                  hasNc={Boolean(
                    (effectiveLastCompleted as any)?.ncFile?.s3Key ||
                      (effectiveLastCompleted as any)?.caseInfos?.ncFile?.s3Key,
                  )}
                  shippingSource={
                    (effectiveLastCompleted as any)?.requestId
                      ? (effectiveLastCompleted as any)
                      : undefined
                  }
                  {...buildLabelExtraProps(effectiveLastCompleted as any)}
                />
              ) : (
                <span className="text-[13px] text-slate-400">없음</span>
              )}
            </div>
          </div>

          {/* Now Playing */}
          <div
            role="button"
            tabIndex={0}
            className={`group rounded-xl border transition-colors ${
              !currentSlot
                ? "border-slate-200 bg-white text-slate-400 cursor-not-allowed"
                : isNowPlayingMachining
                  ? "border-primary-muted bg-primary-soft/60 hover:bg-primary-soft cursor-pointer"
                  : "border-slate-200 bg-slate-50 hover:bg-white cursor-pointer"
            } px-3 py-2.5`}
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
                requestMongoId: (currentSlot as any)?.requestMongoId || "",
                clinicName: currentSlot?.clinicName || "",
                patientName: currentSlot?.patientName || "",
                tooth: (currentSlot as any)?.tooth || "",
                lotNumber: (currentSlot as any)?.lotNumber || null,
                caseInfos: (currentSlot as any)?.caseInfos || null,
                rnd: (currentSlot as any)?.rnd || null,
                shippingMode: (currentSlot as any)?.shippingMode || null,
                finalShipping: (currentSlot as any)?.finalShipping || null,
                originalShipping: (currentSlot as any)?.originalShipping || null,
                estimatedShipYmd:
                  (currentSlot as any)?.estimatedShipYmd ||
                  (currentSlot as any)?.timeline?.estimatedShipYmd ||
                  null,
              };
              onOpenProgramCode?.(prog, machineId);
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                <span className="uppercase tracking-wide text-slate-400">
                  {MACHINING_SECTION_LABELS.nowPlaying}
                </span>
                {nowPlayingAnodizingOff ? (
                  <span
                    className={`${chipSm} border-destructive-muted bg-destructive-soft text-destructive`}
                  >
                    아노 X
                  </span>
                ) : null}
                {headPreloadBadge}
                {elapsedLabel ? (
                  <span className="font-bold text-slate-800">
                    {elapsedLabel}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className={slotActionBtn(canRollbackNowPlaying)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canRollbackNowPlaying) return;
                    onRollbackNowPlaying?.(headRequestId, machineId);
                  }}
                  disabled={!canRollbackNowPlaying}
                  title="준비로 되돌리기"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={slotActionBtn(canApproveNowPlaying)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canApproveNowPlaying) return;
                    onApproveFromRollback?.(headRequestMongoId);
                  }}
                  disabled={!canApproveNowPlaying}
                  title="재가공 없이 세척.패킹으로 승인"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="mt-1 min-w-0">
              {currentSlot ? (
                <MachiningRequestLabel
                  density="compact"
                  business={currentSlot?.businessName}
                  clinicName={currentSlot?.clinicName}
                  patientName={currentSlot?.patientName}
                  tooth={(currentSlot as any)?.tooth}
                  requestId={currentSlot?.requestId}
                  hideRequestId
                  lotShortCode={getLotShortCode(currentSlot)}
                  caseInfos={(currentSlot as any)?.caseInfos}
                  hasNc={Boolean(
                    (currentSlot as any)?.ncFile?.s3Key ||
                      (currentSlot as any)?.caseInfos?.ncFile?.s3Key,
                  )}
                  shippingSource={
                    currentSlot?.requestId ? currentSlot : undefined
                  }
                  {...buildLabelExtraProps(currentSlot)}
                />
              ) : (
                <span className="text-[13px] text-slate-400">
                  {nowPlayingLabel}
                </span>
              )}
            </div>
          </div>

          {/* Next Up */}
          <div
            role="button"
            tabIndex={0}
            className={`group relative rounded-xl border px-3 py-2.5 transition-colors ${
              nextUpCamRegenPending ? "overflow-hidden" : ""
            } ${
              nextUpDropActive
                ? "border-primary bg-primary-soft/40 ring-1 ring-primary/30"
                : "border-slate-200"
            } ${
              !nextSlot && !nextUpDropActive
                ? "bg-white text-slate-400"
                : "bg-white hover:bg-slate-50"
            } ${canDragNextUp ? "cursor-grab active:cursor-grabbing" : nextSlot && !nextUpCamRegenPending ? "cursor-pointer" : "cursor-default"}`}
            draggable={canDragNextUp}
            title={
              nextUpCamRegenPending
                ? "CAM 재생성 중"
                : canDragNextUp
                  ? "드래그하여 다른 장비 Next Up으로 이동"
                  : undefined
            }
            onDragStart={(e) => {
              if (!canDragNextUp) {
                e.preventDefault();
                return;
              }
              nextUpDragActiveRef.current = true;
              const payload = JSON.stringify({
                requestMongoId: nextUpMongoId,
                requestId: nextUpRequestId || undefined,
                fromMachineId: machineId,
              });
              e.dataTransfer.setData(NEXT_UP_MOVE_MIME, payload);
              // Safari fallback only; dragOver accepts MIME only
              e.dataTransfer.setData("text/plain", payload);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              // click is often fired after a completed drag — suppress one cycle
              window.setTimeout(() => {
                nextUpDragActiveRef.current = false;
              }, 0);
            }}
            onDragOver={(e) => {
              if (!onMoveNextUpToMachine) return;
              if (!hasNextUpMoveMime(e.dataTransfer)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (!nextUpDropActive) setNextUpDropActive(true);
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (related && e.currentTarget.contains(related)) return;
              setNextUpDropActive(false);
            }}
            onDrop={(e) => {
              setNextUpDropActive(false);
              if (!onMoveNextUpToMachine) return;
              e.preventDefault();
              e.stopPropagation();
              if (nextUpMoveInFlightRef.current) return;

              let payload = parseNextUpMovePayload(e.dataTransfer);
              if (!payload) {
                // Safari: custom MIME may be empty on drop — try text/plain once
                const fallbackRaw = e.dataTransfer.getData("text/plain") || "";
                if (!fallbackRaw) return;
                try {
                  const parsed = JSON.parse(fallbackRaw) as {
                    requestMongoId?: string;
                    requestId?: string;
                    fromMachineId?: string;
                  };
                  const requestMongoId = String(
                    parsed?.requestMongoId || "",
                  ).trim();
                  const fromMachineId = String(
                    parsed?.fromMachineId || "",
                  ).trim();
                  if (!requestMongoId || !fromMachineId) return;
                  payload = {
                    requestMongoId,
                    requestId:
                      String(parsed?.requestId || "").trim() || undefined,
                    fromMachineId,
                  };
                } catch {
                  return;
                }
              }
              if (payload.fromMachineId === machineId) return;

              nextUpMoveInFlightRef.current = true;
              Promise.resolve(
                onMoveNextUpToMachine({
                  requestMongoId: payload.requestMongoId,
                  requestId: payload.requestId,
                  fromMachineId: payload.fromMachineId,
                  toMachineId: machineId,
                }),
              ).finally(() => {
                nextUpMoveInFlightRef.current = false;
              });
            }}
            onClick={(e) => {
              if (nextUpDragActiveRef.current) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              if (!nextSlot || nextUpCamRegenPending) return;
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
                requestMongoId: (nextSlot as any)?.requestMongoId || "",
                clinicName: nextSlot?.clinicName || "",
                patientName: nextSlot?.patientName || "",
                tooth: (nextSlot as any)?.tooth || "",
                lotNumber: (nextSlot as any)?.lotNumber || null,
                caseInfos: (nextSlot as any)?.caseInfos || null,
                rnd: (nextSlot as any)?.rnd || null,
                shippingMode: (nextSlot as any)?.shippingMode || null,
                finalShipping: (nextSlot as any)?.finalShipping || null,
                originalShipping: (nextSlot as any)?.originalShipping || null,
                estimatedShipYmd:
                  (nextSlot as any)?.estimatedShipYmd ||
                  (nextSlot as any)?.timeline?.estimatedShipYmd ||
                  null,
              };
              onOpenProgramCode?.(prog, machineId);
            }}
          >
            {nextUpCamRegenPending ? (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-white/55 backdrop-blur-[6px] cursor-not-allowed"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                role="status"
                aria-live="polite"
                aria-label="CAM 재생성 중"
              >
                <span className="rounded-full border border-primary-muted bg-primary-soft/90 px-3 py-1.5 text-sm font-extrabold text-primary-strong shadow-sm">
                  CAM 재생성 중
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                <span className="uppercase tracking-wide text-slate-400">
                  {MACHINING_SECTION_LABELS.nextUp}
                </span>
                <span
                  className={`${chipSm} border-slate-200 bg-slate-50 text-slate-600`}
                >
                  대기 {totalMachiningCount}건
                </span>
                {nextUpAnodizingOff ? (
                  <span
                    className={`${chipSm} border-destructive-muted bg-destructive-soft text-destructive`}
                  >
                    아노 X
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className={slotActionBtn(
                    !!(nextSlot?.requestId && onRollbackNextUp),
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!onRollbackNextUp) return;
                    const rid = String(nextSlot?.requestId || "").trim();
                    if (!rid) return;
                    onRollbackNextUp(rid, machineId);
                  }}
                  disabled={!nextSlot?.requestId || !onRollbackNextUp}
                  title="준비로 되돌리기"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={slotActionBtn(nextUpCanApprove)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const id = String(
                      (nextSlot as any)?.requestMongoId || "",
                    ).trim();
                    if (!nextUpCanApprove || !id) return;
                    onApproveFromRollback?.(id);
                  }}
                  disabled={!nextUpCanApprove}
                  title="재가공 없이 세척.패킹으로 승인"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="mt-1 min-w-0">
              {nextSlot ? (
                <MachiningRequestLabel
                  density="compact"
                  business={nextSlot?.businessName}
                  clinicName={nextSlot?.clinicName}
                  patientName={nextSlot?.patientName}
                  tooth={(nextSlot as any)?.tooth}
                  requestId={nextSlot?.requestId}
                  hideRequestId
                  lotShortCode={getLotShortCode(nextSlot)}
                  caseInfos={(nextSlot as any)?.caseInfos}
                  hasNc={Boolean(
                    (nextSlot as any)?.ncFile?.s3Key ||
                      (nextSlot as any)?.caseInfos?.ncFile?.s3Key,
                  )}
                  shippingSource={nextSlot?.requestId ? nextSlot : undefined}
                  {...buildLabelExtraProps(nextSlot)}
                />
              ) : (
                <span className="text-[13px] text-slate-400">{nextUpLabel}</span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenReservation();
          }}
          className="mt-1 w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          예약 관리
        </button>
      </div>
    </div>
  );
};
