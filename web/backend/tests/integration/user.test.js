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
        organization: "수정된 회사",
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
      expect(response.body.data.organization).toBe(updateData.organization);
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

  // 제조사 목록 조회 테스트
  describe("GET /api/users/manufacturers", () => {
    it("의뢰자 권한으로 제조사 목록 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/manufacturers")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("manufacturers");
      expect(response.body.data).toHaveProperty("pagination");
      expect(response.body.data.manufacturers).toHaveLength(1);
      expect(response.body.data.manufacturers[0].email).toBe(
        testManufacturer.email
      );
    });

    it("관리자 권한으로 제조사 목록 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/manufacturers")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.manufacturers).toHaveLength(1);
    });

    it("제조사 권한으로 접근 시 실패", async () => {
      const response = await request(app)
        .get("/api/users/manufacturers")
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 의뢰자 목록 조회 테스트
  describe("GET /api/users/requestors", () => {
    it("제조사 권한으로 의뢰자 목록 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/requestors")
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("requestors");
      expect(response.body.data).toHaveProperty("pagination");
      expect(response.body.data.requestors).toHaveLength(1);
      expect(response.body.data.requestors[0].email).toBe(testUser.email);
    });

    it("관리자 권한으로 의뢰자 목록 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/requestors")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data.requestors).toHaveLength(1);
    });

    it("의뢰자 권한으로 접근 시 실패", async () => {
      const response = await request(app)
        .get("/api/users/requestors")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);

      // 응답 검증
      expect(response.body.success).toBe(false);
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

  // 사용자 통계 조회 테스트
  describe("GET /api/users/stats", () => {
    it("의뢰자 통계 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/stats")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("requestor");
    });

    it("제조사 통계 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/stats")
        .set("Authorization", `Bearer ${manufacturerToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("manufacturer");
    });

    it("관리자 통계 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/stats")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
    });
  });

  // 사용자 활동 로그 조회 테스트
  describe("GET /api/users/activity-logs", () => {
    it("활동 로그 조회 성공", async () => {
      const response = await request(app)
        .get("/api/users/activity-logs")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("logs");
      expect(response.body.data).toHaveProperty("pagination");
    });
  });
});
