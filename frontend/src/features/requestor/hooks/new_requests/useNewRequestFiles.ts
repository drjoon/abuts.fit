import React, { useCallback, useEffect, useState } from "react";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { useToast } from "@/hooks/use-toast";
import { type AiFileInfo } from "./newRequestTypes";

type UseNewRequestFilesParams = {
  token: string | null;
  implantManufacturer: string;
  implantSystem: string;
  implantType: string;
  setImplantManufacturer: (v: string) => void;
  setImplantSystem: (v: string) => void;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (m: string, s: string, t: string) => void;
  uploadedFiles: TempUploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<TempUploadedFile[]>>;
  aiFileInfos: AiFileInfo[];
  setAiFileInfos: React.Dispatch<React.SetStateAction<AiFileInfo[]>>;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
};

export const useNewRequestFiles = ({
  token,
  implantManufacturer,
  implantSystem,
  implantType,
  setImplantManufacturer,
  setImplantSystem,
  setImplantType,
  syncSelectedConnection,
  uploadedFiles,
  setUploadedFiles,
  aiFileInfos,
  setAiFileInfos,
  files,
  setFiles,
  selectedPreviewIndex,
  setSelectedPreviewIndex,
}: UseNewRequestFilesParams) => {
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const [abutDiameters, setAbutDiameters] = useState<Record<string, number>>(
    {}
  );
  const [connectionDiameters, setConnectionDiameters] = useState<
    Record<string, number>
  >({});
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!uploadedFiles.length) return;
    if (files.length) return;
    if (!token) return;

    let cancelled = false;

    const restoreFilesFromUploaded = async () => {
      try {
        const restored: File[] = [];

        for (const item of uploadedFiles) {
          if (!item._id) continue;

          try {
            const urlRes = await fetch(`/api/files/${item._id}/download-url`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!urlRes.ok) continue;
            const urlBody = await urlRes.json().catch(() => ({} as any));
            const signedUrl: string | undefined = urlBody?.data?.url;
            if (!signedUrl) continue;

            const fileRes = await fetch(signedUrl);
            if (!fileRes.ok) continue;

            const blob = await fileRes.blob();
            const file = new File([blob], item.originalName, {
              type: item.mimetype || "application/octet-stream",
              lastModified: Date.now(),
            });
            restored.push(file);
          } catch {}
        }

        if (!cancelled && restored.length) {
          setFiles(restored);
        }
      } catch {}
    };

    restoreFilesFromUploaded();

    return () => {
      cancelled = true;
    };
  }, [uploadedFiles, files.length, token]);

  const analyzeFilenamesWithAi = useCallback(
    async (
      filenames: string[],
      fileObjects?: File[]
    ): Promise<AiFileInfo[]> => {
      if (!filenames || filenames.length === 0) return [];

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (!token) return [];

        headers.Authorization = `Bearer ${token}`;

        const res = await fetch("/api/ai/parse-filenames", {
          method: "POST",
          headers,
          body: JSON.stringify({ filenames }),
        });

        if (!res.ok) return [];

        const body = await res.json().catch(() => ({}));
        const items: any[] = Array.isArray(body?.data) ? body.data : [];
        const newInfos: AiFileInfo[] = [];

        const map = new Map<string, AiFileInfo>();

        items.forEach((item) => {
          const filename = item?.filename;
          if (!filename || typeof filename !== "string") return;

          const fileObj = fileObjects?.find((f) => f.name === filename);

          const clinicName: string =
            typeof item?.clinicName === "string" ? item.clinicName : "";

          const patientName: string =
            typeof item?.patientName === "string" ? item.patientName : "";

          // 파일 크기 기반 workType 결정: 1MB 미만이면 abutment, 이상이면 prosthesis
          const fileSizeInMB = fileObj ? fileObj.size / (1024 * 1024) : 0;
          const defaultWorkType = fileSizeInMB < 1 ? "abutment" : "prosthesis";
          const workType = defaultWorkType;

          const tooth =
            typeof item?.tooth === "string" ? item.tooth.trim() : "";

          const info: AiFileInfo = {
            filename,
            clinicName,
            patientName,
            tooth,
            workType,
            abutType: "",
          };

          map.set(filename, info);
          newInfos.push(info);
        });

        setAiFileInfos((prev: AiFileInfo[]) => {
          const prevMap = new Map(prev.map((info) => [info.filename, info]));
          map.forEach((info, filename) => {
            prevMap.set(filename, info);
          });
          return Array.from(prevMap.values());
        });

        return newInfos;
      } catch {
        return [];
      }
    },
    [token, setAiFileInfos]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileListWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    e.preventDefault();
    const deltaX = e.deltaX;
    const deltaY = e.deltaY;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      container.scrollLeft += deltaX;
    } else {
      container.scrollLeft += deltaY;
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const incoming = Array.from(e.dataTransfer.files);

      setFiles((prev) => {
        const existingKey = new Set(prev.map((f) => `${f.name}__${f.size}`));
        const unique = incoming.filter(
          (f) => !existingKey.has(`${f.name}__${f.size}`)
        );

        if (unique.length === 0) {
          toast({
            title: "중복 파일은 제외되었습니다",
            description: "이미 추가된 파일은 다시 업로드되지 않습니다.",
          });
          return prev;
        }

        setSelectedPreviewIndex((prevIndex) => {
          if (prevIndex !== null) return prevIndex;
          return prev.length;
        });

        return [...prev, ...unique];
      });

      try {
        const unique = incoming.filter(
          (f) => !files.find((p) => p.name === f.name && p.size === f.size)
        );

        if (unique.length > 0) {
          setAiFileInfos((prevInfos: AiFileInfo[]) => {
            const next = [...prevInfos];
            unique.forEach((file) => {
              const filename = file.name;
              const idx = next.findIndex((i) => i.filename === filename);
              const suggested =
                file.size < 1024 * 1024 ? "abutment" : "prosthesis";
              if (idx >= 0) {
                if (!next[idx].workType) {
                  next[idx] = { ...next[idx], workType: suggested };
                }
              } else {
                next.push({
                  filename,
                  clinicName: "",
                  patientName: "",
                  tooth: "",
                  workType: suggested,
                  abutType: "",
                });
              }
            });
            return next;
          });

          const filenames = unique.map((file) => file.name);
          const analyzedInfos = await analyzeFilenamesWithAi(filenames, unique);

          const uploaded = await uploadFilesWithToast(unique);
          if (uploaded.length > 0) {
            setUploadedFiles((prev: TempUploadedFile[]) => {
              const map = new Map(
                prev.map((f) => [`${f.originalName}__${f.size}`, f])
              );
              uploaded.forEach((f) => {
                map.set(`${f.originalName}__${f.size}`, f);
              });
              return Array.from(map.values());
            });

            // 어벗일 때만 프리셋에서 임플란트 정보 추천
            const isAbutment = unique[0].size < 1024 * 1024;

            if (
              isAbutment &&
              !implantManufacturer &&
              !implantSystem &&
              !implantType &&
              analyzedInfos?.length > 0
            ) {
              const firstInfo = analyzedInfos[0];
              // clinicName이 없으면 빈 문자열 사용
              const clinicName = firstInfo?.clinicName || "";
              if (firstInfo?.patientName && firstInfo?.tooth) {
                try {
                  const params = new URLSearchParams({
                    clinicName,
                    patientName: firstInfo.patientName,
                    tooth: firstInfo.tooth,
                  });
                  const presetRes = await fetch(
                    `/api/implant-presets/find?${params.toString()}`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                    }
                  );
                  if (presetRes.ok) {
                    const presetBody = await presetRes.json();
                    const preset = presetBody.data;
                    if (preset) {
                      setImplantManufacturer(preset.manufacturer);
                      setImplantSystem(preset.system);
                      setImplantType(preset.type);
                      syncSelectedConnection(
                        preset.manufacturer,
                        preset.system,
                        preset.type
                      );
                    }
                  }
                } catch (e) {
                  console.warn("Failed to fetch implant preset", e);
                }
              }
            }

            // 프리셋이 없으면 기본값 설정
            if (!implantManufacturer && !implantSystem && !implantType) {
              const baseManufacturer = "OSSTEM";
              const baseSystem = "Regular";
              const baseType = "Hex";
              setImplantManufacturer(baseManufacturer);
              setImplantSystem(baseSystem);
              setImplantType(baseType);
              syncSelectedConnection(baseManufacturer, baseSystem, baseType);
            }

            setSelectedPreviewIndex(0);

            toast({
              title: "파일 업로드 완료",
              description: `${unique.length}개 파일이 추가되었습니다.`,
            });
          }
        }
      } catch (err: any) {
        toast({
          title: "파일 업로드 중 오류가 발생했습니다",
          description: err?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [
      toast,
      analyzeFilenamesWithAi,
      uploadFilesWithToast,
      files,
      implantManufacturer,
      implantSystem,
      implantType,
      setImplantManufacturer,
      setImplantSystem,
      setImplantType,
      syncSelectedConnection,
      setAiFileInfos,
      setUploadedFiles,
    ]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const incoming = Array.from(e.target.files);

    setFiles((prev) => {
      const existingKey = new Set(prev.map((f) => `${f.name}__${f.size}`));
      const unique = incoming.filter(
        (f) => !existingKey.has(`${f.name}__${f.size}`)
      );

      if (unique.length === 0) {
        toast({
          title: "중복 파일은 제외되었습니다",
          description: "이미 추가된 파일은 다시 업로드되지 않습니다.",
        });
        return prev;
      }

      setSelectedPreviewIndex((prevIndex) => {
        if (prevIndex !== null) return prevIndex;
        return prev.length;
      });

      return [...prev, ...unique];
    });

    (async () => {
      try {
        const unique = incoming.filter(
          (f) => !files.find((p) => p.name === f.name && p.size === f.size)
        );

        if (unique.length > 0) {
          setAiFileInfos((prevInfos: AiFileInfo[]) => {
            const next = [...prevInfos];
            unique.forEach((file) => {
              const filename = file.name;
              const idx = next.findIndex((i) => i.filename === filename);
              const suggested =
                file.size < 1024 * 1024 ? "abutment" : "prosthesis";
              if (idx >= 0) {
                if (!next[idx].workType) {
                  next[idx] = { ...next[idx], workType: suggested };
                }
              } else {
                next.push({
                  filename,
                  clinicName: "",
                  patientName: "",
                  tooth: "",
                  workType: suggested,
                  abutType: "",
                });
              }
            });
            return next;
          });

          const filenames = unique.map((file) => file.name);
          const analyzedInfos = await analyzeFilenamesWithAi(filenames, unique);

          const uploaded = await uploadFilesWithToast(unique);
          if (uploaded.length > 0) {
            setUploadedFiles((prev: TempUploadedFile[]) => {
              const map = new Map(
                prev.map((f) => [`${f.originalName}__${f.size}`, f])
              );
              uploaded.forEach((f) => {
                map.set(`${f.originalName}__${f.size}`, f);
              });
              return Array.from(map.values());
            });

            // 어벗일 때만 프리셋에서 임플란트 정보 추천
            const isAbutment = unique[0].size < 1024 * 1024;

            if (
              isAbutment &&
              !implantManufacturer &&
              !implantSystem &&
              !implantType &&
              analyzedInfos?.length > 0
            ) {
              const firstInfo = analyzedInfos[0];
              // clinicName이 없으면 빈 문자열 사용
              const clinicName = firstInfo?.clinicName || "";
              if (firstInfo?.patientName && firstInfo?.tooth) {
                try {
                  const params = new URLSearchParams({
                    clinicName,
                    patientName: firstInfo.patientName,
                    tooth: firstInfo.tooth,
                  });
                  const presetRes = await fetch(
                    `/api/implant-presets/find?${params.toString()}`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                    }
                  );
                  if (presetRes.ok) {
                    const presetBody = await presetRes.json();
                    const preset = presetBody.data;
                    if (preset) {
                      setImplantManufacturer(preset.manufacturer);
                      setImplantSystem(preset.system);
                      setImplantType(preset.type);
                      syncSelectedConnection(
                        preset.manufacturer,
                        preset.system,
                        preset.type
                      );
                    }
                  }
                } catch (e) {
                  console.warn("Failed to fetch implant preset", e);
                }
              }
            }

            // 프리셋이 없으면 기본값 설정
            if (!implantManufacturer && !implantSystem && !implantType) {
              const baseManufacturer = "OSSTEM";
              const baseSystem = "Regular";
              const baseType = "Hex";
              setImplantManufacturer(baseManufacturer);
              setImplantSystem(baseSystem);
              setImplantType(baseType);
              syncSelectedConnection(baseManufacturer, baseSystem, baseType);
            }

            setSelectedPreviewIndex(0);

            toast({
              title: "파일 업로드 완료",
              description: `${unique.length}개 파일이 추가되었습니다.`,
            });
          }
        }
      } catch (err: any) {
        toast({
          title: "파일 업로드 중 오류가 발생했습니다",
          description: err?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    })();
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setSelectedPreviewIndex((prev) => (prev === index ? null : prev));
  };

  const handleDiameterComputed = useCallback(
    (filename: string, maxDiameter: number, connectionDiameter: number) => {
      setAbutDiameters((prev) => ({ ...prev, [filename]: maxDiameter }));
      setConnectionDiameters((prev) => ({
        ...prev,
        [filename]: connectionDiameter,
      }));
    },
    []
  );

  const getWorkTypeForFilename = (filename: string) => {
    const info = aiFileInfos.find((i) => i.filename === filename);
    return info?.workType || "";
  };

  return {
    abutDiameters,
    connectionDiameters,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleFileListWheel,
    removeFile,
    handleDiameterComputed,
    getWorkTypeForFilename,
    analyzeFilenamesWithAi,
  };
};
