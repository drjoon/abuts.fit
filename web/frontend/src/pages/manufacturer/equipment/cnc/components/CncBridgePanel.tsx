import React, { RefObject } from "react";
import { CncFileCard } from "./CncFileCard";

interface BridgeEntry {
  name: string;
  type: "directory" | "file";
  size?: number;
}

interface CncBridgePanelProps {
  bridgePath: string;
  bridgeSort: "asc" | "desc";
  onChangeSort: (value: "asc" | "desc") => void;
  onOpenMkdirModal: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onUploadFiles: (files: FileList | File[]) => Promise<void> | void;
  bridgeDropping: boolean;
  onSetBridgeDropping: (value: boolean) => void;
  bridgeLoading: boolean;
  bridgeError: string | null;
  bridgeEntries: BridgeEntry[];
  sortedBridgeEntries: BridgeEntry[];
  onNavigateParent: () => void;
  selectedEntry: BridgeEntry | null;
  renameName: string;
  onChangeRenameName: (value: string) => void;
  onCommitRename: () => void;
  onClickEntry: (entry: BridgeEntry) => void;
  onDeleteEntry: (entry: BridgeEntry) => Promise<void> | void;
  formatFileSize: (bytes?: number) => string;
  onOpenBridgeProgram?: (entry: BridgeEntry) => void;
}

export const CncBridgePanel: React.FC<CncBridgePanelProps> = ({
  bridgePath,
  bridgeSort,
  onChangeSort,
  onOpenMkdirModal,
  fileInputRef,
  onUploadFiles,
  bridgeDropping,
  onSetBridgeDropping,
  bridgeLoading,
  bridgeError,
  bridgeEntries,
  sortedBridgeEntries,
  onNavigateParent,
  selectedEntry,
  renameName,
  onChangeRenameName,
  onCommitRename,
  onClickEntry,
  onDeleteEntry,
  formatFileSize,
  onOpenBridgeProgram,
}) => {
  return (
    <div className="space-y-2 text-xs sm:text-sm text-slate-600">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs sm:text-sm font-medium text-slate-700 truncate">
            현재 경로: {bridgePath || "/"}
          </span>
          {bridgePath && (
            <button
              type="button"
              className="px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-100 flex-shrink-0"
              onClick={onNavigateParent}
            >
              상위 폴더
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 rounded-md bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
            <button
              type="button"
              onClick={() => onChangeSort("asc")}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${
                bridgeSort === "asc"
                  ? "bg-white border-slate-300 text-slate-800"
                  : "bg-transparent border-transparent text-slate-500 hover:bg-slate-200/70"
              }`}
            >
              ↑ 오름
            </button>
            <button
              type="button"
              onClick={() => onChangeSort("desc")}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${
                bridgeSort === "desc"
                  ? "bg-white border-slate-300 text-slate-800"
                  : "bg-transparent border-transparent text-slate-500 hover:bg-slate-200/70"
              }`}
            >
              ↓ 내림
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenMkdirModal}
            className="px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-100"
          >
            새 폴더
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".nc,.txt"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              void (async () => {
                await onUploadFiles(files);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              })();
            }}
            multiple
          />
        </div>
      </div>
      <div
        className={`rounded-xl border-2 border-dashed overflow-hidden mt-1 transition-colors cursor-pointer ${
          bridgeDropping
            ? "border-blue-400 bg-blue-50/60"
            : "border-slate-200 bg-slate-50/80"
        }`}
        onClick={() => {
          if (!fileInputRef.current) return;
          fileInputRef.current.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          onSetBridgeDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onSetBridgeDropping(false);
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          onSetBridgeDropping(false);
          const { files } = e.dataTransfer;
          if (files && files.length > 0) {
            await onUploadFiles(files);
          }
        }}
      >
        <div className="max-h-64 overflow-y-auto">
          {bridgeLoading ? (
            <div className="px-3 py-4 text-xs text-slate-500">
              불러오는 중...
            </div>
          ) : bridgeError ? (
            <div className="px-3 py-4 text-xs text-red-500">{bridgeError}</div>
          ) : bridgeEntries.length === 0 ? (
            <div className="px-3 py-6 text-xs text-slate-500 text-center">
              폴더가 비어 있습니다. 여기로 .nc / .txt 파일을 드래그해서 업로드할
              수 있습니다.
            </div>
          ) : (
            <div className="px-3 py-2 text-xs sm:text-[13px]">
              <div className="mb-2 text-[11px] text-slate-500 text-center">
                이 영역에 .nc / .txt 파일을 드래그하면 업로드 됩니다.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sortedBridgeEntries.map((entry, idx) => {
                  const isDir = entry.type === "directory";
                  const sizeLabel = formatFileSize(entry.size);

                  const rawName = String(entry.name ?? "");
                  // 파일 크기를 오른쪽에 배치하기 위해 파일명 truncate 길이를 줄인다.
                  const displayName =
                    rawName.length > 15
                      ? `${rawName.slice(0, 15)}...`
                      : rawName;
                  const cardClass = isDir
                    ? "border-2 border-amber-500 bg-white hover:border-amber-600"
                    : "border border-blue-200 bg-white hover:border-blue-400 hover:bg-blue-50/60";

                  return (
                    <div
                      key={`${entry.name}-${idx}`}
                      className="relative group min-w-0"
                    >
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await onDeleteEntry(entry);
                        }}
                        className="absolute top-0.5 right-0.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                      <CncFileCard
                        onClick={(e) => {
                          e.stopPropagation();
                          onClickEntry(entry);
                        }}
                        className={`relative group flex flex-col px-3 py-2 cursor-pointer transition-colors min-h-[64px] ${cardClass}`}
                      >
                        <div className="flex items-baseline justify-between gap-2 min-w-0 w-full">
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            {isDir && (
                              <span className="text-[11px]" aria-hidden="true">
                                📁
                              </span>
                            )}
                            {selectedEntry &&
                            selectedEntry.name === entry.name &&
                            selectedEntry.type === entry.type ? (
                              <input
                                type="text"
                                value={renameName}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  onChangeRenameName(e.target.value)
                                }
                                onBlur={() => {
                                  onCommitRename();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    onCommitRename();
                                  }
                                }}
                                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px]"
                              />
                            ) : (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClickEntry(entry);
                                }}
                                className="block flex-1 max-w-full pr-3 text-left truncate whitespace-nowrap font-medium cursor-pointer"
                              >
                                {displayName}
                              </span>
                            )}
                          </div>
                          {!isDir && (
                            <span className="flex-shrink-0 text-[11px] text-slate-500 text-right min-w-[48px]">
                              {sizeLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex w-full items-center justify-center text-[10px] text-slate-500 pr-3">
                          {!isDir && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const relPath = bridgePath
                                    ? `${bridgePath}/${entry.name}`
                                    : entry.name;
                                  try {
                                    const res = await fetch(
                                      `/api/bridge-store/file?path=${encodeURIComponent(
                                        relPath,
                                      )}`,
                                    );
                                    if (!res.ok) return;
                                    const body: any = await res
                                      .json()
                                      .catch(() => ({}));
                                    const content = String(body?.content ?? "");
                                    const blob = new Blob([content], {
                                      type: "text/plain;charset=utf-8",
                                    });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = entry.name;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  } catch {
                                    // no-op
                                  }
                                }}
                                className="inline-flex h-8 px-3 min-w-[80px] items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                다운로드
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onOpenBridgeProgram) {
                                    onOpenBridgeProgram(entry);
                                  }
                                }}
                                className="inline-flex h-8 px-3 min-w-[72px] items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                코드
                              </button>
                            </div>
                          )}
                          {isDir && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const relPath = bridgePath
                                    ? `${bridgePath}/${entry.name}`
                                    : entry.name;
                                  try {
                                    const res = await fetch(
                                      `/api/bridge-store/folder-zip?path=${encodeURIComponent(
                                        relPath,
                                      )}`,
                                    );
                                    if (!res.ok) return;
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `${entry.name}.zip`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  } catch {
                                    // no-op
                                  }
                                }}
                                className="inline-flex h-8 px-3 min-w-[80px] items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                다운로드
                              </button>
                            </div>
                          )}
                        </div>
                      </CncFileCard>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
