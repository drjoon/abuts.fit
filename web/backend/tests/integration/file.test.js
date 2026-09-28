// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/files/file.controller.js
import { jest } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import os from "os";
import path from "path";
import fs from "fs";
import app from "../../app";
import User from "../../models/user.model";
import File from "../../models/file.model";
import s3Utils from "../../utils/s3.utils";
import { hashPassword } from "../../utils/auth.util";
import { generateToken } from "../../utils/jwt.util";

describe("파일 업로드 API 테스트", () => {
  // 테스트용 사용자 데이터
  const testRequestor = {
    name: "테스트 의뢰자",
    email: "requestor@example.com",
    password: "password123",
    phoneNumber: "010-1234-5678",
    business: "테스트 회사",
    role: "requestor",
    active: true,
  };

  const testAdmin = {
    name: "테스트 관리자",
    email: "admin@example.com",
    password: "password123",
    phoneNumber: "010-1111-2222",
    business: "어벗츠핏",
    role: "admin",
    active: true,
  };

  let requestorToken, adminToken;
  let requestorId, adminId;
  let testFilePath;
  let testFileId;
  let requestId;

  // 실제 S3로 나가지 않도록 업로드·서명 URL만 대체한다.
  beforeEach(() => {
    jest
      .spyOn(s3Utils, "uploadFileToS3")
      .mockImplementation(async (_buffer, key) => ({
        key,
        location: `https://example.com/${key}`,
      }));
    jest
      .spyOn(s3Utils, "getSignedUrl")
      .mockImplementation(async (key) => `https://example.com/signed/${key}`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 각 테스트 전에 테스트 데이터 생성
  beforeEach(async () => {
    // 기존 데이터 삭제
    await User.deleteMany({});
    await File.deleteMany({});

    // 테스트 사용자들 생성
    const hashedPassword = await hashPassword(testRequestor.password);

    const requestor = await User.create({
      ...testRequestor,
      password: hashedPassword,
    });
    requestorId = requestor._id;
    requestorToken = generateToken(requestor);

    const admin = await User.create({
      ...testAdmin,
      password: hashedPassword,
    });
    adminId = admin._id;
    adminToken = generateToken(admin);

    // 업로드용 로컬 파일
    testFilePath = path.join(
      os.tmpdir(),
      `abuts-jest-${process.pid}-test-file.txt`,
    );
    fs.writeFileSync(testFilePath, "This is a test file for upload testing.");

    // 테스트 의뢰 생성
    const testRequest = await mongoose.model("Request").create({
      requestId: `REQ-${Date.now()}-TEST`,
      title: "테스트 의뢰",
      description: "테스트 의뢰 설명입니다.",
      requestor: requestorId,
      status: "의뢰접수",
      implantType: "nobel",
      implantSpec: "NobelActive 4.3x11.5mm",
    });
    requestId = testRequest._id;

    // 조회·삭제·다운로드 테스트용 기존 파일
    const testFile = await File.create({
      originalName: "existing-test-file.txt",
      mimetype: "text/plain",
      size: 100,
      key: "test-key",
      location: "https://example.com/test-file.txt",
      uploadedBy: requestorId,
      relatedRequest: requestId,
      fileType: "document",
    });
    testFileId = testFile._id;
  });

  // 테스트 후 정리
  afterEach(() => {
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  // 파일 업로드 테스트
  describe("POST /api/files/upload", () => {
    it("파일 업로드 성공", async () => {
      const response = await request(app)
        .post("/api/files/upload")
        .set("Authorization", `Bearer ${requestorToken}`)
        .field("relatedRequest", requestId.toString())
        .field("fileType", "document")
        .attach("file", testFilePath, "test-file.txt")
        .expect(201);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.originalName).toBe("test-file.txt");
      expect(response.body.data.uploadedBy.toString()).toBe(
        requestorId.toString(),
      );
      expect(response.body.data.relatedRequest.toString()).toBe(
        requestId.toString(),
      );
      expect(s3Utils.uploadFileToS3).toHaveBeenCalledTimes(1);
    });

    it("인증 없이 파일 업로드 시 실패", async () => {
      const response = await request(app)
        .post("/api/files/upload")
        .field("relatedRequest", requestId.toString())
        .field("fileType", "document")
        .attach("file", testFilePath)
        .expect(401);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("파일 없이 요청 시 실패", async () => {
      const response = await request(app)
        .post("/api/files/upload")
        .set("Authorization", `Bearer ${requestorToken}`)
        .field("relatedRequest", requestId.toString())
        .field("fileType", "document")
        .expect(400);

      // 응답 검증 (전역 에러 핸들러는 { message }만 내려준다)
      expect(response.body.message).toBe("File is required");
    });

    it("요청 ID 없이 파일 업로드 시 실패", async () => {
      const response = await request(app)
        .post("/api/files/upload")
        .set("Authorization", `Bearer ${requestorToken}`)
        .field("fileType", "document")
        .attach("file", testFilePath)
        .expect(400);

      // 응답 검증
      expect(response.body.message).toBe("Related request ID is required");
      expect(s3Utils.uploadFileToS3).not.toHaveBeenCalled();
    });
  });

  it("목록 API(GET /api/files, /my, /request/:id)는 제거되었다", async () => {
    for (const path of ["/api/files/my", `/api/files/request/${requestId}`]) {
      const response = await request(app)
        .get(path)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(response.status).not.toBe(200);
    }
  });

  // 파일 상세 조회 테스트
  describe("GET /api/files/:id", () => {
    it("파일 상세 조회 성공", async () => {
      const response = await request(app)
        .get(`/api/files/${testFileId}`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(testFileId.toString());
      expect(response.body.data.originalName).toBe("existing-test-file.txt");
    });

    it("존재하지 않는 파일 조회 시 실패", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/files/${fakeId}`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(404);

      // 응답 검증
      expect(response.body.message).toBe("File not found");
    });
  });

  // 파일 삭제 테스트
  describe("DELETE /api/files/:id", () => {
    it("관리자가 파일 삭제 성공", async () => {
      const response = await request(app)
        .delete(`/api/files/${testFileId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);

      // 실제로 삭제되었는지 확인
      const deletedFile = await File.findById(testFileId);
      expect(deletedFile).toBeNull();
    });

    it("업로드한 사용자가 파일 삭제 성공", async () => {
      const response = await request(app)
        .delete(`/api/files/${testFileId}`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
    });

    it("권한 없는 사용자가 파일 삭제 시 실패", async () => {
      // 다른 사용자 생성
      const otherUser = await User.create({
        name: "다른 사용자",
        email: "other@example.com",
        password: await hashPassword("password123"),
        role: "requestor",
      });
      const otherToken = generateToken(otherUser);

      const response = await request(app)
        .delete(`/api/files/${testFileId}`)
        .set("Authorization", `Bearer ${otherToken}`)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
      expect(await File.findById(testFileId)).not.toBeNull();
    });
  });

  // 파일 다운로드 URL 생성 테스트
  describe("GET /api/files/:id/download-url", () => {
    it("파일 다운로드 URL 생성 성공", async () => {
      const response = await request(app)
        .get(`/api/files/${testFileId}/download-url`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toBe(
        "https://example.com/signed/test-key",
      );
    });

    it("존재하지 않는 파일의 다운로드 URL 요청 시 실패", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/files/${fakeId}/download-url`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(404);

      // 응답 검증
      expect(response.body.message).toBe("File not found");
    });
  });
});
