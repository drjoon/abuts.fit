import request from "supertest";
import app from "../../app";
import User from "../../models/user.model";
import { hashPassword } from "../../utils/auth.util";

describe("인증 API 테스트", () => {
  // 테스트용 사용자 데이터
  const testUser = {
    name: "테스트 사용자",
    email: "test@example.com",
    password: "password123",
    phoneNumber: "010-1234-5678",
    organization: "테스트 회사",
    role: "requestor",
  };

  let authToken;

  // 각 테스트 전에 테스트 사용자 생성
  beforeEach(async () => {
    // 기존 사용자 삭제
    await User.deleteMany({});

    // 테스트 사용자 생성 (평문 비밀번호 전달, 스키마 미들웨어에서 해싱)
    await User.create(testUser);
  });

  // 회원가입 테스트
  describe("POST /api/auth/register", () => {
    it("새로운 사용자 등록 성공", async () => {
      const newUser = {
        name: "신규 사용자",
        email: "new@example.com",
        password: "newpassword123",
        phoneNumber: "010-9876-5432",
        organization: "신규 회사",
        role: "requestor",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(newUser)
        .expect(201);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("token");
      expect(response.body.data).toHaveProperty("user");
      expect(response.body.data.user.email).toBe(newUser.email);
      expect(response.body.data.user).not.toHaveProperty("password");
    });

    it("이미 존재하는 이메일로 등록 시 실패", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send(testUser)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("이미 등록된 이메일");
    });

    it("필수 필드 누락 시 실패", async () => {
      const incompleteUser = {
        name: "불완전 사용자",
        // 이메일 누락
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(incompleteUser)
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 로그인 테스트
  describe("POST /api/auth/login", () => {
    it("올바른 자격 증명으로 로그인 성공", async () => {
      const credentials = {
        email: testUser.email,
        password: testUser.password,
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(credentials)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("token");
      expect(response.body.data).toHaveProperty("user");
      expect(response.body.data.user.email).toBe(testUser.email);

      // 다른 테스트에서 사용할 토큰 저장
      authToken = response.body.data.token;
    });

    it("잘못된 이메일로 로그인 시 실패", async () => {
      const credentials = {
        email: "wrong@example.com",
        password: testUser.password,
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(credentials)
        .expect(401);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("잘못된 비밀번호로 로그인 시 실패", async () => {
      const credentials = {
        email: testUser.email,
        password: "wrongpassword",
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(credentials)
        .expect(401);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 현재 사용자 조회 테스트
  describe("GET /api/auth/me", () => {
    it("인증된 사용자의 정보 조회 성공", async () => {
      // 먼저 로그인하여 토큰 획득
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      const token = loginResponse.body.data.token;

      // 토큰을 사용하여 현재 사용자 정보 조회
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body.data).not.toHaveProperty("password");
    });

    it("인증 없이 접근 시 실패", async () => {
      const response = await request(app).get("/api/auth/me").expect(401);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });

    it("유효하지 않은 토큰으로 접근 시 실패", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalidtoken")
        .expect(401);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 비밀번호 변경 테스트
  describe("PUT /api/auth/change-password", () => {
    it("올바른 현재 비밀번호로 변경 성공", async () => {
      // 먼저 로그인하여 토큰 획득
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      const token = loginResponse.body.data.token;

      // 비밀번호 변경 요청
      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({
          currentPassword: testUser.password,
          newPassword: "newpassword123",
        })
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);

      // 새 비밀번호로 로그인 시도
      const newLoginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: "newpassword123",
        })
        .expect(200);

      // 로그인 성공 확인
      expect(newLoginResponse.body.success).toBe(true);
    });

    it("잘못된 현재 비밀번호로 변경 시 실패", async () => {
      // 먼저 로그인하여 토큰 획득
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      const token = loginResponse.body.data.token;

      // 잘못된 현재 비밀번호로 변경 요청
      const response = await request(app)
        .put("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({
          currentPassword: "wrongpassword",
          newPassword: "newpassword123",
        })
        .expect(400);

      // 응답 검증
      expect(response.body.success).toBe(false);
    });
  });

  // 로그아웃 테스트
  describe("POST /api/auth/logout", () => {
    it("로그아웃 성공", async () => {
      // 먼저 로그인하여 토큰 획득
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      const token = loginResponse.body.data.token;

      // 로그아웃 요청
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
    });
  });
});
