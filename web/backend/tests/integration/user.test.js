// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import request from "supertest";
import mongoose from "mongoose";
import app from "../../app";
import User from "../../models/user.model";
import { hashPassword } from "../../utils/auth.util";
import { generateToken } from "../../utils/jwt.util";

describe("사용자 API 테스트", () => {
  // 테스트용 사용자 데이터
  const testUser = {
    name: "테스트 사용자",
    email: "test@example.com",
    password: "password123",
    phoneNumber: "010-1234-5678",
    business: "테스트 회사",
    role: "requestor",
    active: true,
  };

  const testManufacturer = {
    name: "테스트 제조사",
    email: "manufacturer@example.com",
    password: "password123",
    phoneNumber: "010-9876-5432",
    business: "테스트 제조사",
    role: "manufacturer",
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

  let userToken, manufacturerToken, adminToken;
  let userId, manufacturerId, adminId;

  // 각 테스트 전에 테스트 사용자 생성
  beforeEach(async () => {
    // 기존 사용자 삭제
    await User.deleteMany({});

    // 테스트 사용자들 생성
    const hashedPassword = await hashPassword(testUser.password);

    const user = await User.create({
      ...testUser,
      password: hashedPassword,
      notificationSettings: {
        email: {
          newRequest: true,
          statusUpdate: true,
          newMessage: true,
          fileUpload: false,
        },
        push: {
          newRequest: true,
          statusUpdate: true,
          newMessage: true,
          fileUpload: true,
        },
      },
    });
    userId = user._id;
    userToken = generateToken(user);

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
  });

  // 프로필 조회 테스트
  describe("GET /api/users/profile", () => {
    it("인증된 사용자의 프로필 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/profile")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body.data).not.toHaveProperty("password");
    });

    it("인증 없이 접근 시 실패", async () => {
      const response = await request(app).get("/api/users/profile").expect(401);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 프로필 수정 테스트
  describe("PUT /api/users/profile", () => {
    it("프로필 수정 성공", async () => {
      const updateData = {
        name: "수정된 이름",
        phoneNumber: "010-5555-6666",
        business: "수정된 회사",
      };

      const response = await request(app)
        .put("/api/users/profile")
        .set("Authorization", `Bearer ${userToken}`)
        .send(updateData)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.phoneNumber).toBe(updateData.phoneNumber);
      expect(response.body.data.business).toBe(updateData.business);
      expect(response.body.data.email).toBe(testUser.email); // 이메일은 변경되지 않음
    });

    it("이메일, 역할, 활성화 상태 등 보호된 필드는 수정되지 않음", async () => {
      const updateData = {
        name: "수정된 이름",
        email: "changed@example.com", // 변경 시도
        role: "admin", // 변경 시도
        active: false, // 변경 시도
      };

      const response = await request(app)
        .put("/api/users/profile")
        .set("Authorization", `Bearer ${userToken}`)
        .send(updateData)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.email).toBe(testUser.email); // 변경되지 않음
      expect(response.body.data.role).toBe(testUser.role); // 변경되지 않음
      expect(response.body.data.active).toBe(testUser.active); // 변경되지 않음
    });
  });

  // 알림 설정 조회 테스트
  describe("GET /api/users/notification-settings", () => {
    it("알림 설정 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/notification-settings")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("methods");
      expect(response.body.data).toHaveProperty("types");
      expect(response.body.data.methods).toHaveProperty("emailNotifications");
      expect(response.body.data.types).toHaveProperty("newRequests");
    });
  });

  // 알림 설정 수정 테스트
  describe("PUT /api/users/notification-settings", () => {
    it("알림 설정 수정 성공", async () => {
      const updateSettings = {
        methods: {
          emailNotifications: false,
          smsNotifications: true,
          pushNotifications: true,
          marketingEmails: false,
        },
        types: {
          newRequests: true,
          statusUpdates: false,
          payments: true,
        },
      };

      const response = await request(app)
        .put("/api/users/notification-settings")
        .set("Authorization", `Bearer ${userToken}`)
        .send(updateSettings)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(updateSettings);
    });

    it("유효하지 않은 설정으로 수정 시 실패", async () => {
      const invalidSettings = {
        methods: {
          emailNotifications: false,
        },
        // types 누락
      };

      const response = await request(app)
        .put("/api/users/notification-settings")
        .set("Authorization", `Bearer ${userToken}`)
        .send(invalidSettings)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 제조사·의뢰자 목록, 통계, 활동 로그 API는 미사용으로 제거됐다
  // (commit 24fd9fc17 「백엔드 미사용 코드 제거」).
  describe("제거된 /api/users 엔드포인트", () => {
    it.each([
      "/api/users/manufacturers",
      "/api/users/requestors",
      "/api/users/stats",
      "/api/users/activity-logs",
    ])("%s 는 404", async (url) => {
      await request(app)
        .get(url)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
