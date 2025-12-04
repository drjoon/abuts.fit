import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { type TempUploadedFile } from "@/hooks/useS3TempUpload";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";

const NEW_REQUEST_DRAFT_STORAGE_KEY = "abutsfit:new-request-draft:v1";
const NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX =
  "abutsfit:new-request-clinics:v1:";

type ClinicFavoriteImplant = {
  manufacturer: string;
  system: string;
  type: string;
};

type ClinicPreset = {
  id: string;
  name: string;
  favorite?: ClinicFavoriteImplant;
};

export const useNewRequestPage = () => {
  const { user, token } = useAuthStore();
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const navigate = useNavigate();

  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<
    number | null
  >(null);
  const [abutDiameters, setAbutDiameters] = useState<Record<string, number>>(
    {}
  );
  const [connectionDiameters, setConnectionDiameters] = useState<
    Record<string, number>
  >({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [implantManufacturer, setImplantManufacturer] = useState("");
  const [implantSystem, setImplantSystem] = useState("");
  const [implantType, setImplantType] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [aiFileInfos, setAiFileInfos] = useState<
    {
      filename: string;
      clinicName?: string;
      patientName: string;
      teethText: string;
      workType: string;
      rawSummary: string;
      brand?: string;
      systemSpec?: string;
      abutType?: string;
    }[]
  >([]);
  const [uploadedFiles, setUploadedFiles] = useState<TempUploadedFile[]>([]);
  const [clinicPresets, setClinicPresets] = useState<ClinicPreset[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);

  const clinicStorageKey = useMemo(() => {
    const userId = user?.id ? String(user.id) : "guest";
    return `${NEW_REQUEST_CLINIC_STORAGE_KEY_PREFIX}${userId}`;
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(NEW_REQUEST_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);

      if (typeof saved.message === "string") {
        setMessage(saved.message);
      }
      if (Array.isArray(saved.aiFileInfos)) {
        setAiFileInfos(saved.aiFileInfos);
      }
      if (Array.isArray(saved.uploadedFiles)) {
        setUploadedFiles(saved.uploadedFiles);
      }
      if (typeof saved.implantManufacturer === "string") {
        setImplantManufacturer(saved.implantManufacturer);
      }
      if (typeof saved.implantSystem === "string") {
        setImplantSystem(saved.implantSystem);
      }
      if (typeof saved.implantType === "string") {
        setImplantType(saved.implantType);
      }
      if (
        typeof saved.selectedPreviewIndex === "number" ||
        saved.selectedPreviewIndex === null
      ) {
        setSelectedPreviewIndex(saved.selectedPreviewIndex);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!clinicStorageKey) return;

    try {
      const raw = window.localStorage.getItem(clinicStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);

      if (Array.isArray(saved?.clinicPresets)) {
        setClinicPresets(saved.clinicPresets);
      }
      if (
        typeof saved?.selectedClinicId === "string" ||
        saved?.selectedClinicId === null
      ) {
        setSelectedClinicId(saved.selectedClinicId);
      }
    } catch {}
  }, [clinicStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = {
      message,
      aiFileInfos,
      uploadedFiles,
      implantManufacturer,
      implantSystem,
      implantType,
      selectedPreviewIndex,
    };
    try {
      window.localStorage.setItem(
        NEW_REQUEST_DRAFT_STORAGE_KEY,
        JSON.stringify(draft)
      );
    } catch {}
  }, [
    message,
    aiFileInfos,
    uploadedFiles,
    implantManufacturer,
    implantSystem,
    implantType,
    selectedPreviewIndex,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!clinicStorageKey) return;

    const payload = {
      clinicPresets,
      selectedClinicId,
    };

    try {
      window.localStorage.setItem(clinicStorageKey, JSON.stringify(payload));
    } catch {}
  }, [clinicStorageKey, clinicPresets, selectedClinicId]);

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

  const patientCasesPreview = useMemo(() => {
    const caseMap = new Map<
      string,
      {
        patientName: string;
        teethSet: Set<string>;
        files: { filename: string; workType: string }[];
      }
    >();

    aiFileInfos.forEach((info) => {
      const key = (info.patientName || "미지정").trim();
      if (!caseMap.has(key)) {
        caseMap.set(key, {
          patientName: key === "미지정" ? "" : key,
          teethSet: new Set<string>(),
          files: [],
        });
      }

      const entry = caseMap.get(key)!;

      const teethTokens = info.teethText
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      teethTokens.forEach((t) => entry.teethSet.add(t));

      entry.files.push({
        filename: info.filename,
        workType: info.workType || "",
      });
    });

    return Array.from(caseMap.values()).map((entry) => ({
      patientName: entry.patientName,
      teeth: Array.from(entry.teethSet),
      files: entry.files,
    }));
  }, [aiFileInfos]);

  const appendAiSummary = useCallback((aiItems: any[]) => {
    if (!Array.isArray(aiItems) || aiItems.length === 0) return;

    const lines = aiItems.map((item) => {
      const filename = item?.filename ?? "";
      const patientName = item?.patientName || null;
      const teeth = Array.isArray(item?.teeth) ? item.teeth : [];
      const workType = item?.workType || null;

      const parts: string[] = [];

      if (patientName) {
        parts.push(`환자: ${patientName}`);
      }

      if (teeth.length > 0) {
        parts.push(`치식: ${teeth.join(", ")}`);
      }

      if (workType) {
        parts.push(`작업: ${workType}`);
      }

      const detail =
        parts.length > 0
          ? parts.join(" / ")
          : "세부 정보를 추출하지 못했습니다";

      return `[Gemini AI] 파일: ${filename}${detail ? ` / ${detail}` : ""}`;
    });

    const block = lines.join("\n");

    setMessage((prev) => {
      if (!prev.trim()) {
        return block;
      }
      return `${prev.trim()}\n\n${block}`;
    });
  }, []);

  const analyzeFilenamesWithAi = useCallback(
    async (filenames: string[]) => {
      if (!filenames || filenames.length === 0) return;

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (!token) return;

        headers.Authorization = `Bearer ${token}`;

        const res = await fetch("/api/ai/parse-filenames", {
          method: "POST",
          headers,
          body: JSON.stringify({ filenames }),
        });

        if (!res.ok) return;

        const body = await res.json().catch(() => ({}));
        const items: any[] = Array.isArray(body?.data) ? body.data : [];
        setAiFileInfos((prev) => {
          const map = new Map(prev.map((info) => [info.filename, info]));

          items.forEach((item) => {
            const filename = item?.filename;
            if (!filename || typeof filename !== "string") return;

            const teethArr: string[] = Array.isArray(item?.teeth)
              ? item.teeth.map((t: any) => String(t))
              : [];

            const existing = map.get(filename) || ({} as any);

            const clinicName =
              typeof item?.clinicName === "string"
                ? item.clinicName
                : existing.clinicName || "";

            const patientName =
              typeof item?.patientName === "string"
                ? item.patientName
                : existing.patientName || "";

            const aiWorkType =
              typeof item?.workType === "string" ? item.workType : "";
            const workType = aiWorkType || existing.workType || "";

            const rawSummary =
              typeof item?.rawSummary === "string"
                ? item.rawSummary
                : existing.rawSummary || "";

            let teethText = "";
            if (teethArr.length === 1) {
              teethText = teethArr[0];
            } else if (teethArr.length > 1) {
              teethText = `${teethArr[0]}-${teethArr[teethArr.length - 1]}`;
            }

            map.set(filename, {
              ...existing,
              filename,
              clinicName,
              patientName,
              teethText,
              workType,
              rawSummary,
            });
          });

          return Array.from(map.values());
        });
      } catch {}
    },
    [token]
  );

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const baseManufacturer = "OSSTEM";
        const baseSystem = "Regular";
        const baseType = "Hex";

        const connRes = await fetch("/api/connections");
        if (!connRes.ok) return;
        const connBody = await connRes.json().catch(() => ({}));
        const list: any[] = Array.isArray(connBody.data) ? connBody.data : [];
        setConnections(list);

        const hasDraftImplantValues = Boolean(
          implantManufacturer || implantSystem || implantType
        );

        let favorite: {
          implantManufacturer?: string;
          implantSystem?: string;
          implantType?: string;
        } | null = null;

        if (token) {
          const favRes = await fetch("/api/requests/my/favorite-implant", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (favRes.ok) {
            const favBody = await favRes.json().catch(() => ({}));
            if (favBody && favBody.data) {
              favorite = favBody.data;
            }
          }
        }

        if (hasDraftImplantValues) {
          if (list.length > 0) {
            const found = list.find(
              (c) =>
                c.manufacturer === implantManufacturer &&
                c.system === implantSystem &&
                c.type === implantType
            );
            setSelectedConnectionId(found ? (found._id as string) : null);
          }
          return;
        }

        const nextManufacturer =
          favorite?.implantManufacturer || baseManufacturer;
        const nextSystem = favorite?.implantSystem || baseSystem;
        const nextType = favorite?.implantType || baseType;

        setImplantManufacturer(nextManufacturer);
        setImplantSystem(nextSystem);
        setImplantType(nextType);

        if (list.length > 0) {
          const found = list.find(
            (c) =>
              c.manufacturer === nextManufacturer &&
              c.system === nextSystem &&
              c.type === nextType
          );

          if (found) {
            setSelectedConnectionId(found._id as string);
          } else {
            const first = list[0];
            setSelectedConnectionId(first._id as string);
          }
        }
      } catch {}
    };

    loadInitialData();
  }, [token, implantManufacturer, implantSystem, implantType]);

  useEffect(() => {
    if (!selectedClinicId) return;
    if (!implantManufacturer || !implantSystem || !implantType) return;

    setClinicPresets((prev) => {
      const idx = prev.findIndex((c) => c.id === selectedClinicId);
      if (idx === -1) return prev;

      const target = prev[idx];
      const prevFav = target.favorite;

      if (
        prevFav &&
        prevFav.manufacturer === implantManufacturer &&
        prevFav.system === implantSystem &&
        prevFav.type === implantType
      ) {
        return prev;
      }

      const next = [...prev];
      next[idx] = {
        ...target,
        favorite: {
          manufacturer: implantManufacturer,
          system: implantSystem,
          type: implantType,
        },
      };
      return next;
    });
  }, [selectedClinicId, implantManufacturer, implantSystem, implantType]);

  const syncSelectedConnection = (
    manufacturer: string,
    system: string,
    type: string
  ) => {
    const found = connections.find(
      (c) =>
        c.manufacturer === manufacturer &&
        c.system === system &&
        c.type === type
    );
    setSelectedConnectionId(found ? (found._id as string) : null);
  };

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
          const uploaded = await uploadFilesWithToast(unique);
          if (uploaded.length > 0) {
            setUploadedFiles((prev) => {
              const map = new Map(
                prev.map((f) => [`${f.originalName}__${f.size}`, f])
              );
              uploaded.forEach((f) => {
                map.set(`${f.originalName}__${f.size}`, f);
              });
              return Array.from(map.values());
            });

            setAiFileInfos((prevInfos) => {
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
                    patientName: "",
                    teethText: "",
                    workType: suggested,
                    rawSummary: "",
                  });
                }
              });
              return next;
            });

            const filenames = unique.map((file) => file.name);
            analyzeFilenamesWithAi(filenames);

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
          const uploaded = await uploadFilesWithToast(unique);
          if (uploaded.length > 0) {
            setUploadedFiles((prev) => {
              const map = new Map(
                prev.map((f) => [`${f.originalName}__${f.size}`, f])
              );
              uploaded.forEach((f) => {
                map.set(`${f.originalName}__${f.size}`, f);
              });
              return Array.from(map.values());
            });

            setAiFileInfos((prevInfos) => {
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
                    patientName: "",
                    teethText: "",
                    workType: suggested,
                    rawSummary: "",
                  });
                }
              });
              return next;
            });

            const filenames = unique.map((file) => file.name);
            analyzeFilenamesWithAi(filenames);

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

  const handleSubmit = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        description: "의뢰를 등록하려면 먼저 로그인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (
      !implantManufacturer ||
      !implantSystem ||
      !implantType ||
      !selectedConnectionId
    ) {
      toast({
        title: "임플란트 정보를 모두 선택해주세요",
        description: "제조사, 시스템, 유형을 모두 선택해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    const payload: any = {
      title: "커스텀 어벗먼트 의뢰",
      description: message,
      implantManufacturer,
      implantSystem,
      implantType,
      connection: selectedConnectionId,
    };

    // STL 분석에서 계산된 최대 직경 정보가 있다면 payload.maxDiameter로 전송
    const diameterValues = Object.values(abutDiameters || {});
    if (diameterValues.length > 0) {
      const maxDiameter = Math.max(...diameterValues);
      if (Number.isFinite(maxDiameter)) {
        payload.maxDiameter = maxDiameter;
      }
    }

    if (aiFileInfos.length > 0) {
      const caseMap = new Map<
        string,
        {
          patientName: string;
          teethSet: Set<string>;
          files: { filename: string; workType: string }[];
        }
      >();

      aiFileInfos.forEach((info) => {
        const key = (info.patientName || "미지정").trim();
        if (!caseMap.has(key)) {
          caseMap.set(key, {
            patientName: key === "미지정" ? "" : key,
            teethSet: new Set<string>(),
            files: [],
          });
        }

        const entry = caseMap.get(key)!;

        const teethTokens = info.teethText
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        teethTokens.forEach((t) => entry.teethSet.add(t));

        entry.files.push({
          filename: info.filename,
          workType: info.workType || "",
        });
      });

      payload.patientCases = Array.from(caseMap.values()).map((entry) => ({
        patientName: entry.patientName,
        teeth: Array.from(entry.teethSet),
        files: entry.files,
        note: "",
      }));
    }

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || body?.success === false) {
        toast({
          title: "의뢰 등록에 실패했습니다",
          description: body?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "의뢰가 성공적으로 등록되었습니다",
        description: "제조사들이 검토 후 연락드릴 예정입니다.",
      });

      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(NEW_REQUEST_DRAFT_STORAGE_KEY);
        }
      } catch {}

      setMessage("");
      setFiles([]);
      setSelectedConnectionId(null);
      setImplantManufacturer("");
      setImplantSystem("");
      setImplantType("");

      navigate("/dashboard");
    } catch (e: any) {
      toast({
        title: "의뢰 등록 중 오류가 발생했습니다",
        description: e?.message || "네트워크 상태를 확인해주세요.",
        variant: "destructive",
      });
    }
  };

  const manufacturerOptions = Array.from(
    new Set(connections.map((c) => c.manufacturer as string))
  );

  const systemOptions = connections
    .filter(
      (c) => !implantManufacturer || c.manufacturer === implantManufacturer
    )
    .map((c) => c.system as string)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  const typeOptions = connections
    .filter(
      (c) =>
        (!implantManufacturer || c.manufacturer === implantManufacturer) &&
        (!implantSystem || c.system === implantSystem)
    )
    .map((c) => c.type as string)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  const getWorkTypeForFilename = (filename: string) => {
    const info = aiFileInfos.find((i) => i.filename === filename);
    return info?.workType || "";
  };

  const handleSelectClinic = (id: string | null) => {
    setSelectedClinicId(id);

    if (!id) return;

    const clinic = clinicPresets.find((c) => c.id === id);
    const fav = clinic?.favorite;

    if (!fav) return;

    const { manufacturer, system, type } = fav;
    if (!manufacturer || !system || !type) return;

    setImplantManufacturer(manufacturer);
    setImplantSystem(system);
    setImplantType(type);
    syncSelectedConnection(manufacturer, system, type);
  };

  const handleAddOrSelectClinic = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setClinicPresets((prev) => {
      const existing = prev.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        setSelectedClinicId(existing.id);
        return prev;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const favoriteImplant: ClinicFavoriteImplant | undefined =
        implantManufacturer && implantSystem && implantType
          ? {
              manufacturer: implantManufacturer,
              system: implantSystem,
              type: implantType,
            }
          : undefined;

      const created: ClinicPreset = {
        id,
        name: trimmed,
        favorite: favoriteImplant,
      };

      setSelectedClinicId(id);
      return [...prev, created];
    });
  };

  const handleRenameClinic = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setClinicPresets((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = {
        ...next[idx],
        name: trimmed,
      };
      return next;
    });
  };

  const handleDeleteClinic = (id: string) => {
    setClinicPresets((prev) => prev.filter((c) => c.id !== id));
    setSelectedClinicId((current) => (current === id ? null : current));
  };

  return {
    user,
    message,
    setMessage,
    files,
    setFiles,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    abutDiameters,
    connectionDiameters,
    handleDiameterComputed,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleFileListWheel,
    manufacturerOptions,
    systemOptions,
    typeOptions,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantType,
    setImplantType,
    syncSelectedConnection,
    handleSubmit,
    handleCancel,
    removeFile,
    getWorkTypeForFilename,
    aiFileInfos,
    setAiFileInfos,
    selectedRequest,
    setSelectedRequest,
    patientCasesPreview,
    clinicPresets,
    selectedClinicId,
    handleSelectClinic,
    handleAddOrSelectClinic,
    handleRenameClinic,
    handleDeleteClinic,
  };
};
