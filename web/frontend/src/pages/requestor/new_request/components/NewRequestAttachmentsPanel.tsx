// change-log:
// - 2026-08-19: 업로드 완료 시 파일카드에 「업로드됨」+ 파란 바(첨부 직후 사전 업로드가 보임).
// - 2026-08-19: 파일카드에 백그라운드 업로드 % 표시(기공의뢰 파일페인과 동일).
// - 2026-08-16: 메타 뱃지를 RequestCaseMetaBadges 공용 컴포넌트로.
// - 2026-08-13: 첨부를 PracticeTransferFileDropTarget + useFilePreUpload 진행률바로.
// - 2026-08-11: 어벗생산의뢰 첨부는 STL만 허용(accept·드롭존 문구).
// - 2026-08-11: 상단 버튼·드롭존 카드내 좌우상하 여백 균일(중첩 px 제거, 카드 패딩 SSOT).
// - 2026-08-11: 디자인소프트웨어·아노다이징 뱃지를 파일 용량 오른쪽으로 이동, 축소. 아노 OFF도 동일 secondary 색.
// - 2026-08-21: 아노 툴바 변경 시 기존 카드 뱃지도 NewRequestPage에서 동기화.
// - 2026-08-11: 아노다이징/디자인소프트웨어 기본값 변경은 기존 첨부 카드 뱃지에 미반영(디자인SW는 유지).
// - 2026-08-11: 카드 ETA줄에 아노다이징 뱃지 추가(디자인소프트웨어와 동일). 의뢰건 caseInfos SSOT.
// - 2026-08-11: 좌측 상단에 아노다이징 토글 버튼 추가(디자인소프트웨어 옆). 설정 의뢰 탭에서 이전.
// - 2026-08-09: 구강스캔 묶음 멤버 파일명 오른쪽에도 용량 표시. 크기 판정 3MB 단일 기준.
// - 2026-08-09: 단일 카드 파일명 짧게 truncate + 오른쪽 끝에 파일 크기 표시.
// - 2026-08-09: 구강스캔·어벗디자인 뱃지를 파일명 옆 → ETA줄 3Shape 왼쪽으로 이동(긴 파일명 잘림 방지).
// - 2026-08-09: 드롭존 안내 문구가 항상 1줄이 되도록 가로폭·nowrap 고정.
// - 2026-08-09: 첨부 accept·드롭존 문구를 3D 모델(STL, PLY, OBJ)로 확장.
// - 2026-08-09: 구강스캔 카드 — 환자정보 완료 시 흰 배경, 묶음 헤더에 의뢰 삭제(X).
// - 2026-08-09: 어벗디자인/구강스캔 상단 뱃지 + 호버 즉시 툴팁(생산 vs 디자인+생산).
// - 2026-08-09: 구강스캔(디자인+생산) ETA는 메시 직경 무시(estimateShipDate 리드 1일).
// - 2026-08-09: 우측 신속 비활성 시 카드 신속 버튼도 동일하게 막는다.
// - 2026-08-09: 신속 비활성 스타일을 opacity 대신 명시적 slate로 구분해 요일 변경 후 상태를 분명히 한다.
// - 2026-08-09: 하나로 묶기 옆 선택해제, 카드 좌우 드래그 여유 공간.
// - 2026-08-09: 카드 클릭 모달 — 마키는 드래그 임계 이후에만 시작(클릭 방해 제거).
// - 2026-08-09: 구강스캔 카드 제목을 파일명 환자명/공통문자열로 표시.
// - 2026-08-09: 삭제/연결끊기 아이콘 호버 즉시 툴팁.
// - 2026-08-09: 드롭존 문구 수직 가운데, 구강스캔 파일별 연결끊기 아이콘.
// - 2026-08-09: 드롭존 자동합침 문구 삭제(높이 유지), 목록 4.5장 스크롤.
// - 2026-08-09: 구강스캔 카드 체크박스·재합치기, 라벨 «환자명 [구강스캔]».
// - 2026-08-09: 카드 좌우 여백·3.5장 높이, 합치기 버튼 선택 시 온더플라이, 안내 문구 정리.
// - 2026-08-09: 구강 스캔 합치기 — 파인더식 드래그(마키) 다중 선택.
// - 2026-08-09: 첨부 목록 최대 3.5장 높이, 초과 시 스크롤.
// - 2026-08-09: 묶음 카드 뱃지 «구강스캔», +디자인 제거, 관련 문구 정리.
// - 2026-08-09: 환자 케이스 UI 용어(묶음출고와 구분). 케이스는 항상 디자인+생산(+1영업일) ETA.
// - 2026-08-09: 디자인+생산 환자 케이스 카드(구강 스캔 N개 → 1건) + 수동 합치기/해제.
// - 2026-08-09: 디자인+생산 ETA/신속선택에 productMode(+1영업일) 반영.
// - 2026-08-06: 예상 발송 → 예상 출고 (제조사 출발일).
// - 2026-08-08: 신속 버튼 = 신속 ETA < 묶음 ETA일 때만 활성.
// - 2026-08-08: 신속 ETA를 묶음 파라미터와 분리 계산. 모드 전환 시 출고일 잔류 방지.
// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/new_request/utils/patientGroups.ts
// - web/frontend/src/shared/shipping/estimateShipDate.ts
import { Badge } from "@/components/ui/badge";
import { RequestCaseMetaBadges } from "@/features/requestSettings/RequestCaseMetaBadges";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Calendar, Link2, Link2Off, X } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { PracticeTransferFileDropTarget } from "@/shared/components/practice/PracticeTransferFileDropTarget";
import { RequestSettingsToolbar } from "@/features/requestSettings/RequestSettingsToolbar";
import {
  toTempUploadFileKey,
  type PreUploadFileProgress,
} from "@/shared/hooks/useFilePreUpload";
import type { CaseInfos } from "../hooks/newRequestTypes";
import { useMemo, useState, useEffect, useRef, useCallback, type ReactElement } from "react";
import {
  computeEstimatedShipLabel,
  EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
  isExpressShippingSelectable,
  type LeadTimesMap,
} from "@/shared/shipping/estimateShipDate";
import { useToast } from "@/shared/hooks/use-toast";
import type { AttachmentListItem, PatientFileGroup } from "../utils/patientGroups";
import {
  getPrimaryFileKey,
  isLikelyCustomAbutDesignSize,
  isLikelyOralScanSize,
  resolveOralScanGroupTitle,
} from "../utils/patientGroups";

type ShippingMode = "normal" | "express";

/** 파일 유형 뱃지 → 의뢰 유형 안내 (호버 즉시) */
const ORAL_SCAN_BADGE_TOOLTIP = "커스텀어벗 디자인+생산";
const ABUT_DESIGN_BADGE_TOOLTIP = "커스텀어벗 생산";

const FILE_KIND_BADGE_CLASS =
  "text-[10px] font-medium px-1.5 py-0.5 shrink-0";
const ORAL_SCAN_BADGE_CLASS = `${FILE_KIND_BADGE_CLASS} bg-primary-muted/50 text-primary-strong`;
const ABUT_DESIGN_BADGE_CLASS = `${FILE_KIND_BADGE_CLASS} bg-primary-soft text-primary-strong`;

/** 첨부 카드용 짧은 용량 표기 (예: 0.8MB, 12MB) */
function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
}

const NEW_REQUEST_STL_ACCEPT = ".stl,model/stl,application/sla";

function pickUploadProgress(
  filesForCard: Array<File | undefined>,
  uploadProgress: Record<string, PreUploadFileProgress>,
): PreUploadFileProgress | undefined {
  const rows = filesForCard
    .filter((file): file is File => Boolean(file))
    .map((file) => uploadProgress[toTempUploadFileKey(file)])
    .filter((row): row is PreUploadFileProgress => Boolean(row));
  return (
    rows.find((row) => row.status === "uploading" || row.status === "error") ||
    rows[0]
  );
}

function renderUploadProgressMeta(progress?: PreUploadFileProgress | null) {
  if (!progress) return "";
  if (progress.status === "uploading") {
    const pct = Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)));
    return ` · ${pct}%`;
  }
  if (progress.status === "error") return " · 실패";
  if (progress.status === "done") return " · 업로드됨";
  return "";
}

function renderUploadProgressBar(progress?: PreUploadFileProgress | null) {
  if (!progress) return null;
  if (
    progress.status !== "uploading" &&
    progress.status !== "error" &&
    progress.status !== "done"
  ) {
    return null;
  }
  const barPercent =
    progress.status === "done"
      ? 100
      : Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)));
  return (
    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-slate-100" aria-hidden>
      <div
        className={cn(
          "h-full transition-[width] duration-150 ease-out",
          progress.status === "error"
            ? "bg-destructive"
            : "bg-primary",
        )}
        style={{
          width: `${
            progress.status === "error" ? Math.max(barPercent, 8) : barPercent
          }%`,
        }}
      />
    </div>
  );
}

/** 파일 용량 옆 케이스 메타 뱃지(디자인소프트웨어·아노다이징). 카드 스냅샷만 표시. */
function renderCaseMetaBadges(fileInfo?: CaseInfos | null) {
  return (
    <RequestCaseMetaBadges
      designSoftware={fileInfo?.designSoftware}
      anodizingEnabled={
        typeof fileInfo?.anodizingEnabled === "boolean"
          ? fileInfo.anodizingEnabled
          : null
      }
    />
  );
}

type MarqueeState = {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

const MARQUEE_MOVE_THRESHOLD_PX = 6;

function ImmediateTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="px-2 py-1 text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function clientRectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect,
): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

function isMarqueeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      "button, input, a, label, [data-no-marquee], [role='button']",
    ),
  );
}

type Props = {
  files: File[];
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: (index: number | null) => void;
  fileVerificationStatus: Record<string, boolean>;
  highlightUnverifiedArrows: boolean;
  caseInfosMap?: Record<string, CaseInfos>;
  toNormalizedFileKey: (file: File) => string;
  weeklyBatchDays?: string[];
  leadTimes?: LeadTimesMap | null;
  getEstimatedShipForDiameter: ((
    diameter: number | null,
    shippingMode?: "normal" | "express",
    productMode?: string | null,
  ) => string | null) | null;
  fileDiameters: Record<string, number>;
  handleRemoveFile: (index: number) => void;
  openDetailModal: (index: number) => void;
  handleClearAll: () => void;
  onKeyboardNavigation: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  listContainerRef: React.RefObject<HTMLDivElement | null>;
  onFilesSelected: (files: File[]) => void;
  uploadProgress?: Record<string, PreUploadFileProgress>;
  designSoftwareLabel?: string;
  onOpenDesignSoftwareModal?: () => void;
  anodizingEnabled?: boolean;
  anodizingSaving?: boolean;
  onToggleAnodizing?: () => void;
  onShippingModeChange?: (fileKeys: string[], mode: ShippingMode) => void;
  defaultShippingMode?: ShippingMode;
  /** 우측 신속 카드와 동일 조건. false면 건별 이점이 있어도 신속 비활성 */
  expressSelectableGlobal?: boolean;
  listItems?: AttachmentListItem[];
  onGroupSelectedFiles?: (fileKeys: string[]) => void;
  onUngroup?: (groupId: string) => void;
  onRemoveFileFromGroup?: (fileKey: string) => void;
  /** true: 기공소 — 생산 전용(구강스캔 묶음·파일유형 뱃지 없음) */
  productionOnly?: boolean;
};

function resolveShippingMode(
  info?: CaseInfos,
  defaultMode: ShippingMode = "normal",
): ShippingMode {
  if (info?.shippingMode === "express") return "express";
  if (info?.shippingMode === "normal") return "normal";
  return defaultMode;
}

export function NewRequestAttachmentsPanel({
  files,
  selectedPreviewIndex,
  fileVerificationStatus,
  highlightUnverifiedArrows,
  caseInfosMap,
  toNormalizedFileKey,
  weeklyBatchDays = [],
  leadTimes = null,
  getEstimatedShipForDiameter,
  fileDiameters,
  handleRemoveFile,
  openDetailModal,
  handleClearAll,
  onKeyboardNavigation,
  listContainerRef,
  onFilesSelected,
  uploadProgress = {},
  designSoftwareLabel,
  onOpenDesignSoftwareModal,
  anodizingEnabled = true,
  anodizingSaving = false,
  onToggleAnodizing,
  onShippingModeChange,
  defaultShippingMode = "normal",
  expressSelectableGlobal = true,
  listItems,
  onGroupSelectedFiles,
  onUngroup,
  onRemoveFileFromGroup,
  productionOnly = false,
}: Props) {
  const hasAnyAttachment = files.length > 0;
  const { toast } = useToast();
  const [now, setNow] = useState(() => new Date());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const selectionAnchorKeyRef = useRef<string | null>(null);
  const marqueeSessionRef = useRef<{
    /** 아직 임계 미달 — 클릭으로 모달 열기 허용 */
    pending: boolean;
    active: boolean;
    moved: boolean;
    additive: boolean;
    baseline: Set<string>;
    originX: number;
    originY: number;
    pointerId: number;
  } | null>(null);
  const suppressCardClickRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const alive = new Set(files.map((f) => toNormalizedFileKey(f)));
    setSelectedKeys((prev) => {
      const next = new Set([...prev].filter((k) => alive.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [files, toNormalizedFileKey]);

  const resolvedListItems = useMemo<AttachmentListItem[]>(() => {
    if (listItems) return listItems;
    return files.map((file, fileIndex) => ({
      kind: "file" as const,
      fileKey: toNormalizedFileKey(file),
      fileIndex,
    }));
  }, [listItems, files, toNormalizedFileKey]);

  const selectableUnits = useMemo(() => {
    return resolvedListItems.map((item) => {
      if (item.kind === "group") {
        const primary =
          getPrimaryFileKey(item.group) || item.group.fileKeys[0] || "";
        return { key: primary, fileKeys: [...item.group.fileKeys] };
      }
      return { key: item.fileKey, fileKeys: [item.fileKey] };
    });
  }, [resolvedListItems]);

  const selectedUnitCount = useMemo(
    () =>
      selectableUnits.filter(
        (unit) =>
          unit.fileKeys.length > 0 &&
          unit.fileKeys.every((k) => selectedKeys.has(k)),
      ).length,
    [selectableUnits, selectedKeys],
  );

  const applyMode = (
    fileKeys: string[],
    mode: ShippingMode,
    options?: { diameter?: number | null; productMode?: string | null },
  ) => {
    if (!onShippingModeChange || fileKeys.length === 0) return;
    if (mode === "express") {
      if (!expressSelectableGlobal) {
        toast({
          title: "신속 출고 선택 불가",
          description: EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
          variant: "destructive",
          duration: 4000,
        });
        return;
      }
      const ok = isExpressShippingSelectable({
        weeklyBatchDays,
        leadTimes,
        diameter: options?.diameter ?? null,
        productMode: options?.productMode ?? null,
        requestedAt: now,
      });
      if (!ok) {
        toast({
          title: "신속 출고 선택 불가",
          description: EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE,
          variant: "destructive",
          duration: 4000,
        });
        return;
      }
    }
    onShippingModeChange(fileKeys, mode);
  };

  const modeButtonClass = (active: boolean, disabled = false) =>
    `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      disabled
        ? "bg-slate-50 text-slate-400 cursor-not-allowed"
        : active
          ? "bg-primary text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  const collectKeysInMarquee = useCallback(
    (originX: number, originY: number, currentX: number, currentY: number) => {
      const container = listContainerRef.current;
      if (!container) return [] as string[];
      const box = {
        left: Math.min(originX, currentX),
        top: Math.min(originY, currentY),
        right: Math.max(originX, currentX),
        bottom: Math.max(originY, currentY),
      };
      const keys: string[] = [];
      container
        .querySelectorAll<HTMLElement>("[data-group-select-key],[data-group-select-keys]")
        .forEach((el) => {
          if (!clientRectsIntersect(box, el.getBoundingClientRect())) return;
          const multi = el.dataset.groupSelectKeys;
          if (multi) {
            for (const key of multi.split("|")) {
              if (key) keys.push(key);
            }
            return;
          }
          const key = el.dataset.groupSelectKey;
          if (key) keys.push(key);
        });
      return keys;
    },
    [listContainerRef],
  );

  const applyMarqueeSelection = useCallback(
    (
      originX: number,
      originY: number,
      currentX: number,
      currentY: number,
      additive: boolean,
      baseline: Set<string>,
    ) => {
      const hit = collectKeysInMarquee(originX, originY, currentX, currentY);
      if (additive) {
        const next = new Set(baseline);
        for (const key of hit) next.add(key);
        setSelectedKeys(next);
      } else {
        setSelectedKeys(new Set(hit));
      }
      if (hit.length) {
        selectionAnchorKeyRef.current = hit[hit.length - 1] || null;
      }
    },
    [collectKeysInMarquee],
  );

  const areKeysSelected = (fileKeys: string[]) =>
    fileKeys.length > 0 && fileKeys.every((k) => selectedKeys.has(k));

  const toggleSelectKeys = (fileKeys: string[]) => {
    const unique = Array.from(new Set(fileKeys.filter(Boolean)));
    if (!unique.length) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allOn = unique.every((k) => next.has(k));
      if (allOn) {
        for (const k of unique) next.delete(k);
      } else {
        for (const k of unique) next.add(k);
      }
      return next;
    });
    selectionAnchorKeyRef.current = unique[0] || null;
  };

  const toggleSelect = (fileKey: string) => {
    toggleSelectKeys([fileKey]);
  };

  const selectRangeTo = (unitKey: string) => {
    const units = selectableUnits;
    const anchor = selectionAnchorKeyRef.current;
    const toIdx = units.findIndex(
      (u) => u.key === unitKey || u.fileKeys.includes(unitKey),
    );
    const fromIdx = anchor
      ? units.findIndex((u) => u.key === anchor || u.fileKeys.includes(anchor))
      : -1;
    if (toIdx < 0) {
      toggleSelectKeys([unitKey]);
      return;
    }
    if (fromIdx < 0) {
      const unit = units[toIdx];
      setSelectedKeys(new Set(unit.fileKeys));
      selectionAnchorKeyRef.current = unit.key;
      return;
    }
    const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const next = new Set<string>();
    for (let i = start; i <= end; i += 1) {
      for (const k of units[i].fileKeys) next.add(k);
    }
    setSelectedKeys(next);
    selectionAnchorKeyRef.current = units[toIdx].key;
  };

  const handleCardPointerDown = (
    event: React.PointerEvent,
    unitKey: string,
    fileKeys: string[],
  ) => {
    if (!onGroupSelectedFiles) return;
    if (event.button !== 0) return;
    if (isMarqueeBlockedTarget(event.target)) return;

    // ⌘/Ctrl+클릭: 토글 선택 (모달 열지 않음)
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      toggleSelectKeys(fileKeys);
      suppressCardClickRef.current = true;
      return;
    }
    // Shift+클릭: 범위 선택
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      selectRangeTo(unitKey);
      suppressCardClickRef.current = true;
      return;
    }
  };

  const handleCardClick = (fileIndex: number) => {
    if (suppressCardClickRef.current) {
      suppressCardClickRef.current = false;
      return;
    }
    // 마키가 실제로 시작된 뒤에만 클릭을 무시한다
    if (marqueeSessionRef.current?.moved) return;
    openDetailModal(fileIndex);
  };

  const handleListPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onGroupSelectedFiles) return;
    if (event.pointerType !== "mouse") return;
    if (event.button !== 0) return;
    if (isMarqueeBlockedTarget(event.target)) return;

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const baseline = additive ? new Set(selectedKeys) : new Set<string>();
    // 임계값 넘기 전에는 capture하지 않음 → 일반 클릭으로 모달 오픈 가능
    marqueeSessionRef.current = {
      pending: true,
      active: false,
      moved: false,
      additive,
      baseline,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
    };
  };

  const handleListPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = marqueeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.pending && !session.active) return;

    const dx = event.clientX - session.originX;
    const dy = event.clientY - session.originY;
    if (Math.hypot(dx, dy) < MARQUEE_MOVE_THRESHOLD_PX) return;

    if (session.pending && !session.active) {
      session.pending = false;
      session.active = true;
      session.moved = true;
      suppressCardClickRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }

    if (!session.active) return;

    setMarquee({
      originX: session.originX,
      originY: session.originY,
      currentX: event.clientX,
      currentY: event.clientY,
      additive: session.additive,
    });
    applyMarqueeSelection(
      session.originX,
      session.originY,
      event.clientX,
      event.clientY,
      session.additive,
      session.baseline,
    );
  };

  const endMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = marqueeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const wasMoved = session.moved && session.active;
    if (wasMoved) {
      applyMarqueeSelection(
        session.originX,
        session.originY,
        event.clientX,
        event.clientY,
        session.additive,
        session.baseline,
      );
    } else if (
      event.target === event.currentTarget ||
      (event.target instanceof Element &&
        !event.target.closest(
          "[data-group-select-key],[data-group-select-keys],[data-patient-group-id]",
        ))
    ) {
      // 목록 빈 곳 클릭 → 선택 해제 (파인더)
      if (!session.additive) setSelectedKeys(new Set());
    }

    const hadCapture = session.active;
    marqueeSessionRef.current = null;
    setMarquee(null);
    if (hadCapture) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }

    if (wasMoved) {
      // click 이벤트보다 늦게 suppress 해제
      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 0);
    } else {
      suppressCardClickRef.current = false;
    }
  };

  const handleGroupSelected = () => {
    if (!onGroupSelectedFiles) return;
    if (selectedUnitCount < 2) {
      toast({
        title: "파일을 선택하세요",
        description: "구강 스캔으로 합치려면 카드를 2개 이상 선택하세요.",
        duration: 2500,
      });
      return;
    }
    onGroupSelectedFiles([...selectedKeys]);
    setSelectedKeys(new Set());
    toast({
      title: "구강 스캔으로 합쳤습니다",
      description:
        "디자인+생산 1건입니다. 치식에서 어벗을 추가하세요. 출고는 +1영업일입니다.",
      duration: 3000,
    });
  };

  const renderEtaAndModes = (params: {
    fileKey: string;
    fileKeysForMode: string[];
    fileInfo?: CaseInfos;
    /** 구강 스캔 묶음은 항상 디자인+생산(+1영업일) */
    forceDesignProductMode?: boolean;
    /** 구강 스캔 카드는 파일유형 뱃지로 충분하므로 +디자인 숨김 */
    hideDesignBadge?: boolean;
    /** ETA줄 3Shape 왼쪽에 표시할 파일 유형 뱃지 */
    fileKindBadge?: "oral_scan" | "abut_design" | null;
  }) => {
    const {
      fileKey,
      fileKeysForMode,
      fileInfo,
      forceDesignProductMode,
      hideDesignBadge,
      fileKindBadge,
    } = params;
    const shippingMode = resolveShippingMode(fileInfo, defaultShippingMode);
    // 구강스캔 메시 최대직경(>20mm)은 생산 리드에 쓰지 않는다(디자인+생산=리드 1일 SSOT).
    const diameter = productionOnly
      ? (fileDiameters[fileKey] ?? fileInfo?.maxDiameter ?? null)
      : forceDesignProductMode
        ? null
        : (fileDiameters[fileKey] ?? fileInfo?.maxDiameter ?? null);
    const productMode = productionOnly
      ? "custom_abutment"
      : forceDesignProductMode
        ? "custom_abutment"
        : (fileInfo?.productMode ?? null);
    const expressSelectable =
      expressSelectableGlobal &&
      isExpressShippingSelectable({
        weeklyBatchDays,
        leadTimes,
        diameter,
        productMode,
        requestedAt: now,
      });
    const effectiveShippingMode: ShippingMode =
      shippingMode === "express" && !expressSelectable ? "normal" : shippingMode;
    const estimatedShip =
      effectiveShippingMode === "express"
        ? computeEstimatedShipLabel({
            shippingMode: "express",
            productMode,
            requestedAt: now,
          })
        : (computeEstimatedShipLabel({
            weeklyBatchDays,
            leadTimes,
            diameter,
            productMode,
            shippingMode: "normal",
            requestedAt: now,
          }) ??
          (getEstimatedShipForDiameter
            ? getEstimatedShipForDiameter(diameter, "normal", productMode)
            : null));
    const isDesignMode =
      !productionOnly &&
      fileInfo?.productMode === "design_custom_abutment"; // 레거시 문서만

    return (
      <div className="flex items-center justify-between gap-2">
        {estimatedShip ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
            <Calendar className="w-3 h-3 shrink-0" />
            <span
              key={`eta-${fileKey}-${effectiveShippingMode}-${estimatedShip}`}
              className="truncate"
            >
              예상 출고: {estimatedShip}
            </span>
          </div>
        ) : (
          <div />
        )}

        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(event) => event.stopPropagation()}
        >
          {onShippingModeChange ? (
            <div className="flex gap-1">
              <button
                type="button"
                className={modeButtonClass(effectiveShippingMode === "normal")}
                onClick={() =>
                  applyMode(fileKeysForMode, "normal", { diameter, productMode })
                }
              >
                묶음
              </button>
              <button
                type="button"
                className={modeButtonClass(
                  effectiveShippingMode === "express",
                  !expressSelectable,
                )}
                disabled={!expressSelectable}
                title={
                  expressSelectable
                    ? undefined
                    : EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE
                }
                onClick={() =>
                  applyMode(fileKeysForMode, "express", {
                    diameter,
                    productMode,
                  })
                }
              >
                신속
              </button>
            </div>
          ) : null}
          {isDesignMode && !hideDesignBadge ? (
            <ImmediateTooltip label={ORAL_SCAN_BADGE_TOOLTIP}>
              <Badge
                variant="secondary"
                className="bg-primary-muted/50 text-[10px] font-medium px-1.5 py-0.5 text-primary-strong"
              >
                +디자인
              </Badge>
            </ImmediateTooltip>
          ) : null}
          {fileKindBadge === "oral_scan" ? (
            <ImmediateTooltip label={ORAL_SCAN_BADGE_TOOLTIP}>
              <Badge variant="secondary" className={ORAL_SCAN_BADGE_CLASS}>
                구강스캔
              </Badge>
            </ImmediateTooltip>
          ) : fileKindBadge === "abut_design" ? (
            <ImmediateTooltip label={ABUT_DESIGN_BADGE_TOOLTIP}>
              <Badge variant="secondary" className={ABUT_DESIGN_BADGE_CLASS}>
                어벗디자인
              </Badge>
            </ImmediateTooltip>
          ) : null}
        </div>
      </div>
    );
  };

  const renderSingleCard = (fileIndex: number) => {
    const file = files[fileIndex];
    if (!file) return null;
    const filename = file.name;
    const fileKey = toNormalizedFileKey(file);
    const isSelected = selectedPreviewIndex === fileIndex;
    const isVerified = !!fileVerificationStatus[fileKey];
    const isUnverifiedHighlight = highlightUnverifiedArrows && !isVerified;
    const fileInfo = caseInfosMap?.[fileKey];
    const checked = selectedKeys.has(fileKey);
    const canGroupSelect = Boolean(onGroupSelectedFiles);
    const isOralScanFile = isLikelyOralScanSize(file.size);
    const isAbutDesignFile = isLikelyCustomAbutDesignSize(file.size);

    const baseClasses = isVerified
      ? "border border-gray-200 bg-white text-gray-900"
      : "border border-destructive/80 bg-destructive-soft text-destructive";
    const stateClasses = isSelected
      ? isVerified
        ? "border-primary bg-primary/10 text-primary shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
        : "border-destructive/80 bg-destructive-soft shadow-[0_4px_12px_rgba(248,113,113,0.2)]"
      : "";
    const ringClasses = checked
      ? "ring-2 ring-primary ring-offset-1 ring-offset-white"
      : isSelected
        ? "ring-2 ring-primary ring-offset-1 ring-offset-white"
        : isUnverifiedHighlight
          ? "ring-2 ring-destructive/80 ring-offset-1 ring-offset-white"
          : "";
    const selectFill = checked ? "bg-primary-soft/90" : "";
    const uploadProgressRow = pickUploadProgress([file], uploadProgress);

    return (
      <div
        key={`${fileKey}-${fileIndex}`}
        onClick={() => handleCardClick(fileIndex)}
        onPointerDown={(e) => handleCardPointerDown(e, fileKey, [fileKey])}
        data-file-index={fileIndex}
        data-group-select-key={canGroupSelect ? fileKey : undefined}
        aria-selected={checked}
        className={`relative shrink-0 overflow-hidden app-glass-card w-full px-4 py-3.5 rounded-xl cursor-pointer transition-all ${baseClasses} ${stateClasses} ${ringClasses} ${selectFill} hover:border-gray-400`}
      >
        {renderUploadProgressBar(uploadProgressRow)}
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {canGroupSelect ? (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-primary"
                  checked={checked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    if (e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey) {
                      selectRangeTo(fileKey);
                      return;
                    }
                    toggleSelect(fileKey);
                  }}
                  aria-label="구강 스캔으로 합칠 파일 선택"
                  data-no-marquee
                />
              ) : null}
              <div className="min-w-0 flex-1 truncate pr-1" title={filename}>
                {filename}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="text-[11px] tabular-nums text-slate-500"
                title={`${file.size.toLocaleString()} bytes`}
              >
                {formatAttachmentSize(file.size)}
                {renderUploadProgressMeta(uploadProgressRow)}
              </span>
              {renderCaseMetaBadges(fileInfo)}
              {isVerified && (
                <Check className="w-4 h-4 text-primary" aria-label="확인됨" />
              )}
              <ImmediateTooltip label="삭제">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveFile(fileIndex);
                  }}
                  className="p-1 text-slate-400 hover:text-destructive"
                  aria-label="파일 삭제"
                  data-no-marquee
                >
                  <X className="w-4 h-4" />
                </button>
              </ImmediateTooltip>
            </div>
          </div>
          {renderEtaAndModes({
            fileKey,
            fileKeysForMode: [fileKey],
            fileInfo,
            hideDesignBadge: productionOnly ? true : isOralScanFile,
            forceDesignProductMode: productionOnly ? false : isOralScanFile,
            fileKindBadge: productionOnly
              ? null
              : isOralScanFile
                ? "oral_scan"
                : isAbutDesignFile
                  ? "abut_design"
                  : null,
          })}
        </div>
      </div>
    );
  };

  const renderGroupCard = (group: PatientFileGroup, fileIndices: number[]) => {
    const primaryKey = getPrimaryFileKey(group);
    const primaryIndex = fileIndices[0] ?? -1;
    if (!primaryKey || primaryIndex < 0) return null;

    const fileInfo = caseInfosMap?.[primaryKey];
    const memberNames = fileIndices
      .map((idx) => files[idx]?.name)
      .filter((name): name is string => Boolean(name));
    const patientLabel = resolveOralScanGroupTitle(memberNames);
    const isVerified = group.fileKeys.every((k) => !!fileVerificationStatus[k]);
    const isSelected = fileIndices.includes(selectedPreviewIndex ?? -1);
    const isUnverifiedHighlight = highlightUnverifiedArrows && !isVerified;
    const canGroupSelect = Boolean(onGroupSelectedFiles);
    const checked = areKeysSelected(group.fileKeys);

    const baseClasses = isVerified
      ? "border border-gray-200 bg-white text-gray-900"
      : "border border-destructive/80 bg-destructive-soft text-destructive";
    const stateClasses = isSelected
      ? isVerified
        ? "border-primary bg-primary/10 text-primary shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
        : "border-destructive/80 bg-destructive-soft shadow-[0_4px_12px_rgba(248,113,113,0.2)]"
      : "";
    const ringClasses = checked
      ? "ring-2 ring-primary ring-offset-1 ring-offset-white"
      : isSelected
        ? "ring-2 ring-primary ring-offset-1 ring-offset-white"
        : isUnverifiedHighlight
          ? "ring-2 ring-destructive/80 ring-offset-1 ring-offset-white"
          : "";
    const selectFill = checked ? "bg-primary-soft/90" : "";
    const uploadProgressRow = pickUploadProgress(
      fileIndices.map((idx) => files[idx]),
      uploadProgress,
    );

    const handleRemoveGroup = () => {
      // 인덱스 밀림 방지: 큰 인덱스부터 순차 삭제
      void (async () => {
        const sorted = [...fileIndices].sort((a, b) => b - a);
        for (const idx of sorted) {
          await handleRemoveFile(idx);
        }
      })();
    };

    return (
      <div
        key={group.id}
        onClick={() => handleCardClick(primaryIndex)}
        onPointerDown={(e) =>
          handleCardPointerDown(e, primaryKey, group.fileKeys)
        }
        data-file-index={primaryIndex}
        data-patient-group-id={group.id}
        data-group-select-keys={
          canGroupSelect ? group.fileKeys.join("|") : undefined
        }
        aria-selected={checked}
        className={`relative shrink-0 overflow-hidden app-glass-card w-full px-4 py-3.5 rounded-xl cursor-pointer transition-all ${baseClasses} ${stateClasses} ${ringClasses} ${selectFill} hover:border-gray-400`}
      >
        {renderUploadProgressBar(uploadProgressRow)}
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 flex items-center gap-2">
              {canGroupSelect ? (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-primary mt-0.5"
                  checked={checked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    if (
                      e.nativeEvent instanceof MouseEvent &&
                      e.nativeEvent.shiftKey
                    ) {
                      selectRangeTo(primaryKey);
                      return;
                    }
                    toggleSelectKeys(group.fileKeys);
                  }}
                  aria-label="구강 스캔으로 합칠 케이스 선택"
                  data-no-marquee
                />
              ) : null}
              <div className="min-w-0 flex-1 truncate font-medium">
                {patientLabel}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isVerified && (
                <Check className="w-4 h-4 text-primary" aria-label="확인됨" />
              )}
              {onUngroup ? (
                <ImmediateTooltip label="연결 끊기">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUngroup(group.id);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700"
                    aria-label="구강 스캔 합치기 해제"
                    data-no-marquee
                  >
                    <Link2Off className="w-4 h-4" />
                  </button>
                </ImmediateTooltip>
              ) : null}
              <ImmediateTooltip label="삭제">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveGroup();
                  }}
                  className="p-1 text-slate-400 hover:text-destructive"
                  aria-label="의뢰 삭제"
                  data-no-marquee
                >
                  <X className="w-4 h-4" />
                </button>
              </ImmediateTooltip>
            </div>
          </div>

          <ul className="space-y-1 rounded-lg border border-primary-soft/80 bg-white/70 px-2.5 py-2">
            {fileIndices.map((idx) => {
              const member = files[idx];
              if (!member) return null;
              const memberKey = toNormalizedFileKey(member);
              return (
                <li
                  key={`${group.id}-${idx}`}
                  className="flex items-center justify-between gap-2 text-xs text-slate-600"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:text-primary"
                    title={member.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetailModal(idx);
                    }}
                  >
                    {member.name}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="text-[11px] tabular-nums text-slate-500"
                      title={`${member.size.toLocaleString()} bytes`}
                    >
                      {formatAttachmentSize(member.size)}
                      {renderUploadProgressMeta(
                        uploadProgress[toTempUploadFileKey(member)],
                      )}
                    </span>
                    {memberKey === primaryKey
                      ? renderCaseMetaBadges(fileInfo)
                      : null}
                    {onRemoveFileFromGroup ? (
                      <ImmediateTooltip label="연결 끊기">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveFileFromGroup(memberKey);
                          }}
                          className="p-0.5 text-slate-400 hover:text-slate-700"
                          aria-label={`${member.name} 연결 끊기`}
                          data-no-marquee
                        >
                          <Link2Off className="w-3.5 h-3.5" />
                        </button>
                      </ImmediateTooltip>
                    ) : null}
                    <ImmediateTooltip label="삭제">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveFile(idx);
                        }}
                        className="p-0.5 text-slate-400 hover:text-destructive"
                        aria-label={`${member.name} 삭제`}
                        data-no-marquee
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </ImmediateTooltip>
                  </div>
                </li>
              );
            })}
          </ul>

          {renderEtaAndModes({
            fileKey: primaryKey,
            fileKeysForMode: group.fileKeys,
            fileInfo,
            forceDesignProductMode: true,
            hideDesignBadge: true,
            fileKindBadge: "oral_scan",
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 gap-3 h-full">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <RequestSettingsToolbar
            designSoftwareLabel={designSoftwareLabel}
            onOpenDesignSoftwareModal={onOpenDesignSoftwareModal}
            anodizingEnabled={anodizingEnabled}
            anodizingSaving={anodizingSaving}
            onToggleAnodizing={onToggleAnodizing}
            anodizingTitle="의뢰자 기본값으로 저장되며, 새로 올리는 파일에만 적용됩니다"
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={!files.length}
          >
            전체 삭제
          </Button>
        </div>

        <div
          className={`flex flex-col gap-2.5 flex-1 min-h-0 ${hasAnyAttachment ? "" : "justify-center"}`}
        >
        <PracticeTransferFileDropTarget
          fileInputId="new-request-stl-upload"
          onFiles={onFilesSelected}
          accept={NEW_REQUEST_STL_ACCEPT}
          acceptedHint=""
          filterFiles={(incoming) => incoming}
          compact={hasAnyAttachment}
          label="여기를 클릭하거나 STL 파일을 드래그해 추가하세요."
          className="shrink-0 w-full"
        />

        {onGroupSelectedFiles && selectedUnitCount >= 1 ? (
          <div className="flex shrink-0 items-center justify-center gap-2" data-no-marquee>
            {selectedUnitCount >= 2 ? (
              <Button
                type="button"
                size="sm"
                onClick={handleGroupSelected}
                className="gap-1.5 shadow-md"
              >
                <Link2 className="w-3.5 h-3.5" />
                하나로 묶기({selectedUnitCount})
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedKeys(new Set())}
            >
              선택해제
            </Button>
          </div>
        ) : null}

        {hasAnyAttachment ? (
          <div
            ref={listContainerRef}
            // 단독 카드 ≈ 4.75rem + gap-2.5 → 4.5장 노출 (링 여백 py 포함)
            // 좌우 px-7: 마키 드래그 시작용 여유 공간
            className={`relative flex max-h-[calc(4.5*4.75rem+4*0.625rem+0.5rem)] flex-col gap-2.5 overflow-y-auto overflow-x-hidden px-3 py-1.5 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 sm:px-7 ${
              onGroupSelectedFiles ? "select-none" : ""
            } ${marquee ? "cursor-crosshair" : ""}`}
            tabIndex={0}
            role="listbox"
            aria-multiselectable={onGroupSelectedFiles ? true : undefined}
            aria-label="첨부 파일 목록"
            onKeyDown={(event) => {
              if (
                onGroupSelectedFiles &&
                event.key === "Escape" &&
                selectedKeys.size > 0
              ) {
                event.preventDefault();
                setSelectedKeys(new Set());
                return;
              }
              onKeyboardNavigation(event);
            }}
            onPointerDown={handleListPointerDown}
            onPointerMove={handleListPointerMove}
            onPointerUp={endMarquee}
            onPointerCancel={endMarquee}
          >
            {resolvedListItems.map((item) =>
              item.kind === "group"
                ? renderGroupCard(item.group, item.fileIndices)
                : renderSingleCard(item.fileIndex),
            )}
            {marquee && listContainerRef.current
              ? (() => {
                  const container = listContainerRef.current!;
                  const bounds = container.getBoundingClientRect();
                  const left =
                    Math.min(marquee.originX, marquee.currentX) -
                    bounds.left +
                    container.scrollLeft;
                  const top =
                    Math.min(marquee.originY, marquee.currentY) -
                    bounds.top +
                    container.scrollTop;
                  const width = Math.abs(marquee.currentX - marquee.originX);
                  const height = Math.abs(marquee.currentY - marquee.originY);
                  if (width < 2 && height < 2) return null;
                  return (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute z-20 rounded-sm border border-primary bg-primary/20"
                      style={{ left, top, width, height }}
                    />
                  );
                })()
              : null}
          </div>
        ) : null}
        </div>
      </div>
    </>
  );
}
