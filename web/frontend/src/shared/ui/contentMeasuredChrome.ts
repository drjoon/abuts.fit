/**
 * 안내 크롬(쿠키 동의, 헤더 alert, 수가 변경 안내)의 가로폭.
 *
 * 뷰포트·부모 flex 남은 폭으로 늘리지 않는다.
 * 가로 = clamp(min, 문구 max-content + 컴포넌트 패딩, max).
 * 글자·아이콘·버튼 크기는 그대로다. 넓은 화면에서 더 키우지 않는다.
 *
 * - min `16rem`: 짧은 문구도 칩이 읽히게.
 * - max `min(100%, 48rem)`: 한 문장+버튼+안쪽 여백은 담고, 모니터 가로를 가로지르지 않음.
 * - `w-fit`: min~max 사이는 내용 폭. flex-1 / w-full / max-w-none 금지.
 *
 * 플로팅(쿠키)은 이 클래스를 얹고, 가용 영역(사이드바·채팅 버튼 제외)에서 가운데.
 * 헤더 alert는 같은 클래스로 왼쪽 흐름에 둔다. 가운데로 밀지 않는다.
 *
 * 큰 화면(2xl, 1536px+) 툴바는 의미 단위를 묶고 묶음 사이에만 간격을 둔다.
 * 묶음 안은 gap-1.5~2. 요소를 키우지 않는다.
 *
 * SSOT: `.cursor/rules/content-measured-chrome.mdc`, `web/frontend/rules.md`
 */
export const CONTENT_MEASURED_CHROME_CLASS =
  "w-fit min-w-[16rem] max-w-[min(100%,48rem)]";

/** 2xl+ 툴바. 묶음이 형제일 때 묶음 사이 간격. 그 아래는 한 줄. */
export const WIDE_CLUSTER_ROW_CLASS =
  "flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto 2xl:flex-wrap 2xl:gap-x-8 2xl:gap-y-2 2xl:overflow-visible";

/** 같은 줄에서 다음 의미 묶음 앞. */
export const WIDE_CLUSTER_SEPARATOR_CLASS = "2xl:ml-8";
