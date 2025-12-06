import { useToast } from "@/hooks/use-toast";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { type ClinicPreset } from "./newRequestTypes";

const NEW_REQUEST_DRAFT_STORAGE_KEY = "abutsfit:new-request-draft:v1";

type AiFileInfo = {
  filename: string;
  clinicName?: string;
  patientName: string;
  teethText: string;
  workType: string;
  rawSummary: string;
  brand?: string;
  systemSpec?: string;
  abutType?: string;
};

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
      toast({
        title: "로그인이 필요합니다",
        description: "의뢰를 등록하려면 먼저 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (existingRequestId) {
      try {
        const payload: any = {
          description: message,
        };

        if (implantManufacturer)
          payload.implantManufacturer = implantManufacturer;
        if (implantSystem) payload.implantSystem = implantSystem;
        if (implantType) payload.implantType = implantType;

        const res = await fetch(`/api/requests/${existingRequestId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "x-mock-role": "requestor",
          },
          body: JSON.stringify(payload),
        });

        const body = await res.json().catch(() => ({}));

        if (!res.ok || !body?.success) {
          toast({
            title: "의뢰 수정에 실패했습니다",
            description: body?.message || "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "의뢰가 수정되었습니다",
        });

        navigate("/dashboard");
      } catch (err: any) {
        toast({
          title: "의뢰 수정 중 오류가 발생했습니다",
          description: err?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }

      return;
    }

    if (!uploadedFiles.length || !aiFileInfos.length) {
      toast({
        title: "파일을 업로드해주세요",
        description:
          "최소 1개 이상의 STL 파일을 업로드해야 의뢰를 등록할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    const activeInfos = aiFileInfos.filter((info) =>
      files.some((f) => f.name === info.filename)
    );

    if (!activeInfos.length) {
      toast({
        title: "커스텀 어벗 STL이 필요합니다",
        description:
          "현재 시스템은 커스텀 어벗 STL이 포함된 의뢰만 접수합니다. 최소 1개 이상의 커스텀 어벗 STL 파일을 함께 업로드해주세요.",
        variant: "destructive",
      });
      return;
    }

    const hasAbutment = activeInfos.some(
      (info) => info.workType === "abutment"
    );
    const hasCrown = activeInfos.some((info) => info.workType === "prosthesis");

    if (!hasAbutment && hasCrown) {
      toast({
        title: "커스텀 어벗 STL이 필요합니다",
        description:
          "현재 시스템은 커스텀 어벗 의뢰만 접수합니다. 크라운 STL만 업로드된 경우 어벗 STL을 함께 올려주세요.",
        variant: "destructive",
      });
      return;
    }

    const hasMissingPatient = activeInfos.some(
      (info) => !info.patientName || !info.patientName.trim()
    );
    const hasMissingTeeth = activeInfos.some(
      (info) => !info.teethText || !info.teethText.trim()
    );

    if (hasMissingPatient || hasMissingTeeth) {
      toast({
        title: "환자 정보가 누락되었습니다",
        description:
          "모든 파일에 대해 환자 이름과 치아번호를 입력해야 합니다. 각 파일 카드 우측의 입력란을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (
      hasAbutment &&
      (!implantManufacturer ||
        !implantSystem ||
        !implantType ||
        !selectedConnectionId)
    ) {
      toast({
        title: "임플란트 정보를 모두 선택해주세요",
        description:
          "어벗 의뢰에는 제조사, 시스템, 유형, 커넥션 정보를 모두 선택해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    const selectedClinic =
      selectedClinicId && clinicPresets.length
        ? clinicPresets.find((c) => c.id === selectedClinicId) || null
        : null;
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
      const duplicateChecks: Promise<boolean>[] = [];
      const seenKeys = new Set<string>();

      if (clinicName) {
        activeInfos.forEach((info) => {
          if (info.workType !== "abutment") return;
          const pName = (info.patientName || "").trim();
          const tooth = (info.teethText || "").trim();
          if (!pName || !tooth) return;
          const key = `${pName}__${tooth}`;
          if (seenKeys.has(key)) return;
          seenKeys.add(key);

          const params = new URLSearchParams();
          params.set("patientName", pName);
          params.set("tooth", tooth);
          params.set("clinicName", clinicName);

          const p = fetch(
            `/api/requests/my/has-duplicate?${params.toString()}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "x-mock-role": "requestor",
              },
            }
          )
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => Boolean(body?.data?.hasDuplicate))
            .catch(() => false);

          duplicateChecks.push(p);
        });
      }

      if (duplicateChecks.length > 0) {
        const results = await Promise.all(duplicateChecks);
        const hasAnyDuplicate = results.some((v) => v);
        if (hasAnyDuplicate) {
          const confirmed = window.confirm(
            "동일 치과/환자/치아의 기존 커스텀 어벗 의뢰가 있습니다. 재의뢰로 접수하시겠습니까?"
          );
          if (!confirmed) {
            return;
          }
        }
      }
    } catch {
      console.warn(
        "중복 의뢰 확인 중 오류가 발생했지만, 의뢰는 계속 진행합니다."
      );
    }

    patientGroups.forEach((_infos, _pName) => {
      // 현재는 중복 체크 이후 추가 처리를 하지 않습니다.
    });
  };

  return { handleSubmit, handleCancel };
};
