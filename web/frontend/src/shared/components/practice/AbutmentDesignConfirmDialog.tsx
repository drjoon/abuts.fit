// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/shared/components/practice/RetentionGrooveField.tsx
// - web/backend/controllers/requests/designHandoff.controller.js
// change-log:
// - 2026-08-16: teethOptions — 남은 CA 치아를 확인 모달에서 직접 선택(지정 다이얼로그 생략).
// - 2026-08-16: 다파일 큐 progress·확인 버튼 라벨 전달.
// - 2026-08-16: AbutmentModelConfirmDialog(lab-handoff) 어댑터로 통합.
// - 2026-08-16: 유지홈 공통 필드·안내 모달. 계정 기본값(없음) 적용.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import type { CaseInfos, Connection } from "@/pages/requestor/new_request/hooks/newRequestTypes";
import {
  AbutmentModelConfirmDialog,
} from "@/shared/components/practice/AbutmentModelConfirmDialog";
import type { RetentionGrooveChoice } from "@/shared/components/practice/RetentionGrooveField";

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
  onConfirm: (caseInfos: AbutmentDesignConfirmCaseInfos) => void | Promise<void>;
  onCancel?: () => void;
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
  onConfirm,
  onCancel,
}: Props) {
  const { toast } = useToast();
  const [detailCaseInfos, setDetailCaseInfosState] = useState<CaseInfos>(() =>
    emptyCaseInfos(defaultRetentionGroove),
  );
  const [implantManufacturer, setImplantManufacturerState] = useState("");
  const [implantBrand, setImplantBrandState] = useState("");
  const [implantFamily, setImplantFamilyState] = useState("");
  const [implantType, setImplantTypeState] = useState("");

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
  }, [open, initialCaseInfos, file, defaultRetentionGroove]);

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
    return connections
      .filter(
        (c) =>
          (!implantManufacturer || c.manufacturer === implantManufacturer) &&
          (!implantBrand || c.brand === implantBrand),
      )
      .map((c) => c.family as string)
      .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);
  }, [connections, implantBrand, implantManufacturer]);

  const typeOptions = useMemo(() => {
    return connections
      .filter(
        (c) =>
          (!implantManufacturer || c.manufacturer === implantManufacturer) &&
          (!implantBrand || c.brand === implantBrand) &&
          (!implantFamily || c.family === implantFamily),
      )
      .map((c) => c.type as string)
      .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);
  }, [connections, implantBrand, implantFamily, implantManufacturer]);

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
      return { progressLabel: "", confirmLabel: "확인 & 업로드" };
    }
    const isLast = current >= total;
    return {
      progressLabel: `${current}/${total}`,
      confirmLabel: isLast ? "확인 & 업로드" : "확인 & 다음",
    };
  }, [queueCurrent, queueTotal]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (confirming) return;
      onOpenChange(next);
      if (!next) onCancel?.();
    },
    [confirming, onCancel, onOpenChange],
  );

  const handleVerifyAndNext = useCallback(async () => {
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
  }, [detailCaseInfos, onConfirm, toast]);

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
      highlightUnverifiedArrows={false}
      handleRemoveFile={() => {}}
      onVerifyAndNext={handleVerifyAndNext}
      onSkip={() => {}}
      toast={toast}
      lockProductionProductMode
      confirming={confirming}
      confirmLabel={queueProgress.confirmLabel}
      progressLabel={queueProgress.progressLabel}
      onRetentionGrooveAccountSave={onRetentionGrooveAccountSave}
    />
  );
}
