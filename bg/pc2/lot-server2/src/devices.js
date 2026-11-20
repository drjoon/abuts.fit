// change-log:
// - 2026-11-21: ffmpeg 장치 목록에서 현미경 카메라를 고른다.
// related files:
// - bg/pc2/lot-server2/src/capture.js

const AUTO_RANK = [/um20/i, /vitiny/i, /microscop/i, /usb camera/i, /uvc/i];

function cleanName(name) {
  return String(name || "").trim();
}

export function parseVideoDevices(text, platform) {
  const lines = String(text || "").split(/\r?\n/);
  if (platform === "darwin") return parseAvfoundation(lines);
  return parseDshow(lines);
}

function parseDshow(lines) {
  let section = "";
  const devices = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("video devices")) {
      section = "video";
      continue;
    }
    if (lower.includes("audio devices")) {
      section = "audio";
      continue;
    }
    if (section !== "video") continue;
    if (lower.includes("alternative name")) continue;
    if (/\(audio\)/i.test(line)) continue;
    const tagged = line.match(/"([^"]+)"\s+\(video\)/i);
    const plain = line.match(/"([^"]+)"/);
    const name = cleanName(tagged?.[1] || plain?.[1]);
    if (!name) continue;
    devices.push({ name, input: `video=${name}`, kind: "video" });
  }
  return devices;
}

function parseAvfoundation(lines) {
  let section = "";
  const devices = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("video devices")) {
      section = "video";
      continue;
    }
    if (lower.includes("audio devices")) {
      section = "audio";
      continue;
    }
    if (section !== "video") continue;
    const match = line.match(/\[(\d+)\]\s+(.+)$/);
    if (!match) continue;
    const name = cleanName(match[2]);
    if (!name) continue;
    devices.push({ name, input: match[1], kind: "video" });
  }
  return devices;
}

export function chooseDevice(devices, preferred) {
  const videos = (devices || []).filter((device) => device.kind === "video");
  const want = cleanName(preferred);
  if (want) {
    return (
      videos.find((device) => device.name === want) ||
      videos.find((device) => device.name.toLowerCase().includes(want.toLowerCase())) ||
      null
    );
  }
  const usable = videos.filter((device) => !/capture screen/i.test(device.name));
  const pool = usable.length ? usable : videos;
  for (const pattern of AUTO_RANK) {
    const hit = pool.find((device) => pattern.test(device.name));
    if (hit) return hit;
  }
  return pool[0] || null;
}
