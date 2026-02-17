import express from "express";
import connectionController from "../../controllers/machines/connection.controller.js";

const router = express.Router();

// 활성 커넥션 목록 조회 (한화 장비 기준) - 공개 엔드포인트
router.get("/", connectionController.getConnections);

// 직경으로 가장 근사한 커넥션 찾기
router.get("/find-by-diameter", connectionController.findConnectionByDiameter);

export default router;
