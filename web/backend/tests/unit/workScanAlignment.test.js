// related files:
// - web/backend/utils/workScanAlignment.js
import {
  WORK_SCAN_EDITING_TTL_MS,
  buildWorkScanAlignment,
  currentWorkScanAlignment,
  isWorkScanEditingActive,
  sameKeySet,
  toWorkScanAlignmentApi,
} from "../../utils/workScanAlignment.js";

const row = (s3Key, scanRole) => ({ scanRole, file: { originalName: `${scanRole}-작업.dcm`, s3Key } });
const rows = [row("k/upper", "upper"), row("k/lower", "lower"), row("k/bite", "bite")];

describe("workScanAlignment", () => {
  test("같은 키 집합이면 순서와 무관하게 같다", () => {
    expect(sameKeySet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameKeySet(["a", "b"], ["a"])).toBe(false);
    expect(sameKeySet(["a", "b"], ["a", "c"])).toBe(false);
  });

  test("기록한 작업 스캔과 지금 목록이 같을 때만 유효하다", () => {
    const alignment = buildWorkScanAlignment({
      upper: true,
      lower: true,
      source: "auto",
      rows,
      at: new Date("2026-09-29T00:00:00.000Z"),
    });
    expect(currentWorkScanAlignment({ labWorkScanFiles: rows, workScanAlignment: alignment })).toBe(
      alignment,
    );
    expect(
      toWorkScanAlignmentApi({ labWorkScanFiles: rows, workScanAlignment: alignment }),
    ).toEqual({
      upper: true,
      lower: true,
      source: "auto",
      alignedAt: "2026-09-29T00:00:00.000Z",
    });

    // 기공소가 상악만 새로 저장하면 키가 달라져 예전 정렬 기록은 무효다.
    const relabeled = [row("k/upper-lab", "upper"), rows[1], rows[2]];
    expect(
      toWorkScanAlignmentApi({ labWorkScanFiles: relabeled, workScanAlignment: alignment }),
    ).toBeNull();
    expect(toWorkScanAlignmentApi({ labWorkScanFiles: [], workScanAlignment: alignment })).toBeNull();
  });

  test("AI 디자인 작업 중 표시는 TTL 안에서만 살아 있다", () => {
    const now = Date.parse("2026-09-29T00:10:00.000Z");
    const fresh = { workScanEditing: { at: new Date(now - 30 * 1000) } };
    const stale = { workScanEditing: { at: new Date(now - WORK_SCAN_EDITING_TTL_MS - 1) } };
    expect(isWorkScanEditingActive(fresh, now)).toBe(true);
    expect(isWorkScanEditingActive(stale, now)).toBe(false);
    expect(isWorkScanEditingActive({}, now)).toBe(false);
  });
});
