// change-log:
// - 2026-11-23: 인식 성공 파일명에 로트 3글자를 넣는다.
// - 2026-11-21: 촬영 파일명을 KST로 만든다.
// related files:
// - bg/pc2/lot-server2/src/index.js
// - bg/pc2/lot-server2/src/watch.js

function kstParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return {
    stamp: `${get("year")}${get("month")}${get("day")}-${hour}${get("minute")}${get("second")}-${ms}`,
  };
}

export function captureFileName(date, focused) {
  const { stamp } = kstParts(date);
  const tag = focused ? "af" : "cap";
  return `capture-${stamp}-${tag}.jpg`;
}

/** @param {Date} date @param {string} lot 영문 대문자 3글자 */
export function lotFileName(date, lot) {
  const { stamp } = kstParts(date);
  const code = String(lot || "").toUpperCase();
  return `lot-${stamp}-${code}.jpg`;
}

export const CAPTURE_NAME =
  /^capture-\d{8}-\d{6}-\d{3}-(af|cap)\.jpg$/;

export const LOT_FILE_NAME =
  /^lot-\d{8}-\d{6}-\d{3}-[A-Z]{3}\.jpg$/;

export const IMAGE_NAME = new RegExp(
  `^(?:${CAPTURE_NAME.source.slice(1, -1)}|${LOT_FILE_NAME.source.slice(1, -1)})$`,
);
