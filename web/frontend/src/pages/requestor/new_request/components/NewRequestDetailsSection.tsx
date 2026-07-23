import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { Check, Upload, X, Calendar, CircleHelp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";
import { NewRequestPatientImplantFields } from "./NewRequestPatientImplantFields";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { toKstYmd } from "@/shared/date/kst";

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Option = { id: string; label: string };

const WEEKDAY_TO_KST_INDEX: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
};

const CAD_COMPANION_EXTS = [
  ".constructioninfo",
  ".dentalproject",
  ".cln",
  ".3shapeorder",
  ".xml",
] as const;

const getLowerExt = (name: string) => {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
};

const getStem = (name: string) => {
  const trimmed = String(name || "").trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0) return trimmed;
  return trimmed.slice(0, dot);
};



const buildStemKeys = (stemRaw: string) => {
  const stem = String(stemRaw || "").trim().toLowerCase();
  const keys = new Set<string>();
  if (!stem) return keys;

  keys.add(stem);

  const tokens = stem.split(/[-_\s]+/).filter(Boolean);
  if (tokens[0]) keys.add(tokens[0]);
  if (tokens[0] && tokens[1]) keys.add(`${tokens[0]}-${tokens[1]}`);

  return keys;
};

const extractTrailingIndex = (valueRaw: string) => {
  const value = String(valueRaw || "").trim().toLowerCase();
  const match = value.match(/(?:^|[-_\s])(\d{1,4})$/);
  return match?.[1] || "";
};

const isStemMatch = (aRaw: string, bRaw: string) => {
  const a = String(aRaw || "").trim().toLowerCase();
  const b = String(bRaw || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;

  const aKeys = buildStemKeys(a);
  const bKeys = buildStemKeys(b);
  for (const k of aKeys) {
    if (bKeys.has(k)) return true;
  }

  const aIndex = extractTrailingIndex(a);
  const bIndex = extractTrailingIndex(b);
  if (aIndex && bIndex && aIndex === bIndex) return true;

  return false;
};

const readTextTag = (raw: string, tagNames: string[]) => {
  for (const tag of tagNames) {
    const re = new RegExp(`<\\s*${tag}\\b[^>]*>([^<]+)<\\s*\\/\\s*${tag}\\s*>`, "i");
    const m = raw.match(re);
    const value = String(m?.[1] || "").trim();
    if (value) return value;
  }
  return "";
};

const readKeyValue = (raw: string, keys: string[]) => {
  for (const key of keys) {
    const re = new RegExp(`${key}\\s*[:=]\\s*["']?([^"'\\r\\n]+)`, "i");
    const m = raw.match(re);
    const value = String(m?.[1] || "").trim();
    if (value) return value;
  }
  return "";
};

const parseCadCompanionMetadata = async (file: File) => {
  const ext = getLowerExt(file.name);
  if (
    ext !== ".constructioninfo" &&
    ext !== ".dentalproject" &&
    ext !== ".3shapeorder" &&
    ext !== ".xml"
  ) {
    return {} as Partial<CaseInfos>;
  }

  const raw = await file.text();

  const clinicName =
    readTextTag(raw, ["ClinicName", "Clinic", "Practice", "OfficeName"]) ||
    readKeyValue(raw, ["ClinicName", "Clinic", "Practice", "OfficeName"]);

  const patientName =
    readTextTag(raw, ["PatientName", "Patient", "Name"]) ||
    readKeyValue(raw, ["PatientName", "PatientNameFull", "Patient"]);

  const tooth =
    readTextTag(raw, ["Tooth", "ToothNumber", "ToothNo", "ToothNum"]) ||
    readKeyValue(raw, ["Tooth", "ToothNumber", "ToothNo", "ToothNum"]);

  const result: Partial<CaseInfos> = {};
  if (clinicName) result.clinicName = clinicName;
  if (patientName) result.patientName = patientName;
  if (tooth) result.tooth = tooth;
  return result;
};

type Props = {
  files: File[];
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: (index: number | null) => void;
  caseInfos?: CaseInfos;
  setCaseInfos: (updates: Partial<CaseInfos>) => void;
  caseInfosMap?: Record<string, CaseInfos>;
  updateCaseInfos: (fileKey: string, updates: Partial<CaseInfos>) => void;
  connections: Connection[];
  familyOptions: string[];
  typeOptions: string[];
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantBrand: string;
  setImplantBrand: (v: string) => void;
  implantFamily: string;
  setImplantFamily: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (
    manufacturer: string,
    brand: string,
    family: string,
    type: string,
  ) => void;
  fileVerificationStatus: Record<string, boolean>;
  setFileVerificationStatus: (
    next:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  highlightUnverifiedArrows: boolean;
  setHighlightUnverifiedArrows: (v: boolean) => void;
  handleRemoveFile: (index: number) => void;
  clinicNameOptions: Option[];
  patientNameOptions: Option[];
  teethOptions: Option[];
  addClinicPreset: (label: string) => void;
  clearAllClinicPresets: () => void;
  addPatientPreset: (label: string) => void;
  clearAllPatientPresets: () => void;
  addTeethPreset: (label: string) => void;
  clearAllTeethPresets: () => void;
  handleAddOrSelectClinic: (label: string) => void;
  toast: ToastFn;
  highlight: boolean;
  sectionHighlightClass: string;
  focusUnverifiedTick: number;
  onDuplicateDetected?: (payload: { file: File; duplicate: any }) => void;
  duplicatePromptOpen: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onFilesSelected: (files: File[]) => void;
  registerCompanionFileHandler?: (handler: (files: File[]) => void) => void;
  onCompanionFilesAccepted?: (files: File[]) => void;
  onCompanionFilesChange?: (files: File[]) => void;
  weeklyBatchDays?: string[];
  onCancelAll: () => void;
};

export function NewRequestDetailsSection({
  files,
  selectedPreviewIndex,
  setSelectedPreviewIndex,
  caseInfos,
  setCaseInfos,
  caseInfosMap,
  updateCaseInfos,
  connections,
  familyOptions,
  typeOptions,
  implantManufacturer,
  setImplantManufacturer,
  implantBrand,
  setImplantBrand,
  implantFamily,
  setImplantFamily,
  implantType,
  setImplantType,
  syncSelectedConnection,
  fileVerificationStatus,
  setFileVerificationStatus,
  highlightUnverifiedArrows,
  setHighlightUnverifiedArrows,
  handleRemoveFile,
  clinicNameOptions,
  patientNameOptions,
  teethOptions,
  addClinicPreset,
  clearAllClinicPresets,
  addPatientPreset,
  clearAllPatientPresets,
  addTeethPreset,
  clearAllTeethPresets,
  handleAddOrSelectClinic,
  toast,
  highlight,
  sectionHighlightClass,
  focusUnverifiedTick,
  onDuplicateDetected,
  duplicatePromptOpen,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFilesSelected,
  registerCompanionFileHandler,
  onCompanionFilesAccepted,
  onCompanionFilesChange,
  weeklyBatchDays = [],
  onCancelAll,
}: Props) {
  const { token } = useAuthStore();
  const { data: systemSettings } = useSystemSettings();
  const [leadTimes, setLeadTimes] = useState<Record<string, any> | null>(null);
  const [fileDiameters, setFileDiameters] = useState<Record<string, number>>(
    {},
  );
  useEffect(() => {
    const loadLeadTimes = async () => {
      if (!token) return;
      try {
        const leadRes = await apiFetch<any>({
          path: "/api/businesses/manufacturer-lead-times",
          method: "GET",
          token,
        });
        if (leadRes.ok && leadRes.data?.data) {
          setLeadTimes(leadRes.data.data.leadTimes);
        }
      } catch (e) {
        console.error("Failed to load lead times:", e);
      }
    };

    void loadLeadTimes();
  }, [token]);

  const getKstWeekday = useCallback((dateInput: Date) => {
    const kst = new Date(dateInput.getTime() + 9 * 60 * 60 * 1000);
    return kst.getUTCDay();
  }, []);

  const addBusinessDaysFromKstYmd = useCallback(
    (startYmd: string, days: number) => {
      if (!Number.isFinite(days) || days <= 0) return startYmd;

      const result = new Date(`${startYmd}T12:00:00+09:00`);
      if (Number.isNaN(result.getTime())) return startYmd;

      let added = 0;
      while (added < days) {
        result.setUTCDate(result.getUTCDate() + 1);
        const day = getKstWeekday(result);
        if (day !== 0 && day !== 6) {
          added += 1;
        }
      }

      return toKstYmd(result) || startYmd;
    },
    [getKstWeekday],
  );

  const resolveLeadDaysForPickup = useCallback((leadDays: number) => {
    if (!Number.isFinite(leadDays) || leadDays <= 0) return 1;
    return Math.max(1, leadDays);
  }, []);

  const formatKstMonthDayWithWeekday = useCallback((ymd: string) => {
    const date = new Date(`${ymd}T00:00:00+09:00`);
    if (Number.isNaN(date.getTime())) return ymd;
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }, []);

  const resolveWeeklyPickupYmd = useCallback(
    (baseYmd: string) => {
      const enabledDays = Array.from(
        new Set(
          (weeklyBatchDays || [])
            .map((d) => String(d || "").trim().toLowerCase())
            .filter((d) => Object.prototype.hasOwnProperty.call(WEEKDAY_TO_KST_INDEX, d)),
        ),
      );

      if (!enabledDays.length) {
        return baseYmd;
      }

      const enabledIndexes = enabledDays
        .map((d) => WEEKDAY_TO_KST_INDEX[d])
        .filter((v): v is number => Number.isFinite(v));

      if (!enabledIndexes.length) {
        return baseYmd;
      }

      const baseDate = new Date(`${baseYmd}T12:00:00+09:00`);
      if (Number.isNaN(baseDate.getTime())) {
        return baseYmd;
      }

      for (let offset = 0; offset < 14; offset += 1) {
        const candidate = new Date(baseDate);
        candidate.setUTCDate(candidate.getUTCDate() + offset);
        const candidateDay = getKstWeekday(candidate);
        if (!enabledIndexes.includes(candidateDay)) continue;

        const candidateYmd = toKstYmd(candidate) || baseYmd;
        return candidateYmd;
      }

      return baseYmd;
    },
    [getKstWeekday, weeklyBatchDays],
  );

  const calculateEstimatedShipDate = useCallback(() => {
    if (!leadTimes) return null;

    const cache = new Map<string, string>();

    return (diameter: number | null) => {
      if (!Number.isFinite(diameter) || diameter == null) return null;

      const requestedAt = new Date();
      const requestedYmd = toKstYmd(requestedAt);
      if (!requestedYmd) return null;

      const d = Number(diameter);
      let diameterKey: "d6" | "d8" | "d10" | "d12" = "d8";
      if (d <= 6) diameterKey = "d6";
      else if (d <= 8) diameterKey = "d8";
      else if (d <= 10) diameterKey = "d10";
      else diameterKey = "d12";

      const rawLead = leadTimes?.[diameterKey]?.minBusinessDays;
      const leadNumber = Number(rawLead);
      const leadDays = Number.isFinite(leadNumber)
        ? Math.max(1, leadNumber)
        : 1;
      const resolvedLeadDays = resolveLeadDaysForPickup(leadDays);
      const cacheKey = `${requestedYmd}:${diameterKey}:${resolvedLeadDays}`;

      if (cache.has(cacheKey)) {
        return cache.get(cacheKey) || null;
      }

      const baseShipYmd = addBusinessDaysFromKstYmd(requestedYmd, resolvedLeadDays);
      const shipYmd = resolveWeeklyPickupYmd(baseShipYmd);
      const formatted = formatKstMonthDayWithWeekday(shipYmd);

      const result = `${formatted} • ${resolvedLeadDays}영업일 후`;
      cache.set(cacheKey, result);
      return result;
    };
  }, [
    addBusinessDaysFromKstYmd,
    formatKstMonthDayWithWeekday,
    leadTimes,
    resolveLeadDaysForPickup,
    resolveWeeklyPickupYmd,
  ]);

  const getEstimatedShipForDiameter = useMemo(
    () => calculateEstimatedShipDate(),
    [calculateEstimatedShipDate],
  );

  const newSystemInfoCopy = useMemo(
    () =>
      "개발을 위해 랩 아날로그와 기성 어벗먼트 샘플을 보내주세요. 무료 크레딧을 충전해드립니다.",
    [],
  );
  const normalizeKeyPart = (s: string) => {
    try {
      return String(s || "").normalize("NFC");
    } catch {
      return String(s || "");
    }
  };

  const toNormalizedFileKey = useCallback((file: File) => {
    return `${normalizeKeyPart(file.name)}:${file.size}`;
  }, []);

  const [companionFiles, setCompanionFiles] = useState<File[]>([]);
  const [companionBypassStemMap, setCompanionBypassStemMap] = useState<
    Record<string, boolean>
  >({});
  const [companionPromptOpen, setCompanionPromptOpen] = useState(false);

  const stlStemList = useMemo(() => {
    return (files || [])
      .map((f) => String(f?.name || "").trim())
      .filter((name) => name.toLowerCase().endsWith(".stl"))
      .map((name) => getStem(name));
  }, [files]);

  const companionStems = useMemo(() => {
    const stems: string[] = [];
    for (const file of companionFiles) {
      const ext = getLowerExt(file.name);
      if (!CAD_COMPANION_EXTS.includes(ext as (typeof CAD_COMPANION_EXTS)[number])) {
        continue;
      }
      stems.push(getStem(file.name));
    }
    return stems;
  }, [companionFiles]);

  const missingCompanionStems = useMemo(() => {
    const uniqueStems = [...new Set(stlStemList)];
    return uniqueStems.filter((stlStem) => {
      const matched = companionStems.some((companionStem) =>
        isStemMatch(stlStem, companionStem),
      );
      return !matched && !companionBypassStemMap[stlStem];
    });
  }, [stlStemList, companionStems, companionBypassStemMap]);

  // STL 프리뷰에서 계산한 최대직경을 저장 (리드타임 표시용)
  const handleDiameterComputed = useCallback(
    (
      filename: string,
      maxDiameter: number,
      connectionDiameter: number,
      totalLength: number,
      taperAngle: number,
      tiltAxisVector?: { x: number; y: number; z: number } | null,
      frontPoint?: { x: number; y: number; z: number } | null,
    ) => {
      // 파일명으로 해당 파일을 찾아 최대직경 저장
      const matchedFile = files.find((f) => f.name === filename);
      if (matchedFile) {
        const fileKey = toNormalizedFileKey(matchedFile);
        setFileDiameters((prev) => ({
          ...prev,
          [fileKey]: maxDiameter,
        }));
        // caseInfosMap에도 저장하여 백엔드 제출 시 사용
        updateCaseInfos(fileKey, {
          maxDiameter,
          connectionDiameter,
          totalLength,
          taperAngle,
          tiltAxisVector,
          frontPoint,
        });
      }
    },
    [files, updateCaseInfos, toNormalizedFileKey],
  );

  const hasActiveSession = files.length > 0;
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [
    shouldRestoreDetailAfterDuplicate,
    setShouldRestoreDetailAfterDuplicate,
  ] = useState(false);
  const [showNewSystemForm, setShowNewSystemForm] = useState(false);
  const [newSystemManufacturer, setNewSystemManufacturer] = useState("");
  const [newSystemBrand, setNewSystemBrand] = useState("");
  const [newSystemFamily, setNewSystemFamily] = useState("");
  const [confirmNewSystemOpen, setConfirmNewSystemOpen] = useState(false);
  const [pendingNewSystem, setPendingNewSystem] = useState<{
    manufacturer: string;
    brand: string;
    family: string;
  } | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const companionInputRef = useRef<HTMLInputElement | null>(null);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (duplicatePromptOpen && !nextOpen) {
        return;
      }
      setIsDetailOpen(nextOpen);
    },
    [duplicatePromptOpen],
  );

  useEffect(() => {
    if (!duplicatePromptOpen && shouldRestoreDetailAfterDuplicate) {
      setIsDetailOpen(true);
      setShouldRestoreDetailAfterDuplicate(false);
    }
  }, [duplicatePromptOpen, shouldRestoreDetailAfterDuplicate]);

  useEffect(() => {
    if (!files.length) {
      setCompanionPromptOpen(false);
      return;
    }
    if (missingCompanionStems.length > 0) {
      setCompanionPromptOpen(true);
    }
  }, [files.length, missingCompanionStems.length]);

  const handleCompanionFilesSelected = useCallback(
    (selected: File[]) => {
      if (!selected.length) return;

      const accepted: File[] = [];
      const rejectedExt: string[] = [];
      const ignoredPts: string[] = [];

      for (const file of selected) {
        const ext = getLowerExt(file.name);
        if (ext === ".pts") {
          ignoredPts.push(file.name);
          continue;
        }
        if (!CAD_COMPANION_EXTS.includes(ext as (typeof CAD_COMPANION_EXTS)[number])) {
          rejectedExt.push(file.name);
          continue;
        }
        accepted.push(file);
      }

      if (rejectedExt.length) {
        toast({
          title: "지원하지 않는 보조 파일 형식",
          description:
            "지원 형식: .constructionInfo, .dentalProject, .cln, .3shapeOrder, .xml",
          variant: "destructive",
          duration: 4500,
        });
      }



      if (ignoredPts.length) {
        toast({
          title: "PTS 파일은 자동 제외되었어요",
          description: "3Shape 폴더 업로드 시 PTS는 생략됩니다.",
          duration: 2200,
        });
      }

      if (!accepted.length) return;

      onCompanionFilesAccepted?.(accepted);

      setCompanionFiles((prev) => {
        const next = [...prev];
        for (const file of accepted) {
          const key = toNormalizedFileKey(file);
          const exists = next.some((p) => toNormalizedFileKey(p) === key);
          if (!exists) next.push(file);
        }
        return next;
      });

      setCompanionBypassStemMap((prev) => {
        const next = { ...prev };
        for (const file of accepted) {
          const companionStem = getStem(file.name);
          for (const stlStem of stlStemList) {
            if (isStemMatch(stlStem, companionStem)) {
              delete next[stlStem];
            }
          }
          delete next[companionStem];
        }
        return next;
      });

      void (async () => {
        let updatedFieldsCount = 0;

        for (const companion of accepted) {
          try {
            const meta = await parseCadCompanionMetadata(companion);
            if (!meta.clinicName && !meta.patientName && !meta.tooth) {
              continue;
            }

            const stem = getStem(companion.name);
            const targets = files.filter(
              (f) =>
                String(f?.name || "").toLowerCase().endsWith(".stl") &&
                isStemMatch(getStem(f.name), stem),
            );

            for (const stl of targets) {
              const fileKey = toNormalizedFileKey(stl);
              const current = caseInfosMap?.[fileKey];
              const patch: Partial<CaseInfos> = {};

              if (!String(current?.clinicName || "").trim() && meta.clinicName) {
                patch.clinicName = meta.clinicName;
              }
              if (!String(current?.patientName || "").trim() && meta.patientName) {
                patch.patientName = meta.patientName;
              }
              if (!String(current?.tooth || "").trim() && meta.tooth) {
                patch.tooth = meta.tooth;
              }

              if (Object.keys(patch).length > 0) {
                updateCaseInfos(fileKey, patch);
                updatedFieldsCount += Object.keys(patch).length;
              }
            }
          } catch {
            // 파싱 실패는 무시하고 업로드 자체는 유지
          }
        }

        if (updatedFieldsCount > 0) {
          toast({
            title: "보조 파일에서 정보 자동 입력",
            description:
              "환자/치과/치아번호를 읽어 비어 있던 입력란에 자동 반영했습니다.",
            duration: 3500,
          });
        }
      })();

      toast({
        title: "보조 파일이 추가되었습니다",
        description: `추가됨: ${accepted.length}개`,
        duration: 2500,
      });
    },
    [
      toast,
      toNormalizedFileKey,
      files,
      stlStemList,
      caseInfosMap,
      updateCaseInfos,
      onCompanionFilesAccepted,
    ],
  );

  const handleBypassMissingCompanion = useCallback(() => {
    if (!missingCompanionStems.length) {
      setCompanionPromptOpen(false);
      return;
    }

    setCompanionBypassStemMap((prev) => {
      const next = { ...prev };
      for (const stem of missingCompanionStems) {
        next[stem] = true;
      }
      return next;
    });

    setCompanionPromptOpen(false);

    toast({
      title: "보조 파일 없이 진행",
      description:
        "작업은 계속할 수 있지만, 보조 파일 업로드 시 좌표/회전 정확도가 더 높아질 수 있습니다.",
      duration: 4500,
    });
  }, [missingCompanionStems, toast]);

  useEffect(() => {
    if (!registerCompanionFileHandler) return;
    registerCompanionFileHandler(handleCompanionFilesSelected);
  }, [registerCompanionFileHandler, handleCompanionFilesSelected]);

  useEffect(() => {
    onCompanionFilesChange?.(companionFiles);
  }, [companionFiles, onCompanionFilesChange]);

  const handleRemoveCompanionFile = useCallback((target: File) => {
    const targetKey = `${target.name}:${target.size}:${target.lastModified}`;
    setCompanionFiles((prev) =>
      prev.filter(
        (f) => `${f.name}:${f.size}:${f.lastModified}` !== targetKey,
      ),
    );
  }, []);



  const getFileWorkType = (_file: File): "abutment" | "crown" => {
    return "abutment";
  };

  useEffect(() => {
    if (
      files.length > 0 &&
      (selectedPreviewIndex === null || selectedPreviewIndex >= files.length)
    ) {
      setSelectedPreviewIndex(0);
    }
  }, [files, selectedPreviewIndex, setSelectedPreviewIndex]);

  useEffect(() => {
    if (!isDetailOpen || !files.length) return;

    const nextIndex =
      selectedPreviewIndex !== null && files[selectedPreviewIndex]
        ? selectedPreviewIndex
        : 0;

    if (detailIndex !== nextIndex) {
      setDetailIndex(nextIndex);
    }
  }, [isDetailOpen, files, selectedPreviewIndex, detailIndex]);

  // 파일이 삭제되어 상세 모달이 비어 있으면 자동으로 닫는다
  useEffect(() => {
    if (isDetailOpen) {
      const noFiles = files.length === 0;
      const invalidIndex =
        detailIndex === null || (detailIndex ?? 0) >= files.length;
      if (noFiles || invalidIndex) {
        setIsDetailOpen(false);
      }
    }
  }, [isDetailOpen, files.length, detailIndex]);

  useEffect(() => {
    if (!files.length) return;

    if (caseInfos?.workType !== "abutment") {
      setCaseInfos({
        ...caseInfos,
        workType: "abutment",
      });
    }
  }, [files, caseInfos, setCaseInfos]);

  const selectedFile =
    selectedPreviewIndex !== null ? files[selectedPreviewIndex] : null;

  const selectedFileKey =
    selectedPreviewIndex !== null && files[selectedPreviewIndex]
      ? toNormalizedFileKey(files[selectedPreviewIndex])
      : null;

  const previewFile = selectedFile;

  const hasSelectedFile = Boolean(
    selectedPreviewIndex !== null && files[selectedPreviewIndex],
  );

  const detailFile = detailIndex !== null ? files[detailIndex] : null;
  const detailFileKey = detailFile ? toNormalizedFileKey(detailFile) : null;
  const detailCaseInfos = detailFileKey
    ? caseInfosMap?.[detailFileKey] || caseInfos
    : caseInfos;
  const setDetailCaseInfos = useCallback(
    (updates: Partial<CaseInfos>) => {
      if (detailFileKey) {
        updateCaseInfos(detailFileKey, updates);
        return;
      }
      setCaseInfos(updates);
    },
    [detailFileKey, setCaseInfos, updateCaseInfos],
  );



  const resetNewSystemForm = useCallback(() => {
    setShowNewSystemForm(false);
    setNewSystemManufacturer("");
    setNewSystemBrand("");
    setNewSystemFamily("");
    setDetailCaseInfos({
      newSystemRequest: undefined,
    });
  }, [setDetailCaseInfos]);

  const handleNewSystemRequestClick = useCallback(() => {
    const manufacturer = newSystemManufacturer.trim();
    const brand = newSystemBrand.trim();
    const family = newSystemFamily.trim();
    if (!manufacturer || !brand || !family) {
      toast({
        title: "신규 임플란트 입력 필요",
        description: "Manufacturer, Brand, Family를 모두 입력해주세요.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }
    setPendingNewSystem({ manufacturer, brand, family });
    setConfirmNewSystemOpen(true);
  }, [newSystemBrand, newSystemFamily, newSystemManufacturer, toast]);

  const detailImplantInfo = {
    clinicName: detailCaseInfos?.clinicName || "",
    patientName: detailCaseInfos?.patientName || "",
    tooth: detailCaseInfos?.tooth || "",
    implantManufacturer: detailCaseInfos?.implantManufacturer || "",
    implantBrand: detailCaseInfos?.implantBrand || "",
    implantFamily: detailCaseInfos?.implantFamily || "",
    implantType: detailCaseInfos?.implantType || "",
  };

  useEffect(() => {
    if (detailCaseInfos?.newSystemRequest?.requested) {
      setShowNewSystemForm(true);
      setNewSystemManufacturer(
        detailCaseInfos.newSystemRequest.manufacturer || "",
      );
      setNewSystemBrand(detailCaseInfos.newSystemRequest.brand || "");
      setNewSystemFamily(detailCaseInfos.newSystemRequest.family || "");
    }
  }, [detailCaseInfos?.newSystemRequest?.requested]);

  const openDetailModal = (index: number) => {
    setSelectedPreviewIndex(index);
    setDetailIndex(index);
    setIsDetailOpen(true);
  };

  const findNextIndex = (
    currentIndex: number,
    options: { onlyUnverified?: boolean } = {},
  ) => {
    if (!files.length) return currentIndex;
    for (let offset = 1; offset <= files.length; offset++) {
      const candidate = (currentIndex + offset) % files.length;
      if (!options.onlyUnverified) {
        return candidate;
      }
      const candidateKey = toNormalizedFileKey(files[candidate]);
      if (!fileVerificationStatus[candidateKey]) {
        return candidate;
      }
    }
    return currentIndex;
  };

  const moveToNextDetail = (options: { onlyUnverified?: boolean } = {}) => {
    if (!files.length) return false;
    const currentIndex = detailIndex ?? selectedPreviewIndex ?? 0;
    const nextIndex = findNextIndex(currentIndex, options);
    if (nextIndex === currentIndex && options.onlyUnverified) {
      return false;
    }
    setSelectedPreviewIndex(nextIndex);
    setDetailIndex(nextIndex);
    return true;
  };

  const handleVerifyFile = async (
    index: number,
    options: { stayInModal?: boolean } = {},
  ) => {
    const file = files[index];
    if (!file) return;
    const fileKey = toNormalizedFileKey(file);
    const fileCaseInfos = caseInfosMap?.[fileKey] || caseInfos;

    const missingFields: string[] = [];
    if (!fileCaseInfos?.clinicName) {
      missingFields.push("치과이름");
    }
    if (!fileCaseInfos?.patientName) {
      missingFields.push("환자이름");
    }
    if (!fileCaseInfos?.tooth) {
      missingFields.push("치아번호");
    }
    if (!fileCaseInfos?.implantManufacturer) {
      missingFields.push("임플란트 제조사");
    }
    if (!fileCaseInfos?.implantBrand) {
      missingFields.push("임플란트 브랜드");
    }
    if (!fileCaseInfos?.implantFamily) {
      missingFields.push("Family");
    }
    if (!fileCaseInfos?.implantType) {
      missingFields.push("Type");
    }

    if (missingFields.length > 0) {
      toast({
        title: "정보를 먼저 채워주세요",
        description: `${missingFields.join(
          ", ",
        )}가(이) 비어 있습니다. 디자인과 정보가 모두 맞는지 확인 후 완료해 주세요.`,
        variant: "destructive",
      });
      return;
    }

    const nextStatus: Record<string, boolean> = {
      ...fileVerificationStatus,
      [fileKey]: true,
    };

    const hasRemainingUnverified = files.some((candidate) => {
      const key = toNormalizedFileKey(candidate);
      return !nextStatus[key];
    });

    let nextIndex = -1;

    if (hasRemainingUnverified) {
      for (let i = index + 1; i < files.length; i++) {
        const key = toNormalizedFileKey(files[i]);
        if (!nextStatus[key]) {
          nextIndex = i;
          break;
        }
      }

      if (nextIndex === -1) {
        for (let i = 0; i < index; i++) {
          const key = toNormalizedFileKey(files[i]);
          if (!nextStatus[key]) {
            nextIndex = i;
            break;
          }
        }
      }
    }

    if (hasRemainingUnverified) {
      setShouldRestoreDetailAfterDuplicate(true);
    }

    setFileVerificationStatus(nextStatus);
    if (nextIndex !== -1) {
      setSelectedPreviewIndex(nextIndex);
    }
    setHighlightUnverifiedArrows(false);

    if (options.stayInModal && hasRemainingUnverified && nextIndex !== -1) {
      setDetailIndex(nextIndex);
      setIsDetailOpen(true);
    } else {
      setIsDetailOpen(false);
    }
  };

  const showImplantSelect = useMemo(() => {
    const selectedWorkType = selectedFile
      ? getFileWorkType(selectedFile)
      : caseInfos?.workType;
    return selectedWorkType === "abutment";
  }, [selectedFile, caseInfos?.workType]);

  const requiredFieldsPresent = (info?: CaseInfos | null) => {
    if (!info) return false;
    return Boolean(
      info.clinicName &&
      info.patientName &&
      info.tooth &&
      info.implantManufacturer &&
      info.implantBrand &&
      info.implantFamily &&
      info.implantType,
    );
  };

  useEffect(() => {
    if (!focusUnverifiedTick || !files.length) return;
    const firstUnverifiedIndex = files.findIndex((file) => {
      const key = toNormalizedFileKey(file);
      return !fileVerificationStatus[key];
    });
    if (firstUnverifiedIndex < 0) return;
    const container = listContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-file-index="${firstUnverifiedIndex}"]`,
    );
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusUnverifiedTick, files, fileVerificationStatus, toNormalizedFileKey]);

  const focusSelectedCard = (index: number) => {
    const container = listContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-file-index="${index}"]`,
    );
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  const handleKeyboardNavigation = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (!files.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const currentIndex = selectedPreviewIndex ?? 0;
      const nextIndex =
        (currentIndex + direction + files.length) % files.length;
      setSelectedPreviewIndex(nextIndex);
      focusSelectedCard(nextIndex);
    }
    if (event.key === "Enter" && selectedPreviewIndex !== null) {
      event.preventDefault();
      openDetailModal(selectedPreviewIndex);
    }
  };

  return (
    <div
      className={`app-glass-card app-glass-card--lg relative flex flex-col border-2 border-gray-300 p-2.5 md:p-3.5 flex-1 min-h-0 h-full max-h-[500px]`}
    >
      <div className="app-glass-card-content flex flex-col flex-1 min-h-0 h-full">
        <div className="flex flex-col flex-1 min-h-0 h-full">
          {/* 숨겨진 파일 업로드 input - 항상 렌더링 */}
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const fileList = e.currentTarget.files;
              if (fileList) {
                onFilesSelected(Array.from(fileList));
              }
              e.currentTarget.value = "";
            }}
            accept=".stl,.constructionInfo,.dentalProject,.cln,.3shapeOrder,.xml"
          />
          <input
            ref={companionInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const fileList = e.currentTarget.files;
              if (fileList) {
                handleCompanionFilesSelected(Array.from(fileList));
              }
              e.currentTarget.value = "";
            }}
            accept=".constructionInfo,.dentalProject,.cln,.3shapeOrder,.xml"
          />
          <div className="flex justify-end gap-2 px-2 pb-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => uploadInputRef.current?.click()}
            >
              파일 추가
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancelAll}
              disabled={!files.length && companionFiles.length === 0}
            >
              전체 삭제
            </Button>
          </div>

          {missingCompanionStems.length > 0 && (
            <div className="mx-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-semibold">폴더 안 파일도 같이 올려주세요</div>
              <div className="mt-1 leading-relaxed">
                STL만 올려도 작업은 가능해요.
                <br />
                하지만 <strong>폴더 내 모든 파일</strong>을 같이 올리면,
                <span className="mx-1 inline-flex items-center gap-1 align-middle">
                  구성정보
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center text-amber-700 hover:text-amber-900"
                        aria-label="구성정보 안내"
                      >
                        <CircleHelp className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[320px] text-xs leading-relaxed">
                      CAD에서 만든 기준 정보 파일입니다.
                      원점 위치와 회전 방향 같은 기준이 들어 있어,
                      STL만 있을 때보다 더 정확한 작업에 도움이 됩니다.
                    </TooltipContent>
                  </Tooltip>
                </span>
                파일을 찾아 더 정확한 원점/회전값을 적용할 수 있어요.
              </div>
              <div className="mt-2 text-[11px] text-amber-800/90">
                예) ExoCAD: <code>.constructionInfo</code>, 3Shape: <code>.dentalProject</code> / <code>ImplantDirectionPosition*.xml</code>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => companionInputRef.current?.click()}
                >
                  누락 파일 업로드
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-amber-900"
                  onClick={handleBypassMissingCompanion}
                >
                  없이 진행
                </Button>
              </div>
            </div>
          )}
          <div
            ref={listContainerRef}
            className="flex flex-col gap-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 px-2 py-2 flex-1 min-h-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 -mx-1"
            tabIndex={0}
            role="listbox"
            aria-label="첨부된 STL 파일 목록"
            onKeyDown={handleKeyboardNavigation}
          >
            {!hasActiveSession && (
              <div className="flex flex-1 items-center justify-center py-6">
                <div
                  className={`w-full max-w-[420px] border-2 border-dashed rounded-2xl p-4 md:p-6 text-center transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer ${
                    isDragOver
                      ? "border-primary bg-primary/5"
                      : "border-gray-300 hover:border-primary/50 bg-white"
                  }`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <p className="text-xs md:text-sm text-muted-foreground">
                    파일명에서 치과이름, 환자이름, 치아번호를 자동 인식합니다.
                  </p>
                </div>
              </div>
            )}
            {hasActiveSession &&
              files
                .map((file, index) => ({ file, index }))
                .map(({ file, index }) => {
                  const filename = file.name;
                  const fileKey = toNormalizedFileKey(file);
                  const isSelected = selectedPreviewIndex === index;
                  const isVerified = !!fileVerificationStatus[fileKey];
                  const isUnverifiedHighlight =
                    highlightUnverifiedArrows && !isVerified;

                  const baseClasses = isVerified
                    ? "border border-gray-200 bg-white text-gray-900"
                    : "border border-red-300 bg-red-50 text-red-800";
                  const stateClasses = isSelected
                    ? isVerified
                      ? "border-primary bg-primary/10 text-primary shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
                      : "border-red-400 bg-red-50 shadow-[0_4px_12px_rgba(248,113,113,0.2)]"
                    : "";
                  const ringClasses = (() => {
                    if (isSelected) {
                      return "ring-2 ring-primary ring-offset-2 ring-offset-white";
                    }
                    if (isUnverifiedHighlight) {
                      return "ring-2 ring-red-400 ring-offset-2 ring-offset-white";
                    }
                    return "";
                  })();

                  // STL 프리뷰에서 계산한 최대직경 우선 사용, 없으면 caseInfosMap에서 조회
                  const computedDiameter = fileDiameters[fileKey];
                  const fileInfo = caseInfosMap?.[fileKey];
                  const diameter =
                    computedDiameter ?? fileInfo?.maxDiameter ?? null;
                  const estimatedShip = getEstimatedShipForDiameter
                    ? getEstimatedShipForDiameter(diameter)
                    : null;

                  const matchedCompanions = companionFiles.filter((companion) =>
                    isStemMatch(getStem(filename), getStem(companion.name)),
                  );
                  const primaryCompanion = matchedCompanions[0] || null;

                  return (
                    <div
                      key={`${fileKey}-${index}`}
                      onClick={() => {
                        openDetailModal(index);
                      }}
                      data-file-index={index}
                      className={`relative shrink-0 app-glass-card w-full px-4 py-3.5 rounded-xl cursor-pointer transition-all ${baseClasses} ${stateClasses} ${ringClasses} hover:border-gray-400`}
                    >
                      <div className="relative z-10 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate flex-1">{filename}</div>
                          <div className="flex items-center gap-1">
                            {isVerified && (
                              <Check
                                className="w-4 h-4 text-primary"
                                aria-label="확인됨"
                              />
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveFile(index);
                              }}
                              className="p-1 text-slate-400 hover:text-red-500"
                              aria-label="파일 삭제"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex items-center gap-1.5 text-sky-700">
                            <Badge className="bg-sky-600 hover:bg-sky-600">구성정보</Badge>
                            {primaryCompanion ? (
                              <span className="truncate" title={primaryCompanion.name}>
                                {primaryCompanion.name}
                              </span>
                            ) : (
                              <span className="truncate text-slate-500">없음</span>
                            )}
                            {matchedCompanions.length > 1 && (
                              <span className="text-slate-500">+{matchedCompanions.length - 1}개</span>
                            )}
                          </div>
                          {primaryCompanion && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveCompanionFile(primaryCompanion);
                              }}
                              className="p-1 text-slate-400 hover:text-red-500"
                              aria-label="구성정보 삭제"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {estimatedShip && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Calendar className="w-3 h-3" />
                            <span>예상 발송: {estimatedShip}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[1180px] lg:w-[980px] max-w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              STL 확인 및 정보 입력
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-[52%_48%] gap-4 items-stretch sm:pr-2">
            <div className="app-glass-card app-glass-card--lg h-full flex flex-col">
              <div className="app-glass-card-content flex-1">
                {detailFile ? (
                  <StlPreviewViewer
                    file={detailFile}
                    showOverlay={false}
                    className="min-h-[240px] h-full"
                    onDiameterComputed={handleDiameterComputed}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    STL Preview
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3 h-full">
              <div className="app-glass-card app-glass-card--lg h-full flex flex-col">
                <div className="app-glass-card-content space-y-3 text-sm flex-1 flex flex-col">
                  <div className="flex flex-col gap-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      임플란트/환자 정보
                    </div>
                  </div>
                  <NewRequestPatientImplantFields
                    caseInfos={detailCaseInfos}
                    setCaseInfos={setDetailCaseInfos}
                    showImplantSelect={showImplantSelect}
                    readOnly={!detailFile}
                    implantSelectSource="caseInfos"
                    connections={connections}
                    familyOptions={familyOptions}
                    typeOptions={typeOptions}
                    implantManufacturer={implantManufacturer}
                    setImplantManufacturer={setImplantManufacturer}
                    implantBrand={implantBrand}
                    setImplantBrand={setImplantBrand}
                    implantFamily={implantFamily}
                    setImplantFamily={setImplantFamily}
                    implantType={implantType}
                    setImplantType={setImplantType}
                    syncSelectedConnection={syncSelectedConnection}
                    clinicNameOptions={clinicNameOptions}
                    patientNameOptions={patientNameOptions}
                    teethOptions={teethOptions}
                    addClinicPreset={addClinicPreset}
                    clearAllClinicPresets={clearAllClinicPresets}
                    addPatientPreset={addPatientPreset}
                    clearAllPatientPresets={clearAllPatientPresets}
                    addTeethPreset={addTeethPreset}
                    clearAllTeethPresets={clearAllTeethPresets}
                    handleAddOrSelectClinic={handleAddOrSelectClinic}
                  />

                  {/* 유지홈 옵션 */}
                  <div className="flex flex-row items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-semibold text-slate-600">
                        유지홈
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors"
                            aria-label="유지홈 옵션 가이드"
                          >
                            <CircleHelp className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="center"
                          alignOffset={-220}
                          collisionPadding={20}
                          className="w-[700px] max-w-[calc(100vw-3rem)] p-4"
                        >
                          <div className="mb-2 text-xs font-semibold text-slate-600">
                            유지홈 옵션 예시
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-md border border-slate-200 bg-white p-2.5">
                              <img
                                src="/images/new-request/retention-groove-none.jpeg"
                                alt="유지홈 없음"
                                className="h-52 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-top"
                              />
                              <span className="mt-1.5 block text-center text-xs font-medium text-slate-600">
                                없음
                              </span>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-2.5">
                              <img
                                src="/images/new-request/retention-groove-exist.jpeg"
                                alt="유지홈 있음"
                                className="h-52 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-top"
                              />
                              <span className="mt-1.5 block text-center text-xs font-medium text-slate-600">
                                있음
                              </span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <RadioGroup
                      value={
                        detailCaseInfos?.retentionGroove === "deep"
                          ? "deep"
                          : "none"
                      }
                      onValueChange={(value) =>
                        setDetailCaseInfos({
                          retentionGroove: value as "none" | "deep",
                        })
                      }
                      className="flex items-center gap-10"
                      disabled={!detailFile}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="none"
                          id="rg-none"
                          className="border-slate-300 text-blue-600"
                        />
                        <Label
                          htmlFor="rg-none"
                          className="text-sm text-slate-700 cursor-pointer"
                        >
                          없음
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="deep"
                          id="rg-deep"
                          className="border-slate-300 text-blue-600"
                        />
                        <Label
                          htmlFor="rg-deep"
                          className="text-sm text-slate-700 cursor-pointer"
                        >
                          있음
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>



                  <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700">
                        찾으시는 임플란트가 없나요?
                      </span>
                      {!showNewSystemForm ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                          onClick={() => setShowNewSystemForm(true)}
                        >
                          신규 임플란트 요청
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleNewSystemRequestClick}
                          >
                            요청
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={resetNewSystemForm}
                          >
                            취소
                          </Button>
                        </div>
                      )}
                    </div>
                    {showNewSystemForm && (
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Input
                            placeholder="Manufacturer"
                            value={newSystemManufacturer}
                            onChange={(e) =>
                              setNewSystemManufacturer(e.target.value)
                            }
                          />
                          <Input
                            placeholder="Brand"
                            value={newSystemBrand}
                            onChange={(e) => setNewSystemBrand(e.target.value)}
                          />
                          <Input
                            placeholder="Family"
                            value={newSystemFamily}
                            onChange={(e) => setNewSystemFamily(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-4">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        if (detailIndex !== null) {
                          handleRemoveFile(detailIndex);
                        }
                        setIsDetailOpen(false);
                      }}
                    >
                      삭제
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDetailOpen(false)}
                    >
                      취소
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      className={
                        highlightUnverifiedArrows
                          ? "animate-bounce bg-primary text-white"
                          : undefined
                      }
                      onClick={() => {
                        if (detailIndex !== null) {
                          void handleVerifyFile(detailIndex, {
                            stayInModal: true,
                          });
                        }
                      }}
                    >
                      확인 & 다음
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-slate-500"
                      onClick={() => {
                        moveToNextDetail(); // 옵션 없이 호출하여 항상 다음 파일로 이동. 모달은 닫지 않음.
                      }}
                      disabled={!files.length}
                    >
                      건너뛰기
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={companionPromptOpen}
        onOpenChange={(open) => {
          setCompanionPromptOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>폴더 안 파일도 같이 올릴까요?</AlertDialogTitle>
            <AlertDialogDescription>
              STL만 올려도 작업은 가능해요.
              <br />
              다만 폴더 내 모든 파일을 같이 올리면,
              <span className="mx-1 inline-flex items-center gap-1 align-middle">
                구성정보
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center text-slate-500 hover:text-slate-700"
                      aria-label="구성정보 안내"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[320px] text-xs leading-relaxed">
                    CAD에서 만든 기준 정보 파일입니다.
                    원점 위치와 회전 방향 같은 기준이 들어 있어,
                    STL만 있을 때보다 더 정확한 작업에 도움이 됩니다.
                  </TooltipContent>
                </Tooltip>
              </span>
              파일을 찾아 더 정확한 원점/회전값을 적용할 수 있어요.

            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleBypassMissingCompanion}>
              이번엔 없이 진행
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                companionInputRef.current?.click();
                setCompanionPromptOpen(false);
              }}
            >
              누락 파일 업로드
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmNewSystemOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmNewSystemOpen(false);
            setPendingNewSystem(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              신규 임플란트 의뢰로 접수할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>{newSystemInfoCopy}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmNewSystemOpen(false);
                setPendingNewSystem(null);
              }}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingNewSystem) return;
                const { manufacturer, brand, family } = pendingNewSystem;
                const message = "랩 아날로그 샘플 한 개를 요청드립니다";
                setDetailCaseInfos({
                  implantManufacturer: manufacturer,
                  implantBrand: brand,
                  implantFamily: family,
                  newSystemRequest: {
                    requested: true,
                    manufacturer,
                    brand,
                    family,
                    message,
                    free: true,
                    tag: "신규 임플란트 의뢰",
                  },
                });
                toast({
                  title: "신규 임플란트로 접수",
                  description:
                    "무상 처리 및 랩 아날로그 샘플 요청으로 전달됩니다.",
                  duration: 3500,
                });
                setShowNewSystemForm(false);
                setConfirmNewSystemOpen(false);
                setPendingNewSystem(null);
                const nextIndex = detailIndex ?? selectedPreviewIndex;
                if (nextIndex !== null && nextIndex >= 0) {
                  await handleVerifyFile(nextIndex, { stayInModal: true });
                }
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
