// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/shared/practice/labOralScanCaseApi.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - docs/intent/lab-custom-abutment-scan-vs-stl-entry.md
import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PracticeTransferFileDropTarget } from "@/shared/components/practice/PracticeTransferFileDropTarget";
import {
  PracticeCustomAbutmentPreviewDialog,
} from "@/shared/components/practice/PracticeCustomAbutmentPreviewDialog";
import { NewRequestDesignAbutmentFields } from "./NewRequestDesignAbutmentFields";
import { useFilePreUpload, toTempUploadFileKey } from "@/shared/hooks/useFilePreUpload";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { createLabOralScanCase } from "@/shared/practice/labOralScanCaseApi";
import {
  ABUTMENT_PRODUCT_MODE,
  normalizeToothWorks,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { isCustomAbutmentWork } from "@/shared/practice/labFeeSchedule";
import type { CaseInfos } from "../hooks/newRequestTypes";
import { cn } from "@/shared/ui/cn";

const SCAN_EXTS = new Set([".stl", ".ply", ".obj"]);

const getExt = (name: string) => {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
};

type Props = {
  onBack: () => void;
  onSwitchToStl: () => void;
  onProductionOrdered?: () => void;
};

export function LabOralScanEntryPanel({
  onBack,
  onSwitchToStl,
  onProductionOrdered,
}: Props) {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const { ensureFilesUploaded, uploadProgress } = useFilePreUpload({ token });

  const [caseInfos, setCaseInfosState] = useState<CaseInfos>({
    clinicName: "",
    patientName: "",
    toothWorks: [],
    productMode: "custom_abutment",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState("");
  const [designFiles, setDesignFiles] = useState<
    { fileName: string; s3Key: string; size: number; scanRole?: string | null }[]
  >([]);

  const setCaseInfos = useCallback((updates: Partial<CaseInfos>) => {
    setCaseInfosState((prev) => ({ ...prev, ...updates }));
  }, []);

  const toothWorks = useMemo(
    () => normalizeToothWorks(caseInfos.toothWorks || []),
    [caseInfos.toothWorks],
  );

  const clinicOptions = useMemo(
    () =>
      String(caseInfos.clinicName || "").trim()
        ? [{ id: "1", label: String(caseInfos.clinicName) }]
        : [],
    [caseInfos.clinicName],
  );
  const patientOptions = useMemo(
    () =>
      String(caseInfos.patientName || "").trim()
        ? [{ id: "1", label: String(caseInfos.patientName) }]
        : [],
    [caseInfos.patientName],
  );

  const handleAddFiles = useCallback(
    (incoming: File[]) => {
      const accepted: File[] = [];
      const rejected: string[] = [];
      for (const file of incoming) {
        if (!SCAN_EXTS.has(getExt(file.name))) {
          rejected.push(file.name);
          continue;
        }
        accepted.push(file);
      }
      if (rejected.length > 0) {
        toast({
          title: "지원하지 않는 파일",
          description: `STL·PLY·OBJ만 첨부할 수 있습니다. (${rejected.slice(0, 3).join(", ")})`,
          variant: "destructive",
        });
      }
      if (accepted.length === 0) return;
      setFiles((prev) => {
        const keys = new Set(prev.map(toTempUploadFileKey));
        const next = [...prev];
        for (const file of accepted) {
          const key = toTempUploadFileKey(file);
          if (keys.has(key)) continue;
          keys.add(key);
          next.push(file);
        }
        return next;
      });
    },
    [toast],
  );

  const removeFile = useCallback((file: File) => {
    const key = toTempUploadFileKey(file);
    setFiles((prev) => prev.filter((row) => toTempUploadFileKey(row) !== key));
  }, []);

  const handleStartDesign = useCallback(async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }
    const patientName = String(caseInfos.patientName || "").trim();
    if (!patientName) {
      toast({
        title: "환자명을 입력해 주세요",
        variant: "destructive",
      });
      return;
    }
    const allWorks = normalizeToothWorks(caseInfos.toothWorks || []);
    const finalWorks: ToothWorkSelection[] = allWorks.filter((row) =>
      isCustomAbutmentWork(row),
    );
    if (finalWorks.length === 0) {
      toast({
        title: "커스텀어벗 치식을 선택해 주세요",
        variant: "destructive",
      });
      return;
    }
    if (files.length === 0) {
      toast({
        title: "구강 스캔 파일을 첨부해 주세요",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await ensureFilesUploaded(files);
      const fileRows = uploaded.map((row, index) => ({
        originalName: row.originalName || files[index]?.name || "scan.stl",
        mimetype: row.mimetype || "application/octet-stream",
        size: row.size || files[index]?.size || 0,
        s3Key: String(row.key || "").trim(),
        patientName,
      }));
      if (fileRows.some((row) => !row.s3Key)) {
        toast({
          title: "업로드 실패",
          description: "스캔 파일 업로드를 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }

      const created = await createLabOralScanCase(token, {
        clinicName: String(caseInfos.clinicName || "").trim(),
        patientName,
        memo: String(caseInfos.memo || "").trim(),
        toothWorks: finalWorks.map((row) => ({
          ...row,
          customAbutment: true,
          abutmentProductMode: ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
        })),
        files: fileRows,
      });
      if (!created.ok || !created.data?.caseId) {
        toast({
          title: "케이스 생성 실패",
          description: created.message || "다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }

      setActiveCaseId(created.data.caseId);
      setDesignFiles(
        fileRows.map((row) => ({
          fileName: row.originalName,
          s3Key: row.s3Key,
          size: row.size,
          scanRole: null,
        })),
      );
      setDesignOpen(true);
    } catch (error) {
      toast({
        title: "시작 실패",
        description:
          error instanceof Error ? error.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    caseInfos.clinicName,
    caseInfos.memo,
    caseInfos.patientName,
    caseInfos.toothWorks,
    ensureFilesUploaded,
    files,
    toast,
    token,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900">
            구강 스캔으로 디자인
          </h2>
          <p className="text-sm text-slate-600">
            환자·임플·스캔을 등록한 뒤 자동 디자인하고 생산 의뢰합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            처음으로
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSwitchToStl}>
            어벗 STL로 생산
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
          <h3 className="text-sm font-semibold text-slate-900">구강 스캔</h3>
          <PracticeTransferFileDropTarget
            fileInputId="lab-oral-scan-files"
            onFiles={handleAddFiles}
            accept=".stl,.ply,.obj,model/stl,application/sla"
            filterFiles={(incoming) =>
              incoming.filter((file) => SCAN_EXTS.has(getExt(file.name)))
            }
            label="클릭하거나 STL·PLY·OBJ를 드래그해 첨부"
            className="min-h-[9rem]"
          />
          {files.length > 0 ? (
            <ul className="max-h-40 space-y-1.5 overflow-y-auto px-1 py-1">
              {files.map((file) => {
                const key = toTempUploadFileKey(file);
                const progress = uploadProgress?.[key];
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{file.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {progress?.status === "uploading" ? (
                        <span className="text-xs text-slate-500">
                          {Math.round(progress.percent || 0)}%
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => removeFile(file)}
                      >
                        제거
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="lab-scan-clinic">치과명</Label>
              <Input
                id="lab-scan-clinic"
                value={String(caseInfos.clinicName || "")}
                onChange={(e) => setCaseInfos({ clinicName: e.target.value })}
                placeholder="미가입 치과명"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lab-scan-patient">환자명</Label>
              <Input
                id="lab-scan-patient"
                value={String(caseInfos.patientName || "")}
                onChange={(e) => setCaseInfos({ patientName: e.target.value })}
                placeholder="환자명"
              />
            </div>
          </div>
          <Button
            type="button"
            className={cn("mt-auto h-11 font-semibold")}
            disabled={submitting}
            onClick={() => void handleStartDesign()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                준비 중…
              </>
            ) : (
              "디자인 시작"
            )}
          </Button>
        </section>

        <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3.5 px-1.5 py-1.5 sm:px-3.5 sm:py-3.5">
          <NewRequestDesignAbutmentFields
            caseInfos={caseInfos}
            setCaseInfos={setCaseInfos}
            clinicNameOptions={clinicOptions}
            patientNameOptions={patientOptions}
            addClinicPreset={() => {}}
            clearAllClinicPresets={() => {}}
            addPatientPreset={() => {}}
            clearAllPatientPresets={() => {}}
            handleAddOrSelectClinic={(label) => setCaseInfos({ clinicName: label })}
            abutmentEntryMode="design"
            onAlternateNavigate={onSwitchToStl}
            alternateNavigateLabel="어벗 STL로 생산"
          />
        </section>
      </div>

      <PracticeCustomAbutmentPreviewDialog
        open={designOpen}
        onOpenChange={(open) => {
          setDesignOpen(open);
          if (!open) setActiveCaseId("");
        }}
        authToken={token}
        viewerRole="lab"
        labOralScanMode
        caseTitle={`${String(caseInfos.clinicName || "").trim() || "치과"} · ${String(caseInfos.patientName || "").trim() || "환자"}`}
        patientName={String(caseInfos.patientName || "").trim()}
        toothWorks={toothWorks}
        files={designFiles}
        transferId={activeCaseId}
        onActionComplete={(action) => {
          if (action !== "confirmed") return;
          setDesignOpen(false);
          setActiveCaseId("");
          setFiles([]);
          onProductionOrdered?.();
        }}
      />
    </div>
  );
}
