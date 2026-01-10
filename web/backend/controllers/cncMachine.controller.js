import CncMachine from "../models/cncMachine.model.js";
import Request from "../models/request.model.js";
import {
  getTodayYmdInKst,
  isKoreanBusinessDay,
} from "../utils/krBusinessDays.js";
import {
  getAllProductionQueues,
  recalculateQueueOnMaterialChange,
} from "./request/production.utils.js";

/**
 * CNC 장비 목록 조회
 */
export async function getMachines(req, res) {
  try {
    const machines = await CncMachine.find({ status: "active" }).sort({
      machineId: 1,
    });

    res.status(200).json({
      success: true,
      data: machines,
    });
  } catch (error) {
    console.error("Error in getMachines:", error);
    res.status(500).json({
      success: false,
      message: "장비 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 서버용: 더미 스케줄/프로그램 설정 조회
 * - 브리지는 인증 토큰 없이 X-Bridge-Secret으로만 접근
 * - excludeHolidays 적용을 위해 ymd(YYYY-MM-DD) 기준 영업일 여부도 함께 반환
 */
export async function getDummySettingsForBridge(req, res) {
  try {
    const ymdRaw = typeof req.query?.ymd === "string" ? req.query.ymd : "";
    const ymd = (ymdRaw || "").trim() || getTodayYmdInKst();
    const isBusinessDay = await isKoreanBusinessDay(ymd);

    const machines = await CncMachine.find({ status: "active" })
      .sort({ machineId: 1 })
      .lean();

    const list = Array.isArray(machines)
      ? machines.map((m) => ({
          machineId: m.machineId,
          dummySettings: m.dummySettings || null,
        }))
      : [];

    return res.status(200).json({
      success: true,
      data: {
        ymd,
        isBusinessDay,
        machines: list,
      },
    });
  } catch (error) {
    console.error("Error in getDummySettingsForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 더미 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 서버용: 더미 스케줄 idempotency 키(lastRunKey) 업데이트
 */
export async function updateDummyLastRunKeyForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const { lastRunKey } = req.body || {};

    const key = typeof lastRunKey === "string" ? lastRunKey.trim() : "";
    if (!key) {
      return res.status(400).json({
        success: false,
        message: "lastRunKey is required",
      });
    }

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.dummySettings = machine.dummySettings || {};
    machine.dummySettings.lastRunKey = key;
    await machine.save();

    return res.status(200).json({
      success: true,
      data: { machineId, lastRunKey: key },
    });
  } catch (error) {
    console.error("Error in updateDummyLastRunKeyForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 lastRunKey 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateMaterialRemaining(req, res) {
  try {
    const { machineId } = req.params;
    const { remainingLength } = req.body;

    if (
      typeof remainingLength !== "number" ||
      !Number.isFinite(remainingLength)
    ) {
      return res.status(400).json({
        success: false,
        message: "유효한 remainingLength 값이 필요합니다.",
      });
    }

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.currentMaterial = machine.currentMaterial || {
      diameter: 8,
      diameterGroup: "8",
    };
    machine.currentMaterial.remainingLength = remainingLength;
    await machine.save();

    return res.status(200).json({
      success: true,
      data: machine,
    });
  } catch (error) {
    console.error("Error in updateMaterialRemaining:", error);
    return res.status(500).json({
      success: false,
      message: "소재 잔여량 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 장비별 생산 큐 조회
 */
export async function getProductionQueues(req, res) {
  try {
    const requests = await Request.find({
      status: { $in: ["의뢰", "CAM", "생산"] },
    }).select("requestId status productionSchedule caseInfos");

    const queues = getAllProductionQueues(requests);

    // 각 큐에 위치 번호 추가
    for (const machineId in queues) {
      queues[machineId] = queues[machineId].map((req, index) => ({
        requestId: req.requestId,
        status: req.status,
        queuePosition: index + 1,
        estimatedDelivery: req.productionSchedule?.estimatedDelivery,
        diameter: req.productionSchedule?.diameter,
        diameterGroup: req.productionSchedule?.diameterGroup,
        clinicName: req.caseInfos?.clinicName,
        patientName: req.caseInfos?.patientName,
      }));
    }

    res.status(200).json({
      success: true,
      data: queues,
    });
  } catch (error) {
    console.error("Error in getProductionQueues:", error);
    res.status(500).json({
      success: false,
      message: "생산 큐 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 장비 소재 세팅 변경
 */
export async function updateMachineMaterial(req, res) {
  try {
    const { machineId } = req.params;
    const { diameter, diameterGroup, materialType, heatNo, remainingLength } =
      req.body;

    if (!diameterGroup || !["6", "8", "10", "10+"].includes(diameterGroup)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 직경 그룹입니다.",
      });
    }

    // 장비 조회
    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    // 소재 세팅 업데이트
    const nextMaterial = {
      materialType: String(materialType || "").trim(),
      heatNo: String(heatNo || "").trim(),
      diameter: diameter || parseInt(diameterGroup),
      diameterGroup,
      setAt: new Date(),
      setBy: req.user?._id,
    };
    if (
      typeof remainingLength === "number" &&
      Number.isFinite(remainingLength)
    ) {
      nextMaterial.remainingLength = remainingLength;
    }
    machine.currentMaterial = nextMaterial;
    await machine.save();

    // 해당 직경 그룹의 unassigned 의뢰를 이 장비에 할당
    const assignedCount = await recalculateQueueOnMaterialChange(
      machineId,
      diameterGroup
    );

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 세팅이 ${diameterGroup}mm로 변경되었습니다.`,
      data: {
        machine,
        assignedCount,
      },
    });
  } catch (error) {
    console.error("Error in updateMachineMaterial:", error);
    res.status(500).json({
      success: false,
      message: "소재 세팅 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 소재 교체 예약
 */
export async function scheduleMaterialChange(req, res) {
  try {
    const { machineId } = req.params;
    const { targetTime, newDiameter, newDiameterGroup, notes } = req.body;

    if (!targetTime || !newDiameterGroup) {
      return res.status(400).json({
        success: false,
        message: "목표 시각과 직경 그룹은 필수입니다.",
      });
    }

    if (!["6", "8", "10", "10+"].includes(newDiameterGroup)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 직경 그룹입니다.",
      });
    }

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.scheduledMaterialChange = {
      targetTime: new Date(targetTime),
      newDiameter: newDiameter || parseInt(newDiameterGroup),
      newDiameterGroup,
      scheduledBy: req.user?._id,
      scheduledAt: new Date(),
      notes: notes || "",
    };
    await machine.save();

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 교체가 예약되었습니다.`,
      data: machine,
    });
  } catch (error) {
    console.error("Error in scheduleMaterialChange:", error);
    res.status(500).json({
      success: false,
      message: "소재 교체 예약 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 소재 교체 예약 취소
 */
export async function cancelScheduledMaterialChange(req, res) {
  try {
    const { machineId } = req.params;

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.scheduledMaterialChange = undefined;
    await machine.save();

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 교체 예약이 취소되었습니다.`,
      data: machine,
    });
  } catch (error) {
    console.error("Error in cancelScheduledMaterialChange:", error);
    res.status(500).json({
      success: false,
      message: "소재 교체 예약 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 더미 프로그램/스케줄 설정 저장 (장비별)
 */
export async function updateDummySettings(req, res) {
  try {
    const { machineId } = req.params;
    const { programName, schedules, excludeHolidays } = req.body || {};

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    const nextProgram = (programName || "").trim() || "O0100";
    let nextSchedules = Array.isArray(schedules) ? schedules : [];
    nextSchedules = nextSchedules
      .map((s) => ({
        time: typeof s?.time === "string" ? s.time : "08:00",
        enabled: s?.enabled !== false,
      }))
      .filter((s) => !!s.time);
    if (nextSchedules.length === 0) {
      nextSchedules = [
        { time: "08:00", enabled: true },
        { time: "16:00", enabled: true },
      ];
    }

    const existingDummy = machine.dummySettings || {};
    machine.dummySettings = {
      programName: nextProgram,
      schedules: nextSchedules,
      excludeHolidays: Boolean(excludeHolidays),
      // 워커에서 사용하는 마지막 실행 키는 유지
      lastRunKey: existingDummy.lastRunKey || null,
    };
    await machine.save();

    return res.status(200).json({
      success: true,
      data: machine.dummySettings,
    });
  } catch (error) {
    console.error("Error in updateDummySettings:", error);
    return res.status(500).json({
      success: false,
      message: "더미 설정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 장비 초기 데이터 생성 (개발용)
 */
export async function initializeMachines(req, res) {
  try {
    // 기존 장비 삭제
    await CncMachine.deleteMany({});

    // M3, M4 장비 생성
    const machines = [
      {
        machineId: "M3",
        name: "CNC Machine M3",
        status: "active",
        currentMaterial: {
          diameter: 6,
          diameterGroup: "6",
          setAt: new Date(),
        },
        specifications: {
          maxDiameter: 12,
          minDiameter: 4,
          manufacturer: "DMG MORI",
          model: "NLX 2500",
        },
        location: "Production Floor A",
      },
      {
        machineId: "M4",
        name: "CNC Machine M4",
        status: "active",
        currentMaterial: {
          diameter: 8,
          diameterGroup: "8",
          setAt: new Date(),
        },
        specifications: {
          maxDiameter: 12,
          minDiameter: 4,
          manufacturer: "DMG MORI",
          model: "NLX 2500",
        },
        location: "Production Floor A",
      },
    ];

    const created = await CncMachine.insertMany(machines);

    res.status(201).json({
      success: true,
      message: "CNC 장비가 초기화되었습니다.",
      data: created,
    });
  } catch (error) {
    console.error("Error in initializeMachines:", error);
    res.status(500).json({
      success: false,
      message: "장비 초기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
