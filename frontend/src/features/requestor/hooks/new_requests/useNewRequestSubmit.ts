import { useToast } from "@/hooks/use-toast";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { type ClinicPreset } from "./newRequestTypes";
import { type AiFileInfo } from "./newRequestTypes";

const NEW_REQUEST_DRAFT_STORAGE_KEY = "abutsfit:new-request-draft:v1";

type UseNewRequestSubmitParams = {
  existingRequestId?: string;
  token: string | null;
  navigate: (path: string) => void;
  message: string;
  setMessage: (v: string) => void;
  files: File[];
  setFiles: (v: File[]) => void;
  uploadedFiles: TempUploadedFile[];
  setUploadedFiles: (v: TempUploadedFile[]) => void;
  aiFileInfos: AiFileInfo[];
  setAiFileInfos: (v: AiFileInfo[]) => void;
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantSystem: string;
  setImplantSystem: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  selectedConnectionId: string | null;
  setSelectedConnectionId: (v: string | null) => void;
  clinicPresets: ClinicPreset[];
  selectedClinicId: string | null;
  setSelectedPreviewIndex: (v: number | null) => void;
};

export const useNewRequestSubmit = ({
  existingRequestId,
  token,
  navigate,
  message,
  setMessage,
  files,
  setFiles,
  uploadedFiles,
  setUploadedFiles,
  aiFileInfos,
  setAiFileInfos,
  implantManufacturer,
  setImplantManufacturer,
  implantSystem,
  setImplantSystem,
  implantType,
  setImplantType,
  selectedConnectionId,
  setSelectedConnectionId,
  clinicPresets,
  selectedClinicId,
  setSelectedPreviewIndex,
}: UseNewRequestSubmitParams) => {
  const { toast } = useToast();

  const handleCancel = () => {
    setMessage("");
    setFiles([]);
    setAiFileInfos([]);
    setUploadedFiles([]);
    setSelectedPreviewIndex(null);
    setSelectedConnectionId(null);
    setImplantManufacturer("");
    setImplantSystem("");
    setImplantType("");

    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(NEW_REQUEST_DRAFT_STORAGE_KEY);
      }
    } catch {}
  };

  const handleSubmit = async () => {
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }

    // 의뢰 수정
    if (existingRequestId) {
      try {
        const payload = {
          description: message,
          caseInfos: {
            implantSystem: implantManufacturer,
            implantType: implantSystem,
            connectionType: implantType,
          },
        };

        const res = await fetch(`/api/requests/${existingRequestId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("서버 응답 오류");

        toast({ title: "의뢰가 수정되었습니다" });
        navigate("/dashboard");
      } catch (err: any) {
        toast({
          title: "의뢰 수정 중 오류",
          description: err?.message,
          variant: "destructive",
        });
      }
      return;
    }

    // 신규 의뢰
    if (!uploadedFiles.length || !aiFileInfos.length) {
      toast({ title: "파일을 업로드해주세요", variant: "destructive" });
      return;
    }

    const activeInfos = aiFileInfos.filter((info) =>
      files.some((f) => f.name === info.filename)
    );

    if (!activeInfos.length) {
      toast({ title: "파일 정보가 없습니다", variant: "destructive" });
      return;
    }

    const hasAbutment = activeInfos.some(
      (info) => info.workType === "abutment"
    );
    if (
      hasAbutment &&
      (!implantManufacturer ||
        !implantSystem ||
        !implantType ||
        !selectedConnectionId)
    ) {
      toast({
        title: "임플란트 정보를 모두 선택해주세요",
        variant: "destructive",
      });
      return;
    }

    const selectedClinic =
      clinicPresets.find((c) => c.id === selectedClinicId) || null;
    const clinicName = selectedClinic?.name || "";

    const patientGroups = new Map<string, typeof activeInfos>();
    activeInfos.forEach((info) => {
      const pName = (info.patientName || "미지정").trim();
      if (!patientGroups.has(pName)) {
        patientGroups.set(pName, []);
      }
      patientGroups.get(pName)!.push(info);
    });

    try {
      // 중복 의뢰 체크 (기존 로직 유지)
      // ...

      const requestsToCreate = Array.from(patientGroups.entries()).map(
        ([patientName, patientFiles]) => {
          const teeth = Array.from(
            new Set(patientFiles.map((f) => f.tooth).filter(Boolean))
          ).join(", ");

          return {
            description: message,
            files: uploadedFiles
              .filter((uf) =>
                patientFiles.some((pf) => pf.filename === uf.originalName)
              )
              .map((uf) => ({
                s3Key: uf.key,
                fileName: uf.originalName,
                fileSize: uf.size,
                fileType: uf.mimetype,
              })),
            caseInfos: {
              clinicName,
              patientName,
              tooth: teeth,
              implantSystem: implantManufacturer,
              implantType: implantSystem,
              connectionType: implantType,
            },
          };
        }
      );

      const res = await fetch("/api/requests/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requests: requestsToCreate }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody?.message || "서버에서 의뢰 생성에 실패했습니다."
        );
      }

      toast({
        title: `총 ${requestsToCreate.length}건의 의뢰가 성공적으로 접수되었습니다.`,
      });
      handleCancel(); // 폼 초기화
      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "의뢰 생성 중 오류가 발생했습니다",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  return { handleSubmit, handleCancel };
};
