import CncMachine from "../models/cncMachine.model.js";
import Request from "../models/request.model.js";
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
    const { diameter, diameterGroup } = req.body;

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
    machine.currentMaterial = {
      diameter: diameter || parseInt(diameterGroup),
      diameterGroup,
      setAt: new Date(),
      setBy: req.user?._id,
    };
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
