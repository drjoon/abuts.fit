import React from "react";
import Editor from "@monaco-editor/react";
import { useAuthStore } from "@/store/useAuthStore";

interface CncSimpleProgramEditorModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  selectedProgram: any | null;
  onLoadProgram: (prog: any) => Promise<string>;
  onSaveProgram: (prog: any, code: string) => Promise<void>;
  readOnly?: boolean;
}

export const CncSimpleProgramEditorModal: React.FC<
  CncSimpleProgramEditorModalProps
> = ({
  open,
  onClose,
  title,
  selectedProgram,
  onLoadProgram,
  onSaveProgram,
  readOnly = false,
}) => {
  const { token } = useAuthStore();
  const editorRef = React.useRef<any | null>(null);
  const loadedProgramIdRef = React.useRef<string | null>(null);
  const loadedSummaryKeyRef = React.useRef<string | null>(null);

  const [code, setCode] = React.useState("");
  const [originalCode, setOriginalCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [implantInfo, setImplantInfo] = React.useState<{
    tooth: string | null;
    maxDiameter: number | null;
  }>({ tooth: null, maxDiameter: null });

  const visible = open && !!selectedProgram;

  React.useEffect(() => {
    if (!visible) return;

    const programId = selectedProgram?.id || selectedProgram?._id;
    if (!programId) return;

    // Skip if already loaded this program
    if (loadedProgramIdRef.current === programId) return;

    loadedProgramIdRef.current = programId;
    loadedSummaryKeyRef.current = null;
    setError(null);
    setLoading(true);
    setSaving(false);
    setCode("");
    setOriginalCode("");
    setImplantInfo({ tooth: null, maxDiameter: null });

    onLoadProgram(selectedProgram)
      .then((text) => {
        setCode(text ?? "");
        setOriginalCode(text ?? "");
      })
      .catch((e: any) => {
        setError(e?.message ?? "프로그램 로드 중 오류");
        setCode("");
        setOriginalCode("");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [visible, selectedProgram?.id || selectedProgram?._id, onLoadProgram]);

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

  const commitSave = React.useCallback(() => {
    if (!selectedProgram) return;
    if (readOnly) return;
    if (loading) return;
    if (saving) return;
    if (code === originalCode) return;

    setError(null);
    setSaving(true);
    onSaveProgram(selectedProgram, code)
      .then(() => {
        setOriginalCode(code);
      })
      .catch((e: any) => {
        setError(e?.message ?? "프로그램 저장 중 오류");
      })
      .finally(() => {
        setSaving(false);
      });
  }, [
    selectedProgram,
    readOnly,
    loading,
    saving,
    code,
    originalCode,
    onSaveProgram,
  ]);

  React.useEffect(() => {
    if (visible) return;
    // Reset loaded program ID when modal closes
    loadedProgramIdRef.current = null;
    loadedSummaryKeyRef.current = null;
  }, [visible]);

  const infoText = (() => {
    const parts: string[] = [];
    if (implantInfo.tooth) parts.push(`치아번호 ${implantInfo.tooth}`);
    if (implantInfo.maxDiameter != null) {
      parts.push(`최대직경 ${implantInfo.maxDiameter.toFixed(3)}`);
    }
    return parts.join(" • ");
  })();

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(1100px,calc(100vw-2rem))] max-h-[80vh] min-h-[60vh] bg-white rounded-3xl shadow-[0_30px_80px_rgba(15,23,42,0.35)] border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative px-5 py-4 border-b border-slate-100">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-violet-50" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-extrabold text-slate-900">
                {title || ""}
              </div>
              {!!infoText && (
                <div className="mt-0.5 text-[11px] font-semibold text-slate-600 truncate">
                  {infoText}
                </div>
              )}
              {!readOnly && saving && (
                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  저장 중...
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full bg-white/80 border border-slate-200 text-slate-700 hover:bg-white"
              title="닫기"
            >
              ×
            </button>
          </div>
        </header>

        {error && (
          <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 p-4">
          <div className="h-full min-h-[380px] w-full rounded-2xl overflow-hidden border border-slate-200 bg-white">
            <Editor
              height="100%"
              defaultLanguage="plaintext"
              theme="vs"
              value={code}
              onChange={(value) => {
                if (readOnly) return;
                setCode(value ?? "");
              }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                try {
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                    () => {
                      commitSave();
                    },
                  );
                } catch {
                  // no-op
                }
                // Auto-save on blur removed - only save on explicit SAVE button click or Ctrl+S
              }}
              loading={
                <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
                  로딩 중...
                </div>
              }
              options={{
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                readOnly: readOnly || loading,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
