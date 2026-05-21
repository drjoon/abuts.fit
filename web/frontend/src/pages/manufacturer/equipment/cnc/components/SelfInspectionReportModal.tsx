import { useEffect, useRef, useState } from "react";
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
import { getFileBlob, setFileBlob } from "@/shared/files/stlIndexedDb";

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

type ConnectionSpec = {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  diameter?: number;
  l2?: number;
  hexSize?: number;
  internalGauge?: string;
  protrusionLength?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SelfInspectionReportItem | null;
  queueInfo?: { current: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
};

type InspectionSpecPreset = {
  manufacturer: string;
  brand: string;
  family: string;
  diameterRef: number;
  diameterCriterion: string;
  hexRef: number;
  hexCriterion: string;
  innerDepthRef?: number;
  innerGauge?: string;
};

const DEFAULT_INSTRUMENT_OPTIONS = [
  "현미경(AD-T-07)",
  "비전(AD-T-19)",
  "MICRO(AD-T-02)",
];

const DEFAULT_ROWS: InspectionRow[] = [
  {
    label: "각인",
    referenceValue: "-",
    criterion: "식별",
    instrument: "현미경(AD-T-07)",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "커넥션직경",
    referenceValue: "-",
    criterion: "-",
    instrument: "비전(AD-T-19)",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "L1",
    referenceValue: "-",
    criterion: "기준값1%이내",
    instrument: "비전(AD-T-19)",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "L2",
    referenceValue: "-",
    criterion: "기준값1%이내",
    instrument: "비전(AD-T-19)",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "최대직경",
    referenceValue: "-",
    criterion: "기준값1%이내",
    instrument: "비전(AD-T-19)",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "내경깊이",
    referenceValue: "적합",
    criterion: "±0.1",
    instrument: "비전(AD-T-19)",
    measuredValue: "",
    judgment: "적합",
  },
  {
    label: "헥스치수",
    referenceValue: "2.485",
    criterion: "-",
    instrument: "MICRO(AD-T-02)",
    measuredValue: "",
    judgment: "적합",
  },
];

const formatRange = (
  reference: number | undefined,
  plus: number,
  minus: number,
  decimals = 3,
) => {
  if (reference == null || Number.isNaN(Number(reference))) return "-";
  const max = (Number(reference) + plus).toFixed(decimals);
  const min = (Number(reference) - minus).toFixed(decimals);
  return `${max}~${min}`;
};

const SPEC_PRESETS: InspectionSpecPreset[] = [
  {
    manufacturer: "Osstem",
    brand: "TS3",
    family: "",
    diameterRef: 3.35,
    diameterCriterion: "3.34~3.37",
    hexRef: 2.485,
    hexCriterion: "2.490~2.482",
    innerDepthRef: 1.25,
    innerGauge: "G19",
  },
  {
    manufacturer: "Osstem",
    brand: "TS3",
    family: "",
    diameterRef: 2.6,
    diameterCriterion: "2.59~2.61",
    hexRef: 1.95,
    hexCriterion: "1.955~1.942",
  },
  {
    manufacturer: "Dentium",
    brand: "SuperLine2",
    family: "",
    diameterRef: 3.33,
    diameterCriterion: "3.35~3.32",
    hexRef: 2.495,
    hexCriterion: "2.500~2.492",
    innerDepthRef: 0.9,
    innerGauge: "G19",
  },
  {
    manufacturer: "NeoBiotech",
    brand: "IS",
    family: "",
    diameterRef: 3.35,
    diameterCriterion: "3.34~3.37",
    hexRef: 2.515,
    hexCriterion: "2.515~2.507",
    innerDepthRef: 1.08,
    innerGauge: "G19",
  },
  {
    manufacturer: "NeoBiotech",
    brand: "IS",
    family: "",
    diameterRef: 2.6,
    diameterCriterion: "2.59~2.61",
    hexRef: 1.95,
    hexCriterion: "1.955~1.947",
  },
  {
    manufacturer: "Dio",
    brand: "UF2",
    family: "",
    diameterRef: 3.35,
    diameterCriterion: "3.34~3.37",
    hexRef: 2.49,
    hexCriterion: "2.495~2.487",
    innerDepthRef: 1.0,
    innerGauge: "G19",
  },
  {
    manufacturer: "Dio",
    brand: "UF2",
    family: "",
    diameterRef: 2.3,
    diameterCriterion: "2.29~2.31",
    hexRef: 1.69,
    hexCriterion: "1.695~1.687",
  },
  {
    manufacturer: "Megagen",
    brand: "AnyOne",
    family: "",
    diameterRef: 3.3,
    diameterCriterion: "3.29~3.32",
    hexRef: 2.5,
    hexCriterion: "2.505~2.497",
    innerDepthRef: 1.35,
    innerGauge: "G19",
  },
  {
    manufacturer: "Megagen",
    brand: "AnyOne",
    family: "",
    diameterRef: 2.31,
    diameterCriterion: "2.30~2.32",
    hexRef: 1.705,
    hexCriterion: "1.710~1.702",
  },
  {
    manufacturer: "Dentis",
    brand: "SQ",
    family: "One-Q",
    diameterRef: 3.35,
    diameterCriterion: "3.34~3.37",
    hexRef: 2.49,
    hexCriterion: "2.495~2.487",
    innerDepthRef: 1.955,
    innerGauge: "G19",
  },
  {
    manufacturer: "Dentis",
    brand: "SQ",
    family: "One-Q",
    diameterRef: 2.8,
    diameterCriterion: "2.79~2.82",
    hexRef: 1.95,
    hexCriterion: "1.955~1.947",
  },
];

const norm = (v: string | undefined) =>
  String(v || "")
    .toLowerCase()
    .replace(/\s+/g, "");

const resolveSpecPreset = (
  spec: ConnectionSpec | null,
): InspectionSpecPreset | null => {
  if (!spec) return null;

  const manufacturer = norm(spec.manufacturer);
  const brand = norm(spec.brand);
  const family = norm(spec.family);
  const diameter = Number(spec.diameter);

  const candidates = SPEC_PRESETS.filter((row) => {
    const m = norm(row.manufacturer);
    const b = norm(row.brand);
    const f = norm(row.family);

    if (!manufacturer.includes(m)) return false;
    if (!brand.includes(b)) return false;
    if (f && !family.includes(f)) return false;
    return true;
  });

  if (!candidates.length) return null;
  if (!Number.isFinite(diameter)) return candidates[0];

  return [...candidates].sort(
    (a, b) =>
      Math.abs(Number(a.diameterRef) - diameter) -
      Math.abs(Number(b.diameterRef) - diameter),
  )[0];
};

export function SelfInspectionReportModal({
  open,
  onOpenChange,
  item,
  queueInfo,
  onPrev,
  onNext,
}: Props) {
  const { token, user } = useAuthStore();
  const reportRef = useRef<HTMLDivElement | null>(null);

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
  const [connectionSpec, setConnectionSpec] = useState<ConnectionSpec | null>(
    null,
  );
  const [summaryL1, setSummaryL1] = useState<number | null>(null);
  const [summaryTotalLength, setSummaryTotalLength] = useState<number | null>(
    null,
  );

  const [instrumentOptions, setInstrumentOptions] = useState<string[]>(
    DEFAULT_INSTRUMENT_OPTIONS,
  );
  const [showInstrumentManager, setShowInstrumentManager] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [instrumentDraft, setInstrumentDraft] = useState("");
  const [savingInstruments, setSavingInstruments] = useState(false);

  const requestId = item?.requestId ?? null;
  const lotShortCode = String(item?.lotNumber || "")
    .replace(/^CA(P)?/i, "")
    .slice(-3)
    .toUpperCase();

  const { metadata, loading: metaLoading } = useStlMetadata(
    requestId || undefined,
  );

  const persistInstrumentOptions = async (nextOptions: string[]) => {
    const sanitized = [
      ...new Set(nextOptions.map((v) => String(v).trim())),
    ].filter(Boolean);
    const payload = sanitized.length ? sanitized : DEFAULT_INSTRUMENT_OPTIONS;

    setSavingInstruments(true);
    try {
      const res = await fetch(`/api/requests/self-inspection/instruments`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ options: payload }),
      });
      if (!res.ok) return;

      const body = await res.json().catch(() => ({}));
      const saved = Array.isArray(body?.data)
        ? body.data.map((v: unknown) => String(v || "").trim()).filter(Boolean)
        : payload;
      setInstrumentOptions(saved.length ? saved : DEFAULT_INSTRUMENT_OPTIONS);
    } finally {
      setSavingInstruments(false);
    }
  };

  // Sync mongoId from item or from resolved lookup
  useEffect(() => {
    if (!open) return;
    setResolvedMongoId(String(item?.requestMongoId || "").trim() || null);
  }, [open, item]);

  // 장비 드롭다운 옵션 로드
  useEffect(() => {
    if (!open || !token) return;

    const loadInstrumentOptions = async () => {
      try {
        const res = await fetch(`/api/requests/self-inspection/instruments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        const options = Array.isArray(body?.data)
          ? body.data
              .map((v: unknown) => String(v || "").trim())
              .filter(Boolean)
          : [];

        setInstrumentOptions(
          options.length ? options : DEFAULT_INSTRUMENT_OPTIONS,
        );
      } catch {
        // ignore
      }
    };

    void loadInstrumentOptions();
  }, [open, token]);

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
    setConnectionSpec(null);
    setSummaryL1(null);
    setSummaryTotalLength(null);
    setShowInstrumentManager(false);

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
          if (Array.isArray(data.rows) && data.rows.length > 0) {
            setRows(data.rows);
            const rowInstruments = data.rows
              .map((r: InspectionRow) => String(r?.instrument || "").trim())
              .filter(Boolean);
            if (rowInstruments.length) {
              setInstrumentOptions((prev) => [
                ...new Set([...prev, ...rowInstruments]),
              ]);
            }
          }
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

  // requestId로 커넥션 스펙 조회 (seed 데이터 기반)
  useEffect(() => {
    if (!open || !requestId || !token) return;
    let cancelled = false;

    const loadConnectionSpec = async () => {
      try {
        const res = await fetch(
          `/api/requests/by-request/${encodeURIComponent(requestId)}/connection-spec`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        if (!cancelled) {
          setConnectionSpec((body?.data as ConnectionSpec) || null);
        }
      } catch {
        // ignore
      }
    };

    void loadConnectionSpec();
    return () => {
      cancelled = true;
    };
  }, [open, requestId, token]);

  // Populate rows from metadata + lot info + seeded connection spec (skip if already confirmed/loaded from DB)
  useEffect(() => {
    if (confirmed) return;
    const fmt = (v: number | undefined, dec = 2) =>
      v != null ? String(Number(v).toFixed(dec)) : "-";

    const preset = resolveSpecPreset(connectionSpec);

    // L1 = 모델 원점에서 최대 Z (totalLength)
    const totalLength = metadata?.totalLength ?? summaryTotalLength;
    const l2Reference = connectionSpec?.l2 ?? metadata?.l2;
    // 우선 metadata.l1를 사용, 없으면 totalLength - L2로 계산
    let l1ReferenceNum: number | undefined = undefined;
    if (Number.isFinite(Number(metadata?.l1))) {
      l1ReferenceNum = Number(metadata?.l1);
    } else if (
      Number.isFinite(Number(totalLength)) &&
      Number.isFinite(Number(l2Reference))
    ) {
      l1ReferenceNum = Number(totalLength) - Number(l2Reference);
    }
    const l1Reference = l1ReferenceNum ?? undefined;
    const diameterReference =
      preset?.diameterRef ??
      connectionSpec?.diameter ??
      metadata?.connectionDiameter;
    const hexSizeReference = preset?.hexRef ?? connectionSpec?.hexSize;
    const protrusionLength =
      preset?.innerDepthRef ?? connectionSpec?.protrusionLength;
    const internalGauge = String(
      (preset?.innerGauge ?? connectionSpec?.internalGauge) || "",
    ).trim();

    const innerGaugeReference =
      internalGauge && protrusionLength != null
        ? `${internalGauge} / ${Number(protrusionLength)
            .toFixed(2)
            .replace(/\.0+$/, "")
            .replace(/(\.\d*?)0+$/, "$1")}`
        : internalGauge || "적합";

    setRows([
      {
        label: "각인",
        referenceValue: lotShortCode || "-",
        criterion: "식별",
        instrument: "현미경(AD-T-07)",
        measuredValue: lotShortCode || "",
        judgment: "적합",
      },
      {
        label: "커넥션직경",
        referenceValue: fmt(diameterReference, 3),
        criterion:
          preset?.diameterCriterion ||
          formatRange(diameterReference, 0.02, 0.01, 2),
        instrument: "비전(AD-T-19)",
        measuredValue:
          metadata?.connectionDiameter != null
            ? fmt(metadata.connectionDiameter, 3)
            : diameterReference != null
              ? fmt(diameterReference, 3)
              : "",
        judgment: "적합",
      },
      {
        label: "L1",
        referenceValue: fmt(l1Reference, 3),
        criterion: "기준값1%이내",
        instrument: "비전(AD-T-19)",
        measuredValue: l1Reference != null ? fmt(l1Reference, 3) : "",
        judgment: "적합",
      },
      {
        label: "L2",
        referenceValue: fmt(l2Reference, 3),
        criterion: "기준값1%이내",
        instrument: "비전(AD-T-19)",
        measuredValue: l2Reference != null ? fmt(l2Reference, 3) : "",
        judgment: "적합",
      },
      {
        label: "최대직경",
        referenceValue: fmt(metadata?.maxDiameter, 3),
        criterion: "기준값1%이내",
        instrument: "비전(AD-T-19)",
        measuredValue:
          metadata?.maxDiameter != null ? fmt(metadata.maxDiameter, 3) : "",
        judgment: "적합",
      },
      {
        label: "내경깊이",
        referenceValue: innerGaugeReference,
        criterion: "±0.1",
        instrument: "비전(AD-T-19)",
        measuredValue:
          protrusionLength != null
            ? Number(protrusionLength)
                .toFixed(3)
                .replace(/\.0+$/, "")
                .replace(/(\.\d*?)0+$/, "$1")
            : innerGaugeReference !== "적합"
              ? innerGaugeReference
              : "",
        judgment: "적합",
      },
      {
        label: "헥스치수",
        referenceValue: fmt(hexSizeReference, 3),
        criterion:
          preset?.hexCriterion ||
          formatRange(hexSizeReference, 0.005, 0.003, 3),
        instrument: "MICRO(AD-T-02)",
        measuredValue: hexSizeReference != null ? fmt(hexSizeReference, 3) : "",
        judgment: "적합",
      },
    ]);
  }, [
    metadata,
    lotShortCode,
    confirmed,
    connectionSpec,
    summaryL1,
    summaryTotalLength,
  ]);

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

  // Load STL file (CAM → original fallback, IndexedDB 캐시 사용)
  useEffect(() => {
    if (!open || !requestId || !token) return;
    let cancelled = false;

    const blobToFile = (blob: Blob, filename: string) =>
      new File([blob], filename, { type: blob.type || "model/stl" });

    const fetchBlob = async (url: string): Promise<Blob> => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("blob fetch failed");
      return r.blob();
    };

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
        const mid = String(data?._id || resolvedMongoId || "").trim() || null;
        if (!cancelled && mid) setResolvedMongoId(mid);
        if (!cancelled && data?.createdAt)
          setRequestedAt(String(data.createdAt));
        const parsedL1 = Number(data?.caseInfos?.l1);
        if (!cancelled && Number.isFinite(parsedL1)) {
          setSummaryL1(parsedL1);
        }
        const parsedTotalLength = Number(data?.caseInfos?.totalLength);
        if (!cancelled && Number.isFinite(parsedTotalLength)) {
          setSummaryTotalLength(parsedTotalLength);
        }
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

        // Step 2: CAM 캐시 확인 → 없으면 original 캐시 확인 → 없으면 S3 fetch
        const camCacheKey = `stl:${mid}:cam`;
        const origCacheKey = `stl:${mid}:original`;

        // CAM 캐시 hit
        const cachedCam = await getFileBlob(camCacheKey);
        if (cachedCam) {
          if (cancelled) return;
          const filename = camFileName.toLowerCase().includes("filled")
            ? camFileName
            : camFileName.replace(/\.stl$/i, ".filled.stl");
          setStlFile(blobToFile(cachedCam, filename));
          return;
        }

        // original 캐시 hit
        const cachedOrig = await getFileBlob(origCacheKey);
        if (cachedOrig) {
          if (cancelled) return;
          setStlFile(blobToFile(cachedOrig, `${requestId}.stl`));
          return;
        }

        // Step 3: signed URL 취득 (CAM → original fallback)
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
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (origRes.ok) {
            const b = await origRes.json().catch(() => ({}));
            signedUrl = String(b?.data?.url || "").trim();
          }
        }
        if (!signedUrl || cancelled) return;

        // Step 4: blob 다운로드 → 캐시 저장 → 표시
        const blob = await fetchBlob(signedUrl);
        if (cancelled) return;

        const cacheKey = isCamFile ? camCacheKey : origCacheKey;
        try {
          await setFileBlob(cacheKey, blob);
        } catch {
          /* ignore */
        }

        const filename = isCamFile
          ? camFileName.toLowerCase().includes("filled")
            ? camFileName
            : camFileName.replace(/\.stl$/i, ".filled.stl")
          : `${requestId}.stl`;
        setStlFile(blobToFile(blob, filename));
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
  }, [open, requestId, token, resolvedMongoId]);

  const updateRow = (
    idx: number,
    field: "measuredValue" | "judgment" | "instrument",
    value: string,
  ) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleAddInstrument = async () => {
    if (confirmed) return;
    const candidate = instrumentDraft.trim();
    if (!candidate) return;
    if (instrumentOptions.includes(candidate)) {
      setInstrumentDraft("");
      return;
    }

    const next = [...instrumentOptions, candidate];
    setInstrumentOptions(next);
    setInstrumentDraft("");
    await persistInstrumentOptions(next);
  };

  const handleRemoveInstrument = async (value: string) => {
    if (confirmed) return;
    const next = instrumentOptions.filter((v) => v !== value);
    setInstrumentOptions(next.length ? next : DEFAULT_INSTRUMENT_OPTIONS);

    setRows((prev) =>
      prev.map((r) => {
        if (r.instrument !== value) return r;
        return {
          ...r,
          instrument: (next.length ? next : DEFAULT_INSTRUMENT_OPTIONS)[0],
        };
      }),
    );

    await persistInstrumentOptions(next);
  };

  const handleExportPng = async () => {
    if (!reportRef.current) return;

    try {
      setIsExportingPng(true);
      await new Promise((resolve) => setTimeout(resolve, 60));

      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default;

      const sourceCanvas = await html2canvas(reportRef.current, {
        scale: Math.max(3, Math.floor(window.devicePixelRatio * 2)),
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      // A4 세로 비율(300DPI 기준) + 인쇄 여백
      const a4WidthPx = 2480;
      const a4HeightPx = 3508;
      const marginPx = 170;
      const printableWidth = a4WidthPx - marginPx * 2;
      const printableHeight = a4HeightPx - marginPx * 2;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = a4WidthPx;
      exportCanvas.height = a4HeightPx;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, a4WidthPx, a4HeightPx);

      const fitScale = Math.min(
        printableWidth / sourceCanvas.width,
        printableHeight / sourceCanvas.height,
      );
      const drawWidth = sourceCanvas.width * fitScale;
      const drawHeight = sourceCanvas.height * fitScale;
      const drawX = (a4WidthPx - drawWidth) / 2;
      const drawY = (a4HeightPx - drawHeight) / 2;

      ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);

      exportCanvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `self-inspection-${requestId || "report"}-a4.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        },
        "image/png",
        1,
      );
    } catch {
      // ignore
    } finally {
      setIsExportingPng(false);
    }
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

  const infoRowPairs = [
    [infoRows[0], infoRows[1]],
    [infoRows[2], infoRows[3]],
    [infoRows[4], infoRows[5]],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-200">
          <DialogTitle className="text-base font-extrabold">
            자주검사성적서
          </DialogTitle>
        </DialogHeader>

        <div className="flex overflow-hidden">
          {/* ── Left: STL Preview ── */}
          <div className="w-[40%] shrink-0 border-r border-slate-200 flex flex-col bg-slate-50 overflow-hidden">
            <div className="h-[calc(90vh-57px)] flex items-center justify-center">
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
                  className="h-full w-full"
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
            <div ref={reportRef}>
              <h2 className="text-lg font-extrabold text-center border-b-2 border-slate-800 pb-2 mb-3">
                자주검사 성적서
              </h2>

              {/* Header info grid */}
              <div className="border border-slate-300 rounded-lg overflow-hidden mb-4 text-[13px]">
                {infoRowPairs.map((pair, i) => (
                  <div
                    key={`info-pair-${i}`}
                    className={`grid grid-cols-[96px_1fr_96px_1fr] items-center px-2 py-1 gap-2 ${i < infoRowPairs.length - 1 ? "border-b border-slate-200" : ""}`}
                  >
                    <span className="font-semibold text-slate-500 text-right pr-2">
                      {pair[0]?.label}
                    </span>
                    <span className="text-slate-800">{pair[0]?.value}</span>
                    <span className="font-semibold text-slate-500 text-right pr-2">
                      {pair[1]?.label}
                    </span>
                    <span className="text-slate-800">{pair[1]?.value}</span>
                  </div>
                ))}
              </div>

              {/* Inspection table */}
              <table className="w-full text-xs border-collapse border border-slate-300 mb-3">
                <thead>
                  <tr className="bg-slate-100 text-center align-middle">
                    <th className="border border-slate-300 px-2 py-1.5 align-middle">
                      항목
                    </th>
                    <th className="border border-slate-300 px-2 py-1.5 align-middle">
                      기준값
                    </th>
                    <th className="border border-slate-300 px-2 py-1.5 align-middle">
                      합격기준
                    </th>
                    <th className="border border-slate-300 px-2 py-1.5 align-middle">
                      측정장비(번호)
                    </th>
                    <th className="border border-slate-300 px-2 py-1.5 bg-amber-50 align-middle">
                      측정값
                    </th>
                    <th className="border border-slate-300 px-2 py-1.5 bg-amber-50 align-middle">
                      판단
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.label} className="align-middle">
                      <td className="border border-slate-300 px-2 py-1 text-center font-semibold align-middle">
                        {row.label}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center bg-amber-100 align-middle">
                        {row.referenceValue}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center align-middle">
                        {row.criterion}
                      </td>
                      <td className="border border-slate-300 px-1 py-0.5 text-center align-middle">
                        {isExportingPng ? (
                          <span className="text-slate-900 font-semibold">
                            {row.instrument}
                          </span>
                        ) : (
                          <select
                            className="w-full text-center bg-transparent outline-none text-slate-900 font-semibold cursor-pointer disabled:cursor-not-allowed"
                            value={row.instrument}
                            onChange={(e) =>
                              updateRow(idx, "instrument", e.target.value)
                            }
                            disabled={confirmed}
                          >
                            {instrumentOptions.map((opt) => (
                              <option key={`${row.label}-${opt}`} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="border border-slate-300 px-1 py-0.5 bg-amber-50 align-middle">
                        {isExportingPng ? (
                          <span className="text-slate-900 font-semibold">
                            {row.measuredValue || "-"}
                          </span>
                        ) : (
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
                        )}
                      </td>
                      <td className="border border-slate-300 px-1 py-0.5 bg-amber-50 align-middle">
                        {isExportingPng ? (
                          <span className="text-slate-900 font-semibold">
                            {row.judgment || "-"}
                          </span>
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-extrabold text-[13px]">
                    <td
                      colSpan={4}
                      className="border border-slate-300 px-2 py-1.5 text-center align-middle"
                    >
                      판정
                    </td>
                    <td
                      colSpan={2}
                      className={`border border-slate-300 px-2 py-1.5 text-center font-extrabold align-middle ${
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
            </div>

            {/* 측정장비 옵션 관리 */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowInstrumentManager((prev) => !prev)}
                  className="px-3 h-8 rounded text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50"
                >
                  측정장비 관리 {showInstrumentManager ? "▲" : "▼"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportPng()}
                  className="px-3 py-2 rounded-lg font-bold text-xs bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  PNG 저장
                </button>
              </div>

              {showInstrumentManager && (
                <div className="border border-slate-300 rounded-lg p-3 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={instrumentDraft}
                      onChange={(e) => setInstrumentDraft(e.target.value)}
                      placeholder="예: 비전(AD-T-21)"
                      disabled={confirmed || savingInstruments}
                      className="flex-1 h-8 px-2 text-xs border border-slate-300 rounded outline-none disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddInstrument}
                      disabled={
                        confirmed ||
                        savingInstruments ||
                        !instrumentDraft.trim()
                      }
                      className="px-3 h-8 rounded text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      추가
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {instrumentOptions.map((opt) => (
                      <button
                        key={`chip-${opt}`}
                        type="button"
                        onClick={() => void handleRemoveInstrument(opt)}
                        disabled={confirmed || savingInstruments}
                        className="px-2 py-1 text-[11px] rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="클릭하면 삭제"
                      >
                        {opt} ×
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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

                {overallJudgment === "불합격" && !confirmed && (
                  <p className="text-[11px] text-red-600">
                    판정이 불합격이면 확정할 수 없습니다.
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap justify-end">
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

                  {overallJudgment === "합격" && (
                    <button
                      type="button"
                      disabled={confirmed || saving || !requestId}
                      onClick={async () => {
                        if (!requestId) return;
                        if (overallJudgment !== "합격") return;
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
                          if (res.ok) {
                            setConfirmed(true);
                            return;
                          }
                          const body = await res.json().catch(() => ({}));
                          if (body?.message) {
                            window.alert(String(body.message));
                          }
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
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
