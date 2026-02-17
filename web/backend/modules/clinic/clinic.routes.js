import { Router } from "express";
import clinicController from "../../controllers/clinics/clinic.controller.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";

const router = Router();

// 모든 거래 치과/프리셋 API는 인증 + 의뢰자/관리자만 접근 가능
router.use(authenticate, authorize(["requestor", "admin"]));

// 거래 치과 목록 조회 / 생성
router
  .route("/")
  .get(clinicController.getClinics)
  .post(clinicController.createClinic);

// 거래 치과 수정/삭제
router
  .route("/:id")
  .patch(clinicController.updateClinic)
  .delete(clinicController.deleteClinic);

// 특정 거래 치과의 임플란트 프리셋 목록/생성
router
  .route("/:clinicId/implant-presets")
  .get(clinicController.getImplantPresets)
  .post(clinicController.createImplantPreset);

// 개별 임플란트 프리셋 수정/삭제
router
  .route("/implant-presets/:presetId")
  .patch(clinicController.updateImplantPreset)
  .delete(clinicController.deleteImplantPreset);

export default router;
