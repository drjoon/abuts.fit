import axios from "axios";
import { CNC_BRIDGE_URL } from "../config.js";

export async function addMachine(payload) {
  const res = await axios.post(`${CNC_BRIDGE_URL}/machines`, payload);
  return res.data;
}

export async function deleteMachine(uid) {
  const res = await axios.delete(
    `${CNC_BRIDGE_URL}/machines/${encodeURIComponent(uid)}`
  );
  return res.data;
}

export async function getMachines() {
  const res = await axios.get(`${CNC_BRIDGE_URL}/machines`);
  return res.data;
}

export async function getMachineStatus(uid) {
  const res = await axios.get(
    `${CNC_BRIDGE_URL}/machines/${encodeURIComponent(uid)}/status`
  );
  return res.data;
}

export async function startMachine(uid) {
  const res = await axios.post(
    `${CNC_BRIDGE_URL}/machines/${encodeURIComponent(uid)}/start`
  );
  return res.data;
}

export async function stopMachine(uid) {
  const res = await axios.post(
    `${CNC_BRIDGE_URL}/machines/${encodeURIComponent(uid)}/stop`
  );
  return res.data;
}

export async function resetMachine(uid) {
  const res = await axios.post(
    `${CNC_BRIDGE_URL}/machines/${encodeURIComponent(uid)}/reset`
  );
  return res.data;
}

// 범용 RAW 호출: C# 브리지 /raw 로 그대로 전달
export async function callRaw(payload) {
  const res = await axios.post(`${CNC_BRIDGE_URL}/raw`, payload);
  return res.data;
}

export async function pauseAll() {
  const res = await axios.post(`${CNC_BRIDGE_URL}/emergency-stop`);
  return res.data;
}

export async function resumeAll() {
  const res = await axios.post(`${CNC_BRIDGE_URL}/resume-all`);
  return res.data;
}
