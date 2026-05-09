import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { useStlMetadata } from "@/features/requests/hooks/useStlMetadata";
import { useAuthStore } from "@/store/useAuthStore";
import { formatKstDateTimeToKo } from "@/shared/date/kst";

type InspectionRow = {
  label: string;
  referenceValue: string;
  criterion: string;
  instrument: string;
  measuredValue: string;
  judgment: "적합" | "부적합" | "";
};

export type SelfInspectionReportItem = {
  requestId: string | null;
  requestMongoId?: string | null;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  lotNumber?: string;
  completedAt?: string | null;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SelfInspectionReportItem | null;
  queueInfo?: { current: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
};

const DEFAULT_ROWS: InspectionRow[] = [
  {
    label: "각인",
    referenceValue: "-",
    criterion: "식별",
    instrument: "현미경",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "기준직경",
    referenceValue: "-",
    criterion: "+0.02/-0.01",
    instrument: "비전",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "전장",
    referenceValue: "-",
    criterion: "±0.05",
    instrument: "비전",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "최대직경",
    referenceValue: "-",
    criterion: "±0.05",
    instrument: "비전",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "내경깊이",
    referenceValue: "적합",
    criterion: "±0.05",
    instrument: "G20게이지",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "헥사치수",
    referenceValue: "2.485",
    criterion: "±0.005",
    instrument: "마이크로미터",
    measuredValue: "",
    judgment: "적합",
  },
];

export function SelfInspectionReportModal({
  open,
  onOpenChange,
  item,
  queueInfo,
  onPrev,
  onNext,
}: Props) {
  const { token, user } = useAuthStore();
  const [stlFile, setStlFile] = useState<File | null>(null);
  const [stlLoading, setStlLoading] = useState(false);
  const [resolvedMongoId, setResolvedMongoId] = useState<string | null>(null);
  const [finishLinePoints, setFinishLinePoints] = useState<number[][] | null>(
    null,
  );
  const [rows, setRows] = useState<InspectionRow[]>(DEFAULT_ROWS);
  const [overallJudgment, setOverallJudgment] = useState<
    "합격" | "불합격" | ""
  >("");
  const [inspector, setInspector] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [inspectionAt, setInspectionAt] = useState<string | null>(null);

  const requestId = item?.requestId ?? null;
  const lotShortCode = String(item?.lotNumber || "")
    .replace(/^CA(P)?/i, "")
    .slice(-3)
    .toUpperCase();

  const { metadata, loading: metaLoading } = useStlMetadata(
    requestId || undefined,
  );

  // Sync mongoId from item or from resolved lookup
  useEffect(() => {
    if (!open) return;
    setResolvedMongoId(String(item?.requestMongoId || "").trim() || null);
  }, [open, item]);

  // Reset form state and load existing self-inspection
  useEffect(() => {
    if (!open || !requestId) return;
    setStlFile(null);
    setFinishLinePoints(null);
    setOverallJudgment("");
    setInspector(user?.name || "");
    setConfirmed(false);
    setRequestedAt(null);
    setInspectionAt(new Date().toISOString());

    const loadExisting = async () => {
      try {
        const res = await fetch(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/self-inspection`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        const data = body?.data;
        if (data?.confirmed) {
          if (Array.isArray(data.rows) && data.rows.length > 0)
            setRows(data.rows);
          if (data.overallJudgment) setOverallJudgment(data.overallJudgment);
          if (data.confirmedBy) setInspector(data.confirmedBy);
          setConfirmed(true);
        }
      } catch {
        // ignore
      }
    };
    void loadExisting();
  }, [open, requestId, token, user?.name]);

  // Populate rows from metadata + lot info (skip if already confirmed/loaded from DB)
  useEffect(() => {
    if (confirmed) return;
    const fmt = (v: number | undefined, dec = 2) =>
      v != null ? String(Number(v).toFixed(dec)) : "-";

    setRows([
      {
        label: "각인",
        referenceValue: lotShortCode || "-",
        criterion: "식별",
        instrument: "현미경",
        measuredValue: lotShortCode || "",
        judgment: "적합",
      },
      {
        label: "기준직경",
        referenceValue: fmt(metadata?.connectionDiameter),
        criterion: "+0.02/-0.01",
        instrument: "비전",
        measuredValue:
          metadata?.connectionDiameter != null
            ? fmt(metadata.connectionDiameter)
            : "",
        judgment: "적합",
      },
      {
        label: "전장",
        referenceValue: fmt(metadata?.totalLength),
        criterion: "±0.05",
        instrument: "비전",
        measuredValue:
          metadata?.totalLength != null ? fmt(metadata.totalLength) : "",
        judgment: "적합",
      },
      {
        label: "최대직경",
        referenceValue: fmt(metadata?.maxDiameter),
        criterion: "±0.05",
        instrument: "비전",
        measuredValue:
          metadata?.maxDiameter != null ? fmt(metadata.maxDiameter) : "",
        judgment: "적합",
      },
      {
        label: "내경깊이",
        referenceValue: "적합",
        criterion: "±0.05",
        instrument: "G20게이지",
        measuredValue: "",
        judgment: "적합",
      },
      {
        label: "헥사치수",
        referenceValue: "2.485",
        criterion: "±0.005",
        instrument: "마이크로미터",
        measuredValue: "",
        judgment: "적합",
      },
    ]);
  }, [metadata, lotShortCode, confirmed]);

  // Auto-compute overall judgment when all rows have a judgment
  useEffect(() => {
    const allHaveJudgment = rows.every((r) => r.judgment !== "");
    if (!allHaveJudgment) {
      setOverallJudgment("");
      return;
    }
    setOverallJudgment(
      rows.every((r) => r.judgment === "적합") ? "합격" : "불합격",
    );
  }, [rows]);

  // Load STL file (CAM → original fallback)
  useEffect(() => {
    if (!open || !requestId || !token) return;
    let cancelled = false;

    const load = async () => {
      setStlLoading(true);
      setStlFile(null);
      try {
        // Step 1: fetch full request summary to get _id, finishLine, cam filename
        const res = await fetch(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/summary`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const body = await res.json().catch(() => ({}));
        const data = body?.data;
        let mid = String(data?._id || resolvedMongoId || "").trim() || null;
        if (!cancelled && mid) setResolvedMongoId(mid);
        if (!cancelled && data?.createdAt)
          setRequestedAt(String(data.createdAt));
        let camFileName = `${requestId}.filled.stl`;
        if (!cancelled) {
          const pts = data?.caseInfos?.finishLine?.points;
          if (Array.isArray(pts) && pts.length >= 2) setFinishLinePoints(pts);
          const rawCamName =
            data?.caseInfos?.camFile?.filePath ||
            data?.caseInfos?.camFile?.originalName ||
            null;
          if (rawCamName)
            camFileName = rawCamName.split("/").pop() || camFileName;
        }
        if (!mid || cancelled) return;

        // Step 2: get signed URL (cam first, then original)
        let signedUrl = "";
        let isCamFile = false;
        const camRes = await fetch(`/api/requests/${mid}/cam-file-url`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (camRes.ok) {
          const b = await camRes.json().catch(() => ({}));
          signedUrl = String(b?.data?.url || "").trim();
          if (signedUrl) isCamFile = true;
        }
        if (!signedUrl) {
          const origRes = await fetch(
            `/api/requests/${mid}/original-file-url`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (origRes.ok) {
            const b = await origRes.json().catch(() => ({}));
            signedUrl = String(b?.data?.url || "").trim();
          }
        }
        if (!signedUrl || cancelled) return;

        // Step 3: download blob
        // Use actual cam filename so StlPreviewViewer overlay triggers on 'filled'
        const filename = isCamFile
          ? camFileName.toLowerCase().includes("filled")
            ? camFileName
            : camFileName.replace(/\.stl$/i, ".filled.stl")
          : `${requestId}.stl`;
        const blobRes = await fetch(signedUrl);
        if (!blobRes.ok || cancelled) return;
        const blob = await blobRes.blob();
        if (!cancelled) {
          setStlFile(new File([blob], filename, { type: "model/stl" }));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setStlLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, requestId, token]); // resolvedMongoId intentionally omitted — only used as fallback inside

  const updateRow = (
    idx: number,
    field: "measuredValue" | "judgment",
    value: string,
  ) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const productionDateStr = item?.completedAt
    ? formatKstDateTimeToKo(new Date(item.completedAt))
    : "-";

  const inspectionDateStr = inspectionAt
    ? formatKstDateTimeToKo(new Date(inspectionAt))
    : "-";

  const requestedAtStr = requestedAt
    ? formatKstDateTimeToKo(new Date(requestedAt))
    : "-";

  const implantLabel =
    [
      item?.implantManufacturer,
      item?.implantBrand,
      item?.implantFamily,
      item?.implantType,
    ]
      .filter(Boolean)
      .join(" / ") || "-";

  const infoRows = [
    { label: "접수일시", value: requestedAtStr },
    { label: "생산일시", value: productionDateStr },
    {
      label: "치과/환자/치아",
      value:
        [item?.clinicName, item?.patientName, item?.tooth]
          .filter(Boolean)
          .join(" / ") || "-",
    },
    { label: "임플란트", value: implantLabel },
    { label: "모델명", value: requestId || "-" },
    { label: "로트번호", value: item?.lotNumber || "-" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-5xl overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-200">
          <DialogTitle className="text-base font-extrabold">
            자주검사성적서
          </DialogTitle>
        </DialogHeader>

        <div className="flex overflow-hidden">
          {/* ── Left: STL Preview ── */}
          <div className="w-[42%] shrink-0 border-r border-slate-200 flex flex-col bg-slate-50 overflow-hidden">
            <div className="flex-1 min-h-0">
              {stlLoading || metaLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  STL 로딩 중…
                </div>
              ) : stlFile ? (
                <StlPreviewViewer
                  file={stlFile}
                  requestId={requestId || undefined}
                  showOverlay={true}
                  metadata={metadata}
                  finishLinePoints={finishLinePoints}
                  className="h-full w-full min-h-[280px]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  STL 파일 없음
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Inspection Form ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 max-h-[calc(90vh-57px)]">
            <h2 className="text-lg font-extrabold text-center border-b-2 border-slate-800 pb-2 mb-3">
              자주검사 성적서
            </h2>

            {/* Header info grid */}
            <div className="border border-slate-300 rounded-lg overflow-hidden mb-4 text-[13px]">
              {infoRows.map((r, i) => (
                <div
                  key={r.label}
                  className={`flex items-center gap-3 px-3 py-1.5 ${i < infoRows.length - 1 ? "border-b border-slate-200" : ""}`}
                >
                  <span className="w-28 shrink-0 font-semibold text-slate-500">
                    {r.label}
                  </span>
                  <span className="text-slate-800">{r.value}</span>
                </div>
              ))}
            </div>

            {/* Inspection table */}
            <table className="w-full text-xs border-collapse border border-slate-300 mb-4">
              <thead>
                <tr className="bg-slate-100 text-center">
                  <th className="border border-slate-300 px-2 py-1.5">항목</th>
                  <th className="border border-slate-300 px-2 py-1.5">
                    기준값
                  </th>
                  <th className="border border-slate-300 px-2 py-1.5">
                    합격기준
                  </th>
                  <th className="border border-slate-300 px-2 py-1.5">
                    측정기
                  </th>
                  <th className="border border-slate-300 px-2 py-1.5 bg-amber-50">
                    측정값
                  </th>
                  <th className="border border-slate-300 px-2 py-1.5 bg-amber-50">
                    판단
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.label}>
                    <td className="border border-slate-300 px-2 py-1 text-center font-semibold">
                      {row.label}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {row.referenceValue}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {row.criterion}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {row.instrument}
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-amber-50">
                      <input
                        type="text"
                        className="w-full text-center bg-transparent outline-none text-slate-900 font-semibold placeholder:text-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
                        value={row.measuredValue}
                        onChange={(e) =>
                          updateRow(idx, "measuredValue", e.target.value)
                        }
                        placeholder="-"
                        disabled={confirmed}
                      />
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 bg-amber-50">
                      <select
                        className="w-full text-center bg-transparent outline-none text-slate-900 font-semibold cursor-pointer disabled:cursor-not-allowed"
                        value={row.judgment}
                        onChange={(e) =>
                          updateRow(
                            idx,
                            "judgment",
                            e.target.value as InspectionRow["judgment"],
                          )
                        }
                        disabled={confirmed}
                      >
                        <option value="">-</option>
                        <option value="적합">적합</option>
                        <option value="부적합">부적합</option>
                      </select>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-extrabold text-[13px]">
                  <td
                    colSpan={4}
                    className="border border-slate-300 px-2 py-1.5 text-center"
                  >
                    판정
                  </td>
                  <td
                    colSpan={2}
                    className={`border border-slate-300 px-2 py-1.5 text-center font-extrabold ${
                      overallJudgment === "합격"
                        ? "text-emerald-600 bg-emerald-50"
                        : overallJudgment === "불합격"
                          ? "text-red-600 bg-red-50"
                          : "text-slate-400 bg-amber-50"
                    }`}
                  >
                    {overallJudgment || "-"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Footer */}
            <div className="flex items-start gap-3">
              <div className="w-120 shrink-0 border border-slate-300 rounded-lg overflow-hidden text-[13px]">
                <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-200">
                  <span className="w-20 shrink-0 font-semibold text-slate-500">
                    검사일시
                  </span>
                  <span className="text-slate-800 text-xs">
                    {inspectionDateStr}
                  </span>
                </div>
                <div className="flex items-center gap-3 px-3 py-1.5">
                  <span className="w-20 shrink-0 font-semibold text-slate-500">
                    검사자
                  </span>
                  <span className="text-slate-800">{inspector || "-"}</span>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-end gap-2">
                {!confirmed && (
                  <p className="text-[11px] text-red-600 text-right">
                    확정 후 수정할 수 없습니다
                  </p>
                )}
                {confirmed && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-center w-full">
                    성적서가 확정되었습니다. 더 이상 수정할 수 없습니다.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!onPrev}
                    onClick={onPrev}
                    className="px-3 py-2 rounded-lg font-extrabold text-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="이전"
                  >
                    ←
                  </button>
                  {queueInfo && (
                    <p className="text-[11px] font-semibold text-slate-500">
                      {queueInfo.current} / {queueInfo.total}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={!onNext}
                    onClick={onNext}
                    className="px-3 py-2 rounded-lg font-extrabold text-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="다음"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    disabled={confirmed || saving || !requestId}
                    onClick={async () => {
                      if (!requestId) return;
                      setSaving(true);
                      try {
                        const res = await fetch(
                          `/api/requests/by-request/${encodeURIComponent(requestId)}/self-inspection`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                              rows,
                              overallJudgment,
                              confirmedBy: inspector,
                            }),
                          },
                        );
                        if (res.ok) setConfirmed(true);
                      } catch {
                        // ignore
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className={`px-6 py-2 rounded-lg font-bold text-sm transition ${
                      confirmed
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : saving
                          ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                          : "bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900"
                    }`}
                  >
                    {confirmed ? "✓ 확정됨" : saving ? "저장 중…" : "확정"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
