import { type ChangeEvent, useRef, useState } from "react";
import { loadStlToMesh, useThreeCanvas } from "./lib/threeStl";

type ScriptAction = {
  label: string;
  endpointPath: string;
};

type ScriptSubgroup = {
  label: string;
  actions: ScriptAction[];
};

type ScriptGroup = {
  label: string;
  subgroups: ScriptSubgroup[];
};

const SCRIPT_TREE: ScriptGroup[] = [
  {
    label: "커스텀어벗",
    subgroups: [
      {
        label: "홀메꾸기",
        actions: [
          {
            label: "실행",
            endpointPath: "/api/rhino/custom-abutment/hole-fill",
          },
        ],
      },
    ],
  },
];

function buildComputeUrl(path: string): string {
  const base =
    (import.meta.env.VITE_RHINO_COMPUTE_URL as string | undefined) ||
    "http://127.0.0.1:8000";
  return base.replace(/\/$/, "") + path;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { setMesh, disposeMesh, resize, fitToObject } =
    useThreeCanvas(canvasRef);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  async function onLoadLocalFile(f: File) {
    setError(null);
    setResultMessage(null);
    setFile(f);
    disposeMesh();
    const mesh = await loadStlToMesh(f);
    setMesh(mesh);
    resize();
    fitToObject(mesh);
  }

  async function runScript(action: ScriptAction) {
    if (!file) {
      setError("먼저 STL 파일을 로드하세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setResultMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(buildComputeUrl(action.endpointPath), {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const outFile = new File(
        [blob],
        file.name.replace(/\.stl$/i, ".cam.stl"),
        {
          type: "application/sla",
        }
      );

      await onLoadLocalFile(outFile);
      setResultMessage(`완료: ${outFile.name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResultMessage("실패");
    } finally {
      setBusy(false);
    }
  }

  function downloadCurrent() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-3">
        <div className="font-semibold">Rhino Web</div>
        <div className="text-sm text-gray-600">
          파일 로드 · 스크립트 호출 · 저장
        </div>
        <div className="flex-1" />
        <button
          className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm disabled:opacity-50"
          onClick={downloadCurrent}
          disabled={!file}
        >
          저장
        </button>
      </header>

      <div className="flex-1 grid grid-cols-12 min-h-0">
        <aside className="col-span-3 border-r p-4 overflow-auto">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">파일</div>
              <input
                type="file"
                accept=".stl"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0];
                  if (f) void onLoadLocalFile(f);
                }}
              />
              <div className="mt-2 text-xs text-gray-600 break-all">
                {file ? file.name : "(선택된 파일 없음)"}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">스크립트</div>
              <div className="space-y-3">
                {SCRIPT_TREE.map((group) => (
                  <details key={group.label} open>
                    <summary className="cursor-pointer text-xs font-semibold text-gray-700 select-none">
                      {group.label}
                    </summary>
                    <div className="mt-2 space-y-2 pl-3">
                      {group.subgroups.map((sub) => (
                        <details key={sub.label}>
                          <summary className="cursor-pointer text-xs font-medium text-gray-800 select-none">
                            {sub.label}
                          </summary>
                          <div className="mt-2 space-y-2 pl-3">
                            {sub.actions.map((action) => (
                              <button
                                key={action.label}
                                className="w-full px-3 py-2 rounded border text-sm text-left hover:bg-gray-50 disabled:opacity-50"
                                onClick={() => void runScript(action)}
                                disabled={!file || busy}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {error ? (
              <div className="text-sm text-red-600 whitespace-pre-wrap">
                {error}
              </div>
            ) : null}
            {resultMessage ? (
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {resultMessage}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="col-span-9 min-h-0 relative">
          <canvas ref={canvasRef} className="w-full h-full block" />
          {busy ? (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-gray-300 border-t-gray-900 animate-spin" />
                <div className="text-sm text-gray-800">처리 중...</div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
