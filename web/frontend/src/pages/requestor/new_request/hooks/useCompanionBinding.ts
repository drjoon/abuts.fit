import { useCallback, useEffect, useMemo, useState } from "react";
import type { CaseInfos } from "./newRequestTypes";
import {
  getLowerExt,
  getStem,
  isCadCompanionFile,
  isStemMatch,
  parseCadCompanionMetadata,
} from "../components/newRequestDetailsUtils";

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Params = {
  files: File[];
  initialCompanionFiles?: File[];
  caseInfosMap?: Record<string, CaseInfos>;
  updateCaseInfos: (fileKey: string, updates: Partial<CaseInfos>) => void;
  toNormalizedFileKey: (file: File) => string;
  toast: ToastFn;
  onFilesSelected: (files: File[]) => void;
  onCompanionFilesAccepted?: (files: File[]) => void;
  onCompanionFilesChange?: (files: File[]) => void;
  registerCompanionFileHandler?: (
    handler: (files: File[], options?: { targetStlFileKey?: string }) => void,
  ) => void;
};

type CardLinkDrag = {
  kind: "stl" | "companion";
  stlFileKey?: string;
  companionFileKey?: string;
  sourceStlFileKey?: string;
} | null;

type CardDropOptions = {
  selectIndex?: number;
  targetStlFileKey?: string;
  targetCompanionFileKey?: string;
};

export function useCompanionBinding({
  files,
  initialCompanionFiles = [],
  caseInfosMap,
  updateCaseInfos,
  toNormalizedFileKey,
  toast,
  onFilesSelected,
  onCompanionFilesAccepted,
  onCompanionFilesChange,
  registerCompanionFileHandler,
}: Params) {
  const [companionFiles, setCompanionFiles] = useState<File[]>(
    initialCompanionFiles,
  );
  const [companionBypassStemMap, setCompanionBypassStemMap] = useState<
    Record<string, boolean>
  >({});
  const [companionPromptOpen, setCompanionPromptOpen] = useState(false);
  const [suppressCompanionPrompt, setSuppressCompanionPrompt] =
    useState(false);
  const [manualCompanionLinksByStlKey, setManualCompanionLinksByStlKey] =
    useState<Record<string, string[]>>({});
  const [companionPinnedByStlKey, setCompanionPinnedByStlKey] = useState<
    Record<string, string>
  >({});
  const [companionOverrideByStlKey, setCompanionOverrideByStlKey] = useState<
    Record<string, boolean>
  >({});
  const [pendingCompanionReplace, setPendingCompanionReplace] = useState<{
    stlFileKey: string;
    companionFileKey: string;
  } | null>(null);
  const [pendingCompanionTargetStlKey, setPendingCompanionTargetStlKey] =
    useState<string | null>(null);
  const [pendingCompanionCardForStlUpload, setPendingCompanionCardForStlUpload] =
    useState<string | null>(null);
  const [cardDragOverKey, setCardDragOverKey] = useState<string | null>(null);
  const [cardLinkDrag, setCardLinkDrag] = useState<CardLinkDrag>(null);

  const stlStemList = useMemo(() => {
    return (files || [])
      .map((f) => String(f?.name || "").trim())
      .filter((name) => name.toLowerCase().endsWith(".stl"))
      .map((name) => getStem(name));
  }, [files]);

  const getCompanionFileKey = useCallback((file: File) => {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }, []);

  const companionStems = useMemo(() => {
    const stems: string[] = [];
    for (const file of companionFiles) {
      if (!isCadCompanionFile(file.name)) continue;
      stems.push(getStem(file.name));
    }
    return stems;
  }, [companionFiles]);

  const missingCompanionStems = useMemo(() => {
    const stlFiles = (files || []).filter((f) =>
      String(f?.name || "").toLowerCase().endsWith(".stl"),
    );

    return stlFiles
      .map((stlFile) => {
        const stlStem = getStem(stlFile.name);
        const stlKey = toNormalizedFileKey(stlFile);

        const pinnedKey = companionPinnedByStlKey[stlKey];
        const hasPinned = Boolean(
          pinnedKey &&
            companionFiles.some((c) => getCompanionFileKey(c) === pinnedKey),
        );

        const manualKeys = manualCompanionLinksByStlKey[stlKey] || [];
        const hasManual = manualKeys.some((k) =>
          companionFiles.some((c) => getCompanionFileKey(c) === k),
        );

        const hasStemMatch = companionStems.some((companionStem) =>
          isStemMatch(stlStem, companionStem),
        );

        const hasCompanion = hasPinned || hasManual || hasStemMatch;
        return { stlStem, hasCompanion };
      })
      .filter(({ stlStem, hasCompanion }) => {
        return !hasCompanion && !companionBypassStemMap[stlStem];
      })
      .map(({ stlStem }) => stlStem);
  }, [
    companionBypassStemMap,
    companionFiles,
    companionPinnedByStlKey,
    companionStems,
    files,
    getCompanionFileKey,
    manualCompanionLinksByStlKey,
    toNormalizedFileKey,
  ]);

  const linkCompanionToStl = useCallback(
    (
      stlFileKey: string,
      companionFileKey: string,
      options?: { replace?: boolean },
    ) => {
      if (!stlFileKey || !companionFileKey) return;

      setManualCompanionLinksByStlKey((prev) => {
        const next = { ...prev };
        if (options?.replace) {
          next[stlFileKey] = [companionFileKey];
          return next;
        }
        const current = new Set(next[stlFileKey] || []);
        current.add(companionFileKey);
        next[stlFileKey] = [...current];
        return next;
      });

      setCompanionPinnedByStlKey((prev) => ({
        ...prev,
        [stlFileKey]: companionFileKey,
      }));
      setCompanionOverrideByStlKey((prev) => ({
        ...prev,
        [stlFileKey]: true,
      }));
    },
    [],
  );

  const unlinkCompanionFromStl = useCallback(
    (stlFileKey: string, companionFileKey: string) => {
      if (!stlFileKey || !companionFileKey) return;
      setManualCompanionLinksByStlKey((prev) => {
        const current = prev[stlFileKey] || [];
        const filtered = current.filter((k) => k !== companionFileKey);
        const next = { ...prev };
        if (filtered.length > 0) next[stlFileKey] = filtered;
        else delete next[stlFileKey];
        return next;
      });
      setCompanionPinnedByStlKey((prev) => {
        if (prev[stlFileKey] !== companionFileKey) return prev;
        const next = { ...prev };
        delete next[stlFileKey];
        return next;
      });
    },
    [],
  );

  const getCurrentCompanionKeyForStl = useCallback(
    (stlFileKey: string) => {
      const stl = files.find((f) => toNormalizedFileKey(f) === stlFileKey);
      if (!stl) return null;

      const pinnedKey = companionPinnedByStlKey[stlFileKey];
      if (pinnedKey) {
        const pinnedFile = companionFiles.find(
          (c) => getCompanionFileKey(c) === pinnedKey,
        );
        if (pinnedFile) return pinnedKey;
      }

      const manual = companionFiles.filter((companion) =>
        (manualCompanionLinksByStlKey[stlFileKey] || []).includes(
          getCompanionFileKey(companion),
        ),
      );
      if (manual[0]) return getCompanionFileKey(manual[0]);

      const hasOverride = Boolean(companionOverrideByStlKey[stlFileKey]);
      if (hasOverride) return null;

      const matched = companionFiles.filter((companion) =>
        isStemMatch(getStem(stl.name), getStem(companion.name)),
      );
      if (matched[0]) return getCompanionFileKey(matched[0]);

      return null;
    },
    [
      companionFiles,
      companionOverrideByStlKey,
      companionPinnedByStlKey,
      files,
      getCompanionFileKey,
      manualCompanionLinksByStlKey,
      toNormalizedFileKey,
    ],
  );

  const getEffectiveCompanionsForStl = useCallback(
    (file: File) => {
      const fileKey = toNormalizedFileKey(file);
      const pinnedCompanion = (() => {
        const pinnedKey = companionPinnedByStlKey[fileKey];
        if (!pinnedKey) return null;
        return (
          companionFiles.find(
            (companion) => getCompanionFileKey(companion) === pinnedKey,
          ) || null
        );
      })();

      const matchedCompanions = companionFiles.filter((companion) =>
        isStemMatch(getStem(file.name), getStem(companion.name)),
      );

      const manualLinkedCompanions = companionFiles.filter((companion) =>
        (manualCompanionLinksByStlKey[fileKey] || []).includes(
          getCompanionFileKey(companion),
        ),
      );

      const hasCompanionOverride = Boolean(companionOverrideByStlKey[fileKey]);
      return pinnedCompanion
        ? [pinnedCompanion]
        : hasCompanionOverride
          ? manualLinkedCompanions
          : matchedCompanions.length > 0
            ? matchedCompanions
            : manualLinkedCompanions.length > 0
              ? manualLinkedCompanions
              : [];
    },
    [
      companionFiles,
      companionOverrideByStlKey,
      companionPinnedByStlKey,
      getCompanionFileKey,
      manualCompanionLinksByStlKey,
      toNormalizedFileKey,
    ],
  );

  const standaloneCompanionFiles = useMemo(() => {
    if (!companionFiles.length) return [] as File[];

    const linkedCompanionKeys = new Set<string>();

    for (const stl of files) {
      const stlName = String(stl?.name || "").toLowerCase();
      if (!stlName.endsWith(".stl")) continue;

      const stlFileKey = toNormalizedFileKey(stl);
      const hasOverride = Boolean(companionOverrideByStlKey[stlFileKey]);

      const pinnedKey = companionPinnedByStlKey[stlFileKey];
      if (pinnedKey) linkedCompanionKeys.add(pinnedKey);

      const manualKeys = manualCompanionLinksByStlKey[stlFileKey] || [];
      for (const key of manualKeys) linkedCompanionKeys.add(key);

      if (!hasOverride) {
        const stlStem = getStem(stl.name);
        for (const companion of companionFiles) {
          if (isStemMatch(stlStem, getStem(companion.name))) {
            linkedCompanionKeys.add(getCompanionFileKey(companion));
          }
        }
      }
    }

    return companionFiles.filter(
      (companion) => !linkedCompanionKeys.has(getCompanionFileKey(companion)),
    );
  }, [
    companionFiles,
    companionOverrideByStlKey,
    companionPinnedByStlKey,
    files,
    getCompanionFileKey,
    manualCompanionLinksByStlKey,
    toNormalizedFileKey,
  ]);

  const handleCompanionFilesSelected = useCallback(
    (selected: File[], options?: { targetStlFileKey?: string }) => {
      if (!selected.length) return;

      const accepted: File[] = [];
      const rejectedExt: string[] = [];
      const ignoredPts: string[] = [];

      for (const file of selected) {
        const ext = getLowerExt(file.name);
        if (ext === ".pts") {
          ignoredPts.push(file.name);
          continue;
        }
        if (!isCadCompanionFile(file.name)) {
          rejectedExt.push(file.name);
          continue;
        }
        accepted.push(file);
      }

      if (rejectedExt.length) {
        toast({
          title: "지원하지 않는 보조 파일 형식",
          description: "지원 형식: 3Shape(.xml), ExoCAD(*constructionInfo*)",
          variant: "destructive",
          duration: 4500,
        });
      }

      if (ignoredPts.length) {
        toast({
          title: "PTS 파일은 자동 제외되었어요",
          description: "3Shape 폴더 업로드 시 PTS는 생략됩니다.",
          duration: 2200,
        });
      }

      if (!accepted.length) return;

      onCompanionFilesAccepted?.(accepted);

      setCompanionFiles((prev) => {
        const next = [...prev];
        for (const file of accepted) {
          const key = toNormalizedFileKey(file);
          const exists = next.some((p) => toNormalizedFileKey(p) === key);
          if (!exists) next.push(file);
        }
        return next;
      });

      setCompanionBypassStemMap((prev) => {
        const next = { ...prev };
        for (const file of accepted) {
          const companionStem = getStem(file.name);
          for (const stlStem of stlStemList) {
            if (isStemMatch(stlStem, companionStem)) {
              delete next[stlStem];
            }
          }
          delete next[companionStem];
        }
        return next;
      });

      let effectiveTargetStlFileKey = options?.targetStlFileKey;
      if (effectiveTargetStlFileKey) {
        const incomingKey = accepted[0] ? getCompanionFileKey(accepted[0]) : null;
        const currentKey = getCurrentCompanionKeyForStl(effectiveTargetStlFileKey);

        if (incomingKey) {
          if (currentKey && currentKey !== incomingKey) {
            setPendingCompanionReplace({
              stlFileKey: effectiveTargetStlFileKey,
              companionFileKey: incomingKey,
            });
            effectiveTargetStlFileKey = undefined;
          } else {
            linkCompanionToStl(effectiveTargetStlFileKey, incomingKey);
          }
        }
      }

      void (async () => {
        let updatedFieldsCount = 0;

        for (const companion of accepted) {
          try {
            const meta = await parseCadCompanionMetadata(companion);
            if (!meta.clinicName && !meta.patientName && !meta.tooth) continue;

            const stem = getStem(companion.name);
            const forcedTarget = effectiveTargetStlFileKey
              ? files.find((f) => toNormalizedFileKey(f) === effectiveTargetStlFileKey)
              : null;

            const targets = forcedTarget
              ? [forcedTarget]
              : files.filter(
                  (f) =>
                    String(f?.name || "").toLowerCase().endsWith(".stl") &&
                    isStemMatch(getStem(f.name), stem),
                );

            for (const stl of targets) {
              const fileKey = toNormalizedFileKey(stl);
              const current = caseInfosMap?.[fileKey];
              const patch: Partial<CaseInfos> = {};

              if (!String(current?.clinicName || "").trim() && meta.clinicName) {
                patch.clinicName = meta.clinicName;
              }
              if (!String(current?.patientName || "").trim() && meta.patientName) {
                patch.patientName = meta.patientName;
              }
              if (!String(current?.tooth || "").trim() && meta.tooth) {
                patch.tooth = meta.tooth;
              }

              if (Object.keys(patch).length > 0) {
                updateCaseInfos(fileKey, patch);
                updatedFieldsCount += Object.keys(patch).length;
              }
            }
          } catch {
            // 파싱 실패는 무시하고 업로드 자체는 유지
          }
        }

        if (updatedFieldsCount > 0) {
          toast({
            title: "보조 파일에서 정보 자동 입력",
            description:
              "환자/치과/치아번호를 읽어 비어 있던 입력란에 자동 반영했습니다.",
            duration: 3500,
          });
        }
      })();

      toast({
        title: "보조 파일이 추가되었습니다",
        description: `추가됨: ${accepted.length}개`,
        duration: 2500,
      });
    },
    [
      caseInfosMap,
      files,
      getCompanionFileKey,
      getCurrentCompanionKeyForStl,
      linkCompanionToStl,
      onCompanionFilesAccepted,
      stlStemList,
      toast,
      toNormalizedFileKey,
      updateCaseInfos,
    ],
  );

  const handleBypassMissingCompanion = useCallback(() => {
    if (!missingCompanionStems.length) {
      setCompanionPromptOpen(false);
      return;
    }

    setCompanionBypassStemMap((prev) => {
      const next = { ...prev };
      for (const stem of missingCompanionStems) {
        next[stem] = true;
      }
      return next;
    });

    setCompanionPromptOpen(false);

    toast({
      title: "보조 파일 없이 진행",
      description:
        "작업은 계속할 수 있지만, 보조 파일 업로드 시 좌표/회전 정확도가 더 높아질 수 있습니다.",
      duration: 4500,
    });
  }, [missingCompanionStems, toast]);

  const handleRemoveCompanionFile = useCallback(
    (target: File) => {
      const targetKey = getCompanionFileKey(target);

      setCompanionFiles((prev) =>
        prev.filter((file) => getCompanionFileKey(file) !== targetKey),
      );

      setManualCompanionLinksByStlKey((prev) => {
        const next: Record<string, string[]> = {};
        for (const [stlKey, companionKeys] of Object.entries(prev)) {
          const filtered = companionKeys.filter((key) => key !== targetKey);
          if (filtered.length > 0) next[stlKey] = filtered;
        }
        return next;
      });

      setCompanionPinnedByStlKey((prev) => {
        const next = { ...prev };
        for (const [stlKey, companionKey] of Object.entries(prev)) {
          if (companionKey === targetKey) delete next[stlKey];
        }
        return next;
      });
    },
    [getCompanionFileKey],
  );

  const detachDraggingCompanion = useCallback(() => {
    if (
      cardLinkDrag?.kind === "companion" &&
      cardLinkDrag.companionFileKey &&
      cardLinkDrag.sourceStlFileKey
    ) {
      unlinkCompanionFromStl(
        cardLinkDrag.sourceStlFileKey,
        cardLinkDrag.companionFileKey,
      );
      setCardLinkDrag(null);
      setCardDragOverKey(null);
      toast({
        title: "카드를 분리했어요",
        description: "구성정보를 STL 케이스에서 분리했습니다.",
        duration: 2200,
      });
      return true;
    }
    return false;
  }, [cardLinkDrag, toast, unlinkCompanionFromStl]);

  const handleCardDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      dropKey: string,
      options: CardDropOptions | undefined,
      onSelectIndex?: (index: number) => void,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setCardDragOverKey((prev) => (prev === dropKey ? null : prev));

      const itemFiles = Array.from(event.dataTransfer?.items || [])
        .map((item) => item.getAsFile())
        .filter((f): f is File => Boolean(f));
      const directFiles = Array.from(event.dataTransfer?.files || []);

      const deduped = (() => {
        const map = new Map<string, File>();
        for (const file of [...itemFiles, ...directFiles]) {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (!map.has(key)) map.set(key, file);
        }
        return [...map.values()];
      })();

      if (!deduped.length && cardLinkDrag) {
        if (
          options?.targetStlFileKey &&
          cardLinkDrag.kind === "companion" &&
          cardLinkDrag.companionFileKey
        ) {
          const currentKey = getCurrentCompanionKeyForStl(options.targetStlFileKey);
          if (currentKey && currentKey !== cardLinkDrag.companionFileKey) {
            setPendingCompanionReplace({
              stlFileKey: options.targetStlFileKey,
              companionFileKey: cardLinkDrag.companionFileKey,
            });
            setCardLinkDrag(null);
            return;
          }

          linkCompanionToStl(options.targetStlFileKey, cardLinkDrag.companionFileKey);
          toast({
            title: "카드를 결합했어요",
            description: "구성정보를 해당 STL 케이스에 연결했습니다.",
            duration: 2200,
          });
        } else if (
          options?.targetCompanionFileKey &&
          cardLinkDrag.kind === "stl" &&
          cardLinkDrag.stlFileKey
        ) {
          const currentKey = getCurrentCompanionKeyForStl(cardLinkDrag.stlFileKey);
          if (currentKey && currentKey !== options.targetCompanionFileKey) {
            setPendingCompanionReplace({
              stlFileKey: cardLinkDrag.stlFileKey,
              companionFileKey: options.targetCompanionFileKey,
            });
            setCardLinkDrag(null);
            return;
          }

          linkCompanionToStl(cardLinkDrag.stlFileKey, options.targetCompanionFileKey);
          toast({
            title: "카드를 결합했어요",
            description: "해당 STL 케이스에 구성정보를 연결했습니다.",
            duration: 2200,
          });
        }
        setCardLinkDrag(null);
        return;
      }

      const droppedCompanions = deduped.filter((f) => isCadCompanionFile(f.name));
      const stlFiles = deduped.filter((f) => getLowerExt(f.name) === ".stl");
      const otherFiles = deduped.filter(
        (f) => !isCadCompanionFile(f.name) && getLowerExt(f.name) !== ".stl",
      );

      if (droppedCompanions.length > 0) {
        const implicitTargetStlFileKey =
          !options?.targetStlFileKey &&
          !options?.targetCompanionFileKey &&
          stlFiles.length === 1
            ? toNormalizedFileKey(stlFiles[0])
            : undefined;

        handleCompanionFilesSelected(droppedCompanions, {
          targetStlFileKey: options?.targetStlFileKey || implicitTargetStlFileKey,
        });
      }

      if (options?.targetCompanionFileKey && stlFiles.length > 0) {
        for (const stl of stlFiles) {
          const stlKey = toNormalizedFileKey(stl);
          const currentKey = getCurrentCompanionKeyForStl(stlKey);
          if (currentKey && currentKey !== options.targetCompanionFileKey) {
            setPendingCompanionReplace({
              stlFileKey: stlKey,
              companionFileKey: options.targetCompanionFileKey,
            });
            continue;
          }

          linkCompanionToStl(stlKey, options.targetCompanionFileKey);
        }
      }

      const forwardFiles = [...stlFiles, ...otherFiles];
      if (forwardFiles.length > 0) {
        if (typeof options?.selectIndex === "number") {
          onSelectIndex?.(options.selectIndex);
        }
        onFilesSelected(forwardFiles);
      }

      setCardLinkDrag(null);
    },
    [
      cardLinkDrag,
      getCurrentCompanionKeyForStl,
      handleCompanionFilesSelected,
      linkCompanionToStl,
      onFilesSelected,
      toast,
      toNormalizedFileKey,
    ],
  );

  const handleMainInputFiles = useCallback(
    (selected: File[]) => {
      const stlFiles = selected.filter((f) => getLowerExt(f.name) === ".stl");
      const companionSelected = selected.filter((f) => isCadCompanionFile(f.name));
      const restFiles = selected.filter(
        (f) => !isCadCompanionFile(f.name) && getLowerExt(f.name) !== ".stl",
      );

      if (companionSelected.length > 0) {
        const forcedTargetStlFileKey =
          stlFiles.length === 1 ? toNormalizedFileKey(stlFiles[0]) : undefined;

        handleCompanionFilesSelected(companionSelected, {
          targetStlFileKey: forcedTargetStlFileKey,
        });
      }

      if (pendingCompanionCardForStlUpload && stlFiles.length > 0) {
        setManualCompanionLinksByStlKey((prev) => {
          const next = { ...prev };
          for (const stl of stlFiles) {
            const stlKey = toNormalizedFileKey(stl);
            const current = new Set(next[stlKey] || []);
            current.add(pendingCompanionCardForStlUpload);
            next[stlKey] = [...current];
          }
          return next;
        });
      }

      const forward = [...stlFiles, ...restFiles];
      if (forward.length > 0) onFilesSelected(forward);

      setPendingCompanionCardForStlUpload(null);
    },
    [
      handleCompanionFilesSelected,
      onFilesSelected,
      pendingCompanionCardForStlUpload,
      toNormalizedFileKey,
    ],
  );

  const handleCompanionInputFiles = useCallback(
    (selected: File[]) => {
      handleCompanionFilesSelected(selected, {
        targetStlFileKey: pendingCompanionTargetStlKey || undefined,
      });
      setPendingCompanionTargetStlKey(null);
    },
    [handleCompanionFilesSelected, pendingCompanionTargetStlKey],
  );

  const clearCompanionStateForCancelAll = useCallback(() => {
    setSuppressCompanionPrompt(true);
    setCompanionFiles([]);
    setCompanionBypassStemMap({});
    setManualCompanionLinksByStlKey({});
    setCompanionPinnedByStlKey({});
    setCompanionOverrideByStlKey({});
    setPendingCompanionReplace(null);
    setPendingCompanionTargetStlKey(null);
    setPendingCompanionCardForStlUpload(null);
    setCardLinkDrag(null);
    setCardDragOverKey(null);
    setCompanionPromptOpen(false);
  }, []);

  useEffect(() => {
    if (!files.length) {
      setCompanionPromptOpen(false);
      setCompanionBypassStemMap({});
      setCompanionPinnedByStlKey({});
      setCompanionOverrideByStlKey({});
      setPendingCompanionReplace(null);
      if (suppressCompanionPrompt) {
        setSuppressCompanionPrompt(false);
      }
      return;
    }

    if (suppressCompanionPrompt) return;
    if (missingCompanionStems.length > 0) {
      setCompanionPromptOpen(true);
    }
  }, [files.length, missingCompanionStems.length, suppressCompanionPrompt]);

  useEffect(() => {
    if (!registerCompanionFileHandler) return;
    registerCompanionFileHandler(handleCompanionFilesSelected);
  }, [registerCompanionFileHandler, handleCompanionFilesSelected]);

  useEffect(() => {
    onCompanionFilesChange?.(companionFiles);
  }, [companionFiles, onCompanionFilesChange]);

  useEffect(() => {
    if (!initialCompanionFiles.length) return;
    setCompanionFiles((prev) => {
      if (prev.length > 0) return prev;
      return initialCompanionFiles;
    });
  }, [initialCompanionFiles]);

  // 제출 훅에서 STL-구성정보 연결 관계를 정확히 재사용할 수 있도록
  // 화면에서 확정된 연결 결과를 caseInfosMap[fileKey].cadCompanionFiles에 동기화한다.
  // (기존 stem 추정만으로는 수동 카드 연결 케이스에서 누락될 수 있음)
  useEffect(() => {
    const normalizeCompanionMeta = (items: unknown) => {
      if (!Array.isArray(items)) return [] as Array<{
        originalName?: string;
        size?: number;
        mimetype?: string;
      }>;
      return items
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            originalName: String(row.originalName || "").trim(),
            size: Number(row.size || 0),
            mimetype: String(row.mimetype || "").trim(),
          };
        })
        .filter((item) => !!item.originalName && Number.isFinite(item.size));
    };

    const toSignature = (
      items: Array<{ originalName?: string; size?: number; mimetype?: string }>,
    ) =>
      items
        .map((item) => `${String(item.originalName || "")}::${Number(item.size || 0)}`)
        .sort()
        .join("|");

    for (const stl of files) {
      const stlName = String(stl?.name || "").toLowerCase();
      if (!stlName.endsWith(".stl")) continue;

      const stlKey = toNormalizedFileKey(stl);
      const linkedCompanions = getEffectiveCompanionsForStl(stl);
      const nextCadCompanionFiles = linkedCompanions.map((companion) => ({
        originalName: String(companion.name || "").trim(),
        size: Number(companion.size || 0),
        mimetype: String(companion.type || "").trim() || undefined,
      }));

      const prevCadCompanionFiles = normalizeCompanionMeta(
        caseInfosMap?.[stlKey]?.cadCompanionFiles,
      );

      if (toSignature(prevCadCompanionFiles) === toSignature(nextCadCompanionFiles)) {
        continue;
      }

      updateCaseInfos(stlKey, {
        cadCompanionFiles: nextCadCompanionFiles,
      });
    }
  }, [
    caseInfosMap,
    files,
    getEffectiveCompanionsForStl,
    toNormalizedFileKey,
    updateCaseInfos,
  ]);

  return {
    companionFiles,
    standaloneCompanionFiles,
    companionPromptOpen,
    setCompanionPromptOpen,
    missingCompanionStems,
    pendingCompanionReplace,
    setPendingCompanionReplace,
    pendingCompanionTargetStlKey,
    setPendingCompanionTargetStlKey,
    setPendingCompanionCardForStlUpload,
    cardDragOverKey,
    setCardDragOverKey,
    cardLinkDrag,
    setCardLinkDrag,
    getCompanionFileKey,
    getCurrentCompanionKeyForStl,
    getEffectiveCompanionsForStl,
    linkCompanionToStl,
    unlinkCompanionFromStl,
    handleCompanionFilesSelected,
    handleBypassMissingCompanion,
    handleRemoveCompanionFile,
    detachDraggingCompanion,
    handleCardDrop,
    handleMainInputFiles,
    handleCompanionInputFiles,
    clearCompanionStateForCancelAll,
  };
}
