import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { Loader2, Search, CheckCircle2 } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import { BusinessLicenseUpload } from "@/shared/components/business/BusinessLicenseUpload";
import type { LicenseStatus } from "@/shared/components/business/types";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";

interface OrganizationStepProps {
  role: "owner" | "member" | null;
  organizationType: string;
  defaultCompleted?: boolean;
  onComplete?: () => void;
  registerGoNextAction?: (action: (() => Promise<boolean>) | null) => void;
}

const OWNER_FIELDS = [
  {
    key: "companyName",
    label: "사업자 이름",
    placeholder: "어벗츠 사업자",
    span: "sm:col-span-1",
  },
  {
    key: "representativeName",
    label: "대표자 이름",
    placeholder: "홍길동",
    span: "lg:col-span-1",
  },
  {
    key: "businessNumber",
    label: "사업자등록번호",
    placeholder: "123-45-67890",
    span: "lg:col-span-1",
  },
  {
    key: "phone",
    label: "대표 전화번호",
    placeholder: "02-1234-5678",
    span: "lg:col-span-1",
  },
  {
    key: "email",
    label: "세금계산서 이메일",
    placeholder: "lab@example.com",
    span: "sm:col-span-1",
  },
];

const OWNER_EXTRA_FIELDS = [
  {
    key: "address",
    label: "사업자 주소",
    placeholder: "주소 검색",
    span: "sm:col-span-1",
  },
  {
    key: "addressDetail",
    label: "사업자 세부 주소",
    placeholder: "상세 주소 입력",
    span: "sm:col-span-1",
  },
  {
    key: "businessType",
    label: "업태",
    placeholder: "의료기기 제조",
    span: "lg:col-span-1",
  },
  {
    key: "businessItem",
    label: "업종",
    placeholder: "치과 보철",
    span: "lg:col-span-1",
  },
  {
    key: "startDate",
    label: "개업연월일",
    placeholder: "YYYYMMDD",
    span: "sm:col-span-1",
  },
];

const OWNER_ALL_FIELDS = [...OWNER_FIELDS, ...OWNER_EXTRA_FIELDS];

const normalizePhoneDigits = (value: string) => value.replace(/\D/g, "");

const formatPhoneNumber = (value: string) => {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
};

const isValidPhoneNumber = (value: string) => {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 9 && digits.length <= 11;
};

interface OwnerFormState {
  companyName: string;
  representativeName: string;
  businessNumber: string;
  phone: string;
  email: string;
  businessType: string;
  businessItem: string;
  address: string;
  addressDetail: string;
  startDate: string;
}

const initialOwnerState: OwnerFormState = {
  companyName: "",
  representativeName: "",
  businessNumber: "",
  phone: "",
  email: "",
  businessType: "",
  businessItem: "",
  address: "",
  addressDetail: "",
  startDate: "",
};

interface OrganizationResult {
  _id: string;
  name: string;
  representativeName?: string;
  businessNumber?: string;
  address?: string;
}

declare global {
  interface Window {
    daum?: {
      Postcode?: new (options: {
        oncomplete: (data: {
          address?: string;
          roadAddress?: string;
          jibunAddress?: string;
        }) => void;
        onclose?: () => void;
      }) => { open: (options?: { popupName?: string }) => void };
    };
  }
}

const POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let postcodeScriptPromise: Promise<void> | null = null;
const POSTCODE_POPUP_NAME = "daum-postcode";
let postcodePopupOpen = false;

const loadPostcodeScript = () => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (postcodeScriptPromise) return postcodeScriptPromise;
  postcodeScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 스크립트 로딩 실패"));
    document.body.appendChild(script);
  });
  return postcodeScriptPromise;
};

export const OrganizationStep = ({
  role,
  organizationType,
  defaultCompleted,
  onComplete,
  registerGoNextAction,
}: OrganizationStepProps) => {
  const resolvedRole = role ?? "member";
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<string>("none");
  const [ownerForm, setOwnerForm] = useState<OwnerFormState>(initialOwnerState);
  const [ownerErrors, setOwnerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [ownerSaveFailed, setOwnerSaveFailed] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>("missing");
  const [licenseFileName, setLicenseFileName] = useState("");
  const [licenseFileId, setLicenseFileId] = useState("");
  const [licenseS3Key, setLicenseS3Key] = useState("");
  const [licenseDeleteLoading, setLicenseDeleteLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OrganizationResult[]>([]);
  const [joinLoading, setJoinLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [completed, setCompleted] = useState(Boolean(defaultCompleted));
  const ownerFieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [memberError, setMemberError] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const ownerFormRef = useRef<OwnerFormState>(initialOwnerState);
  const hasLoadedRef = useRef(false);

  const localDraftKey = useMemo(() => {
    const resolvedUser = user as {
      _id?: string;
      id?: string;
      email?: string;
    } | null;
    const userId = String(
      resolvedUser?._id ||
        resolvedUser?.id ||
        resolvedUser?.email ||
        token ||
        "anonymous",
    );
    return `onboarding:business-draft:${organizationType}:${userId}`;
  }, [organizationType, token, user]);

  const readLocalDraft = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(localDraftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [localDraftKey]);

  const clearLocalDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(localDraftKey);
  }, [localDraftKey]);

  const focusFirstEmptyOwnerField = useCallback((form: OwnerFormState) => {
    const fieldOrder = OWNER_ALL_FIELDS.map((field) => field.key);
    const target =
      fieldOrder.find(
        (key) => !String(form[key as keyof OwnerFormState]).trim(),
      ) || fieldOrder[0];
    ownerFieldRefs.current[target]?.focus();
  }, []);

  useEffect(() => {
    if (defaultCompleted) {
      setCompleted(true);
    }
  }, [defaultCompleted]);

  useEffect(() => {
    ownerFormRef.current = ownerForm;
  }, [ownerForm]);

  useEffect(() => {
    if (resolvedRole === "member") {
      searchInputRef.current?.focus();
      return;
    }
    if (resolvedRole === "owner" && showManualInput) {
      ownerFieldRefs.current.companyName?.focus();
    }
  }, [resolvedRole, showManualInput]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await request<any>({
          path: `/api/organizations/me?organizationType=${encodeURIComponent(organizationType)}`,
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) {
          setLoading(false);
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;
        if (cancelled) return;
        const nextMembership = String(data?.membership || "none");
        setMembership(nextMembership);
        if (nextMembership !== "none") {
          setCompleted(true);
          onComplete?.();
        }
        const extracted = data?.extracted || {};
        const org = data?.organization || {};
        const license = org?.businessLicense || {};
        const localDraft = readLocalDraft();
        const localOwner = localDraft?.ownerForm || {};
        const localLicense = localDraft?.license || {};
        setOwnerForm((prev) => {
          const nextForm: OwnerFormState = {
            ...prev,
            companyName: String(org?.name || prev.companyName),
            representativeName: String(
              extracted?.representativeName || prev.representativeName,
            ),
            businessNumber: String(
              extracted?.businessNumber || prev.businessNumber,
            ),
            phone: formatPhoneNumber(
              String(extracted?.phoneNumber || prev.phone),
            ),
            email: String(extracted?.email || prev.email),
            businessType: String(extracted?.businessType || prev.businessType),
            businessItem: String(extracted?.businessItem || prev.businessItem),
            address: String(extracted?.address || prev.address),
            startDate: String(extracted?.startDate || prev.startDate),
            addressDetail: String(prev.addressDetail || ""),
          };
          Object.keys(nextForm).forEach((key) => {
            const typedKey = key as keyof OwnerFormState;
            if (
              !String(nextForm[typedKey] || "").trim() &&
              String(localOwner?.[typedKey] || "").trim()
            ) {
              nextForm[typedKey] = String(localOwner[typedKey]);
            }
          });
          return nextForm;
        });
        const nextLicenseFileName = String(license?.originalName || "").trim();
        const nextLicenseFileId = String(license?.fileId || "").trim();
        const nextLicenseS3Key = String(license?.s3Key || "").trim();
        const fallbackLicenseName = String(localLicense?.fileName || "").trim();
        const fallbackLicenseId = String(localLicense?.fileId || "").trim();
        const fallbackLicenseS3Key = String(localLicense?.s3Key || "").trim();
        const resolvedLicenseName = nextLicenseFileName || fallbackLicenseName;
        const fallbackStatus = String(localLicense?.status || "ready");
        const resolvedStatus: LicenseStatus = [
          "missing",
          "uploading",
          "uploaded",
          "processing",
          "ready",
          "error",
        ].includes(fallbackStatus)
          ? (fallbackStatus as LicenseStatus)
          : "ready";
        setLicenseFileName(resolvedLicenseName);
        setLicenseFileId(nextLicenseFileId || fallbackLicenseId);
        setLicenseS3Key(nextLicenseS3Key || fallbackLicenseS3Key);
        setLicenseStatus(resolvedLicenseName ? resolvedStatus : "missing");
        if (localDraft?.showManualInput || Object.values(localOwner).length) {
          setShowManualInput(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedRef.current = true;
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationType, onComplete, readLocalDraft, token]);

  useEffect(() => {
    if (!token || resolvedRole !== "member" || !search.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await request<any>({
          path: `/api/organizations/search?q=${encodeURIComponent(search.trim())}&organizationType=${encodeURIComponent(organizationType)}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;
        setResults(Array.isArray(data) ? data : []);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [organizationType, resolvedRole, search, token]);

  const markComplete = () => {
    if (completed) return;
    setCompleted(true);
    onComplete?.();
  };

  const canUploadLicense = useMemo(
    () => membership === "owner" || membership === "none",
    [membership],
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          description: "사업자등록증 업로드는 로그인 후 이용할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      if (licenseFileName) {
        toast({
          title: "이미 업로드되어 있습니다",
          description:
            "사업자등록증을 재업로드하려면 먼저 삭제하거나 [초기화]를 진행해주세요.",
          duration: 3000,
        });
        return;
      }

      if (!canUploadLicense) {
        toast({
          title: "대표 계정만 업로드할 수 있어요",
          description: "사업자등록증 업로드/수정은 대표 계정에서만 가능합니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const maxBytes = 10 * 1024 * 1024;
      const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);
      if (!allowedMimeTypes.has(file.type)) {
        toast({
          title: "이미지 파일만 업로드할 수 있어요",
          description: "JPG 또는 PNG 파일을 선택해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      if (file.size > maxBytes) {
        toast({
          title: "파일이 너무 큽니다",
          description:
            "사업자등록증 이미지는 최대 10MB까지 업로드할 수 있어요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setLicenseStatus("uploading");
      const uploaded = await uploadFilesWithToast([file]);
      const first = uploaded?.[0];
      if (!first?._id) {
        setLicenseStatus("error");
        return;
      }

      setLicenseFileName(first.originalName);
      setLicenseFileId(first._id);
      setLicenseS3Key(first.key || "");
      setLicenseStatus("processing");

      const processingStartedAt = Date.now();
      const processingToast = toast({
        title: "AI 인식 중",
        description:
          "사업자등록증을 인식하고 있어요. 약 10초 내외 걸릴 수 있어요.",
        duration: 60000,
      });
      const res = await request<any>({
        path: "/api/ai/parse-business-license",
        method: "POST",
        token,
        jsonBody: {
          fileId: first._id,
          s3Key: first.key,
          originalName: first.originalName,
        },
      });

      if (res.ok) {
        const waitMs = Math.max(0, 4500 - (Date.now() - processingStartedAt));
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        const body: any = res.data || {};
        const data = body.data || body;
        const extracted = data?.extracted || {};
        let nextForm: OwnerFormState | null = null;
        setOwnerForm((prev) => {
          nextForm = {
            ...prev,
            companyName:
              prev.companyName || String(extracted?.companyName || "").trim(),
            representativeName:
              prev.representativeName ||
              String(extracted?.representativeName || "").trim(),
            businessNumber:
              prev.businessNumber ||
              String(extracted?.businessNumber || "").trim(),
            phone:
              prev.phone ||
              formatPhoneNumber(String(extracted?.phoneNumber || "").trim()),
            email: prev.email || String(extracted?.email || "").trim(),
            businessType:
              prev.businessType || String(extracted?.businessType || "").trim(),
            businessItem:
              prev.businessItem || String(extracted?.businessItem || "").trim(),
            address: prev.address || String(extracted?.address || "").trim(),
            startDate:
              prev.startDate || String(extracted?.startDate || "").trim(),
          };
          return nextForm;
        });
        setIsVerified(Boolean(data?.verification?.verified));
        setLicenseStatus("ready");
        setShowManualInput(true);
        processingToast.dismiss();
        requestAnimationFrame(() => {
          focusFirstEmptyOwnerField(nextForm || ownerFormRef.current);
        });
      } else {
        setLicenseStatus("error");
        processingToast.dismiss();
        setShowManualInput(true);
        toast({
          title: "사업자등록증 인식 실패",
          description: "직접 입력으로 이어집니다.",
          variant: "destructive",
        });
        requestAnimationFrame(() => {
          focusFirstEmptyOwnerField(ownerFormRef.current);
        });
      }
    },
    [
      canUploadLicense,
      focusFirstEmptyOwnerField,
      licenseFileName,
      token,
      toast,
      uploadFilesWithToast,
    ],
  );

  const validateOwnerForm = (): boolean => {
    const errors: Record<string, string> = {};
    const requiredKeys = [
      "companyName",
      "representativeName",
      "businessNumber",
      "phone",
      "email",
      "businessType",
      "businessItem",
      "address",
      "startDate",
    ];
    requiredKeys.forEach((key) => {
      if (!ownerForm[key as keyof OwnerFormState]?.toString().trim()) {
        errors[key] = "필수 값입니다";
      }
    });
    if (
      ownerForm.businessNumber &&
      ownerForm.businessNumber.replace(/\D/g, "").length !== 10
    ) {
      errors.businessNumber = "10자리 숫자로 입력해주세요";
    }
    if (ownerForm.phone && !isValidPhoneNumber(ownerForm.phone)) {
      errors.phone = "전화번호 형식이 올바르지 않습니다";
    }
    if (
      ownerForm.startDate &&
      ownerForm.startDate.replace(/\D/g, "").length !== 8
    ) {
      errors.startDate = "YYYYMMDD 형식";
    }
    setOwnerErrors(errors);
    const firstInvalid = requiredKeys.find((key) => errors[key]);
    if (firstInvalid) {
      ownerFieldRefs.current[firstInvalid]?.focus();
    }
    return Object.keys(errors).length === 0;
  };

  const handleOwnerSave = async () => {
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return false;
    }
    if (!validateOwnerForm()) return false;
    setOwnerSaveFailed(false);
    setSaving(true);
    try {
      const res = await request<any>({
        path: "/api/organizations/me",
        method: "PUT",
        token,
        jsonBody: {
          organizationType,
          name: ownerForm.companyName.trim(),
          representativeName: ownerForm.representativeName.trim(),
          phoneNumber: normalizePhoneDigits(ownerForm.phone),
          businessNumber: ownerForm.businessNumber.replace(/\D/g, ""),
          businessType: ownerForm.businessType.trim(),
          businessItem: ownerForm.businessItem.trim(),
          email: ownerForm.email.trim(),
          address: `${ownerForm.address} ${ownerForm.addressDetail}`.trim(),
          startDate: ownerForm.startDate.replace(/\D/g, ""),
          ...(licenseFileId || licenseS3Key || licenseFileName
            ? {
                businessLicense: {
                  fileId: licenseFileId || null,
                  s3Key: licenseS3Key,
                  originalName: licenseFileName,
                },
              }
            : {}),
        },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        const rawMessage = String(body?.message || "저장에 실패했습니다.");
        const message = /확인할 수 없습니다|사업자등록번호/.test(rawMessage)
          ? "사업자등록정보에 오류가 있습니다."
          : rawMessage;
        toast({
          title: "저장 실패",
          description: message,
          variant: "destructive",
        });
        setOwnerSaveFailed(true);
        return false;
      }
      toast({ title: "사업자 정보가 저장되었습니다" });
      clearLocalDraft();
      setMembership("owner");
      markComplete();
      setOwnerSaveFailed(false);
      return true;
    } catch {
      toast({ title: "저장 실패", variant: "destructive" });
      setOwnerSaveFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async () => {
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return false;
    }
    if (!selectedOrgId) {
      const message = search.trim()
        ? "사업자를 선택해주세요"
        : "검색어를 입력해주세요";
      setMemberError(message);
      searchInputRef.current?.focus();
      return false;
    }
    setJoinLoading(true);
    try {
      const res = await request<any>({
        path: "/api/organizations/join-requests",
        method: "POST",
        token,
        jsonBody: {
          organizationId: selectedOrgId,
          organizationType,
        },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        const message = String(body?.message || "소속 신청 실패");
        toast({
          title: "소속 신청 실패",
          description: message,
          variant: "destructive",
        });
        return false;
      }
      toast({ title: "소속 신청 완료" });
      setMembership("pending");
      markComplete();
      return true;
    } catch {
      toast({ title: "소속 신청 실패", variant: "destructive" });
      return false;
    } finally {
      setJoinLoading(false);
    }
  };

  const hasAnyInput = useMemo(() => {
    return Object.values(ownerForm).some(
      (v) => String(v || "").trim().length > 0,
    );
  }, [ownerForm]);

  useEffect(() => {
    if (typeof window === "undefined" || resolvedRole !== "owner") return;
    if (!hasLoadedRef.current) return;
    const hasDraft =
      hasAnyInput || Boolean(licenseFileName || licenseFileId || licenseS3Key);
    if (!hasDraft) {
      clearLocalDraft();
      return;
    }
    const payload = {
      ownerForm,
      showManualInput,
      license: {
        fileName: licenseFileName,
        fileId: licenseFileId,
        s3Key: licenseS3Key,
        status: licenseStatus,
      },
    };
    window.localStorage.setItem(localDraftKey, JSON.stringify(payload));
  }, [
    clearLocalDraft,
    hasAnyInput,
    licenseFileId,
    licenseFileName,
    licenseS3Key,
    licenseStatus,
    localDraftKey,
    ownerForm,
    resolvedRole,
    showManualInput,
  ]);

  useEffect(() => {
    if (hasAnyInput) {
      setShowManualInput(true);
    }
  }, [hasAnyInput]);

  useEffect(() => {
    if (!registerGoNextAction) return;
    if (resolvedRole === "owner") {
      registerGoNextAction(() => handleOwnerSave());
    } else if (resolvedRole === "member") {
      registerGoNextAction(() => handleJoin());
    }
    return () => registerGoNextAction?.(null);
  }, [resolvedRole, registerGoNextAction, handleOwnerSave, handleJoin]);

  const renderOwnerForm = () => (
    <div className="space-y-4">
      {!showManualInput && (
        <>
          <p className="text-sm text-slate-500">
            사업자등록증을 업로드하면 자동으로 정보가 채워져요.
          </p>

          <div
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) {
                void handleFileUpload(file);
              }
            }}
          >
            <BusinessLicenseUpload
              membership={membership as any}
              licenseStatus={licenseStatus}
              isVerified={isVerified}
              licenseFileName={licenseFileName}
              licenseDeleteLoading={licenseDeleteLoading}
              onFileUpload={handleFileUpload}
              onDeleteLicense={() => {
                setLicenseFileName("");
                setLicenseFileId("");
                setLicenseS3Key("");
                setLicenseStatus("missing");
              }}
            />
          </div>

          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowManualInput(true)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              혹은 직접 입력
            </Button>
          </div>
        </>
      )}

      {showManualInput && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              사업자 정보를 입력해주세요.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowManualInput(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              업로드로 전환
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {OWNER_ALL_FIELDS.map(({ key, label, placeholder, span }) => {
              const isAddress = key === "address";
              return (
                <div className={cn("space-y-1.5", span)} key={key}>
                  <Label className="text-xs">
                    {label}
                    {ownerErrors[key] && (
                      <span className="ml-1.5 text-xs font-medium text-destructive">
                        {ownerErrors[key]}
                      </span>
                    )}
                  </Label>
                  <Input
                    ref={(el) => {
                      ownerFieldRefs.current[key] = el;
                    }}
                    value={ownerForm[key as keyof OwnerFormState] as string}
                    placeholder={placeholder}
                    readOnly={isAddress}
                    onChange={(e) => {
                      if (isAddress) return;
                      const nextValue =
                        key === "phone"
                          ? formatPhoneNumber(e.target.value)
                          : e.target.value;
                      setOwnerForm((prev) => ({
                        ...prev,
                        [key]: nextValue,
                      }));
                      if (key === "phone") {
                        const hasDigits =
                          normalizePhoneDigits(nextValue).length > 0;
                        if (hasDigits && !isValidPhoneNumber(nextValue)) {
                          setOwnerErrors((prev) => ({
                            ...prev,
                            phone: "전화번호 형식이 올바르지 않습니다",
                          }));
                          return;
                        }
                      }
                      if (ownerErrors[key]) {
                        setOwnerErrors((prev) => ({ ...prev, [key]: "" }));
                      }
                    }}
                    onClick={async () => {
                      if (!isAddress) return;
                      try {
                        await loadPostcodeScript();
                        if (!window.daum?.Postcode) {
                          throw new Error("주소 검색 스크립트 로딩 실패");
                        }
                        if (postcodePopupOpen) {
                          window.open("", POSTCODE_POPUP_NAME)?.focus();
                          return;
                        }
                        postcodePopupOpen = true;
                        new window.daum.Postcode({
                          oncomplete: (data) => {
                            const nextAddress =
                              data.roadAddress ||
                              data.jibunAddress ||
                              data.address ||
                              "";
                            setOwnerForm((prev) => ({
                              ...prev,
                              address: nextAddress,
                            }));
                            if (ownerErrors.address) {
                              setOwnerErrors((prev) => ({
                                ...prev,
                                address: "",
                              }));
                            }
                            ownerFieldRefs.current.addressDetail?.focus();
                          },
                          onclose: () => {
                            postcodePopupOpen = false;
                          },
                        }).open({ popupName: POSTCODE_POPUP_NAME });
                      } catch {
                        postcodePopupOpen = false;
                        toast({
                          title: "주소 검색을 불러오지 못했습니다",
                          description: "잠시 후 다시 시도해주세요.",
                          variant: "destructive",
                        });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (key === "address") {
                        ownerFieldRefs.current.addressDetail?.focus();
                        return;
                      }
                      if (key === "addressDetail") {
                        ownerFieldRefs.current.businessType?.focus();
                        return;
                      }
                      void handleOwnerSave();
                    }}
                    className={cn(
                      "h-9 text-sm",
                      ownerErrors[key] ? "border-destructive" : "",
                    )}
                  />
                </div>
              );
            })}
          </div>
          {ownerSaveFailed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              <p className="font-medium">저장 오류가 반복됩니다</p>
              <p className="mt-1">
                관리자에게 문의를 남기고 다음 단계로 진행할 수 있어요.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    markComplete();
                    toast({
                      title: "다음 단계로 이동했습니다",
                      description:
                        "담당자가 확인 후 연락드릴게요. 설정에서 언제든 다시 저장할 수 있어요.",
                    });
                  }}
                >
                  문의 남기고 다음으로
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderMemberSearch = () => (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        가입하고 싶은 사업자를 검색해 신청하세요. 대표가 승인하면 자동으로
        연결됩니다.
      </p>

      <div className="space-y-2">
        <Label htmlFor="org-search">
          사업자 검색
          {memberError && (
            <span className="ml-2 text-xs font-medium text-destructive">
              {memberError}
            </span>
          )}
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="org-search"
            ref={searchInputRef}
            className={cn("pl-9", memberError ? "border-destructive" : "")}
            placeholder="사업자명, 대표자명, 사업자번호 중 하나 입력"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedOrgId("");
              if (memberError) setMemberError("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void handleJoin();
            }}
          />
        </div>
        {searching && <p className="text-xs text-slate-400">검색 중...</p>}
      </div>

      <div className="space-y-3">
        {results.map((org) => {
          const meta = [
            org.representativeName ? `대표 ${org.representativeName}` : "",
            org.businessNumber ? org.businessNumber : "",
            org.address ? org.address : "",
          ]
            .filter(Boolean)
            .join(" · ");
          const active = selectedOrgId === org._id;
          return (
            <button
              key={org._id}
              type="button"
              onClick={() => {
                setSelectedOrgId(org._id);
                if (memberError) setMemberError("");
              }}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition-all",
                active
                  ? "border-indigo-300 bg-indigo-50 text-slate-900 shadow-sm"
                  : "border-slate-200 bg-white/80 hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-sm",
              )}
            >
              <p className="font-semibold text-slate-900">{org.name}</p>
              {!!meta && <p className="mt-1 text-xs text-slate-500">{meta}</p>}
            </button>
          );
        })}

        {!search.trim() && (
          <p className="text-sm text-slate-400">
            검색어를 입력하면 목록이 나타납니다.
          </p>
        )}
        {search.trim() && !results.length && !searching && (
          <p className="text-sm text-slate-400">검색 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 정보를 불러오는 중…
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <div>
          <p className="font-semibold text-emerald-700">완료되었습니다</p>
          <p className="text-sm text-emerald-600">
            {membership === "owner"
              ? "사업자 정보가 등록되었습니다."
              : membership === "pending"
                ? "대표 승인 대기 중입니다."
                : "사업자 연결이 끝났습니다."}
          </p>
        </div>
      </div>
    );
  }

  return resolvedRole === "owner" ? renderOwnerForm() : renderMemberSearch();
};
