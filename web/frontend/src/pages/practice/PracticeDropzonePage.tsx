/**
 * 치과병의원(practice)용 공개 드롭존 페이지 (위저드).
 *
 * 입력 순서:
 * 1) 파일드롭 & 의뢰정보 (드롭존/파일목록/기공소정보&메모 3열)
 * 2) 치과정보
 *
 * related files:
 * - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
 * - web/frontend/src/shared/components/business/settings/business/BusinessAddressFields.tsx
 * - web/frontend/src/features/auth/LoginPage.tsx
 * - web/frontend/src/store/useAuthStore.ts
 * - web/frontend/src/shared/filename/parseFilenameWithRules.ts
 * - web/backend/controllers/auth/auth.controller.js
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
 * - web/frontend/src/pages/public/Index.tsx
 * - web/frontend/src/App.tsx
 * - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
 * - web/frontend/src/shared/practice/toothWorkDraft.ts
 * - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
 * - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
 * - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  UploadCloud,
  Trash2,
  ArrowRight,
  ChevronsUpDown,
  Check,
  Eye,
  EyeOff,
  Plus,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import { GuestChatModal } from "@/features/support/components/GuestChatModal";
import { BusinessAddressFields } from "@/shared/components/business/settings/business/BusinessAddressFields";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/ui/cn";
import {
  formatPhoneNumberInput,
  isValidPhoneNumber,
} from "@/shared/components/business/settings/business/validations";
import { COMPANY_PHONE } from "@/shared/lib/contactInfo";
import {
  getFile as getFileFromIndexedDb,
  deleteFile as deleteFileFromIndexedDb,
} from "@/shared/storage/fileIndexedDB";
import {
  PRACTICE_ACCEPTED_HINT,
  getBusinessLabel,
  type SearchBusinessResult,
  usePracticeTransferStep1,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import { PracticeTransferIntakeSection } from "@/shared/components/practice/PracticeTransferIntakeSection";
import { restoreToothWorksFromDraft } from "@/shared/practice/toothWorkDraft";
import { buildPracticeTransferMemo as buildPracticeTransferMemoShared } from "@/shared/practice/transferMemo";
const PRACTICE_DRAFT_STORAGE_KEY = "practice_dropzone_draft_v2";
const PRACTICE_FILE_CACHE_META_KEY = "practice_dropzone_file_cache_meta_v1";
const PRACTICE_SESSION_META_KEY = "practice_dropzone_session_meta_v1";
const PRACTICE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 1개월
const PRACTICE_FILE_CACHE_MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300MB

const WIZARD_STEPS = ["파일드롭 & 의뢰정보", "치과정보"] as const;



type PracticeDropzoneDraft = {
  step: 0 | 1;
  selectedLab: SearchBusinessResult | null;
  requestMemo: string;
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks?: ToothWorkSelection[];
  patientName: string;
  practiceName: string;
  staffName: string;
  phone: string;
  address: string;
  addressDetail: string;
  zipCode: string;
  fileKeys: string[];
};

type PracticeFileCacheMeta = {
  key: string;
  size: number;
  addedAt: number;
};

type ApiSuccessMessagePayload = {
  success?: boolean;
  message?: string;
};

type RegisterResponsePayload = {
  success?: boolean;
  message?: string;
  data?: {
    token?: string;
    refreshToken?: string;
  };
};



type PracticeAuthMode = "checking" | "session" | "login" | "signup" | "recover";

type PracticeSessionMeta = {
  issuedAt: number;
  userId: string;
};

const asApiMessagePayload = (value: unknown): ApiSuccessMessagePayload => {
  if (!value || typeof value !== "object") return {};
  return value as ApiSuccessMessagePayload;
};

const asRegisterPayload = (value: unknown): RegisterResponsePayload => {
  if (!value || typeof value !== "object") return {};
  return value as RegisterResponsePayload;
};



const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const CHOSEONG = [
  "g",
  "kk",
  "n",
  "d",
  "tt",
  "r",
  "m",
  "b",
  "pp",
  "s",
  "ss",
  "",
  "j",
  "jj",
  "ch",
  "k",
  "t",
  "p",
  "h",
] as const;
const JUNGSEONG = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
] as const;
const JONGSEONG = [
  "",
  "k",
  "k",
  "ks",
  "n",
  "nj",
  "nh",
  "t",
  "l",
  "lk",
  "lm",
  "lb",
  "ls",
  "lt",
  "lp",
  "lh",
  "m",
  "p",
  "ps",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "h",
] as const;

const romanizeHangulSyllable = (ch: string) => {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_END) return "";

  const sIndex = code - HANGUL_BASE;
  const cho = Math.floor(sIndex / (21 * 28));
  const jung = Math.floor((sIndex % (21 * 28)) / 28);
  const jong = sIndex % 28;

  return `${CHOSEONG[cho]}${JUNGSEONG[jung]}${JONGSEONG[jong]}`;
};

const toAsciiSlug = (value: string) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      out += romanizeHangulSyllable(ch);
      continue;
    }
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
      continue;
    }
    if (ch === " " || ch === "-" || ch === "_") {
      out += "-";
      continue;
    }
  }

  return out
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
};

const makePracticeSignupEmail = (practiceName: string) => {
  const safeName = toAsciiSlug(practiceName || "practice").slice(0, 24);
  const nonce = `${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
  return `practice.${safeName || "clinic"}-${nonce}@abuts.fit`;
};

const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;
const PRESET_PROSTHESIS_TYPES = ["크라운", "브리지", "Pontic", "인레이"] as const;
const TOOTH_TENS_OPTIONS = ["1", "2", "3", "4"] as const;
const TOOTH_ONES_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

type ToothWorkSelection = {
  toothNumber: string;
  prosthesisType: string;
  customAbutment: boolean;
  bridgeLinkedTeeth: string[];
};

const toKstDateInputValue = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
};

const addDaysToDateInput = (dateInput: string, days: number) => {
  const base = String(dateInput || "").trim();
  if (!base) return "";
  const d = new Date(`${base}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return toKstDateInputValue(d);
};

const normalizeArrivalDefaultDays = (value: number) => Math.max(0, Math.floor(Number(value || 0)));

const sanitizeProsthesisTypeLabel = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  if (/^커스텀어벗\+?크라운$/i.test(compact)) return "크라운";
  if (/^커스텀어벗\+?브리지$/i.test(compact)) return "브리지";
  if (/^커스텀어벗$/i.test(compact)) return "";
  return trimmed;
};

const normalizeProsthesisTypes = (items: string[]) => {
  const deduped = Array.from(
    new Map(
      items
        .map((item) => sanitizeProsthesisTypeLabel(String(item || "")))
        .filter(Boolean)
        .map((item) => {
          if (/^pontic$/i.test(item)) return ["pontic", "Pontic"] as const;
          return [item.toLowerCase(), item] as const;
        }),
    ).values(),
  );

  if (!deduped.some((item) => /^pontic$/i.test(item))) deduped.push("Pontic");
  return deduped;
};

const resolveDefaultProsthesisType = (types: string[]) =>
  types.includes("크라운") ? "크라운" : types[0] || "크라운";

const getAdjacentTeeth = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [] as string[];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out: string[] = [];

  // 같은 사분면 내 인접 치아
  if (ones > 1) out.push(`${tens}${ones - 1}`);
  if (ones < 8) out.push(`${tens}${ones + 1}`);

  // 정중선 연결: 11 ↔ 21, 31 ↔ 41
  if (ones === 1) {
    if (tens === 1) out.push("21");
    if (tens === 2) out.push("11");
    if (tens === 3) out.push("41");
    if (tens === 4) out.push("31");
  }

  return Array.from(new Set(out));
};

const toToothSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.POSITIVE_INFINITY;
  return Number(raw);
};

const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" || prosthesisType === "Pontic";

const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) =>
  prosthesisType === "크라운" || prosthesisType === "브리지";

const normalizeToothWorks = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const toothNumber = String(row?.toothNumber || "").trim();
      const prosthesisType = String(row?.prosthesisType || "").trim();
      const customAbutment = isCustomAbutmentSupportedProsthesisType(prosthesisType)
        ? Boolean(row?.customAbutment)
        : false;
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isBridgeLikeProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
      };
    })
    .filter((row) => /^[1-4][1-8]$/.test(row.toothNumber) && row.prosthesisType);

const serializeToothWorks = (rows: ToothWorkSelection[]) =>
  normalizeToothWorks(rows)
    .map((row) => {
      const linked =
        isBridgeLikeProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length > 0
          ? `(${[row.toothNumber, ...row.bridgeLinkedTeeth].join("-")})`
          : "";
      const custom =
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) && row.customAbutment
          ? "+커스텀어벗"
          : "";
      return `${row.toothNumber}=${row.prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

const buildPracticeTransferMemo = (params: {
  memo: string;
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
}) => buildPracticeTransferMemoShared(params);

const toPracticeFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const readPracticeFileCacheMeta = (): PracticeFileCacheMeta[] => {
  try {
    const raw = localStorage.getItem(PRACTICE_FILE_CACHE_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        key: String(item?.key || ""),
        size: Number(item?.size || 0),
        addedAt: Number(item?.addedAt || 0),
      }))
      .filter((item) => item.key && Number.isFinite(item.size) && item.size >= 0);
  } catch {
    return [];
  }
};

const writePracticeFileCacheMeta = (items: PracticeFileCacheMeta[]) => {
  try {
    localStorage.setItem(PRACTICE_FILE_CACHE_META_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
};

const readPracticeSessionMeta = (): PracticeSessionMeta | null => {
  try {
    const raw = localStorage.getItem(PRACTICE_SESSION_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const issuedAt = Number(parsed?.issuedAt || 0);
    const userId = String(parsed?.userId || "").trim();
    if (!issuedAt || !userId) return null;
    return { issuedAt, userId };
  } catch {
    return null;
  }
};

const writePracticeSessionMeta = (meta: PracticeSessionMeta) => {
  try {
    localStorage.setItem(PRACTICE_SESSION_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
};

const clearPracticeSessionMeta = () => {
  try {
    localStorage.removeItem(PRACTICE_SESSION_META_KEY);
  } catch {
    // ignore
  }
};

const clearPracticeDropzoneCaches = async () => {
  const cached = readPracticeFileCacheMeta();
  const keys = Array.from(new Set(cached.map((row) => String(row.key || "").trim()).filter(Boolean)));

  await Promise.all(
    keys.map((key) =>
      deleteFileFromIndexedDb(key).catch(() => {
        // ignore
      }),
    ),
  );

  writePracticeFileCacheMeta([]);

  try {
    localStorage.removeItem(PRACTICE_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const PracticeDropzonePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const { toast } = useToast();
  const {
    loginWithToken,
    practiceLogin,
    logout,
    token: authToken,
    user: authUser,
    isAuthenticated,
  } = useAuthStore();

  const [step, setStep] = useState<0 | 1>(0);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const fileCacheMetaKey = PRACTICE_FILE_CACHE_META_KEY;
  const fileCacheMaxTotalBytes = PRACTICE_FILE_CACHE_MAX_TOTAL_BYTES;
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token: authToken });

  const {
    files,
    setFiles,
    totalSizeMb,
    selectedLab,
    setSelectedLab,
    requestMemo,
    setRequestMemo,
    labSearch,
    setLabSearch,
    labSearchResults,
    labOpen,
    setLabOpen,
    labSearching,
    recentLabs,
    recentLabsInitialized,
    rememberLab,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
  } = usePracticeTransferStep1({
    fileCacheMetaKey,
    fileCacheMaxTotalBytes,
  });

  const todayDate = useMemo(() => toKstDateInputValue(new Date()), []);
  const [orderDate, setOrderDate] = useState(todayDate);
  const [arrivalDefaultDays, setArrivalDefaultDays] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [arrivalDate, setArrivalDate] = useState(
    addDaysToDateInput(todayDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
  );
  const [prosthesisTypes, setProsthesisTypes] = useState<string[]>([...PRESET_PROSTHESIS_TYPES]);
  const [prosthesisTypeInput, setProsthesisTypeInput] = useState("");
  const [arrivalSettingsDialogOpen, setArrivalSettingsDialogOpen] = useState(false);
  const [arrivalDefaultDaysDraft, setArrivalDefaultDaysDraft] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [prosthesisTypeSettingsDialogOpen, setProsthesisTypeSettingsDialogOpen] = useState(false);
  const [prosthesisTypeCatalogDraft, setProsthesisTypeCatalogDraft] = useState<string[]>([
    ...PRESET_PROSTHESIS_TYPES,
  ]);
  const [toothWorks, setToothWorks] = useState<ToothWorkSelection[]>([
    {
      toothNumber: "",
      prosthesisType: "크라운",
      customAbutment: false,
      bridgeLinkedTeeth: [],
    },
  ]);

  const [patientName, setPatientName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [showAccessPassword, setShowAccessPassword] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [zipCode, setZipCode] = useState("");

  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [signupCompleted, setSignupCompleted] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const [authMode, setAuthMode] = useState<PracticeAuthMode>("checking");
  const [recoverStaffName, setRecoverStaffName] = useState("");
  const [recoverPhone, setRecoverPhone] = useState("");
  const [recoverNewPassword, setRecoverNewPassword] = useState("");
  const [showRecoverNewPassword, setShowRecoverNewPassword] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showGuestChat, setShowGuestChat] = useState(false);
  const consumedPrefillLocationKeyRef = useRef<string | null>(null);
  const suppressDraftPersistRef = useRef(false);

  const isPhoneValid = isValidPhoneNumber(phone);

  const isStrongPassword = useMemo(() => {
    const p = String(accessPassword || "");
    if (p.length < 10) return false;
    if (p.includes("$")) return false;
    if (!/[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
    return true;
  }, [accessPassword]);

  const normalizedProsthesisTypes = useMemo(
    () => normalizeProsthesisTypes(prosthesisTypes),
    [prosthesisTypes],
  );
  const normalizedToothWorks = useMemo(() => normalizeToothWorks(toothWorks), [toothWorks]);
  const normalizedPatientName = useMemo(() => String(patientName || "").trim(), [patientName]);

  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (files.length === 0) missing.push("첨부 파일");
    if (!selectedLab?._id) missing.push("기공소");
    if (!normalizedPatientName) missing.push("환자명");
    if (normalizedToothWorks.length === 0) missing.push("보철물 형태");
    return missing;
  }, [files.length, selectedLab?._id, normalizedPatientName, normalizedToothWorks.length]);

  const missingStep1Fields = useMemo(() => {
    const missing = [...missingRequiredFields];
    if (!orderDate) missing.push("주문일");
    if (!arrivalDate) missing.push("도착일");
    return missing;
  }, [missingRequiredFields, orderDate, arrivalDate]);
  const autoClinicName = useMemo(() => {
    const profileClinic = String(authUser?.practiceProfile?.clinicName || "").trim();
    if (profileClinic) return profileClinic;
    const accountClinic = String(
      (authUser as { business?: string } | null)?.business ||
        authUser?.companyName ||
        authUser?.name ||
        "",
    ).trim();
    if (accountClinic) return accountClinic;
    return String(practiceName || "").trim();
  }, [authUser, practiceName]);

  const orderedToothWorkRows = useMemo(() => {
    if (toothWorks.length === 0) return [] as Array<{
      row: ToothWorkSelection;
      originalIndex: number;
      linkPrev: boolean;
      linkNext: boolean;
    }>;

    const rows = toothWorks.map((row, idx) => ({ row, idx }));
    const toothIndices = rows
      .filter(({ row }) => /^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()))
      .map(({ idx }) => idx);

    const byTooth = new Map<string, number>();
    for (const { row, idx } of rows) {
      const tooth = String(row.toothNumber || "").trim();
      if (!/^[1-4][1-8]$/.test(tooth)) continue;
      if (!byTooth.has(tooth)) byTooth.set(tooth, idx);
    }

    const toothSet = new Set(toothIndices);
    const adjacency = new Map<number, Set<number>>();
    toothIndices.forEach((idx) => adjacency.set(idx, new Set<number>()));

    for (const idx of toothIndices) {
      const row = rows[idx].row;
      const links = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
      for (const linked of links) {
        const linkedIdx = byTooth.get(String(linked || "").trim());
        if (linkedIdx == null) continue;
        if (!toothSet.has(linkedIdx)) continue;
        adjacency.get(idx)?.add(linkedIdx);
        adjacency.get(linkedIdx)?.add(idx);
      }
    }

    const componentKeyByIdx = new Map<number, string>();
    const visited = new Set<number>();

    for (const seed of toothIndices) {
      if (visited.has(seed)) continue;
      const stack = [seed];
      const component: number[] = [];
      visited.add(seed);

      while (stack.length > 0) {
        const cur = stack.pop() as number;
        component.push(cur);
        const nexts = adjacency.get(cur) || new Set<number>();
        for (const n of nexts) {
          if (visited.has(n)) continue;
          visited.add(n);
          stack.push(n);
        }
      }

      component.sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const key = component.map((idx) => rows[idx].row.toothNumber).join("-");
      component.forEach((idx) => componentKeyByIdx.set(idx, key));
    }

    const emitted = new Set<number>();
    const orderedIndices: number[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      if (emitted.has(i)) continue;
      const key = componentKeyByIdx.get(i);
      if (!key) {
        orderedIndices.push(i);
        emitted.add(i);
        continue;
      }

      const componentIndices = toothIndices.filter((idx) => componentKeyByIdx.get(idx) === key);
      const componentSet = new Set(componentIndices);
      const sortedByTooth = [...componentIndices].sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const endpoints = sortedByTooth.filter((idx) => {
        const degree = [...(adjacency.get(idx) || new Set<number>())].filter((n) => componentSet.has(n))
          .length;
        return degree <= 1;
      });
      const start = endpoints[0] ?? sortedByTooth[0];

      const orderedComponent: number[] = [];
      const componentVisited = new Set<number>();
      let current = start;
      let prev = -1;

      while (current >= 0 && !componentVisited.has(current)) {
        orderedComponent.push(current);
        componentVisited.add(current);

        const nextCandidates = [...(adjacency.get(current) || new Set<number>())]
          .filter((n) => componentSet.has(n) && !componentVisited.has(n))
          .sort(
            (a, b) =>
              toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
          );

        if (nextCandidates.length === 0) break;
        const preferred = nextCandidates.find((n) => n !== prev);
        const nextIdx = preferred ?? nextCandidates[0];
        prev = current;
        current = nextIdx;
      }

      if (orderedComponent.length < componentIndices.length) {
        const remains = sortedByTooth.filter((idx) => !componentVisited.has(idx));
        orderedComponent.push(...remains);
      }

      orderedComponent.forEach((idx) => {
        if (emitted.has(idx)) return;
        orderedIndices.push(idx);
        emitted.add(idx);
      });
    }

    return orderedIndices.map((originalIndex, orderedIndex, arr) => {
      const row = rows[originalIndex].row;
      const key = componentKeyByIdx.get(originalIndex) || "";
      const prevIdx = orderedIndex > 0 ? arr[orderedIndex - 1] : -1;
      const nextIdx = orderedIndex < arr.length - 1 ? arr[orderedIndex + 1] : -1;
      const linkPrev =
        key.length > 0 && prevIdx >= 0 && componentKeyByIdx.get(prevIdx) === key;
      const linkNext =
        key.length > 0 && nextIdx >= 0 && componentKeyByIdx.get(nextIdx) === key;

      return { row, originalIndex, linkPrev, linkNext };
    });
  }, [toothWorks]);

  useEffect(() => {
    setToothWorks((prev) =>
      prev.map((row) => ({
        ...row,
        prosthesisType: normalizedProsthesisTypes.includes(row.prosthesisType)
          ? row.prosthesisType
          : resolveDefaultProsthesisType(normalizedProsthesisTypes),
      })),
    );
  }, [normalizedProsthesisTypes]);

  const handleAddToothWorkRow = () => {
    setToothWorks((prev) => [
      ...prev,
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
      },
    ]);
  };

  const handleClearRequestIntakeCache = () => {
    try {
      localStorage.removeItem(PRACTICE_DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }

    setLabOpen(false);
    setLabSearch("");
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    setOrderDate(todayDate);
    setArrivalDate(addDaysToDateInput(todayDate, arrivalDefaultDays));
    setToothWorks([
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
      },
    ]);

    toast({
      title: "의뢰 접수 캐시 삭제",
      description: "의뢰 접수 카드의 임시 입력값을 초기화했습니다.",
    });
  };

  const handleSaveArrivalSettings = () => {
    const nextDays = normalizeArrivalDefaultDays(arrivalDefaultDaysDraft);
    setArrivalDefaultDays(nextDays);
    setArrivalDate(addDaysToDateInput(orderDate, nextDays));
    setArrivalSettingsDialogOpen(false);
  };

  const handleSaveProsthesisTypeSettings = () => {
    const nextTypes = normalizeProsthesisTypes(prosthesisTypeCatalogDraft);
    setProsthesisTypes(nextTypes.length > 0 ? nextTypes : [...PRESET_PROSTHESIS_TYPES]);
    setProsthesisTypeSettingsDialogOpen(false);
  };

  const canGoStep2 = missingStep1Fields.length === 0;

  const canSubmitBase = missingStep1Fields.length === 0;

  const canSubmitSignup = Boolean(
    canSubmitBase &&
      String(practiceName || "").trim() &&
      String(staffName || "").trim() &&
      isPhoneValid &&
      String(address || "").trim() &&
      String(zipCode || "").trim() &&
      isStrongPassword,
  );

  const canSubmitLogin = Boolean(
    canSubmitBase &&
      String(practiceName || "").trim() &&
      String(accessPassword || "").trim(),
  );

  const canPrimaryAction =
    authMode === "session"
      ? canSubmitBase
      : authMode === "login"
        ? canSubmitLogin
        : authMode === "signup"
          ? canSubmitSignup
          : false;



  useEffect(() => {
    let cancelled = false;

    const restoreDraft = async () => {
      try {
        const raw = localStorage.getItem(PRACTICE_DRAFT_STORAGE_KEY);
        if (!raw) {
          setDraftHydrated(true);
          return;
        }
        const parsed = JSON.parse(raw) as Partial<PracticeDropzoneDraft>;

        if (cancelled) return;
        setStep(parsed.step === 1 ? 1 : 0);
        setSelectedLab(parsed.selectedLab || null);
        setRequestMemo(String(parsed.requestMemo || ""));
        const restoredOrderDate = todayDate;
        const restoredArrivalDefaultDaysRaw = Number(parsed.arrivalDefaultDays);
        const restoredArrivalDefaultDays = Number.isFinite(restoredArrivalDefaultDaysRaw)
          ? Math.max(0, Math.floor(restoredArrivalDefaultDaysRaw))
          : DEFAULT_ARRIVAL_OFFSET_DAYS;
        setOrderDate(restoredOrderDate);
        setArrivalDefaultDays(restoredArrivalDefaultDays);
        setArrivalDate(
          String(parsed.arrivalDate || "").trim() ||
            addDaysToDateInput(restoredOrderDate, restoredArrivalDefaultDays),
        );
        const restoredProsthesisTypes = normalizeProsthesisTypes(
          Array.isArray(parsed.prosthesisTypes) ? parsed.prosthesisTypes : [...PRESET_PROSTHESIS_TYPES],
        );
        setProsthesisTypes(restoredProsthesisTypes);
        const restoredToothWorks =
          Array.isArray(parsed.toothWorks) && parsed.toothWorks.length > 0
            ? restoreToothWorksFromDraft(parsed.toothWorks, {
                prosthesisTypes: restoredProsthesisTypes,
                isCustomAbutmentSupportedProsthesisType,
                isBridgeLikeProsthesisType,
                getAdjacentTeeth,
                fallbackProsthesisType: "크라운",
              })
            : [];
        setToothWorks(
          restoredToothWorks.length > 0
            ? restoredToothWorks
            : [{ toothNumber: "", prosthesisType: resolveDefaultProsthesisType(restoredProsthesisTypes), customAbutment: false, bridgeLinkedTeeth: [] }],
        );
        setPatientName(String(parsed.patientName || ""));
        setPracticeName(String(parsed.practiceName || ""));
        setStaffName(String(parsed.staffName || ""));
        setPhone(formatPhoneNumberInput(String(parsed.phone || "")));
        setAddress(String(parsed.address || ""));
        setAddressDetail(String(parsed.addressDetail || ""));
        setZipCode(String(parsed.zipCode || ""));

        const fileKeys = Array.isArray(parsed.fileKeys)
          ? parsed.fileKeys.map((k) => String(k || "")).filter(Boolean)
          : [];

        if (fileKeys.length > 0) {
          const restoredFiles = await Promise.all(
            fileKeys.map(async (key) => {
              const file = await getFileFromIndexedDb(key).catch(() => null);
              return file;
            }),
          );

          if (!cancelled) {
            const valid = restoredFiles.filter((f): f is File => f instanceof File);
            setFiles(valid);

            if (valid.length !== fileKeys.length) {
              const validKeys = new Set(valid.map((file) => toPracticeFileKey(file)));
              const nextMeta = readPracticeFileCacheMeta().filter((row) =>
                validKeys.has(row.key),
              );
              writePracticeFileCacheMeta(nextMeta);

              toast({
                title: "일부 파일 복원 실패",
                description: "캐시에서 찾을 수 없는 파일은 제외되었습니다.",
                duration: 3000,
              });
            }
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setDraftHydrated(true);
      }
    };

    void restoreDraft();

    return () => {
      cancelled = true;
    };
  }, [setFiles, setRequestMemo, setSelectedLab, setToothWorks, toast, todayDate]);

  useEffect(() => {
    if (!draftHydrated) return;

    if (!searchParamsKey) return;

    const qp = new URLSearchParams(searchParamsKey);
    const labId = String(qp.get("labId") || qp.get("l") || "").trim();
    const labName = String(qp.get("labName") || qp.get("n") || "").trim();
    const labBusinessNumber = String(qp.get("labBn") || qp.get("b") || "").trim();

    if (!labId && !labName) return;

    if (labName) {
      setSelectedLab({
        _id: labId || `prefilled:${labName}`,
        name: labName,
        businessNumber: labBusinessNumber,
      });
      return;
    }

    if (!labId) return;

    let cancelled = false;

    const resolveLabById = async () => {
      try {
        const res = await apiFetch<unknown>({
          path: `/api/businesses/public/${encodeURIComponent(labId)}?businessType=${encodeURIComponent("requestor")}`,
          method: "GET",
        });

        if (!res.ok) {
          if (!cancelled) {
            setSelectedLab({
              _id: labId,
              name: "",
              businessNumber: labBusinessNumber,
            });
          }
          return;
        }

        const body = res.data;
        const data =
          body && typeof body === "object" && "data" in (body as Record<string, unknown>)
            ? (body as { data?: unknown }).data
            : body;

        const item = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const resolvedName = String(item?.name || "").trim();
        const resolvedBusinessNumber = String(item?.businessNumber || "").trim();

        if (cancelled) return;

        setSelectedLab({
          _id: String(item?._id || labId).trim() || labId,
          name: resolvedName,
          businessNumber: resolvedBusinessNumber || labBusinessNumber,
          representativeName: String(item?.representativeName || "").trim() || undefined,
          address: String(item?.address || "").trim() || undefined,
          businessType: String(item?.businessType || "requestor").trim() || "requestor",
        });
      } catch {
        if (cancelled) return;
        setSelectedLab({
          _id: labId,
          name: "",
          businessNumber: labBusinessNumber,
        });
      }
    };

    void resolveLabById();

    return () => {
      cancelled = true;
    };
  }, [draftHydrated, searchParamsKey, setSelectedLab]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (consumedPrefillLocationKeyRef.current === location.key) return;

    const state =
      location.state && typeof location.state === "object"
        ? (location.state as { prefilledFiles?: unknown })
        : null;

    const incomingFiles = Array.isArray(state?.prefilledFiles)
      ? state.prefilledFiles.filter((item): item is File => item instanceof File)
      : [];

    consumedPrefillLocationKeyRef.current = location.key;

    if (incomingFiles.length === 0) return;

    handleIncomingFiles(incomingFiles);
    setStep(0);
  }, [draftHydrated, handleIncomingFiles, location.key, location.state]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (suppressDraftPersistRef.current) return;

    const payload: PracticeDropzoneDraft = {
      step,
      selectedLab,
      requestMemo,
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      prosthesisTypes: normalizedProsthesisTypes,
      toothWorks,
      patientName,
      practiceName,
      staffName,
      phone,
      address,
      addressDetail,
      zipCode,
      fileKeys: files.map((file) => toPracticeFileKey(file)),
    };
    try {
      localStorage.setItem(PRACTICE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [
    address,
    addressDetail,
    draftHydrated,
    phone,
    practiceName,
    patientName,
    requestMemo,
    orderDate,
    arrivalDate,
    arrivalDefaultDays,
    normalizedProsthesisTypes,
    toothWorks,
    selectedLab,
    staffName,
    step,
    zipCode,
    files,
  ]);

  useEffect(() => {
    if (!draftHydrated) return;

    const sessionMeta = readPracticeSessionMeta();
    const now = Date.now();
    const hasValidSessionMeta =
      Boolean(sessionMeta?.issuedAt) &&
      now - Number(sessionMeta?.issuedAt || 0) <= PRACTICE_SESSION_TTL_MS;
    const hadExpiredSession =
      Boolean(sessionMeta?.issuedAt) && !hasValidSessionMeta;

    const isPracticeLoggedIn =
      Boolean(authToken) &&
      authUser?.role === "practice" &&
      Boolean(authUser?.id);

    if (isPracticeLoggedIn) {
      const pp = authUser?.practiceProfile || null;
      setPracticeName(String(pp?.clinicName || authUser?.companyName || practiceName || ""));
      setStaffName(String(pp?.staffName || authUser?.name || staffName || ""));
      setPhone(formatPhoneNumberInput(String(pp?.phone || phone || "")));
      setAddress(String(pp?.address || address || ""));
      setAddressDetail(String(pp?.addressDetail || addressDetail || ""));
      setZipCode(String(pp?.zipCode || zipCode || ""));
      writePracticeSessionMeta({
        issuedAt: now,
        userId: String(authUser?.id || ""),
      });
      setSignupCompleted(true);
      setAuthMode("session");
      return;
    }

    if (hadExpiredSession) {
      clearPracticeSessionMeta();
      logout();
      setSignupCompleted(false);
      setAuthMode((prev) =>
        prev === "checking" || prev === "session" ? "login" : prev,
      );
      return;
    }

    if (sessionMeta?.issuedAt) {
      setSignupCompleted(false);
      setAuthMode((prev) =>
        prev === "checking" || prev === "session" ? "login" : prev,
      );
      return;
    }

    setAuthMode((prev) => (prev === "checking" ? "signup" : prev));
  }, [
    draftHydrated,
    authToken,
    authUser,
    logout,
    practiceName,
    staffName,
    phone,
    address,
    addressDetail,
    zipCode,
  ]);

  const extractDataFromResponse = <T,>(raw: unknown): T | null => {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as { data?: unknown };
    if (payload.data === undefined) return raw as T;
    return payload.data as T;
  };



  const submitPracticeRequest = async (token: string) => {
    if (missingStep1Fields.length > 0) {
      toast({
        title: "필수 입력 항목을 확인해주세요",
        description: `미입력 항목: ${missingStep1Fields.join(", ")}`,
        variant: "destructive",
      });
      return false;
    }

    if (arrivalDate < orderDate) {
      toast({
        title: "도착일을 확인해주세요",
        description: "도착일은 주문일보다 빠를 수 없습니다.",
        variant: "destructive",
      });
      return false;
    }



    setRequestSubmitting(true);
    try {
      const uploadedTempFiles = await uploadFilesWithToast(files);
      const transferId = makeTransferId();
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks,
      });

      const caseInfosPayload = files.map((file, index) => {
        const tempFile = uploadedTempFiles[index];
        const parsed = parseFilenameWithRules(file.name);
        const tooth = String(parsed.tooth || "").trim();

        return {
          clinicName: autoClinicName,
          patientName: normalizedPatientName,
          tooth,
          workType: "abutment",
          designSoftware: "3Shape",
          file: {
            originalName: tempFile.originalName,
            size: tempFile.size,
            mimetype: tempFile.mimetype,
            s3Key: tempFile.key,
          },
          newSystemRequest: {
            requested: true,
            manufacturer: "",
            brand: "",
            family: "",
            message: `[기공소: ${String(selectedLab?.name || "")}] ${transferMemo}\n[전송ID: ${transferId}]`,
            free: true,
            tag: "practice_dropzone",
          },
          // related files:
          // - web/backend/models/practiceTransfer.model.js
          // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
          // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
          // practice 제출은 PracticeTransfer SSOT로 저장 (Request 컬렉션 경유 금지)
          practiceRouting: {
            targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
            targetLabName: String(selectedLab?.name || "").trim(),
          },
        };
      });

      const submitRes = await apiFetch<unknown>({
        path: "/api/practice/transfers",
        method: "POST",
        token,
        jsonBody: {
          transferId,
          targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
          targetLabName: String(selectedLab?.name || "").trim(),
          orderDate,
          arrivalDate,
          arrivalDefaultDays,
          transferMemo,
          caseInfos: caseInfosPayload,
        },
      });
      if (!submitRes.ok) {
        const body = asApiMessagePayload(submitRes.data);
        throw new Error(String(body?.message || "전송 제출에 실패했습니다."));
      }

      suppressDraftPersistRef.current = true;
      await clearPracticeDropzoneCaches();

      setRequestSubmitted(true);
      rememberLab(selectedLab);
      setFiles([]);
      setSelectedLab(null);
      setPatientName("");
      setRequestMemo("");
      setToothWorks([
        {
          toothNumber: "",
          prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
          customAbutment: false,
          bridgeLinkedTeeth: [],
        },
      ]);

      toast({
        title: "의뢰 제출 완료",
        description: "가입 직후 의뢰가 정상 접수되었습니다. 대시보드로 이동합니다.",
      });

      navigate("/practice/dashboard", { replace: true });
      return true;
    } catch (err) {
      toast({
        title: "의뢰 제출 실패",
        description:
          err instanceof Error ? err.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 6000,
      });
      return false;
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handlePracticeLoginAndContinue = async () => {
    if (!canSubmitLogin) {
      toast({
        title: "입력 확인",
        description: "치과명과 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setAuthSubmitting(true);
    try {
      const result = await practiceLogin(
        String(practiceName || "").trim(),
        String(accessPassword || ""),
      );
      if (!result?.success) {
        toast({
          title: "로그인 실패",
          description: String(result?.message || "다시 시도해주세요."),
          variant: "destructive",
        });
        return;
      }

      const latestToken = String(useAuthStore.getState().token || "").trim();
      const latestUser = useAuthStore.getState().user;
      if (!latestToken || !latestUser?.id) {
        toast({
          title: "로그인 실패",
          description: "세션 정보를 저장하지 못했습니다. 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      writePracticeSessionMeta({
        issuedAt: Date.now(),
        userId: String(latestUser.id),
      });

      const pp = latestUser.practiceProfile || null;
      setStaffName(String(pp?.staffName || latestUser.name || staffName || ""));
      setPhone(formatPhoneNumberInput(String(pp?.phone || phone || "")));
      setAddress(String(pp?.address || address || ""));
      setAddressDetail(String(pp?.addressDetail || addressDetail || ""));
      setZipCode(String(pp?.zipCode || zipCode || ""));

      setSignupCompleted(true);
      setAuthMode("session");

      await submitPracticeRequest(latestToken);
    } finally {
      setAuthSubmitting(false);
    }
  };



  const handlePracticePasswordChange = async () => {
    if (!String(practiceName || "").trim() || !String(recoverStaffName || "").trim() || !String(recoverPhone || "").trim() || !String(recoverNewPassword || "").trim()) {
      toast({
        title: "입력 확인",
        description: "치과명, 담당직원명, 전화번호, 새 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const p = String(recoverNewPassword || "");
    const valid = p.length >= 10 && !p.includes("$") && /[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p);
    if (!valid) {
      toast({
        title: "비밀번호 형식 오류",
        description: "10자 이상 + 특수문자 포함, $ 문자는 사용할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await apiFetch<unknown>({
        path: "/api/auth/practice/password/change",
        method: "POST",
        jsonBody: {
          clinicName: String(practiceName || "").trim(),
          staffName: String(recoverStaffName || "").trim(),
          phone: String(recoverPhone || "").trim(),
          newPassword: String(recoverNewPassword || ""),
        },
      });
      const body = asApiMessagePayload(res.data);
      if (!res.ok || !body?.success) {
        toast({
          title: "비밀번호 변경 실패",
          description: String(body?.message || "입력 정보를 확인해주세요."),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "비밀번호 변경 완료",
        description: "새 비밀번호로 로그인해주세요.",
      });
      setAccessPassword("");
      setAuthMode("login");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignupAndContinue = async () => {
    if (!canSubmitSignup) {
      toast({
        title: "입력 확인",
        description: "치과정보와 접속 비밀번호를 포함해 필수값을 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!isStrongPassword) {
      toast({
        title: "비밀번호 형식을 확인해주세요",
        description: "10자 이상 + 특수문자 포함, $ 문자는 사용할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    if (signupCompleted) {
      const token = String(authToken || "").trim();
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          description: "다시 로그인 후 의뢰 제출을 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      await submitPracticeRequest(token);
      return;
    }

    setSignupSubmitting(true);
    try {
      const generatedEmail = makePracticeSignupEmail(practiceName);
      const registerRes = await apiFetch<unknown>({
        path: "/api/auth/practice/register",
        method: "POST",
        jsonBody: {
          clinicName: String(practiceName || "").trim(),
          staffName: String(staffName || "").trim(),
          password: accessPassword,
          phone: String(phone || "").trim(),
          address: String(address || "").trim(),
          addressDetail: String(addressDetail || "").trim(),
          zipCode: String(zipCode || "").trim(),
          generatedEmail,
        },
      });

      const registerBody = asRegisterPayload(registerRes.data);
      if (!registerRes.ok || !registerBody?.success) {
        toast({
          title: "회원가입 실패",
          description: String(registerBody?.message || "다시 시도해주세요."),
          variant: "destructive",
        });
        return;
      }

      const token = String(registerBody?.data?.token || "").trim();
      const refreshToken = registerBody?.data?.refreshToken
        ? String(registerBody.data.refreshToken)
        : null;
      if (!token) {
        toast({
          title: "회원가입 완료",
          description: "로그인 토큰이 없어 자동 로그인하지 못했습니다. 로그인 후 계속 진행해주세요.",
        });
        return;
      }

      await loginWithToken(token, refreshToken);
      const latestUser = useAuthStore.getState().user;
      if (latestUser?.id) {
        writePracticeSessionMeta({
          issuedAt: Date.now(),
          userId: String(latestUser.id),
        });
      }

      setSignupCompleted(true);
      setAuthMode("session");
      toast({
        title: "회원가입 완료",
        description: "이어서 현재 작성한 의뢰를 접수합니다.",
      });

      await submitPracticeRequest(token);
    } catch {
      toast({
        title: "회원가입 실패",
        description: "네트워크 상태를 확인 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSignupSubmitting(false);
    }
  };

  const handleStep2PrimaryAction = async () => {
    if (authMode === "session") {
      const token = String(authToken || "").trim();
      if (!token) {
        toast({
          title: "세션 만료",
          description: "다시 로그인해주세요.",
          variant: "destructive",
        });
        clearPracticeSessionMeta();
        logout();
        setAuthMode("login");
        return;
      }
      await submitPracticeRequest(token);
      return;
    }

    if (authMode === "login") {
      await handlePracticeLoginAndContinue();
      return;
    }

    if (authMode === "signup") {
      await handleSignupAndContinue();
    }
  };

  const handlePracticeAuthFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void handleStep2PrimaryAction();
  };

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="bg-gradient-subtle p-3 md:p-4 flex flex-col h-full min-h-0 overflow-hidden"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-2.5">
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/70 shadow-sm">
          <CardHeader className="px-6 py-2.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-h-[52px] items-center">
                <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">
                  구강스캔 파일 전송
                </CardTitle>
              </div>

              <div className="w-full rounded-xl border bg-white/80 px-3 py-2 lg:w-[420px]">
                <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  {WIZARD_STEPS.map((label, idx) => {
                    const isActive = step === idx;
                    const isDone = step > idx;

                    return (
                      <li key={label} className="relative">
                        {idx < WIZARD_STEPS.length - 1 && (
                          <div className="pointer-events-none hidden sm:block absolute left-[calc(50%+1rem)] right-[-1rem] top-4 h-[2px] bg-slate-200" />
                        )}

                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                              isActive && "border-blue-600 bg-blue-600 text-white",
                              !isActive && isDone && "border-emerald-600 bg-emerald-600 text-white",
                              !isActive && !isDone && "border-slate-300 bg-white text-slate-500",
                            )}
                          >
                            {isDone ? <Check className="h-4 w-4" /> : idx + 1}
                          </div>

                          <div className="min-w-0">
                            <p className="text-[10px] text-slate-500">STEP {idx + 1}</p>
                            <p
                              className={cn(
                                "truncate text-sm font-semibold",
                                isActive && "text-blue-700",
                                !isActive && isDone && "text-emerald-700",
                                !isActive && !isDone && "text-slate-600",
                              )}
                            >
                              {label}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 pb-2">
            {step === 0 && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <PracticeTransferIntakeSection
                  filePaneProps={{
                    acceptedHint: PRACTICE_ACCEPTED_HINT,
                    fileInputId: "practice-scan-file-input",
                    files: files.map((file, index) => ({
                      key: `${file.name}:${file.size}:${file.lastModified}:${index}`,
                      name: file.name,
                      size: file.size,
                    })),
                    totalSizeMb,
                    listViewportClassName: "max-h-[17.5rem]",
                    onPickFiles: handleIncomingFiles,
                    onRemoveFile: (key) => {
                      const idx = files.findIndex(
                        (file, fileIdx) =>
                          `${file.name}:${file.size}:${file.lastModified}:${fileIdx}` === key,
                      );
                      if (idx >= 0) removeFile(idx);
                    },
                    onClearAllFiles: () => {
                      void clearAllFiles();
                    },
                  }}
                  requestIntakeProps={{
                    selectedLab,
                    setSelectedLab,
                    labOpen,
                    setLabOpen,
                    labSearch,
                    setLabSearch,
                    labSearchResults,
                    labSearching,
                    recentLabs,
                    recentLabsInitialized,
                    autoClinicName,
                    patientName,
                    setPatientName,
                    orderDate,
                    setOrderDate,
                    arrivalDate,
                    setArrivalDate,
                    arrivalDefaultDays,
                    setArrivalDefaultDaysDraft,
                    setArrivalSettingsDialogOpen,
                    normalizedProsthesisTypes,
                    setProsthesisTypeCatalogDraft,
                    setProsthesisTypeSettingsDialogOpen,
                    toothWorks,
                    setToothWorks,
                    requestMemo,
                    setRequestMemo,
                    memoInputId: "practice-request-memo",
                    prosthesisTypeSelectWidthClassName: "w-[110px]",
                    showBridgeConnections: false,
                    toothTensOptions: TOOTH_TENS_OPTIONS,
                    toothOnesOptions: TOOTH_ONES_OPTIONS,
                    onClearAll: handleClearRequestIntakeCache,
                  }}
                />
              </div>
            )}

            {step === 1 && (
              <form
                id="practice-auth-form"
                className="space-y-4"
                onSubmit={handlePracticeAuthFormSubmit}
              >

                {authMode === "checking" && (
                  <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    세션 상태를 확인 중입니다...
                  </div>
                )}

                {authMode === "session" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                    로그인 세션이 확인되었습니다. 치과정보 입력 없이 바로 의뢰를 제출할 수 있습니다.
                  </div>
                )}

                {authMode === "login" && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <div className="space-y-2 space-x-2">
                      <Label htmlFor="practice-login-name" className="text-sm">치과명</Label>
                      <Input
                        id="practice-login-name"
                        className="h-11 text-base"
                        value={practiceName}
                        onChange={(e) => setPracticeName(e.target.value)}
                        placeholder="예: OO치과의원"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="practice-login-password" className="text-sm">접속 비밀번호</Label>
                      <div className="relative">
                        <Input
                          id="practice-login-password"
                          type={showAccessPassword ? "text" : "password"}
                          className="h-11 text-base pr-10"
                          value={accessPassword}
                          onChange={(e) => setAccessPassword(e.target.value)}
                          placeholder="비밀번호"
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-3 text-slate-500 hover:text-slate-700"
                          onClick={() => setShowAccessPassword((prev) => !prev)}
                          aria-label="비밀번호 보기"
                        >
                          {showAccessPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {authMode === "recover" && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-sm">치과명</Label>
                        <Input
                          className="h-11 text-base"
                          value={practiceName}
                          onChange={(e) => setPracticeName(e.target.value)}
                          placeholder="예: OO치과의원"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">담당직원명</Label>
                        <Input
                          className="h-11 text-base"
                          value={recoverStaffName}
                          onChange={(e) => setRecoverStaffName(e.target.value)}
                          placeholder="예: 김담당"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">전화번호</Label>
                        <Input
                          className="h-11 text-base"
                          value={recoverPhone}
                          onChange={(e) => setRecoverPhone(formatPhoneNumberInput(e.target.value))}
                          placeholder="예: 02-123-4567"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">새 비밀번호</Label>
                        <div className="relative">
                          <Input
                            type={showRecoverNewPassword ? "text" : "password"}
                            className="h-11 text-base pr-10"
                            value={recoverNewPassword}
                            onChange={(e) => setRecoverNewPassword(e.target.value)}
                            placeholder="10자 이상 + 특수문자"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-3 text-slate-500 hover:text-slate-700"
                            onClick={() => setShowRecoverNewPassword((prev) => !prev)}
                            aria-label="새 비밀번호 보기"
                          >
                            {showRecoverNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            if (isAuthenticated) {
                              navigate("/practice/inquiries");
                              return;
                            }
                            setShowGuestChat(true);
                          }}
                        >
                          관리자에게 문의
                        </Button>
                        <a
                          href={`tel:${COMPANY_PHONE.replace(/[^0-9+]/g, "")}`}
                          className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-sm hover:bg-slate-100"
                        >
                          어벗츠에 전화하기 ({COMPANY_PHONE})
                        </a>
                      </div>

                      <div className="flex justify-end lg:min-w-[140px]">
                        <Button type="button" className="h-10" onClick={() => void handlePracticePasswordChange()} disabled={authSubmitting}>
                          {authSubmitting ? "변경 중..." : "비밀번호 변경"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {authMode === "signup" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="practiceName" className="text-sm">치과명</Label>
                    <Input
                      id="practiceName"
                      className="h-11 text-base"
                      value={practiceName}
                      onChange={(e) => setPracticeName(e.target.value)}
                      placeholder="예: OO치과의원"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accessPassword" className="text-sm">접속 비밀번호</Label>
                    <div className="relative">
                      <Input
                        id="accessPassword"
                        type={showAccessPassword ? "text" : "password"}
                        className={cn(
                          "h-11 text-base pr-10",
                          accessPassword && !isStrongPassword
                            ? "border-destructive focus-visible:ring-destructive"
                            : "",
                        )}
                        value={accessPassword}
                        onChange={(e) => setAccessPassword(e.target.value)}
                        placeholder="10자 이상 + 특수문자"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-3 text-slate-500 hover:text-slate-700"
                        onClick={() => setShowAccessPassword((prev) => !prev)}
                        aria-label="비밀번호 보기"
                      >
                        {showAccessPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {accessPassword && !isStrongPassword ? (
                      <p className="text-xs text-destructive">
                        10자 이상 + 특수문자 포함, `$` 불가
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="staffName" className="text-sm">담당직원명</Label>
                    <Input
                      id="staffName"
                      className="h-11 text-base"
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      placeholder="예: 김담당"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm">전화번호</Label>
                    <Input
                      id="phone"
                      className={cn(
                        "h-11 text-base",
                        phone.trim() && !isPhoneValid
                          ? "border-destructive focus-visible:ring-destructive"
                          : "",
                      )}
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneNumberInput(e.target.value))}
                      placeholder="예: 02-123-4567"
                    />
                    {phone.trim() && !isPhoneValid ? (
                      <p className="text-xs text-destructive">
                        올바른 전화번호 형식으로 입력해주세요.
                      </p>
                    ) : null}
                  </div>

                    <div className="space-y-2 lg:col-span-4">
                      <BusinessAddressFields
                        address={address}
                        addressDetail={addressDetail}
                        zipCode={zipCode}
                        onChangeAddress={setAddress}
                        onChangeAddressDetail={setAddressDetail}
                        onChangeZipCode={setZipCode}
                        addressLabel="주소"
                        rowLayout="address-detail-zip"
                      />
                    </div>
                  </div>


                </div>
                )}

                {authMode !== "checking" && authMode !== "session" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={authMode === "login" ? "secondary" : "outline"}
                      className="h-9 min-w-[120px]"
                      onClick={() => setAuthMode("login")}
                    >
                      로그인
                    </Button>
                    <Button
                      type="button"
                      variant={authMode === "signup" ? "secondary" : "outline"}
                      className="h-9 min-w-[120px]"
                      onClick={() => setAuthMode("signup")}
                    >
                      회원가입
                    </Button>
                    <Button
                      type="button"
                      variant={authMode === "recover" ? "secondary" : "outline"}
                      className="h-9 min-w-[120px]"
                      onClick={() => setAuthMode("recover")}
                    >
                      비밀번호 변경
                    </Button>
                  </div>
                )}
              </form>
            )}

            <Dialog
              open={arrivalSettingsDialogOpen}
              onOpenChange={(open) => {
                setArrivalSettingsDialogOpen(open);
                if (open) {
                  setArrivalDefaultDaysDraft(arrivalDefaultDays);
                }
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>소요일 설정</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <Input
                    id="practice-arrival-default-days-dialog"
                    type="number"
                    min={0}
                    max={365}
                    value={arrivalDefaultDaysDraft}
                    onChange={(e) =>
                      setArrivalDefaultDaysDraft(normalizeArrivalDefaultDays(Number(e.target.value || 0)))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    주문일 기준으로 도착일이 자동 계산됩니다.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setArrivalSettingsDialogOpen(false)}
                  >
                    취소
                  </Button>
                  <Button type="button" onClick={handleSaveArrivalSettings}>
                    저장
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={prosthesisTypeSettingsDialogOpen}
              onOpenChange={(open) => {
                setProsthesisTypeSettingsDialogOpen(open);
                if (open) {
                  setProsthesisTypeCatalogDraft(normalizedProsthesisTypes);
                }
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>보철물 형태 항목 설정</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
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
                        const trimmed = String(prosthesisTypeInput || "").trim();
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
                        const trimmed = String(prosthesisTypeInput || "").trim();
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
                    onClick={() => setProsthesisTypeSettingsDialogOpen(false)}
                  >
                    취소
                  </Button>
                  <Button type="button" onClick={handleSaveProsthesisTypeSettings}>
                    저장
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-5 text-base"
            onClick={() => navigate("/")}
          >
            메인으로
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                className="h-11 px-5 text-base"
                onClick={() => setStep((prev) => (prev - 1) as 0 | 1)}
              >
                이전
              </Button>
            )}

            {step < 1 && (
              <Button
                type="button"
                className="h-11 px-6 text-base"
                disabled={
                  authMode === "session"
                    ? requestSubmitting || requestSubmitted || authSubmitting
                    : false
                }
                onClick={() => {
                  if (step === 0 && !canGoStep2) {
                    toast({
                      title: "필수 입력 항목을 확인해주세요",
                      description: `미입력 항목: ${missingStep1Fields.join(", ")}`,
                      variant: "destructive",
                    });
                    return;
                  }

                  if (step === 0 && authMode === "session") {
                    void handleStep2PrimaryAction();
                    return;
                  }

                  setStep((prev) => (prev + 1) as 0 | 1);
                }}
              >
                {authMode === "session"
                  ? requestSubmitting
                    ? "의뢰 제출 중..."
                    : "의뢰 보내기"
                  : "다음"}
              </Button>
            )}

            {step === 1 && (
              <Button
                type="submit"
                form="practice-auth-form"
                className="h-11 px-6 text-base bg-blue-600 text-white hover:bg-blue-700"
                disabled={
                  !canPrimaryAction ||
                  signupSubmitting ||
                  requestSubmitting ||
                  requestSubmitted ||
                  authSubmitting ||
                  authMode === "recover" ||
                  authMode === "checking"
                }
              >
                {requestSubmitted
                  ? "의뢰 제출 완료"
                  : authSubmitting
                    ? authMode === "login"
                      ? "로그인 처리 중..."
                      : "처리 중..."
                    : signupSubmitting
                      ? "회원가입 처리 중..."
                      : requestSubmitting
                        ? "의뢰 제출 중..."
                        : authMode === "session"
                          ? "의뢰 제출하기"
                          : authMode === "login"
                            ? "로그인 후 의뢰계속하기"
                            : authMode === "recover"
                              ? "비밀번호 변경에서 진행"
                              : signupCompleted
                                ? "의뢰 제출하기"
                                : "회원가입 후 계속하기"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </PageFileDropZone>
  );
};
