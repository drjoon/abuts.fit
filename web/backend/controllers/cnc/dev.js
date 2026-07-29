// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/cnc/production.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
import { CncMachine } from "./shared.js";

export async function initializeMachines(req, res) {
  try {
    await CncMachine.deleteMany({});

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
