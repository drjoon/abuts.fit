// change-log:
// - 2026-11-24: dshow 목록에 섹션 헤더가 없어도 "(video)" 태그를 읽는다(ffmpeg 6.1).
// - 2026-11-23: Continuity/화면캡처 제외·장치 태그. 카메라 모듈과 함께 쓴다.
// - 2026-11-21: ffmpeg 장치 목록에서 현미경 카메라를 고른다.
// related files:
// - bg/pc2/lot-server2/src/camera.js
// - bg/pc2/lot-server2/src/capture.js

const AUTO_RANK = [/um20/i, /vitiny/i, /microscop/i, /usb camera/i, /uvc/i];

function cleanName(name) {
  return String(name || "").trim();
}

export function isScreenCapture(name) {
  return /capture screen|화면 기록|screen recording/i.test(String(name || ""));
}

export function isContinuityCamera(name) {
  const s = String(name || "");
  return /iphone|continuity|아이폰/i.test(s) || /의 iPhone|’s iPhone|'s iPhone/i.test(s);
}

export function isPreferredMicroscope(name) {
  return AUTO_RANK.some((pattern) => pattern.test(String(name || "")));
}

export function annotateDevices(devices) {
  return (devices || []).map((device) => ({
    ...device,
    continuity: isContinuityCamera(device.name),
    screen: isScreenCapture(device.name),
    preferred: isPreferredMicroscope(device.name),
  }));
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
    if (section === "audio") continue;
    if (lower.includes("alternative name")) continue;
    if (/\(audio\)/i.test(line)) continue;
    // ffmpeg 6.1 essentials 등은 "DirectShow video devices" 헤더 없이
    // "Name" (video) 줄만 출력한다. 태그가 있으면 섹션 없이도 채택한다.
    const tagged = line.match(/"([^"]+)"\s+\(video\)/i);
    if (tagged) {
      const name = cleanName(tagged[1]);
      if (name) devices.push({ name, input: `video=${name}`, kind: "video" });
      continue;
    }
    if (section !== "video") continue;
    const plain = line.match(/"([^"]+)"/);
    const name = cleanName(plain?.[1]);
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
  const videos = annotateDevices(
    (devices || []).filter((device) => device.kind === "video"),
  );
  const want = cleanName(preferred);
  if (want) {
    return (
      videos.find((device) => device.name === want) ||
      videos.find((device) =>
        device.name.toLowerCase().includes(want.toLowerCase()),
      ) ||
      null
    );
  }

  const notScreen = videos.filter((device) => !device.screen);
  const preferredPool = notScreen.filter((device) => device.preferred);
  if (preferredPool.length) return preferredPool[0];

  // Continuity(iPhone)는 자동 선택에서 뒤로 민다. 개발용 Mac에 FaceTime이 있으면 그걸 쓴다.
  const local = notScreen.filter((device) => !device.continuity);
  if (local.length) {
    for (const pattern of AUTO_RANK) {
      const hit = local.find((device) => pattern.test(device.name));
      if (hit) return hit;
    }
    return local[0];
  }

  const pool = notScreen.length ? notScreen : videos;
  for (const pattern of AUTO_RANK) {
    const hit = pool.find((device) => pattern.test(device.name));
    if (hit) return hit;
  }
  return pool[0] || null;
}
