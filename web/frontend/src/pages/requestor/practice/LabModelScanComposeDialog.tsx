// related files:
// - web/frontend/src/shared/practice/labModelScanApi.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - docs/intent/lab-oral-scan-opens-practice-transfer.md
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import {
  createLabModelScanTransfer,
  fetchLabClientLabels,
} from "@/shared/practice/labModelScanApi";
import {
  ABUTMENT_PRODUCT_MODE,
} from "@/shared/practice/transferMemo";
import { toKstYmd } from "@/shared/date/kst";
import { cn } from "@/shared/ui/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledFiles?: File[];
  onCreated?: (payload: { transferId: string; mongoId: string }) => void;
};

const TOOTH_OPTIONS = [
  11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34,
  35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
];

function addBusinessDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

export function LabModelScanComposeDialog({
  open,
  onOpenChange,
  prefilledFiles = [],
  onCreated,
}: Props) {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token });
  const today = toKstYmd(new Date()) || "";
  const defaultArrival = today ? addBusinessDaysYmd(today, 3) : "";

  const [clinicLabel, setClinicLabel] = useState("");
  const [patientName, setPatientName] = useState("");
  const [arrivalYmd, setArrivalYmd] = useState(defaultArrival);
  const [teeth, setTeeth] = useState<number[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [labelSuggestions, setLabelSuggestions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [labelQueryTick, setLabelQueryTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setClinicLabel("");
    setPatientName("");
    setArrivalYmd(defaultArrival);
    setTeeth([]);
    setFiles(prefilledFiles.length ? [...prefilledFiles] : []);
    setLabelQueryTick((n) => n + 1);
  }, [open, prefilledFiles, defaultArrival]);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchLabClientLabels(token, clinicLabel).then((labels) => {
        if (!cancelled) setLabelSuggestions(labels);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, token, clinicLabel, labelQueryTick]);

  const toggleTooth = useCallback((tooth: number) => {
    setTeeth((prev) =>
      prev.includes(tooth) ? prev.filter((t) => t !== tooth) : [...prev, tooth].sort(),
    );
  }, []);

  const onPickFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const file of Array.from(list)) {
        const key = `${file.name}:${file.size}`;
        if (next.some((f) => `${f.name}:${f.size}` === key)) continue;
        next.push(file);
      }
      return next;
    });
  }, []);

  const canSubmit = useMemo(
    () =>
      Boolean(
        clinicLabel.trim() &&
          patientName.trim() &&
          arrivalYmd &&
          teeth.length > 0 &&
          files.length > 0 &&
          !submitting,
      ),
    [arrivalYmd, clinicLabel, files.length, patientName, submitting, teeth.length],
  );

  const handleSubmit = async () => {
    if (!token || !canSubmit) return;
    setSubmitting(true);
    try {
      const uploaded = await uploadFiles(files);
      const fileRows = uploaded
        .map((row, index) => {
          const key = String(row?.key || "").trim();
          if (!key) return null;
          return {
            patientName: patientName.trim(),
            originalName: row.originalName || files[index]?.name || "scan",
            mimetype: row.mimetype || "application/octet-stream",
            size: row.size || files[index]?.size || 0,
            s3Key: key,
          };
        })
        .filter(Boolean) as Array<{
        patientName: string;
        originalName: string;
        mimetype: string;
        size: number;
        s3Key: string;
      }>;
      if (!fileRows.length) {
        toast({
          title: "업로드 실패",
          description: "스캔 파일 업로드를 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }

      const toothWorks = teeth.map((tooth) => ({
        teeth: [tooth],
        prosthesisType: "커스텀어벗",
        customAbutment: true,
        customAbutmentSelection: "scanbody",
        abutmentProductMode: ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
      }));

      const created = await createLabModelScanTransfer(token, {
        clinicLabel: clinicLabel.trim(),
        patientName: patientName.trim(),
        arrivalYmd,
        orderYmd: today || undefined,
        toothWorks,
        files: fileRows,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto px-4 py-4 sm:px-6">
        <DialogHeader>
          <DialogTitle>모델스캔으로 의뢰하기</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="lab-model-scan-clinic">치과명</Label>
            <Input
              id="lab-model-scan-clinic"
              value={clinicLabel}
              onChange={(e) => setClinicLabel(e.target.value)}
              placeholder="등록·가명 모두 가능"
              list="lab-model-scan-clinic-list"
              autoComplete="off"
            />
            <datalist id="lab-model-scan-clinic-list">
              {labelSuggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              플랫폼 미등록 치과도 입력할 수 있습니다.
              <br />
              거래처 노출을 피하려면 가명을 쓰세요.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lab-model-scan-patient">환자명</Label>
            <Input
              id="lab-model-scan-patient"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="환자명"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lab-model-scan-arrival">치과도착일</Label>
            <Input
              id="lab-model-scan-arrival"
              type="date"
              value={arrivalYmd}
              min={today || undefined}
              onChange={(e) => setArrivalYmd(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>커스텀어벗 치식</Label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
              {TOOTH_OPTIONS.map((tooth) => {
                const on = teeth.includes(tooth);
                return (
                  <button
                    key={tooth}
                    type="button"
                    className={cn(
                      "h-8 min-w-8 rounded-md px-1.5 text-xs tabular-nums",
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-foreground hover:bg-muted",
                    )}
                    onClick={() => toggleTooth(tooth)}
                  >
                    {tooth}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>모델스캔 파일</Label>
            <Input
              type="file"
              multiple
              accept=".stl,.ply,.obj,.dcm,.3ox,.3oxz,.dentalProject,.zip,image/*"
              onChange={(e) => onPickFiles(e.target.files)}
            />
            {files.length > 0 ? (
              <ul className="max-h-28 space-y-1 overflow-y-auto px-1 py-1 text-xs text-muted-foreground">
                {files.map((file) => (
                  <li key={`${file.name}:${file.size}`}>
                    {file.name} · {(file.size / (1024 * 1024)).toFixed(1)}MB
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting ? "등록 중…" : "의뢰 등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
