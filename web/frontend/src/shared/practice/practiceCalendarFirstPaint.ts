/** 기공의뢰 캘린더 첫 응답이 그려진 뒤에 채팅·북마크 등 부가 조회를 시작한다. */

type Listener = () => void;

let painted = false;
const listeners = new Set<Listener>();

export function markPracticeCalendarFirstPaint() {
  if (painted) return;
  painted = true;
  for (const listener of listeners) listener();
  listeners.clear();
}

/** 캘린더가 그려지면 바로, 실패해도 fallbackMs 뒤에는 실행한다. */
export function whenPracticeCalendarPainted(
  run: () => void,
  fallbackMs = 1600,
) {
  let done = false;
  let timer = 0;
  const finish = () => {
    if (done) return;
    done = true;
    listeners.delete(finish);
    window.clearTimeout(timer);
    run();
  };
  if (painted) {
    finish();
    return () => {};
  }
  listeners.add(finish);
  timer = window.setTimeout(finish, fallbackMs);
  return () => {
    done = true;
    listeners.delete(finish);
    window.clearTimeout(timer);
  };
}
