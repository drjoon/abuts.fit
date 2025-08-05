import request from "supertest";
import mongoose from "mongoose";
import app from "../../app";
import User from "../../models/user.model";
import Request from "../../models/request.model";
import { hashPassword } from "../../utils/auth.util";
import { generateToken } from "../../utils/jwt.util";

describe("의뢰 API 테스트", () => {
  // 테스트용 사용자 데이터
  const testRequestor = {
    name: "테스트 의뢰자",
    email: "requestor@example.com",
    password: "password123",
    phoneNumber: "010-1234-5678",
    organization: "테스트 회사",
    role: "requestor",
    active: true,
  };

  const testManufacturer = {
    name: "테스트 제조사",
    email: "manufacturer@example.com",
    password: "password123",
    phoneNumber: "010-9876-5432",
    organization: "테스트 제조사",
    role: "manufacturer",
    active: true,
  };

  const testAdmin = {
    name: "테스트 관리자",
    email: "admin@example.com",
    password: "password123",
    phoneNumber: "010-1111-2222",
    organization: "어벗츠핏",
    role: "admin",
    active: true,
  };

  // 테스트용 의뢰 데이터
  const testRequest = {
    requestId: `REQ-${Date.now()}`, // 고유 요청 ID 생성
    title: "테스트 의뢰",
    description: "테스트 의뢰 설명입니다.",
    patientInfo: {
      age: 35,
      gender: "남성",
      medicalHistory: "특이사항 없음",
    },
    requirements: "특별한 요구사항은 없습니다.",
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2주 후
    status: "검토중",
    implantType: "straumann", // 필수 필드 추가
    implantSpec: "BLX 4.5x10mm", // 필수 필드 추가
  };

  let requestorToken, manufacturerToken, adminToken;
  let requestorId, manufacturerId, adminId;
  let requestId;

  // 각 테스트 전에 테스트 데이터 생성
  beforeEach(async () => {
    // 기존 데이터 삭제
    await User.deleteMany({});
    await Request.deleteMany({});

    // 테스트 사용자들 생성
    const hashedPassword = await hashPassword(testRequestor.password);

    const requestor = await User.create({
      ...testRequestor,
      password: hashedPassword,
    });
    requestorId = requestor._id;
    requestorToken = generateToken(requestor);

    const manufacturer = await User.create({
      ...testManufacturer,
      password: hashedPassword,
    });
    manufacturerId = manufacturer._id;
    manufacturerToken = generateToken(manufacturer);

    const admin = await User.create({
      ...testAdmin,
      password: hashedPassword,
    });
    adminId = admin._id;
    adminToken = generateToken(admin);

    // 테스트 의뢰 생성
    const createdRequest = await Request.create({
      ...testRequest,
      requestor: requestorId,
    });
    requestId = createdRequest._id;
  });

  // 의뢰 생성 테스트
  describe("POST /api/requests", () => {
    it("의뢰 생성 성공", async () => {
      const newRequest = {
        requestId: `REQ-${Date.now()}-NEW`, // 고유 요청 ID 생성
        title: "새 테스트 의뢰",
        description: "새 테스트 의뢰 설명입니다.",
        patientInfo: {
          age: 40,
          gender: "여성",
          medicalHistory: "당뇨",
        },
        requirements: "특별한 요구사항입니다.",
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30일 후
        implantType: "nobel", // 필수 필드 추가
        implantSpec: "NobelActive 4.3x11.5mm", // 필수 필드 추가
      };

      const response = await request(app)
        .post("/api/requests")
        .set("Authorization", `Bearer ${requestorToken}`)
        .send(newRequest)
        .expect(201);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.title).toBe(newRequest.title);
      expect(response.body.data.requestor.toString()).toBe(
        requestorId.toString()
      );
      expect(response.body.data.status).toBe("검토중"); // 기본 상태
    });

    it("필수 필드 누락 시 실패", async () => {
      const incompleteRequest = {
        description: "필수 필드가 누락된 의뢰",
        // title 누락
      };

      const response = await request(app)
        .post("/api/requests")
        .set("Authorization", `Bearer ${requestorToken}`)
        .send(incompleteRequest)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("제조사 권한으로 의뢰 생성 시 실패", async () => {
      const newRequest = {
        title: "새 테스트 의뢰",
        description: "새 테스트 의뢰 설명입니다.",
      };

      const response = await request(app)
        .post("/api/requests")
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .send(newRequest)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 의뢰 목록 조회 테스트
  describe("GET /api/requests", () => {
    it("관리자 권한으로 모든 의뢰 조회 성공", async () => {
      const response = await request(app)
        .get("/api/requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("requests");
      expect(response.body.data).toHaveProperty("pagination");
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].title).toBe(testRequest.title);
    });

    it("의뢰자 권한으로 자신의 의뢰만 조회 성공", async () => {
      const response = await request(app)
        .get("/api/requests")
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].requestor._id.toString()).toBe(
        requestorId.toString()
      );
    });

    it("제조사 권한으로 할당된 의뢰가 없을 때 빈 목록 조회", async () => {
      const response = await request(app)
        .get("/api/requests")
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(0);
    });

    it("페이지네이션 및 필터링 적용 조회 성공", async () => {
      const response = await request(app)
        .get("/api/requests")
        .query({ page: 1, limit: 10, status: "검토중" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.pagination.page).toBe(1);
    });
  });

  // 의뢰 상세 조회 테스트
  describe("GET /api/requests/:id", () => {
    it("의뢰 상세 조회 성공", async () => {
      const response = await request(app)
        .get(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(requestId.toString());
      expect(response.body.data.title).toBe(testRequest.title);
      expect(response.body.data.description).toBe(testRequest.description);
    });

    it("존재하지 않는 의뢰 조회 시 실패", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/requests/${fakeId}`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(404);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("권한이 없는 의뢰 조회 시 실패", async () => {
      // 다른 의뢰자 생성
      const otherRequestor = await User.create({
        name: "다른 의뢰자",
        email: "other@example.com",
        password: await hashPassword("password123"),
        role: "requestor",
      });
      const otherToken = generateToken(otherRequestor);

      // 다른 의뢰자가 현재 의뢰를 조회 시도
      const response = await request(app)
        .get(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${otherToken}`)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("관리자는 모든 의뢰 조회 가능", async () => {
      const response = await request(app)
        .get(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
    });
  });

  // 의뢰 수정 테스트
  describe("PUT /api/requests/:id", () => {
    it("의뢰자가 자신의 의뢰 수정 성공", async () => {
      const updateData = {
        title: "수정된 의뢰 제목",
        description: "수정된 의뢰 설명",
        requirements: "수정된 요구사항",
      };

      const response = await request(app)
        .put(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .send(updateData)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.requirements).toBe(updateData.requirements);
    });

    it("의뢰자가 아닌 사용자가 수정 시 실패", async () => {
      const updateData = {
        title: "수정 시도",
        description: "권한 없는 수정 시도",
      };

      const response = await request(app)
        .put(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .send(updateData)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("관리자는 모든 의뢰 수정 가능", async () => {
      const updateData = {
        title: "관리자가 수정한 제목",
        status: "진행중",
      };

      const response = await request(app)
        .put(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.status).toBe(updateData.status);
    });
  });

  // 의뢰 상태 변경 테스트
  describe("PATCH /api/requests/:id/status", () => {
    it("관리자가 의뢰 상태 변경 성공", async () => {
      const statusUpdate = {
        status: "진행중",
      };

      const response = await request(app)
        .patch(`/api/requests/${requestId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(statusUpdate)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(statusUpdate.status);
    });

    it("제조사가 할당된 의뢰의 상태 변경 성공", async () => {
      // 먼저 의뢰에 제조사 할당
      await Request.findByIdAndUpdate(requestId, {
        manufacturer: manufacturerId,
      });

      const statusUpdate = {
        status: "견적 대기",
      };

      const response = await request(app)
        .patch(`/api/requests/${requestId}/status`)
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .send(statusUpdate)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(statusUpdate.status);
    });

    it("할당되지 않은 제조사가 상태 변경 시 실패", async () => {
      const statusUpdate = {
        status: "견적 대기",
      };

      const response = await request(app)
        .patch(`/api/requests/${requestId}/status`)
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .send(statusUpdate)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 의뢰에 제조사 할당 테스트
  describe("PATCH /api/requests/:id/assign", () => {
    it("관리자가 의뢰에 제조사 할당 성공", async () => {
      const assignData = {
        manufacturerId: manufacturerId,
      };

      const response = await request(app)
        .patch(`/api/requests/${requestId}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(assignData)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.manufacturer.toString()).toBe(
        manufacturerId.toString()
      );
    });

    it("의뢰자가 제조사 할당 시 실패", async () => {
      const assignData = {
        manufacturerId: manufacturerId,
      };

      const response = await request(app)
        .patch(`/api/requests/${requestId}/assign`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .send(assignData)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("존재하지 않는 제조사 할당 시 실패", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const assignData = {
        manufacturerId: fakeId,
      };

      const response = await request(app)
        .patch(`/api/requests/${requestId}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(assignData)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 의뢰 메시지 추가 테스트
  describe("POST /api/requests/:id/messages", () => {
    it("의뢰자가 메시지 추가 성공", async () => {
      const messageData = {
        content: "테스트 메시지입니다.",
      };

      const response = await request(app)
        .post(`/api/requests/${requestId}/messages`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .send(messageData)
        .expect(201);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("messages");
      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.messages[0].content).toBe(messageData.content);
      expect(response.body.data.messages[0].sender.toString()).toBe(
        requestorId.toString()
      );
    });

    it("할당된 제조사가 메시지 추가 성공", async () => {
      // 먼저 의뢰에 제조사 할당
      await Request.findByIdAndUpdate(requestId, {
        manufacturer: manufacturerId,
      });

      const messageData = {
        content: "제조사의 테스트 메시지입니다.",
      };

      const response = await request(app)
        .post(`/api/requests/${requestId}/messages`)
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .send(messageData)
        .expect(201);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.messages[0].content).toBe(messageData.content);
      expect(response.body.data.messages[0].sender.toString()).toBe(
        manufacturerId.toString()
      );
    });

    it("할당되지 않은 제조사가 메시지 추가 시 실패", async () => {
      const messageData = {
        content: "권한 없는 메시지 추가 시도",
      };

      const response = await request(app)
        .post(`/api/requests/${requestId}/messages`)
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .send(messageData)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 의뢰 삭제 테스트
  describe("DELETE /api/requests/:id", () => {
    it("관리자가 의뢰 삭제 성공", async () => {
      const response = await request(app)
        .delete(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);

      // 실제로 삭제되었는지 확인
      const deletedRequest = await Request.findById(requestId);
      expect(deletedRequest).toBeNull();
    });

    it("의뢰자가 자신의 의뢰 삭제 성공", async () => {
      const response = await request(app)
        .delete(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${requestorToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
    });

    it("제조사가 의뢰 삭제 시 실패", async () => {
      const response = await request(app)
        .delete(`/api/requests/${requestId}`)
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });
});
