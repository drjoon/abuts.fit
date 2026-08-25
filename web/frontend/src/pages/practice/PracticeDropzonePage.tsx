/**
 * 기공의뢰서 드롭존 — 치과 발신 전용 UI.
 * 계정은 의뢰인(requestor + practice)으로 통합. 레거시 practice role도 로그인 허용.
 *
 * 입력 순서:
 * 1) 의뢰서 작성 (기공소·환자·보철물·메모 + 파일첨부)
 * 2) 의뢰인 계정 (로그인/회원가입)
 *
 * related files:
 * - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
 * - web/frontend/src/features/auth/LoginPage.tsx
 * - web/frontend/src/store/useAuthStore.ts
 * - web/frontend/src/shared/business/requestorCapabilities.ts
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
 * - web/frontend/src/shared/onboarding/wizard/SettingsWizard.tsx
 * - web/frontend/src/shared/hooks/useS3TempUpload.ts
 * - web/frontend/src/shared/hooks/useFilePreUpload.ts
 * - 2026-08-13: 파일카드에 사전 업로드 프로그레스바.
 * - 2026-08-13: 전송 시 사전 업로드 재사용·미완료만 대기. 재업로드 토스트 없음.
 * - 2026-08-13: 커스텀어벗 설정 모달 기본=디자인+생산. 로그인 후 계정 설정으로 저장.
 * - 2026-08-13: 기공의뢰 모달에서 디자인+생산 고정. 생산만 클릭은 어벗생산의뢰로 이동.
 * - 2026-08-13: 어벗 체크인데 임플란트·스캔바디 프리셋 없으면 전송 불가.
 * - 2026-08-14: 비로그인 환봉 제조사 추가요청을 로그인 후 문의·요청으로 동기화.
 * - 2026-08-14: 프리셋 편집을 열 때 도입 스펙을 서버에서 다시 불러온다.
 * - 2026-08-14: 환봉 도입 이벤트 수신 시 프리셋 배지·로컬 미러 갱신.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  UploadCloud,
  Trash2,
  ArrowRight,
  ChevronsUpDown,
  Check,
  CheckCircle2,
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
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore, type User } from "@/store/useAuthStore";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { toTempUploadFileKey, useFilePreUpload } from "@/shared/hooks/useFilePreUpload";
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
  DialogDescription,
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
import { RESPONSIVE } from "@/shared/ui/responsive";
import {
  canSendPracticeTransfer,
  resolveRequestorProfile,
} from "@/shared/business/requestorCapabilities";
import {
  formatPhoneNumberInput,
  isValidEmail,
  isValidMobilePhone,
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
import {
  buildPracticeTransferMemo as buildPracticeTransferMemoShared,
  emptyToothWorkCustomSpecs,
  isLinkableProsthesisType,
  listMissingAbutmentPresetTeeth,
  normalizeAbutmentFavorites,
  ABUTMENT_PRODUCT_MODE,
  normalizeAccountAbutmentProductMode,
  normalizeImplantFavorites,
  pickToothWorkCustomSpecs,
  type AbutmentProductMode,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
  type ToothWorkSelection as SharedToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import {
  ROUND_BAR_REQUEST_UPDATED_EVENT,
  applyRoundBarRequestUpdate,
  isRoundBarFavorite,
  submitRoundBarManufacturerRequest,
  type RoundBarRequestUpdatedPayload,
} from "@/shared/practice/roundBarAbutment";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { kstAddBusinessDays, kstYmdDiffDays } from "@/shared/date/kst";
import { PracticeRushConfirmDialog } from "@/shared/components/practice/PracticeRushConfirmDialog";
import {
  PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
  PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE,
  PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS,
  getPracticeWorkPeriodDays,
  isPracticeWorkPeriodBlocked,
  isPracticeWorkPeriodLateWarning,
  shouldEnablePracticeRushProcessing,
} from "@/shared/practice/practiceWorkPeriod";
import {
  normalizeLabArrivalDefaults,
  resolveLabArrivalDefaultDays,
  upsertLabArrivalDefault,
  type PracticeLabArrivalDefault,
} from "@/shared/practice/labArrivalDefaults";
import {
  PRACTICE_DROPZONE_DRAFT_KEY,
  clearPracticeSharedFormLocalStorage,
  readPreferredIntakeFormForDropzone,
  syncIntakeFieldsToTransferFormLocal,
} from "@/shared/practice/practiceTransferFormLocal";
const PRACTICE_DRAFT_STORAGE_KEY = PRACTICE_DROPZONE_DRAFT_KEY;
const PRACTICE_FILE_CACHE_META_KEY = "practice_dropzone_file_cache_meta_v1";
const PRACTICE_SESSION_META_KEY = "practice_dropzone_session_meta_v1";
const PRACTICE_SIGNUP_VERIFICATION_KEY = "practice_dropzone_signup_verification_v1";
/** FileTransferPage와 동일 SSOT — 비로그인 프리셋도 여기 저장 후 가입/로그인 시 서버 반영 */
const PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY = "practice_transfer_settings_v1";
const PRACTICE_SESSION_TTL_MS = 3 * 365.25 * 24 * 60 * 60 * 1000; // 3년 (JWT 세션과 맞춤)
const PRACTICE_FILE_CACHE_MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300MB

const WIZARD_STEPS = ["의뢰서 작성", "의뢰인 계정"] as const;

const readLocalFavoriteSettings = () => {
  try {
    const raw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
    if (!raw) {
      return {
        implantFavorites: [] as PracticeImplantFavorite[],
        abutmentFavorites: [] as PracticeAbutmentFavorite[],
        defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(undefined),
        hasDefaultAbutmentProductMode: false,
      };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hasDefaultAbutmentProductMode = Object.prototype.hasOwnProperty.call(
      parsed,
      "defaultAbutmentProductMode",
    );
    return {
      implantFavorites: normalizeImplantFavorites(parsed.implantFavorites),
      abutmentFavorites: normalizeAbutmentFavorites(parsed.abutmentFavorites),
      defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(
        parsed.defaultAbutmentProductMode,
      ),
      hasDefaultAbutmentProductMode,
    };
  } catch {
    return {
      implantFavorites: [] as PracticeImplantFavorite[],
      abutmentFavorites: [] as PracticeAbutmentFavorite[],
      defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(undefined),
      hasDefaultAbutmentProductMode: false,
    };
  }
};

const writeLocalFavoriteSettings = (params: {
  implantFavorites: PracticeImplantFavorite[];
  abutmentFavorites: PracticeAbutmentFavorite[];
  defaultAbutmentProductMode?: AbutmentProductMode;
}) => {
  try {
    const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
    const existing =
      existingRaw && typeof existingRaw === "string"
        ? (JSON.parse(existingRaw) as Record<string, unknown>)
        : {};
    localStorage.setItem(
      PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
      JSON.stringify({
        ...existing,
        implantFavorites: normalizeImplantFavorites(params.implantFavorites),
        abutmentFavorites: normalizeAbutmentFavorites(params.abutmentFavorites),
        ...(params.defaultAbutmentProductMode
          ? {
              defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(
                params.defaultAbutmentProductMode,
              ),
            }
          : {}),
        savedAt: Date.now(),
      }),
    );
  } catch {
    // ignore
  }
};



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
  clinicName?: string;
  directorName?: string;
  staffName?: string;
  email: string;
  phone: string;
  fileKeys: string[];
  rushProcessing?: boolean;
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

/** 드롭존 발신 계정: 레거시 practice role 또는 의뢰인(practice cap) */
const canUseDropzoneSenderAccount = (user: User | null | undefined) => {
  if (!user?.id) return false;
  if (user.role === "practice") return true;
  if (user.role !== "requestor") return false;
  return canSendPracticeTransfer(
    resolveRequestorProfile({
      userKind: user.requestorKind,
      userServices: user.requestorServices,
      userCaps: user.requestorCapabilities,
      userRole: user.role,
      businessVerified: user.businessVerified,
    }),
  );
};

type PracticeSignupVerificationCache = {
  email?: { value: string; verifiedAt: string };
  phone?: { value: string; verifiedAt: string };
};

const readSignupVerificationCache = (): PracticeSignupVerificationCache => {
  try {
    const raw = localStorage.getItem(PRACTICE_SIGNUP_VERIFICATION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PracticeSignupVerificationCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeSignupVerificationCache = (next: PracticeSignupVerificationCache) => {
  try {
    localStorage.setItem(PRACTICE_SIGNUP_VERIFICATION_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
};

const clearSignupVerificationCache = () => {
  try {
    localStorage.removeItem(PRACTICE_SIGNUP_VERIFICATION_KEY);
  } catch {
    // ignore
  }
};

const persistEmailVerificationCache = (value: string, verifiedAt = new Date().toISOString()) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return;
  const prev = readSignupVerificationCache();
  writeSignupVerificationCache({
    ...prev,
    email: { value: normalized, verifiedAt },
  });
};

const persistPhoneVerificationCache = (value: string, verifiedAt = new Date().toISOString()) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return;
  const prev = readSignupVerificationCache();
  writeSignupVerificationCache({
    ...prev,
    phone: { value: digits, verifiedAt },
  });
};

const clearEmailVerificationCache = () => {
  const prev = readSignupVerificationCache();
  if (!prev.email) return;
  const { email: _removed, ...rest } = prev;
  writeSignupVerificationCache(rest);
};

const clearPhoneVerificationCache = () => {
  const prev = readSignupVerificationCache();
  if (!prev.phone) return;
  const { phone: _removed, ...rest } = prev;
  writeSignupVerificationCache(rest);
};

const asApiMessagePayload = (value: unknown): ApiSuccessMessagePayload => {
  if (!value || typeof value !== "object") return {};
  return value as ApiSuccessMessagePayload;
};

const asRegisterPayload = (value: unknown): RegisterResponsePayload => {
  if (!value || typeof value !== "object") return {};
  return value as RegisterResponsePayload;
};


const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const normalizeArrivalDefaultDays = (value: number) =>
  Math.max(0, Math.min(365, Math.floor(Number(value || 0))));
const PRESET_PROSTHESIS_TYPES = ["인레이", "크라운", "커스텀어벗", "브리지", "유지장치", "임시치아", "결손치"] as const;

type ToothWorkSelection = SharedToothWorkSelection;

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

const sanitizeProsthesisTypeLabel = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  if (/^커스텀어벗\+?크라운$/i.test(compact)) return "크라운";
  if (/^커스텀어벗\+?브리지$/i.test(compact)) return "브리지";
  if (/^(?:커스텀)?어벗디자인$/i.test(compact)) return "커스텀어벗";
  if (/^커스텀어벗$/i.test(compact)) return "커스텀어벗";
  if (compact === "가철성임시치아" || compact === "임시치아") return "임시치아";
  return trimmed;
};

const normalizeProsthesisTypes = (items: string[]) => {
  const deduped = Array.from(
    new Map(
      items
        .map((item) => sanitizeProsthesisTypeLabel(String(item || "")))
        .filter(Boolean)
        .map((item) => {
          if (/^pontic$/i.test(item)) return ["브리지", "브리지"] as const;
          if (
            item === "결손치" ||
            item === "작업X" ||
            item === "상실치" ||
            /^작업x$/i.test(item) ||
            /^missing(?:\s*tooth)?$/i.test(item)
          ) {
            return ["결손치", "결손치"] as const;
          }
          return [item.toLowerCase(), item] as const;
        }),
    ).values(),
  );

  if (!deduped.some((item) => item === "결손치" || item === "작업X" || item === "상실치")) {
    deduped.push("결손치");
  }
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

const isMissingToothProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "결손치" ||
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
};

const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" ||
  prosthesisType === "유지장치" ||
  isMissingToothProsthesisType(prosthesisType);

const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) => {
  const compact = String(prosthesisType || "").trim().replace(/\s+/g, "");
  return (
    compact === "커스텀어벗" ||
    prosthesisType === "크라운" ||
    prosthesisType === "브리지" ||
    compact === "임시치아" ||
    compact === "가철성임시치아" ||
    /^(?:커스텀)?어벗디자인$/i.test(compact)
  );
};

const normalizeToothWorks = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const toothNumber = String(row?.toothNumber || "").trim();
      const prosthesisTypeRaw = String(row?.prosthesisType || "").trim();
      const prosthesisType = isMissingToothProsthesisType(prosthesisTypeRaw)
        ? "결손치"
        : prosthesisTypeRaw;
      const customAbutment = /커스텀어벗|(?:커스텀)?어벗디자인/i.test(
        String(prosthesisType || "").replace(/\s+/g, ""),
      )
        ? true
        : Boolean(row?.customAbutment);
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isLinkableProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs(row, customAbutment),
      };
    })
    .filter((row) => /^[1-4][1-8]$/.test(row.toothNumber) && row.prosthesisType);

const serializeToothWorks = (rows: ToothWorkSelection[]) =>
  normalizeToothWorks(rows)
    .map((row) => {
      const linked =
        isLinkableProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length > 0
          ? `(${[row.toothNumber, ...row.bridgeLinkedTeeth].join("-")})`
          : "";
      const implantParts = [
        row.implantManufacturer,
        row.implantBrand,
        row.implantFamily,
        row.implantType,
      ].map((v) => String(v || "").trim());
      const hasImplant = implantParts.some(Boolean);
      const abutmentParts = [
        row.abutmentManufacturer,
        row.abutmentDiameter,
        row.abutmentHeight,
      ].map((v) => String(v || "").trim());
      const hasAbutment = abutmentParts.some(Boolean);
      const custom =
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) && row.customAbutment
          ? `+커스텀어벗${hasImplant ? `{${implantParts.join("/")}}` : ""}${
              hasAbutment ? `[${abutmentParts.join("/")}]` : ""
            }`
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
  patientName?: string;
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

  clearPracticeSharedFormLocalStorage();
};

export const PracticeDropzonePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const { toast } = useToast();
  const {
    login,
    loginWithToken,
    logout,
    token: authToken,
    user: authUser,
    isAuthenticated,
  } = useAuthStore();

  const [step, setStep] = useState<0 | 1>(0);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const fileCacheMetaKey = PRACTICE_FILE_CACHE_META_KEY;
  const fileCacheMaxTotalBytes = PRACTICE_FILE_CACHE_MAX_TOTAL_BYTES;
  const {
    ensureFilesUploaded,
    peekCachedUploadedFiles,
    preUploadFiles,
    forgetFile,
    clearPreUploadCache,
    uploadProgress,
  } = useFilePreUpload({ token: authToken });
  const { connections: implantConnections } = useImplantConnectionCatalog(authToken);

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
    pinnedLabs,
    rememberLab,
    removeRecentLab,
    togglePinLab,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
  } = usePracticeTransferStep1({
    fileCacheMetaKey,
    fileCacheMaxTotalBytes,
  });

  useEffect(() => {
    if (!authToken || files.length === 0) return;
    preUploadFiles(files);
  }, [authToken, files, preUploadFiles]);

  const removeFileWithCache = useCallback(
    (idx: number) => {
      const target = files[idx];
      if (target) forgetFile(target);
      removeFile(idx);
    },
    [files, forgetFile, removeFile],
  );

  const clearAllFilesWithCache = useCallback(async () => {
    clearPreUploadCache();
    await clearAllFiles();
  }, [clearAllFiles, clearPreUploadCache]);

  const todayDate = useMemo(() => toKstDateInputValue(new Date()), []);
  const [orderDate, setOrderDate] = useState(todayDate);
  const [accountArrivalDefaultDays, setAccountArrivalDefaultDays] = useState(
    DEFAULT_ARRIVAL_OFFSET_DAYS,
  );
  const [labArrivalDefaults, setLabArrivalDefaults] = useState<PracticeLabArrivalDefault[]>(
    [],
  );
  const [arrivalDefaultDays, setArrivalDefaultDays] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [arrivalDate, setArrivalDate] = useState(
    addDaysToDateInput(todayDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
  );
  const [rushProcessing, setRushProcessing] = useState(false);
  const accountArrivalDefaultDaysRef = useRef(accountArrivalDefaultDays);
  accountArrivalDefaultDaysRef.current = accountArrivalDefaultDays;
  const labArrivalDefaultsRef = useRef(labArrivalDefaults);
  labArrivalDefaultsRef.current = labArrivalDefaults;

  const applyArrivalDefaultForLabId = useCallback((labId: string | null | undefined, labName?: string | null) => {
    const nextDays = resolveLabArrivalDefaultDays(
      labId,
      labArrivalDefaultsRef.current,
      accountArrivalDefaultDaysRef.current,
      labName,
    );
    const orderYmd = String(orderDate || todayDate || "").trim() || todayDate;
    const nextArrival = addDaysToDateInput(orderYmd, nextDays);
    setArrivalDefaultDays(nextDays);
    if (nextArrival) {
      setArrivalDate(nextArrival);
      setRushProcessing(
        shouldEnablePracticeRushProcessing({
          orderYmd,
          arrivalYmd: nextArrival,
        }),
      );
    }
  }, [orderDate, todayDate]);

  const selectLabForIntake = useCallback(
    (lab: SearchBusinessResult | null) => {
      setSelectedLab(lab);
      applyArrivalDefaultForLabId(lab?._id, lab?.name);
    },
    [applyArrivalDefaultForLabId, setSelectedLab],
  );

  const persistLabArrivalDefault = useCallback(
    (nextDays: number) => {
      const labId = String(selectedLab?._id || "").trim();
      const labName = String(selectedLab?.name || "").trim();
      if (OBJECT_ID_RE.test(labId)) {
        const nextLabs = upsertLabArrivalDefault(labArrivalDefaultsRef.current, {
          labAnchorId: labId,
          labName,
          arrivalDefaultDays: nextDays,
        });
        setLabArrivalDefaults(nextLabs);
        labArrivalDefaultsRef.current = nextLabs;
        try {
          const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
          const existing =
            existingRaw && typeof existingRaw === "string"
              ? (JSON.parse(existingRaw) as Record<string, unknown>)
              : {};
          localStorage.setItem(
            PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
            JSON.stringify({
              ...existing,
              labArrivalDefaults: nextLabs,
              arrivalDefaultDays: accountArrivalDefaultDaysRef.current,
              savedAt: Date.now(),
            }),
          );
        } catch {
          // ignore
        }
        if (authToken) {
          void apiFetch({
            path: "/api/practice/transfers/settings",
            method: "POST",
            token: authToken,
            jsonBody: {
              labArrivalDefault: {
                labAnchorId: labId,
                labName,
                arrivalDefaultDays: nextDays,
              },
            },
          }).catch(() => {});
        }
        return;
      }
      setAccountArrivalDefaultDays(nextDays);
      accountArrivalDefaultDaysRef.current = nextDays;
      try {
        const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
        const existing =
          existingRaw && typeof existingRaw === "string"
            ? (JSON.parse(existingRaw) as Record<string, unknown>)
            : {};
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            ...existing,
            arrivalDefaultDays: nextDays,
            labArrivalDefaults: labArrivalDefaultsRef.current,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }
      if (authToken) {
        void apiFetch({
          path: "/api/practice/transfers/settings",
          method: "POST",
          token: authToken,
          jsonBody: { arrivalDefaultDays: nextDays },
        }).catch(() => {});
      }
    },
    [authToken, selectedLab?._id, selectedLab?.name],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.arrivalDefaultDays === "number") {
        const nextAccount = normalizeArrivalDefaultDays(parsed.arrivalDefaultDays);
        setAccountArrivalDefaultDays(nextAccount);
        accountArrivalDefaultDaysRef.current = nextAccount;
      }
      if (Array.isArray(parsed.labArrivalDefaults)) {
        const nextLabs = normalizeLabArrivalDefaults(parsed.labArrivalDefaults);
        setLabArrivalDefaults(nextLabs);
        labArrivalDefaultsRef.current = nextLabs;
      }
      setArrivalDefaultDays(
        resolveLabArrivalDefaultDays(
          selectedLab?._id,
          labArrivalDefaultsRef.current,
          accountArrivalDefaultDaysRef.current,
          selectedLab?.name,
        ),
      );
    } catch {
      // ignore
    }
    // 최초 마운트 hydrate만. selectedLab 변경은 selectLabForIntake가 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{
          data?: {
            arrivalDefaultDays?: number;
            labArrivalDefaults?: unknown;
          };
        }>({
          path: "/api/practice/transfers/settings",
          method: "GET",
          token: authToken,
        });
        if (!res.ok || cancelled) return;
        const payload = res.data?.data;
        if (!payload) return;
        if (typeof payload.arrivalDefaultDays === "number") {
          const nextAccount = normalizeArrivalDefaultDays(payload.arrivalDefaultDays);
          setAccountArrivalDefaultDays(nextAccount);
          accountArrivalDefaultDaysRef.current = nextAccount;
        }
        if (Array.isArray(payload.labArrivalDefaults)) {
          const nextLabs = normalizeLabArrivalDefaults(payload.labArrivalDefaults);
          setLabArrivalDefaults(nextLabs);
          labArrivalDefaultsRef.current = nextLabs;
        }
        setArrivalDefaultDays(
          resolveLabArrivalDefaultDays(
            selectedLab?._id,
            labArrivalDefaultsRef.current,
            accountArrivalDefaultDaysRef.current,
            selectedLab?.name,
          ),
        );
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const [rushConfirmOpen, setRushConfirmOpen] = useState(false);
  const [pendingRushArrivalYmd, setPendingRushArrivalYmd] = useState("");
  const [prosthesisTypes, setProsthesisTypes] = useState<string[]>([...PRESET_PROSTHESIS_TYPES]);
  const [prosthesisTypeInput, setProsthesisTypeInput] = useState("");
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
      ...emptyToothWorkCustomSpecs(),
    },
  ]);
  const [implantFavorites, setImplantFavorites] = useState<PracticeImplantFavorite[]>(
    () => readLocalFavoriteSettings().implantFavorites,
  );
  const [abutmentFavorites, setAbutmentFavorites] = useState<PracticeAbutmentFavorite[]>(
    () => readLocalFavoriteSettings().abutmentFavorites,
  );
  const [defaultAbutmentProductMode, setDefaultAbutmentProductMode] =
    useState<AbutmentProductMode>(
      () => readLocalFavoriteSettings().defaultAbutmentProductMode,
    );

  const [patientName, setPatientName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [email, setEmail] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [showAccessPassword, setShowAccessPassword] = useState(false);
  const [phone, setPhone] = useState("");

  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [signupCompleted, setSignupCompleted] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [onboardingGateChecking, setOnboardingGateChecking] = useState(false);

  const [emailVerified, setEmailVerified] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  const [authMode, setAuthMode] = useState<PracticeAuthMode>("checking");
  const [recoverNewPassword, setRecoverNewPassword] = useState("");
  const [showRecoverNewPassword, setShowRecoverNewPassword] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showGuestChat, setShowGuestChat] = useState(false);
  const consumedPrefillLocationKeyRef = useRef<string | null>(null);
  const suppressDraftPersistRef = useRef(false);
  /** 초안 복원 시에만 서버/캐시 인증상태를 되살린다. 사용자가 번호를 수정하면 false. */
  const allowEmailVerificationRestoreRef = useRef(true);
  const allowPhoneVerificationRestoreRef = useRef(true);

  const isEmailValid = isValidEmail(email);
  const isPhoneValid = isValidMobilePhone(phone);

  const isStrongPassword = useMemo(() => {
    const p = String(accessPassword || "");
    if (p.length < 10) return false;
    if (p.includes("$")) return false;
    if (!/[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
    return true;
  }, [accessPassword]);

  const isRecoverPasswordStrong = useMemo(() => {
    const p = String(recoverNewPassword || "");
    if (p.length < 10) return false;
    if (p.includes("$")) return false;
    if (!/[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
    return true;
  }, [recoverNewPassword]);

  const normalizedProsthesisTypes = useMemo(
    () => normalizeProsthesisTypes([...PRESET_PROSTHESIS_TYPES, ...prosthesisTypes]),
    [prosthesisTypes],
  );
  const normalizedToothWorks = useMemo(() => normalizeToothWorks(toothWorks), [toothWorks]);
  const normalizedPatientName = useMemo(() => String(patientName || "").trim(), [patientName]);

  const missingAbutmentPresetTeeth = useMemo(
    () => listMissingAbutmentPresetTeeth(normalizedToothWorks),
    [normalizedToothWorks],
  );

  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!selectedLab?._id) missing.push("기공소");
    if (!normalizedPatientName) missing.push("환자명");
    if (normalizedToothWorks.length === 0) missing.push("보철물");
    if (missingAbutmentPresetTeeth.length > 0) {
      missing.push(`어벗 프리셋 (#${missingAbutmentPresetTeeth.join(", #")})`);
    }
    return missing;
  }, [
    selectedLab?._id,
    normalizedPatientName,
    normalizedToothWorks.length,
    missingAbutmentPresetTeeth,
  ]);

  const missingStep1Fields = useMemo(() => {
    const missing = [...missingRequiredFields];
    if (!orderDate) missing.push("주문일");
    if (!arrivalDate) missing.push("치과도착일");
    return missing;
  }, [missingRequiredFields, orderDate, arrivalDate]);
  const autoClinicName = useMemo(() => {
    const profileClinic = String(authUser?.practiceProfile?.clinicName || "").trim();
    if (profileClinic) return profileClinic;
    const accountClinic = String(
      (authUser as { business?: string } | null)?.business ||
        authUser?.companyName ||
        "",
    ).trim();
    if (accountClinic) return accountClinic;
    return "(미등록)";
  }, [authUser]);

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
        ...emptyToothWorkCustomSpecs(),
      },
    ]);
  };

  const handleClearRequestIntakeCache = () => {
    clearPracticeSharedFormLocalStorage();

    setLabOpen(false);
    setLabSearch("");
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    setRushConfirmOpen(false);
    setPendingRushArrivalYmd("");
    setOrderDate(todayDate);
    const nextArrivalDate = addDaysToDateInput(todayDate, arrivalDefaultDays);
    setArrivalDate(nextArrivalDate);
    setRushProcessing(
      shouldEnablePracticeRushProcessing({
        orderYmd: todayDate,
        arrivalYmd: nextArrivalDate,
      }),
    );
    setToothWorks([
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
        ...emptyToothWorkCustomSpecs(),
      },
    ]);

    toast({
      title: "의뢰 접수 캐시 삭제",
      description: "의뢰 접수 카드의 임시 입력값을 초기화했습니다.",
    });
  };

  // 주문일은 항상 오늘(KST)로 고정
  useEffect(() => {
    if (orderDate === todayDate) return;
    setOrderDate(todayDate);
    setArrivalDate((prev) => {
      const current = String(prev || "").trim();
      if (current && current >= todayDate) return current;
      return addDaysToDateInput(todayDate, arrivalDefaultDays);
    });
  }, [arrivalDefaultDays, orderDate, todayDate]);

  const handleSaveProsthesisTypeSettings = () => {
    const nextTypes = normalizeProsthesisTypes(prosthesisTypeCatalogDraft);
    setProsthesisTypes(nextTypes.length > 0 ? nextTypes : [...PRESET_PROSTHESIS_TYPES]);
    setProsthesisTypeSettingsDialogOpen(false);
  };

  const canGoStep2 = missingStep1Fields.length === 0;

  const canSubmitBase = missingStep1Fields.length === 0;

  const trimmedClinicName = String(clinicName || "").trim();
  const trimmedDirectorName = String(directorName || "").trim();
  const trimmedStaffName = String(staffName || "").trim();

  const canSubmitSignup = Boolean(
    canSubmitBase &&
      trimmedClinicName &&
      trimmedDirectorName &&
      trimmedStaffName &&
      isEmailValid &&
      emailVerified &&
      isPhoneValid &&
      phoneVerified &&
      isStrongPassword,
  );

  const canSubmitLogin = Boolean(
    canSubmitBase && isEmailValid && String(accessPassword || "").trim(),
  );

  const canSubmitRecover = Boolean(
    isEmailValid && isPhoneValid && isRecoverPasswordStrong,
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
        const parsed = raw
          ? (JSON.parse(raw) as Partial<PracticeDropzoneDraft>)
          : null;
        const intake = readPreferredIntakeFormForDropzone(parsed);

        if (!parsed && !intake) {
          setDraftHydrated(true);
          return;
        }

        if (cancelled) return;
        setStep(parsed?.step === 1 ? 1 : 0);
        setSelectedLab(
          (intake?.selectedLab as SearchBusinessResult | null | undefined) ||
            parsed?.selectedLab ||
            null,
        );
        setRequestMemo(String(intake?.requestMemo ?? parsed?.requestMemo ?? ""));
        const restoredOrderDate = todayDate;
        const restoredArrivalDefaultDaysRaw = Number(
          intake?.arrivalDefaultDays ?? parsed?.arrivalDefaultDays,
        );
        const restoredArrivalDefaultDays = Number.isFinite(restoredArrivalDefaultDaysRaw)
          ? Math.max(0, Math.floor(restoredArrivalDefaultDaysRaw))
          : DEFAULT_ARRIVAL_OFFSET_DAYS;
        setOrderDate(restoredOrderDate);
        setArrivalDefaultDays(restoredArrivalDefaultDays);
        {
          const restoredArrival = String(intake?.arrivalDate || parsed?.arrivalDate || "").trim();
          const nextArrival =
            restoredArrival && restoredArrival >= todayDate
              ? restoredArrival
              : addDaysToDateInput(restoredOrderDate, restoredArrivalDefaultDays);
          setArrivalDate(nextArrival);
          setRushProcessing(
            shouldEnablePracticeRushProcessing({
              rushProcessing:
                intake?.rushProcessing === true ||
                parsed?.rushProcessing === true,
              orderYmd: restoredOrderDate,
              arrivalYmd: nextArrival,
            }),
          );
        }
        const restoredProsthesisTypes = normalizeProsthesisTypes([
          ...PRESET_PROSTHESIS_TYPES,
          ...(Array.isArray(intake?.prosthesisTypes)
            ? intake.prosthesisTypes
            : Array.isArray(parsed?.prosthesisTypes)
              ? parsed.prosthesisTypes
              : []),
        ]);
        setProsthesisTypes(restoredProsthesisTypes);
        const toothWorksSource =
          Array.isArray(intake?.toothWorks) && intake.toothWorks.length > 0
            ? intake.toothWorks
            : Array.isArray(parsed?.toothWorks) && parsed.toothWorks.length > 0
              ? parsed.toothWorks
              : [];
        const restoredToothWorks =
          toothWorksSource.length > 0
            ? restoreToothWorksFromDraft(toothWorksSource, {
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
            : [{ toothNumber: "", prosthesisType: resolveDefaultProsthesisType(restoredProsthesisTypes), customAbutment: false, bridgeLinkedTeeth: [], ...emptyToothWorkCustomSpecs() }],
        );
        setPatientName(String(intake?.patientName ?? parsed?.patientName ?? ""));
        setClinicName(String(parsed?.clinicName || "").trim());
        setDirectorName(String(parsed?.directorName || "").trim());
        setStaffName(String(parsed?.staffName || "").trim());
        setEmail(String(parsed?.email || "").trim().toLowerCase());
        setPhone(formatPhoneNumberInput(String(parsed?.phone || "")));

        const fileKeys = Array.isArray(parsed?.fileKeys)
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

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const restore = async () => {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const phoneDigits = String(phone || "").replace(/\D/g, "");
        const cache = readSignupVerificationCache();
        const allowEmailRestore = allowEmailVerificationRestoreRef.current;
        const allowPhoneRestore = allowPhoneVerificationRestoreRef.current;

        if (
          allowEmailRestore &&
          isEmailValid &&
          cache.email?.value === normalizedEmail &&
          cache.email.verifiedAt
        ) {
          if (!cancelled) setEmailVerified(true);
        }

        if (
          allowPhoneRestore &&
          isPhoneValid &&
          cache.phone?.value === phoneDigits &&
          cache.phone.verifiedAt
        ) {
          if (!cancelled) setPhoneVerified(true);
        }

        if (allowEmailRestore && isEmailValid) {
          try {
            const res = await apiFetch<{
              success?: boolean;
              data?: { verified?: boolean; verifiedAt?: string | null };
            }>({
              path: `/api/auth/signup/email-verification/status?email=${encodeURIComponent(normalizedEmail)}`,
              method: "GET",
            });
            const payload = (res.data || {}) as {
              success?: boolean;
              data?: { verified?: boolean; verifiedAt?: string | null };
            };
            if (!cancelled && allowEmailVerificationRestoreRef.current) {
              if (res.ok && payload.data?.verified) {
                setEmailVerified(true);
                persistEmailVerificationCache(
                  normalizedEmail,
                  payload.data.verifiedAt
                    ? String(payload.data.verifiedAt)
                    : undefined,
                );
              } else if (res.ok && cache.email?.value === normalizedEmail) {
                setEmailVerified(false);
                clearEmailVerificationCache();
              }
            }
          } catch {
            // keep local cache fallback
          }
        }

        if (allowPhoneRestore && isPhoneValid) {
          try {
            const res = await apiFetch<{
              success?: boolean;
              data?: { verified?: boolean; verifiedAt?: string | null };
            }>({
              path: `/api/auth/signup/phone-verification/status?phone=${encodeURIComponent(phoneDigits)}`,
              method: "GET",
            });
            const payload = (res.data || {}) as {
              success?: boolean;
              data?: { verified?: boolean; verifiedAt?: string | null };
            };
            if (!cancelled && allowPhoneVerificationRestoreRef.current) {
              if (res.ok && payload.data?.verified) {
                setPhoneVerified(true);
                persistPhoneVerificationCache(
                  phoneDigits,
                  payload.data.verifiedAt
                    ? String(payload.data.verifiedAt)
                    : undefined,
                );
              } else if (res.ok && cache.phone?.value === phoneDigits) {
                setPhoneVerified(false);
                clearPhoneVerificationCache();
              }
            }
          } catch {
            // keep local cache fallback
          }
        }
      };

      void restore();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draftHydrated, email, phone, isEmailValid, isPhoneValid]);

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
      clinicName,
      directorName,
      staffName,
      email,
      phone,
      fileKeys: files.map((file) => toPracticeFileKey(file)),
      rushProcessing,
    };
    try {
      localStorage.setItem(PRACTICE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }

    // 대시보드와 동일 키로 의뢰 폼을 이어 쓴다(가입/세션 필드는 드롭존 전용 키에만).
    syncIntakeFieldsToTransferFormLocal({
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      prosthesisTypes: normalizedProsthesisTypes,
      requestMemo,
      patientName,
      selectedLab: selectedLab
        ? {
            _id: String(selectedLab._id || "").trim(),
            name: String(selectedLab.name || "").trim(),
            businessNumber: String(selectedLab.businessNumber || "").trim(),
            representativeName: String(selectedLab.representativeName || "").trim(),
            address: String(selectedLab.address || "").trim(),
            businessType: String(selectedLab.businessType || "requestor").trim(),
          }
        : null,
      toothWorks,
      rushProcessing,
    });
  }, [
    draftHydrated,
    clinicName,
    directorName,
    staffName,
    email,
    phone,
    patientName,
    requestMemo,
    orderDate,
    arrivalDate,
    arrivalDefaultDays,
    normalizedProsthesisTypes,
    toothWorks,
    selectedLab,
    step,
    files,
    rushProcessing,
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

    const isDropzoneSenderLoggedIn =
      Boolean(authToken) &&
      canUseDropzoneSenderAccount(authUser) &&
      Boolean(authUser?.id);

    if (isDropzoneSenderLoggedIn) {
      const pp = authUser?.practiceProfile || null;
      const nextClinicName = String(pp?.clinicName || "").trim();
      const nextDirectorName = String(pp?.directorName || "").trim();
      const nextStaffName = String(pp?.staffName || "").trim();
      if (nextClinicName) setClinicName(nextClinicName);
      if (nextDirectorName) setDirectorName(nextDirectorName);
      if (nextStaffName) setStaffName(nextStaffName);
      setEmail(String(authUser?.email || email || "").trim().toLowerCase());
      setPhone(formatPhoneNumberInput(String(pp?.phone || phone || "")));
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
  }, [draftHydrated, authToken, authUser, logout, email, phone]);

  const extractDataFromResponse = <T,>(raw: unknown): T | null => {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as { data?: unknown };
    if (payload.data === undefined) return raw as T;
    return payload.data as T;
  };

  const userNeedsOnboarding = (user: User | null | undefined) => {
    if (!user?.id) return false;
    return !(user.onboardingWizardCompleted || user.businessVerified);
  };

  /** 첫 PracticeTransfer 성공 이후 + 온보딩 미완료면 추가 의뢰를 막고 위저드로 보낸다. */
  const redirectToOnboardingIfSecondRequest = async (token: string) => {
    const latestUser = useAuthStore.getState().user;
    if (!userNeedsOnboarding(latestUser)) return false;

    setOnboardingGateChecking(true);
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/my?page=1&limit=1",
        method: "GET",
        token,
      });
      if (!res.ok) return false;
      const body = res.data as {
        data?: {
          requests?: unknown[];
          pagination?: { count?: number; total?: number };
        };
      } | null;
      const requests = Array.isArray(body?.data?.requests)
        ? body.data.requests
        : [];
      const total = Number(
        body?.data?.pagination?.total ??
          body?.data?.pagination?.count ??
          requests.length,
      );
      if (!Number.isFinite(total) || total < 1 || requests.length < 1) {
        return false;
      }

      toast({
        title: "계정 정보를 이어서 등록해주세요",
        description:
          "첫 기공의뢰는 완료되었습니다. 다음 의뢰부터는 치과 정보를 등록한 뒤 이용할 수 있습니다.",
      });
      navigate("/dashboard/wizard?mode=account", { replace: true });
      return true;
    } catch {
      return false;
    } finally {
      setOnboardingGateChecking(false);
    }
  };

  const submitPracticeRequest = async (
    token: string,
    options?: { skipSecondRequestGate?: boolean },
  ) => {
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
        title: "치과도착일을 확인해주세요",
        description: "치과도착일은 주문일보다 빠를 수 없습니다.",
        variant: "destructive",
      });
      return false;
    }

    const periodDays = getPracticeWorkPeriodDays(orderDate, arrivalDate);
    if (isPracticeWorkPeriodBlocked(periodDays)) {
      toast({
        title: PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
        variant: "destructive",
      });
      return false;
    }
    if (isPracticeWorkPeriodLateWarning(periodDays)) {
      toast({ title: PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE });
    }

    if (!options?.skipSecondRequestGate) {
      const gated = await redirectToOnboardingIfSecondRequest(token);
      if (gated) return false;
    }

    setRequestSubmitting(true);
    try {
      const uploadedTempFiles =
        files.length > 0
          ? peekCachedUploadedFiles(files) ??
            (await ensureFilesUploaded(files))
          : [];
      const transferId = makeTransferId();
      const submitArrivalDate = arrivalDate;
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate: submitArrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks,
        patientName: normalizedPatientName,
      });

      const practiceRouting = {
        targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
        targetLabName: String(selectedLab?.name || "").trim(),
      };
      const newSystemRequestBase = {
        requested: true,
        manufacturer: "",
        brand: "",
        family: "",
        message: `[기공소: ${String(selectedLab?.name || "")}] ${transferMemo}\n[전송ID: ${transferId}]`,
        free: true,
        tag: "practice_dropzone",
      };

      const caseInfosPayload =
        files.length > 0
          ? files.map((file, index) => {
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
                newSystemRequest: newSystemRequestBase,
                // related files:
                // - web/backend/models/practiceTransfer.model.js
                // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
                // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
                // practice 제출은 PracticeTransfer SSOT로 저장 (Request 컬렉션 경유 금지)
                practiceRouting,
              };
            })
          : [
              {
                clinicName: autoClinicName,
                patientName: normalizedPatientName,
                tooth: "",
                workType: "abutment",
                designSoftware: "3Shape",
                newSystemRequest: newSystemRequestBase,
                practiceRouting,
              },
            ];

      const submitRes = await apiFetch<unknown>({
        path: "/api/practice/transfers",
        method: "POST",
        token,
        jsonBody: {
          transferId,
          targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
          targetLabName: String(selectedLab?.name || "").trim(),
          orderDate,
          arrivalDate: submitArrivalDate,
          arrivalDefaultDays,
          rushProcessing,
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
      clearPreUploadCache();

      setRequestSubmitted(true);
      rememberLab(selectedLab);
      setFiles([]);
      setSelectedLab(null);
      setPatientName("");
      setRequestMemo("");
      setRushProcessing(false);
      setToothWorks([
        {
          toothNumber: "",
          prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
          customAbutment: false,
          bridgeLinkedTeeth: [],
          ...emptyToothWorkCustomSpecs(),
        },
      ]);
      setStep(1);

      const needsOnboarding = userNeedsOnboarding(useAuthStore.getState().user);
      toast({
        title: "기공의뢰서를 전송했습니다",
        description: needsOnboarding
          ? "다음 의뢰부터는 계정(치과) 정보를 등록한 뒤 이용할 수 있습니다."
          : "전송이 완료되었습니다.",
        duration: 8000,
      });
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

  const syncLocalFavoritesToServer = useCallback(async (token: string) => {
    const local = readLocalFavoriteSettings();
    const localImplant = local.implantFavorites;
    const localAbutment = local.abutmentFavorites;
    const shouldSyncMode = local.hasDefaultAbutmentProductMode;
    if (localImplant.length === 0 && localAbutment.length === 0 && !shouldSyncMode) return;

    try {
      const getRes = await apiFetch<{
        data?: {
          implantFavorites?: unknown;
          abutmentFavorites?: unknown;
          defaultAbutmentProductMode?: unknown;
        };
      }>({
        path: "/api/practice/transfers/settings",
        method: "GET",
        token,
      });
      const serverImplant = normalizeImplantFavorites(
        getRes.ok ? getRes.data?.data?.implantFavorites : [],
      );
      const serverAbutment = normalizeAbutmentFavorites(
        getRes.ok ? getRes.data?.data?.abutmentFavorites : [],
      );
      const serverMode = normalizeAccountAbutmentProductMode(
        getRes.ok ? getRes.data?.data?.defaultAbutmentProductMode : undefined,
      );

      const mergedImplant = normalizeImplantFavorites([...serverImplant, ...localImplant]);
      const mergedAbutment = normalizeAbutmentFavorites([...serverAbutment, ...localAbutment]);
      const mergedMode = shouldSyncMode
        ? local.defaultAbutmentProductMode
        : serverMode;

      const jsonBody: Record<string, unknown> = {};
      if (localImplant.length > 0 || localAbutment.length > 0) {
        jsonBody.implantFavorites = mergedImplant;
        jsonBody.abutmentFavorites = mergedAbutment;
      }
      if (shouldSyncMode) {
        jsonBody.defaultAbutmentProductMode = mergedMode;
      }
      if (Object.keys(jsonBody).length === 0) {
        setDefaultAbutmentProductMode(mergedMode);
        return;
      }

      const postRes = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "POST",
        token,
        jsonBody,
      });
      if (!postRes.ok) return;

      let nextImplant = mergedImplant;
      const pendingRoundBar = nextImplant.filter(
        (row) => isRoundBarFavorite(row) && !String(row.roundBarRequestId || "").trim(),
      );
      if (pendingRoundBar.length > 0) {
        const flushed: PracticeImplantFavorite[] = [];
        for (const row of pendingRoundBar) {
          try {
            const result = await submitRoundBarManufacturerRequest({
              token,
              payload: {
                manufacturer: row.manufacturer,
                brand: row.brand,
                family: row.family,
                favoriteId: row.id,
              },
            });
            flushed.push(
              result.favorite?.id
                ? { ...row, ...result.favorite, roundBar: true }
                : row,
            );
          } catch {
            flushed.push(row);
          }
        }
        const flushedById = new Map(flushed.map((row) => [row.id, row]));
        nextImplant = nextImplant.map((row) => flushedById.get(row.id) || row);
        await apiFetch<unknown>({
          path: "/api/practice/transfers/settings",
          method: "POST",
          token,
          jsonBody: { implantFavorites: nextImplant },
        }).catch(() => {});
      }

      setImplantFavorites(nextImplant);
      setAbutmentFavorites(mergedAbutment);
      setDefaultAbutmentProductMode(mergedMode);
      writeLocalFavoriteSettings({
        implantFavorites: nextImplant,
        abutmentFavorites: mergedAbutment,
        defaultAbutmentProductMode: mergedMode,
      });
    } catch {
      // 동기화 실패해도 의뢰 전송은 계속 진행
    }
  }, []);

  useAppEventDebouncedReload({
    enabled: Boolean(authToken),
    eventTypes: [ROUND_BAR_REQUEST_UPDATED_EVENT],
    delayMs: 0,
    deferWhenEditing: false,
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as RoundBarRequestUpdatedPayload)
          : {};
      setImplantFavorites((prev) => {
        const next = applyRoundBarRequestUpdate(prev, payload);
        const local = readLocalFavoriteSettings();
        writeLocalFavoriteSettings({
          implantFavorites: next,
          abutmentFavorites: local.abutmentFavorites,
        });
        return next;
      });
    },
  });

  useEffect(() => {
    if (!authToken) return;
    if (readLocalFavoriteSettings().hasDefaultAbutmentProductMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const getRes = await apiFetch<{
          data?: { defaultAbutmentProductMode?: unknown };
        }>({
          path: "/api/practice/transfers/settings",
          method: "GET",
          token: authToken,
        });
        if (cancelled || !getRes.ok) return;
        setDefaultAbutmentProductMode(
          normalizeAccountAbutmentProductMode(getRes.data?.data?.defaultAbutmentProductMode),
        );
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const handlePracticeLoginAndContinue = async () => {
    if (!canSubmitLogin) {
      toast({
        title: "입력 확인",
        description: "이메일과 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setAuthSubmitting(true);
    try {
      const result = await login(
        String(email || "").trim().toLowerCase(),
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

      if (!canUseDropzoneSenderAccount(latestUser)) {
        logout();
        toast({
          title: "의뢰인(치과 발신) 계정만 이용 가능합니다",
          description:
            "치과(기공실) 역할의 의뢰인 계정으로 로그인해 주세요.",
          variant: "destructive",
        });
        return;
      }

      writePracticeSessionMeta({
        issuedAt: Date.now(),
        userId: String(latestUser.id),
      });

      const pp = latestUser.practiceProfile || null;
      setEmail(String(latestUser.email || email || "").trim().toLowerCase());
      setPhone(formatPhoneNumberInput(String(pp?.phone || phone || "")));

      setSignupCompleted(true);
      setAuthMode("session");

      const gated = await redirectToOnboardingIfSecondRequest(latestToken);
      if (gated) return;

      // 드롭존에서 저장한 프리셋을 서버 설정으로 반영한 뒤 의뢰를 전송한다.
      await syncLocalFavoritesToServer(latestToken);
      await submitPracticeRequest(latestToken, { skipSecondRequestGate: true });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handlePracticePasswordChange = async () => {
    if (!canSubmitRecover) {
      toast({
        title: "입력 확인",
        description:
          "이메일, 휴대폰(치과 공용 혹은 담당자), 새 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!isRecoverPasswordStrong) {
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
          email: String(email || "").trim().toLowerCase(),
          phone: String(phone || "").trim(),
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
      setRecoverNewPassword("");
      setAuthMode("login");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const resetEmailVerification = () => {
    allowEmailVerificationRestoreRef.current = false;
    setEmailVerified(false);
    setEmailCodeSent(false);
    setEmailCode("");
    clearEmailVerificationCache();
  };

  const resetPhoneVerification = () => {
    allowPhoneVerificationRestoreRef.current = false;
    setPhoneVerified(false);
    setPhoneCodeSent(false);
    setPhoneCode("");
    clearPhoneVerificationCache();
  };

  const handleSendEmailVerification = async () => {
    const normalized = String(email || "").trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      toast({
        title: "이메일 확인",
        description: "올바른 이메일 형식으로 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setEmailSending(true);
    try {
      const res = await apiFetch<{ success?: boolean; message?: string }>({
        path: "/api/auth/signup/email-verification/send",
        method: "POST",
        jsonBody: { email: normalized },
      });
      const body = (res.data || {}) as { success?: boolean; message?: string };
      if (!res.ok || !body.success) {
        toast({
          title: "인증 메일 발송 실패",
          description: String(body.message || "잠시 후 다시 시도해주세요."),
          variant: "destructive",
        });
        return;
      }
      setEmailCodeSent(true);
      setEmailCode("");
      toast({
        title: "인증 메일 발송",
        description: "메일함의 4자리 코드를 입력해주세요.",
      });
    } catch {
      toast({
        title: "인증 메일 발송 실패",
        description: "네트워크 상태를 확인 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setEmailSending(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    const normalized = String(email || "").trim().toLowerCase();
    const code = String(emailCode || "").trim();
    if (!/^\d{4}$/.test(code)) {
      toast({
        title: "인증 코드 확인",
        description: "4자리 숫자를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setEmailVerifying(true);
    try {
      const res = await apiFetch<{ success?: boolean; message?: string }>({
        path: "/api/auth/signup/email-verification/verify",
        method: "POST",
        jsonBody: { email: normalized, code },
      });
      const body = (res.data || {}) as { success?: boolean; message?: string };
      if (!res.ok || !body.success) {
        toast({
          title: "이메일 인증 실패",
          description: String(body.message || "인증 코드가 일치하지 않습니다."),
          variant: "destructive",
        });
        return;
      }
      setEmailVerified(true);
      setEmailCode("");
      persistEmailVerificationCache(normalized);
      toast({
        title: "이메일 인증 완료",
        description: "이메일 인증이 완료되었습니다.",
      });
    } catch {
      toast({
        title: "이메일 인증 실패",
        description: "네트워크 상태를 확인 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setEmailVerifying(false);
    }
  };

  const handleSendPhoneVerification = async () => {
    if (!isPhoneValid) {
      toast({
        title: "휴대폰 확인",
        description: "올바른 휴대폰 번호 형식으로 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setPhoneSending(true);
    try {
      const res = await apiFetch<{
        success?: boolean;
        message?: string;
        data?: { code?: string };
      }>({
        path: "/api/auth/signup/phone-verification/send",
        method: "POST",
        jsonBody: { phone: String(phone || "").trim() },
      });
      const body = (res.data || {}) as {
        success?: boolean;
        message?: string;
        data?: { code?: string };
      };
      if (!res.ok || !body.success) {
        toast({
          title: "인증번호 발송 실패",
          description: String(body.message || "잠시 후 다시 시도해주세요."),
          variant: "destructive",
        });
        return;
      }

      setPhoneVerified(false);
      setPhoneCodeSent(true);
      setPhoneCode("");
      toast({
        title: "인증번호 발송",
        description: body.data?.code
          ? `개발용 코드: ${body.data.code}`
          : "문자로 받은 4자리 코드를 입력해주세요.",
      });
    } catch {
      toast({
        title: "인증번호 발송 실패",
        description: "네트워크 상태를 확인 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setPhoneSending(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    const code = String(phoneCode || "").trim();
    if (!/^\d{4}$/.test(code)) {
      toast({
        title: "인증 코드 확인",
        description: "4자리 숫자를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setPhoneVerifying(true);
    try {
      const res = await apiFetch<{ success?: boolean; message?: string }>({
        path: "/api/auth/signup/phone-verification/verify",
        method: "POST",
        jsonBody: { phone: String(phone || "").trim(), code },
      });
      const body = (res.data || {}) as { success?: boolean; message?: string };
      if (!res.ok || !body.success) {
        toast({
          title: "휴대폰 인증 실패",
          description: String(body.message || "인증 코드가 일치하지 않습니다."),
          variant: "destructive",
        });
        return;
      }
      setPhoneVerified(true);
      setPhoneCode("");
      persistPhoneVerificationCache(phone);
      toast({
        title: "휴대폰 인증 완료",
        description: "휴대폰 인증이 완료되었습니다.",
      });
    } catch {
      toast({
        title: "휴대폰 인증 실패",
        description: "네트워크 상태를 확인 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setPhoneVerifying(false);
    }
  };

  const handleSignupAndContinue = async () => {
    if (!canSubmitSignup) {
      toast({
        title: "입력 확인",
        description:
          emailVerified && phoneVerified
            ? "치과명, 원장님명, 담당자명, 이메일, 휴대폰(치과 공용 혹은 담당자), 비밀번호를 포함해 필수값을 모두 입력해주세요."
            : "이메일·휴대폰 인증을 완료하고 치과명·원장님명·담당자명 등 필수값을 모두 입력해주세요.",
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
      await syncLocalFavoritesToServer(token);
      await submitPracticeRequest(token);
      return;
    }

    setSignupSubmitting(true);
    try {
      const registerRes = await apiFetch<unknown>({
        path: "/api/auth/practice/register",
        method: "POST",
        jsonBody: {
          email: String(email || "").trim().toLowerCase(),
          password: accessPassword,
          phone: String(phone || "").trim(),
          clinicName: trimmedClinicName,
          directorName: trimmedDirectorName,
          staffName: trimmedStaffName,
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
      clearSignupVerificationCache();
      toast({
        title: "회원가입 완료",
        description: "이어서 현재 작성한 의뢰서를 전송합니다.",
      });

      await syncLocalFavoritesToServer(token);
      // 가입 직후는 전송 이력이 없으므로 첫 의뢰 게이트를 건너뛴다.
      await submitPracticeRequest(token, { skipSecondRequestGate: true });
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
      await syncLocalFavoritesToServer(token);
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
      className="bg-gradient-subtle flex h-full min-h-0 flex-col overflow-hidden p-3 sm:p-4"
    >
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-4xl flex-col gap-2.5">
        <Card className="border-primary-soft bg-gradient-to-br from-white to-primary-soft/70 shadow-sm">
          <CardHeader className="px-4 py-2.5 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-h-[52px] items-center">
                <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">
                  편리한 기공의뢰서
                </CardTitle>
              </div>

              <div className="w-full min-w-0 rounded-xl border bg-white/80 px-3 py-2 lg:w-[min(420px,100%)]">
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
                              isActive && "border-primary-strong bg-primary-strong text-white",
                              !isActive && isDone && "border-primary-strong bg-primary-strong text-white",
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
                                isActive && "text-primary-strong",
                                !isActive && isDone && "text-primary-strong",
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
                    files: files.map((file, index) => {
                      const progress = uploadProgress[toTempUploadFileKey(file)];
                      return {
                        key: `${file.name}:${file.size}:${file.lastModified}:${index}`,
                        name: file.name,
                        size: file.size,
                        uploadPercent: progress?.percent,
                        uploadStatus: progress?.status,
                      };
                    }),
                    totalSizeMb,
                    onPickFiles: handleIncomingFiles,
                    onRemoveFile: (key) => {
                      const idx = files.findIndex(
                        (file, fileIdx) =>
                          `${file.name}:${file.size}:${file.lastModified}:${fileIdx}` === key,
                      );
                      if (idx >= 0) removeFileWithCache(idx);
                    },
                    onClearAllFiles: () => {
                      void clearAllFilesWithCache();
                    },
                  }}
                  requestIntakeProps={{
                    selectedLab,
                    setSelectedLab: selectLabForIntake,
                    labOpen,
                    setLabOpen,
                    labSearch,
                    setLabSearch,
                    labSearchResults,
                    labSearching,
                    recentLabs,
                    recentLabsInitialized,
                    pinnedLabs,
                    onRemoveRecentLab: removeRecentLab,
                    onTogglePinLab: togglePinLab,
                    patientName,
                    setPatientName,
                    orderDate,
                    setOrderDate,
                    arrivalDate,
                    setArrivalDate,
                    onOrderArrivalDatesChange: ({ arrivalDate: nextArrival }) => {
                      setOrderDate(todayDate);
                      const arrival =
                        String(nextArrival || "").trim() >= todayDate
                          ? String(nextArrival || "").trim()
                          : addDaysToDateInput(todayDate, arrivalDefaultDays);
                      const days = getPracticeWorkPeriodDays(todayDate, arrival);
                      if (isPracticeWorkPeriodBlocked(days)) {
                        toast({
                          title: PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
                          variant: "destructive",
                        });
                        return;
                      }
                      if (isPracticeWorkPeriodLateWarning(days)) {
                        toast({ title: PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE });
                      }
                      setRushProcessing(false);
                      setArrivalDate(arrival);
                      const diff = kstYmdDiffDays(todayDate, arrival);
                      if (diff == null) return;
                      const nextDays = normalizeArrivalDefaultDays(diff);
                      if (nextDays === arrivalDefaultDays) return;
                      setArrivalDefaultDays(nextDays);
                      persistLabArrivalDefault(nextDays);
                    },
                    arrivalDefaultDays,
                    rushProcessing,
                    normalizedProsthesisTypes,
                    setProsthesisTypeCatalogDraft,
                    setProsthesisTypeSettingsDialogOpen,
                    toothWorks,
                    setToothWorks,
                    requestMemo,
                    setRequestMemo,
                    memoInputId: "practice-request-memo",
                    prosthesisTypeSelectWidthClassName: "w-full min-w-0 sm:w-[110px]",
                    showBridgeConnections: false,
                    onClearAll: handleClearRequestIntakeCache,
                    implantConnections,
                    defaultAbutmentProductMode,
                    lockedAbutmentProductMode: ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
                    onAlternateAbutmentModeNavigate: () => {
                      navigate("/dashboard/new-request");
                    },
                    onDefaultAbutmentProductModeChange: (next) => {
                      const normalized = normalizeAccountAbutmentProductMode(next);
                      if (normalized === defaultAbutmentProductMode) return;
                      setDefaultAbutmentProductMode(normalized);
                      writeLocalFavoriteSettings({
                        implantFavorites,
                        abutmentFavorites,
                        defaultAbutmentProductMode: normalized,
                      });
                      if (!authToken) return;
                      void apiFetch<unknown>({
                        path: "/api/practice/transfers/settings",
                        method: "POST",
                        token: authToken,
                        jsonBody: { defaultAbutmentProductMode: normalized },
                      }).catch(() => {
                        // 로컬값은 유지. 로그인 동기화·다음 저장에서 재시도
                      });
                    },
                    implantFavorites,
                    onPresetEditorOpen: () => {
                      if (!authToken) return;
                      void syncLocalFavoritesToServer(authToken);
                    },
                    onImplantFavoritesChange: (next) => {
                      const normalized = normalizeImplantFavorites(next);
                      setImplantFavorites(normalized);
                      writeLocalFavoriteSettings({
                        implantFavorites: normalized,
                        abutmentFavorites,
                        defaultAbutmentProductMode,
                      });
                    },
                    abutmentFavorites,
                    onAbutmentFavoritesChange: (next) => {
                      const normalized = normalizeAbutmentFavorites(next);
                      setAbutmentFavorites(normalized);
                      writeLocalFavoriteSettings({
                        implantFavorites,
                        abutmentFavorites: normalized,
                        defaultAbutmentProductMode,
                      });
                    },
                  }}
                />
              </div>
            )}

            {step === 1 && (
              <form
                id="practice-auth-form"
                className="space-y-5"
                onSubmit={handlePracticeAuthFormSubmit}
              >
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-primary-soft/60 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-all hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
                  <div className="border-b border-slate-100 bg-white/70 px-5 py-4 backdrop-blur-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-strong">
                          Step 2
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-900">
                          의뢰인 계정
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          의뢰서를 제출한 뒤에도 이어서 확인할 수 있도록 계정을 연결합니다.
                        </p>
                      </div>
                      {authMode !== "checking" && authMode !== "session" ? (
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50/90 p-1 shadow-inner">
                          {(
                            [
                              { key: "login", label: "로그인" },
                              { key: "signup", label: "회원가입" },
                              { key: "recover", label: "비밀번호" },
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setAuthMode(tab.key)}
                              className={cn(
                                "rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                                authMode === tab.key
                                  ? "bg-white text-slate-900 shadow-sm"
                                  : "text-slate-500 hover:text-slate-800",
                              )}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-5 px-5 py-5">
                    {authMode === "checking" && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        세션 상태를 확인 중입니다...
                      </div>
                    )}

                    {authMode === "session" && (
                      <div
                        className={cn(
                          "rounded-xl border px-4 py-4 text-sm",
                          requestSubmitted
                            ? "border-primary-muted bg-primary-soft/90 text-primary-strong"
                            : "border-primary-muted bg-primary-soft/90 text-primary-strong",
                        )}
                      >
                        {requestSubmitted ? (
                          <>
                            <p className="font-medium">기공의뢰서를 전송했습니다.</p>
                            <p className="mt-1 text-primary-strong/90">
                              다음 의뢰부터는 치과 정보를 등록한 뒤 이용할 수 있습니다.
                              {email ? ` (${email})` : ""}
                            </p>
                            {userNeedsOnboarding(authUser) ? (
                              <Button
                                type="button"
                                className="mt-3 h-9 rounded-lg bg-primary-strong px-4 text-white hover:bg-primary-strong"
                                onClick={() =>
                                  navigate("/dashboard/wizard?mode=account")
                                }
                              >
                                계정 정보 이어서 등록
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <p className="font-medium">로그인 세션이 확인되었습니다.</p>
                            <p className="mt-1 text-primary-strong/90">
                              추가 입력 없이 바로 의뢰서를 전송할 수 있습니다.
                              {email ? ` (${email})` : ""}
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {authMode === "login" && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="practice-login-email" className="text-sm font-medium text-slate-700">
                            이메일 <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="practice-login-email"
                            type="email"
                            autoComplete="email"
                            className={cn(
                              "h-11 rounded-xl border-slate-200 bg-white text-base shadow-sm",
                              email.trim() && !isEmailValid
                                ? "border-destructive focus-visible:ring-destructive"
                                : "",
                            )}
                            value={email}
                            onChange={(e) => setEmail(e.target.value.trim())}
                            placeholder="name@clinic.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="practice-login-password" className="text-sm font-medium text-slate-700">
                            비밀번호 <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="practice-login-password"
                              type={showAccessPassword ? "text" : "password"}
                              autoComplete="current-password"
                              className="h-11 rounded-xl border-slate-200 bg-white pr-10 text-base shadow-sm"
                              value={accessPassword}
                              onChange={(e) => setAccessPassword(e.target.value)}
                              placeholder="비밀번호"
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
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
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">
                              이메일 <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              type="email"
                              className={cn(
                                "h-11 rounded-xl border-slate-200 bg-white text-base shadow-sm",
                                email.trim() && !isEmailValid
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : "",
                              )}
                              value={email}
                              onChange={(e) => setEmail(e.target.value.trim())}
                              placeholder="name@clinic.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">
                              휴대폰(치과 공용 혹은 담당자){" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              className={cn(
                                "h-11 rounded-xl border-slate-200 bg-white text-base shadow-sm",
                                phone.trim() && !isPhoneValid
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : "",
                              )}
                              value={phone}
                              onChange={(e) => setPhone(formatPhoneNumberInput(e.target.value))}
                              placeholder="010-1234-5678"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">
                              새 비밀번호 <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                              <Input
                                type={showRecoverNewPassword ? "text" : "password"}
                                className={cn(
                                  "h-11 rounded-xl border-slate-200 bg-white pr-10 text-base shadow-sm",
                                  recoverNewPassword && !isRecoverPasswordStrong
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : "",
                                )}
                                value={recoverNewPassword}
                                onChange={(e) => setRecoverNewPassword(e.target.value)}
                                placeholder="10자 이상 + 특수문자"
                              />
                              <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                                onClick={() => setShowRecoverNewPassword((prev) => !prev)}
                                aria-label="새 비밀번호 보기"
                              >
                                {showRecoverNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-lg border-slate-200 bg-white"
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
                              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
                            >
                              어벗츠 전화 ({COMPANY_PHONE})
                            </a>
                          </div>
                          <Button
                            type="button"
                            className="h-10 rounded-xl bg-primary-strong px-5 text-white hover:bg-primary-strong"
                            onClick={() => void handlePracticePasswordChange()}
                            disabled={authSubmitting || !canSubmitRecover}
                          >
                            {authSubmitting ? "변경 중..." : "비밀번호 변경"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {authMode === "signup" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="clinicName" className="flex h-5 items-center text-sm font-medium text-slate-700">
                              치과명 <span className="ml-0.5 text-destructive">*</span>
                            </Label>
                            <Input
                              id="clinicName"
                              type="text"
                              autoComplete="organization"
                              className="box-border h-11 rounded-xl border-slate-200 bg-white py-0 text-base shadow-sm"
                              value={clinicName}
                              onChange={(e) => setClinicName(e.target.value)}
                              placeholder="예: 향기로운치과"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="directorName" className="flex h-5 items-center text-sm font-medium text-slate-700">
                              원장님명 <span className="ml-0.5 text-destructive">*</span>
                            </Label>
                            <Input
                              id="directorName"
                              type="text"
                              autoComplete="name"
                              className="box-border h-11 rounded-xl border-slate-200 bg-white py-0 text-base shadow-sm"
                              value={directorName}
                              onChange={(e) => setDirectorName(e.target.value)}
                              placeholder="예: 김원장"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="staffName" className="flex h-5 items-center text-sm font-medium text-slate-700">
                              담당자명 <span className="ml-0.5 text-destructive">*</span>
                            </Label>
                            <Input
                              id="staffName"
                              type="text"
                              autoComplete="name"
                              className="box-border h-11 rounded-xl border-slate-200 bg-white py-0 text-base shadow-sm"
                              value={staffName}
                              onChange={(e) => setStaffName(e.target.value)}
                              placeholder="예: 홍길동"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="practiceEmail" className="flex h-5 items-center text-sm font-medium text-slate-700">
                              이메일 <span className="ml-0.5 text-destructive">*</span>
                            </Label>
                            <div className="relative">
                              <Input
                                id="practiceEmail"
                                type="email"
                                autoComplete="email"
                                disabled={emailVerified}
                                className={cn(
                                  "box-border h-11 rounded-xl border-slate-200 bg-white py-0 text-base shadow-sm",
                                  emailVerified ? "pr-[4.75rem]" : "pr-[5.75rem]",
                                  email.trim() && !isEmailValid
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : "",
                                )}
                                value={email}
                                onChange={(e) => {
                                  setEmail(e.target.value.trim());
                                  resetEmailVerification();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== "Enter") return;
                                  e.preventDefault();
                                  if (emailVerified || !isEmailValid || emailSending) return;
                                  void handleSendEmailVerification();
                                }}
                                placeholder="name@clinic.com"
                              />
                              {emailVerified ? (
                                <span className="pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-medium text-primary-strong">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  인증 완료
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-primary-strong px-2.5 text-xs font-medium leading-none text-white hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!isEmailValid || emailSending}
                                  onClick={() => void handleSendEmailVerification()}
                                >
                                  {emailSending
                                    ? "발송 중..."
                                    : emailCodeSent
                                      ? "재발송"
                                      : "인증 발송"}
                                </button>
                              )}
                            </div>
                            {email.trim() && !isEmailValid ? (
                              <p className="text-xs text-destructive">
                                올바른 이메일 형식으로 입력해주세요.
                              </p>
                            ) : null}
                            {emailCodeSent && !emailVerified ? (
                              <div className="relative">
                                <Input
                                  inputMode="numeric"
                                  maxLength={4}
                                  className="box-border h-11 rounded-xl border-slate-200 bg-white py-0 pr-[4.75rem] text-center text-lg tracking-[0.35em] shadow-sm"
                                  value={emailCode}
                                  onChange={(e) =>
                                    setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key !== "Enter") return;
                                    e.preventDefault();
                                    if (emailCode.length !== 4 || emailVerifying) return;
                                    void handleVerifyEmailCode();
                                  }}
                                  placeholder="0000"
                                  aria-label="이메일 인증번호"
                                />
                                <button
                                  type="button"
                                  className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-primary-strong px-3 text-xs font-medium leading-none text-white hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={emailCode.length !== 4 || emailVerifying}
                                  onClick={() => void handleVerifyEmailCode()}
                                >
                                  {emailVerifying ? "확인 중..." : "확인"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="accessPassword" className="flex h-5 items-center text-sm font-medium text-slate-700">
                              비밀번호 <span className="ml-0.5 text-destructive">*</span>
                            </Label>
                            <div className="relative">
                              <Input
                                id="accessPassword"
                                type={showAccessPassword ? "text" : "password"}
                                autoComplete="new-password"
                                className={cn(
                                  "box-border h-11 rounded-xl border-slate-200 bg-white py-0 pr-10 text-base shadow-sm",
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
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
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
                            <Label
                              htmlFor="phone"
                              className="flex min-h-5 items-center text-sm font-medium text-slate-700"
                            >
                              휴대폰(치과 공용 혹은 담당자){" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                              <Input
                                id="phone"
                                disabled={phoneVerified}
                                className={cn(
                                  "box-border h-11 rounded-xl border-slate-200 bg-white py-0 text-base shadow-sm",
                                  phoneVerified ? "pr-[4.75rem]" : "pr-[5.75rem]",
                                  phone.trim() && !isPhoneValid
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : "",
                                )}
                                value={phone}
                                onChange={(e) => {
                                  setPhone(formatPhoneNumberInput(e.target.value));
                                  resetPhoneVerification();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== "Enter") return;
                                  e.preventDefault();
                                  if (phoneVerified || !isPhoneValid || phoneSending) return;
                                  void handleSendPhoneVerification();
                                }}
                                placeholder="010-1234-5678"
                              />
                              {phoneVerified ? (
                                <span className="pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-medium text-primary-strong">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  인증 완료
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-primary-strong px-2.5 text-xs font-medium leading-none text-white hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!isPhoneValid || phoneSending}
                                  onClick={() => void handleSendPhoneVerification()}
                                >
                                  {phoneSending
                                    ? "발송 중..."
                                    : phoneCodeSent
                                      ? "재발송"
                                      : "인증 발송"}
                                </button>
                              )}
                            </div>
                            {phone.trim() && !isPhoneValid ? (
                              <p className="text-xs text-destructive">
                                휴대폰 번호(010 등) 형식으로 입력해주세요.
                              </p>
                            ) : null}
                            {phoneCodeSent && !phoneVerified ? (
                              <div className="relative">
                                <Input
                                  inputMode="numeric"
                                  maxLength={4}
                                  className="box-border h-11 rounded-xl border-slate-200 bg-white py-0 pr-[4.75rem] text-center text-lg tracking-[0.35em] shadow-sm"
                                  value={phoneCode}
                                  onChange={(e) =>
                                    setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key !== "Enter") return;
                                    e.preventDefault();
                                    if (phoneCode.length !== 4 || phoneVerifying) return;
                                    void handleVerifyPhoneCode();
                                  }}
                                  placeholder="0000"
                                  aria-label="휴대폰 인증번호"
                                />
                                <button
                                  type="button"
                                  className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-primary-strong px-3 text-xs font-medium leading-none text-white hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={phoneCode.length !== 4 || phoneVerifying}
                                  onClick={() => void handleVerifyPhoneCode()}
                                >
                                  {phoneVerifying ? "확인 중..." : "확인"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-500">
                          주소·사업자번호 등 상세 정보는 첫 의뢰 전송 후 계정 등록
                          단계에서 이어서 입력합니다.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </form>
            )}

            <PracticeRushConfirmDialog
              open={rushConfirmOpen}
              onOpenChange={(open) => {
                setRushConfirmOpen(open);
                if (!open) setPendingRushArrivalYmd("");
              }}
              onCancel={() => setPendingRushArrivalYmd("")}
              onConfirm={() => {
                const nextArrival =
                  pendingRushArrivalYmd ||
                  kstAddBusinessDays(
                    todayDate,
                    PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS,
                  ) ||
                  "";
                setOrderDate(todayDate);
                if (nextArrival) {
                  setArrivalDate(nextArrival);
                  const diff = kstYmdDiffDays(todayDate, nextArrival);
                  if (diff != null) {
                    const nextDays = normalizeArrivalDefaultDays(diff);
                    if (nextDays !== arrivalDefaultDays) {
                      setArrivalDefaultDays(nextDays);
                      persistLabArrivalDefault(nextDays);
                    }
                  }
                }
                setRushProcessing(true);
                setRushConfirmOpen(false);
                setPendingRushArrivalYmd("");
              }}
            />

            <Dialog
              open={prosthesisTypeSettingsDialogOpen}
              onOpenChange={(open) => {
                setProsthesisTypeSettingsDialogOpen(open);
                if (open) {
                  setProsthesisTypeCatalogDraft(normalizedProsthesisTypes);
                }
              }}
            >
              <DialogContent className={RESPONSIVE.dialogContent}>
                <DialogHeader>
                  <DialogTitle>보철물 항목 설정</DialogTitle>
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
                className="h-11 rounded-xl bg-primary-strong px-6 text-base text-white shadow-sm hover:bg-primary-strong"
                disabled={
                  !canPrimaryAction ||
                  signupSubmitting ||
                  requestSubmitting ||
                  requestSubmitted ||
                  authSubmitting ||
                  onboardingGateChecking ||
                  authMode === "recover" ||
                  authMode === "checking"
                }
              >
                {requestSubmitted
                  ? "의뢰 제출 완료"
                  : onboardingGateChecking
                    ? "확인 중..."
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
                              ? "로그인 후 계속하기"
                              : authMode === "recover"
                                ? "비밀번호 변경"
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
