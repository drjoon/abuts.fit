// related files:
// - web/frontend/src/shared/practice/labModelScanApi.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferIntakeSection.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/backend/controllers/practiceTransfers/labModelScanTransfer.controller.js
// - docs/intent/lab-oral-scan-opens-practice-transfer.md
// - 2026-11-28: 치과 「주문」작성 화면을 재사용. 기공소 선택·기공비 견적·리메이크·임시저장·가이드투어는 두지 않음.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import { ZoomableImagePreview } from "@/shared/components/ZoomableImagePreview";
import { PracticeTransferIntakeSection } from "@/shared/components/practice/PracticeTransferIntakeSection";
import { normalizeDoctorNames } from "@/shared/components/practice/PracticeDoctorNameField";
import { normalizeMemoSnippets } from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import { useToast } from "@/shared/hooks/use-toast";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useFilePreUpload, toTempUploadFileKey } from "@/shared/hooks/useFilePreUpload";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { kstYmdDiffDays, toKstYmd } from "@/shared/date/kst";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import {
  createLabModelScanTransfer,
  fetchLabClientLabels,
} from "@/shared/practice/labModelScanApi";
import {
  getPracticeTransferFileExtension,
  PRACTICE_TRANSFER_ALLOWED_EXTENSIONS,
  PRACTICE_TRANSFER_IMAGE_EXTENSIONS,
} from "@/shared/practice/practiceTransferAccept";
import {
  ORAL_SCAN_OPTIONAL_NOTE_PRIMARY,
} from "@/shared/practice/oralScanRequirement";
import {
  ARCH_BULK_PROSTHESIS_PRESETS,
  normalizeArchBulkProsthesisTypes,
} from "@/shared/practice/prosthesisFeeItemRequest";
import {
  normalizeRequestStagePresets,
  type PracticeLabRequestStagePlan,
  type PracticeRequestStagePreset,
} from "@/shared/practice/requestStagePresets";
import { filenameScanRoleFields } from "@/shared/practice/labProsthesisAiDesign";
import {
  ABUTMENT_PRODUCT_MODE,
  buildPracticeTransferMemo,
  emptyToothWorkCustomSpecs,
  isBridgeLikeProsthesisType,
  listMissingAbutmentPresetTeeth,
  normalizeAbutmentFavorites,
  normalizeAccountAbutmentProductMode,
  normalizeImplantFavorites,
  normalizeProsthesisTypes,
  normalizeShadeFavorites,
  normalizeSimpleAbutmentOptionCatalog,
  normalizeSimpleHealingOptionCatalog,
  normalizeToothWorks,
  resolvePracticeCaseToothFromToothWorks,
  resolvePracticeTransferSkipJig,
  type AbutmentProductMode,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
  type SimpleSpecOptionCatalog,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import {
  PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
  PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE,
  getPracticeWorkPeriodDays,
  isPracticeWorkPeriodBlocked,
  isPracticeWorkPeriodLateWarning,
  shouldEnablePracticeRushProcessing,
} from "@/shared/practice/practiceWorkPeriod";
import { RESPONSIVE } from "@/shared/ui/responsive";
import { cn } from "@/shared/ui/cn";
import {
  mobileActionCloseButtonClassName,
  mobileActionCloseIconClassName,
  mobileActionCloseIconStroke,
  mobileActionOverlayContentClassName,
  mobileActionOverlayHeaderClassName,
  mobileActionOverlayTitleClassName,
  mobileActionOverlayTopStyle,
  mobileActionSheetDismissProps,
} from "@/shared/ui/mobileActionOverlay";
import type { SearchBusinessResult } from "@/pages/practice/hooks/usePracticeTransferStep1";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledFiles?: File[];
  onCreated?: (payload: { transferId: string; mongoId: string }) => void;
};

const PRESET_PROSTHESIS_TYPES = [
  "인레이",
  "크라운",
  "커스텀어벗",
  "브리지",
  "유지장치",
  "임시치아",
  "결손치",
] as const;

const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;

const ensurePresetProsthesisTypes = (items: string[] | null | undefined) =>
  normalizeProsthesisTypes([
    ...PRESET_PROSTHESIS_TYPES,
    ...(Array.isArray(items) ? items : []),
  ]);

const defaultProsthesisType = (types: string[]) =>
  types.includes("크라운") ? "크라운" : types[0] || "크라운";

const addCalendarDays = (ymd: string, days: number) => {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return date.toISOString().slice(0, 10);
};

const clampArrivalDays = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_ARRIVAL_OFFSET_DAYS;
  return Math.max(0, Math.min(365, Math.floor(value)));
};

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const isPreviewableImage = (file: File) => {
  const mime = String(file.type || "").trim().toLowerCase();
  if (mime.startsWith("image/") && !mime.includes("heic") && !mime.includes("heif")) {
    return true;
  }
  return PRACTICE_TRANSFER_IMAGE_EXTENSIONS.has(
    getPracticeTransferFileExtension(file.name),
  );
};

const blankTooth = (types: string[]): ToothWorkSelection => ({
  toothNumber: "",
  prosthesisType: defaultProsthesisType(types),
  customAbutment: false,
  bridgeLinkedTeeth: [],
  ...emptyToothWorkCustomSpecs(),
});

type SettingsPayload = {
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  archBulkProsthesisTypes?: string[];
  requestStagePresets?: unknown;
  memoSnippets?: unknown;
  doctorNames?: unknown;
  shadeFavorites?: unknown;
  implantFavorites?: unknown;
  abutmentFavorites?: unknown;
  directAbutmentFavorites?: unknown;
  simpleAbutmentOptions?: unknown;
  simpleHealingOptions?: unknown;
  defaultAbutmentProductMode?: unknown;
};

async function saveSettings(token: string, jsonBody: Record<string, unknown>) {
  await apiFetch({
    path: "/api/practice/transfers/settings",
    method: "POST",
    token,
    jsonBody,
  });
}

export function LabModelScanComposeDialog({
  open,
  onOpenChange,
  prefilledFiles = [],
  onCreated,
}: Props) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { connections: implantConnections } = useImplantConnectionCatalog(
    open ? token : null,
  );
  const { ensureFilesUploaded, preUploadFiles, forgetFile, uploadProgress } =
    useFilePreUpload({ token });
  const preUploadRef = useRef(preUploadFiles);
  preUploadRef.current = preUploadFiles;
  const filesRef = useRef<File[]>([]);
  const prefilledRef = useRef(prefilledFiles);
  prefilledRef.current = prefilledFiles;
  const prosthesisTypesRef = useRef<string[]>([...PRESET_PROSTHESIS_TYPES]);
  const arrivalPinnedRef = useRef(false);
  const openGenRef = useRef(0);

  const [clinicLabel, setClinicLabel] = useState("");
  const [labelSuggestions, setLabelSuggestions] = useState<string[]>([]);
  const [patientName, setPatientName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorNames, setDoctorNames] = useState<string[]>([]);
  const [orderDate, setOrderDate] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalDefaultDays, setArrivalDefaultDays] = useState(
    DEFAULT_ARRIVAL_OFFSET_DAYS,
  );
  const [requestMemo, setRequestMemo] = useState("");
  const [prosthesisTypes, setProsthesisTypes] = useState<string[]>([
    ...PRESET_PROSTHESIS_TYPES,
  ]);
  const [prosthesisTypeCatalogDraft, setProsthesisTypeCatalogDraft] = useState<
    string[]
  >([...PRESET_PROSTHESIS_TYPES]);
  const [prosthesisTypeInput, setProsthesisTypeInput] = useState("");
  const [prosthesisTypeSettingsOpen, setProsthesisTypeSettingsOpen] =
    useState(false);
  const [archBulkProsthesisTypes, setArchBulkProsthesisTypes] = useState<
    string[]
  >([...ARCH_BULK_PROSTHESIS_PRESETS]);
  const [requestStagePresets, setRequestStagePresets] = useState<
    PracticeRequestStagePreset[]
  >(() => normalizeRequestStagePresets(null));
  const [labRequestStagePlans, setLabRequestStagePlans] = useState<
    PracticeLabRequestStagePlan[]
  >([]);
  const [memoSnippets, setMemoSnippets] = useState<string[]>([]);
  const [shadeFavorites, setShadeFavorites] = useState<string[]>([]);
  const [implantFavorites, setImplantFavorites] = useState<
    PracticeImplantFavorite[]
  >([]);
  const [abutmentFavorites, setAbutmentFavorites] = useState<
    PracticeAbutmentFavorite[]
  >([]);
  const [directAbutmentFavorites, setDirectAbutmentFavorites] = useState<
    PracticeAbutmentFavorite[]
  >([]);
  const [simpleAbutmentOptions, setSimpleAbutmentOptions] =
    useState<SimpleSpecOptionCatalog>(() =>
      normalizeSimpleAbutmentOptionCatalog(null),
    );
  const [simpleHealingOptions, setSimpleHealingOptions] =
    useState<SimpleSpecOptionCatalog>(() =>
      normalizeSimpleHealingOptionCatalog(null),
    );
  const [defaultAbutmentProductMode, setDefaultAbutmentProductMode] =
    useState<AbutmentProductMode>(ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION);
  const [toothWorks, setToothWorks] = useState<ToothWorkSelection[]>([]);
  const [toothChartResetNonce, setToothChartResetNonce] = useState(0);
  const [crownFabrication, setCrownFabrication] = useState<
    "scan" | "impression"
  >("impression");
  const [anodizingEnabled, setAnodizingEnabled] = useState(true);
  const [rushProcessing, setRushProcessing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previewByKey, setPreviewByKey] = useState<Record<string, string>>({});
  const [oralPhotoPreview, setOralPhotoPreview] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  filesRef.current = files;

  const normalizedProsthesisTypes = useMemo(
    () => ensurePresetProsthesisTypes(prosthesisTypes),
    [prosthesisTypes],
  );
  prosthesisTypesRef.current = normalizedProsthesisTypes;
  const normalizedToothWorks = useMemo(
    () => normalizeToothWorks(toothWorks),
    [toothWorks],
  );
  const normalizedPatientName = useMemo(
    () => String(patientName || "").trim().normalize("NFC"),
    [patientName],
  );
  const missingAbutmentPresetTeeth = useMemo(
    () => listMissingAbutmentPresetTeeth(normalizedToothWorks),
    [normalizedToothWorks],
  );

  const selfLab = useMemo<SearchBusinessResult | null>(() => {
    const id = String(user?.businessAnchorId || "").trim();
    if (!/^[a-fA-F0-9]{24}$/.test(id)) return null;
    return {
      _id: id,
      name: String(user?.companyName || "").trim() || "기공소",
      businessType: "requestor",
      requestorKind: "lab",
    };
  }, [user?.businessAnchorId, user?.companyName]);

  const applyBlank = useCallback((nextFiles: File[]) => {
    const todayYmd = toKstYmd(new Date()) || "";
    const arrival = todayYmd
      ? addCalendarDays(todayYmd, DEFAULT_ARRIVAL_OFFSET_DAYS)
      : "";
    arrivalPinnedRef.current = false;
    setClinicLabel("");
    setPatientName("");
    setDoctorName("");
    setRequestMemo("");
    setOrderDate(todayYmd);
    setArrivalDate(arrival);
    setArrivalDefaultDays(DEFAULT_ARRIVAL_OFFSET_DAYS);
    setCrownFabrication("impression");
    setAnodizingEnabled(true);
    setRushProcessing(
      shouldEnablePracticeRushProcessing({
        orderYmd: todayYmd,
        arrivalYmd: arrival,
      }),
    );
    setToothWorks([blankTooth(prosthesisTypesRef.current)]);
    setToothChartResetNonce((n) => n + 1);
    for (const file of filesRef.current) forgetFile(file);
    setFiles(nextFiles);
    if (nextFiles.length) preUploadRef.current(nextFiles);
  }, [forgetFile]);

  const applyBlankRef = useRef(applyBlank);
  applyBlankRef.current = applyBlank;

  useEffect(() => {
    if (!open) return;
    openGenRef.current += 1;
    const seeded = prefilledRef.current.length ? [...prefilledRef.current] : [];
    applyBlankRef.current(seeded);
  }, [open]);

  useEffect(() => {
    if (!open || !token) return;
    const gen = openGenRef.current;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{ data?: SettingsPayload }>({
          path: "/api/practice/transfers/settings",
          method: "GET",
          token,
        });
        if (cancelled || openGenRef.current !== gen || !res.ok) return;
        const payload =
          res.data?.data && typeof res.data.data === "object"
            ? res.data.data
            : null;
        if (!payload) return;
        if (Array.isArray(payload.prosthesisTypes)) {
          const next = ensurePresetProsthesisTypes(payload.prosthesisTypes);
          setProsthesisTypes(next);
          setProsthesisTypeCatalogDraft(next);
        }
        setArchBulkProsthesisTypes(
          normalizeArchBulkProsthesisTypes(payload.archBulkProsthesisTypes),
        );
        setRequestStagePresets(
          normalizeRequestStagePresets(payload.requestStagePresets),
        );
        setMemoSnippets(normalizeMemoSnippets(payload.memoSnippets));
        setDoctorNames(normalizeDoctorNames(payload.doctorNames));
        setShadeFavorites(normalizeShadeFavorites(payload.shadeFavorites));
        setImplantFavorites(normalizeImplantFavorites(payload.implantFavorites));
        setAbutmentFavorites(normalizeAbutmentFavorites(payload.abutmentFavorites));
        setDirectAbutmentFavorites(
          normalizeAbutmentFavorites(payload.directAbutmentFavorites),
        );
        setSimpleAbutmentOptions(
          normalizeSimpleAbutmentOptionCatalog(payload.simpleAbutmentOptions),
        );
        setSimpleHealingOptions(
          normalizeSimpleHealingOptionCatalog(payload.simpleHealingOptions),
        );
        setDefaultAbutmentProductMode(
          normalizeAccountAbutmentProductMode(payload.defaultAbutmentProductMode),
        );
        if (
          !arrivalPinnedRef.current &&
          typeof payload.arrivalDefaultDays === "number"
        ) {
          const days = clampArrivalDays(payload.arrivalDefaultDays);
          const todayYmd = toKstYmd(new Date()) || "";
          const arrival = todayYmd ? addCalendarDays(todayYmd, days) : "";
          setArrivalDefaultDays(days);
          setOrderDate(todayYmd);
          setArrivalDate(arrival);
          setRushProcessing(
            shouldEnablePracticeRushProcessing({
              orderYmd: todayYmd,
              arrivalYmd: arrival,
            }),
          );
        }
      } catch {
        // 카탈로그 없이도 프리셋으로 작성한다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchLabClientLabels(token, clinicLabel)
        .then((labels) => {
          if (!cancelled) setLabelSuggestions(labels);
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clinicLabel, open, token]);

  useEffect(() => {
    const next: Record<string, string> = {};
    const created: string[] = [];
    for (const file of files) {
      if (!isPreviewableImage(file)) continue;
      const url = URL.createObjectURL(file);
      next[fileKey(file)] = url;
      created.push(url);
    }
    setPreviewByKey(next);
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [files]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (!incoming.length) return;
      const accepted: File[] = [];
      let rejected = 0;
      for (const file of incoming) {
        const ext = getPracticeTransferFileExtension(file.name);
        if (!PRACTICE_TRANSFER_ALLOWED_EXTENSIONS.has(ext)) {
          rejected += 1;
          continue;
        }
        accepted.push(file);
      }
      if (rejected > 0) {
        toast({
          title: "일부 파일은 제외했습니다",
          description: "DCM·PLY·STL·OBJ·ExoCAD·3Shape·이미지만 첨부됩니다.",
        });
      }
      if (!accepted.length) return;
      setFiles((prev) => {
        const next = [...prev];
        for (const file of accepted) {
          const key = fileKey(file);
          if (next.some((row) => fileKey(row) === key)) continue;
          next.push(file);
        }
        return next;
      });
      preUploadRef.current(accepted);
    },
    [toast],
  );

  const removeFile = useCallback(
    (key: string) => {
      setFiles((prev) => {
        const target = prev.find((file) => fileKey(file) === key);
        if (target) forgetFile(target);
        return prev.filter((file) => fileKey(file) !== key);
      });
    },
    [forgetFile],
  );

  const clearFiles = useCallback(() => {
    for (const file of filesRef.current) forgetFile(file);
    setFiles([]);
  }, [forgetFile]);

  const persist = useCallback(
    (jsonBody: Record<string, unknown>) => {
      if (!token) return;
      void saveSettings(token, jsonBody).catch(() => {});
    },
    [token],
  );

  const onOrderArrivalDatesChange = useCallback(
    ({ arrivalDate: nextArrival }: { orderDate: string; arrivalDate: string }) => {
      const todayYmd = toKstYmd(new Date()) || orderDate;
      const arrival =
        String(nextArrival || "").trim() >= todayYmd
          ? String(nextArrival || "").trim()
          : addCalendarDays(todayYmd, arrivalDefaultDays);
      arrivalPinnedRef.current = true;
      setOrderDate(todayYmd);
      setArrivalDate(arrival);
      const diff = kstYmdDiffDays(todayYmd, arrival);
      if (diff != null) {
        const days = clampArrivalDays(diff);
        setArrivalDefaultDays(days);
        persist({ arrivalDefaultDays: days });
      }
      const periodDays = getPracticeWorkPeriodDays(todayYmd, arrival);
      if (isPracticeWorkPeriodBlocked(periodDays)) {
        toast({
          title: PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
          variant: "destructive",
        });
      } else if (isPracticeWorkPeriodLateWarning(periodDays)) {
        toast({ title: PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE });
      }
      setRushProcessing(false);
    },
    [arrivalDefaultDays, orderDate, persist, toast],
  );

  const canSubmit =
    Boolean(clinicLabel.trim()) &&
    Boolean(normalizedPatientName) &&
    normalizedToothWorks.length > 0 &&
    missingAbutmentPresetTeeth.length === 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!token || !canSubmit) return;
    if (arrivalDate < orderDate) {
      toast({
        title: "치과도착일을 확인해주세요",
        description: "치과도착일은 주문일보다 빠를 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    const periodDays = getPracticeWorkPeriodDays(orderDate, arrivalDate);
    if (isPracticeWorkPeriodBlocked(periodDays)) {
      toast({
        title: PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
        variant: "destructive",
      });
    } else if (isPracticeWorkPeriodLateWarning(periodDays)) {
      toast({ title: PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE });
    }
    const bridgeMissing = normalizedToothWorks.some(
      (row) =>
        isBridgeLikeProsthesisType(row.prosthesisType) &&
        row.bridgeLinkedTeeth.length === 0,
    );
    if (bridgeMissing) {
      toast({
        title: "브리지/결손치/유지장치 연결 치아를 선택해주세요",
        description: "브리지, 결손치, 유지장치 형태는 인접 치아를 최소 1개 연결해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = files.length ? await ensureFilesUploaded(files) : [];
      if (files.length && uploaded.some((row) => !String(row?.key || "").trim())) {
        toast({
          title: "업로드 실패",
          description: "파일 업로드를 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }
      const fileRows = uploaded
        .map((row, index) => {
          const originalName = String(
            row?.originalName || files[index]?.name || "",
          ).trim();
          const s3Key = String(row?.key || "").trim();
          if (!originalName || !s3Key) return null;
          const role = filenameScanRoleFields(originalName);
          return {
            patientName: normalizedPatientName,
            tooth: resolvePracticeCaseToothFromToothWorks(normalizedToothWorks, {
              fileIndex: index,
              fileCount: uploaded.length,
            }),
            ...(role || {}),
            originalName,
            mimetype:
              row?.mimetype || files[index]?.type || "application/octet-stream",
            size: row?.size || files[index]?.size || 0,
            s3Key,
          };
        })
        .filter(Boolean) as Array<{
        patientName: string;
        tooth: string;
        scanRole?: string;
        scanRoleSetBy?: string;
        originalName: string;
        mimetype: string;
        size: number;
        s3Key: string;
      }>;

      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: normalizedToothWorks,
        patientName: normalizedPatientName,
        doctorName,
        skipDesignConfirm: true,
        skipJig: resolvePracticeTransferSkipJig(normalizedToothWorks, true),
      });

      const created = await createLabModelScanTransfer(token, {
        clinicLabel: clinicLabel.trim(),
        patientName: normalizedPatientName,
        arrivalYmd: arrivalDate,
        orderYmd: orderDate || undefined,
        transferMemo,
        toothWorks: normalizedToothWorks,
        files: fileRows,
        rushProcessing,
        anodizingEnabled,
        crownFabrication,
      });
      if (!created.ok) {
        toast({
          title: "의뢰 생성 실패",
          description: created.message,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "의뢰를 등록했습니다",
        description: "작업시작 후 커스텀어벗 의뢰하기에 카드가 생깁니다.",
      });
      onOpenChange(false);
      onCreated?.({
        transferId: String(created.data?.transferId || ""),
        mongoId: String(created.data?._id || ""),
      });
    } catch (error) {
      toast({
        title: "의뢰 생성 실패",
        description:
          error instanceof Error ? error.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const totalSizeMb = (
    files.reduce((sum, file) => sum + file.size, 0) /
    (1024 * 1024)
  ).toFixed(1);

  const filePaneFiles = files.map((file) => {
    const key = fileKey(file);
    const progress = uploadProgress[toTempUploadFileKey(file)];
    return {
      key,
      name: file.name,
      size: file.size,
      metaSuffix: progress?.status === "done" ? "업로드됨" : "대기",
      uploadPercent: progress?.percent,
      uploadStatus: progress?.status,
      ...(isPreviewableImage(file) ? { previewUrl: previewByKey[key] || null } : {}),
    };
  });

  return (
    <>
      <Dialog open={open} modal={!isMobile} onOpenChange={onOpenChange}>
        <DialogContent
          hideClose
          style={isMobile ? mobileActionOverlayTopStyle(56) : undefined}
          {...(isMobile ? mobileActionSheetDismissProps : {})}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 duration-200",
            "z-[320]",
            isMobile
              ? mobileActionOverlayContentClassName
              : cn(
                  "inset-0 left-0 top-0 h-[100dvh] w-screen max-h-[100dvh] max-w-none translate-x-0 translate-y-0",
                  "rounded-none border-0 sm:max-w-none",
                  "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
                ),
          )}
          overlayClassName={isMobile ? undefined : "z-[319]"}
        >
          <DialogClose
            className={cn(
              "absolute z-10",
              isMobile
                ? cn(mobileActionCloseButtonClassName, "right-3 top-2.5")
                : "right-3 top-2.5 inline-flex h-12 w-12 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:bg-slate-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            aria-label="닫기"
          >
            <X
              className={isMobile ? mobileActionCloseIconClassName : "h-7 w-7"}
              strokeWidth={mobileActionCloseIconStroke}
            />
            <span className="sr-only">Close</span>
          </DialogClose>
          <DialogHeader
            className={cn(
              "shrink-0 border-b text-left",
              isMobile
                ? cn(mobileActionOverlayHeaderClassName, "space-y-0 pr-14")
                : "flex flex-row items-center gap-3 space-y-0 border-border bg-white/95 px-6 py-2.5 pr-[4.25rem] backdrop-blur supports-[backdrop-filter]:bg-white/80",
            )}
          >
            <DialogTitle
              className={cn(
                "flex shrink-0 items-center gap-2 font-semibold tracking-tight",
                isMobile ? mobileActionOverlayTitleClassName : "text-base sm:text-lg",
              )}
            >
              주문
            </DialogTitle>
            <DialogDescription className="sr-only">
              모델스캔으로 기공의뢰를 작성합니다.
            </DialogDescription>
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() => applyBlank([])}
                disabled={submitting}
              >
                새로 작성
              </Button>
            </div>
          </DialogHeader>
          <PageFileDropZone
            onFiles={addFiles}
            activeClassName="ring-2 ring-primary/30"
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              isMobile ? "bg-slate-50/80" : "bg-gradient-subtle",
            )}
          >
            <div
              className={cn(
                "mx-auto w-full max-w-[90rem]",
                isMobile
                  ? "box-border min-w-0 space-y-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
                  : "space-y-3 px-4 pb-12 pt-4",
              )}
            >
              <PracticeTransferIntakeSection
                filePaneProps={{
                  fileInputId: "lab-model-scan-file-input",
                  acceptedHint: (
                    <>
                      <span className="font-bold text-foreground">DCM (제일 추천)</span>
                      {" · "}
                      <span className="font-semibold text-foreground">
                        PLY(두번째 추천)
                      </span>
                      {" · STL · OBJ"}
                      <br />
                      ExoCAD · 3Shape · 이미지
                    </>
                  ),
                  requirementNote: "모바일에서 환자 사진 찍어 첨부할 수 있어요.",
                  requirementNoteExtra: (
                    <>
                      {ORAL_SCAN_OPTIONAL_NOTE_PRIMARY}
                      <br />
                      러버인상(석고모델)은 파일 없이 등록할 수 있습니다.
                    </>
                  ),
                  files: filePaneFiles,
                  totalSizeMb,
                  onPickFiles: addFiles,
                  onRemoveFile: removeFile,
                  onClearAllFiles: clearFiles,
                  onPreviewFile: (file) => {
                    const url = String(file.previewUrl || "").trim();
                    if (!url) return;
                    setOralPhotoPreview({
                      name: String(file.name || "사진").trim() || "사진",
                      url,
                    });
                  },
                }}
                requestIntakeProps={{
                  variant: "plain",
                  toothChartDisplayMode: "full",
                  showFeeEstimate: false,
                  scanFabrication: crownFabrication === "scan",
                  crownFabrication,
                  onCrownFabricationChange: setCrownFabrication,
                  nestedDialogClassName: "z-[340]",
                  nestedDialogOverlayClassName: "z-[339]",
                  clinicLabel,
                  onClinicLabelChange: setClinicLabel,
                  clinicLabelSuggestions: labelSuggestions,
                  selectedLab: selfLab,
                  setSelectedLab: () => {},
                  labOpen: false,
                  setLabOpen: () => {},
                  labSearch: "",
                  setLabSearch: () => {},
                  labSearchResults: [],
                  labSearching: false,
                  recentLabs: [],
                  recentLabsInitialized: true,
                  patientName,
                  setPatientName,
                  doctorName,
                  setDoctorName,
                  doctorNames,
                  onDoctorNamesChange: async (next) => {
                    const normalized = normalizeDoctorNames(next);
                    setDoctorNames(normalized);
                    persist({ doctorNames: normalized });
                  },
                  orderDate,
                  setOrderDate,
                  arrivalDate,
                  setArrivalDate,
                  onOrderArrivalDatesChange,
                  arrivalDefaultDays,
                  rushProcessing,
                  anodizingEnabled,
                  onAnodizingEnabledChange: setAnodizingEnabled,
                  normalizedProsthesisTypes,
                  setProsthesisTypeCatalogDraft,
                  setProsthesisTypeSettingsDialogOpen: setProsthesisTypeSettingsOpen,
                  onEnsureProsthesisTypesInCatalog: (types) => {
                    const merged = ensurePresetProsthesisTypes([
                      ...prosthesisTypes,
                      ...types,
                    ]);
                    setProsthesisTypes(merged);
                    setProsthesisTypeCatalogDraft(merged);
                    persist({ prosthesisTypes: merged });
                  },
                  onProsthesisTypesCatalogChange: (next) => {
                    const merged = ensurePresetProsthesisTypes(next);
                    setProsthesisTypes(merged);
                    setProsthesisTypeCatalogDraft(merged);
                    persist({ prosthesisTypes: merged });
                  },
                  archBulkProsthesisTypes,
                  onArchBulkProsthesisTypesChange: (next) => {
                    const normalized = normalizeArchBulkProsthesisTypes(next);
                    setArchBulkProsthesisTypes(normalized);
                    persist({ archBulkProsthesisTypes: normalized });
                  },
                  requestStagePresets,
                  onRequestStagePresetsChange: (next) => {
                    const normalized = normalizeRequestStagePresets(next);
                    setRequestStagePresets(normalized);
                    persist({ requestStagePresets: normalized });
                  },
                  labRequestStagePlans,
                  onLabRequestStagePlansChange: setLabRequestStagePlans,
                  toothWorks,
                  setToothWorks,
                  requestMemo,
                  setRequestMemo,
                  memoInputId: "lab-model-scan-memo",
                  toothChartResetNonce,
                  memoSnippets,
                  onMemoSnippetsChange: async (next) => {
                    const normalized = normalizeMemoSnippets(next);
                    setMemoSnippets(normalized);
                    persist({ memoSnippets: normalized });
                  },
                  shadeFavorites,
                  onShadeFavoritesChange: async (next) => {
                    const normalized = normalizeShadeFavorites(next);
                    setShadeFavorites(normalized);
                    persist({ shadeFavorites: normalized });
                  },
                  implantConnections,
                  implantFavorites,
                  onImplantFavoritesChange: (next) => {
                    const normalized = normalizeImplantFavorites(next);
                    setImplantFavorites(normalized);
                    persist({ implantFavorites: normalized });
                  },
                  abutmentFavorites,
                  onAbutmentFavoritesChange: (next) => {
                    const normalized = normalizeAbutmentFavorites(next);
                    setAbutmentFavorites(normalized);
                    persist({ abutmentFavorites: normalized });
                  },
                  directAbutmentFavorites,
                  onDirectAbutmentFavoritesChange: (next) => {
                    const normalized = normalizeAbutmentFavorites(next);
                    setDirectAbutmentFavorites(normalized);
                    persist({ directAbutmentFavorites: normalized });
                  },
                  simpleAbutmentOptions,
                  onSimpleAbutmentOptionsChange: (next) => {
                    const normalized = normalizeSimpleAbutmentOptionCatalog(next);
                    setSimpleAbutmentOptions(normalized);
                    persist({ simpleAbutmentOptions: normalized });
                  },
                  simpleHealingOptions,
                  onSimpleHealingOptionsChange: (next) => {
                    const normalized = normalizeSimpleHealingOptionCatalog(next);
                    setSimpleHealingOptions(normalized);
                    persist({ simpleHealingOptions: normalized });
                  },
                  defaultAbutmentProductMode,
                  onDefaultAbutmentProductModeChange: (next) => {
                    const normalized = normalizeAccountAbutmentProductMode(next);
                    setDefaultAbutmentProductMode(normalized);
                    persist({ defaultAbutmentProductMode: normalized });
                  },
                  lockedAbutmentProductMode:
                    ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
                  alternateAbutmentModePageLabel: "커스텀어벗 의뢰하기",
                  onAlternateAbutmentModeNavigate: () => {
                    onOpenChange(false);
                    navigate("/dashboard/new-request");
                  },
                  showInlineGuideTourButton: false,
                }}
              />
              <div className="flex items-center justify-end gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        className="bg-primary-strong text-white hover:bg-primary-strong disabled:pointer-events-none disabled:opacity-40"
                        onClick={() => void handleSubmit()}
                        disabled={!canSubmit}
                      >
                        {submitting ? "등록 중…" : "의뢰 등록"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="end"
                    className="pointer-events-none max-w-xs border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-snug text-slate-900 shadow-lg"
                  >
                    {submitting ? (
                      <p>등록 중…</p>
                    ) : canSubmit ? (
                      <p className="text-primary-strong">등록 가능</p>
                    ) : (
                      <ul className="space-y-1">
                        {(
                          [
                            {
                              key: "치과명",
                              ok: Boolean(clinicLabel.trim()),
                            },
                            {
                              key: "환자명",
                              ok: Boolean(normalizedPatientName),
                            },
                            {
                              key: "보철물",
                              ok: normalizedToothWorks.length > 0,
                            },
                            ...(missingAbutmentPresetTeeth.length > 0 ||
                            normalizedToothWorks.some((row) => row.customAbutment)
                              ? [
                                  {
                                    key:
                                      missingAbutmentPresetTeeth.length > 0
                                        ? `어벗 프리셋 (#${missingAbutmentPresetTeeth.join(", #")})`
                                        : "어벗 프리셋",
                                    ok: missingAbutmentPresetTeeth.length === 0,
                                  },
                                ]
                              : []),
                          ]
                        ).map((item) => (
                          <li
                            key={item.key}
                            className={
                              item.ok
                                ? "text-primary-strong"
                                : "font-semibold text-accent-strong"
                            }
                          >
                            {item.key}
                            {item.ok ? " ✓" : " · 필요"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </PageFileDropZone>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(oralPhotoPreview)}
        onOpenChange={(next) => {
          if (!next) setOralPhotoPreview(null);
        }}
      >
        <DialogContent
          overlayClassName="z-[359]"
          className={cn(
            "z-[360] max-h-[min(92vh,900px)] max-w-none gap-0 overflow-hidden p-0",
            RESPONSIVE.dialogContentWide,
          )}
        >
          <DialogHeader className="space-y-1 border-b border-slate-200/80 px-4 py-3 pr-12 text-left">
            <DialogTitle className="truncate text-base font-semibold">
              {oralPhotoPreview?.name || "사진"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              첨부한 사진을 크게 봅니다.
            </DialogDescription>
          </DialogHeader>
          <div className="relative h-[min(80vh,820px)] bg-slate-950/95">
            {oralPhotoPreview?.url ? (
              <ZoomableImagePreview
                src={oralPhotoPreview.url}
                alt={oralPhotoPreview.name}
                fill
                className="bg-transparent"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={prosthesisTypeSettingsOpen}
        onOpenChange={(next) => {
          setProsthesisTypeSettingsOpen(next);
          if (next) setProsthesisTypeCatalogDraft(normalizedProsthesisTypes);
        }}
      >
        <DialogContent
          overlayClassName="z-[339]"
          className={cn("z-[340]", RESPONSIVE.dialogContent)}
        >
          <DialogHeader>
            <DialogTitle>보철물 항목 설정</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto px-1.5 py-1.5">
            {prosthesisTypeCatalogDraft.map((item, index) => (
              <div key={`${item}:${index}`} className="flex items-center gap-1.5">
                <Input
                  value={item}
                  onChange={(e) =>
                    setProsthesisTypeCatalogDraft((prev) => {
                      const next = [...prev];
                      next[index] = e.target.value;
                      return next;
                    })
                  }
                  className="h-9 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() =>
                    setProsthesisTypeCatalogDraft((prev) => {
                      const next = prev.filter((_, i) => i !== index);
                      return next.length ? next : [...PRESET_PROSTHESIS_TYPES];
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                value={prosthesisTypeInput}
                onChange={(e) => setProsthesisTypeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const trimmed = prosthesisTypeInput.trim();
                  if (!trimmed) return;
                  setProsthesisTypeCatalogDraft((prev) =>
                    normalizeProsthesisTypes([...prev, trimmed]),
                  );
                  setProsthesisTypeInput("");
                }}
                placeholder="형태 추가"
                className="h-9 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  const trimmed = prosthesisTypeInput.trim();
                  if (!trimmed) return;
                  setProsthesisTypeCatalogDraft((prev) =>
                    normalizeProsthesisTypes([...prev, trimmed]),
                  );
                  setProsthesisTypeInput("");
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                추가
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProsthesisTypeSettingsOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => {
                const merged = ensurePresetProsthesisTypes(
                  prosthesisTypeCatalogDraft,
                );
                setProsthesisTypes(merged);
                setProsthesisTypeCatalogDraft(merged);
                setProsthesisTypeSettingsOpen(false);
                persist({ prosthesisTypes: merged });
              }}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
