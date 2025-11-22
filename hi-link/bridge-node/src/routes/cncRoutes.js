import { Router } from "express";
import {
  addMachine,
  deleteMachine,
  getMachines,
  getMachineStatus,
  startMachine,
  stopMachine,
  resetMachine,
  pauseAll,
  resumeAll,
  callRaw,
} from "../clients/cncBridgeClient.js";

const router = Router();

router.post("/machines", async (req, res) => {
  try {
    const data = await addMachine(req.body);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "addMachine failed" });
  }
});

router.delete("/machines/:uid", async (req, res) => {
  try {
    const data = await deleteMachine(req.params.uid);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "deleteMachine failed" });
  }
});

router.get("/machines", async (_req, res) => {
  try {
    const data = await getMachines();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "getMachines failed" });
  }
});

router.get("/machines/:uid/status", async (req, res) => {
  try {
    const data = await getMachineStatus(req.params.uid);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "getMachineStatus failed" });
  }
});

router.post("/machines/:uid/start", async (req, res) => {
  try {
    const data = await startMachine(req.params.uid);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "startMachine failed" });
  }
});

router.post("/machines/:uid/stop", async (req, res) => {
  try {
    const data = await stopMachine(req.params.uid);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "stopMachine failed" });
  }
});

router.post("/machines/:uid/reset", async (req, res) => {
  try {
    const data = await resetMachine(req.params.uid);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "resetMachine failed" });
  }
});

// 범용 RAW 라우트: body를 그대로 C# 브리지 /raw 로 전달
router.post("/raw", async (req, res) => {
  try {
    const data = await callRaw(req.body);
    res.json(data);
  } catch (err) {
    const status = err?.response?.status ?? 500;
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "raw call failed";
    console.error(`[raw] status=${status} msg=${msg}`);
    res.status(status).json({ error: msg });
  }
});

router.post("/pause-all", async (_req, res) => {
  try {
    const data = await pauseAll();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "pauseAll failed" });
  }
});

router.post("/resume-all", async (_req, res) => {
  try {
    const data = await resumeAll();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "resumeAll failed" });
  }
});

export default router;
