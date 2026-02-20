import { useState } from "react";

export type BridgeEntryType = "directory" | "file";

export interface BridgeEntry {
  name: string;
  type: BridgeEntryType;
  size?: number;
}

interface BridgeStoreOptions {}

export const useBridgeStore = (options?: BridgeStoreOptions) => {
  const [bridgeEntries, setBridgeEntries] = useState<BridgeEntry[]>([]);
  const [bridgePath, setBridgePath] = useState<string>("");
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<{
    name: string;
    type: BridgeEntryType;
  } | null>(null);
  const [mkdirName, setMkdirName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    name: string;
    type: BridgeEntryType;
    path: string;
  } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [uploadConflict, setUploadConflict] = useState<{
    name: string;
    suggestedName: string;
    decide: (strategy: "overwrite" | "auto" | "cancel") => void;
  } | null>(null);
  const [namingConflict, setNamingConflict] = useState<{
    originalName: string;
    suggestedName: string;
    decide: (strategy: "suggest" | "keep" | "cancel") => void;
  } | null>(null);

  const getIncrementedFilename = (
    baseName: string,
    existing: BridgeEntry[],
  ): string => {
    const extIndex = baseName.lastIndexOf(".");
    const hasExt = extIndex > 0;
    const namePart = hasExt ? baseName.slice(0, extIndex) : baseName;
    const extPart = hasExt ? baseName.slice(extIndex) : "";

    const existingNames = new Set(
      existing.filter((e) => e.type === "file").map((e) => e.name),
    );

    // Fanuc 스타일 이름(O####.nc)이면 숫자를 증가시킨다.
    const upper = baseName.toUpperCase().trim();
    const fanucMatch = upper.match(/^O(\d{4})\.NC$/);
    if (fanucMatch) {
      let n = Number(fanucMatch[1]);
      if (!Number.isFinite(n) || n < 0) n = 0;

      // 최대 9999까지 순환하면서 비어 있는 번호를 찾는다.
      for (let i = 0; i < 9999; i += 1) {
        n += 1;
        if (n > 9999) n = 1;
        const cand = `O${String(n).padStart(4, "0")}.nc`;
        if (!existingNames.has(cand)) {
          return cand;
        }
      }
    }

    // 그 외 이름은 기존처럼 _1, _2 suffix 를 붙인다.
    let index = 1;
    let candidate = `${namePart}_${index}${extPart}`;
    while (existingNames.has(candidate) && index < 9999) {
      index += 1;
      candidate = `${namePart}_${index}${extPart}`;
    }
    return candidate;
  };

  const loadBridgeEntries = async (targetPath: string) => {
    try {
      setBridgeLoading(true);
      setBridgeError(null);
      const params = new URLSearchParams();
      if (targetPath) params.set("path", targetPath);
      const res = await fetch(`/api/bridge-store/list?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("브리지 폴더 조회 실패");
      }
      const body: any = await res.json().catch(() => ({}));
      const entries: any[] = Array.isArray(body.entries) ? body.entries : [];
      setBridgeEntries(
        entries.map((e) => ({
          name: String(e.name ?? ""),
          type: e.type === "directory" ? "directory" : "file",
          size: typeof e.size === "number" ? e.size : undefined,
        })),
      );
      setBridgePath(targetPath);
      setSelectedEntry(null);
      setMkdirName("");
      setRenameName("");
    } catch (e: any) {
      setBridgeError(e?.message ?? "브리지 폴더 조회 실패");
      setBridgeEntries([]);
    } finally {
      setBridgeLoading(false);
    }
  };

  const handleRenameSelected = async () => {
    if (!selectedEntry) return;
    const trimmed = renameName.trim();
    if (!trimmed) return;

    const relPath = bridgePath
      ? `${bridgePath}/${selectedEntry.name}`
      : selectedEntry.name;

    try {
      await fetch("/api/bridge-store/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relPath, newName: trimmed }),
      });
      await loadBridgeEntries(bridgePath || "");
    } catch {
      // no-op
    }
  };

  const performDeleteEntry = async (entry: {
    name: string;
    type: BridgeEntryType;
  }) => {
    const relPath = bridgePath ? `${bridgePath}/${entry.name}` : entry.name;

    const baseUrl =
      entry.type === "directory"
        ? "/api/bridge-store/folder"
        : "/api/bridge-store/file";

    try {
      await fetch(`${baseUrl}?path=${encodeURIComponent(relPath)}`, {
        method: "DELETE",
      });
      await loadBridgeEntries(bridgePath || "");
    } catch {
      // no-op
    }
  };

  const handleRequestDeleteEntry = async (entry: {
    name: string;
    type: BridgeEntryType;
  }) => {
    const relPath = bridgePath ? `${bridgePath}/${entry.name}` : entry.name;

    if (entry.type === "directory") {
      try {
        const params = new URLSearchParams();
        params.set("path", relPath);
        const res = await fetch(`/api/bridge-store/list?${params.toString()}`);
        const body: any = await res.json().catch(() => ({}));
        const entries: any[] = Array.isArray(body.entries) ? body.entries : [];
        if (entries.length > 0) {
          setDeleteTarget({
            name: entry.name,
            type: entry.type,
            path: relPath,
          });
          setDeleteConfirmOpen(true);
          return;
        }
      } catch {
        // 목록 조회 실패 시 그냥 바로 삭제 시도
      }
    }

    await performDeleteEntry(entry);
  };

  const handleCreateFolder = async () => {
    const trimmed = mkdirName.trim();
    if (!trimmed) return;
    const base = bridgePath ? `${bridgePath}/${trimmed}` : trimmed;
    try {
      setBridgeError(null);
      const res = await fetch("/api/bridge-store/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: base }),
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}));
        const msg =
          body?.message || body?.error || "새 폴더 생성에 실패했습니다.";
        setBridgeError(String(msg));
        return;
      }
      await loadBridgeEntries(bridgePath || "");
      setMkdirName("");
    } catch {
      setBridgeError("새 폴더 생성에 실패했습니다.");
    }
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const tasks: Promise<void>[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      tasks.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              let content = String(reader.result ?? "");
              let targetName = file.name;

              // 현재 경로 기준으로 동일한 파일명이 이미 존재하면, 외부 UI(ConfirmDialog)를 통해
              // 덮어쓰기/번호 증가/취소 중 하나를 선택할 수 있도록 uploadConflict 상태를 사용한다.
              const conflict = bridgeEntries.find(
                (e) => e.type === "file" && e.name === targetName,
              );

              if (conflict) {
                const suggested = getIncrementedFilename(
                  targetName,
                  bridgeEntries,
                );

                await new Promise<void>((decisionDone) => {
                  const decide = (
                    strategy: "overwrite" | "auto" | "cancel",
                  ) => {
                    if (strategy === "auto") {
                      targetName = suggested;
                    } else if (strategy === "cancel") {
                      // 이 파일 업로드는 건너뛴다.
                      decisionDone();
                      resolve();
                      setUploadConflict(null);
                      return;
                    }
                    decisionDone();
                    setUploadConflict(null);
                  };

                  setUploadConflict({
                    name: targetName,
                    suggestedName: suggested,
                    decide,
                  });
                });

                // cancel 이었던 경우에는 위에서 resolve()가 이미 호출되었으므로 여기서는 종료한다.
                if (!targetName) {
                  return;
                }
              }

              const relPath = bridgePath
                ? `${bridgePath}/${targetName}`
                : targetName;
              await fetch("/api/bridge-store/file", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  path: relPath,
                  content,
                }),
              });
            } catch {
              // no-op
            } finally {
              resolve();
            }
          };
          reader.onerror = () => {
            resolve();
          };
          reader.readAsText(file);
        }),
      );
    }

    await Promise.all(tasks);
    await loadBridgeEntries(bridgePath || "");
  };

  return {
    // state
    bridgeEntries,
    bridgePath,
    bridgeLoading,
    bridgeError,
    selectedEntry,
    mkdirName,
    renameName,
    deleteTarget,
    deleteConfirmOpen,
    uploadConflict,
    namingConflict,
    // setters
    setSelectedEntry,
    setMkdirName,
    setRenameName,
    setDeleteTarget,
    setDeleteConfirmOpen,
    setUploadConflict,
    setNamingConflict,
    // actions
    loadBridgeEntries,
    handleRenameSelected,
    handleRequestDeleteEntry,
    handleCreateFolder,
    handleUploadFiles,
    performDeleteEntry,
  } as const;
};
