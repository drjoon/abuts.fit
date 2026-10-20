// 의뢰 시 임플란트 제조사·브랜드 자동 제안 (전역 SSOT).
import { suggestImplantNameRegistry } from "../services/newConnectionImplantGroup.service.js";

export async function suggestImplantNames(req, res) {
  try {
    const field = String(req.query?.field || "manufacturer").trim();
    const query = String(req.query?.q || "").trim();
    const manufacturer = String(req.query?.manufacturer || "").trim();
    if (!["manufacturer", "brand"].includes(field)) {
      return res.status(400).json({
        success: false,
        message: "field는 manufacturer 또는 brand입니다.",
      });
    }
    const items = await suggestImplantNameRegistry({
      field,
      query,
      manufacturer,
    });
    return res.status(200).json({ success: true, data: { items } });
  } catch (e) {
    console.error("[implantNameRegistry] suggest error", e);
    return res.status(500).json({
      success: false,
      message: "조회에 실패했습니다.",
    });
  }
}
