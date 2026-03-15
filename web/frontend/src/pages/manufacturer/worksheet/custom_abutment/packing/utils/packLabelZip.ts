import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  getLotLabel,
  renderPackLabelToCanvas,
  resolveManufacturingDate,
  canvasToPngBlob,
  type PackLabelRenderOptions,
} from "./packLabelRenderer";

const requireNonEmptyString = (
  value: unknown,
  fieldLabel: string,
  request: ManufacturerRequest,
) => {
  if (typeof value !== "string") {
    throw new Error(
      `${request.requestId || "의뢰"}: ${fieldLabel} 값이 비어 있습니다. 백엔드 데이터를 확인해주세요.`,
    );
  }
  const text = value.trim();
  if (!text) {
    throw new Error(
      `${request.requestId || "의뢰"}: ${fieldLabel} 값이 비어 있습니다. 백엔드 데이터를 확인해주세요.`,
    );
  }
  return text;
};

const resolvePackMailboxCode = (request: ManufacturerRequest) =>
  requireNonEmptyString(request.mailboxAddress, "메일함 코드", request);

const resolvePackScrewCode = (request: ManufacturerRequest) => {
  const manufacturer = requireNonEmptyString(
    (request.caseInfos as any)?.implantManufacturer,
    "제조사",
    request,
  );
  const isDentium = /\bDENTIUM\b/i.test(manufacturer)
    ? true
    : manufacturer.includes("덴티움");
  const legacy = isDentium ? "8B" : "0A";
  return legacy.split("").reverse().join("");
};

const resolvePackFullLotNumber = (request: ManufacturerRequest) => {
  const value = String((request as any)?.lotNumber?.value || "").trim();
  return requireNonEmptyString(value, "풀 로트번호", request);
};

export const buildPackLabelRenderOptions = ({
  req,
  packLabelDpi,
  packLabelDots,
  packLabelDesignDots,
}: {
  req: ManufacturerRequest;
  packLabelDpi: number;
  packLabelDots?: { pw: number; ll: number };
  packLabelDesignDots?: { pw: number; ll: number; dpi: number };
}): PackLabelRenderOptions => {
  const caseInfos = req.caseInfos || {};
  const fullLotNumber = resolvePackFullLotNumber(req);
  const labName = requireNonEmptyString(
    (req as any)?.requestorBusinessAnchor?.name || (req as any)?.business?.name,
    "사업자명",
    req,
  );
  const implantManufacturer = requireNonEmptyString(
    (caseInfos as any)?.implantManufacturer,
    "제조사",
    req,
  );
  const clinicName = requireNonEmptyString(caseInfos.clinicName, "치과명", req);
  const implantBrand = requireNonEmptyString(
    (caseInfos as any)?.implantBrand,
    "브랜드",
    req,
  );
  const implantFamily = requireNonEmptyString(
    (caseInfos as any)?.implantFamily,
    "패밀리",
    req,
  );
  const implantType = requireNonEmptyString(
    (caseInfos as any)?.implantType,
    "타입",
    req,
  );
  const patientName = requireNonEmptyString(
    caseInfos.patientName,
    "환자명",
    req,
  );
  const toothNumber = requireNonEmptyString(caseInfos.tooth, "치아번호", req);
  const createdAtIso = req.createdAt ? String(req.createdAt) : "";
  const { manufacturingDate, rawSources } = resolveManufacturingDate(req);

  if (!manufacturingDate) {
    console.warn("[PackingPage] manufacturing date missing for pack label", {
      requestId: req.requestId,
      manufacturerStage: req.manufacturerStage,
      productionSchedule: req.productionSchedule,
      rawSources,
      reviewByStage: req.caseInfos?.reviewByStage,
    });
    throw new Error(
      `${req.requestId || fullLotNumber || "의뢰"}: 제조일자를 확인할 수 없어 라벨을 생성할 수 없습니다.`,
    );
  }

  const material =
    (typeof (caseInfos as any)?.material === "string" &&
      (caseInfos as any).material) ||
    (typeof (req as any)?.material === "string" && (req as any).material) ||
    (typeof (req.lotNumber as any)?.material === "string" &&
      (req.lotNumber as any).material) ||
    "";

  return {
    mailboxCode: resolvePackMailboxCode(req),
    screwType: resolvePackScrewCode(req),
    lotNumber: fullLotNumber,
    requestId: req.requestId,
    clinicName,
    labName,
    requestDate: createdAtIso,
    manufacturingDate,
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
    patientName,
    toothNumber,
    material,
    caseType: "Custom Abutment",
    printedAt: new Date().toISOString(),
    dpi: packLabelDpi,
    targetDots: packLabelDots,
    designDots: packLabelDesignDots,
  };
};

export const savePackingLabelsAsZip = async ({
  requests,
  packLabelDpi,
  packLabelDots,
  packLabelDesignDots,
}: {
  requests: ManufacturerRequest[];
  packLabelDpi: number;
  packLabelDots?: { pw: number; ll: number };
  packLabelDesignDots?: { pw: number; ll: number; dpi: number };
}) => {
  const list = Array.isArray(requests) ? requests.filter(Boolean) : [];
  if (!list.length) {
    throw new Error("압축할 패킹 라벨이 없습니다.");
  }

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const pad2 = (v: number) => String(v).padStart(2, "0");
  const now = new Date();
  const folderName = `packing-labels-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const dir = zip.folder(folderName);
  if (!dir) throw new Error("zip 폴더 생성에 실패했습니다.");

  for (const req of list) {
    const opts = buildPackLabelRenderOptions({
      req,
      packLabelDpi,
      packLabelDots,
      packLabelDesignDots,
    });
    const canvas = await renderPackLabelToCanvas(opts);
    const blob = await canvasToPngBlob(canvas);
    if (!blob) throw new Error("PNG 생성에 실패했습니다.");

    const requestId = String(req.requestId || "").trim() || "request";
    const lot = getLotLabel(req) || opts.lotNumber || "lot";
    const mailbox = String(req.mailboxAddress || "").trim() || "BOX";
    const safeRequestId = requestId.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const safeLot = String(lot).replace(/[^a-zA-Z0-9._-]+/g, "_");
    const safeMailbox = mailbox.replace(/[^a-zA-Z0-9._-]+/g, "_");
    dir.file(`${safeRequestId}_${safeMailbox}_${safeLot}-pack.png`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
};
