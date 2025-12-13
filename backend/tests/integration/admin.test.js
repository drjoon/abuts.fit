import request from "supertest";
import mongoose from "mongoose";
import app from "../../app";
import User from "../../models/user.model";
import Request from "../../models/request.model";
import { hashPassword } from "../../utils/auth.util";
import { generateToken } from "../../utils/jwt.util";
import ActivityLog from "../../models/activityLog.model";

describe("관리자 API 테스트", () => {
  // 테스트용 사용자 데이터
  const testAdmin = {
    name: "테스트 관리자",
    email: "admin@example.com",
    password: "password123",
    phoneNumber: "010-1111-2222",
    organization: "어벗츠핏",
    role: "admin",
    active: true,
  };

  const testUser = {
    name: "일반 사용자",
    email: "user@example.com",
    password: "password123",
    phoneNumber: "010-3333-4444",
    organization: "테스트 회사",
    role: "requestor",
    active: true,
  };

  let adminToken, userToken;
  let adminId, userId;
  let testRequestId;

  // 각 테스트 전에 테스트 데이터 생성
  beforeEach(async () => {
    // 기존 데이터 삭제
    await User.deleteMany({});
    await Request.deleteMany({});

    // 테스트 사용자들 생성
    const hashedPassword = await hashPassword(testAdmin.password);

    const admin = await User.create({
      ...testAdmin,
      password: hashedPassword,
    });
    adminId = admin._id;
    adminToken = generateToken(admin);

    const user = await User.create({
      ...testUser,
      password: hashedPassword,
    });
    userId = user._id;
    userToken = generateToken(user);

    // 테스트 의뢰 생성
    const testRequest = await Request.create({
      requestId: `REQ-${Date.now()}-TEST`,
      title: "테스트 의뢰",
      description: "테스트 의뢰 설명입니다.",
      requestor: userId,
      status: "의뢰접수",
      implantType: "nobel",
      implantSpec: "NobelActive 4.3x11.5mm",
    });
    testRequestId = testRequest._id;

    // ActivityLog는 user 생성 이후에 userId를 할당해서 생성
    await ActivityLog.create({
      userId: userId,
      action: "테스트 액션",
      details: "테스트 로그",
      createdAt: new Date(),
    });
  });

  // 대시보드 통계 조회 테스트
  describe("GET /api/admin/dashboard", () => {
    it("관리자 권한으로 대시보드 통계 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("userStats");
      expect(response.body.data).toHaveProperty("requestStats");
      expect(response.body.data).toHaveProperty("recentActivity");
    });

    it("일반 사용자 권한으로 접근 시 실패", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 사용자 관리 테스트
  describe("GET /api/admin/users", () => {
    it("관리자 권한으로 모든 사용자 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("users");
      expect(response.body.data).toHaveProperty("pagination");
      expect(response.body.data.users).toHaveLength(2);
    });

    it("필터링 및 정렬 적용 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .query({ role: "requestor", sortBy: "createdAt", order: "desc" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.users[0].role).toBe("requestor");
    });
  });

  // 사용자 상세 조회 테스트
  describe("GET /api/admin/users/:id", () => {
    it("관리자 권한으로 사용자 상세 조회 성공", async () => {
      const response = await request(app)
        .get(`/api/admin/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(userId.toString());
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body.data).not.toHaveProperty("password");
    });

    it("존재하지 않는 사용자 조회 시 실패", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/admin/users/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 사용자 수정 테스트
  describe("PUT /api/admin/users/:id", () => {
    it("관리자 권한으로 사용자 정보 수정 성공", async () => {
      const updateData = {
        name: "수정된 이름",
        organization: "수정된 회사",
        role: "manufacturer",
        active: false,
      };

      const response = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.organization).toBe(updateData.organization);
      expect(response.body.data.role).toBe(updateData.role);
      expect(response.body.data.active).toBe(updateData.active);
    });

    it("자신의 관리자 권한 제거 시도 시 실패", async () => {
      const updateData = {
        role: "requestor", // 관리자 권한 제거 시도
      };

      const response = await request(app)
        .put(`/api/admin/users/${adminId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 사용자 삭제 테스트
  describe("DELETE /api/admin/users/:id", () => {
    it("관리자 권한으로 사용자 삭제 성공", async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);

      // 실제로 삭제되었는지 확인
      const deletedUser = await User.findById(userId);
      expect(deletedUser).toBeNull();
    });

    it("자기 자신 삭제 시도 시 실패", async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${adminId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 의뢰 관리 테스트
  describe("GET /api/admin/requests", () => {
    it("관리자 권한으로 모든 의뢰 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("requests");
      expect(response.body.data).toHaveProperty("pagination");
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0]._id.toString()).toBe(
        testRequestId.toString()
      );
    });

    it("상태별 필터링 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/requests")
        .query({ status: "의뢰접수" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].status).toBe("의뢰접수");
    });
  });

  // 의뢰 상세 관리 테스트
  describe("GET /api/admin/requests/:id", () => {
    it("관리자 권한으로 의뢰 상세 조회 성공", async () => {
      const response = await request(app)
        .get(`/api/admin/requests/${testRequestId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(testRequestId.toString());
      expect(response.body.data.title).toBe("테스트 의뢰");
    });
  });

  // 의뢰 상태 변경 테스트
  describe("PATCH /api/admin/requests/:id/status", () => {
    it("관리자 권한으로 의뢰 상태 변경 성공", async () => {
      const statusUpdate = {
        status: "진행중",
        statusNote: "관리자가 상태를 변경했습니다.",
      };

      const response = await request(app)
        .patch(`/api/admin/requests/${testRequestId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(statusUpdate)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(statusUpdate.status);
      expect(response.body.data).toHaveProperty("statusHistory");
      expect(response.body.data.statusHistory).toHaveLength(1);
      expect(response.body.data.statusHistory[0].status).toBe(
        statusUpdate.status
      );
      expect(response.body.data.statusHistory[0].note).toBe(
        statusUpdate.statusNote
      );
    });
  });

  // 제조사 할당 테스트
  describe("PATCH /api/admin/requests/:id/assign", () => {
    it("관리자 권한으로 제조사 할당 성공", async () => {
      // 제조사 역할의 사용자 생성
      const manufacturer = await User.create({
        name: "테스트 제조사",
        email: "manufacturer@example.com",
        password: await hashPassword("password123"),
        role: "manufacturer",
      });

      const assignData = {
        manufacturerId: manufacturer._id,
      };

      const response = await request(app)
        .patch(`/api/admin/requests/${testRequestId}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(assignData)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.manufacturer.toString()).toBe(
        manufacturer._id.toString()
      );
    });

    it("존재하지 않는 제조사 할당 시 실패", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const assignData = {
        manufacturerId: fakeId,
      };

      const response = await request(app)
        .patch(`/api/admin/requests/${testRequestId}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(assignData)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 시스템 설정 조회 테스트
  describe("GET /api/admin/settings", () => {
    it("관리자 권한으로 시스템 설정 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/settings")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("settings");
    });
  });

  // 시스템 설정 업데이트 테스트
  describe("PUT /api/admin/settings", () => {
    it("관리자 권한으로 시스템 설정 업데이트 성공", async () => {
      const settingsUpdate = {
        maintenance: {
          enabled: true,
          message: "시스템 점검 중입니다.",
        },
        notifications: {
          emailEnabled: true,
          pushEnabled: true,
        },
      };

      const response = await request(app)
        .put("/api/admin/settings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(settingsUpdate)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.maintenance.enabled).toBe(
        settingsUpdate.maintenance.enabled
      );
      expect(response.body.data.maintenance.message).toBe(
        settingsUpdate.maintenance.message
      );
    });
  });

  // 활동 로그 조회 테스트
  describe("GET /api/admin/activity-logs", () => {
    it("관리자 권한으로 활동 로그 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/activity-logs")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("logs");
      expect(response.body.data).toHaveProperty("pagination");
    });

    it("사용자 ID로 필터링 조회 성공", async () => {
      const response = await request(app)
        .get("/api/admin/activity-logs")
        .query({ userId: userId.toString() })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
    });
  });
});
