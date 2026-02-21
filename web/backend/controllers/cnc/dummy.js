import {
  CncMachine,
  getOrCreateCncMachine,
  getTodayYmdInKst,
  isKoreanBusinessDay,
} from "./shared.js";

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

export async function updateDummyEnabledBulk(req, res) {
  try {
    const { enabled } = req.body || {};
    const enabledProvided = enabled === true || enabled === false;
    const nextEnabled = enabledProvided ? enabled === true : true;

    await CncMachine.updateMany(
      { status: "active" },
      {
        $set: {
          "dummySettings.enabled": nextEnabled,
        },
      },
    );

    const machines = await CncMachine.find({ status: "active" })
      .sort({ machineId: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: machines.map((m) => ({
        machineId: m.machineId,
        dummySettings: m.dummySettings || null,
      })),
    });
  } catch (error) {
    console.error("Error in updateDummyEnabledBulk:", error);
    return res.status(500).json({
      success: false,
      message: "더미 가공 설정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

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

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
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

export async function updateDummySettings(req, res) {
  try {
    const { machineId } = req.params;
    const { enabled, programName, schedules, excludeHolidays } = req.body || {};

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const existingDummy = machine.dummySettings || {};

    const enabledProvided = enabled === true || enabled === false;
    const nextEnabled = enabledProvided
      ? enabled === true
      : existingDummy.enabled !== false;

    const nextProgram =
      typeof programName === "string"
        ? (programName || "").trim() || "O0100"
        : (existingDummy.programName || "O0100").trim() || "O0100";

    let nextSchedules =
      Array.isArray(schedules) && schedules.length >= 0
        ? schedules
        : Array.isArray(existingDummy.schedules)
          ? existingDummy.schedules
          : [];
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

    const nextExcludeHolidays =
      typeof excludeHolidays === "boolean"
        ? excludeHolidays
        : Boolean(existingDummy.excludeHolidays);

    machine.dummySettings = {
      enabled: nextEnabled,
      programName: nextProgram,
      schedules: nextSchedules,
      excludeHolidays: nextExcludeHolidays,
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
