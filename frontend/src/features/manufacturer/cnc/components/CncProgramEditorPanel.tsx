import React from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { useCncWriteGuard } from "@/features/manufacturer/cnc/hooks/useCncWriteGuard";
import { MultiActionDialog } from "@/components/MultiActionDialog";

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
    }
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
  const editorRef = React.useRef<any | null>(null);
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

  const visible = open && !!workUid && !!selectedProgram;

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
    setError(null);
    setSaveStatus("idle");
    setShowDiff(!isMobile);
    setSaveAsMode(false);
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
    // Diff 모드에서 일반 모드로 돌아올 때, 수정된 내용을 code 상태에 반영
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

  if (!visible) return <>{PinModal}</>;

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
    selectedProgram?.programName ??
    selectedProgram?.name ??
    `#${selectedProgram?.programNo ?? selectedProgram?.no ?? "-"}`;

  const handleEditorMount = (editor: any, monaco: any) => {
    if (!editor || !monaco) return;
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void handleSave();
    });
  };

  const isBridgeSource = selectedProgram?.source === "bridge";

  return (
    <>
      {!isBridgeSource && PinModal}
      <div className="fixed inset-0 z-[60] bg-black/60">
        <div className="absolute inset-0 bg-white flex flex-col">
          <header className="relative h-12 px-4 flex items-center justify-between border-b border-gray-200 bg-slate-900 text-slate-50 text-sm">
            <div className="flex items-center gap-4 min-w-0">
              <span className="font-semibold truncate max-w-xs">{name}</span>
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-400/40 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                  저장됨
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-100">
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || readOnly}
                className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-xs font-medium text-white"
              >
                {loading ? "저장 중..." : "덮어쓰기"}
              </button>
              {!isBridgeSource && (
                <>
                  <button
                    type="button"
                    onClick={() => setSaveAsMode(true)}
                    disabled={readOnly}
                    className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-medium disabled:opacity-50"
                  >
                    이름변경 저장
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveIncrement}
                    disabled={loading || readOnly}
                    className="px-2 py-1 rounded bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-xs font-medium text-white"
                  >
                    번호증가 저장
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                className="h-7 w-7 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
              >
                ×
              </button>
            </div>
          </header>
          {error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}
          <div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col gap-3">
            <div className="flex-1 min-h-0 border border-gray-200 rounded-lg overflow-hidden">
              {showDiff ? (
                <DiffEditor
                  height="100%"
                  original={originalCode}
                  modified={code}
                  options={{
                    fontSize: 12,
                    renderSideBySide: true,
                    readOnly,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: wordWrap ? "on" : "off",
                  }}
                  language="plaintext"
                  theme="vs-dark"
                  onMount={(editor) => {
                    const modified = editor.getModifiedEditor();
                    editorRef.current = modified;
                    modified.onDidChangeModelContent(() => {
                      const value = modified.getValue();
                      if (typeof value === "string") {
                        setCode(value);
                      }
                    });
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
            label: loading ? "저장 중..." : "저장",
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
