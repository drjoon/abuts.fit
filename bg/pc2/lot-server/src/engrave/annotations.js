// change-log:
// - 2026-11-27: 라벨 파일(프레임 회전 좌표 글자 상자) ↔ 데이터셋 표본(회전된 ROI 기준 0–1 상자) 바꾸기.
// related files:
// - bg/pc2/lot-server/scripts/seed-engrave.mjs
// - bg/pc2/lot-server/test/fixtures/engrave-annotations.json

import { roiPixels, rotateBox } from "./crops.js";

/**
 * 프레임을 rotation만큼 돌린 좌표의 상자 → 돌리기 전 프레임 좌표 → ROI를 같은 각도로 돌린 좌표(0–1).
 * @param {number[][]} boxesRotated
 * @param {{width:number,height:number}} frame 돌리기 전 프레임 크기
 */
export function boxesToRoi(boxesRotated, rotation, frame, roi) {
  const inv = (360 - (((rotation % 360) + 360) % 360)) % 360;
  const rw = rotation % 180 === 0 ? frame.width : frame.height;
  const rh = rotation % 180 === 0 ? frame.height : frame.width;
  const rect = roiPixels(roi, frame.width, frame.height);
  const rotW = rotation % 180 === 0 ? rect.width : rect.height;
  const rotH = rotation % 180 === 0 ? rect.height : rect.width;
  return boxesRotated.map((b) => {
    const o = rotateBox(b, rw, rh, inv); // 원 프레임 좌표
    const local = [o[0] - rect.left, o[1] - rect.top, o[2] - rect.left, o[3] - rect.top];
    const rb = rotateBox(local, rect.width, rect.height, rotation);
    return [rb[0] / rotW, rb[1] / rotH, rb[2] / rotW, rb[3] / rotH].map((v) => Math.round(v * 10000) / 10000);
  });
}

/** boxesToRoi의 반대: 회전된 ROI 기준 0–1 상자 → 프레임을 rotation만큼 돌린 좌표(px). */
export function roiBoxesToFrame(boxes, rotation, frame, roi) {
  const rect = roiPixels(roi, frame.width, frame.height);
  const rotW = rotation % 180 === 0 ? rect.width : rect.height;
  const rotH = rotation % 180 === 0 ? rect.height : rect.width;
  const inv = (360 - (((rotation % 360) + 360) % 360)) % 360;
  return boxes.map((b) => {
    const px = [b[0] * rotW, b[1] * rotH, b[2] * rotW, b[3] * rotH];
    const local = rotateBox(px, rotW, rotH, inv);
    const o = [local[0] + rect.left, local[1] + rect.top, local[2] + rect.left, local[3] + rect.top];
    return rotateBox(o, frame.width, frame.height, rotation).map((v) => Math.round(v));
  });
}
