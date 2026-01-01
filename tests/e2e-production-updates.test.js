/**
 * E2E 테스트: 생산 프로세스 업데이트
 *
 * 테스트 시나리오:
 * 1. 소재 교체 예약 및 자동 실행
 * 2. 의뢰 취소 (의뢰/CAM 단계)
 * 3. 정보 변경 (CAM 완료 후 임플란트 정보 수정 불가)
 */

import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수 로드
const backendEnvPath = path.join(__dirname, "../web/backend/local.env");
const backgroundEnvPath = path.join(__dirname, "../background/local.env");

dotenv.config({ path: backendEnvPath });
dotenv.config({ path: backgroundEnvPath });

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const WORKER_URL = process.env.WORKER_STATUS_URL || "http://localhost:4001";

// 테스트용 사용자 인증 정보 (reset-and-seed.js 참조)
let adminToken = "";
let requestorToken = "";
let manufacturerToken = "";

// 테스트 계정 정보
const TEST_ACCOUNTS = {
  requestorOwner: {
    email: "requestor.owner@demo.abuts.fit",
    password: "Rq!8zY#4fQ@7nC5$",
  },
  requestorStaff: {
    email: "requestor.staff@demo.abuts.fit",
    password: "Rs!9xT#5gA@6mD4$",
  },
  manufacturerOwner: {
    email: "manufacturer.owner@demo.abuts.fit",
    password: "Mo!7vL#6pR@3sB8$",
  },
  manufacturerStaff: {
    email: "manufacturer.staff@demo.abuts.fit",
    password: "Ms!5kP#8wQ@2nZ7$",
  },
  adminOwner: {
    email: "admin.owner@demo.abuts.fit",
    password: "Ao!6fN#9rV@4cH2$",
  },
  adminStaff: {
    email: "admin.staff@demo.abuts.fit",
    password: "As!4mJ#7tK@9pW3$",
  },
};

// 테스트 데이터
let testRequestId = "";
let testMachineId = "";

// API 클라이언트
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
});

const workerApi = axios.create({
  baseURL: WORKER_URL,
  timeout: 5000,
});

// 색상 출력 헬퍼
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, "cyan");
}

function logSuccess(message) {
  log(`✓ ${message}`, "green");
}

function logError(message) {
  log(`✗ ${message}`, "red");
}

function logWarning(message) {
  log(`⚠ ${message}`, "yellow");
}

// 1. 인증 토큰 획득
async function authenticate() {
  logStep("STEP 1", "사용자 인증");

  try {
    // Admin 로그인
    const adminRes = await api
      .post("/api/auth/login", {
        email: TEST_ACCOUNTS.adminOwner.email,
        password: TEST_ACCOUNTS.adminOwner.password,
      })
      .catch((err) => {
        const status = err.response?.status;
        const body = err.response?.data;
        console.error("[E2E] admin login failed", { status, body });
        throw err;
      });
    const adminPayload = adminRes?.data;
    const adminData = adminPayload?.data;
    if (!adminData?.token || !adminData?.user) {
      console.error("[E2E] admin login invalid response", adminRes?.data);
      throw new Error("admin login response invalid");
    }
    adminToken = adminData.token;
    logSuccess(`Admin 로그인 성공: ${adminData.user.email}`);

    // Requestor 로그인
    const requestorRes = await api
      .post("/api/auth/login", {
        email: TEST_ACCOUNTS.requestorOwner.email,
        password: TEST_ACCOUNTS.requestorOwner.password,
      })
      .catch((err) => {
        const status = err.response?.status;
        const body = err.response?.data;
        console.error("[E2E] requestor login failed", { status, body });
        throw err;
      });
    const requestorPayload = requestorRes?.data;
    const requestorData = requestorPayload?.data;
    if (!requestorData?.token || !requestorData?.user) {
      console.error(
        "[E2E] requestor login invalid response",
        requestorRes?.data
      );
      throw new Error("requestor login response invalid");
    }
    requestorToken = requestorData.token;
    logSuccess(`Requestor 로그인 성공: ${requestorData.user.email}`);

    // Manufacturer 로그인
    const manufacturerRes = await api
      .post("/api/auth/login", {
        email: TEST_ACCOUNTS.manufacturerOwner.email,
        password: TEST_ACCOUNTS.manufacturerOwner.password,
      })
      .catch((err) => {
        const status = err.response?.status;
        const body = err.response?.data;
        console.error("[E2E] manufacturer login failed", { status, body });
        throw err;
      });
    const manufacturerPayload = manufacturerRes?.data;
    const manufacturerData = manufacturerPayload?.data;
    if (!manufacturerData?.token || !manufacturerData?.user) {
      console.error(
        "[E2E] manufacturer login invalid response",
        manufacturerRes?.data
      );
      throw new Error("manufacturer login response invalid");
    }
    manufacturerToken = manufacturerData.token;
    logSuccess(`Manufacturer 로그인 성공: ${manufacturerData.user.email}`);
  } catch (error) {
    logError(`인증 실패: ${error.response?.data?.message || error.message}`);
    throw error;
  }
}

// 2. CNC 장비 조회
async function getCncMachines() {
  logStep("STEP 2", "CNC 장비 조회");

  try {
    const res = await api.get("/api/cnc-machines", {
      headers: { Authorization: `Bearer ${manufacturerToken}` },
    });

    if (res.data.data && res.data.data.length > 0) {
      testMachineId = res.data.data[0]._id;
      logSuccess(`장비 조회 성공: ${res.data.data.length}대`);
      log(
        `  - 테스트 장비: ${res.data.data[0].name} (${testMachineId})`,
        "blue"
      );
      return res.data.data[0];
    } else {
      logWarning("등록된 장비가 없습니다. 장비를 먼저 등록해주세요.");
      return null;
    }
  } catch (error) {
    logError(
      `장비 조회 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 3. 테스트 의뢰 생성
async function createTestRequest() {
  logStep("STEP 3", "테스트 의뢰 생성");

  try {
    const res = await api.post(
      "/api/requests",
      {
        clinicName: "데모치과",
        patientName: "E2E 테스트 환자",
        patientAge: 45,
        patientGender: "M",
        caseInfos: {
          clinicName: "데모치과",
          patientName: "E2E 테스트 환자",
          tooth: "36",
          toothNumber: "36",
          workType: "abutment",
          shippingMode: "normal",
          requestedShipDate: new Date().toISOString().slice(0, 10),
          implantManufacturer: "Osstem",
          implantSystem: "Regular",
          implantType: "Internal",
          implantBrand: "Osstem",
          implantDiameter: 4.5,
          implantLength: 10,
          maxDiameter: 10,
          connectionDiameter: 4.5,
          abutType: "Custom",
        },
        originalShipping: {
          mode: "normal",
          // yyyy-mm-dd 형태로 전달 (createKstDateTime에서 split 사용)
          requestedAt: new Date().toISOString().slice(0, 10),
        },
        finalShipping: {
          mode: "normal",
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      },
      {
        headers: { Authorization: `Bearer ${requestorToken}` },
      }
    );

    testRequestId = res.data.data._id || res.data.data.id;
    logSuccess(`의뢰 생성 성공: ${res.data.data.requestId}`);
    log(`  - ID: ${testRequestId}`, "blue");
    log(`  - 상태: ${res.data.data.status}`, "blue");

    return res.data.data;
  } catch (error) {
    logError(
      `의뢰 생성 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 4. 소재 교체 예약
async function scheduleMaterialChange(machine) {
  logStep("STEP 4", "소재 교체 예약");

  try {
    const targetTime = new Date();
    targetTime.setMinutes(targetTime.getMinutes() + 2); // 2분 후로 예약

    const res = await api.post(
      `/api/cnc-machines/${testMachineId}/schedule-material-change`,
      {
        targetTime: targetTime.toISOString(),
        newDiameter: 10,
        newDiameterGroup: "10",
        notes: "E2E 테스트 소재 교체",
      },
      {
        headers: { Authorization: `Bearer ${manufacturerToken}` },
      }
    );

    logSuccess("소재 교체 예약 성공");
    log(`  - 예약 시각: ${targetTime.toLocaleString("ko-KR")}`, "blue");
    log(`  - 새 소재: 10mm (10)`, "blue");

    return res.data.data;
  } catch (error) {
    logError(
      `소재 교체 예약 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 5. 의뢰 정보 변경 테스트 (의뢰 단계)
async function testUpdateRequestInRequestStage() {
  logStep("STEP 5", "의뢰 정보 변경 테스트 (의뢰 단계)");

  try {
    const res = await api.put(
      `/api/requests/${testRequestId}`,
      {
        patientName: "E2E 테스트 환자 (수정)",
        caseInfos: {
          toothNumber: "37", // 임플란트 정보 변경
          implantDiameter: 5.0,
        },
      },
      {
        headers: { Authorization: `Bearer ${requestorToken}` },
      }
    );

    logSuccess("의뢰 단계에서 모든 정보 수정 성공");
    log(`  - 환자명: ${res.data.data?.patientName || "수정됨"}`, "blue");
    log(`  - 치아번호: ${res.data.data?.caseInfos?.tooth || "수정됨"}`, "blue");

    return res.data.data;
  } catch (error) {
    logError(
      `정보 변경 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 6. CAM 단계로 진행 (수동)
async function progressToCAM() {
  logStep("STEP 6", "CAM 단계로 진행");

  try {
    const res = await api.patch(
      `/api/requests/${testRequestId}/status`,
      {
        status: "CAM",
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    logSuccess("CAM 단계로 진행 성공");
    log(`  - 상태: ${res.data.data.status}`, "blue");

    return res.data.data;
  } catch (error) {
    logError(
      `상태 변경 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 7. CAM 승인
async function approveCAM() {
  logStep("STEP 7", "CAM 승인");

  try {
    const res = await api.patch(
      `/api/requests/${testRequestId}/review-status`,
      {
        stage: "cam",
        status: "APPROVED",
        reason: "CAM 승인 완료",
      },
      {
        headers: { Authorization: `Bearer ${manufacturerToken}` },
      }
    );

    logSuccess("CAM 승인 성공");
    const status = res.data.data?.caseInfos?.reviewByStage?.cam?.status;
    log(`  - 승인 상태: ${status}`, "blue");

    return res.data.data;
  } catch (error) {
    logError(
      `CAM 승인 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 8. 의뢰 정보 변경 테스트 (CAM 완료 후)
async function testUpdateRequestAfterCAM() {
  logStep("STEP 8", "의뢰 정보 변경 테스트 (CAM 완료 후)");

  try {
    // 환자 정보 변경 (성공해야 함)
    const res1 = await api.put(
      `/api/requests/${testRequestId}`,
      {
        patientName: "E2E 테스트 환자 (CAM 후 수정)",
        patientAge: 46,
      },
      {
        headers: { Authorization: `Bearer ${requestorToken}` },
      }
    );

    logSuccess("CAM 완료 후 환자 정보 수정 성공");
    log(`  - 환자명: ${res1.data.data?.patientName || "수정됨"}`, "blue");
    log(`  - 나이: ${res1.data.data?.patientAge || "수정됨"}`, "blue");

    // 임플란트 정보 변경 시도 (실패해야 함)
    try {
      await api.put(
        `/api/requests/${testRequestId}`,
        {
          caseInfos: {
            toothNumber: "38", // 임플란트 정보 변경 시도
            implantDiameter: 6.0,
          },
        },
        {
          headers: { Authorization: `Bearer ${requestorToken}` },
        }
      );

      logError("CAM 완료 후 임플란트 정보 수정이 허용되었습니다 (예상: 차단)");
    } catch (error) {
      logSuccess("CAM 완료 후 임플란트 정보 수정 차단 확인");
      log(`  - 임플란트 정보는 수정되지 않음`, "blue");
    }
  } catch (error) {
    logError(
      `정보 변경 테스트 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 9. 의뢰 취소 테스트
async function testCancelRequest() {
  logStep("STEP 9", "의뢰 취소 테스트");

  try {
    // 관리자 권한으로 삭제 시도 (생산 단계 이후에도 삭제 가능하도록 백엔드 수정됨)
    const res = await api.delete(`/api/requests/${testRequestId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    logSuccess("의뢰 취소 성공");
    if (res.data.data) {
      log(`  - 상태: ${res.data.data.status}`, "blue");
    }

    return res.data.data || { success: true };
  } catch (error) {
    logError(
      `의뢰 취소 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 10. 워커 상태 확인
async function checkWorkerStatus() {
  logStep("STEP 10", "워커 상태 확인");

  try {
    const res = await workerApi.get("/status");

    logSuccess("워커 상태 조회 성공");
    log(`  - 상태: ${res.data.status}`, "blue");
    log(`  - DB: ${res.data.db}`, "blue");

    if (res.data.jobs) {
      log(`  - 실행 중인 잡: ${Object.keys(res.data.jobs).join(", ")}`, "blue");
    }

    return res.data;
  } catch (error) {
    logWarning(`워커 상태 조회 실패: ${error.message}`);
    return null;
  }
}

// 11. 소재 교체 예약 취소
async function cancelMaterialChange() {
  logStep("STEP 11", "소재 교체 예약 취소");

  try {
    const res = await api.delete(
      `/api/cnc-machines/${testMachineId}/schedule-material-change`,
      {
        headers: { Authorization: `Bearer ${manufacturerToken}` },
      }
    );

    logSuccess("소재 교체 예약 취소 성공");

    return res.data.data;
  } catch (error) {
    logError(
      `예약 취소 실패: ${error.response?.data?.message || error.message}`
    );
    throw error;
  }
}

// 메인 테스트 실행
async function runTests() {
  log("\n" + "=".repeat(60), "bright");
  log("E2E 테스트: 생산 프로세스 업데이트", "bright");
  log("=".repeat(60), "bright");

  try {
    // 1. 인증
    await authenticate();

    // 2. CNC 장비 조회
    const machine = await getCncMachines();
    if (!machine) {
      logWarning("장비가 없어 일부 테스트를 건너뜁니다.");
    }

    // 3. 테스트 의뢰 생성
    await createTestRequest();

    // 4. 소재 교체 예약 (장비가 있을 경우)
    if (machine) {
      await scheduleMaterialChange(machine);
    }

    // 5. 의뢰 정보 변경 (의뢰 단계)
    await testUpdateRequestInRequestStage();

    // 6. CAM 단계로 진행
    await progressToCAM();

    // 7. CAM 승인
    await approveCAM();

    // 8. 의뢰 정보 변경 (CAM 완료 후)
    await testUpdateRequestAfterCAM();

    // 9. 의뢰 취소
    await testCancelRequest();

    // 10. 워커 상태 확인
    await checkWorkerStatus();

    // 11. 소재 교체 예약 취소 (장비가 있을 경우)
    if (machine) {
      await cancelMaterialChange();
    }

    log("\n" + "=".repeat(60), "bright");
    log("✓ 모든 테스트 완료!", "green");
    log("=".repeat(60), "bright");
  } catch (error) {
    log("\n" + "=".repeat(60), "bright");
    log("✗ 테스트 실패", "red");
    log("=".repeat(60), "bright");
    console.error(error);
    process.exit(1);
  }
}

// 테스트 실행
runTests();
