import React from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { RotateCcw, Save, X } from "lucide-react";
import { useCncWriteGuard } from "@/pages/manufacturer/cnc/hooks/useCncWriteGuard";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";
import { useAuthStore } from "@/store/useAuthStore";

interface CncProgramEditorPanelProps {
  open: boolean;
  onClose: () => void;
  workUid: string;
  selectedProgram: any | null;
  onLoadProgram: (prog: any) => Promise<string>; // 프로그램 코드 로드
  onSaveProgram: (
    prog: any,
    code: string,
    options?: {
      isNew?: boolean;
      nameOverride?: string;
      programNoOverride?: number;
    },
  ) => Promise<void>; // 프로그램 코드 저장(업데이트/새로 저장)
  readOnly?: boolean;
}

// 프로그램 수정/업로드용 우측 패널
// - 좌측에서 선택된 프로그램 정보를 받아 코드 조회/편집/저장
export const CncProgramEditorPanel: React.FC<CncProgramEditorPanelProps> = ({
  open,
  onClose,
  workUid,
  selectedProgram,
  onLoadProgram,
  onSaveProgram,
  readOnly = false,
}) => {
  const { ensureCncWriteAllowed, PinModal } = useCncWriteGuard();
  const { token } = useAuthStore();
  const editorRef = React.useRef<any | null>(null);
  const diffOriginalRef = React.useRef<any | null>(null);
  const loadedProgramKeyRef = React.useRef<string | null>(null);
  const loadedSummaryKeyRef = React.useRef<string | null>(null);
  const [code, setCode] = React.useState("");
  const [originalCode, setOriginalCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "saved" | "error"
  >("idle");
  const [showDiff, setShowDiff] = React.useState(false);
  const [saveAsMode, setSaveAsMode] = React.useState(false);
  const [saveAsName, setSaveAsName] = React.useState("");
  const [saveAsNumber, setSaveAsNumber] = React.useState<string>("");
  const [wordWrap, setWordWrap] = React.useState(true);
  const [isMobile, setIsMobile] = React.useState(false);
  const [implantInfo, setImplantInfo] = React.useState<{
    tooth: string | null;
    maxDiameter: number | null;
  }>({ tooth: null, maxDiameter: null });

  const visible = open && !!selectedProgram;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  React.useEffect(() => {
    if (!visible) return;

    const programKey = String(
      selectedProgram?.id ||
        selectedProgram?._id ||
        selectedProgram?.bridgePath ||
        selectedProgram?.bridge_store_path ||
        selectedProgram?.path ||
        selectedProgram?.name ||
        selectedProgram?.programNo ||
        selectedProgram?.no ||
        "",
    ).trim();

    if (!programKey) return;
    if (loadedProgramKeyRef.current === programKey) return;
    loadedProgramKeyRef.current = programKey;

    setError(null);
    setSaveStatus("idle");
    setShowDiff(!isMobile);
    setSaveAsMode(false);
    setImplantInfo({ tooth: null, maxDiameter: null });
    // 새 프로그램을 열기 전에 기존 내용을 초기화하여, 로드 실패 시 이전 코드가 남지 않도록 한다.
    setCode("");
    setOriginalCode("");
    setLoading(true);
    Promise.resolve()
      .then(async () => {
        if (!selectedProgram) return;
        const text = await onLoadProgram(selectedProgram);
        setCode(text ?? "");
        setOriginalCode(text ?? "");
      })
      .catch((e: any) => {
        setError(e?.message ?? "프로그램 로드 중 오류");
        // 로드 중 에러가 발생하면 내용은 비워둔다.
        setCode("");
        setOriginalCode("");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [visible, workUid, selectedProgram, onLoadProgram, isMobile]);

  React.useEffect(() => {
    if (!visible) return;
    const requestId = String(selectedProgram?.requestId || "").trim();
    if (!requestId) return;
    if (!token) return;

    const key = `requestId:${requestId}`;
    if (loadedSummaryKeyRef.current === key) return;
    loadedSummaryKeyRef.current = key;
    setImplantInfo({ tooth: null, maxDiameter: null });

    fetch(`/api/requests/by-request/${encodeURIComponent(requestId)}/summary`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((body) => ({ res, body })),
      )
      .then(({ res, body }) => {
        if (!res.ok || body?.success === false) return;
        const data = body?.data ?? {};
        const tooth =
          typeof data?.tooth === "string" ? String(data.tooth).trim() : null;
        const maxDiameter =
          typeof data?.maxDiameter === "number" &&
          Number.isFinite(data.maxDiameter) &&
          data.maxDiameter > 0
            ? data.maxDiameter
            : null;
        setImplantInfo({ tooth: tooth || null, maxDiameter });
      })
      .catch(() => {
        // no-op
      });
  }, [visible, selectedProgram?.requestId, token]);

  React.useEffect(() => {
    if (visible) return;
    loadedProgramKeyRef.current = null;
    loadedSummaryKeyRef.current = null;
  }, [visible]);

  React.useEffect(() => {
    // 단일 편집기 모드에서 포커스 아웃 시 최신 내용을 state에 반영
    if (!showDiff && editorRef.current) {
      try {
        const value = editorRef.current.getValue?.();
        if (typeof value === "string") {
          setCode(value);
        }
      } catch {
        // no-op
      }
    }
  }, [showDiff]);

  React.useEffect(() => {
    if (!showDiff) return;
    editorRef.current?.updateOptions?.({ readOnly });
    diffOriginalRef.current?.updateOptions?.({ readOnly: true });
  }, [readOnly, showDiff]);

  if (!visible) return <>{PinModal}</>;

  const maybeSave = async () => {
    if (readOnly) return;
    if (!selectedProgram) return;
    if (loading) return;
    if (code === originalCode) return;
    await handleSave();
  };

  const handleRevertToOriginal = () => {
    if (loading) return;
    setError(null);
    setSaveStatus("idle");
    setCode(originalCode);
    try {
      editorRef.current?.setValue?.(originalCode ?? "");
    } catch {
      // no-op
    }
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!selectedProgram) return;
    setError(null);
    setSaveStatus("idle");

    // 브리지 서버에서 연 프로그램은 CNC 보호 PIN 없이 브리지에만 저장한다.
    if (selectedProgram.source === "bridge") {
      const path = selectedProgram.bridgePath || selectedProgram.name || "";
      if (!path) return;
      setLoading(true);
      try {
        const res = await fetch("/api/bridge-store/file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content: code }),
        });
        if (!res.ok) {
          throw new Error("브리지 서버 저장 실패");
        }
        setOriginalCode(code);
        setSaveStatus("saved");
      } catch (e: any) {
        setError(e?.message ?? "브리지 서버 저장 중 오류");
        setSaveStatus("error");
      } finally {
        setLoading(false);
      }
      return;
    }

    const ok = await ensureCncWriteAllowed();
    if (!ok) return;
    setLoading(true);
    try {
      await onSaveProgram(selectedProgram, code);
      setOriginalCode(code);
      setSaveStatus("saved");
    } catch (e: any) {
      setError(e?.message ?? "프로그램 저장 중 오류");
      setSaveStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIncrement = async () => {
    if (readOnly) return;
    if (!selectedProgram) return;
    // 브리지 소스인 경우에는 번호증가 저장은 지원하지 않는다.
    if (selectedProgram.source === "bridge") return;
    setError(null);
    setSaveStatus("idle");
    const ok = await ensureCncWriteAllowed();
    if (!ok) return;
    setLoading(true);
    try {
      await onSaveProgram(selectedProgram, code, {
        isNew: true,
        autoIncrementProgramNo: true,
      } as any);
      setOriginalCode(code);
      setSaveStatus("saved");
    } catch (e: any) {
      setError(e?.message ?? "프로그램 저장 중 오류");
      setSaveStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAs = async () => {
    if (readOnly) return;
    if (!selectedProgram) return;
    // 브리지 소스인 경우에는 이름변경 저장은 지원하지 않는다.
    if (selectedProgram.source === "bridge") return;
    const trimmedName = saveAsName.trim();
    const num = saveAsNumber.trim();
    const programNoOverride = num ? Number(num) : undefined;

    setError(null);
    setSaveStatus("idle");
    const ok = await ensureCncWriteAllowed();
    if (!ok) return;
    setLoading(true);
    try {
      await onSaveProgram(selectedProgram, code, {
        isNew: true,
        nameOverride: trimmedName || undefined,
        programNoOverride:
          typeof programNoOverride === "number" &&
          !Number.isNaN(programNoOverride)
            ? programNoOverride
            : undefined,
      });
      setSaveStatus("saved");
      setSaveAsMode(false);
    } catch (e: any) {
      setError(e?.message ?? "다른 이름으로 저장 중 오류");
      setSaveStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const name =
    selectedProgram?.originalFileName ??
    selectedProgram?.programName ??
    selectedProgram?.name ??
    `#${selectedProgram?.programNo ?? selectedProgram?.no ?? "-"}`;

  const infoText = (() => {
    const parts: string[] = [];
    if (implantInfo.tooth) parts.push(`치아번호 ${implantInfo.tooth}`);
    if (implantInfo.maxDiameter != null) {
      parts.push(`최대직경 ${implantInfo.maxDiameter.toFixed(3)}`);
    }
    return parts.join(" • ");
  })();

  const handleEditorMount = (editor: any, monaco: any) => {
    if (!editor || !monaco) return;
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void handleSave();
    });

    // Auto-save on blur removed - only save on explicit SAVE button click or Ctrl+S
  };

  const isBridgeSource = selectedProgram?.source === "bridge";

  return (
    <>
      {!isBridgeSource && PinModal}
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="w-full max-w-6xl h-[75vh] min-h-[360px] bg-white flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="relative px-4 py-3 flex items-center justify-between border-b border-slate-800 bg-slate-900 text-slate-50">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm leading-5 break-all">
                  {name}
                </div>
                {!!infoText && (
                  <div className="text-[12px] font-extrabold text-slate-200 truncate">
                    {infoText}
                  </div>
                )}
              </div>
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-400/40 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                  저장됨
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-100">
              <button
                type="button"
                onClick={handleRevertToOriginal}
                disabled={code === originalCode || loading}
                className="h-8 px-2 flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                aria-label="원본으로 되돌리기"
                title="원본으로"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={loading || readOnly}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
                aria-label="저장"
                title={readOnly ? "읽기 전용" : "저장"}
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700"
                aria-label="닫기"
                title="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          {error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}
          <div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col gap-3 bg-gradient-to-b from-slate-50 via-white to-white">
            <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-950">
              {showDiff && (
                <div className="pointer-events-none absolute inset-0 grid grid-cols-2">
                  <div className="bg-slate-950/90" />
                  <div className="bg-slate-800/80" />
                </div>
              )}
              <div className="relative h-full">
                {showDiff ? (
                  <DiffEditor
                    height="100%"
                    original={originalCode}
                    modified={code}
                    options={{
                      fontSize: 12,
                      renderSideBySide: true,
                      readOnly,
                      originalEditable: false,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: wordWrap ? "on" : "off",
                      automaticLayout: true,
                    }}
                    language="plaintext"
                    theme="vs-dark"
                    onMount={(editor) => {
                      const modified = editor.getModifiedEditor();
                      const original = editor.getOriginalEditor();
                      editorRef.current = modified;
                      diffOriginalRef.current = original;
                      modified.onDidChangeModelContent(() => {
                        const value = modified.getValue();
                        if (typeof value === "string") {
                          setCode(value);
                        }
                      });

                      // Auto-save on blur removed - only save on explicit SAVE button click or Ctrl+S
                    }}
                  />
                ) : (
                  <Editor
                    height="100%"
                    defaultLanguage="plaintext"
                    theme="vs-dark"
                    value={code}
                    onChange={(value) => {
                      if (readOnly) return;
                      setCode(value ?? "");
                    }}
                    onMount={handleEditorMount}
                    options={{
                      fontSize: 12,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: wordWrap ? "on" : "off",
                      readOnly,
                    }}
                  />
                )}
              </div>
            </div>
            {/* Save As 모달은 MultiActionDialog 로 분리 */}
          </div>
        </div>
      </div>

      <MultiActionDialog
        open={saveAsMode}
        title="다른 이름으로 저장"
        description={
          <div className="space-y-3 text-sm">
            <input
              type="number"
              value={saveAsNumber}
              onChange={(e) => setSaveAsNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="네자리 숫자"
            />
          </div>
        }
        actions={[
          {
            label: "취소",
            variant: "ghost",
            disabled: loading,
            onClick: () => {
              setSaveAsMode(false);
            },
          },
          {
            label: loading ? "처리 중..." : "적용",
            variant: "primary",
            disabled: loading,
            onClick: () => {
              void handleSaveAs();
              setSaveAsMode(false);
            },
          },
        ]}
      />
    </>
  );
};
