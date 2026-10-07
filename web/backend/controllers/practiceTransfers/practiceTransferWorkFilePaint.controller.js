// 작업 파일 3D 프리뷰 페인트(표시)를 의뢰 메타데이터에 남긴다. 파일은 건드리지 않는다.
// related files:
// - web/backend/utils/workFilePaint.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/shared/components/RequestFilesPreviewDialog.tsx
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  PRACTICE_TRANSFER_CASE_VIEW_SELECT,
  buildTransferLookupFilter,
  isPracticeTransferRemoved,
  resolvePracticeTransferCaseViewerSide,
} from "../../utils/practiceTransferCaseView.js";
import {
  assertWorkFilePaintSize,
  sanitizeWorkFilePaintShapes,
  sanitizeWorkFilePaintView,
  sameWorkFilePaintKeys,
  toWorkFilePaintApi,
  workFilePaintFileKeys,
} from "../../utils/workFilePaint.js";

const PAINT_SELECT = {
  ...PRACTICE_TRANSFER_CASE_VIEW_SELECT,
  "production.workFilePaint": 1,
};

const loadTransfer = async (req, res) => {
  const filter = buildTransferLookupFilter(req.params?.transferId);
  if (!filter) {
    res.status(400).json({ success: false, message: "의뢰 ID가 필요합니다." });
    return null;
  }
  const transfer = await PracticeTransfer.findOne(filter).select(PAINT_SELECT).lean();
  if (!transfer || isPracticeTransferRemoved(transfer)) {
    res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    return null;
  }
  const side = await resolvePracticeTransferCaseViewerSide(req.user, transfer);
  if (!side) {
    res.status(403).json({
      success: false,
      message: "이 의뢰에 참여한 치과·기공소만 볼 수 있습니다.",
    });
    return null;
  }
  return { transfer, side };
};

/** GET /api/practice/transfers/:transferId/work-file-paint */
export async function getPracticeTransferWorkFilePaint(req, res) {
  try {
    const loaded = await loadTransfer(req, res);
    if (!loaded) return;
    return res.status(200).json({
      success: true,
      data: toWorkFilePaintApi(loaded.transfer),
    });
  } catch (error) {
    console.error("[practiceTransferWorkFilePaint] get", error);
    return res.status(500).json({
      success: false,
      message: "페인트 표시를 불러오지 못했습니다.",
    });
  }
}

/**
 * PUT /api/practice/transfers/:transferId/work-file-paint
 * body: { fileKeys: string[], shapes: object[] }
 */
export async function savePracticeTransferWorkFilePaint(req, res) {
  try {
    const loaded = await loadTransfer(req, res);
    if (!loaded) return;
    const { transfer, side } = loaded;
    const fileKeys = workFilePaintFileKeys(transfer);
    if (fileKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: "저장할 작업 파일이 없습니다.",
      });
    }
    // 클라이언트가 보낸 키와 달라도 서버 키로 저장한다.
    // (프리뷰에 안 올린 파일·필터 차이로 409가 나면 표시가 유실된다.)
    // 파일 목록이 바뀌면 GET/currentWorkFilePaint가 옛 표시를 버린다.
    const clientKeys = Array.isArray(req.body?.fileKeys) ? req.body.fileKeys : [];
    if (
      clientKeys.length > 0 &&
      !sameWorkFilePaintKeys(clientKeys, fileKeys)
    ) {
      console.warn(
        "[practiceTransferWorkFilePaint] fileKeys mismatch; saving with server keys",
        { client: clientKeys.length, server: fileKeys.length },
      );
    }
    const shapes = sanitizeWorkFilePaintShapes(req.body?.shapes);
    const view = sanitizeWorkFilePaintView(req.body?.view);
    try {
      assertWorkFilePaintSize({ shapes, view });
    } catch (error) {
      if (error?.code === "too_large") {
        return res.status(413).json({ success: false, message: error.message });
      }
      throw error;
    }
    const now = new Date();
    const row = {
      fileKeys,
      shapes,
      view: view || null,
      updatedAt: now,
      updatedBy: req.user?._id || null,
      updatedSide: side,
    };
    await PracticeTransfer.updateOne(
      { _id: transfer._id },
      { $set: { "production.workFilePaint": row } },
    );
    return res.status(200).json({
      success: true,
      data: { fileKeys, shapes, view: view || null },
    });
  } catch (error) {
    console.error("[practiceTransferWorkFilePaint] save", error);
    return res.status(500).json({
      success: false,
      message: "페인트 표시를 저장하지 못했습니다.",
    });
  }
}
