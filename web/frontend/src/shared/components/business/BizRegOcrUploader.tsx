import { useRef, useState, useCallback } from "react";
import { Upload, X, ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";

export type BizRegExtracted = {
  businessNumber: string;
  companyName: string;
  representativeName: string;
  address: string;
  bizType: string;
  bizClass: string;
  email: string;
  phoneNumber: string;
};

export type BizVerifyResult = {
  verified: boolean;
  message: string;
};

type Props = {
  token?: string;
  onExtracted: (data: BizRegExtracted, verify: BizVerifyResult | null) => void;
};

type UploadStatus =
  | "idle"
  | "uploading"
  | "ocr"
  | "validating"
  | "done"
  | "error";

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: "사업자등록증 업로드",
  uploading: "업로드 중...",
  ocr: "AI 인식 중...",
  validating: "사업자 검증 중...",
  done: "사업자등록증 업로드",
  error: "다시 업로드",
};

export function BizRegOcrUploader({ token, onExtracted }: Props) {
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const inputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState("");
  const [verifyResult, setVerifyResult] = useState<BizVerifyResult | null>(
    null,
  );

  const isProcessing = ["uploading", "ocr", "validating"].includes(status);

  const reset = () => {
    setStatus("idle");
    setFileName("");
    setVerifyResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = useCallback(
    async (file: File) => {
      if (!["image/jpeg", "image/png"].includes(file.type)) {
        toast({
          title: "JPG 또는 PNG 파일만 지원합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "10MB 이하 파일만 업로드 가능합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      try {
        setStatus("uploading");
        setFileName(file.name);
        setVerifyResult(null);

        const uploaded = await uploadFilesWithToast([file]);
        const first = uploaded?.[0];
        if (!first?._id) {
          setStatus("error");
          return;
        }

        setStatus("ocr");
        const ocrRes = await request<any>({
          path: "/api/ai/parse-business-license",
          method: "POST",
          token,
          jsonBody: {
            fileId: first._id,
            s3Key: first.key,
            originalName: first.originalName,
          },
        });

        if (!ocrRes.ok) {
          setStatus("error");
          toast({
            title: "OCR 인식 실패",
            description:
              String((ocrRes.data as any)?.message || "").trim() ||
              "이미지를 다시 업로드해주세요.",
            variant: "destructive",
            duration: 4000,
          });
          return;
        }

        const body: any = ocrRes.data || {};
        const data = body.data || body;
        const extracted = data?.extracted || {};

        const rawBizNo = String(extracted?.businessNumber || "")
          .replace(/-/g, "")
          .trim();
        const companyName = String(extracted?.companyName || "").trim();
        const representativeName = String(
          extracted?.representativeName || "",
        ).trim();
        const formatted =
          rawBizNo.length === 10
            ? `${rawBizNo.slice(0, 3)}-${rawBizNo.slice(3, 5)}-${rawBizNo.slice(5)}`
            : rawBizNo;

        let verifyRes: BizVerifyResult | null = null;
        if (rawBizNo) {
          setStatus("validating");
          try {
            const vRes = await request<any>({
              path: "/api/admin/tax-invoices/validate-biz-number",
              method: "POST",
              token,
              jsonBody: { bizNo: rawBizNo, companyName, representativeName },
            });
            if (vRes.ok) {
              verifyRes = {
                verified: !!(vRes.data as any)?.verified,
                message: String((vRes.data as any)?.message || ""),
              };
            }
          } catch {
            // 검증 실패는 non-blocking
          }
        }

        setVerifyResult(verifyRes);
        setStatus("done");

        onExtracted(
          {
            businessNumber: formatted,
            companyName,
            representativeName,
            address: String(extracted?.address || "").trim(),
            bizType: String(extracted?.businessType || "").trim(),
            bizClass: String(extracted?.businessItem || "").trim(),
            email: String(extracted?.email || "").trim(),
            phoneNumber: String(extracted?.phoneNumber || "").trim(),
          },
          verifyRes,
        );

        if (verifyRes && !verifyRes.verified) {
          toast({
            title: "사업자 상태 확인 필요",
            description: verifyRes.message || "사업자 상태를 확인해주세요.",
            variant: "destructive",
            duration: 5000,
          });
        } else {
          toast({
            title: "사업자등록증 인식 완료",
            description: companyName
              ? `${companyName} · ${verifyRes?.verified ? "정상 사업자 확인" : "상태 미확인"}`
              : "인식 완료. 정보를 확인해주세요.",
            duration: 3000,
          });
        }
      } catch {
        setStatus("error");
        toast({
          title: "처리 실패",
          description: "다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [token, onExtracted, toast, uploadFilesWithToast],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={status === "done" ? "outline" : "default"}
          disabled={isProcessing}
          onClick={() => inputRef.current?.click()}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {STATUS_LABEL[status]}
        </Button>

        {status === "done" && verifyResult !== null && (
          <Badge
            variant={verifyResult.verified ? "outline" : "destructive"}
            className="flex items-center gap-1 text-xs"
          >
            {verifyResult.verified ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <ShieldX className="h-3 w-3" />
            )}
            {verifyResult.verified ? "정상 사업자" : "검증 실패"}
          </Badge>
        )}

        {fileName && !isProcessing && (
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground"
            aria-label="초기화"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {fileName && !isProcessing && (
        <p className="text-xs text-muted-foreground truncate max-w-xs">
          {fileName}
        </p>
      )}

      {status === "done" && verifyResult?.message && (
        <p
          className={`text-xs ${verifyResult.verified ? "text-green-600" : "text-destructive"}`}
        >
          {verifyResult.message}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-slate-400">JPG, PNG · 최대 10MB</p>
    </div>
  );
}
