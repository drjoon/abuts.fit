// change-log:
// - 2026-08-06: 큐→프리뷰에 designSoftware·헥스 회전(rnd/caseInfos) 전달. 가공 단계 누락 수정.
// - 2026-08-06: 출고예정·마감 뱃지용 estimatedShipYmd를 큐→프리뷰로 전달.
// - 2026-08-05: 신속배송 14:00 빠른 가공 재배치 Alert/우선순위 룰 모달·뱃지.
// - 2026-08-04: 재생목록 클릭 → PreviewModal 오픈. 큐→프리뷰에 shippingMode 전달.
// - 2026-08-03: MachiningQueueBoard: 작업 공정의 display label 정규화(의뢰 -> 준비) 영향 반영(주로 로컬 저장/복구 키/주석). UI 텍스트 변경은 없었음.
// related files:
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/SelfInspectionReportModal.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CompletedMachiningRecordsModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/ExpressRebalanceAlertModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningPriorityRulesModal.tsx
// - web/backend/controllers/requests/expressDeadlineRebalance.utils.js
// - web/backend/controllers/requests/machiningPriorityRules.js
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, ListOrdered, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { CncEventLogModal } from "@/features/cnc/components/CncEventLogModal";
import { useCncRaw } from "@/features/manufacturer/cnc/hooks/useCncRaw";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { CncProgramEditorPanel } from "@/pages/manufacturer/equipment/cnc/components/CncProgramEditorPanel";
import { CncPlaylistDrawer } from "@/pages/manufacturer/equipment/cnc/components/CncPlaylistDrawer";
import { CompletedMachiningRecordsModal } from "@/pages/manufacturer/equipment/cnc/components/CompletedMachiningRecordsModal";
import {
  SelfInspectionReportModal,
  type SelfInspectionReportItem,
} from "@/pages/manufacturer/equipment/cnc/components/SelfInspectionReportModal";
import { CncMachineManagerModal } from "@/pages/manufacturer/equipment/cnc/components/CncMachineManagerModal";
import { CncTempDetailModal } from "@/pages/manufacturer/equipment/cnc/components/CncTempDetailModal";
import { CncToolStatusModal } from "@/pages/manufacturer/equipment/cnc/components/CncToolStatusModal";
import { useCncDashboardMachineInfo } from "@/pages/manufacturer/equipment/cnc/hooks/useCncDashboardMachineInfo";
import { useCncTempPanel } from "@/pages/manufacturer/equipment/cnc/hooks/useCncTempPanel";
import { useCncToolPanels } from "@/pages/manufacturer/equipment/cnc/hooks/useCncToolPanels";
import { useCncToolSlots } from "@/pages/manufacturer/equipment/cnc/hooks/useCncToolSlots";
import { useCncWriteGuard } from "@/pages/manufacturer/equipment/cnc/hooks/useCncWriteGuard";
import { MachineQueueCard } from "./components/MachineQueueCard";
import type { MachineActionLevel, MachineStatus, QueueItem } from "./types";
import { useMachiningBoard } from "./hooks/useMachiningBoard";
import { CncMaterialModal } from "@/pages/manufacturer/equipment/cnc/components/CncMaterialModal";
import { useManUpload } from "@/pages/manufacturer/equipment/cnc/hooks/useManUpload";
import { MachiningRequestLabel } from "./components/MachiningRequestLabel";
import { ExpressRebalanceAlertModal } from "./components/ExpressRebalanceAlertModal";
import { MachiningPriorityRulesModal } from "./components/MachiningPriorityRulesModal";
import { buildLabelExtraProps } from "./utils/label";
import { PreviewModal } from "@/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal";
import { usePreviewLoader } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/usePreviewLoader";
import { useRequestFileHandlers } from "@/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers";
import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

type MaterialLikeMachine = {
  currentMaterial?: { diameter?: unknown; diameterGroup?: unknown } | null;
  maxModelDiameterGroups?: unknown[] | null;
} | null;

const resolveMachineMaterialDiameter = (machine: MaterialLikeMachine): number | null => {
  const rawDia = machine?.currentMaterial?.diameter;
  let numeric = Number.isFinite(rawDia)
    ? Number(rawDia)
    : Number.parseFloat(String(rawDia || "").replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    const group = machine?.currentMaterial?.diameterGroup;
    numeric = Number.parseFloat(String(group || "").replace(/[^0-9.]/g, ""));
  }

  if (!Number.isFinite(numeric) || numeric <= 0) {
    const firstGroup =
      Array.isArray(machine?.maxModelDiameterGroups) &&
      machine.maxModelDiameterGroups.length > 0
        ? machine.maxModelDiameterGroups[0]
        : null;
    if (firstGroup != null) {
      numeric = Number.parseFloat(
        String(firstGroup).replace(/[^0-9.]/g, ""),
      );
    }
  }

  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const normalized = numeric > 10 ? 12 : numeric;
  return Number(normalized.toFixed(3));
};

const resolveMachineActionLevel = (
  level?: string | null,
): MachineActionLevel => {
  if (level === "alarm") return "alarm";
  if (level === "warn") return "warn";
  if (level === "ok") return "ok";
  if (level === "disabled") return "disabled";
  return "unknown";
};

const buildToolSummaryTooltip = (summary: any) => {
  const dueTools = Array.isArray(summary?.dueTools) ? summary.dueTools : [];
  if (dueTools.length === 0) return "공구 수명, 교체 확인";
  const head = dueTools
    .slice(0, 3)
    .map((item: any) => `#${item.toolNum}`)
    .join(", ");
  const suffix = dueTools.length > 3 ? ` 외 ${dueTools.length - 3}개` : "";
  return `교체 임박 ${head}${suffix}`;
};

const normalizeLotSearchKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const isMaterialExhaustedAlarmText = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return false;
  const upper = text.toUpperCase();
  if (upper.includes("CNC_ALARM_MATERIAL_EXHAUST")) return true;
  if (/TYPE\s*=\s*15\s*,\s*NO\s*=\s*1051/.test(upper)) return true;
  return (
    text.includes("소재") &&
    (text.includes("교체") || text.includes("소진") || text.includes("부족"))
  );
};

export const MachiningQueueBoard = ({
  searchQuery,
}: {
  searchQuery?: string;
}) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const { uploadMachineFiles } = useManUpload();
  const board = useMachiningBoard({ token });
  const { callRaw } = useCncRaw();
  const { ensureCncWriteAllowed, PinModal } = useCncWriteGuard();
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);
  const [unassignedModalOpen, setUnassignedModalOpen] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [tempHealthMap, setTempHealthMap] = useState<
    Record<string, MachineActionLevel>
  >({});
  const [tempTooltipMap, setTempTooltipMap] = useState<Record<string, string>>(
    {},
  );
  const [toolHealthMap, setToolHealthMap] = useState<
    Record<string, MachineActionLevel>
  >({});
  const [toolTooltipMap, setToolTooltipMap] = useState<Record<string, string>>(
    {},
  );
  const [toolWorkUid, setToolWorkUid] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [siQueue, setSiQueue] = useState<SelfInspectionReportItem[]>([]);
  const [siIdx, setSiIdx] = useState(0);
  const [siOpen, setSiOpen] = useState(false);
  const [siFetching, setSiFetching] = useState(false);
  const [anodizingOffTriggering, setAnodizingOffTriggering] = useState(false);
  const [, setSearchParams] = useSearchParams();

  const [camPreviewOpen, setCamPreviewOpen] = useState(false);
  const blockedCamPreviewReopenRef = useRef<{
    requestId: string;
    requestMongoId: string;
    untilMs: number;
  } | null>(null);
  const [camPreviewLoading, setCamPreviewLoading] = useState(false);
  const [camPreviewFiles, setCamPreviewFiles] = useState<{
    original?: File | null;
    cam?: File | null;
    title?: string;
    request?: ManufacturerRequest | null;
    finishLinePoints?: number[][] | null;
    finishLineSource?: "caseInfos" | "file" | null;
  }>({});
  const [camPreviewNcText, setCamPreviewNcText] = useState("");
  const [camPreviewNcName, setCamPreviewNcName] = useState("");
  const [camPreviewStageUrl, setCamPreviewStageUrl] = useState("");
  const [camPreviewStageName, setCamPreviewStageName] = useState("");
  const [camPreviewUploading, setCamPreviewUploading] = useState<
    Record<string, boolean>
  >({});
  const [, setCamPreviewDownloading] = useState<Record<string, boolean>>({});
  const [, setCamPreviewUploadProgress] = useState<Record<string, number>>({});
  const [, setCamPreviewDeletingCam] = useState<Record<string, boolean>>({});
  const [, setCamPreviewDeletingNc] = useState<Record<string, boolean>>({});
  const [camPreviewReviewSaving, setCamPreviewReviewSaving] = useState(false);
  const [camPreviewMachineId, setCamPreviewMachineId] = useState("");
  const [camPreviewProgram, setCamPreviewProgram] = useState<Record<string, unknown> | null>(null);
  const [reopenCamPreviewOnEditorClose, setReopenCamPreviewOnEditorClose] =
    useState(false);

  // 마지막으로 본 의룰건 requestId를 localStorage에 저장/복원
  const SI_LAST_KEY = "abuts:si-last-request-id";

  const saveSiRequestId = (items: SelfInspectionReportItem[], idx: number) => {
    const id = items[idx]?.requestId;
    if (id) {
      try {
        localStorage.setItem(SI_LAST_KEY, id);
      } catch {
        /* noop */
      }
    }
  };

  const restoreSiIdx = (items: SelfInspectionReportItem[]): number => {
    try {
      const lastId = localStorage.getItem(SI_LAST_KEY);
      if (lastId) {
        const found = items.findIndex((it) => it.requestId === lastId);
        if (found >= 0) return found;
      }
    } catch {
      /* noop */
    }
    return 0;
  };

  const findSelfInspectionByLotNumber = useCallback(
    (lotNumberQuery: string) => {
      const query = normalizeLotSearchKey(lotNumberQuery);
      if (!query || siQueue.length === 0) return false;

      const exactIdx = siQueue.findIndex(
        (it) => normalizeLotSearchKey(it?.lotNumber) === query,
      );
      const partialIdx =
        exactIdx >= 0
          ? exactIdx
          : siQueue.findIndex((it) =>
              normalizeLotSearchKey(it?.lotNumber).includes(query),
            );

      if (partialIdx < 0) return false;
      setSiIdx(partialIdx);
      saveSiRequestId(siQueue, partialIdx);
      return true;
    },
    [siQueue],
  );

  const openSelfInspectionQueue = async () => {
    setSiFetching(true);
    try {
      const res = await fetch(
        "/api/cnc-machines/machining/pending-self-inspections?limit=100",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await res.json().catch(() => ({}));
      const items: SelfInspectionReportItem[] = Array.isArray(body?.data)
        ? body.data
        : [];
      if (items.length === 0) {
        toast({
          title: "미확정 자주검사 없음",
          description: "모든 가공 완료 건이 이미 확정되었습니다.",
        });
        return;
      }
      const idx = restoreSiIdx(items);
      setSiQueue(items);
      setSiIdx(idx);
      setSiOpen(true);
    } catch {
      toast({
        title: "오류",
        description: "자주검사 목록을 불러오지 못했습니다.",
      });
    } finally {
      setSiFetching(false);
    }
  };

  const {
    machines,
    filteredMachines,
    form,
    addModalOpen,
    setAddModalOpen,
    addModalMode,
    handleChange,
    handleEditMachine,
    handleDeleteMachine,
    handleAddMachine,
    statusByUid,
    machineStatusMap,
    queueMap,
    setQueueMap,
    machiningElapsedSecondsMap,
    lastCompletedMap,
    nowPlayingHintMap,
    statusRefreshing,
    statusRefreshError,
    statusRefreshedAt,
    statusRefreshErroredAt,
    reassignProductionQueues,
    handleBoardClickCapture,
    isMockFromBackend,
    globalAutoEnabled,
    setGlobalAutoEnabled,
    updateMachineAuto,
    updateMachineRequestAssign,
    openReservationForMachine,
    openProgramDetailForMachining,
    isReadOnly,
    workUid,
    programEditorOpen,
    programEditorTarget,
    closeProgramEditor,
    loadProgramCodeForMachining,
    saveProgramCode,
    eventLogRequestId,
    setEventLogRequestId,
    playlistOpen,
    playlistTitle,
    playlistJobs,
    playlistMachineId,
    setPlaylistOpen,
    setPlaylistJobs,
    buildPlaylistJobsFromQueue,
    loadProductionQueueForMachine,
    completedModalOpen,
    setCompletedModalOpen,
    completedModalMachineId,
    setCompletedModalMachineId,
    completedModalTitle,
    setCompletedModalTitle,
    materialModalOpen,
    setMaterialModalOpen,
    materialModalTarget,
    setMaterialModalTarget,
    handleReplaceMaterial,
    handleAddMaterial,
    rollbackRequestInQueue,
    approveMachiningFromRollback,
    machiningAlerts,
    clearMachiningAlerts,
    expressRebalanceAlert,
    clearExpressRebalanceAlert,
  } = board;

  const [expressRebalanceModalOpen, setExpressRebalanceModalOpen] =
    useState(false);
  const [priorityRulesModalOpen, setPriorityRulesModalOpen] = useState(false);

  const decodeNcText = useCallback((buffer: ArrayBuffer) => {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
    const utf8Text = utf8Decoder.decode(buffer);
    if (!utf8Text.includes("\uFFFD")) return utf8Text;
    try {
      const eucKrDecoder = new TextDecoder("euc-kr", { fatal: false });
      return eucKrDecoder.decode(buffer);
    } catch {
      return utf8Text;
    }
  }, []);

  const refreshMachiningQueuesForPreview = useCallback(async () => {
    if (!token) return;
    const qRes = await fetch("/api/cnc-machines/queues", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const qBody = await qRes.json().catch(() => ({}));
    if (!qRes.ok || (qBody as { success?: boolean })?.success === false) return;
    const map =
      qBody?.data && typeof qBody.data === "object" ? qBody.data : {};
    setQueueMap(map);

    const mid = String(camPreviewMachineId || "").trim();
    if (!mid) return;
    const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
    await loadProductionQueueForMachine(mid, rawNext);
  }, [token, setQueueMap, camPreviewMachineId, loadProductionQueueForMachine]);

  const { handleOpenPreview } = usePreviewLoader({
    token,
    isCamStage: true,
    isMachiningStage: false,
    tabStage: "cam",
    decodeNcText,
    setPreviewLoading: setCamPreviewLoading,
    setPreviewNcText: setCamPreviewNcText,
    setPreviewNcName: setCamPreviewNcName,
    setPreviewStageUrl: setCamPreviewStageUrl,
    setPreviewStageName: setCamPreviewStageName,
    setPreviewFiles: setCamPreviewFiles,
    setPreviewOpen: setCamPreviewOpen,
  });

  const {
    handleDownloadOriginalStl,
    handleDownloadCamStl,
    handleDownloadNcFile,
    handleDownloadStageFile,
    handleUpdateReviewStatus,
    handleDeleteCam,
    handleDeleteNc,
    handleUploadCam,
    handleUploadNc,
    handleUploadStageFile,
    handleDeleteStageFile,
  } = useRequestFileHandlers({
    token,
    stage: "cam",
    isCamStage: true,
    isMachiningStage: false,
    fetchRequests: refreshMachiningQueuesForPreview,
    setDownloading: setCamPreviewDownloading,
    setUploading: setCamPreviewUploading,
    setUploadProgress: setCamPreviewUploadProgress,
    setDeletingCam: setCamPreviewDeletingCam,
    setDeletingNc: setCamPreviewDeletingNc,
    setReviewSaving: setCamPreviewReviewSaving,
    setPreviewOpen: setCamPreviewOpen,
    setPreviewFiles: setCamPreviewFiles,
    setPreviewNcText: setCamPreviewNcText,
    setPreviewNcName: setCamPreviewNcName,
    setPreviewStageUrl: setCamPreviewStageUrl,
    setPreviewStageName: setCamPreviewStageName,
    setPreviewLoading: setCamPreviewLoading,
    setSearchParams,
    decodeNcText,
  });

  const handleCamPreviewOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const currentReq = camPreviewFiles?.request as ManufacturerRequest | undefined;
        blockedCamPreviewReopenRef.current = {
          requestId: String(currentReq?.requestId || "").trim(),
          requestMongoId: String(currentReq?._id || "").trim(),
          untilMs: Date.now() + 2000,
        };
      }
      setCamPreviewOpen(nextOpen);
    },
    [camPreviewFiles],
  );

  const openCamPreviewFromQueue = useCallback(
    async (
      prog: {
        requestId?: unknown;
        requestMongoId?: unknown;
        s3Key?: unknown;
        bridgePath?: unknown;
        s3Bucket?: unknown;
        name?: unknown;
        clinicName?: unknown;
        patientName?: unknown;
        tooth?: unknown;
        lotNumber?: unknown;
        caseInfos?: unknown;
      },
      machineId: string,
    ) => {
      const requestId = String(prog?.requestId || "").trim();
      const requestMongoId = String(prog?.requestMongoId || "").trim();
      const blocked = blockedCamPreviewReopenRef.current;
      if (
        blocked &&
        ((requestId && blocked.requestId === requestId) ||
          (requestMongoId && blocked.requestMongoId === requestMongoId))
      ) {
        if (Date.now() <= Number(blocked.untilMs || 0)) {
          return;
        }
      }
      blockedCamPreviewReopenRef.current = null;
      if (!requestId) {
        toast({
          title: "미리보기 불가",
          description: "의뢰번호를 찾을 수 없습니다.",
          variant: "destructive",
        });
        return;
      }
      setCamPreviewMachineId(String(machineId || "").trim());
      setCamPreviewProgram(prog || null);

      const queueCaseInfos =
        prog?.caseInfos && typeof prog.caseInfos === "object"
          ? (prog.caseInfos as Record<string, unknown>)
          : {};
      const queueLot =
        prog?.lotNumber && typeof prog.lotNumber === "object"
          ? (prog.lotNumber as Record<string, unknown>)
          : {};

      const queueRnd =
        prog?.rnd && typeof prog.rnd === "object"
          ? (prog.rnd as Record<string, unknown>)
          : {};
      const queueHex = String(
        queueRnd?.manufacturerHexRotation ||
          queueCaseInfos?.manufacturerHexRotation ||
          queueCaseInfos?.finalHexRotation ||
          "",
      ).trim();

      const previewReq = {
        _id: String(prog?.requestMongoId || "").trim() || undefined,
        requestId,
        clinicName: String(prog?.clinicName || "").trim(),
        patientName: String(prog?.patientName || "").trim(),
        tooth: String(prog?.tooth || "").trim(),
        shippingMode: prog?.shippingMode ?? null,
        finalShipping: prog?.finalShipping ?? null,
        originalShipping: prog?.originalShipping ?? null,
        estimatedShipYmd: (() => {
          const ymd = String(
            prog?.estimatedShipYmd ||
              (prog as any)?.timeline?.estimatedShipYmd ||
              "",
          ).trim();
          return ymd || null;
        })(),
        timeline: (() => {
          const ymd = String(
            prog?.estimatedShipYmd ||
              (prog as any)?.timeline?.estimatedShipYmd ||
              "",
          ).trim();
          return ymd ? { estimatedShipYmd: ymd } : undefined;
        })(),
        lotNumber: {
          ...(queueLot || {}),
        },
        rnd: queueHex
          ? { manufacturerHexRotation: queueHex }
          : undefined,
        caseInfos: {
          ...(queueCaseInfos || {}),
          clinicName:
            String(queueCaseInfos?.clinicName || "").trim() ||
            String(prog?.clinicName || "").trim(),
          patientName:
            String(queueCaseInfos?.patientName || "").trim() ||
            String(prog?.patientName || "").trim(),
          tooth:
            String(queueCaseInfos?.tooth || "").trim() ||
            String(prog?.tooth || "").trim(),
          designSoftware:
            String(queueCaseInfos?.designSoftware || "").trim() || undefined,
          manufacturerHexRotation:
            String(queueCaseInfos?.manufacturerHexRotation || "").trim() ||
            queueHex ||
            undefined,
          finalHexRotation:
            String(queueCaseInfos?.finalHexRotation || "").trim() || undefined,
          requestorHexRotation:
            String(queueCaseInfos?.requestorHexRotation || "").trim() ||
            undefined,
          ncFile: {
            s3Key: String(prog?.s3Key || "").trim(),
            filePath: String(prog?.bridgePath || "").trim(),
            s3Bucket: String(prog?.s3Bucket || "").trim(),
          },
        },
      } as unknown as ManufacturerRequest;

      await handleOpenPreview(previewReq);
    },
    [handleOpenPreview, toast],
  );

  const handleOpenNextRequestFromCamPreview = useCallback(
    async (currentRequestId: string): Promise<boolean> => {
      if (!token) return false;
      const normalizedCurrentRequestId = String(currentRequestId || "").trim();
      const machineId = String(camPreviewMachineId || activeMachineId || "").trim();
      if (!normalizedCurrentRequestId || !machineId) return false;

      const normalizedCurrentMongoId = String(
        (camPreviewFiles?.request as any)?._id || "",
      ).trim();

      try {
        const qRes = await fetch("/api/cnc-machines/queues", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const qBody = await qRes.json().catch(() => ({}));
        if (!qRes.ok || (qBody as { success?: boolean })?.success === false) {
          return false;
        }

        const map =
          qBody?.data && typeof qBody.data === "object" ? qBody.data : {};
        setQueueMap(map);

        const queue = Array.isArray((map as any)?.[machineId])
          ? ((map as any)[machineId] as Array<any>)
          : [];

        const getRequestId = (item: any) => String(item?.requestId || "").trim();
        const getMongoId = (item: any) =>
          String(item?.requestMongoId || item?._id || "").trim();

        const currentIndex = queue.findIndex((item) => {
          const rid = getRequestId(item);
          if (rid && rid === normalizedCurrentRequestId) return true;
          const mid = getMongoId(item);
          return !!(normalizedCurrentMongoId && mid === normalizedCurrentMongoId);
        });

        if (currentIndex < 0 || currentIndex >= queue.length - 1) {
          return false;
        }

        const nextProg: any = queue[currentIndex + 1] ?? null;

        const isSameAsCurrent = (item: any) => {
          const rid = getRequestId(item);
          const mid = getMongoId(item);
          if (rid && rid === normalizedCurrentRequestId) return true;
          if (normalizedCurrentMongoId && mid === normalizedCurrentMongoId) return true;
          return false;
        };

        if (!nextProg || isSameAsCurrent(nextProg)) {
          return false;
        }

        if (!nextProg) return false;

        await openCamPreviewFromQueue(nextProg, machineId);
        return true;
      } catch {
        return false;
      }
    },
    [
      token,
      camPreviewMachineId,
      activeMachineId,
      camPreviewFiles,
      setQueueMap,
      openCamPreviewFromQueue,
    ],
  );

  const handleSaveAnodizingEnabledOverrideFromCamPreview = useCallback(
    async (req: ManufacturerRequest, nextValue: boolean) => {
      if (!token) return;

      let requestMongoId = String(req?._id || "").trim();
      const requestId = String(req?.requestId || "").trim();

      if (!requestMongoId && requestId) {
        const summaryRes = await fetch(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/summary`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const summaryBody = await summaryRes.json().catch(() => ({}));
        requestMongoId = String(summaryBody?.data?._id || "").trim();
      }

      if (!requestMongoId) {
        throw new Error("의뢰 식별값이 없어 아노다이징을 저장할 수 없습니다.");
      }

      const prevValue =
        typeof (camPreviewFiles?.request as any)?.caseInfos?.anodizingEnabled ===
        "boolean"
          ? Boolean((camPreviewFiles.request as any).caseInfos.anodizingEnabled)
          : null;

      setCamPreviewFiles((prev) => {
        const currentReq = prev?.request || null;
        if (!currentReq) return prev;
        return {
          ...prev,
          request: {
            ...currentReq,
            _id: requestMongoId,
            caseInfos: {
              ...(currentReq.caseInfos || {}),
              anodizingEnabled: nextValue,
            },
          },
        };
      });

      try {
        const res = await fetch(
          `/api/requests/${encodeURIComponent(requestMongoId)}/anodizing-override`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ anodizingEnabled: nextValue }),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || (body as { success?: boolean })?.success === false) {
          throw new Error(
            (body as { message?: string })?.message ||
              "아노다이징 여부 저장에 실패했습니다.",
          );
        }

        const savedValue =
          typeof (body as { data?: { anodizingEnabled?: unknown } })?.data
            ?.anodizingEnabled === "boolean"
            ? Boolean(
                (body as { data?: { anodizingEnabled?: boolean } }).data
                  ?.anodizingEnabled,
              )
            : nextValue;

        setCamPreviewFiles((prev) => {
          const currentReq = prev?.request || null;
          if (!currentReq) return prev;
          return {
            ...prev,
            request: {
              ...currentReq,
              _id: requestMongoId,
              caseInfos: {
                ...(currentReq.caseInfos || {}),
                anodizingEnabled: savedValue,
              },
            },
          };
        });
      } catch (error) {
        setCamPreviewFiles((prev) => {
          const currentReq = prev?.request || null;
          if (!currentReq) return prev;
          const nextCaseInfos = { ...(currentReq.caseInfos || {}) } as Record<
            string,
            unknown
          >;
          if (typeof prevValue === "boolean") {
            nextCaseInfos.anodizingEnabled = prevValue;
          } else {
            delete nextCaseInfos.anodizingEnabled;
          }
          return {
            ...prev,
            request: {
              ...currentReq,
              caseInfos: nextCaseInfos as any,
            },
          };
        });
        throw error;
      }
    },
    [token, camPreviewFiles],
  );

  const handleOpenCodeEditorFromCamPreview = useCallback(
    async (req: ManufacturerRequest) => {
      const machineId = String(camPreviewMachineId || activeMachineId || "").trim();
      if (!machineId) {
        toast({
          title: "코드 에디터 열기 실패",
          description: "장비를 식별할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const nc = (req as any)?.caseInfos?.ncFile || {};
      const fallback = camPreviewProgram || {};
      const bridgePath = String(nc?.filePath || fallback?.bridgePath || "").trim();
      const s3Key = String(nc?.s3Key || fallback?.s3Key || "").trim();
      const s3Bucket = String(nc?.s3Bucket || fallback?.s3Bucket || "").trim();
      const requestId = String(req?.requestId || fallback?.requestId || "").trim();

      const prog = {
        programNo: null,
        name: String(fallback?.name || requestId || "NC 코드"),
        source: bridgePath ? "bridge_store" : s3Key ? "s3" : "db",
        bridgePath,
        s3Key,
        s3Bucket,
        requestId,
        headType: 1,
      };

      try {
        setReopenCamPreviewOnEditorClose(true);
        setCamPreviewOpen(false);
        await openProgramDetailForMachining(prog, machineId);
      } catch (error) {
        setReopenCamPreviewOnEditorClose(false);
        setCamPreviewOpen(true);
        toast({
          title: "코드 에디터 열기 실패",
          description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [
      camPreviewMachineId,
      activeMachineId,
      camPreviewProgram,
      openProgramDetailForMachining,
      toast,
    ],
  );

  const handleCloseProgramEditor = useCallback(() => {
    closeProgramEditor();
    if (reopenCamPreviewOnEditorClose) {
      setReopenCamPreviewOnEditorClose(false);
      setCamPreviewOpen(true);
    }
  }, [closeProgramEditor, reopenCamPreviewOnEditorClose]);

  const {
    machineInfoOpen,
    setMachineInfoOpen,
    machineInfoLoading,
    machineInfoError,
    machineInfoClearing,
    machineInfoProgram,
    machineInfoAlarms,
    openMachineInfo,
    clearMachineAlarms,
  } = useCncDashboardMachineInfo({ token, toast });

  const { tempModalOpen, tempModalBody, setTempModalOpen, openTempDetail } =
    useCncTempPanel({
      callRaw,
      setError: setPanelError,
      setTempHealth: (uid, level) => {
        setTempHealthMap((prev) => ({
          ...prev,
          [uid]: resolveMachineActionLevel(level),
        }));
      },
      setTempTooltip: (uid, msg) => {
        setTempTooltipMap((prev) => ({ ...prev, [uid]: msg }));
      },
    });

  // 가공보드에서도 슬롯 메타/통계 + 교체 워크플로우 지원
  const {
    toolSlots,
    machiningStats,
    loadToolSlots,
    beginToolRemoval,
    completeToolReplacement,
    updateToolSlotMeta,
    addToolSlot,
    deleteToolSlot,
    clearToolSlots,
  } = useCncToolSlots({
    workUid: toolWorkUid,
    callRaw,
    ensureCncWriteAllowed,
    setError: setPanelError,
  });

  useEffect(() => {
    if (toolWorkUid) {
      void loadToolSlots();
    }
  }, [toolWorkUid, loadToolSlots]);

  const {
    modalOpen,
    modalTitle,
    modalBody,
    toolLifeDirty,
    setModalOpen,
    openToolOffsetEditor,
    handleToolLifeSaveConfirm,
    openToolDetailWithSlots,
    openUsageStatsModal,
  } = useCncToolPanels({
    workUid: toolWorkUid,
    callRaw,
    ensureCncWriteAllowed,
    setError: setPanelError,
    setToolHealth: (level) => {
      if (!toolWorkUid) return;
      setToolHealthMap((prev) => ({
        ...prev,
        [toolWorkUid]: resolveMachineActionLevel(level),
      }));
    },
    setToolTooltip: (msg) => {
      if (!toolWorkUid) return;
      setToolTooltipMap((prev) => ({ ...prev, [toolWorkUid]: msg }));
    },
    toolSlots,
    machiningStats,
    onBeginToolRemoval: beginToolRemoval,
    onCompleteToolReplacement: completeToolReplacement,
    onUpdateToolSlotMeta: updateToolSlotMeta,
    onAddTool: addToolSlot,
    onReloadToolSlots: loadToolSlots,
    onDeleteTool: deleteToolSlot,
    onClearAllTools: clearToolSlots,
  });

  useEffect(() => {
    if (!panelError) return;
    toast({
      title: "CNC 작업 실패",
      description: panelError,
      variant: "destructive",
    });
    setPanelError(null);
  }, [panelError, toast]);

  const openToolDetailWithSlotsRef = useRef(openToolDetailWithSlots);
  openToolDetailWithSlotsRef.current = openToolDetailWithSlots;

  const openToolStatusForMachine = useCallback(
    async (machine: any) => {
      const uid = String(machine?.uid || "").trim();
      if (!uid) return;
      // 공구 등록 모달이 stale workUid("")를 붙잡지 않도록 장비 선택을 즉시 반영한다.
      flushSync(() => {
        setToolWorkUid(uid);
      });
      // 슬롯을 먼저 맞춘 뒤 패널을 연다.
      // (템플릿 적용 후 리프레시 시 빈 화면 + "이미 등록됨" 모순/먹통 방지)
      let slots: Awaited<ReturnType<typeof loadToolSlots>> = [];
      try {
        slots = await loadToolSlots();
      } catch {
        slots = [];
      }
      try {
        const res = await callRaw(uid, "GetToolLifeInfo");
        const data: any = res?.data ?? res;
        const toolLife =
          data?.machineToolLife?.toolLife ??
          data?.machineToolLife?.toolLifeInfo ??
          [];
        const toolingSummary =
          data?.machineToolLife?.toolingSummary ||
          machine?.toolingSummary ||
          null;
        const replacementHistory =
          data?.machineToolLife?.replacementHistory ||
          machine?.tooling?.replacementHistory ||
          [];
        const observations =
          data?.machineToolLife?.observations ||
          machine?.tooling?.observations ||
          [];
        const level = resolveMachineActionLevel(toolingSummary?.alertLevel);
        setToolHealthMap((prev) => ({ ...prev, [uid]: level }));
        setToolTooltipMap((prev) => ({
          ...prev,
          [uid]: buildToolSummaryTooltip(toolingSummary),
        }));
        openToolDetailWithSlotsRef.current(
          toolLife,
          level as any,
          {
            toolingSummary,
            replacementHistory,
            observations,
          },
          slots,
        );
      } catch (e: any) {
        setPanelError(e?.message || "공구 상태 조회 중 오류가 발생했습니다.");
      }
    },
    [callRaw, loadToolSlots],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!form?.uid) return;
    await handleDeleteMachine(form.uid);
    setDeleteConfirmOpen(false);
    setAddModalOpen(false);
  }, [form?.uid, handleDeleteMachine, setAddModalOpen]);

  const requestToggleMachineAuto = useCallback(
    (uid: string, next: boolean) => {
      void updateMachineAuto(uid, next);
    },
    [updateMachineAuto],
  );

  const triggerAnodizingOffMachining = useCallback(async () => {
    if (!token || anodizingOffTriggering) return;

    // "아노 X 가공" 버튼 정책:
    // - 대기열에서 아노다이징 OFF(caseInfos.anodizingEnabled===false) 건이 있는 장비만 대상으로 삼는다.
    // - 각 장비에 대해 mode=anodizing-off 트리거를 보내 OFF 묶음 가공을 시작한다.
    // - 백엔드는 OFF 건만 선택해서 시작하고, 완료 시 다음 OFF 건을 연속으로 이어서 처리한다.
    const targetMachineIds = (Array.isArray(machines) ? machines : [])
      .map((m) => String((m as { uid?: string } | null)?.uid || "").trim())
      .filter((uid) => {
        if (!uid || uid === "unassigned") return false;
        const machineQueue = Array.isArray(queueMap?.[uid])
          ? (queueMap[uid] as QueueItem[])
          : [];

        return machineQueue.some((item) => {
          if (
            (item as { caseInfos?: { anodizingEnabled?: boolean } })?.caseInfos
              ?.anodizingEnabled !== false
          ) {
            return false;
          }
          const recordStatus = String(item?.machiningRecord?.status || "")
            .trim()
            .toUpperCase();
          // 이미 RUNNING/PROCESSING인 건은 대기건이 아니므로 제외
          return !(recordStatus === "RUNNING" || recordStatus === "PROCESSING");
        });
      });

    if (targetMachineIds.length === 0) {
      toast({
        title: "대상 없음",
        description: "대기 중인 아노다이징 X 가공 건이 없습니다.",
      });
      return;
    }

    setAnodizingOffTriggering(true);
    try {
      const results = await Promise.allSettled(
        targetMachineIds.map(async (mid) => {
          const res = await fetch(
            `/api/cnc-machines/machining/auto-trigger/${encodeURIComponent(mid)}?mode=anodizing-off`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            },
          );
          const body = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            message?: string;
            error?: string;
          };
          if (!res.ok || body?.success === false) {
            throw new Error(
              body?.message || body?.error || "아노 X 가공 시작 실패",
            );
          }
          return mid;
        }),
      );

      const okCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - okCount;
      toast({
        title: "아노 X 가공 시작",
        description: `성공 ${okCount}대, 실패 ${failCount}대`,
        variant: failCount > 0 ? "destructive" : undefined,
      });
    } finally {
      setAnodizingOffTriggering(false);
    }
  }, [anodizingOffTriggering, machines, queueMap, toast, token]);

  const displayMachines = useMemo(() => {
    const getMachineOrder = (
      machine: { uid?: string; name?: string } | null | undefined,
    ) => {
      const candidates = [machine?.uid, machine?.name]
        .map((v) => String(v || "").trim())
        .filter(Boolean);
      for (const text of candidates) {
        const matched = text.match(/(\d+)/);
        if (!matched) continue;
        const value = Number(matched[1]);
        if (Number.isFinite(value)) return value;
      }
      return Number.POSITIVE_INFINITY;
    };

    return (Array.isArray(filteredMachines) ? filteredMachines : [])
      .filter(
        (m) =>
          String((m as { uid?: string } | null | undefined)?.uid || "").trim() !==
          "unassigned",
      )
      .sort((a, b) => {
        const aOrder = getMachineOrder(
          a as { uid?: string; name?: string } | null | undefined,
        );
        const bOrder = getMachineOrder(
          b as { uid?: string; name?: string } | null | undefined,
        );

        if (aOrder !== bOrder) return aOrder - bOrder;

        const aUid = String((a as { uid?: string } | null | undefined)?.uid || "").trim();
        const bUid = String((b as { uid?: string } | null | undefined)?.uid || "").trim();
        return aUid.localeCompare(bUid, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
  }, [filteredMachines]);

  const unassignedQueue = useMemo(
    () =>
      Array.isArray(queueMap?.unassigned)
        ? (queueMap.unassigned as QueueItem[])
        : [],
    [queueMap],
  );

  const unassignedHead = unassignedQueue[0] || null;
  const unassignedRest = unassignedQueue.slice(1);
  const hasUnassigned = unassignedQueue.length > 0;

  const materialAlertByMachine = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const alert of machiningAlerts || []) {
      const mid = String((alert as any)?.machineId || "").trim();
      if (!mid) continue;
      const code = String((alert as any)?.errorCode || "").trim();
      const msg = String((alert as any)?.message || "").trim();
      const text = String((alert as any)?.alarmText || "").trim();
      if (
        isMaterialExhaustedAlarmText(code) ||
        isMaterialExhaustedAlarmText(msg) ||
        isMaterialExhaustedAlarmText(text)
      ) {
        map[mid] = true;
      }
    }
    return map;
  }, [machiningAlerts]);

  const getLotShortCode = useCallback((slot?: QueueItem | null) => {
    return String(slot?.lotNumber?.value || "")
      .trim()
      .replace(/^CA(P)?/i, "")
      .slice(-3)
      .toUpperCase();
  }, []);

  return (
    <div
      className="space-y-4"
      onMouseDownCapture={handleBoardClickCapture}
      onTouchStartCapture={handleBoardClickCapture}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isMockFromBackend != null ? (
            <Badge
              variant="outline"
              className={`shrink-0 border px-2 py-0.5 text-[11px] font-semibold ${
                isMockFromBackend === true
                  ? "border-primary-muted bg-primary-soft text-primary-strong"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
              title={
                isMockFromBackend === true ? "더미(모의) 가공" : "실제 가공"
              }
            >
              {isMockFromBackend === true ? "MOCK" : "REAL"}
            </Badge>
          ) : null}

          <div className="truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
            {statusRefreshing
              ? "장비 상태 조회중…"
              : statusRefreshError
                ? `장비 상태 조회 실패${
                    statusRefreshErroredAt ? ` ${statusRefreshErroredAt}` : ""
                  } (${statusRefreshError})`
                : statusRefreshedAt
                  ? `장비 상태 갱신 ${statusRefreshedAt}`
                  : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasUnassigned ? (
            <button
              type="button"
              className="min-w-0 max-w-[560px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-slate-600 hover:bg-slate-50"
              onClick={() => {
                setUnassignedModalOpen(true);
              }}
              title={`미배정 ${unassignedQueue.length}건`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  미배정 {unassignedQueue.length}
                </span>
                <div className="min-w-0 flex-1 truncate text-xs text-slate-800">
                  {unassignedHead ? (
                    <MachiningRequestLabel
                      density="compact"
                      business={unassignedHead.businessName}
                      clinicName={unassignedHead.clinicName}
                      patientName={unassignedHead.patientName}
                      tooth={(unassignedHead as any)?.tooth}
                      requestId={unassignedHead.requestId}
                      hideRequestId
                      lotShortCode={getLotShortCode(unassignedHead)}
                      caseInfos={(unassignedHead as any)?.caseInfos}
                      shippingSource={
                        unassignedHead?.requestId ? unassignedHead : undefined
                      }
                      {...buildLabelExtraProps(unassignedHead)}
                    />
                  ) : (
                    "미배정"
                  )}
                </div>
                {unassignedRest.length > 0 ? (
                  <span className="shrink-0 text-[11px] font-medium text-slate-500">
                    외 {unassignedRest.length}
                  </span>
                ) : null}
              </div>
            </button>
          ) : null}
          {machiningAlerts.length > 0 ? (
            <div
              className="flex items-center gap-1 rounded-lg border border-destructive-muted bg-destructive-soft px-2 py-1 text-[11px] font-semibold text-destructive"
              title={machiningAlerts
                .slice(0, 3)
                .map(
                  (it: any) =>
                    `${it.machineId}${it.requestId ? ` / ${it.requestId}` : ""}${it.errorCode ? ` (${it.errorCode})` : ""}`,
                )
                .join("\n")}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Alert {machiningAlerts.length}</span>
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded text-destructive hover:bg-destructive-soft"
                onClick={() => clearMachiningAlerts()}
                title="알람 뱃지 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          {expressRebalanceAlert &&
          Array.isArray(expressRebalanceAlert.moved) &&
          expressRebalanceAlert.moved.length > 0 ? (
            <div className="flex items-center gap-1 rounded-lg border border-primary-muted bg-primary-soft px-2 py-1 text-[11px] font-semibold text-primary-strong">
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:underline"
                onClick={() => setExpressRebalanceModalOpen(true)}
                title={String(
                  expressRebalanceAlert.summary || "빠른 가공 재배치",
                )}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>빠른 재배치 {expressRebalanceAlert.moved.length}</span>
              </button>
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded text-primary-strong hover:bg-primary-muted/50"
                onClick={() => clearExpressRebalanceAlert()}
                title="재배치 Alert 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setPriorityRulesModalOpen(true)}
            title="가공 우선순위 룰 보기"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            우선순위
          </button>

          <button
            type="button"
            disabled={anodizingOffTriggering}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              void triggerAnodizingOffMachining();
            }}
            title="대기 중인 아노다이징 X 의뢰건 묶음 가공 시작"
          >
            {anodizingOffTriggering ? "시작 중…" : "아노 X 가공"}
          </button>
          <button
            type="button"
            disabled={siFetching}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => void openSelfInspectionQueue()}
          >
            {siFetching ? "로딩…" : "자주검사"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              void reassignProductionQueues();
            }}
          >
            재배정
          </button>
          <div
            className="flex items-center gap-2"
            title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
          >
            <span className="text-xs font-semibold text-slate-700">
              전체 자동
            </span>
            <button
              type="button"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                globalAutoEnabled ? "bg-primary" : "bg-slate-300"
              }`}
              onClick={() => {
                void setGlobalAutoEnabled(!globalAutoEnabled);
              }}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  globalAutoEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 p-4 pb-8">
        {displayMachines.map((m) => {
          const statusFromStore = statusByUid?.[m.uid];
          const local = machineStatusMap?.[m.uid] ?? null;
          const mergedStatus: MachineStatus | null = local
            ? {
                ...local,
                status: String(
                  statusFromStore != null ? statusFromStore : local.status,
                ).trim(),
              }
            : statusFromStore != null
              ? {
                  uid: m.uid,
                  status: String(statusFromStore).trim(),
                }
              : null;

          const isActive = activeMachineId === m.uid;
          const machineQueue = Array.isArray(queueMap?.[m.uid])
            ? queueMap[m.uid]
            : [];
          const nowPlayingHint = nowPlayingHintMap?.[m.uid] || null;
          const machiningActive =
            nowPlayingHint != null ||
            machineQueue.some((item) => {
              const recordStatus = String(item?.machiningRecord?.status || "")
                .trim()
                .toUpperCase();
              if (recordStatus === "RUNNING" || recordStatus === "PROCESSING") {
                return true;
              }
              const startedAt = item?.machiningRecord?.startedAt
                ? new Date(item.machiningRecord.startedAt).getTime()
                : 0;
              const completedAt = item?.machiningRecord?.completedAt
                ? new Date(item.machiningRecord.completedAt).getTime()
                : 0;
              return startedAt > 0 && completedAt <= 0;
            });

          const toolSummary = (m as any)?.toolingSummary || null;
          const toolHealth =
            toolHealthMap[m.uid] ||
            resolveMachineActionLevel(toolSummary?.alertLevel || null);
          const toolTooltip =
            toolTooltipMap[m.uid] || buildToolSummaryTooltip(toolSummary);
          const tempHealth = tempHealthMap[m.uid] || "unknown";
          const tempTooltip = tempTooltipMap[m.uid] || "온도 정보 확인";

          return (
            <MachineQueueCard
              key={m.uid}
              machineId={m.uid}
              machineName={m.name}
              machine={m}
              queue={machineQueue}
              machiningElapsedSeconds={
                typeof machiningElapsedSecondsMap?.[m.uid] === "number"
                  ? machiningElapsedSecondsMap[m.uid]
                  : null
              }
              lastCompleted={lastCompletedMap?.[m.uid] || null}
              nowPlayingHint={nowPlayingHint}
              onOpenRequestLog={(requestId) => setEventLogRequestId(requestId)}
              onUploadFiles={(files) => {
                void uploadMachineFiles(m.uid, files, {
                  expectedMaterialDiameter: resolveMachineMaterialDiameter(m),
                  machineName: String(m?.name || m?.uid || ""),
                  onDone: () => {
                    void loadProductionQueueForMachine(m.uid);
                  },
                }).catch(() => {
                  // useManUpload 훅에서 토스트 처리
                });
              }}
              autoEnabled={m.allowAutoMachining === true}
              machiningActive={machiningActive}
              onToggleAuto={(next) => {
                requestToggleMachineAuto(m.uid, next);
              }}
              onToggleRequestAssign={(next) => {
                void updateMachineRequestAssign(m.uid, next);
              }}
              machineStatus={mergedStatus}
              statusRefreshing={statusRefreshing}
              isActive={isActive}
              onSelect={() => {
                setActiveMachineId(m.uid);
              }}
              onOpenReservation={() => openReservationForMachine(m.uid)}
              onOpenProgramCode={(prog, machineId) => {
                void openCamPreviewFromQueue(prog, machineId);
              }}
              onRollbackNowPlaying={(requestId, mid) => {
                void rollbackRequestInQueue(mid, requestId);
              }}
              onRollbackNextUp={(requestId, mid) => {
                void rollbackRequestInQueue(mid, requestId);
              }}
              onRollbackCompleted={(requestId, mid) => {
                void rollbackRequestInQueue(mid, requestId);
              }}
              onApproveFromRollback={(requestMongoId) => {
                void approveMachiningFromRollback(requestMongoId);
              }}
              onOpenCompleted={(mid, name) => {
                setCompletedModalMachineId(String(mid || "").trim());
                setCompletedModalTitle(
                  `${String(name || mid || "").trim()} 가공 완료`,
                );
                setCompletedModalOpen(true);
              }}
              onOpenMaterial={() => {
                setMaterialModalTarget(m);
                setMaterialModalOpen(true);
              }}
              onOpenMachineInfo={() => {
                void openMachineInfo(m.uid);
              }}
              onOpenQueueManager={() => {
                void loadProductionQueueForMachine(m.uid);
              }}
              onOpenTemperature={() => {
                void openTempDetail(m.uid);
              }}
              onOpenToolStatus={() => {
                void openToolStatusForMachine(m);
              }}
              onOpenSettings={() => {
                handleEditMachine(m);
              }}
              tempHealth={tempHealth}
              toolHealth={toolHealth}
              tempTooltip={tempTooltip}
              toolTooltip={toolTooltip}
              materialNeedsReplacement={materialAlertByMachine[m.uid] === true}
              materialAlertTooltip="소재 교체 필요"
            />
          );
        })}
      </div>

      <CncTempDetailModal
        open={tempModalOpen}
        body={tempModalBody}
        onRequestClose={() => setTempModalOpen(false)}
      />

      <CncToolStatusModal
        open={modalOpen}
        title={modalTitle}
        body={modalBody}
        toolLifeDirty={toolLifeDirty}
        health={
          toolHealthMap[toolWorkUid] === "alarm"
            ? "alarm"
            : toolHealthMap[toolWorkUid] === "warn"
              ? "warn"
              : toolHealthMap[toolWorkUid] === "ok"
                ? "ok"
                : "unknown"
        }
        onRequestClose={() => setModalOpen(false)}
        onOpenToolOffsetEditor={() => openToolOffsetEditor()}
        onSave={handleToolLifeSaveConfirm}
        onOpenUsageStats={openUsageStatsModal}
      />

      <Dialog open={machineInfoOpen} onOpenChange={setMachineInfoOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>현재 프로그램 / 알람 정보</DialogTitle>
            <DialogDescription>
              장비의 현재 프로그램과 알람 상태를 확인합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-slate-700">
            {machineInfoLoading ? (
              <div className="text-slate-500">불러오는 중…</div>
            ) : machineInfoError ? (
              <div className="text-destructive">{machineInfoError}</div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-500">
                    현재 프로그램
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900">
                    {machineInfoProgram?.programName ||
                      machineInfoProgram?.programNo ||
                      "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-500">
                      알람
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void clearMachineAlarms();
                      }}
                      disabled={machineInfoClearing}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {machineInfoClearing ? "해제 중..." : "알람 해제"}
                    </button>
                  </div>
                  {Array.isArray(machineInfoAlarms) &&
                  machineInfoAlarms.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {machineInfoAlarms.map((alarm: any, idx: number) => (
                        <div
                          key={`${String(alarm?.code || idx)}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                        >
                          <div className="font-semibold text-slate-900">
                            {alarm?.code ||
                              alarm?.alarmNo ||
                              `Alarm ${idx + 1}`}
                          </div>
                          <div className="mt-1">
                            {alarm?.message ||
                              alarm?.description ||
                              "알람 메시지 없음"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      현재 알람이 없습니다.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SelfInspectionReportModal
        open={siOpen}
        onOpenChange={(next) => {
          setSiOpen(next);
        }}
        item={siQueue[siIdx] ?? null}
        queueInfo={
          siQueue.length > 1
            ? { current: siIdx + 1, total: siQueue.length }
            : undefined
        }
        onPrev={
          siIdx > 0
            ? () =>
                setSiIdx((i) => {
                  const next = Math.max(0, i - 1);
                  saveSiRequestId(siQueue, next);
                  return next;
                })
            : undefined
        }
        onNext={
          siIdx + 1 < siQueue.length
            ? () =>
                setSiIdx((i) => {
                  const next = i + 1;
                  saveSiRequestId(siQueue, next);
                  return next;
                })
            : undefined
        }
        onFindByLotNumber={findSelfInspectionByLotNumber}
      />

      <CompletedMachiningRecordsModal
        open={completedModalOpen}
        onOpenChange={setCompletedModalOpen}
        machineId={completedModalMachineId}
        title={completedModalTitle}
        pageSize={5}
        includeRequests={true}
        onRollbackRequest={(requestId, machineId) => {
          void rollbackRequestInQueue(machineId, requestId);
        }}
      />

      {eventLogRequestId ? (
        <CncEventLogModal
          open={!!eventLogRequestId}
          mode={{ kind: "request", requestId: eventLogRequestId }}
          onOpenChange={(next) => {
            if (!next) setEventLogRequestId(null);
          }}
        />
      ) : null}

      <CncPlaylistDrawer
        open={playlistOpen}
        title={playlistTitle}
        jobs={playlistJobs}
        readOnly={false}
        deleteVariant="worksheet"
        onApproveFromRollback={(requestMongoId) => {
          void approveMachiningFromRollback(requestMongoId);
        }}
        onClose={() => {
          setPlaylistOpen(false);
        }}
        onOpenCode={(jobId) => {
          const mid = String(playlistMachineId || "").trim();
          if (!mid) return;
          const job = (Array.isArray(playlistJobs) ? playlistJobs : []).find(
            (j) => j.id === jobId,
          );
          if (!job) return;
          const queueItem = (
            Array.isArray(queueMap?.[mid]) ? queueMap[mid] : []
          ).find(
            (q) =>
              String(q?.requestId || "").trim() ===
              String(job.requestId || job.id || "").trim(),
          ) as QueueItem | undefined;

          const nc = queueItem?.ncFile ?? null;
          const bridgePath = String(
            job.bridgePath || nc?.filePath || "",
          ).trim();
          const s3Key = String(job.s3Key || nc?.s3Key || "").trim();
          const s3Bucket = String(job.s3Bucket || nc?.s3Bucket || "").trim();

          const prog: any = {
            programNo: job.programNo ?? null,
            no: job.programNo ?? null,
            name: job.name,
            source: job.source || "db",
            s3Key,
            s3Bucket,
            bridgePath,
            requestId: job.requestId || job.id || "",
            requestMongoId:
              job.requestMongoId ||
              (queueItem as any)?.requestMongoId ||
              "",
            clinicName: queueItem?.clinicName || "",
            patientName: queueItem?.patientName || "",
            tooth: (queueItem as any)?.tooth || "",
            lotNumber: (queueItem as any)?.lotNumber || null,
            caseInfos: (queueItem as any)?.caseInfos || null,
            shippingMode:
              job.shippingMode ||
              queueItem?.shippingMode ||
              null,
            finalShipping: queueItem?.finalShipping || null,
            originalShipping: queueItem?.originalShipping || null,
            headType: 1,
          };
          setPlaylistOpen(false);
          void openCamPreviewFromQueue(prog, mid);
        }}
        onDelete={(jobId) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ deleteRequestIds: [jobId] }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "준비로 되돌리기 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "준비로 되돌리기 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onReorder={(nextOrder) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ order: nextOrder }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "순서 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "순서 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onChangeQty={(jobId, qty) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    qtyUpdates: [{ requestId: jobId, qty }],
                  }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "수량 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "수량 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
      />

      <PreviewModal
        open={camPreviewOpen}
        onOpenChange={handleCamPreviewOpenChange}
        previewLoading={camPreviewLoading}
        previewFiles={camPreviewFiles}
        previewNcText={camPreviewNcText}
        previewNcName={camPreviewNcName}
        previewStageUrl={camPreviewStageUrl}
        previewStageName={camPreviewStageName}
        uploading={camPreviewUploading}
        reviewSaving={camPreviewReviewSaving}
        stage="cam"
        isCamStage={true}
        isMachiningStage={false}
        onOpenCodeEditor={handleOpenCodeEditorFromCamPreview}
        onSaveAnodizingEnabledOverride={
          handleSaveAnodizingEnabledOverrideFromCamPreview
        }
        onUpdateReviewStatus={handleUpdateReviewStatus}
        onDeleteCam={handleDeleteCam}
        onDeleteNc={handleDeleteNc}
        onDeleteStageFile={handleDeleteStageFile}
        onUploadCam={handleUploadCam}
        onUploadNc={handleUploadNc}
        onUploadStageFile={handleUploadStageFile}
        onDownloadOriginalStl={handleDownloadOriginalStl}
        onDownloadCamStl={handleDownloadCamStl}
        onDownloadNcFile={handleDownloadNcFile}
        onDownloadStageFile={handleDownloadStageFile}
        onRefreshPreview={handleOpenPreview}
        onOpenNextRequest={handleOpenNextRequestFromCamPreview}
        setSearchParams={setSearchParams}
      />

      {programEditorOpen && programEditorTarget ? (
        <CncProgramEditorPanel
          open={programEditorOpen}
          onClose={handleCloseProgramEditor}
          workUid={workUid}
          selectedProgram={programEditorTarget}
          onLoadProgram={loadProgramCodeForMachining}
          onSaveProgram={saveProgramCode}
          readOnly={isReadOnly}
        />
      ) : null}

      {materialModalTarget && (
        <CncMaterialModal
          open={materialModalOpen}
          onClose={() => {
            setMaterialModalOpen(false);
            setMaterialModalTarget(null);
          }}
          machineId={materialModalTarget.uid}
          machineName={materialModalTarget.name}
          currentMaterial={materialModalTarget.currentMaterial || null}
          maxModelDiameterGroups={
            materialModalTarget.maxModelDiameterGroups || ["12"]
          }
          onReplace={handleReplaceMaterial}
          onAdd={handleAddMaterial}
        />
      )}

      <Dialog open={unassignedModalOpen} onOpenChange={setUnassignedModalOpen}>
        <DialogContent className="w-[95vw] max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-200/80 p-0 gap-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-2xl">
          <DialogHeader className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
              <span>미배정</span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {unassignedQueue.length}건
              </span>
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-slate-500">
              조건에 맞는 장비가 없어 배정되지 않은 의뢰건입니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:px-6">
            {unassignedQueue.map((item, index) => (
              <div
                key={`${String(item.requestMongoId || item.requestId || index)}`}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-semibold text-slate-500">
                        #{index + 1}
                      </div>
                      {getLotShortCode(item) ? (
                        <Badge className="bg-slate-900 text-white border border-slate-900 text-[10px]">
                          {getLotShortCode(item)}
                        </Badge>
                      ) : null}
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 ${
                            String(item.requestId || "").trim()
                              ? ""
                              : "opacity-30 cursor-not-allowed"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rid = String(item.requestId || "").trim();
                            if (!rid) return;
                            void rollbackRequestInQueue(
                              "unassigned",
                              rid,
                              item.requestMongoId,
                            );
                          }}
                          disabled={!String(item.requestId || "").trim()}
                          title="준비로 되돌리기"
                        >
                          <ArrowLeft className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 ${
                            (() => {
                              const rc = Number(
                                (item as any)?.rollbackCount || 0,
                              );
                              const mc =
                                String(
                                  item?.machiningRecord?.status || "",
                                ).toUpperCase() === "COMPLETED";
                              const id = String(
                                item.requestMongoId || "",
                              ).trim();
                              return (rc > 0 || mc) && id;
                            })()
                              ? ""
                              : "opacity-30 cursor-not-allowed"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rc = Number(
                              (item as any)?.rollbackCount || 0,
                            );
                            const mc =
                              String(
                                item?.machiningRecord?.status || "",
                              ).toUpperCase() === "COMPLETED";
                            const id = String(item.requestMongoId || "").trim();
                            if (!(rc > 0 || mc) || !id) return;
                            void approveMachiningFromRollback(id);
                          }}
                          disabled={(() => {
                            const rc = Number(
                              (item as any)?.rollbackCount || 0,
                            );
                            const mc =
                              String(
                                item?.machiningRecord?.status || "",
                              ).toUpperCase() === "COMPLETED";
                            const id = String(item.requestMongoId || "").trim();
                            return !((rc > 0 || mc) && id);
                          })()}
                          title="재가공 없이 승인"
                        >
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 min-w-0">
                      <MachiningRequestLabel
                        density="compact"
                        business={item.businessName}
                        clinicName={item.clinicName}
                        patientName={item.patientName}
                        tooth={(item as any)?.tooth}
                        requestId={item.requestId}
                        hideRequestId
                        lotShortCode={getLotShortCode(item)}
                        caseInfos={(item as any)?.caseInfos}
                        shippingSource={item?.requestId ? item : undefined}
                        {...buildLabelExtraProps(item)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CncMachineManagerModal
        open={addModalOpen}
        mode={addModalMode}
        form={form}
        loading={false}
        onChange={handleChange}
        onRequestClose={() => setAddModalOpen(false)}
        onSubmit={(snapshot) => void handleAddMachine(snapshot)}
        onRequestDelete={() => setDeleteConfirmOpen(true)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="장비 삭제"
        description={`${String(form?.name || form?.uid || "")} 장비를 삭제합니다. 계속할까요?`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ExpressRebalanceAlertModal
        open={expressRebalanceModalOpen}
        onOpenChange={setExpressRebalanceModalOpen}
        alert={expressRebalanceAlert as any}
      />

      <MachiningPriorityRulesModal
        open={priorityRulesModalOpen}
        onOpenChange={setPriorityRulesModalOpen}
        token={token}
      />

      {PinModal}
    </div>
  );
};

export default MachiningQueueBoard;
