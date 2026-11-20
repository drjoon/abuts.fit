// change-log:
// - 2026-11-21: 촬영 파일명을 KST로 만든다.
// related files:
// - bg/pc2/lot-server2/src/index.js

export function captureFileName(date, focused) {
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
  const tag = focused ? "af" : "cap";
  return `capture-${get("year")}${get("month")}${get("day")}-${hour}${get("minute")}${get("second")}-${ms}-${tag}.jpg`;
}

export const CAPTURE_NAME =
  /^capture-\d{8}-\d{6}-\d{3}-(af|cap)\.jpg$/;
