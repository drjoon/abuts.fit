// related files:
// - web/backend/services/abutmentStl/evaluate.js
// - web/backend/scripts/abutment-stl-js/compare-golden.js
// - web/backend/scripts/abutment-stl-js/shadow-report.js
//
// 평가 레코드 목록 → 사람이 읽는 Markdown 리포트. 합격선은 두지 않는다.

const fmt = (x, d = 4) => (x == null || !Number.isFinite(Number(x)) ? "-" : Number(x).toFixed(d));

function dist(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).map(Math.abs).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const at = (q) => v[Math.min(v.length - 1, Math.floor((v.length - 1) * q))];
  return { n: v.length, p50: at(0.5), p90: at(0.9), p95: at(0.95), max: v[v.length - 1] };
}

function countBy(items, fn) {
  const out = {};
  for (const it of items) {
    const k = fn(it) ?? "-";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function distRow(label, d, unit = "mm", digits = 4) {
  if (!d.n) return `| ${label} | 0 | - | - | - | - |`;
  return `| ${label} | ${d.n} | ${fmt(d.p50, digits)} | ${fmt(d.p90, digits)} | ${fmt(d.p95, digits)} | ${fmt(d.max, digits)} ${unit} |`;
}

const ALIGN_LABEL = {
  same: "완전 일치 (본체 p99 ≤ 0.005mm)",
  z_offset_only: "Z 이동만 다름 (회전·XY 같음)",
  different: "다름",
};
const FL_LABEL = {
  same: "일치 (최대 ≤ 0.02mm)",
  follows_align_offset: "정렬 Z 차이만큼만 다름",
  different: "다름",
  js_missing: "JS 미검출",
  rhino_missing: "Rhino 기록 없음",
  both_missing: "둘 다 없음",
};

/**
 * @param {{ requestId: string, record: object, meta?: object }[]} rows
 * @param {{ title: string, notes?: string[] }} options
 */
export function buildMarkdownReport(rows, { title, notes = [] }) {
  const ok = rows.filter((r) => r.record?.status === "ok");
  const failed = rows.filter((r) => r.record?.status !== "ok");
  const R = (r) => r.record;
  const lines = [];
  lines.push(`# ${title}`, "");
  lines.push(`- 생성: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (KST)`);
  lines.push(`- 대상: ${rows.length}건 (JS 실행 성공 ${ok.length}, 실패 ${failed.length})`);
  if (ok[0]) lines.push(`- JS 버전: \`${R(ok[0]).jsVersion}\``);
  for (const n of notes) lines.push(`- ${n}`);
  lines.push("");

  lines.push("## 1. 정렬 (align)", "");
  lines.push("| 분류 | 건수 |", "| --- | --- |");
  for (const [k, n] of Object.entries(countBy(ok, (r) => R(r).align.kind))) {
    lines.push(`| ${ALIGN_LABEL[k] || k} | ${n} |`);
  }
  lines.push("");
  lines.push("| 지표 | n | p50 | p90 | p95 | max |", "| --- | --- | --- | --- | --- | --- |");
  lines.push(distRow("본체→Rhino 표면 거리 p99", dist(ok.map((r) => R(r).align.bodyDeviation?.p99))));
  lines.push(distRow("Z 차이 (Z 이동만 다른 건)", dist(ok.filter((r) => R(r).align.kind === "z_offset_only").map((r) => R(r).align.zOffset))));
  lines.push(distRow("헥스 appliedDeg 차이", dist(ok.map((r) => R(r).comparison.hexRotation.appliedDegDelta)), "°", 3));
  lines.push("");
  lines.push("스펙 대비 품질: z=0 단면 직경 − 커넥션 목표 직경 (|오차|).", "");
  lines.push("| 지표 | n | p50 | p90 | p95 | max |", "| --- | --- | --- | --- | --- | --- |");
  lines.push(distRow("JS", dist(ok.map((r) => R(r).quality.jsDiameterError))));
  lines.push(distRow("Rhino", dist(ok.map((r) => R(r).quality.rhinoDiameterError))));
  const closer = countBy(
    ok.filter((r) => R(r).align.kind !== "same" && R(r).quality.jsDiameterError != null && R(r).quality.rhinoDiameterError != null),
    (r) => {
      const j = Math.abs(R(r).quality.jsDiameterError);
      const h = Math.abs(R(r).quality.rhinoDiameterError);
      return Math.abs(j - h) < 0.002 ? "비슷" : j < h ? "JS가 목표에 더 가까움" : "Rhino가 목표에 더 가까움";
    },
  );
  lines.push("", `정렬이 다른 건의 목표 직경 근접: ${Object.entries(closer).map(([k, n]) => `${k} ${n}`).join(", ") || "-"}`, "");

  lines.push("## 2. 피니시라인", "");
  lines.push("| 분류 | 건수 |", "| --- | --- |");
  for (const [k, n] of Object.entries(countBy(ok, (r) => R(r).finishLine.kind))) lines.push(`| ${FL_LABEL[k] || k} | ${n} |`);
  lines.push("");
  const fam = countBy(ok, (r) => `Rhino ${R(r).finishLine.rhinoFamily || "-"} / JS ${R(r).finishLine.jsFamily || "-"}`);
  lines.push("| 전략 (Rhino / JS) | 건수 |", "| --- | --- |");
  for (const [k, n] of Object.entries(fam)) lines.push(`| ${k} | ${n} |`);
  lines.push("");
  lines.push("| 지표 | n | p50 | p90 | p95 | max |", "| --- | --- | --- | --- | --- | --- |");
  lines.push(distRow("폴리라인 최대 거리", dist(ok.map((r) => R(r).finishLine.deviation?.max))));
  lines.push(distRow("max_z 차이", dist(ok.map((r) => R(r).comparison.finishLine.maxZDelta))));
  lines.push(distRow("min_z 차이", dist(ok.map((r) => R(r).comparison.finishLine.minZDelta))));
  lines.push("");

  lines.push("## 3. 메타데이터 (stl-metadata 계산값)", "");
  lines.push("| 지표 | n | p50 | p90 | p95 | max |", "| --- | --- | --- | --- | --- | --- |");
  const m = (k) => dist(ok.map((r) => R(r).comparison.metadata[k]));
  lines.push(distRow("maxDiameter 차이", m("maxDiameterDelta")));
  lines.push(distRow("connectionDiameter 차이", m("connectionDiameterDelta")));
  lines.push(distRow("totalLength 차이", m("totalLengthDelta")));
  lines.push(distRow("l1 차이", m("l1Delta")));
  lines.push(distRow("taperAngle 차이", m("taperAngleDelta"), "°", 3));
  lines.push(distRow("frontPoint 거리", m("frontPointDistance")));
  lines.push(distRow("각인 위치 각도 차이", m("lotEngravingAngleDelta"), "°", 2));
  lines.push(distRow("각인 engraveZ 차이", m("lotEngravingZDelta")));
  lines.push("");

  lines.push("## 4. 최종 STL 표면", "");
  lines.push("스크류홀 패치·단차 메움(로프트)은 메시 구성이 달라 표면 거리로만 본다.", "");
  lines.push("| 지표 | n | p50 | p90 | p95 | max |", "| --- | --- | --- | --- | --- | --- |");
  lines.push(distRow("JS→Rhino p99", dist(ok.map((r) => R(r).comparison.surface?.jsToRhino?.p99))));
  lines.push(distRow("Rhino→JS p99", dist(ok.map((r) => R(r).comparison.surface?.rhinoToJs?.p99))));
  lines.push(distRow("Hausdorff", dist(ok.map((r) => R(r).comparison.surface?.hausdorff))));
  const sameAlign = ok.filter((r) => R(r).align.kind === "same");
  lines.push(distRow("정렬 일치 건 JS→Rhino p99", dist(sameAlign.map((r) => R(r).comparison.surface?.jsToRhino?.p99))));
  lines.push(distRow("정렬 일치 건 Rhino→JS p99", dist(sameAlign.map((r) => R(r).comparison.surface?.rhinoToJs?.p99))));
  const loftSame = sameAlign.filter((r) => R(r).js.fillSteps?.solid_mesh_created);
  lines.push(distRow("정렬 일치 + 단차 메움 건 JS→Rhino max", dist(loftSame.map((r) => R(r).comparison.surface?.jsToRhino?.max))));
  lines.push(
    "",
    "Rhino→JS 쪽 큰 값은 대부분 스크류홀 패치다. legacy 2.5mm 탐사 원이 채널 안으로 떨어진 Rhino 패치는 채널 속에 선 판 모양이고, JS는 첫 교점(시트)에 원판을 둔다.",
  );
  const fsCount = countBy(ok, (r) => R(r).js.fillSteps?.solid_mesh_created ? "단차 메움 생성" : R(r).js.fillSteps?.type || "실패");
  lines.push("", `JS fill_steps: ${Object.entries(fsCount).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  const hf = ok.filter((r) => R(r).counts.rhinoHfPatchTriangles > 0).length;
  lines.push(`Rhino 결과에 HF(서버 스크류홀 메움) 패치가 있는 건: ${hf} (비교에서 HF 삼각형은 뺐다)`, "");

  lines.push("## 5. 처리 시간 (JS, 건당)", "");
  lines.push("| 단계 | n | p50 | p90 | p95 | max |", "| --- | --- | --- | --- | --- | --- |");
  for (const k of ["align", "finishline", "screwhole", "fill_steps", "stl_metadata", "total"]) {
    lines.push(distRow(k, dist(ok.map((r) => R(r).js.perf?.[k])), "s", 3));
  }
  lines.push("");

  lines.push("## 6. 건별 (일치하지 않는 건)", "");
  lines.push("| 의뢰 | 정렬 | Z차이 | 목표직경 오차 JS / Rhino | 피니시라인 | FL 최대거리 | 전략 R/JS | maxZ 차이 | 표면 p99 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  const notSame = ok.filter((r) => R(r).align.kind !== "same" || R(r).finishLine.kind !== "same");
  for (const r of notSame) {
    const x = R(r);
    lines.push(
      `| ${r.requestId} | ${x.align.kind} | ${fmt(x.align.zOffset)} | ${fmt(x.quality.jsDiameterError, 3)} / ${fmt(x.quality.rhinoDiameterError, 3)} | ${x.finishLine.kind} | ${fmt(x.finishLine.deviation?.max)} | ${x.finishLine.rhinoFamily || "-"}/${x.finishLine.jsFamily || "-"} | ${fmt(x.comparison.finishLine.maxZDelta)} | ${fmt(x.comparison.surface?.jsToRhino?.p99)} |`,
    );
  }
  if (!notSame.length) lines.push("| - | | | | | | | | |");
  lines.push("");
  if (failed.length) {
    lines.push("## 7. JS 실패", "");
    for (const r of failed) lines.push(`- ${r.requestId}: ${R(r)?.error || R(r)?.status}`);
    lines.push("");
  }
  return lines.join("\n");
}
