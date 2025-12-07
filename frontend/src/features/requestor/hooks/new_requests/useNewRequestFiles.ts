import React, { useCallback, useEffect, useState, useRef } from "react";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { useToast } from "@/hooks/use-toast";
import { type AiFileInfo, type DraftFileMeta } from "./newRequestTypes";
import { getCachedUrl, setCachedUrl, removeCachedUrl } from "@/utils/fileCache";

type UseNewRequestFilesParams = {
  draftId?: string; // hydrate 전에는 undefined 일 수 있음
  token: string | null;
  implantManufacturer: string;
  implantSystem: string;
  implantType: string;
  setImplantManufacturer: (v: string) => void;
  setImplantSystem: (v: string) => void;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (m: string, s: string, t: string) => void;
  draftFiles: DraftFileMeta[]; // Draft 파일 메타 배열
  setDraftFiles: React.Dispatch<React.SetStateAction<DraftFileMeta[]>>;
  uploadedFiles: TempUploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<TempUploadedFile[]>>;
  aiFileInfos: AiFileInfo[];
  setAiFileInfos: React.Dispatch<React.SetStateAction<AiFileInfo[]>>;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  selectedPreviewIndex: number | null;
  setSelectedPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
};

// Attach Draft file ID to File objects for reliable deletion
type FileWithDraftId = File & { _draftFileId?: string };

// Normalize Unicode to avoid NFC/NFD mismatches across platforms (e.g., macOS)
const normalize = (s: string) =>
  typeof s === "string" ? s.normalize("NFC") : s;

export const useNewRequestFiles = ({
  draftId,
  token,
  implantManufacturer,
  implantSystem,
  implantType,
  setImplantManufacturer,
  setImplantSystem,
  setImplantType,
  syncSelectedConnection,
  draftFiles,
  setDraftFiles,
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

  // 최신 상태 추적을 위한 Refs
  const filesRef = useRef(files);
  const draftFilesRef = useRef(draftFiles);
  const uploadedFilesRef = useRef(uploadedFiles);
  const aiFileInfosRef = useRef(aiFileInfos);
  const selectedPreviewIndexRef = useRef(selectedPreviewIndex);
  // Track files removed while uploads are in-flight to avoid re-adding them
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    draftFilesRef.current = draftFiles;
  }, [draftFiles]);
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);
  useEffect(() => {
    aiFileInfosRef.current = aiFileInfos;
  }, [aiFileInfos]);
  useEffect(() => {
    selectedPreviewIndexRef.current = selectedPreviewIndex;
  }, [selectedPreviewIndex]);

  // 파일이 존재하지만 임플란트 정보가 비어 있을 때는
  // 항상 OSSTEM / Regular / Hex 기본 프리셋을 강제로 세팅해 둔다.
  // (AI 500, 프리셋 API 실패 등 모든 경우에 안전하게 동작하도록 하는 가드)
  useEffect(() => {
    if (!files.length) return;
    if (implantManufacturer || implantSystem || implantType) return;

    const baseManufacturer = "OSSTEM";
    const baseSystem = "Regular";
    const baseType = "Hex";

    setImplantManufacturer(baseManufacturer);
    setImplantSystem(baseSystem);
    setImplantType(baseType);
    syncSelectedConnection(baseManufacturer, baseSystem, baseType);
  }, [
    files.length,
    implantManufacturer,
    implantSystem,
    implantType,
    setImplantManufacturer,
    setImplantSystem,
    setImplantType,
    syncSelectedConnection,
  ]);

  // localStorage 동기화는 더 이상 사용하지 않음 (Draft API가 단일 소스)

  // localStorage 복원 로직 제거 - Draft API에서 이미 복원됨

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!uploadedFiles.length) return;
    if (files.length) return;
    if (!token) return;

    let cancelled = false;

    const restoreFilesFromUploaded = async () => {
      try {
        const restored: File[] = [];
        const restoredUploaded: typeof uploadedFiles = [];

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
            const file: FileWithDraftId = new File([blob], item.originalName, {
              type: item.mimetype || "application/octet-stream",
              lastModified: Date.now(),
            });
            // link restored File to its uploaded record id for reliable deletion
            (file as FileWithDraftId)._draftFileId = item._id;
            restored.push(file);
            restoredUploaded.push(item);
          } catch {}
        }

        if (!cancelled) {
          if (restored.length) {
            setFiles(restored);
          }
          // 복원된 파일들로 uploadedFiles 재설정 (유효하지 않은 항목 제거 효과)
          if (restoredUploaded.length) {
            setUploadedFiles(restoredUploaded);
          }
        }
      } catch {}
    };

    restoreFilesFromUploaded();

    return () => {
      cancelled = true;
    };
  }, [uploadedFiles, files.length, token]);

  // files를 uploadedFiles로부터 재구성하는 헬퍼
  const refreshFromUploaded = useCallback(
    async (source?: TempUploadedFile[]) => {
      if (typeof window === "undefined") return;
      if (!token) return;
      const list = (source ?? uploadedFilesRef.current) || [];
      if (!list.length) {
        setFiles([]);
        setSelectedPreviewIndex(null);
        return;
      }

      try {
        const results = await Promise.all(
          list.map(async (item) => {
            if (!item?._id) return null;
            try {
              const urlRes = await fetch(
                `/api/files/${item._id}/download-url`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              if (!urlRes.ok) return null;
              const urlBody = await urlRes.json().catch(() => ({} as any));
              const signedUrl: string | undefined = urlBody?.data?.url;
              if (!signedUrl) return null;
              const fileRes = await fetch(signedUrl);
              if (!fileRes.ok) return null;
              const blob = await fileRes.blob();
              const f: FileWithDraftId = new File([blob], item.originalName, {
                type: item.mimetype || "application/octet-stream",
                lastModified: Date.now(),
              });
              (f as FileWithDraftId)._draftFileId = item._id;
              return { file: f, item } as const;
            } catch {
              return null;
            }
          })
        );

        const ok = results.filter(Boolean) as {
          file: File;
          item: TempUploadedFile;
        }[];
        const rebuiltFiles = ok.map((r) => r.file);
        const validUploaded = ok.map((r) => r.item);
        setFiles(rebuiltFiles);
        if (validUploaded.length !== list.length) {
          setUploadedFiles(validUploaded);
        }

        if (rebuiltFiles.length === 0) {
          setSelectedPreviewIndex(null);
        } else if (
          selectedPreviewIndexRef.current == null ||
          selectedPreviewIndexRef.current >= rebuiltFiles.length
        ) {
          setSelectedPreviewIndex(0);
        }
      } finally {
      }
    },
    [token, setFiles, setUploadedFiles, setSelectedPreviewIndex]
  );
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

          // 파일 크기 기반 workType 결정: 1MB 미만이면 abutment, 이상이면 crown
          const fileSizeInMB = fileObj ? fileObj.size / (1024 * 1024) : 0;
          const defaultWorkType = fileSizeInMB < 1 ? "abutment" : "crown";
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
              const suggested = file.size < 1024 * 1024 ? "abutment" : "crown";
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
          // 삭제 예약 상태와 관계없이, 업로드 성공한 파일은 모두 활성으로 취급
          const uploadedActive = uploaded;
          const uniqueActive = unique;

          if (uploadedActive.length > 0) {
            // 백엔드 DraftRequest에도 업로드된 파일 메타를 등록
            if (draftId && token) {
              try {
                await Promise.all(
                  uploadedActive.map((u) =>
                    fetch(`/api/request-drafts/${draftId}/files`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                        "x-mock-role": "requestor",
                      },
                      body: JSON.stringify({
                        originalName: u.originalName,
                        size: u.size,
                        mimetype: u.mimetype,
                        fileId: u._id,
                      }),
                    }).catch(() => undefined)
                  )
                );
              } catch {
                // Draft 동기화 실패는 치명적이지 않으므로 조용히 무시 (다음 업로드 시 다시 시도 가능)
              }
            }

            const nextUploadedFiles = (() => {
              const map = new Map(
                uploadedFilesRef.current.map((f) => [
                  `${f.originalName}__${f.size}`,
                  f,
                ])
              );
              uploadedActive.forEach((f) => {
                map.set(`${f.originalName}__${f.size}`, f);
              });
              return Array.from(map.values());
            })();

            setUploadedFiles(nextUploadedFiles);

            setFiles((prev) => {
              const byKey = new Map(
                uploadedActive.map((u) => [
                  `${normalize(u.originalName)}__${u.size}`,
                  u,
                ])
              );
              return prev.map((f) => {
                const key = `${normalize(f.name)}__${f.size}`;
                const hit = byKey.get(key);
                if (hit) {
                  (f as FileWithDraftId)._draftFileId = hit._id;
                }
                return f;
              });
            });

            const nextAiFileInfos = (() => {
              const prev = aiFileInfosRef.current;
              const newInfos: AiFileInfo[] = uniqueActive.map((file) => {
                const found = analyzedInfos?.find(
                  (i) => i.filename === file.name
                );
                if (found) return found;
                return {
                  filename: file.name,
                  clinicName: "",
                  patientName: "",
                  tooth: "",
                  workType: file.size < 1024 * 1024 ? "abutment" : "crown",
                  abutType: "",
                };
              });
              const map = new Map(prev.map((i) => [i.filename, i]));
              newInfos.forEach((i) => map.set(i.filename, i));
              return Array.from(map.values());
            })();

            // Draft 동기화는 백엔드 API로 처리됨

            await refreshFromUploaded(nextUploadedFiles);

            const isAbutment = unique[0].size < 1024 * 1024;

            if (
              isAbutment &&
              !implantManufacturer &&
              !implantSystem &&
              !implantType &&
              analyzedInfos?.length > 0
            ) {
              const firstInfo = analyzedInfos[0];
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

            // AI/프리셋이 실패한 경우에도 기본 프리셋은 항상 OSSTEM / Regular / Hex 로 유지
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
          const uploadedActive = uploaded;
          const uniqueActive = unique;

          if (uploadedActive.length > 0) {
            // 백엔드 DraftRequest에도 업로드된 파일 메타를 등록 (파일 선택 경로)
            if (draftId && token) {
              try {
                await Promise.all(
                  uploadedActive.map((u) =>
                    fetch(`/api/request-drafts/${draftId}/files`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                        "x-mock-role": "requestor",
                      },
                      body: JSON.stringify({
                        originalName: u.originalName,
                        size: u.size,
                        mimetype: u.mimetype,
                        fileId: u._id,
                      }),
                    })
                  )
                );
              } catch {
                // Draft 동기화 실패는 치명적이지 않으므로 조용히 무시 (다음 업로드 시 다시 시도 가능)
              }
            }

            const nextUploadedFiles = (() => {
              const map = new Map(
                uploadedFilesRef.current.map((f) => [
                  `${f.originalName}__${f.size}`,
                  f,
                ])
              );
              uploadedActive.forEach((f) => {
                map.set(`${f.originalName}__${f.size}`, f);
              });
              return Array.from(map.values());
            })();

            // 2. 상태 업데이트
            setUploadedFiles(nextUploadedFiles);

            // 2-1. 업로드된 항목들의 id를 File 객체에 주입
            setFiles((prev) => {
              const byKey = new Map(
                uploadedActive.map((u) => [
                  `${normalize(u.originalName)}__${u.size}`,
                  u,
                ])
              );
              return prev.map((f) => {
                const key = `${normalize(f.name)}__${f.size}`;
                const hit = byKey.get(key);
                if (hit) {
                  (f as FileWithDraftId)._draftFileId = hit._id;
                }
                return f;
              });
            });

            // 3. AI 정보 업데이트 계산
            const nextAiFileInfos = (() => {
              const prev = aiFileInfosRef.current;
              const newInfos: AiFileInfo[] = uniqueActive.map((file) => {
                const found = analyzedInfos?.find(
                  (i) => i.filename === file.name
                );
                if (found) return found;
                return {
                  filename: file.name,
                  clinicName: "",
                  patientName: "",
                  tooth: "",
                  workType: file.size < 1024 * 1024 ? "abutment" : "prosthesis",
                  abutType: "",
                };
              });
              const map = new Map(prev.map((i) => [i.filename, i]));
              newInfos.forEach((i) => map.set(i.filename, i));
              return Array.from(map.values());
            })();

            // Draft 동기화는 백엔드 API로 처리됨

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
      } finally {
        // 동일 파일을 다시 선택해도 onChange가 항상 발생하도록 input 값을 초기화
        e.target.value = "";
      }
    })();
  };

  const removeFile = useCallback(
    (index: number) => {
      const target = files[index] as FileWithDraftId | undefined;
      if (!target) return;

      const draftFileId = target._draftFileId;
      const normalizedName = normalize(target.name);
      const nameSizeKey = `${normalizedName}__${target.size}`;

      // 1. 새로운 상태 계산
      const newFiles = files.filter((_, i) => i !== index);
      let newUploadedFiles: TempUploadedFile[];
      if (draftFileId) {
        newUploadedFiles = uploadedFiles.filter((f) => f._id !== draftFileId);
      } else {
        newUploadedFiles = uploadedFiles.filter(
          (f) => `${normalize(f.originalName)}__${f.size}` !== nameSizeKey
        );
      }

      const newAiFileInfos = aiFileInfos.filter(
        (info) => normalize(info.filename) !== normalizedName
      );
      const newSelectedPreviewIndex =
        selectedPreviewIndex === index ? null : selectedPreviewIndex;

      // 최신 ref 값도 즉시 갱신해서 이후 업로드 로직에서 삭제된 항목을 참조하지 않도록 보장
      uploadedFilesRef.current = newUploadedFiles;
      aiFileInfosRef.current = newAiFileInfos;
      selectedPreviewIndexRef.current = newSelectedPreviewIndex;

      // 2. 상태 업데이트
      setFiles(newFiles);
      setUploadedFiles(newUploadedFiles);
      setAiFileInfos(newAiFileInfos);
      setSelectedPreviewIndex(newSelectedPreviewIndex);

      // Draft 동기화는 백엔드 API로 처리됨
    },
    [
      files,
      uploadedFiles,
      aiFileInfos,
      selectedPreviewIndex,
      setFiles,
      setUploadedFiles,
      setAiFileInfos,
      setSelectedPreviewIndex,
    ]
  );

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
    const n = normalize(filename);
    const info = aiFileInfos.find((i) => normalize(i.filename) === n);
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
