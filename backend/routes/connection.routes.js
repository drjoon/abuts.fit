import express from "express";
import connectionController from "../controllers/connection.controller.js";

const router = express.Router();

// 활성 커넥션 목록 조회 (한화 장비 기준) - 공개 엔드포인트
router.get("/", connectionController.getConnections);

export default router;
