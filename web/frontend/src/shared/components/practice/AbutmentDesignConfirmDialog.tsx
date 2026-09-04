// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/shared/components/practice/RetentionGrooveField.tsx
// - web/backend/controllers/requests/designHandoff.controller.js
// change-log:
// - 2026-09-04: 카탈로그 불일치 시 폴백 금지·확인 차단·관리자 alert. CNC 표 병합·미도입 환봉 제외.
// - 2026-09-04: 핸드오프 카탈로그에 CNC 표 병합·미도입 환봉 제외. 임플란트 선택 오염(TS3→US) 방지.
// - 2026-09-02: 확인 라벨「확인」/「다음」(사전 S3 업로드 완료 전제). 업로드 중 확인 버튼 비활성.
// - 2026-08-28: 현재 파일 S3 업로드 프로그레스를 확인 모달에 전달.
// - 2026-08-16: teethOptions — 남은 CA 치아를 확인 모달에서 직접 선택(지정 다이얼로그 생략).
// - 2026-08-16: 다파일 큐 progress·확인 버튼 라벨 전달.
// - 2026-08-16: AbutmentModelConfirmDialog(lab-handoff) 어댑터로 통합.
// - 2026-08-16: 유지홈 공통 필드·안내 모달. 계정 기본값(없음) 적용.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import type { CaseInfos, Connection } from "@/pages/requestor/new_request/hooks/newRequestTypes";
import {
  AbutmentModelConfirmDialog,
} from "@/shared/components/practice/AbutmentModelConfirmDialog";
import type { RetentionGrooveChoice } from "@/shared/components/practice/RetentionGrooveField";
import { mergeCncImplantSpecs } from "@/shared/practice/cncImplantCatalog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export type AbutmentDesignConfirmCaseInfos = {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  retentionGroove?: RetentionGrooveChoice | "shallow" | "";
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  initialCaseInfos?: AbutmentDesignConfirmCaseInfos | null;
  /** 계정 유지홈 기본값(없으면 none) */
  defaultRetentionGroove?: RetentionGrooveChoice;
  onRetentionGrooveAccountSave?: (value: RetentionGrooveChoice) => void;
  connections: Connection[];
  confirming?: boolean;
  /** 1-based index in multi-file queue */
  queueCurrent?: number;
  /** total files in multi-file queue */
  queueTotal?: number;
  /** 남은 치아 선택지(없으면 자유 입력) */
  teethOptions?: { id: string; label: string }[];
  /** 현재 파일 S3 사전업로드 */
  fileUploadPercent?: number | null;
  fileUploadLabel?: string | null;
  onConfirm: (caseInfos: AbutmentDesignConfirmCaseInfos) => void | Promise<void>;
  onCancel?: () => void;
  /** 관리자 alert용 컨텍스트 */
  reportTransferId?: string | null;
  reportRequestId?: string | null;
  reportLabName?: string | null;
};

const noopPreset = (_label: string) => {};
const clearNoop = () => {};
const emptyOptions: { id: string; label: string }[] = [];

const emptyCaseInfos = (
  retentionDefault: RetentionGrooveChoice = "none",
): CaseInfos => ({
  clinicName: "",
  patientName: "",
  tooth: "",
  implantManufacturer: "",
  implantBrand: "",
  implantFamily: "",
  implantType: "",
  retentionGroove: retentionDefault,
  productMode: "custom_abutment",
});

const normalizeRetention = (
  value: unknown,
  fallback: RetentionGrooveChoice,
): RetentionGrooveChoice => {
  if (value === "deep") return "deep";
  if (value === "none" || value === "shallow") return "none";
  return fallback;
};

export function AbutmentDesignConfirmDialog({
  open,
  onOpenChange,
  file,
  initialCaseInfos,
  defaultRetentionGroove = "none",
  onRetentionGrooveAccountSave,
  connections,
  confirming = false,
  queueCurrent,
  queueTotal,
  teethOptions = emptyOptions,
  fileUploadPercent = null,
  fileUploadLabel = null,
  onConfirm,
  onCancel,
  reportTransferId = null,
  reportRequestId = null,
  reportLabName = null,
}: Props) {
  const { toast } = useToast();
  const token = useAuthStore((s) => s.token);
  const [detailCaseInfos, setDetailCaseInfosState] = useState<CaseInfos>(() =>
    emptyCaseInfos(defaultRetentionGroove),
  );
  const [implantManufacturer, setImplantManufacturerState] = useState("");
  const [implantBrand, setImplantBrandState] = useState("");
  const [implantFamily, setImplantFamilyState] = useState("");
  const [implantType, setImplantTypeState] = useState("");
  const [catalogIssue, setCatalogIssue] = useState<{
    manufacturer: string;
    brand: string;
    family: string;
    type: string;
    reason: "brand_not_in_catalog";
  } | null>(null);
  const reportedIssueKeyRef = useRef("");

  /** CNC 표 + API. 미도입(도입중) 환봉/공개 스펙은 제외 — 핸드오프에서 TS3→US 오염 방지. */
  const handoffConnections = useMemo((): Connection[] => {
    const cncActive = mergeCncImplantSpecs(connections).map((row) => ({
      manufacturer: row.manufacturer,
      brand: row.brand,
      family: row.family,
      type: row.type,
      displayManufacturer: row.displayManufacturer,
      displayBrand: row.displayBrand,
      displayFamily: row.displayFamily,
      displayType: row.type,
    }));
    const fromApi = connections.filter((row) => {
      const pendingPublic =
        (Boolean(row.roundBar) || Boolean(row.isPublic)) &&
        row.adopted !== true;
      return !pendingPublic;
    });
    const seen = new Set<string>();
    const out: Connection[] = [];
    for (const row of [...cncActive, ...fromApi]) {
      const manufacturer = String(row.manufacturer || "").trim();
      const brand = String(row.brand || "").trim();
      const family = String(row.family || "").trim();
      const type = String(row.type || "Hex").trim() || "Hex";
      if (!manufacturer || !brand) continue;
      const key = `${manufacturer}|${brand}|${family}|${type}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...row,
        manufacturer,
        brand,
        family,
        type,
      });
    }
    return out;
  }, [connections]);

  useEffect(() => {
    if (!open) return;
    const retention = normalizeRetention(
      initialCaseInfos?.retentionGroove,
      defaultRetentionGroove || "none",
    );
    const next: CaseInfos = {
      ...emptyCaseInfos(retention),
      clinicName: String(initialCaseInfos?.clinicName || "").trim(),
      patientName: String(initialCaseInfos?.patientName || "").trim(),
      tooth: String(initialCaseInfos?.tooth || "").trim(),
      implantManufacturer: String(initialCaseInfos?.implantManufacturer || "").trim(),
      implantBrand: String(initialCaseInfos?.implantBrand || "").trim(),
      implantFamily: String(initialCaseInfos?.implantFamily || "").trim(),
      implantType: String(initialCaseInfos?.implantType || "").trim(),
      retentionGroove: retention,
    };
    setDetailCaseInfosState(next);
    setImplantManufacturerState(String(next.implantManufacturer || ""));
    setImplantBrandState(String(next.implantBrand || ""));
    setImplantFamilyState(String(next.implantFamily || ""));
    setImplantTypeState(String(next.implantType || ""));
    setCatalogIssue(null);
    reportedIssueKeyRef.current = "";
  }, [open, initialCaseInfos, file, defaultRetentionGroove]);

  const handleImplantCatalogIssue = useCallback(
    (
      issue: {
        manufacturer: string;
        brand: string;
        family: string;
        type: string;
        reason: "brand_not_in_catalog";
      } | null,
    ) => {
      setCatalogIssue(issue);
      if (!issue) {
        reportedIssueKeyRef.current = "";
        return;
      }
      const key = [
        issue.manufacturer,
        issue.brand,
        issue.family,
        issue.type,
        reportTransferId || "",
        reportRequestId || "",
      ].join("|");
      if (reportedIssueKeyRef.current === key) return;
      reportedIssueKeyRef.current = key;
      void apiFetch({
        path: "/api/practice/transfers/implant-catalog-mismatch",
        method: "POST",
        token,
        jsonBody: {
          reason: issue.reason,
          source: "fe.AbutmentDesignConfirmDialog",
          transferId: reportTransferId,
          requestId: reportRequestId,
          tooth: detailCaseInfos.tooth,
          patientName: detailCaseInfos.patientName,
          clinicName: detailCaseInfos.clinicName,
          labName: reportLabName,
          implantManufacturer: issue.manufacturer,
          implantBrand: issue.brand,
          implantFamily: issue.family,
          implantType: issue.type,
          message:
            "핸드오프 확인 모달: 임플란트 brand가 CNC 카탈로그에 없어 폴백 없이 의뢰를 차단했습니다.",
        },
      }).catch(() => {
        // best-effort admin alert
      });
    },
    [
      token,
      reportTransferId,
      reportRequestId,
      reportLabName,
      detailCaseInfos.tooth,
      detailCaseInfos.patientName,
      detailCaseInfos.clinicName,
    ],
  );

  const setDetailCaseInfos = useCallback((updates: Partial<CaseInfos>) => {
    setDetailCaseInfosState((prev) => {
      const next = { ...prev, ...updates };
      if (updates.implantManufacturer !== undefined) {
        setImplantManufacturerState(String(updates.implantManufacturer || ""));
      }
      if (updates.implantBrand !== undefined) {
        setImplantBrandState(String(updates.implantBrand || ""));
      }
      if (updates.implantFamily !== undefined) {
        setImplantFamilyState(String(updates.implantFamily || ""));
      }
      if (updates.implantType !== undefined) {
        setImplantTypeState(String(updates.implantType || ""));
      }
      return next;
    });
  }, []);

  const setImplantManufacturer = useCallback(
    (v: string) => {
      setImplantManufacturerState(v);
      setDetailCaseInfosState((prev) => ({ ...prev, implantManufacturer: v }));
    },
    [],
  );
  const setImplantBrand = useCallback((v: string) => {
    setImplantBrandState(v);
    setDetailCaseInfosState((prev) => ({ ...prev, implantBrand: v }));
  }, []);
  const setImplantFamily = useCallback((v: string) => {
    setImplantFamilyState(v);
    setDetailCaseInfosState((prev) => ({ ...prev, implantFamily: v }));
  }, []);
  const setImplantType = useCallback((v: string) => {
    setImplantTypeState(v);
    setDetailCaseInfosState((prev) => ({ ...prev, implantType: v }));
  }, []);

  const familyOptions = useMemo(() => {
    return handoffConnections
      .filter(
        (c) =>
          (!implantManufacturer ||
            c.manufacturer.toLowerCase() ===
              implantManufacturer.toLowerCase()) &&
          (!implantBrand ||
            String(c.brand || "").toLowerCase() ===
              implantBrand.toLowerCase()),
      )
      .map((c) => c.family as string)
      .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);
  }, [handoffConnections, implantBrand, implantManufacturer]);

  const typeOptions = useMemo(() => {
    return handoffConnections
      .filter(
        (c) =>
          (!implantManufacturer ||
            c.manufacturer.toLowerCase() ===
              implantManufacturer.toLowerCase()) &&
          (!implantBrand ||
            String(c.brand || "").toLowerCase() ===
              implantBrand.toLowerCase()) &&
          (!implantFamily ||
            String(c.family || "").toLowerCase() ===
              implantFamily.toLowerCase()),
      )
      .map((c) => c.type as string)
      .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);
  }, [handoffConnections, implantBrand, implantFamily, implantManufacturer]);

  const syncSelectedConnection = useCallback(
    (manufacturer: string, brand: string, family: string, type: string) => {
      setImplantManufacturerState(manufacturer);
      setImplantBrandState(brand);
      setImplantFamilyState(family);
      setImplantTypeState(type);
      setDetailCaseInfosState((prev) => ({
        ...prev,
        implantManufacturer: manufacturer,
        implantBrand: brand,
        implantFamily: family,
        implantType: type,
      }));
    },
    [],
  );

  const files = useMemo(() => (file ? [file] : []), [file]);

  const queueProgress = useMemo(() => {
    const total = Number(queueTotal || 0);
    const current = Number(queueCurrent || 0);
    if (!(total > 1) || !(current >= 1)) {
      return { progressLabel: "", confirmLabel: "확인" };
    }
    const isLast = current >= total;
    return {
      progressLabel: `${current}/${total}`,
      confirmLabel: isLast ? "확인" : "다음",
    };
  }, [queueCurrent, queueTotal]);

  /** 모달 오픈 중 사전 업로드 진행 중이면 확인 클릭 금지(완료 후 handoff만) */
  const s3UploadBlocking = useMemo(() => {
    if (typeof fileUploadPercent !== "number") return false;
    const label = String(fileUploadLabel || "").trim();
    // 실패 시에는 확인으로 ensure 재시도 허용
    if (label === "업로드 실패") return false;
    return true;
  }, [fileUploadPercent, fileUploadLabel]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (confirming) return;
      onOpenChange(next);
      if (!next) onCancel?.();
    },
    [confirming, onCancel, onOpenChange],
  );

  const handleVerifyAndNext = useCallback(async () => {
    if (catalogIssue) {
      toast({
        title: "의뢰 처리 중 오류",
        description:
          "불편을 끼쳐드려 죄송합니다만 의뢰건 처리 중 에러가 발생했습니다. 플랫폼 개발팀에게 관련 내용 전달하였고, 빠른 시간 내에 조치하겠습니다.",
        variant: "destructive",
      });
      return;
    }
    const missing: string[] = [];
    if (!String(detailCaseInfos.clinicName || "").trim()) missing.push("치과명");
    if (!String(detailCaseInfos.patientName || "").trim()) missing.push("환자명");
    if (!String(detailCaseInfos.tooth || "").trim()) missing.push("치아번호");
    if (!String(detailCaseInfos.implantManufacturer || "").trim()) {
      missing.push("Manufacturer");
    }
    if (!String(detailCaseInfos.implantBrand || "").trim()) missing.push("Brand");
    if (!String(detailCaseInfos.implantFamily || "").trim()) missing.push("Family");
    if (!String(detailCaseInfos.implantType || "").trim()) missing.push("Type");
    const rg = String(detailCaseInfos.retentionGroove || "").trim();
    if (rg !== "none" && rg !== "deep") missing.push("유지홈");
    if (missing.length > 0) {
      toast({
        title: "정보를 먼저 채워주세요",
        description: `${missing.join(", ")}을(를) 확인해주세요.`,
        variant: "destructive",
      });
      return;
    }
    await onConfirm({
      clinicName: String(detailCaseInfos.clinicName || "").trim(),
      patientName: String(detailCaseInfos.patientName || "").trim(),
      tooth: String(detailCaseInfos.tooth || "").trim(),
      implantManufacturer: String(detailCaseInfos.implantManufacturer || "").trim(),
      implantBrand: String(detailCaseInfos.implantBrand || "").trim(),
      implantFamily: String(detailCaseInfos.implantFamily || "").trim(),
      implantType: String(detailCaseInfos.implantType || "").trim(),
      retentionGroove: rg === "deep" ? "deep" : "none",
    });
  }, [catalogIssue, detailCaseInfos, onConfirm, toast]);

  return (
    <AbutmentModelConfirmDialog
      variant="lab-handoff"
      open={open}
      onOpenChange={handleOpenChange}
      detailIndex={0}
      selectedPreviewIndex={0}
      files={files}
      detailFile={file}
      detailCaseInfos={detailCaseInfos}
      setDetailCaseInfos={setDetailCaseInfos}
      handleDiameterComputed={() => {}}
      connections={handoffConnections}
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
      clinicNameOptions={emptyOptions}
      patientNameOptions={emptyOptions}
      teethOptions={teethOptions}
      addClinicPreset={noopPreset}
      clearAllClinicPresets={clearNoop}
      addPatientPreset={noopPreset}
      clearAllPatientPresets={clearNoop}
      addTeethPreset={noopPreset}
      clearAllTeethPresets={clearNoop}
      handleAddOrSelectClinic={noopPreset}
      onImplantCatalogIssue={handleImplantCatalogIssue}
      highlightUnverifiedArrows={false}
      handleRemoveFile={() => {}}
      onVerifyAndNext={handleVerifyAndNext}
      onSkip={() => {}}
      toast={toast}
      lockProductionProductMode
      confirming={confirming}
      confirmDisabled={s3UploadBlocking || Boolean(catalogIssue)}
      confirmLabel={queueProgress.confirmLabel}
      progressLabel={queueProgress.progressLabel}
      fileUploadPercent={fileUploadPercent}
      fileUploadLabel={fileUploadLabel}
      onRetentionGrooveAccountSave={onRetentionGrooveAccountSave}
    />
  );
}
