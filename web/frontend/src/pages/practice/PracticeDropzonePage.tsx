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
 // - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
 // - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
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
import { Checkbox } from "@/components/ui/checkbox";
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
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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
  practiceName: string;
  accessPassword: string;
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
  const [recoverAction, setRecoverAction] = useState<"find" | "change">("find");
  const [recoverStaffName, setRecoverStaffName] = useState("");
  const [recoverPhone, setRecoverPhone] = useState("");
  const [recoverNewPassword, setRecoverNewPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showGuestChat, setShowGuestChat] = useState(false);
  const consumedPrefillLocationKeyRef = useRef<string | null>(null);

  const isPhoneValid = isValidPhoneNumber(phone);

  const isStrongPassword = useMemo(() => {
    const p = String(accessPassword || "");
    if (p.length < 10) return false;
    if (p.includes("$")) return false;
    if (!/[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
    return true;
  }, [accessPassword]);

  const canGoStep2 = Boolean(
    files.length > 0 && selectedLab && String(requestMemo || "").trim(),
  );

  const canSubmitBase = Boolean(
    files.length > 0 && selectedLab && String(requestMemo || "").trim(),
  );

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
        setPracticeName(String(parsed.practiceName || ""));
        setAccessPassword(String(parsed.accessPassword || ""));
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
  }, [setFiles, setRequestMemo, setSelectedLab, toast]);

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
    const payload: PracticeDropzoneDraft = {
      step,
      selectedLab,
      requestMemo,
      practiceName,
      accessPassword,
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
    accessPassword,
    requestMemo,
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
    if (!files.length) {
      toast({
        title: "파일이 필요합니다",
        description: "최소 1개 STL, PLY, OBJ 파일을 업로드해주세요.",
        variant: "destructive",
      });
      return false;
    }

    setRequestSubmitting(true);
    try {
      const uploadedTempFiles = await uploadFilesWithToast(files);
      const transferId = makeTransferId();
      const transferMemo = String(requestMemo || "").trim();

      const caseInfosPayload = files.map((file, index) => {
        const tempFile = uploadedTempFiles[index];
        const parsed = parseFilenameWithRules(file.name);
        const dotIndex = file.name.lastIndexOf(".");
        const baseName = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
        const fallbackPatientName = String(baseName || `케이스 ${index + 1}`).trim();
        const patientName = String(parsed.patientName || fallbackPatientName).trim();
        const tooth = String(parsed.tooth || "").trim();

        return {
          clinicName: String(practiceName || "").trim(),
          patientName,
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
          transferMemo,
          caseInfos: caseInfosPayload,
        },
      });
      if (!submitRes.ok) {
        const body = asApiMessagePayload(submitRes.data);
        throw new Error(String(body?.message || "전송 제출에 실패했습니다."));
      }

      const uploadedFileKeys = files.map((file) => toPracticeFileKey(file));
      for (const key of uploadedFileKeys) {
        await deleteFileFromIndexedDb(key).catch(() => {
          // ignore
        });
      }
      const nextMeta = readPracticeFileCacheMeta().filter(
        (row) => !uploadedFileKeys.includes(row.key),
      );
      writePracticeFileCacheMeta(nextMeta);

      setRequestSubmitted(true);
      rememberLab(selectedLab);
      setFiles([]);

      try {
        localStorage.removeItem(PRACTICE_DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }

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

  const handlePracticePasswordFind = async () => {
    if (!String(practiceName || "").trim() || !String(recoverStaffName || "").trim() || !String(recoverPhone || "").trim()) {
      toast({
        title: "입력 확인",
        description: "치과명, 담당직원명, 전화번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await apiFetch<unknown>({
        path: "/api/auth/practice/password/find",
        method: "POST",
        jsonBody: {
          clinicName: String(practiceName || "").trim(),
          staffName: String(recoverStaffName || "").trim(),
          phone: String(recoverPhone || "").trim(),
        },
      });
      const body = asApiMessagePayload(res.data);
      if (!res.ok || !body?.success) {
        toast({
          title: "계정 확인 실패",
          description: String(body?.message || "입력 정보를 확인해주세요."),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "계정 확인 완료",
        description: "계정이 확인되었습니다. 아래에서 새 비밀번호를 설정하세요.",
      });
      setRecoverAction("change");
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
                <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
                  <div className="flex min-h-0 h-full flex-col gap-3">
                    <div className="rounded-xl border border-dashed border-slate-300 px-5 pt-3 pb-3 text-center">
                      <div className="mx-auto mb-2 w-fit rounded-full bg-blue-50 p-3 text-blue-600">
                        <UploadCloud className="h-6 w-6" />
                      </div>
                      <p className="text-lg font-semibold">파일을 드래그 & 드롭하세요</p>
                      <p className="text-sm text-muted-foreground mt-1">{PRACTICE_ACCEPTED_HINT}</p>
                      <div className="mt-3">
                        <input
                          id="practice-scan-file-input"
                          type="file"
                          accept=".stl,.ply,.obj"
                          className="hidden"
                          multiple
                          onChange={(e) => {
                            const nextFiles = Array.from(e.target.files || []);
                            if (nextFiles.length) handleIncomingFiles(nextFiles);
                            e.currentTarget.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className=" px-6 text-base"
                          onClick={() => {
                            const input = document.getElementById(
                              "practice-scan-file-input",
                            ) as HTMLInputElement | null;
                            input?.click();
                          }}
                        >
                          파일 선택
                        </Button>
                      </div>
                    </div>

                    <div className="w-full rounded-lg border p-4 flex min-h-0 flex-1 flex-col">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-sm text-muted-foreground">
                          총 {files.length}개 파일 · 약 {totalSizeMb}MB
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => void clearAllFiles()}
                          disabled={files.length === 0}
                        >
                          전체삭제
                        </Button>
                      </div>
                      {files.length === 0 ? (
                        <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                          아직 추가된 파일이 없습니다.
                        </div>
                      ) : (
                        <div className="max-h-[13rem] overflow-y-auto pr-1">
                          <div className="grid grid-cols-1 gap-2 auto-rows-[4rem]">
                            {files.map((file, index) => (
                              <div
                                key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                                className="flex h-[4rem] items-center justify-between rounded-md border px-2.5 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-base font-medium">{file.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {(file.size / (1024 * 1024)).toFixed(2)}MB
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9"
                                  onClick={() => removeFile(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4 flex h-full min-h-0 flex-col gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">의뢰 내용</h3>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">기공소 선택</Label>
                      <Popover open={labOpen} onOpenChange={setLabOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={labOpen}
                            className="h-11 w-full justify-between text-base"
                          >
                            <span className="truncate">
                              {selectedLab
                                ? String(selectedLab.name || "").trim()
                                  ? getBusinessLabel(selectedLab)
                                  : "링크로 지정된 기공소"
                                : "기공소를 검색해서 선택하세요"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[420px] p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="기공소 검색 (사업자명/대표자명/사업자번호/주소)"
                              value={labSearch}
                              onValueChange={(v) => {
                                setLabSearch(v);
                              }}
                            />
                            <CommandList>
                              {!recentLabsInitialized ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">불러오는 중...</div>
                              ) : null}

                              {recentLabs.length > 0 ? (
                                <CommandGroup heading="최근 전송한 기공소">
                                  {recentLabs.map((b) => {
                                    const selected = selectedLab?._id === b._id;
                                    const rep = String(b.representativeName || "").trim();
                                    const bn = String(b.businessNumber || "").trim();
                                    const addr = String(b.address || "").trim();
                                    const meta = [
                                      rep ? `대표: ${rep}` : "",
                                      bn ? `사업자: ${bn}` : "",
                                      addr || "",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ");
                                    const searchValue = [b.name, rep, bn, addr]
                                      .filter(Boolean)
                                      .join(" ");

                                    return (
                                      <CommandItem
                                        key={`recent-${b._id}`}
                                        value={searchValue}
                                        onSelect={() => {
                                          setSelectedLab(b);
                                          setLabOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            selected ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        <div className="min-w-0">
                                          <div className="truncate text-base font-medium">{getBusinessLabel(b)}</div>
                                          {meta ? (
                                            <div className="truncate text-sm text-muted-foreground">{meta}</div>
                                          ) : null}
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  최근 전송한 기공소가 없습니다.
                                </div>
                              )}

                              <CommandSeparator />

                              <CommandGroup heading="기공소 검색">
                                {labSearching ? (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">검색 중...</div>
                                ) : labSearch.trim() ? (
                                  labSearchResults.length > 0 ? (
                                    labSearchResults.map((b) => {
                                      const selected = selectedLab?._id === b._id;
                                      const rep = String(b.representativeName || "").trim();
                                      const bn = String(b.businessNumber || "").trim();
                                      const addr = String(b.address || "").trim();
                                      const meta = [
                                        rep ? `대표: ${rep}` : "",
                                        bn ? `사업자: ${bn}` : "",
                                        addr || "",
                                      ]
                                        .filter(Boolean)
                                        .join(" · ");
                                      const searchValue = [b.name, rep, bn, addr]
                                        .filter(Boolean)
                                        .join(" ");

                                      return (
                                        <CommandItem
                                          key={b._id}
                                          value={searchValue}
                                          onSelect={() => {
                                            setSelectedLab(b);
                                            setLabOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              selected ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          <div className="min-w-0">
                                            <div className="truncate text-base font-medium">{getBusinessLabel(b)}</div>
                                            {meta ? (
                                              <div className="truncate text-sm text-muted-foreground">{meta}</div>
                                            ) : null}
                                          </div>
                                        </CommandItem>
                                      );
                                    })
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">
                                      검색 결과가 없습니다.
                                    </div>
                                  )
                                ) : (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">
                                    검색어를 입력하면 기공소를 찾을 수 있습니다.
                                  </div>
                                )}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                      <Label htmlFor="requestMemo" className="text-sm">의뢰 메모</Label>
                      <Textarea
                        id="requestMemo"
                        value={requestMemo}
                        onChange={(e) => setRequestMemo(e.target.value)}
                        placeholder="예: #36 커스텀 어버트먼트, 마진 라인 메모..."
                        className="min-h-[220px] flex-1 text-base"
                      />
                    </div>
                  </div>
                </div>
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
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={recoverAction === "find" ? "secondary" : "outline"}
                        className="h-8"
                        onClick={() => setRecoverAction("find")}
                      >
                        비밀번호 찾기
                      </Button>
                      <Button
                        type="button"
                        variant={recoverAction === "change" ? "secondary" : "outline"}
                        className="h-8"
                        onClick={() => setRecoverAction("change")}
                      >
                        비밀번호 변경
                      </Button>
                    </div>
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
                      {recoverAction === "change" && (
                        <div className="space-y-2">
                          <Label className="text-sm">새 비밀번호</Label>
                          <Input
                            type="password"
                            className="h-11 text-base"
                            value={recoverNewPassword}
                            onChange={(e) => setRecoverNewPassword(e.target.value)}
                            placeholder="10자 이상 + 특수문자"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {recoverAction === "find" ? (
                        <Button type="button" className="h-10" onClick={() => void handlePracticePasswordFind()} disabled={authSubmitting}>
                          {authSubmitting ? "확인 중..." : "계정 확인"}
                        </Button>
                      ) : (
                        <Button type="button" className="h-10" onClick={() => void handlePracticePasswordChange()} disabled={authSubmitting}>
                          {authSubmitting ? "변경 중..." : "비밀번호 변경"}
                        </Button>
                      )}
                    </div>

                    <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <p>잘 안될 경우 아래 방법으로 도움을 요청해주세요.</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      새로 가입
                    </Button>
                    <Button
                      type="button"
                      variant={authMode === "recover" ? "secondary" : "outline"}
                      className="h-9 min-w-[120px]"
                      onClick={() => setAuthMode("recover")}
                    >
                      비번 찾기
                    </Button>
                  </div>
                )}
              </form>
            )}
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
                      title: "입력 확인",
                      description: "STL, PLY, OBJ 파일, 기공소 선택, 의뢰 메모를 모두 입력해주세요.",
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
                              ? "비밀번호 찾기/변경에서 진행"
                              : signupCompleted
                                ? "의뢰 제출하기"
                                : "회원가입 후 의뢰계속하기"}
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
