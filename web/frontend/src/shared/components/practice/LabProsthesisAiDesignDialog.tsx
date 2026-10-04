// 기공소 채팅 헤더 — 작업시작 오른쪽 AI.
// - 2026-09-30: AI 디자인 헤더는 원래 높이. 닫기 X는 헤더 세로 가운데.
// - 2026-09-29: 모델 정렬 공유 — 서버 정렬 기록(workScanAlignment)으로 정렬 완료를 열고, 저장 때 archAligned를 남긴다.
//   열려 있는 동안 작업 중 표시를 보내 자동 정렬 잡이 작업 스캔을 바꾸지 못하게 한다.
//   자동 정렬 잡이 만든 스캔보다 올리지 못한 초안이 이긴다.
// - 2026-09-26: 헤더 의뢰 정보는 한 줄.
// - 2026-09-26: 스캔·마진·디자인 단계, 언더컷·교합 접촉, 치아별 생성.
// - 2026-09-26: 언더컷·교합은 헤더 중앙. 치아 정보는 설측 아래 트리. 스캔 파일은 세션 캐시.
// - 2026-09-26: 언더컷·교합·칼라·투명도는 작업영역 왼쪽 위. 파일명은 라벨로 끌어 역할을 바꾼다.
// - 2026-09-26: 작업영역 위 버튼은 헤더와 같은 높이.
// - 2026-09-26: 마진·디자인은 카메라를 유지한다. 치아 이름을 누르면 그 치아 교합면.
// - 2026-09-26: 삽입축은 치아 정보에서 보철마다. 브리지는 스팬당 하나.
// - 2026-09-26: 브리지 삽입축 버튼은 스팬 한가운데. 치아는 선으로 잇고 아래 번호는 없앤다.
// - 2026-09-26: 브리지 연결선은 치아 중심에서 끝난다. 삽입축은 그 선 중심 왼쪽.
// - 2026-09-26: 투명 체크는 지대치 외 스캔을 20%로 비추고, 끄면 불투명하다. 처음에는 꺼져 있다.
// - 2026-09-27: 언더컷과 교합 접촉 사이 마진.
// - 2026-09-27: 삽입축·언더컷·마진·교합 접촉 범례는 각 토글 바로 아래.
// - 2026-09-27: 마진을 확인한 뒤에만 생성한다. 범위·재료 프리셋·최소 두께 색.
// - 2026-09-27: 정중앙은 버튼 줄 한가운데. 칼라는 교합 접촉, 투명 앞. 표시 쉐브론은 하나만.
// - 2026-09-26: 치아 이름은 글자 너비. 삽입축은 파란 버튼. 치아를 누르면 잡은 카메라로.
// - 2026-09-26: 작업영역 위 정중앙 버튼이 가로·세로 점선을 켠다.
// - 2026-09-26: 마진·삽입·내면·형상·훅·컷백·홀·커넥터를 작업 영역에서 고친다.
// - 2026-09-26: 삽입축이 잡히고 화면에 보이면 언더컷도 같이 칠한다.
// - 2026-09-26: 사이드바 제거. 표시는 위, 수정은 왼쪽 아래 패널. 작업영역 아래 생성 배지 제거.
// - 2026-09-26: 삽입축을 잡으면 치아·잇몸 색이 갈라지는 곳을 마진으로 다시 잡는다.
// - 2026-09-26: 마진은 기본 원보다 바깥을, 삽입축으로 스캔 면에 붙여 잡는다.
// - 2026-09-26: 표시 패널은 맨 위. 닫으면 글자 너비. 단계 접기는 패널 위.
// - 2026-09-26: 언더컷부터 정중앙은 작업영역 위 중앙. 색 범례는 그 배지 바로 아래.
// - 2026-09-26: 스캔 단계에 모델 정렬. 수동은 고른 악과 바이트만 좌우로 두고 점 3개로 붙인다.
// - 2026-09-26: 수동 정렬의 두 모델은 화면 가운데에 좁은 간격으로 나란히 둔다.
// - 2026-09-26: 정렬 안내 문장은 버튼 툴팁으로만.
// - 2026-09-26: 모델 정렬이 돌아가는 동안 취소할 수 있다.
// - 2026-09-26: 작업 저장·전체 생성은 없앤다. 작업은 IndexedDB에 두고 닫을 때 서버에 올린다.
// - 2026-09-26: 작업 스캔은 의뢰 파일이 아니라 채팅 작업 파일에 둔다.
// - 2026-09-26: 헤더에 자동 저장 스위치와 실행 취소·다시 실행.
// - 2026-09-26: 페인트로 표시한 뒤 채팅에 첨부.
// - 2026-09-26: 카메라 각도·위치·줌이 바뀌면 작업 초안에 둔다.
// - 2026-09-26: 닫기는 바로 하고, 작업 스캔 업로드·저장은 뒤에서 한다.
// - 2026-09-26: 자동 맞춤·삽입축처럼 문서를 바꾸는 명령마다 작업 초안을 저장한다.
// - 2026-09-27: 패널 닫기·열기 아이콘. 가로가 좁으면 헤더 버튼은 아이콘만.
// - 2026-09-27: 가이드 버튼 라벨은 없음 → 중앙선 → 모눈종이.
// - 2026-09-27: 모달을 닫으면 작업영역 위 토글을 남긴다. 정중앙은 모눈(2mm·10mm)까지 순환한다.
// - 2026-09-27: 표시 패널은 파일명을 기본으로 숨긴다. 헤더에서 닫거나 숨긴 뒤 열면 직전 패널 열림을 되돌린다.
// - 2026-09-27: 패널은 열기·닫기·숨김. 헤더 날짜는 도착일만.
// - 2026-09-27: 브리지는 지대치·폰틱을 나누고, 커넥터마다 연결·모양·단면적을 고친다. 스팬 단위 생성·조립·분리.
// - 2026-09-27: 모델정렬 위저드. 바이트 정렬·삽입축이 안 끝났으면 작업영역 아래에 하나씩 안내하고, 끝나면 마진·디자인 짧은 안내로 이어간다.
// - 2026-09-27: 바이트는 열 때 자동으로 맞으므로 위저드의 모델정렬 안내는 뺀다. 삽입축부터 안내한다.
// - 2026-09-27: 작업영역 아래 안내 카드는 문장 너비. 뷰포트보다 길면 띄어쓰기에서만 줄바꿈한다.
// - 2026-09-27: 위저드 카드의 삽입축 버튼은 없애고, 치아 정보의 해당 삽입축 버튼을 깜빡인다. 카드 좌우 화살표로 단계를 옮긴다.
// - 2026-09-27: 헤더 치과·환자명 옆 `< # >`. #은 미완료 의뢰 건수, 화살표로 이전·다음 의뢰를 연다. 떠나는 의뢰는 닫기처럼 뒤에서 저장한다.
// - 2026-09-27: 범위 모델까지면 「모델」 단계. 종류·받침 높이·다이 분리·간격을 고르고 buildStoneModel로 만든다. 모델을 보는 동안 스캔은 가린다.
// - 2026-09-27: 마진을 잡으면 다이를 자동으로 만든다. 작업영역 위 다이 토글.
// - 2026-09-27: 치아 정보의 상악·하악·치아 번호 왼쪽 체크로 화면 표시를 고른다. 다이 토글은 체크한 치아의 다이만. 치아 번호는 그 교합면으로만 옮긴다.
// - 2026-09-27: 오른쪽 아래 교합면·협측·설측·맞춤 버튼은 없앤다. 삽입축을 잡으면 그 화면으로 X·Y·Z를 다시 잡는다.
// - 2026-09-27: 인레이·온레이는 와동 테두리를 마진으로 잡고, 와동만 채운 형상을 만든다. 와동 벽 테이퍼·언더컷, 전용 재료 숫자, 위저드 두께·내보내기 단계.
// - 2026-09-27: 내보내기·이미지 저장·페인트·채팅 첨부는 치아 정보 아래. 페인트를 그린 뒤 포인터 옆에 이미지 저장·채팅 첨부 뱃지를 두고, 다른 곳을 누르면 뱃지만 없앤다.
// - 2026-09-27: 마진 수정. 점은 스캔 면을 따라 끌고, 펜은 그은 구간을 다시 그린다. 지우면 점을 찍어 닫고, 다시 검출은 찍은 시작점부터. 조정 간격·언더컷 토글, 언더컷을 지나면 경고.
// - 2026-09-27: 삽입축은 수동으로 잡는다. 「삽입축 설정」 → 화면을 멈출 때마다 미리보기 → 「삽입축 확정」. 확정 전에는 저장하지 않는다.
// - 2026-09-27: 위저드 말풍선은 버튼을 가려 없앤다. 삽입축을 안 잡은 보철이 있으면 작업영역 가운데에 자동·화면 각도 뱃지를 띄운다.
// - 2026-09-27: 스캔을 열면 저장된 축이 없는 보철마다 삽입축을 자동으로 잡는다. 못 잡으면 교합면으로 보여 주고 뱃지에서 화면을 맞추라고 안내한다.
// - 2026-09-27: 내면 설정. 헤더 톱니 → 기공소 디자인 프리셋(크라운·인레이온레이·임플란트 열, 연결 치과). 치아 정보에서 생성 전 프리셋을 고르고, 내면 도구에서 복사·수정 뒤 적용한다. 예전 브라우저 치과 프리셋은 없앤다.
// - 2026-09-28: 채팅 첨부를 누르면 AI 디자인을 닫고 채팅으로 돌아간다.
// - 2026-09-28: 헤더 설정(톱니)에 확대율(기본 120%)과 디자인 프리셋 목록. 프리셋을 누르면 프리셋 창을 연다.
// - 2026-09-28: 헤더 자동 저장 스위치를 설정(톱니) 팝오버 맨 위로 옮긴다.
// - 2026-09-28: 스캔 단계에 메시 편집(다듬기·구멍 메우기·조각). 편집 한 번이 실행 취소 한 칸이고, 바뀐 스캔은 작업 스캔으로 저장한다.
// - 2026-09-28: 「전달」 패널은 버튼 글자 너비. 순서는 페인트, 이미지 저장, 채팅 첨부. 표시 색은 여섯 개이고 패널 너비 안에서 가운데 정렬한다.
// - 2026-09-29: 「전달」 패널 제거. 헤더 설정 왼쪽 페인트 아이콘을 켜면 작업영역 아래에 도구 막대(펜·화살표·사각형·원·점·글자, 색·굵기, 되돌리기·지우기, 이미지 저장·채팅 첨부).
// - 2026-09-29: 헤더 패널 닫기·열기는 오른쪽 설정 옆 아이콘만. 헤더 실행 취소·다시 실행 버튼 제거(단축키는 유지).
// - 2026-09-29: 「밀링」 단계. 생성한 보철을 98.5mm 디스크에 배치하고 핀·소결 배율과 함께 디스크 좌표 STL로 낸다(LabMillingStage).
// - 2026-09-29: 칼라맵. 작업영역 위 「칼라맵」 토글 아래 범위 막대에서 간섭(대합·인접)·두께·내면 간격을 고르고 범위(±0.1~1mm)를 바꾼다. 마우스 자리 값은 mm. 기존 「칼라」는 「스캔색」.
//   크라운 내면은 지대치 스캔에서 실제 메시로 만들어 외면·STL에 붙인다(내면 도구의 「지대치에서 내면 생성」).
// - 2026-09-29: 표시는 치아 정보 안. 파일명은 툴팁. 메모 패널은 제거. 왼쪽은 AI 채팅. 범위(마진만·크라운까지·모델까지)는 없애고 단계만 연다.
// - 2026-09-29: 스캔 묶음은 없애고 상악·바이트·하악 줄에 파일명을 붙인다. 끌어 역할을 맞바꾼다. 브리지 연결선은 치아 가운데에서 잇는다.
// - 2026-09-30: 단계는 왼쪽 위(내용이 길어도 작업영역 높이까지). 치아 정보는 오른쪽 위, AI 채팅은 오른쪽 아래. 제목을 끌면 옮기고, 놓으면 가까운 가장자리에 여백을 두고 붙는다.
// - 2026-09-30: AI 채팅 내용 영역을 조금 키운다. 빈 화면과 입력 안내 문구는 「AI에게 디자인 명령해주세요」.
// - 2026-09-30: 치아 정보 가로는 내용만큼. 임플란트 제조사는 대문자 하나로 모으고, 처음 선택은 치과가 지정한 제조사.
// - 2026-09-30: 확대율은 헤더 패널 닫기 왼쪽의 퍼센트. 설정에서는 뺀다.
// - 2026-09-30: 작업영역 위 레전드 제거. 점 색은 버튼 아이콘. 투명 버튼 제거. 스캔색은 원본 색과 파란색을 오간다.
// - 2026-09-30: 확대율은 100~175, 200~300, 50~90 세 줄. 치아 정보 프리셋은 「 - 」 앞을 빼고, 악 색은 체크박스. 브리지 삽입축과 연결선 사이에 여백.
// - 2026-09-30: 확대율 팝오버는 50%부터 차례로 같은 너비 다섯 칸씩 세 줄.
// - 2026-09-30: 헤더 창닫기 X는 크고 빨간 버튼.
// - 2026-09-30: 가이드 기본은 모눈종이. 저장값이 있으면 그 토글을 그대로 연다.
// - 2026-09-30: 임플란트·스캔바디는 치과 의뢰를 먼저 쓴다. 의뢰와 다르게 바꾸면 확인 뒤에만 반영한다.
// - 2026-09-30: 상악·하악 표시는 파일명 역할 그대로다. 치관으로 역할을 바꾸거나 그 초안 메시를 다시 열지 않는다.
// - 2026-09-30: 설정 → 단축키·마우스. 어벗츠(기본)·exocad·3Shape 프리셋과 직접 설정. 단축키는 프로필을 따른다.
// - 2026-10-01: 재료·임플란트·스캔바디는 치아 정보 헤더 톱니 모달에서 본다. 싱글 크라운 삽입축은 맨 왼쪽. 스크류홀은 아이콘.
// - 2026-10-01: 치아 정보 체크 아이콘 툴팁은 마진을 잡았는지, 확인했는지를 말한다.
// - 2026-10-01: 치아 정보 모달의 재료는 제목 줄, 브리지 왼쪽. 치과에서 넘어온 재료·라이브러리는 바꾸지 않는다.
// - 2026-10-01: 스캔바디 라이브러리 형상은 스캔이 열리면 맞춤이 없는 임플란트에 자동으로 겹친다.
// - 2026-10-01: 스캔바디 맞춤은 디자인 도구에서 빼 스캔 단계 메시 편집 아래에 둔다.
// - 2026-10-01: 단계 하위 메뉴는 셰브론 아코디언이다. 하나를 열면 같은 단계의 나머지는 닫힌다.
// - 2026-10-01: 치아를 눌러도 번호·유형을 다시 고르지 않는다. 치과 의뢰 치식 그대로 진행한다.
//   스캔바디 제목의 브리지 범위는 고른 치아와 상관없이 악궁 순서다.
// - 2026-10-04: 「삽입축 설정」이 바로 잡고, 확정·취소는 없다. 다시 잡으려면 치아 정보 아이콘을 누른다.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  cloneElement,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowDownToLine,
  Check,
  CircleDot,
  Crosshair,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cylinder,
  Library,
  Link2,
  MessageSquare,
  Paintbrush,
  PanelLeftClose,
  PanelLeftDashed,
  PanelLeftOpen,
  Pencil,
  Rainbow,
  Send,
  Settings,
  Palette,
  Sparkles,
  Spline,
  Trash2,
  TriangleAlert,
  Unlink,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LabColorMapBar } from "@/shared/components/practice/LabColorMapBar";
import type { CrownIntaglioInfo } from "@/shared/components/practice/labProsthesisEditLayer";
import { DEFAULT_COLOR_MAP, type ColorMapState } from "@/shared/practice/labColorMap";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  announceUiTextZoom,
  applyStoredUiTextZoom,
  applyUiTextZoom,
  resolveUiTextZoomShortcut,
  stepZoom,
} from "@/shared/ui/uiTextZoom";
import { apiFetch } from "@/shared/api/apiClient";
import { setFileBlob } from "@/shared/files/fileBlobCache";
import {
  fetchS3BlobCached,
  s3FileBlobCacheKey,
} from "@/shared/files/s3BlobCache";
import { useS3TempUpload } from "@/shared/hooks/useS3TempUpload";
import { useToast } from "@/shared/hooks/use-toast";
import {
  fileFromImageBlob,
  fileFromModelBlob,
} from "@/shared/files/modelPreviewFile";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  LabBasketTagGuideButton,
  LabBasketTagPickerButton,
} from "@/shared/components/practice/LabBasketTagToolbar";
import { ConnectorFocusView } from "@/shared/components/practice/ConnectorFocusView";
import {
  DesignExportDialog,
  type DesignExportBusy,
  type DesignExportRestoration,
  type DesignExportScan,
  type DesignExportSelection,
} from "@/shared/components/practice/DesignExportDialog";
import { MeshUnionError, meshUnionErrorMessage } from "@/shared/practice/meshUnion";
import {
  OralScanOverlayViewer,
  type ConnectorSectionShot,
  type OralScanConnectorChip,
  type JawSnapshot,
  type OralScanOcclusionAdjust,
  type OralScanOverlayHandle,
  type OralScanOverlaySource,
  type OralScanToothBadge,
  type OralScanWorldTurn,
  type StoneModelPartSummary,
} from "@/shared/components/practice/OralScanOverlayViewer";
import {
  LabProsthesisModifyPanel,
  ScanbodyAlignSection,
  type ConnectorRow,
  type ScanbodyControls,
} from "@/shared/components/practice/LabProsthesisModifyPanel";
import { LabToothTypeCard } from "@/shared/components/practice/LabToothTypeCard";
import { LabImplantLibraryPicker } from "@/shared/components/practice/LabImplantLibraryPicker";
import {
  buildImplantLibraries,
  implantLibraryFollowsOrder,
  matchImplantLibrary,
  readImplantFavorites,
  scanbodyShapeOf,
  writeImplantFavorites,
  type ImplantLibrary,
} from "@/shared/practice/implantLibrary";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import {
  abutmentTemplateFor,
  loadScanbodyGeometry,
  loadTemplateModel,
  matchOrderedScanbody,
  orderTemplateSpec,
  orderedScanbodyCandidates,
  scanbodyCandidatesFor,
  templateSpecLabel,
  uploadScanbodyFilesAndWait,
  uploadTemplateFileAndWait,
  uploadScanbodyMeshAndWait,
  scanbodySpecKey,
  isMeshFileName,
  MESH_FILE_ACCEPT,
  useScanbodyCatalog,
  type TemplateSpec,
} from "@/shared/practice/scanbodyLibraryApi";
import { ScanbodyLibraryUpdatePrompt } from "@/shared/components/practice/ScanbodyLibraryUpdatePrompt";
import { meshExtent, type ScanbodyMesh } from "@/shared/practice/scanbodyRegistration";
import {
  ViewPaintSurface,
  downloadBlobFile,
  paintNoteFileName,
} from "@/shared/components/practice/ViewPaintSurface";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";
import {
  ViewPaintToolbar,
  useViewPaint,
  viewPaintSurfaceProps,
} from "@/shared/components/practice/ViewPaintToolbar";
import { VIEW_GESTURE_HINT_LAYER_CLASS, ViewGestureHint } from "@/shared/components/ViewGestureHint";
import {
  buildLabProsthesisAiPlan,
  isOralScanMeshName,
  oralScanRoleLabel,
  newestWorkScanUploadedAtMs,
  preferWorkingOralScanFiles,
  initialLabOralScanVisible,
  prepArchFromProsthesisTeeth,
  resolveOralScanRole,
  formatProsthesisAiToothLabel,
  applyToothOverrides,
  labToothBadgeLabel,
  labToothKindOf,
  type LabOralScanRole,
  type LabProsthesisAiTooth,
  type LabToothKind,
  type LabToothOverride,
  type WorkScanRole,
} from "@/shared/practice/labProsthesisAiDesign";
import {
  isMachineWorkScanAlignment,
  type WorkScanAlignment,
} from "@/shared/practice/workScanAlignment";
import {
  assignNewerDraftFiles,
  dropWorkDraftRoles,
  newerDraftRoles,
  readWorkDraft,
  stampWorkDraftSavedAt,
  writeWorkDraftMeshes,
  writeWorkSession,
  parseViewToggles,
  writeWorkSessionDocument,
  toPersistedAiChat,
  type AiDesignChatTurn,
  type WorkDraftMesh,
  type WorkSessionAxis,
  type WorkSessionCenterGuide,
  type WorkSessionDocument,
  type WorkSessionViewToggles,
} from "@/shared/practice/labProsthesisWorkDraft";
import {
  undercutLimitFromRange,
  type ContactPaintMode,
} from "@/shared/practice/oralScanDesignAnalysis";
import {
  alignPresetToKind,
  applyDesignPreset,
  applyDetectedMargin,
  applyMarginTrace,
  clinicKeyFromCasePrimary,
  connectorIsWeak,
  createToothDesignEdit,
  DEFAULT_SCULPT_BRUSH,
  DEFAULT_MODEL_SETTINGS,
  MARGIN_POINT_COUNT,
  MODEL_DIE_GAP_RANGE_MM,
  MODEL_HEIGHT_RANGE_MM,
  MODEL_KINDS,
  redetectMargin,
  reduceDesignGesture,
  type DesignGesture,
  type DesignScope,
  type EditBrush,
  type MarginEditMode,
  type MarginReview,
  type ModelSettings,
  type ModifyTool,
  type ScanbodyShape,
  type RefineTab,
  type SculptBrush,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import {
  applyDetectedCavity,
  CAVITY_TAPER_RECOMMENDED,
  cavityKindOf,
  cavityTaperSummary,
  defaultCavityMargin,
  designIsThin,
  type CavityKind,
} from "@/shared/practice/labInlayDesign";
import {
  casePresetId,
  findDesignPreset,
  innerKindOf,
  type DesignPresetLibrary,
} from "@/shared/practice/labDesignPresets";
import { useLabDesignPresets } from "@/shared/practice/labDesignPresetApi";
import {
  DEFAULT_SCAN_MESH_EDIT,
  EMPTY_SCAN_MESH_EDIT_STATUS,
  sameScanMeshEditStatus,
  type ScanMeshEdit,
  type ScanMeshEditStatus,
} from "@/shared/practice/scanMeshEdit";
import { MeshEditSection, StageSubsection } from "@/shared/components/practice/LabMeshEditSection";
import {
  LabMillingDiscView,
  LabMillingPanel,
  useLabMilling,
} from "@/shared/components/practice/LabMillingStage";
import { EMPTY_MILLING_DOCUMENT, type MillingDocument } from "@/shared/practice/labMilling";
import { LabDesignPresetDialog } from "@/shared/components/practice/LabDesignPresetDialog";
import { LabDesignControlsDialog } from "@/shared/components/practice/LabDesignControlsDialog";
import {
  DESIGN_CONTROL_PRESETS,
  getDesignControls,
  matchDesignKey,
  useDesignControlPrefs,
  type DesignKeyAction,
} from "@/shared/practice/labDesignControls";
import {
  compareArch,
  fdiToothDigits,
  insertionAxisKey,
  sortByArch,
} from "@/shared/practice/toothArchOrder";

type AiDesignFile = {
  fileName?: string | null;
  scanRole?: string | null;
  s3Key?: string | null;
  uploadedAt?: string | null;
};

export type WorkingScansPersisted = {
  files?: unknown;
  trashedFiles?: unknown;
  workScanFiles?: unknown;
  workScanAlignment?: unknown;
};

type LabProsthesisAiCaseHeader = {
  /** 예: 테스트치과 · 노해인4 */
  primary?: string | null;
  /** 예: 주문 2026-09-26 · 도착 2026-10-07. 헤더에는 도착일만 쓴다. */
  dates?: string | null;
};

/** 헤더 `< # >`. #은 미완료 의뢰 건수, 화살표는 이전·다음 의뢰. */
export type LabProsthesisAiCaseNav = {
  count: number;
  /** 지금 의뢰의 순번(0부터). 미완료 목록에 없으면 null. */
  position: number | null;
  onMove: (step: -1 | 1) => void;
};

/** 열기=본문, 닫기=제목만, 숨김=패널 없음. 버튼은 다음 동작. */
type PanelLayout = "open" | "closed" | "hidden";

/** 헤더로 접기 전에 기억해 두는 패널 본문. */
type PanelOpenMemory = {
  chat: boolean;
  modify: boolean;
  toothInfo: boolean;
};

const defaultPanelOpenMemory = (): PanelOpenMemory => ({
  chat: true,
  modify: true,
  toothInfo: true,
});

function panelLayoutAction(layout: PanelLayout): string {
  if (layout === "open") return "패널 닫기";
  if (layout === "closed") return "패널 숨김";
  return "패널 열기";
}

type LabProsthesisAiBasketTag = {
  value: string;
  occupiedTags?: ReadonlySet<string> | null;
  onChange: (tag: string) => void;
};

type LabProsthesisAiDesignButtonProps = {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string | null;
    prosthesisType?: string | null;
    bridgeLinkedTeeth?: readonly string[] | null;
    customAbutment?: boolean | null;
    implantManufacturer?: string | null;
    implantBrand?: string | null;
    implantFamily?: string | null;
    implantType?: string | null;
    abutmentManufacturer?: string | null;
    abutmentDiameter?: string | null;
    abutmentHeight?: string | null;
  }> | null;
  files?: ReadonlyArray<AiDesignFile> | null;
  authToken?: string | null;
  /** 기공소 수신 의뢰. 작업 DCM은 이 의뢰의 작업 파일에 붙인다. */
  transferId?: string | null;
  /** 채팅 작업 파일의 작업 스캔. 의뢰 파일보다 나중이면 이걸 연다. */
  workScanFiles?: ReadonlyArray<AiDesignFile> | null;
  /** 작업 스캔의 모델 정렬 기록. 자동 정렬 잡이나 다른 PC에서 맞춘 스캔이면 정렬 완료로 연다. */
  workScanAlignment?: WorkScanAlignment | null;
  onWorkingScansPersisted?: (data: WorkingScansPersisted) => void;
  /** 표시가 입혀진 현재 뷰를 채팅 첨부로 넘긴다. */
  onAttachChatFile?: (file: File) => void;
  onRemoveChatFile?: (file: File) => void;
  onReorderChatFiles?: (files: File[]) => void;
  caseHeader?: LabProsthesisAiCaseHeader | null;
  /** 채팅 헤더와 같은 바구니 번호표 */
  basketTag?: LabProsthesisAiBasketTag | null;
  caseNav?: LabProsthesisAiCaseNav | null;
  className?: string;
};

type AssignableScanRole = Exclude<LabOralScanRole, "other">;

type MeshSource = {
  id: string;
  fileName: string;
  role: AssignableScanRole;
};

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;
/** 내보내기 목록에서 모델 파트 행. 뒤는 StoneModelPart.id. */
const STONE_ROW_PREFIX = "stone:";
const GHOST_OPACITY_ON = 0.2;
/** 실제 형상 정합 평균 거리가 이보다 크면 기공소에 알린다(mm). */
const SCANBODY_FIT_WARN_MM = 0.1;
/** 같은 세션에서 다시 열면 IndexedDB·네트워크 대신 이 파일을 쓴다. */
const sessionScanFileCache = new Map<string, File>();
const ROLE_CHECK: Record<LabOralScanRole, string> = {
  upper: "border-blue-500 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white",
  lower: "border-amber-500 data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:text-white",
  bite: "border-teal-500 data-[state=checked]:border-teal-500 data-[state=checked]:bg-teal-500 data-[state=checked]:text-white",
  other: "border-slate-400 data-[state=checked]:border-slate-400 data-[state=checked]:bg-slate-400 data-[state=checked]:text-white",
};

/** 프리셋 이름 「기본 - 3D 프린트」는 뒤 내용만 보여 준다. */
function presetDisplayName(name: string) {
  const cut = name.indexOf(" - ");
  return cut >= 0 ? name.slice(cut + 3) : name;
}

type WorkCloseSnapshot = {
  id: string;
  token: string;
  dirty: WorkDraftMesh[];
  document: WorkSessionDocument;
  pendingRoles: WorkScanRole[];
  serverAt: ReadonlyMap<WorkScanRole, number>;
};

type DesignStage = "scan" | "margin" | "design" | "model" | "milling";

type AlignWizardStep =
  | { kind: "axis"; span: string[]; page: number; pages: number }
  | { kind: "library"; tooth: string }
  | { kind: "scanbody"; tooth: string }
  | { kind: "margin" }
  | { kind: "design" }
  | { kind: "thickness" }
  | { kind: "export" };

function isOpposingOrBite(
  role: AssignableScanRole,
  prepArch: "upper" | "lower" | "both" | null,
) {
  if (role === "bite") return true;
  if (prepArch !== "upper" && prepArch !== "lower") return false;
  return (role === "upper" || role === "lower") && role !== prepArch;
}

const DESIGN_STAGES: Array<{ id: DesignStage; label: string }> = [
  { id: "scan", label: "스캔" },
  { id: "margin", label: "마진" },
  { id: "design", label: "디자인" },
  { id: "model", label: "모델" },
  { id: "milling", label: "밀링" },
];

/** 다른 의뢰로 넘어간 직후. 버튼이 새로 그려져도 AI 창을 다시 연다. */
let aiReopenUntil = 0;

function markAiReopen() {
  aiReopenUntil = Date.now() + 5000;
}

function wantsAiReopen() {
  return Date.now() < aiReopenUntil;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function LabProsthesisAiDesignButton({
  toothWorks,
  files,
  authToken,
  transferId,
  workScanFiles,
  workScanAlignment,
  onWorkingScansPersisted,
  onAttachChatFile,
  onRemoveChatFile,
  onReorderChatFiles,
  caseHeader,
  basketTag,
  caseNav,
  className,
}: LabProsthesisAiDesignButtonProps) {
  const [open, setOpen] = useState(wantsAiReopen);
  useEffect(() => {
    if (!wantsAiReopen()) return;
    const timer = window.setTimeout(() => {
      aiReopenUntil = 0;
    }, 0);
    setOpen(true);
    return () => window.clearTimeout(timer);
  }, [transferId]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-9 gap-1 px-3", className)}
        title="업로드 스캔으로 보철 디자인"
        aria-label="AI 디자인"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>AI</span>
      </Button>
      <LabProsthesisAiDesignDialog
        key={String(transferId || "").trim() || "case"}
        open={open}
        onOpenChange={setOpen}
        caseNav={caseNav}
        toothWorks={toothWorks}
        files={files}
        authToken={authToken}
        transferId={transferId}
        workScanFiles={workScanFiles}
        workScanAlignment={workScanAlignment}
        onWorkingScansPersisted={onWorkingScansPersisted}
        onAttachChatFile={onAttachChatFile}
        onRemoveChatFile={onRemoveChatFile}
        onReorderChatFiles={onReorderChatFiles}
        caseHeader={caseHeader}
        basketTag={basketTag}
      />
    </>
  );
}

const AUTO_SAVE_PREF_KEY = "abuts.labProsthesis.autoSave";
const TEXT_ZOOM_PREF_KEY = "abuts.labProsthesis.textZoom";
/** 작은 배율부터 한 줄에 다섯. 칸 너비는 그리드가 맞춘다. */
const TEXT_ZOOM_ROWS = [
  [0.5, 0.6, 0.7, 0.8, 0.9],
  [1, 1.1, 1.2, 1.5, 1.75],
  [2, 2.25, 2.5, 2.75, 3],
] as const;
const TEXT_ZOOM_OPTIONS = [...TEXT_ZOOM_ROWS.flat()].sort((a, b) => a - b);
const TEXT_ZOOM_DEFAULT = 1.2;
const UNDO_LIMIT = 30;

type ArchAligned = { upper: boolean; lower: boolean };

type WorkUndoSnap = {
  edits: Record<string, ToothDesignEdit>;
  generated: Record<string, boolean>;
  marginReview: Record<string, MarginReview>;
  jaws: JawSnapshot[] | null;
  archAligned: ArchAligned;
};

type WorkUndoBook = {
  past: WorkUndoSnap[];
  future: WorkUndoSnap[];
  stroke: boolean;
  strokeKey: string;
  closeTimer: number;
};

function workDocumentSignature(document: WorkSessionDocument): string {
  return JSON.stringify({
    edits: document.edits,
    generated: document.generated,
    marginReview: document.marginReview,
    designScope: document.designScope,
    modelSettings: document.modelSettings,
    milling: document.milling,
    note: document.note,
    aiChat: document.aiChat,
    toothOverrides: document.toothOverrides,
    insertionAxes: document.insertionAxes,
    archAligned: document.archAligned,
    camera: document.camera,
    viewToggles: document.viewToggles,
  });
}

function nextCenterGuide(mode: WorkSessionCenterGuide): WorkSessionCenterGuide {
  if (mode === "off") return "center";
  if (mode === "center") return "grid";
  return "off";
}

function implantWithManufacturer(manufacturer: string, name: string) {
  const maker = manufacturer.trim();
  if (!maker || !name || name === "지정 없음") return name;
  const head = name.split("/")[0]?.trim() ?? "";
  if (head.localeCompare(maker, undefined, { sensitivity: "accent" }) === 0) return name;
  if (name.toLowerCase().startsWith(maker.toLowerCase())) return name;
  return `${maker} ${name}`;
}

function orderSpecLines(tooth: LabProsthesisAiTooth) {
  const implant = tooth.implant
    ? [tooth.implant.manufacturer, tooth.implant.brand, tooth.implant.family, tooth.implant.type]
        .filter(Boolean)
        .join(" / ")
    : "";
  const scanbody = tooth.scanbodyOrder
    ? [tooth.scanbodyOrder.manufacturer, tooth.scanbodyOrder.diameter, tooth.scanbodyOrder.height]
        .filter(Boolean)
        .join(" / ")
    : "";
  return { implant, scanbody };
}

/** 치과 의뢰 스캔바디(직경·높이 mm). 라이브러리 형상이 없을 때 이 크기의 원기둥을 겹친다. */
function orderScanbodyShape(
  order: LabProsthesisAiTooth["scanbodyOrder"],
): { radiusMm: number; heightMm: number } | null {
  if (!order) return null;
  const diameter = Number(order.diameter.replace(",", "."));
  const height = Number(order.height.replace(",", "."));
  if (!Number.isFinite(diameter) || diameter <= 0) return null;
  return {
    radiusMm: diameter / 2,
    heightMm: Number.isFinite(height) && height > 0 ? height : 10,
  };
}

function centerGuideLabel(mode: WorkSessionCenterGuide): string {
  if (mode === "center") return "중앙선";
  if (mode === "grid") return "모눈종이";
  return "없음";
}

function storedAutoSave() {
  try {
    return window.localStorage.getItem(AUTO_SAVE_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

function storedTextZoom() {
  try {
    const value = Number(window.localStorage.getItem(TEXT_ZOOM_PREF_KEY));
    if (!Number.isFinite(value)) return TEXT_ZOOM_DEFAULT;
    if ((TEXT_ZOOM_OPTIONS as readonly number[]).includes(value)) return value;
    return TEXT_ZOOM_OPTIONS.reduce((best, step) =>
      Math.abs(step - value) < Math.abs(best - value) ? step : best,
    );
  } catch {
    return TEXT_ZOOM_DEFAULT;
  }
}

function LabProsthesisAiDesignDialog({
  open,
  onOpenChange,
  toothWorks,
  files,
  authToken,
  transferId,
  workScanFiles,
  workScanAlignment,
  onWorkingScansPersisted,
  onAttachChatFile,
  onRemoveChatFile,
  onReorderChatFiles,
  caseHeader,
  basketTag,
  caseNav,
}: LabProsthesisAiDesignButtonProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const listedScanFiles = useMemo(
    () => [...(files || []), ...(workScanFiles || [])],
    [files, workScanFiles],
  );
  const [toothOverrides, setToothOverrides] = useState<Record<string, LabToothOverride>>({});
  const toothOverridesRef = useRef(toothOverrides);
  toothOverridesRef.current = toothOverrides;
  const basePlan = useMemo(
    () => buildLabProsthesisAiPlan({ toothWorks, files: listedScanFiles }),
    [listedScanFiles, toothWorks],
  );
  const plan = useMemo(
    () => applyToothOverrides(basePlan, toothOverrides),
    [basePlan, toothOverrides],
  );
  const cavityKinds = useMemo(() => {
    const out: Record<string, CavityKind> = {};
    for (const tooth of plan.teeth) {
      const kind = cavityKindOf(tooth);
      if (kind) out[tooth.toothNumber] = kind;
    }
    return out;
  }, [plan.teeth]);
  const cavityKindsRef = useRef(cavityKinds);
  cavityKindsRef.current = cavityKinds;
  const { connections: implantConnections } = useImplantConnectionCatalog(
    open && plan.teeth.some((tooth) => tooth.implant) ? (authToken ?? null) : null,
  );
  const implantLibraries = useMemo(
    () => buildImplantLibraries(implantConnections),
    [implantConnections],
  );
  const {
    catalog: scanbodyCatalog,
    loaded: scanbodyCatalogLoaded,
    reload: reloadScanbodyCatalog,
  } = useScanbodyCatalog(
    open && plan.teeth.some((tooth) => tooth.implant),
  );
  const [scanbodyUploadStatus, setScanbodyUploadStatus] = useState<string | null>(null);
  const [scanbodyMeshes, setScanbodyMeshes] = useState<Record<string, ScanbodyMesh>>({});
  const filesRef = useRef(listedScanFiles);
  filesRef.current = listedScanFiles;
  const workScanAlignmentRef = useRef(workScanAlignment ?? null);
  workScanAlignmentRef.current = workScanAlignment ?? null;
  /**
   * 초안과 비교할 서버 작업 스캔 시각. 자동 정렬 잡이 만든 스캔은 기공소 작업이 아니라
   * 올리지 못한 초안이 있으면 초안이 이긴다(기계 정렬이 기공소 작업을 덮지 않게).
   */
  const serverWorkScanAt = useCallback(
    () =>
      isMachineWorkScanAlignment(workScanAlignmentRef.current)
        ? new Map<WorkScanRole, number>()
        : newestWorkScanUploadedAtMs(filesRef.current || []),
    [],
  );

  const meshSources = useMemo(
    () => collectMeshSources(listedScanFiles),
    [listedScanFiles],
  );
  const meshKey = meshSources
    .map((row) => `${row.id}\0${row.role}\0${row.fileName}`)
    .join("|");
  const imageKey = useMemo(() => {
    return (files || [])
      .filter((file) => IMAGE_EXT.test(String(file.fileName || "")))
      .map((file) => `${file.s3Key || ""}\0${file.fileName || ""}`)
      .join("|");
  }, [files]);
  const prepTeeth =
    plan.designableTeeth.length > 0 ? plan.designableTeeth : plan.teeth;
  const prepArch = useMemo(
    () => prepArchFromProsthesisTeeth(prepTeeth),
    [prepTeeth],
  );
  const focusToothNumbers = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const tooth of prepTeeth) {
      for (const raw of [tooth.toothNumber, ...tooth.linkedTeeth]) {
        const number = String(raw || "").trim();
        if (!number || seen.has(number)) continue;
        seen.add(number);
        out.push(number);
      }
    }
    return out;
  }, [prepTeeth]);

  const [entries, setEntries] = useState<OralScanOverlaySource[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [colorMapping, setColorMapping] = useState(true);
  const paint = useViewPaint({ open, resetKey: String(transferId || ""), initiallyOn: false });
  const [paintSpace, setPaintSpace] = useState<ViewPaintSpace | null>(null);
  const [, setHasScanColor] = useState(false);
  const [ghostOn, setGhostOn] = useState(false);
  const [marginShown, setMarginShown] = useState(false);
  const [dieShown, setDieShown] = useState(false);
  const [dieTeeth, setDieTeeth] = useState<readonly string[]>([]);
  /** 치아 정보에서 체크를 끈 치아. 다이와 작업물을 그리지 않는다. */
  const [hiddenTeeth, setHiddenTeeth] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const [progress, setProgress] = useState(0);
  const [fileState, setFileState] = useState<
    Record<string, "loading" | "ready" | "error">
  >({});
  const [stage, setStage] = useState<DesignStage>("scan");
  const [contactMap, setContactMap] = useState(false);
  const [undercutMap, setUndercutMap] = useState(false);
  const [occlusalGap, setOcclusalGap] = useState(0.1);
  const [contactMode, setContactMode] = useState<ContactPaintMode>("cut");
  const [colorMap, setColorMap] = useState<ColorMapState>(DEFAULT_COLOR_MAP);
  /** 뷰어가 크라운마다 지대치에서 내면을 만든 결과. */
  const [intaglios, setIntaglios] = useState<Record<string, CrownIntaglioInfo>>({});
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, boolean>>({});
  const [marginReview, setMarginReview] = useState<Record<string, MarginReview>>({});
  const [designScope, setDesignScope] = useState<DesignScope | null>(null);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);
  const [millingDoc, setMillingDoc] = useState<MillingDocument>(EMPTY_MILLING_DOCUMENT);
  /** 「모델 생성」으로 만든 파트. 스캔이 움직이면 뷰어가 비운다. */
  const [stoneParts, setStoneParts] = useState<StoneModelPartSummary[]>([]);
  /** 모델을 만들 때의 설정·마진. 달라지면 다시 만들라고 알린다. */
  const [stoneBuiltSig, setStoneBuiltSig] = useState("");
  const [caseNote, setCaseNote] = useState("");
  const [aiChat, setAiChat] = useState<AiDesignChatTurn[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [sculptBrush, setSculptBrush] = useState<SculptBrush>(DEFAULT_SCULPT_BRUSH);
  const [refineTab, setRefineTab] = useState<RefineTab>("transform");
  /** 뷰어가 대합·인접 맞춤 뒤 잰 크라운별 가장 얇은 외면(mm). 맞춤이 없는 치아는 없다. */
  const [crownShells, setCrownShells] = useState<Record<string, number>>({});
  const crownShellsRef = useRef(crownShells);
  crownShellsRef.current = crownShells;
  const [screwPathShown, setScrewPathShown] = useState(true);
  const [scanbodyPickTooth, setScanbodyPickTooth] = useState<string | null>(null);
  const [scanbodyPicks, setScanbodyPicks] = useState(0);
  const [toothCardFor, setToothCardFor] = useState<string | null>(null);
  const [libraryPickerFor, setLibraryPickerFor] = useState<string | null>(null);
  const [implantFavorites, setImplantFavorites] = useState<string[]>(readImplantFavorites);
  const { library: designLibrary, save: saveDesignLibrary } = useLabDesignPresets(open);
  /** 디자인 프리셋 창. 열 때 고를 프리셋. */
  const [presetDialog, setPresetDialog] = useState<{ presetId: string | null } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [toothInfoOpen, setToothInfoOpen] = useState(true);
  const [roleOverride, setRoleOverride] = useState<
    Record<string, AssignableScanRole>
  >({});
  const [scanOrder, setScanOrder] = useState<string[]>([]);
  const [modifyPanelOpen, setModifyPanelOpen] = useState(true);
  const panelOpenMemoryRef = useRef<PanelOpenMemory>(defaultPanelOpenMemory());
  /** 헤더 「패널 닫기」가 본문을 접은 직후. 그 false 값으로 기억을 덮지 않는다. */
  const panelHeaderFoldedRef = useRef(false);
  const [dragScanId, setDragScanId] = useState<string | null>(null);
  const [dropScanId, setDropScanId] = useState<string | null>(null);
  const [workWide, setWorkWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 720,
  );
  const [insertionKeys, setInsertionKeys] = useState<string[]>([]);
  const [insertionShown, setInsertionShown] = useState(false);
  /** 뱃지로 잡은 뒤, 치아 정보 아이콘으로 다시 잡으라고 안내하는 스팬. */
  const [axisChangeHintKey, setAxisChangeHintKey] = useState("");
  /**
   * 치아 정보 아이콘으로 다시 잡는 중. 멈출 때마다 미리보기만 하고, 설정에서 저장한다.
   * `before`는 시작 전 축. 취소 때 되돌린다.
   */
  const [aiming, setAiming] = useState<{
    span: string[];
    before: WorkSessionAxis[];
  } | null>(null);
  const aimingRef = useRef(aiming);
  aimingRef.current = aiming;
  const [centerGuide, setCenterGuide] = useState<WorkSessionCenterGuide>("grid");
  const viewTogglesRef = useRef<WorkSessionViewToggles>({
    insertion: false,
    undercut: false,
    margin: false,
    center: "grid",
    color: true,
    contact: false,
    ghost: false,
    die: false,
  });
  const restoreGhostVisibleRef = useRef(false);
  const [modifyTool, setModifyTool] = useState<ModifyTool>("margin");
  const [marginMode, setMarginMode] = useState<MarginEditMode>("point");
  /** 다시 검출: 이 치아의 마진 시작점을 스캔에서 찍는 중. */
  const [marginSeedPick, setMarginSeedPick] = useState<string | null>(null);
  const [marginTracePoints, setMarginTracePoints] = useState(0);
  const [marginUndercut, setMarginUndercut] = useState<{ tooth: string | null; count: number }>({
    tooth: null,
    count: 0,
  });
  const [editBrush, setEditBrush] = useState<EditBrush>("none");
  const [edits, setEdits] = useState<Record<string, ToothDesignEdit>>({});
  /** 작업 초안을 읽은 뒤 1. 그 전에 의뢰 라이브러리를 덮지 않는다. */
  const [workDocStamp, setWorkDocStamp] = useState(0);
  const [libraryConfirm, setLibraryConfirm] = useState<{
    toothNumber: string;
    library: ImplantLibrary;
  } | null>(null);
  const [holeNote, setHoleNote] = useState("");
  const [holeIssues, setHoleIssues] = useState<Record<string, string>>({});
  const [connectorFrom, setConnectorFrom] = useState<string | null>(null);
  const [focusViewOn, setFocusViewOn] = useState(true);
  const [connectorShot, setConnectorShot] = useState<ConnectorSectionShot | null>(null);
  const focusRowRef = useRef<ConnectorRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<DesignExportBusy>(null);
  const [alignKind, setAlignKind] = useState<"auto" | "points" | "occlusion" | null>(null);
  const [scanFold, setScanFold] = useState<"align" | "mesh" | "scanbody" | null>("align");
  const alignOpen = scanFold === "align";
  const scanbodyOpen = scanFold === "scanbody";
  const [modelOpen, setModelOpen] = useState(true);
  const [designFold, setDesignFold] = useState<"modify" | "occlusal" | null>("modify");
  const [occlusionArch, setOcclusionArch] = useState<"upper" | "lower">("lower");
  const [occlusionMode, setOcclusionMode] = useState<OralScanOcclusionAdjust["mode"]>("vertical");
  const [occlusionMm, setOcclusionMm] = useState(0);
  const [alignArch, setAlignArch] = useState<"upper" | "lower" | null>(null);
  const [alignPicks, setAlignPicks] = useState({ model: 0, bite: 0 });
  const [alignBusy, setAlignBusy] = useState(false);
  /** 뷰어가 스스로 바이트에 맞추는 중(불러올 때·역할 변경). 자동 버튼과 같이 편집·저장을 막는다. */
  const [viewerAligning, setViewerAligning] = useState(false);
  const alignLocked = alignBusy || viewerAligning;
  const [meshEdit, setMeshEdit] = useState<ScanMeshEdit | null>(null);
  const [meshEditStatus, setMeshEditStatus] = useState<ScanMeshEditStatus>(
    EMPTY_SCAN_MESH_EDIT_STATUS,
  );
  const meshEditBeforeSigRef = useRef("");
  const [archAligned, setArchAligned] = useState<ArchAligned>({
    upper: false,
    lower: false,
  });
  const [autoSave, setAutoSave] = useState(storedAutoSave);
  const [textZoom, setTextZoom] = useState(storedTextZoom);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlPrefs = useDesignControlPrefs();
  const [zoomOpen, setZoomOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    applyUiTextZoom(textZoom);
    return () => {
      applyStoredUiTextZoom();
    };
  }, [open, textZoom]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = resolveUiTextZoomShortcut(e);
      if (!shortcut) return;
      e.preventDefault();
      setTextZoom((current) => {
        const next = stepZoom(TEXT_ZOOM_OPTIONS, current, shortcut, TEXT_ZOOM_DEFAULT);
        try {
          window.localStorage.setItem(TEXT_ZOOM_PREF_KEY, String(next));
        } catch {
          /* 확대율은 이 탭에서만 유지한다. */
        }
        announceUiTextZoom(next);
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);
  const viewerRef = useRef<OralScanOverlayHandle>(null);
  useEffect(() => {
    if (alignKind !== "occlusion") return;
    setOcclusionMm(viewerRef.current?.occlusionVerticalMm() ?? 0);
  }, [alignKind, occlusionArch]);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const generatedRef = useRef(generated);
  generatedRef.current = generated;
  const marginReviewRef = useRef(marginReview);
  marginReviewRef.current = marginReview;
  const designScopeRef = useRef(designScope);
  designScopeRef.current = designScope;
  const modelSettingsRef = useRef(modelSettings);
  modelSettingsRef.current = modelSettings;
  const millingDocRef = useRef(millingDoc);
  millingDocRef.current = millingDoc;
  const caseNoteRef = useRef(caseNote);
  caseNoteRef.current = caseNote;
  const aiChatRef = useRef(aiChat);
  aiChatRef.current = aiChat;
  const archAlignedRef = useRef(archAligned);
  archAlignedRef.current = archAligned;
  const historyRef = useRef<WorkUndoBook>({
    past: [],
    future: [],
    stroke: false,
    strokeKey: "",
    closeTimer: 0,
  });
  const alignBeforeSigRef = useRef("");
  const occlusionBeforeSigRef = useRef("");
  const saveLockRef = useRef(false);
  const closeAfterChatAttachRef = useRef<() => void>(() => {});
  const pendingDraftRolesRef = useRef<Set<WorkScanRole>>(new Set());
  const lastDraftSigRef = useRef("");
  const lastDocSigRef = useRef("");
  const sessionDocRef = useRef<WorkSessionDocument | null>(null);
  const suspendDraftRef = useRef(false);
  const draftTimerRef = useRef(0);
  const draftQueueRef = useRef(Promise.resolve());
  const queueSaveWorkRef = useRef<() => void>(() => {});
  const { toast } = useToast();
  const { uploadFiles } = useS3TempUpload({ token: authToken });
  const workObserveRef = useRef<ResizeObserver | null>(null);
  const workAreaRef = useRef<HTMLDivElement | null>(null);
  const [panelPose, setPanelPose] = useState<Partial<Record<DesignPanelId, PanelPose>>>({});
  const movePanel = useCallback((id: DesignPanelId, pose: PanelPose) => {
    setPanelPose((prev) => ({ ...prev, [id]: pose }));
  }, []);
  const bindWorkArea = useCallback((node: HTMLDivElement | null) => {
    workAreaRef.current = node;
    workObserveRef.current?.disconnect();
    workObserveRef.current = null;
    if (!node) return;
    const sync = () => setWorkWide(node.clientWidth >= 720);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    workObserveRef.current = observer;
  }, []);
  const genSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setEntries([]);
      setVisible({});
      setColorMapping(true);
      setHasScanColor(false);
      setGhostOn(false);
      setMarginShown(false);
      setDieShown(false);
      setDieTeeth([]);
      setHiddenTeeth([]);
      setLoadError("");
      setWorkDocStamp(0);
      setLibraryConfirm(null);
      setProgress(0);
      setFileState({});
      setStage("scan");
      setContactMap(false);
      setUndercutMap(false);
      setOcclusalGap(0.1);
      setContactMode("cut");
      setColorMap(DEFAULT_COLOR_MAP);
      setIntaglios({});
      setSelectedTooth(null);
      setGenerated({});
      setMarginReview({});
      setDesignScope(null);
      setModelSettings(DEFAULT_MODEL_SETTINGS);
      setMillingDoc(EMPTY_MILLING_DOCUMENT);
      setStoneParts([]);
      setStoneBuiltSig("");
      setCaseNote("");
      for (const turn of aiChatRef.current) {
        if (turn.paintImageUrl) URL.revokeObjectURL(turn.paintImageUrl);
      }
      aiChatRef.current = [];
      setAiChat([]);
      setChatDraft("");
      setChatOpen(true);
      setPanelPose({});
      setToothOverrides({});
      setScanbodyPickTooth(null);
      setScanbodyPicks(0);
      setToothCardFor(null);
      setLibraryPickerFor(null);
      setPresetDialog(null);
      setGenerating(false);
      setGenLabel("");
      setToothInfoOpen(true);
      setPanelsHidden(false);
      setRoleOverride({});
      setScanOrder([]);
      setModifyPanelOpen(true);
      panelOpenMemoryRef.current = defaultPanelOpenMemory();
      panelHeaderFoldedRef.current = false;
      setDragScanId(null);
      setDropScanId(null);
      setInsertionKeys([]);
      setInsertionShown(false);
      setAxisChangeHintKey("");
      aimingRef.current = null;
      setAiming(null);
      setCenterGuide("grid");
      restoreGhostVisibleRef.current = false;
      setModifyTool("margin");
      setMarginMode("point");
      setMarginSeedPick(null);
      setMarginTracePoints(0);
      setEditBrush("none");
      setEdits({});
      setHoleNote("");
      setAlignKind(null);
      setAlignArch(null);
      setAlignPicks({ model: 0, bite: 0 });
      setAlignBusy(false);
      setOcclusionMode("vertical");
      setOcclusionMm(0);
      setArchAligned({ upper: false, lower: false });
      pendingDraftRolesRef.current = new Set();
      lastDraftSigRef.current = "";
      lastDocSigRef.current = "";
      sessionDocRef.current = null;
      suspendDraftRef.current = false;
      window.clearTimeout(draftTimerRef.current);
      window.clearTimeout(historyRef.current.closeTimer);
      historyRef.current.closeTimer = 0;
      historyRef.current.past = [];
      historyRef.current.future = [];
      historyRef.current.stroke = false;
      historyRef.current.strokeKey = "";
      historyRef.current.closeTimer = 0;
      genSeq.current += 1;
      return;
    }
    suspendDraftRef.current = false;

    const ac = new AbortController();
    const sources = collectMeshSources(filesRef.current);
    const images = collectImageSources(filesRef.current);

    if (sources.length === 0) {
      setEntries([]);
      setLoadError("");
      setProgress(0);
      setWorkDocStamp((n) => (n === 0 ? 1 : n));
      return () => {
        ac.abort();
      };
    }
    if (!authToken) {
      setLoadError("로그인이 필요합니다.");
      return () => ac.abort();
    }

    const percents = new Map<string, number>();
    const report = () => {
      const values = [...percents.values()];
      if (!values.length) return;
      const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
      setProgress(Math.round(avg));
    };

    setLoadError("");
    setProgress(0);
    setFileState(
      Object.fromEntries(sources.map((row) => [row.id, "loading" as const])),
    );
    setVisible(
      Object.fromEntries(
        sources.map((row) => [
          row.id,
          initialLabOralScanVisible(row.role, prepArch),
        ]),
      ),
    );

    void (async () => {
      let localFiles = new Map<string, File>();
      const caseId = String(transferId || "").trim();
      if (caseId) {
        try {
          const draft = await readWorkDraft(caseId);
          if (ac.signal.aborted) return;
          const assigned =
            draft?.document?.jawFileBind === 1
              ? assignNewerDraftFiles(sources, draft, serverWorkScanAt())
              : { byId: new Map<string, File>(), roles: [] as WorkScanRole[] };
          localFiles = assigned.byId;
          pendingDraftRolesRef.current = new Set(assigned.roles);
          if (draft?.document) {
            editsRef.current = draft.document.edits;
            generatedRef.current = draft.document.generated;
            marginReviewRef.current = draft.document.marginReview;
            designScopeRef.current = draft.document.designScope;
            modelSettingsRef.current = draft.document.modelSettings;
            millingDocRef.current = draft.document.milling;
            caseNoteRef.current = draft.document.note;
            aiChatRef.current = draft.document.aiChat;
            toothOverridesRef.current = draft.document.toothOverrides;
            archAlignedRef.current = draft.document.archAligned;
            sessionDocRef.current = draft.document;
            lastDocSigRef.current = workDocumentSignature(draft.document);
            setEdits(draft.document.edits);
            setGenerated(draft.document.generated);
            setMarginReview(draft.document.marginReview);
            setDesignScope(draft.document.designScope);
            setModelSettings(draft.document.modelSettings);
            setMillingDoc(draft.document.milling);
            setCaseNote(draft.document.note);
            setAiChat(draft.document.aiChat);
            setToothOverrides(draft.document.toothOverrides);
            setArchAligned(draft.document.archAligned);
            if (draft.document.insertionAxes.length > 0) {
              setInsertionKeys(draft.document.insertionAxes.map((axis) => axis.key));
              setInsertionShown(true);
            }
            const toggles = parseViewToggles(draft.document.viewToggles);
            if (toggles) {
              setInsertionShown(toggles.insertion);
              setUndercutMap(toggles.undercut);
              setMarginShown(toggles.margin);
              setCenterGuide(toggles.center);
              setColorMapping(toggles.color);
              setContactMap(toggles.contact);
              if (toggles.colorMap) setColorMap(toggles.colorMap);
              setGhostOn(toggles.ghost);
              setDieShown(toggles.die);
              restoreGhostVisibleRef.current = toggles.ghost;
            }
          }
        } catch {
          localFiles = new Map();
        }
      }
      if (ac.signal.aborted) return;
      setWorkDocStamp((n) => n + 1);
      const serverAligned = workScanAlignmentRef.current;
      if (serverAligned) {
        const next = {
          upper: archAlignedRef.current.upper || serverAligned.upper,
          lower: archAlignedRef.current.lower || serverAligned.lower,
        };
        archAlignedRef.current = next;
        setArchAligned(next);
      }

      const companions: File[] = [];
      const wantsTexture = sources.some((row) =>
        /\.(ply|obj)$/i.test(row.fileName),
      );
      if (wantsTexture) {
        await Promise.all(
          images.map(async (image) => {
            const cacheKey = `img:${image.id}`;
            const hit = sessionScanFileCache.get(cacheKey);
            if (hit) {
              companions.push(hit);
              return;
            }
            try {
              const blob = await fetchS3BlobCached({
                s3Key: image.id,
                fileName: image.fileName,
                token: authToken,
                buildUrl: buildS3ProxyDownloadUrl,
                signal: ac.signal,
              });
              if (ac.signal.aborted) return;
              const file = fileFromImageBlob(blob, image.fileName);
              sessionScanFileCache.set(cacheKey, file);
              companions.push(file);
            } catch (err) {
              if ((err as { name?: string })?.name === "AbortError") return;
            }
          }),
        );
      }
      if (ac.signal.aborted) return;

      const loaded: OralScanOverlaySource[] = [];
      const nextState: Record<string, "ready" | "error"> = {};
      await Promise.all(
        sources.map(async (source) => {
          percents.set(source.id, 0);
          const localFile = localFiles.get(source.id);
          if (localFile) {
            loaded.push({
              id: source.id,
              fileName: localFile.name,
              role: source.role,
              file: localFile,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
            return;
          }
          const cachedFile = sessionScanFileCache.get(source.id);
          if (cachedFile) {
            loaded.push({
              id: source.id,
              fileName: source.fileName,
              role: source.role,
              file: cachedFile,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
            return;
          }
          try {
            const blob = await fetchS3BlobCached({
              s3Key: source.id,
              fileName: source.fileName,
              token: authToken,
              buildUrl: buildS3ProxyDownloadUrl,
              signal: ac.signal,
              onProgress: (percent) => {
                percents.set(source.id, percent);
                report();
              },
            });
            if (ac.signal.aborted) return;
            const file = fileFromModelBlob(blob, source.fileName);
            sessionScanFileCache.set(source.id, file);
            loaded.push({
              id: source.id,
              fileName: source.fileName,
              role: source.role,
              file,
              companionFiles: companions,
            });
            nextState[source.id] = "ready";
            percents.set(source.id, 100);
            report();
          } catch (err) {
            if ((err as { name?: string })?.name === "AbortError") return;
            nextState[source.id] = "error";
            percents.set(source.id, 100);
            report();
          }
        }),
      );
      if (ac.signal.aborted) return;
      loaded.sort(
        (a, b) =>
          sources.findIndex((row) => row.id === a.id) -
          sources.findIndex((row) => row.id === b.id),
      );
      setEntries(loaded);
      setFileState((prev) => ({ ...prev, ...nextState }));
      if (loaded.length === 0) {
        setLoadError("스캔을 불러오지 못했습니다.");
      }
    })();

    return () => {
      ac.abort();
    };
  }, [authToken, imageKey, meshKey, open, prepArch, serverWorkScanAt, transferId]);

  const scans = useMemo(() => {
    const byId = new Map(meshSources.map((row) => [row.id, row]));
    const ids = (
      scanOrder.length > 0 ? scanOrder : meshSources.map((row) => row.id)
    ).filter((id) => byId.has(id));
    for (const row of meshSources) {
      if (!ids.includes(row.id)) ids.push(row.id);
    }
    return ids.map((id) => {
      const row = byId.get(id)!;
      return { ...row, role: roleOverride[id] ?? row.role };
    });
  }, [meshSources, roleOverride, scanOrder]);
  const viewerItems = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        role: roleOverride[entry.id] ?? entry.role,
      })),
    [entries, roleOverride],
  );

  const busy = scans.some((row) => fileState[row.id] === "loading");
  const scanShown = (row: MeshSource) =>
    row.id in visible
      ? visible[row.id] !== false
      : initialLabOralScanVisible(row.role, prepArch);
  const swapScans = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const originalRole = (id: string) =>
      meshSources.find((row) => row.id === id)?.role;
    setRoleOverride((prev) => {
      const roleOf = (id: string) => prev[id] ?? originalRole(id);
      const roleA = roleOf(sourceId);
      const roleB = roleOf(targetId);
      if (!roleA || !roleB || roleA === roleB) return prev;
      const next = { ...prev };
      if (originalRole(sourceId) === roleB) delete next[sourceId];
      else next[sourceId] = roleB;
      if (originalRole(targetId) === roleA) delete next[targetId];
      else next[targetId] = roleA;
      return next;
    });
    setScanOrder((prev) => {
      const base =
        prev.length > 0 ? [...prev] : meshSources.map((row) => row.id);
      const from = base.indexOf(sourceId);
      const to = base.indexOf(targetId);
      if (from < 0 || to < 0) return base;
      const next = [...base];
      next[from] = targetId;
      next[to] = sourceId;
      return next;
    });
  };

  const canUndercut = prepArch != null;
  const canContact =
    prepArch === "both"
      ? scans.some((row) => row.role === "upper") &&
        scans.some((row) => row.role === "lower")
      : prepArch === "upper"
        ? scans.some((row) => row.role === "lower")
        : prepArch === "lower"
          ? scans.some((row) => row.role === "upper")
          : false;
  const activeTooth =
    plan.teeth.find((tooth) => tooth.toothNumber === selectedTooth) ??
    plan.teeth[0] ??
    null;
  const undercutLimit = undercutLimitFromRange(40);
  const insertionAxisVisible = insertionShown && (insertionKeys.length > 0 || aiming != null);
  const paintUndercut = undercutMap || (insertionAxisVisible && canUndercut);
  viewTogglesRef.current = {
    insertion: insertionShown,
    undercut: undercutMap,
    margin: marginShown,
    center: centerGuide,
    color: colorMapping,
    contact: contactMap,
    ghost: ghostOn,
    die: dieShown,
    colorMap,
  };
  useEffect(() => {
    if (!restoreGhostVisibleRef.current || !ghostOn || scans.length === 0) return;
    restoreGhostVisibleRef.current = false;
    setVisible((prev) => {
      const out = { ...prev };
      for (const scan of scans) {
        if (!isOpposingOrBite(scan.role, prepArch)) continue;
        out[scan.id] = true;
      }
      return out;
    });
  }, [ghostOn, prepArch, scans]);
  const viewToolBtn = cn(
    "h-7 shadow-sm text-xs [&_svg]:!size-3",
    workWide ? "gap-0.5 px-2" : "w-7 px-0",
  );
  const activeNumber = activeTooth?.toothNumber ?? null;
  const activeEdit = activeNumber
    ? (edits[activeNumber] ?? createToothDesignEdit())
    : createToothDesignEdit();
  const marginEditing =
    stage !== "scan" &&
    modifyTool === "margin" &&
    marginShown &&
    activeNumber != null &&
    !activeEdit.pontic.on;
  const marginHint: { warn: boolean; body: ReactNode } | null =
    marginEditing && marginSeedPick === activeNumber
      ? {
          warn: false,
          body: (
            <>
              마진 위 시작점을 클릭합니다.
              <br />
              그 자리부터 마진을 다시 검출합니다. Esc로 취소합니다.
            </>
          ),
        }
      : marginEditing && activeEdit.margin.deleted
        ? {
            warn: false,
            body:
              marginTracePoints >= 3 ? (
                <>
                  점 {marginTracePoints}개를 찍었습니다.
                  <br />
                  시작점(주황)을 다시 누르면 마진이 닫힙니다.
                </>
              ) : (
                <>
                  시작점을 찍고 마진을 따라 점을 찍습니다.
                  <br />
                  시작점을 다시 누르면 닫힙니다. 우클릭은 마지막 점을 지웁니다.
                </>
              ),
          }
        : marginEditing &&
            marginUndercut.tooth === activeNumber &&
            marginUndercut.count > 0
          ? { warn: true, body: <>마진선이 언더컷 영역을 지납니다.</> }
          : null;
  const bridgeSpan = insertionSpanForTooth(plan.teeth, activeNumber);
  const isBridgeSpan = bridgeSpan.length > 1 || activeTooth?.prosthesisType === "브리지";
  const bridges = useMemo(() => bridgeLinks(plan.teeth), [plan.teeth]);
  const spanConnectors: ConnectorRow[] = bridges
    .filter((link) => bridgeSpan.includes(link.from) && bridgeSpan.includes(link.to))
    .map((link) => ({
      ...link,
      edit: edits[link.from] ?? createToothDesignEdit(),
    }));
  const bridgeMembers = planSpanMembers(plan.teeth, bridgeSpan);
  const bridgeReady =
    bridgeMembers.length > 1 && bridgeMembers.every((tooth) => generated[tooth] === true);
  const bridgeAssembled = spanAssembled(bridgeSpan, edits);
  const activeConnectorFrom =
    spanConnectors.find((row) => row.from === connectorFrom)?.from ??
    spanConnectors.find((row) => row.from === activeNumber || row.to === activeNumber)
      ?.from ??
    spanConnectors[0]?.from ??
    null;
  const viewerBadges: OralScanToothBadge[] = [];
  const badgedSpans = new Set<string>();
  for (const tooth of plan.teeth) {
    const span = insertionSpanForTooth(plan.teeth, tooth.toothNumber);
    if (span.length > 1 && spanAssembled(span, edits)) {
      const ordered = sortByArch(planSpanMembers(plan.teeth, span));
      const key = ordered.join(",");
      if (badgedSpans.has(key)) continue;
      badgedSpans.add(key);
      viewerBadges.push({
        toothNumber: ordered[Math.floor((ordered.length - 1) / 2)] ?? tooth.toothNumber,
        label: `${ordered[0]}-${ordered[ordered.length - 1]}`,
        active: activeNumber != null && ordered.includes(activeNumber),
        span: ordered,
      });
      continue;
    }
    viewerBadges.push({
      toothNumber: tooth.toothNumber,
      label: labToothBadgeLabel(tooth),
      active: activeTooth?.toothNumber === tooth.toothNumber,
    });
  }
  const viewerConnectorChips: OralScanConnectorChip[] =
    stage === "margin" || stage === "design"
      ? bridges.flatMap((link) => {
          const edit = edits[link.from];
          if (!edit?.connector.linked || edit.connector.assembled) return [];
          if (generated[link.from] !== true || generated[link.to] !== true) return [];
          return [
            {
              ...link,
              weak: connectorIsWeak(edit, [link.from, link.to]),
              active:
                modifyTool === "connector" &&
                stage === "design" &&
                activeConnectorFrom === link.from,
            },
          ];
        })
      : [];
  const exportRestorations = useMemo(
    () => designExportRestorations(plan.teeth, generated, edits),
    [edits, generated, plan.teeth],
  );
  const exportScans = useMemo(() => {
    const out: DesignExportScan[] = [];
    for (const role of ["upper", "lower", "bite"] as const) {
      if (!scans.some((row) => row.role === role)) continue;
      const label = oralScanRoleLabel(role);
      out.push({ role, label, fileName: `${label}.stl` });
    }
    return out;
  }, [scans]);

  const buildExportFiles = async (selection: DesignExportSelection) =>
    (
      (await viewerRef.current?.exportDesignStl({
        groups: selection.restorations
          .filter((row) => !row.id.startsWith(STONE_ROW_PREFIX))
          .map((row) => ({
            fileName: row.fileName,
            teeth: row.teeth,
            union: row.id.startsWith("bridge:") ? { label: row.label } : undefined,
          })),
        stoneParts: selection.restorations
          .filter((row) => row.id.startsWith(STONE_ROW_PREFIX))
          .map((row) => ({
            id: row.id.slice(STONE_ROW_PREFIX.length),
            fileName: row.fileName,
          })),
        scans: selection.scans.map((row) => ({ fileName: row.fileName, role: row.role })),
        camCoordinates: selection.camCoordinates,
      })) ?? []
    ).map((row) => new File([row.blob], row.fileName, { type: "model/stl" }));

  /** 합집합이 실패하면 토스트를 띄우고 null. 겹친 메시로 대신 내보내지 않는다. */
  const buildExportFilesOrWarn = async (selection: DesignExportSelection) => {
    try {
      return await buildExportFiles(selection);
    } catch (error) {
      if (!(error instanceof MeshUnionError)) throw error;
      toast({
        title: "브리지를 한 덩어리로 합치지 못했습니다.",
        description: (
          <>
            {meshUnionErrorMessage(error)}
            <br />
            내보내기를 멈췄습니다.
          </>
        ),
        variant: "destructive",
      });
      return null;
    }
  };

  const downloadExport = async (selection: DesignExportSelection) => {
    setExportBusy("download");
    try {
      const files = await buildExportFilesOrWarn(selection);
      if (!files) return;
      if (files.length === 0) {
        toast({ title: "내보낼 메시가 없습니다.", variant: "destructive" });
        return;
      }
      if (files.length === 1) {
        downloadBlobFile(files[0]!, files[0]!.name);
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const file of files) zip.file(file.name, file);
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlobFile(blob, `${exportBaseName(caseHeader?.primary)}.zip`);
      }
      setExportOpen(false);
    } finally {
      setExportBusy(null);
    }
  };

  const attachExport = async (selection: DesignExportSelection) => {
    if (!onAttachChatFile) return;
    setExportBusy("attach");
    let files: File[] | null;
    try {
      files = await buildExportFilesOrWarn(selection);
    } finally {
      setExportBusy(null);
    }
    if (!files) return;
    if (files.length === 0) {
      toast({ title: "내보낼 메시가 없습니다.", variant: "destructive" });
      return;
    }
    for (const file of files) onAttachChatFile(file);
    setExportOpen(false);
    toast({
      title: "채팅에 첨부했습니다.",
      description: (
        <>
          STL {files.length}개가 대화 입력에 있습니다.
          <br />
          보내기를 누르면 상대에게 전달됩니다.
        </>
      ),
    });
    closeAfterChatAttachRef.current();
  };

  const onMillingDocChange = useCallback((next: MillingDocument) => {
    millingDocRef.current = next;
    setMillingDoc(next);
    queueSaveWorkRef.current();
  }, []);
  const milling = useLabMilling({
    active: open && stage === "milling",
    rows: exportRestorations,
    edits,
    viewerRef,
    doc: millingDoc,
    onDocChange: onMillingDocChange,
    baseName: exportBaseName(caseHeader?.primary).replace(/_디자인$/, ""),
    onAttachChatFile,
    onAttached: () => closeAfterChatAttachRef.current(),
  });

  const focusRow =
    spanConnectors.find((row) => row.from === activeConnectorFrom) ?? null;
  focusRowRef.current = focusRow;
  const focusShown =
    focusViewOn &&
    stage === "design" &&
    modifyTool === "connector" &&
    isBridgeSpan &&
    focusRow != null &&
    generated[focusRow.from] === true &&
    generated[focusRow.to] === true;
  // 단면 이미지는 커넥터를 빼고 그린다. 커넥터 값이 바뀌어도 다시 찍지 않는다.
  const focusShotKey = focusShown && focusRow
    ? JSON.stringify([
        focusRow.from,
        focusRow.to,
        focusRow.edit.connector.along,
        insertionKeys,
        [focusRow.from, focusRow.to].map((tooth) => {
          const { connector: _connector, ...rest } = edits[tooth] ?? createToothDesignEdit();
          return rest;
        }),
      ])
    : "";
  useEffect(() => {
    if (!focusShotKey) {
      setConnectorShot(null);
      return;
    }
    const row = focusRowRef.current;
    if (!row) return;
    const timer = window.setTimeout(() => {
      setConnectorShot(
        viewerRef.current?.captureConnectorSection(
          { from: row.from, to: row.to },
          row.edit.connector,
        ) ?? null,
      );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusShotKey]);
  const libraryById = useMemo(
    () => new Map(implantLibraries.map((row) => [row.id, row])),
    [implantLibraries],
  );
  /**
   * 치아별 실제 형상 후보. 직접어벗 심플어벗·심플밀링과 스캔바디 심플힐링은 규격 템플릿.
   * 치과가 스캔바디 제조사·치수를 지정했으면 그 제조사 라이브러리에서 치수로, 아니면 임플란트에 연결된 키트 스캔바디.
   */
  const scanbodyCandidates = useMemo(() => {
    const out: Record<
      string,
      {
        /** 의뢰 규격 템플릿이 서버에 없다. 값은 그 규격. */
        missingTemplate: TemplateSpec | null;
        /** 의뢰 스캔바디 제조사 라이브러리가 서버에 없다. 값은 제조사 이름. */
        missingLibraryMaker: string | null;
        orderedKey: string | null;
        rows: Array<{
          key: string;
          label: string;
          marginHeightMm: number | null;
          load: () => Promise<ScanbodyMesh>;
        }>;
      }
    > = {};
    for (const tooth of plan.teeth) {
      if (!tooth.implant) continue;
      const libraryId = edits[tooth.toothNumber]?.implant.libraryId ?? null;
      const orderOverride = edits[tooth.toothNumber]?.implant.orderOverride === true;
      const templateSpec = orderTemplateSpec(tooth);
      const useTemplate = Boolean(templateSpec) && (!orderOverride || libraryId?.startsWith("template:"));
      if (useTemplate) {
        const template = abutmentTemplateFor(scanbodyCatalog.templates, templateSpec);
        out[tooth.toothNumber] = {
          missingTemplate: !template && scanbodyCatalogLoaded ? templateSpec : null,
          missingLibraryMaker: null,
          orderedKey: template ? `template:${template.id}` : null,
          rows: template
            ? [
                {
                  key: `template:${template.id}`,
                  label: `${template.kind} ${template.diameter}${template.height}`,
                  marginHeightMm: template.marginHeightMm,
                  load: () => loadTemplateModel(template),
                },
              ]
            : [],
        };
        continue;
      }
      const ordered = orderOverride
        ? null
        : orderedScanbodyCandidates(scanbodyCatalog.libraries, tooth.scanbodyOrder);
      if (ordered && ordered.rows.length > 0) {
        out[tooth.toothNumber] = {
          missingTemplate: null,
          missingLibraryMaker: null,
          orderedKey: ordered.orderedKey,
          rows: ordered.rows.map((row) => ({
            key: row.s3Key,
            label: `${row.systemName} · ${row.name}`,
            marginHeightMm: null,
            load: () => loadScanbodyGeometry(row.s3Key),
          })),
        };
        continue;
      }
      const library = libraryId ? (libraryById.get(libraryId) ?? null) : null;
      const linked = scanbodyCandidatesFor(scanbodyCatalog.libraries, libraryId, library);
      const rows = linked.map((row) => ({
        key: row.s3Key,
        label: `${row.kitName} · ${row.name}`,
        marginHeightMm: null as number | null,
        load: () => loadScanbodyGeometry(row.s3Key),
      }));
      out[tooth.toothNumber] = {
        missingTemplate: null,
        missingLibraryMaker:
          scanbodyCatalogLoaded && ordered?.missingLibrary && rows.length === 0
            ? (tooth.scanbodyOrder?.manufacturer.trim() ?? null)
            : null,
        orderedKey: orderOverride
          ? null
          : matchOrderedScanbody(
              linked.map((row) => ({
                key: row.s3Key,
                label: `${row.kitName} ${row.name} ${row.systemName}`,
              })),
              tooth.scanbodyOrder,
            ),
        rows,
      };
    }
    return out;
  }, [edits, libraryById, plan.teeth, scanbodyCatalog, scanbodyCatalogLoaded]);
  /** 기공소에 올려 달라고 할 형상. 관리자가 표시한 규격만(나머지는 어벗츠가 준비한다). */
  const missingShapeLabel = (() => {
    const requested = new Set(scanbodyCatalog.labUploadRequestKeys);
    for (const [toothNumber, entry] of Object.entries(scanbodyCandidates)) {
      const order = plan.teeth.find((row) => row.toothNumber === toothNumber)?.scanbodyOrder;
      if (entry.missingLibraryMaker && order && requested.has(scanbodySpecKey(order))) {
        return `${entry.missingLibraryMaker} 스캔바디 라이브러리`;
      }
      const template = entry.missingTemplate;
      if (
        template &&
        requested.has(scanbodySpecKey({ manufacturer: template.kind, diameter: template.diameter, height: template.height }))
      ) {
        return `${templateSpecLabel(template)} 템플릿`;
      }
    }
    return null;
  })();
  const missingShapeNotified = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !missingShapeLabel || missingShapeNotified.current === missingShapeLabel) return;
    missingShapeNotified.current = missingShapeLabel;
    toast({
      title: `${missingShapeLabel}가 필요합니다.`,
      description: (
        <>
          치과가 의뢰에 지정한 형상이 아직 서버에 없습니다.
          <br />
          스캔 단계 → 스캔바디에서 파일을 올려 주세요.
        </>
      ),
    });
  }, [missingShapeLabel, open, toast]);
  const scanbodyCandidateKeys = Object.values(scanbodyCandidates)
    .flatMap((entry) => entry.rows.map((row) => row.key))
    .sort()
    .join("|");
  useEffect(() => {
    if (!open) return;
    for (const entry of Object.values(scanbodyCandidates)) {
      for (const row of entry.rows) {
        if (scanbodyMeshes[row.key]) continue;
        void row
          .load()
          .then((mesh) => setScanbodyMeshes((prev) => (prev[row.key] ? prev : { ...prev, [row.key]: mesh })))
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scanbodyCandidateKeys]);
  const scanbodies = useMemo(() => {
    const out: Record<string, ScanbodyShape> = {};
    for (const tooth of plan.teeth) {
      if (!tooth.implant) continue;
      const implant = edits[tooth.toothNumber]?.implant;
      const entry = scanbodyCandidates[tooth.toothNumber];
      const rows = entry?.rows ?? [];
      const row =
        rows.find((r) => r.key === implant?.scanbodyKey) ??
        rows.find((r) => r.key === entry?.orderedKey) ??
        rows[0];
      const mesh = row ? scanbodyMeshes[row.key] : undefined;
      if (row && mesh) {
        const extent = meshExtent(mesh.positions);
        out[tooth.toothNumber] = {
          radiusMm: extent.radiusMm,
          heightMm: extent.topMm,
          mesh,
          marginHeightMm: row.marginHeightMm,
        };
        continue;
      }
      const id = implant?.libraryId;
      const base = scanbodyShapeOf(id ? (libraryById.get(id) ?? null) : null);
      const ordered = orderScanbodyShape(tooth.scanbodyOrder);
      out[tooth.toothNumber] = ordered ? { ...base, ...ordered } : base;
    }
    return out;
  }, [edits, libraryById, plan.teeth, scanbodyCandidates, scanbodyMeshes]);
  const screwPathAvailable = plan.teeth.some((tooth) => {
    const implant = edits[tooth.toothNumber]?.implant;
    return Boolean(implant?.on && implant.screwHole && generated[tooth.toothNumber] === true);
  });
  const activeImplant = activeNumber && activeTooth?.implant ? (edits[activeNumber]?.implant ?? null) : null;
  const activeLibrary = activeImplant?.libraryId
    ? (libraryById.get(activeImplant.libraryId) ?? null)
    : null;
  const activeScanbodyLabel = (() => {
    const rows = activeNumber ? (scanbodyCandidates[activeNumber]?.rows ?? []) : [];
    const row = rows.find((r) => r.key === activeImplant?.scanbodyKey) ?? rows[0];
    return row?.label ?? (activeTooth ? orderSpecLines(activeTooth).scanbody : "") ?? null;
  })();
  const prepBackTransparent = Boolean(activeNumber && edits[activeNumber]?.margin.showBack);
  const meshEditOn = meshEdit != null;
  const designEdit = useMemo(() => {
    const spec = {
      tool: modifyTool,
      refineTab,
      marginMode,
      brush: editBrush,
      edits,
      generated,
      activeTooth: activeNumber,
      bridges,
      prepBackTransparent,
      showMargin: marginShown,
      sculptBrush,
      scanbodies: stage === "scan" && !scanbodyOpen ? {} : scanbodies,
      showScrewPath: screwPathShown,
      cavityKinds,
    };
    if (stage !== "scan") return spec;
    if (marginShown && !meshEditOn) return spec;
    if (!scanbodyOpen || Object.keys(scanbodies).length === 0) return null;
    return { ...spec, tool: "scanbody" as const, showMargin: false, generated: {} };
  }, [
    activeNumber,
    bridges,
    cavityKinds,
    editBrush,
    edits,
    generated,
    marginMode,
    marginShown,
    meshEditOn,
    modifyTool,
    prepBackTransparent,
    refineTab,
    scanbodies,
    scanbodyOpen,
    screwPathShown,
    sculptBrush,
    stage,
  ]);
  /** 마진을 잡은 지대치. 뷰어가 이 마진으로 다이를 자른다. */
  const dieMargins = useMemo(() => {
    const out: Record<string, ToothDesignEdit["margin"]> = {};
    for (const tooth of plan.teeth) {
      if (tooth.implant || !tooth.designable) continue;
      const number = tooth.toothNumber;
      const review = marginReview[number] ?? "none";
      const edit = edits[number];
      if (review === "none" || !edit || edit.margin.deleted || edit.pontic.on) continue;
      out[number] = edit.margin;
    }
    return out;
  }, [edits, marginReview, plan.teeth]);
  const stoneSig = useMemo(
    () => JSON.stringify({ settings: modelSettings, dies: dieMargins }),
    [dieMargins, modelSettings],
  );
  const stoneStale = stoneParts.length > 0 && stoneBuiltSig !== stoneSig;
  const stoneDieCount = Object.keys(dieMargins).length;
  const stoneBlocked =
    modelSettings.kind === "die" && stoneDieCount === 0
      ? "마진을 잡은 지대치가 없습니다."
      : entries.length === 0
        ? "스캔을 불러온 뒤에 만듭니다."
        : null;
  const exportRows = useMemo(() => {
    if (stoneParts.length === 0) return exportRestorations;
    const models: DesignExportRestoration[] = stoneParts.map((part) => ({
      id: `${STONE_ROW_PREFIX}${part.id}`,
      label: part.label,
      fileName: part.fileName,
      teeth: [],
      blocked: stoneStale ? "다시 생성 필요" : null,
    }));
    return [...exportRestorations, ...models];
  }, [exportRestorations, stoneParts, stoneStale]);

  const patchModelSettings = (patch: Partial<ModelSettings>) => {
    const next = { ...modelSettingsRef.current, ...patch };
    if (next.kind === "die") next.dieSplit = true;
    modelSettingsRef.current = next;
    setModelSettings(next);
    queueSaveWorkRef.current();
  };

  const runStoneModel = () => {
    if (stoneBlocked) return;
    const dies = Object.entries(dieMargins).map(([tooth, margin]) => ({ tooth, margin }));
    const parts =
      viewerRef.current?.buildStoneModel({ settings: modelSettingsRef.current, dies }) ?? [];
    setStoneBuiltSig(stoneSig);
    if (parts.length === 0) {
      toast({
        title: "모델을 만들지 못했습니다.",
        description: (
          <>
            지대치가 있는 악 스캔이 필요합니다.
            <br />
            교합 확인 모델은 상악과 하악이 모두 있어야 합니다.
          </>
        ),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!open || workDocStamp === 0 || plan.teeth.length === 0) return;
    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const tooth of plan.teeth) {
        const current = next[tooth.toothNumber] ?? createToothDesignEdit();
        const on = tooth.implant != null;
        if (!on) {
          if (next[tooth.toothNumber] && current.implant.on === false) continue;
          next[tooth.toothNumber] = { ...current, implant: { ...current.implant, on: false } };
          changed = true;
          continue;
        }
        if (current.implant.orderOverride) {
          if (current.implant.on) continue;
          next[tooth.toothNumber] = { ...current, implant: { ...current.implant, on: true } };
          changed = true;
          continue;
        }
        const templateSpec = orderTemplateSpec(tooth);
        const template = abutmentTemplateFor(scanbodyCatalog.templates, templateSpec);
        const catalogsReady = templateSpec
          ? scanbodyCatalog.templates.length > 0
          : implantLibraries.length > 0;
        if (!catalogsReady) {
          if (current.implant.on) continue;
          next[tooth.toothNumber] = { ...current, implant: { ...current.implant, on: true } };
          changed = true;
          continue;
        }
        const libraryId = template
          ? `template:${template.id}`
          : (matchImplantLibrary(implantLibraries, tooth.implant)?.id ?? null);
        const kept =
          !libraryId &&
          current.implant.libraryId &&
          implantLibraryFollowsOrder(
            libraryById.get(current.implant.libraryId) ?? {
              manufacturer: "",
              brand: "",
              family: "",
              type: "",
            },
            tooth.implant,
          );
        const nextLibraryId = kept ? current.implant.libraryId : libraryId;
        const library = nextLibraryId ? (libraryById.get(nextLibraryId) ?? null) : null;
        const linked = scanbodyCandidatesFor(scanbodyCatalog.libraries, nextLibraryId, library).map((row) => ({
          key: row.s3Key,
          label: `${row.kitName} ${row.name} ${row.systemName}`,
        }));
        const orderedKey = template
          ? `template:${template.id}`
          : matchOrderedScanbody(linked, tooth.scanbodyOrder);
        const libraryChanged = current.implant.libraryId !== nextLibraryId;
        const scanbodyKey =
          libraryChanged
            ? orderedKey
            : orderedKey && !current.implant.aligned && current.implant.scanbodyKey !== orderedKey
              ? orderedKey
              : current.implant.scanbodyKey;
        if (
          current.implant.on &&
          current.implant.libraryId === nextLibraryId &&
          current.implant.scanbodyKey === scanbodyKey
        ) {
          continue;
        }
        next[tooth.toothNumber] = {
          ...current,
          implant: {
            ...current.implant,
            on: true,
            libraryId: nextLibraryId,
            scanbodyKey,
            ...(libraryChanged
              ? {
                  aligned: false,
                  axis: null,
                  offset: [0, 0, 0] as [number, number, number],
                  fitMm: null,
                  rotDeg: 0,
                }
              : {}),
          },
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    implantLibraries,
    libraryById,
    open,
    plan.teeth,
    scanbodyCatalog.libraries,
    scanbodyCatalog.templates,
    workDocStamp,
  ]);

  const workSnapshotKey = () =>
    `${JSON.stringify(editsRef.current)}\n${JSON.stringify(generatedRef.current)}\n${JSON.stringify(marginReviewRef.current)}`;

  const takeSnap = (withJaws: boolean): WorkUndoSnap => ({
    edits: structuredClone(editsRef.current),
    generated: { ...generatedRef.current },
    marginReview: { ...marginReviewRef.current },
    jaws: withJaws ? (viewerRef.current?.captureJawPositions() ?? []) : null,
    archAligned: { ...archAlignedRef.current },
  });

  const applySnap = (snap: WorkUndoSnap) => {
    setEdits(snap.edits);
    setGenerated(snap.generated);
    setMarginReview(snap.marginReview ?? {});
    if (snap.jaws) {
      viewerRef.current?.restoreJawPositions(snap.jaws);
      setArchAligned(snap.archAligned);
      setOcclusionMm(viewerRef.current?.occlusionVerticalMm() ?? 0);
    }
  };

  const finishDesignStroke = () => {
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    if (!book.stroke) return;
    const key = book.strokeKey;
    book.stroke = false;
    book.strokeKey = "";
    queueSaveWorkRef.current();
    book.closeTimer = window.setTimeout(() => {
      const current = historyRef.current;
      current.closeTimer = 0;
      if (current.stroke || workSnapshotKey() !== key) return;
      const last = current.past[current.past.length - 1];
      if (!last || last.jaws) return;
      current.past.pop();
    }, 0);
  };

  const beginEditUndo = (force = false) => {
    if (alignLocked && !force) return;
    const book = historyRef.current;
    if (!book.stroke) {
      book.past.push(takeSnap(false));
      if (book.past.length > UNDO_LIMIT) book.past.shift();
      book.future = [];
      book.stroke = true;
      book.strokeKey = workSnapshotKey();
    }
    window.clearTimeout(book.closeTimer);
    book.closeTimer = window.setTimeout(finishDesignStroke, 400);
  };

  const pushJawCheckpoint = () => {
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    if (book.stroke) {
      if (workSnapshotKey() === book.strokeKey) book.past.pop();
      book.stroke = false;
      book.strokeKey = "";
    }
    book.past.push(takeSnap(true));
    if (book.past.length > UNDO_LIMIT) book.past.shift();
    book.future = [];
  };

  const discardJawCheckpoint = (beforeSig: string) => {
    const book = historyRef.current;
    const last = book.past[book.past.length - 1];
    if (!last?.jaws) return;
    const sig = viewerRef.current?.changedScanSignature() ?? "";
    if (sig !== beforeSig) return;
    book.past.pop();
  };

  const undoWork = () => {
    if (alignLocked) return;
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    book.stroke = false;
    book.strokeKey = "";
    const snap = book.past.pop();
    if (!snap) return;
    book.future.push(takeSnap(snap.jaws != null));
    if (book.future.length > UNDO_LIMIT) book.future.shift();
    applySnap(snap);
    queueSaveWorkRef.current();
  };

  const redoWork = () => {
    if (alignLocked) return;
    const book = historyRef.current;
    window.clearTimeout(book.closeTimer);
    book.closeTimer = 0;
    book.stroke = false;
    book.strokeKey = "";
    const snap = book.future.pop();
    if (!snap) return;
    book.past.push(takeSnap(snap.jaws != null));
    if (book.past.length > UNDO_LIMIT) book.past.shift();
    applySnap(snap);
    queueSaveWorkRef.current();
  };

  const onDesignGesture = (gesture: DesignGesture) => {
    if (gesture.type === "hole-reject") {
      setHoleNote(gesture.reason);
      toast({
        title: "홀 자리를 잡지 못했습니다.",
        description: (
          <>
            {gesture.reason}
            <br />
            다른 위치를 누르세요.
          </>
        ),
        variant: "destructive",
      });
      return;
    }
    setHoleNote("");
    if (
      gesture.type === "margin-trace" &&
      !applyMarginTrace(
        editsRef.current[gesture.tooth] ?? createToothDesignEdit(),
        gesture.samples,
      )
    ) {
      toast({
        title: "마진을 닫지 못했습니다.",
        description: (
          <>
            지대치를 한 바퀴 돌며 점을 찍습니다.
            <br />
            마지막에 시작점을 다시 누르세요.
          </>
        ),
        variant: "destructive",
      });
      return;
    }
    beginEditUndo();
    if (
      gesture.type === "margin" ||
      gesture.type === "margin-insert" ||
      gesture.type === "margin-remove" ||
      gesture.type === "margin-stroke" ||
      gesture.type === "margin-trace"
    ) {
      setMarginReview((prev) =>
        prev[gesture.tooth] === "confirmed"
          ? prev
          : { ...prev, [gesture.tooth]: "confirmed" },
      );
    }
    if (gesture.type === "connector") {
      setConnectorFrom(gesture.tooth);
      if (editsRef.current[gesture.tooth]?.connector.assembled) return;
    }
    if (gesture.type === "scanbody-fit") {
      setScanbodyPickTooth(null);
      setMarginReview((prev) => ({ ...prev, [gesture.tooth]: "none" }));
      queueSaveWorkRef.current();
    }
    setEdits((prev) => {
      const current = prev[gesture.tooth] ?? createToothDesignEdit();
      const next = reduceDesignGesture(current, gesture, marginMode === "pen");
      return { ...prev, [gesture.tooth]: next };
    });
  };

  const setConnector = (from: string, connector: ToothDesignEdit["connector"]) => {
    beginEditUndo();
    setConnectorFrom(from);
    setEdits((prev) => {
      const base = prev[from] ?? createToothDesignEdit();
      return { ...prev, [from]: { ...base, connector } };
    });
    queueSaveWorkRef.current();
  };

  const patchImplant = (
    toothNumber: string,
    patch: Partial<ToothDesignEdit["implant"]>,
    options: { resetReview?: boolean } = {},
  ) => {
    beginEditUndo();
    setEdits((prev) => {
      const base = prev[toothNumber] ?? createToothDesignEdit();
      return { ...prev, [toothNumber]: { ...base, implant: { ...base.implant, ...patch } } };
    });
    if (options.resetReview) {
      setMarginReview((prev) => ({ ...prev, [toothNumber]: "none" }));
      setGenerated((prev) => ({ ...prev, [toothNumber]: false }));
    }
    queueSaveWorkRef.current();
  };

  const applyImplantLibrary = (
    toothNumber: string,
    library: ImplantLibrary,
    orderOverride: boolean,
  ) => {
    patchImplant(
      toothNumber,
      {
        libraryId: library.id,
        aligned: false,
        axis: null,
        offset: [0, 0, 0],
        fitMm: null,
        rotDeg: 0,
        scanbodyKey: null,
        orderOverride,
      },
      { resetReview: true },
    );
    setLibraryPickerFor(null);
    setLibraryConfirm(null);
  };

  const pickImplantLibrary = (toothNumber: string, library: ImplantLibrary) => {
    if (implantLibraryNeedsOrderConfirm(toothNumber, library)) {
      setLibraryConfirm({ toothNumber, library });
      return;
    }
    applyImplantLibrary(toothNumber, library, false);
  };

  const implantLibraryNeedsOrderConfirm = (toothNumber: string, library: ImplantLibrary) => {
    const tooth = plan.teeth.find((row) => row.toothNumber === toothNumber);
    const templateSpec = tooth ? orderTemplateSpec(tooth) : null;
    const template = abutmentTemplateFor(scanbodyCatalog.templates, templateSpec);
    const orderId = template
      ? `template:${template.id}`
      : tooth
        ? matchImplantLibrary(implantLibraries, tooth.implant)?.id ?? null
        : null;
    const follows =
      library.id === orderId ||
      (tooth?.implant
        ? implantLibraryFollowsOrder(library, tooth.implant) && !templateSpec
        : false);
    const specified = Boolean(
      templateSpec ||
        tooth?.implant?.manufacturer ||
        tooth?.implant?.brand ||
        tooth?.scanbodyOrder?.manufacturer,
    );
    return specified && !follows;
  };

  const orderLibraryIdOf = (toothNumber: string) => {
    const tooth = plan.teeth.find((row) => row.toothNumber === toothNumber);
    if (!tooth?.implant) return null;
    const template = abutmentTemplateFor(scanbodyCatalog.templates, orderTemplateSpec(tooth));
    if (template) return `template:${template.id}`;
    return matchImplantLibrary(implantLibraries, tooth.implant)?.id ?? null;
  };

  const scanbodyForLibrary = (toothNumber: string, libraryId: string | null) => {
    const tooth = plan.teeth.find((row) => row.toothNumber === toothNumber);
    if (!tooth) return null;
    const savedId = edits[toothNumber]?.implant.libraryId ?? null;
    if (libraryId === savedId) {
      const rows = scanbodyCandidates[toothNumber]?.rows ?? [];
      const key = edits[toothNumber]?.implant.scanbodyKey;
      const row = rows.find((item) => item.key === key) ?? (key ? null : rows[0]);
      if (row?.label) return row.label;
    }
    const templateSpec = orderTemplateSpec(tooth);
    if (templateSpec && (!libraryId || libraryId.startsWith("template:"))) {
      const template = abutmentTemplateFor(scanbodyCatalog.templates, templateSpec);
      if (template) return `${template.kind} ${template.diameter}${template.height}`;
    }
    const library = libraryId ? (libraryById.get(libraryId) ?? null) : null;
    const linked = scanbodyCandidatesFor(scanbodyCatalog.libraries, libraryId, library);
    const ordered = matchOrderedScanbody(
      linked.map((row) => ({
        key: row.s3Key,
        label: `${row.kitName} ${row.name} ${row.systemName}`,
      })),
      tooth.scanbodyOrder,
    );
    const matched = linked.find((row) => row.s3Key === ordered) ?? linked[0];
    if (matched) return `${matched.kitName} · ${matched.name}`;
    if (templateSpec) {
      return [templateSpec.kind, templateSpec.diameter, templateSpec.height].filter(Boolean).join(" ");
    }
    return orderSpecLines(tooth).scanbody || null;
  };

  const toggleImplantFavorite = (id: string) => {
    setImplantFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id];
      writeImplantFavorites(next);
      return next;
    });
  };

  const scanbodyAutoTried = useRef(new Set<string>());

  /** `wait`: 형상을 받는 중. `miss`: 삽입축 둘레에서 못 찾아 점찍기를 요청했다. */
  const fitScanbodyAuto = (toothNumber: string, quiet = false): "done" | "wait" | "miss" => {
    const shape = scanbodies[toothNumber];
    if (!shape) return "wait";
    setScanbodyPickTooth(null);
    const notFound = () =>
      toast({
        title: "스캔바디를 찾지 못했습니다.",
        description: (
          <>
            치아 교합면을 화면 가운데에 두고 삽입축을 잡은 뒤 다시 누르세요.
            <br />
            그래도 안 되면 스캔바디 위를 한 점 찍으세요.
          </>
        ),
        variant: "destructive",
      });
    const requestPick = () => {
      if (stage === "scan") {
        showTooth(toothNumber);
        if (scanFold !== "scanbody") selectScanFold("scanbody");
        setScanbodyPicks(0);
        setScanbodyPickTooth(toothNumber);
      }
      toast({
        title: `#${toothNumber} 스캔바디를 삽입축 근처에서 찾지 못했습니다.`,
        description: (
          <>
            스캔에서 #{toothNumber} 스캔바디 윗면을 한 번 찍어 주세요.
            <br />
            찍은 자리에서 라이브러리 형상을 다시 맞춥니다.
          </>
        ),
      });
    };
    const entry = scanbodyCandidates[toothNumber];
    const preferred = entry?.orderedKey;
    const rows = preferred
      ? (entry?.rows ?? []).filter((row) => row.key === preferred)
      : (entry?.rows ?? []);
    const loaded = rows.flatMap((row) => {
      const mesh = scanbodyMeshes[row.key];
      return mesh ? [{ key: row.key, mesh }] : [];
    });
    if (rows.length > 0 && loaded.length < rows.length) {
      if (!quiet) {
        toast({ title: "스캔바디 형상을 받는 중입니다.", description: "잠시 후 다시 누르세요." });
      }
      return "wait";
    }
    if (loaded.length > 0) {
      const current = editsRef.current[toothNumber]?.implant ?? null;
      const fit = viewerRef.current?.fitScanbodyMesh(toothNumber, loaded, current) ?? null;
      if (!fit || (!fit.matched && !current?.aligned)) {
        requestPick();
        return "miss";
      }
      onDesignGesture({
        type: "scanbody-fit",
        tooth: toothNumber,
        axis: fit.axis,
        offset: fit.offset,
        fitMm: fit.fitMm,
        rotDeg: fit.rotDeg,
        scanbodyKey: fit.key,
      });
      queueSaveWorkRef.current();
      if (fit.fitMm > SCANBODY_FIT_WARN_MM || fit.topCoverage < 0.6) {
        toast({
          title: "스캔바디 정합 오차가 큽니다.",
          description: (
            <>
              평균 거리 {fit.fitMm.toFixed(3)} mm입니다. 의뢰의 임플란트·스캔바디가 맞는지 확인하세요.
              <br />
              점을 한 번 찍은 뒤 자동 맞춤을 다시 누르면 그 위치에서 다시 맞춥니다.
            </>
          ),
          variant: "destructive",
        });
      }
      return "done";
    }
    const missing = entry?.missingTemplate;
    if (missing && !quiet) {
      // 올렸지만 검사 중인 템플릿은 아직 쓸 수 없다(형상을 받지 않는다).
      const scanning = scanbodyCatalog.templateUploads.some(
        (row) =>
          row.kind === missing.kind &&
          Number(row.diameter) === Number(missing.diameter) &&
          (row.status === "scanning" || row.status === "processing"),
      );
      toast({
        title: scanning
          ? `${templateSpecLabel(missing)} 템플릿을 검사하는 중입니다.`
          : `${templateSpecLabel(missing)} 템플릿이 없습니다.`,
        description: (
          <>
            {scanning
              ? "악성코드 검사가 끝나면 그 형상으로 다시 맞춥니다."
              : "스캔바디 칸에서 3Shape 스캐너로 찍은 .dcm 파일을 올려 주세요."}
            <br />
            지금은 원기둥으로 맞춥니다.
          </>
        ),
      });
    }
    if (quiet && rows.length === 0 && !orderScanbodyShape(
      plan.teeth.find((row) => row.toothNumber === toothNumber)?.scanbodyOrder ?? null,
    )) {
      return "wait";
    }
    const fit = viewerRef.current?.fitScanbody(toothNumber, shape.radiusMm) ?? null;
    if (!fit) {
      if (quiet) requestPick();
      else notFound();
      return "miss";
    }
    onDesignGesture({ type: "scanbody-fit", tooth: toothNumber, ...fit });
    queueSaveWorkRef.current();
    return "done";
  };
  const fitScanbodyAutoRef = useRef(fitScanbodyAuto);
  fitScanbodyAutoRef.current = fitScanbodyAuto;

  /**
   * 저장된 맞춤이 없는 임플란트는 라이브러리 형상을 받는 대로 스캔에 겹친다.
   * 한 번에 한 치아. 맞춘 결과가 edits에 들어간 뒤 다음 치아가 그 자리를 건너뛴다(브리지).
   */
  useEffect(() => {
    if (!open || workDocStamp === 0 || busy || scanbodyPickTooth || !scanbodyCatalogLoaded) return;
    const attempt = () => {
      let pending = false;
      for (const tooth of plan.teeth) {
        if (!tooth.implant) continue;
        const number = tooth.toothNumber;
        const implant = edits[number]?.implant;
        if (!implant?.on || implant.aligned) continue;
        const entry = scanbodyCandidates[number];
        // 지정 스캔바디 라이브러리·템플릿을 올리면 그 형상으로 맞춘다. 그 전에 원기둥으로 맞춰 두지 않는다.
        if (entry?.missingLibraryMaker || entry?.missingTemplate) continue;
        const rows = entry?.orderedKey
          ? (entry.rows ?? []).filter((row) => row.key === entry.orderedKey)
          : (entry?.rows ?? []);
        const orderShape = orderScanbodyShape(tooth.scanbodyOrder);
        if (rows.length === 0 && !orderShape) continue;
        if (!implant.libraryId && !orderShape) continue;
        if (rows.length > 0 && rows.some((row) => !scanbodyMeshes[row.key])) continue;
        const triedKey = rows.length
          ? `${number}:${rows.map((row) => row.key).join(",")}`
          : `${number}:order:${tooth.scanbodyOrder?.diameter ?? ""}:${tooth.scanbodyOrder?.height ?? ""}`;
        if (scanbodyAutoTried.current.has(triedKey)) continue;
        const outcome = fitScanbodyAutoRef.current(number, true);
        if (outcome === "wait") {
          pending = true;
          continue;
        }
        scanbodyAutoTried.current.add(triedKey);
        return false;
      }
      return pending;
    };
    if (!attempt()) return;
    const timer = window.setTimeout(attempt, 800);
    return () => window.clearTimeout(timer);
  }, [
    busy,
    edits,
    open,
    plan.teeth,
    scanbodyCandidates,
    scanbodyCatalogLoaded,
    scanbodyMeshes,
    scanbodyPickTooth,
    workDocStamp,
  ]);

  const resetScanbody = (toothNumber: string) => {
    for (const key of scanbodyAutoTried.current) {
      if (key.startsWith(`${toothNumber}:`)) scanbodyAutoTried.current.delete(key);
    }
    setScanbodyPickTooth(null);
    patchImplant(
      toothNumber,
      { aligned: false, axis: null, offset: [0, 0, 0], fitMm: null, rotDeg: 0, scanbodyKey: null },
      { resetReview: true },
    );
  };

  const applyScanbody = (toothNumber: string) => {
    setScanbodyPickTooth(null);
    setModifyTool("margin");
    setStage("margin");
    setMarginShown(true);
    setAlignKind(null);
    setAlignArch(null);
    if (canUndercut) setUndercutMap(true);
    runMarginDetect([toothNumber]);
  };

  const toothKindNow = (tooth: LabProsthesisAiTooth): LabToothKind =>
    edits[tooth.toothNumber]?.pontic.on ? "pontic" : labToothKindOf(tooth);

  const applyToothType = (tooth: LabProsthesisAiTooth, number: string, kind: LabToothKind) => {
    const oldNumber = tooth.toothNumber;
    const kindChanged = kind !== toothKindNow(tooth);
    const move = <T,>(record: Record<string, T>): Record<string, T> => {
      if (number === oldNumber || !(oldNumber in record)) return { ...record };
      const out = { ...record };
      out[number] = out[oldNumber]!;
      delete out[oldNumber];
      return out;
    };
    beginEditUndo(true);
    const nextEdits = move(editsRef.current);
    const current = nextEdits[number] ?? createToothDesignEdit();
    nextEdits[number] = {
      ...current,
      pontic: { ...current.pontic, on: kind === "pontic" },
      implant: kindChanged
        ? { ...createToothDesignEdit().implant, on: kind === "implant" }
        : current.implant,
    };
    const nextGenerated = move(generatedRef.current);
    const nextReview = move(marginReviewRef.current);
    if (kindChanged) {
      nextGenerated[number] = false;
      nextReview[number] = "none";
    }
    const source = tooth.sourceToothNumber;
    const baseTooth = basePlan.teeth.find((row) => row.sourceToothNumber === source);
    const baseKind = baseTooth ? labToothKindOf(baseTooth) : "crown";
    const override: LabToothOverride = {
      toothNumber: number !== source ? number : undefined,
      kind: kind !== baseKind && kind !== "pontic" ? kind : undefined,
    };
    const nextOverrides = { ...toothOverridesRef.current };
    if (override.toothNumber || override.kind) nextOverrides[source] = override;
    else delete nextOverrides[source];
    const nextKinds = { ...cavityKindsRef.current };
    delete nextKinds[oldNumber];
    if (kind === "inlay" || kind === "onlay") nextKinds[number] = kind;
    else delete nextKinds[number];
    cavityKindsRef.current = nextKinds;
    editsRef.current = nextEdits;
    generatedRef.current = nextGenerated;
    marginReviewRef.current = nextReview;
    toothOverridesRef.current = nextOverrides;
    setEdits(nextEdits);
    setGenerated(nextGenerated);
    setMarginReview(nextReview);
    setToothOverrides(nextOverrides);
    setSelectedTooth(number);
    setToothCardFor(null);
    queueSaveWorkRef.current();
    if (
      kindChanged &&
      stage !== "scan" &&
      (kind === "crown" || kind === "inlay" || kind === "onlay")
    ) {
      runMarginDetect([number]);
    }
  };

  /**
   * 의뢰에 지정된 스캔바디 라이브러리를 AI 디자인 안에서 올린다. 등록되면 카탈로그를 다시 받아 자동 맞춤이 이어진다.
   * .dme·.zip·exocad 폴더는 라이브러리로, 형상 한 개(.dcm·.stl·.ply·.obj)는 의뢰 규격 키트로 등록한다.
   */
  const uploadOrderScanbodyLibrary = async (
    order: { manufacturer: string; diameter: string; height: string },
    files: File[],
  ) => {
    if (scanbodyUploadStatus) return;
    const maker = order.manufacturer;
    setScanbodyUploadStatus("준비 중…");
    try {
      const single = files.length === 1 && isMeshFileName(files[0]!.name) ? files[0]! : null;
      const { rows, notes } = single
        ? { rows: [await uploadScanbodyMeshAndWait(single, order, setScanbodyUploadStatus)], notes: [] as string[] }
        : await uploadScanbodyFilesAndWait(files, maker, setScanbodyUploadStatus);
      const done = rows.filter((row) => row.status === "done");
      const failed = rows.filter((row) => row.status === "rejected" || row.status === "failed");
      if (done.length > 0) reloadScanbodyCatalog();
      if (failed.length > 0 || done.length === 0) {
        toast({
          title: done.length > 0 ? "일부 파일은 등록하지 못했습니다." : "라이브러리를 등록하지 못했습니다.",
          description: (
            <>
              {(failed.length > 0 ? failed.map((row) => `${row.fileName}: ${row.message}`) : ["검사가 아직 끝나지 않았습니다. 설정 → 스캔바디에서 확인하세요."]).map(
                (line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ),
              )}
            </>
          ),
          variant: "destructive",
        });
      } else {
        toast({
          title: `${maker} 라이브러리를 등록했습니다.`,
          description: (
            <>
              의뢰 스캔바디 치수에 맞는 형상으로 자동 맞춤을 시작합니다.
              {notes.length > 0 ? (
                <>
                  <br />
                  {notes[0]}
                </>
              ) : null}
            </>
          ),
        });
      }
    } catch (error) {
      toast({
        title: "라이브러리를 올리지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setScanbodyUploadStatus(null);
    }
  };

  /** 의뢰 규격 템플릿 형상(.dcm·.stl·.ply·.obj)을 AI 디자인 안에서 올린다. 등록되면 카탈로그를 다시 받아 자동 맞춤이 이어진다. */
  const uploadOrderTemplate = async (spec: TemplateSpec, file: File) => {
    if (scanbodyUploadStatus) return;
    setScanbodyUploadStatus("준비 중…");
    try {
      const row = await uploadTemplateFileAndWait(file, spec, setScanbodyUploadStatus);
      if (row.status === "done") {
        reloadScanbodyCatalog();
        toast({
          title: `${templateSpecLabel(spec)} 템플릿을 등록했습니다.`,
          description: "그 형상으로 자동 맞춤을 시작합니다.",
        });
      } else {
        toast({
          title: "템플릿을 등록하지 못했습니다.",
          description: row.message || "검사가 아직 끝나지 않았습니다. 설정 → 스캔바디에서 확인하세요.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "템플릿을 올리지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setScanbodyUploadStatus(null);
    }
  };

  /**
   * 의뢰 규격 형상이 없을 때 안내. 기본은 어벗츠가 제조사에서 받아 등록하니 기공소에 올려 달라고 하지 않는다.
   * 관리자가 「시장에서 거의 안 쓰는 것」으로 표시한 규격(labUploadRequestKeys)만 올리기 버튼을 보인다.
   */
  const missingShapePrompt = (toothNumber: string): ScanbodyControls["missingLibrary"] => {
    const entry = scanbodyCandidates[toothNumber];
    const template = entry?.missingTemplate;
    const requested = new Set(scanbodyCatalog.labUploadRequestKeys);
    if (template) {
      const label = templateSpecLabel(template);
      if (!requested.has(scanbodySpecKey({ manufacturer: template.kind, diameter: template.diameter, height: template.height }))) {
        return {
          lines: [`의뢰한 ${label} 템플릿을 어벗츠가 준비하고 있습니다.`, "등록되면 자동으로 맞춥니다."],
          accept: "",
          multiple: false,
          buttonLabel: "",
          status: null,
          onUpload: null,
        };
      }
      return {
        lines: [
          `의뢰한 ${label} 템플릿은 어벗츠가 구하기 어렵습니다.`,
          "쓰던 형상 파일(.dcm·.stl·.ply·.obj) 하나를 올려 주세요.",
        ],
        accept: MESH_FILE_ACCEPT,
        multiple: false,
        buttonLabel: `${templateSpecLabel(template)} 형상 올리기`,
        status: scanbodyUploadStatus,
        onUpload: (files) => void uploadOrderTemplate(template, files[0]!),
      };
    }
    const maker = entry?.missingLibraryMaker;
    if (!maker) return null;
    const order = plan.teeth.find((row) => row.toothNumber === toothNumber)?.scanbodyOrder;
    const size = [order?.diameter, order?.height].filter(Boolean).join("/");
    const spec = `${maker}${size ? ` ${size}` : ""}`;
    if (!requested.has(scanbodySpecKey({ manufacturer: maker, diameter: order?.diameter ?? "", height: order?.height ?? "" }))) {
      return {
        lines: [`치과가 지정한 ${spec} 스캔바디는 어벗츠가 제조사에서 받아 등록하고 있습니다.`, "등록되면 자동으로 맞춥니다."],
        accept: "",
        multiple: false,
        buttonLabel: "",
        status: null,
        onUpload: null,
      };
    }
    return {
      lines: [
        `치과가 지정한 ${spec} 스캔바디는 시장에서 드물어 어벗츠가 구하기 어렵습니다.`,
        "쓰던 라이브러리를 올려 주세요.",
        "3Shape .dme, exocad 폴더(또는 .zip), 스캔바디 형상(.dcm·.stl·.stp)을 받습니다.",
      ],
      accept: `.dme,.zip,.stp,.step,${MESH_FILE_ACCEPT}`,
      multiple: true,
      allowFolder: true,
      buttonLabel: `${maker} 라이브러리 올리기`,
      status: scanbodyUploadStatus,
      onUpload: (files) =>
        void uploadOrderScanbodyLibrary(
          { manufacturer: maker, diameter: order?.diameter ?? "", height: order?.height ?? "" },
          files,
        ),
    };
  };

  const scanbodyControls: ScanbodyControls | null =
    activeNumber && activeImplant
      ? {
          libraryLabel: activeLibrary
            ? `${activeLibrary.manufacturer} ${activeLibrary.label}`.trim()
            : null,
          aligned: activeImplant.aligned,
          fitMm: activeImplant.fitMm,
          picking: scanbodyPickTooth === activeNumber,
          picks: scanbodyPicks,
          onPickLibrary: () => {
            setToothCardFor(null);
            setLibraryPickerFor(activeNumber);
          },
          onAutoFit: () => fitScanbodyAuto(activeNumber),
          onTogglePick: () => {
            setScanbodyPicks(0);
            setScanbodyPickTooth((prev) => (prev === activeNumber ? null : activeNumber));
          },
          onReset: () => resetScanbody(activeNumber),
          onApply: () => applyScanbody(activeNumber),
          missingLibrary: missingShapePrompt(activeNumber),
        }
      : null;

  /** 조립·분리는 스팬 전체에 같이 건다. */
  const setSpanAssembled = (span: readonly string[], assembled: boolean) => {
    const members = planSpanMembers(plan.teeth, span);
    if (members.length < 2) return;
    if (assembled && !members.every((tooth) => generatedRef.current[tooth] === true)) {
      return;
    }
    beginEditUndo();
    setEdits((prev) => {
      const out = { ...prev };
      for (const tooth of members) {
        const base = out[tooth] ?? createToothDesignEdit();
        out[tooth] = { ...base, connector: { ...base.connector, assembled } };
      }
      return out;
    });
    queueSaveWorkRef.current();
  };

  /** 지대치 ↔ 폰틱. 스팬에 지대치가 하나는 남아야 한다. */
  const togglePontic = (toothNumber: string) => {
    const span = insertionSpanForTooth(plan.teeth, toothNumber);
    const current = editsRef.current[toothNumber] ?? createToothDesignEdit();
    const nextOn = !current.pontic.on;
    if (nextOn) {
      const abutments = span.filter(
        (tooth) => tooth !== toothNumber && !editsRef.current[tooth]?.pontic.on,
      );
      if (abutments.length === 0) return;
    }
    beginEditUndo();
    const out = {
      ...editsRef.current,
      [toothNumber]: { ...current, pontic: { ...current.pontic, on: nextOn } },
    };
    for (const tooth of span) {
      const row = out[tooth] ?? createToothDesignEdit();
      out[tooth] = { ...row, connector: { ...row.connector, assembled: false } };
    }
    editsRef.current = out;
    setEdits(out);
    setGenerated((prev) => ({ ...prev, [toothNumber]: false }));
    if (!nextOn) runMarginDetect([toothNumber]);
    queueSaveWorkRef.current();
  };

  const implantNumbersRef = useRef<Set<string>>(new Set());
  implantNumbersRef.current = new Set(
    plan.teeth.filter((tooth) => tooth.implant).map((tooth) => tooth.toothNumber),
  );
  const marginToothNumbersRef = useRef<string[]>([]);
  marginToothNumbersRef.current = (
    plan.designableTeeth.length > 0 ? plan.designableTeeth : prepTeeth
  ).map((tooth) => tooth.toothNumber);
  const clinicKey = clinicKeyFromCasePrimary(caseHeader?.primary);
  const caseDefaultPresetId = casePresetId(designLibrary, clinicKey);
  const designLibraryRef = useRef(designLibrary);
  designLibraryRef.current = designLibrary;
  const caseDefaultPresetIdRef = useRef(caseDefaultPresetId);
  caseDefaultPresetIdRef.current = caseDefaultPresetId;

  /** 의뢰 기본 프리셋을 아직 안 건 치아는 걸고, 유형이 바뀐 치아는 같은 프리셋의 그 열로 맞춘다. */
  const seedInnerPreset = (edit: ToothDesignEdit, cavityKind: CavityKind | null) =>
    alignPresetToKind(
      edit,
      innerKindOf(edit, cavityKind),
      designLibraryRef.current,
      caseDefaultPresetIdRef.current,
    );

  /**
   * 인레이·온레이는 와동 테두리, 나머지는 색·기하 마진을 잡는다.
   * 반환 함수는 치아 하나의 수정값을 고친다. 못 찾으면 `fallback`일 때 기본 고리, 아니면 null.
   * 내면 프리셋도 그 치아 유형 열로 맞춘다.
   */
  const detectMargins = (toothNumbers: readonly string[]) => {
    const kinds = cavityKindsRef.current;
    const cavityTeeth = toothNumbers.filter((number) => kinds[number]);
    const plainTeeth = toothNumbers.filter((number) => !kinds[number]);
    const cavityHits = new Map(
      (cavityTeeth.length > 0
        ? (viewerRef.current?.detectCavityMargins(cavityTeeth) ?? [])
        : []
      ).map((row) => [row.tooth, row]),
    );
    const colorHits = new Map(
      (plainTeeth.length > 0
        ? (viewerRef.current?.detectColorMargins(plainTeeth) ?? [])
        : []
      ).map((row) => [row.tooth, row]),
    );
    return (
      number: string,
      current: ToothDesignEdit,
      fallback: boolean,
    ): ToothDesignEdit | null => {
      const kind = kinds[number] ?? null;
      const seeded = seedInnerPreset(current, kind);
      if (kind) {
        const hit = cavityHits.get(number);
        if (hit) return applyDetectedCavity(seeded, hit);
        return fallback ? defaultCavityMargin(seeded, kind, MARGIN_POINT_COUNT) : null;
      }
      const hit = colorHits.get(number);
      if (hit) return applyDetectedMargin(seeded, hit.radii, hit.depths);
      return fallback ? redetectMargin(seeded) : null;
    };
  };

  const toothIsThin = (number: string, edit: ToothDesignEdit | undefined) =>
    Boolean(
      edit &&
        designIsThin(edit, cavityKindsRef.current[number] ?? null, crownShellsRef.current[number]),
    );

  const runMarginDetect = (toothNumbers: readonly string[]) => {
    const targets = toothNumbers.filter((number) => {
      if (!number) return false;
      const review = marginReviewRef.current[number];
      if (review === "detected" || review === "confirmed") return false;
      if (editsRef.current[number]?.margin.deleted) return false;
      if (editsRef.current[number]?.pontic.on) return false;
      const implantEdit = editsRef.current[number]?.implant;
      if (
        (implantNumbersRef.current.has(number) || implantEdit?.on) &&
        !implantEdit?.aligned
      ) {
        return false;
      }
      return true;
    });
    if (targets.length === 0) return;
    const detect = detectMargins(targets);
    beginEditUndo(true);
    setEdits((prev) => {
      const next = { ...prev };
      for (const number of targets) {
        next[number] = detect(number, next[number] ?? createToothDesignEdit(), true)!;
      }
      return next;
    });
    setMarginReview((prev) => {
      const next = { ...prev };
      for (const number of targets) next[number] = "detected";
      return next;
    });
    setMarginShown(true);
    queueSaveWorkRef.current();
  };

  const runGenerate = async (toothNumbers: string[]) => {
    const targets = toothNumbers.filter((number) => {
      if (!number) return false;
      const edit = editsRef.current[number];
      if (edit?.pontic.on === true) return true;
      if (edit?.implant.on && !(edit.implant.libraryId && edit.implant.aligned)) return false;
      return marginReviewRef.current[number] === "confirmed";
    });
    if (targets.length === 0) return;
    const seq = genSeq.current + 1;
    genSeq.current = seq;
    setGenerating(true);
    setStage("design");
    const willBeThin = targets.some((number) => toothIsThin(number, editsRef.current[number]));
    if (willBeThin) setContactMap(false);
    else if (canContact) setContactMap(true);
    setGenLabel(
      willBeThin
        ? "보철을 생성하는 중"
        : canContact
          ? "교합 접촉을 계산하는 중"
          : "보철을 생성하는 중",
    );
    viewerRef.current?.setView("occlusal");
    await wait(900);
    if (genSeq.current !== seq) return;
    setGenerating(false);
    setGenLabel("");
    beginEditUndo();
    setEdits((prev) => {
      const next = { ...prev };
      for (const number of targets) {
        const current = next[number] ?? createToothDesignEdit();
        next[number] = seedInnerPreset(current, cavityKindsRef.current[number] ?? null);
      }
      return next;
    });
    setGenerated((prev) => {
      const next = { ...prev };
      for (const number of targets) next[number] = true;
      return next;
    });
    setModifyTool("refine");
    setStage("design");
    queueSaveWorkRef.current();
  };

  const commitAiChat = (next: AiDesignChatTurn[]) => {
    const clipped = next.slice(-40);
    for (const turn of next.slice(0, next.length - clipped.length)) {
      if (turn.paintImageUrl) URL.revokeObjectURL(turn.paintImageUrl);
    }
    aiChatRef.current = clipped;
    setAiChat(clipped);
    queueSaveWorkRef.current();
  };

  const removeAiChatTurn = (index: number) => {
    const current = aiChatRef.current;
    const turn = current[index];
    if (!turn) return;
    if (turn.paintImageUrl) URL.revokeObjectURL(turn.paintImageUrl);
    commitAiChat(current.filter((_, row) => row !== index));
  };

  const sendAiChat = () => {
    const text = chatDraft.trim().slice(0, 2000);
    if (!text) return;
    commitAiChat([...aiChatRef.current, { role: "user", text }]);
    setChatDraft("");
  };

  const sendPaintToAi = () => {
    const surface = paint.paintRef.current;
    const base = viewerRef.current?.captureCanvas();
    if (!surface || !base) return;
    void surface.compositePng(base).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      commitAiChat([
        ...aiChatRef.current,
        { role: "user", text: "페인트 표시", fromPaint: true, paintImageUrl: url },
      ]);
      setPanelsHidden(false);
      setChatOpen(true);
    });
  };

  /** 인레이·온레이는 와동 테두리를 바로 다시 잡고, 나머지는 시작점을 찍게 한다. */
  const startMarginRedetect = (toothNumber: string) => {
    if (!cavityKindsRef.current[toothNumber]) {
      setMarginSeedPick((prev) => (prev === toothNumber ? null : toothNumber));
      return;
    }
    beginEditUndo();
    const detect = detectMargins([toothNumber]);
    setEdits((prev) => ({
      ...prev,
      [toothNumber]: detect(toothNumber, prev[toothNumber] ?? createToothDesignEdit(), true)!,
    }));
    setMarginReview((prev) => ({ ...prev, [toothNumber]: "detected" }));
    setMarginShown(true);
    queueSaveWorkRef.current();
  };

  const redetectMarginFrom = (toothNumber: string, point: { x: number; y: number; z: number }) => {
    const hit = viewerRef.current?.detectColorMargins([toothNumber], point)?.[0];
    if (!hit) {
      toast({
        title: "그 자리에서 마진을 찾지 못했습니다.",
        description: "지대치와 잇몸 경계 위를 다시 찍으세요.",
        variant: "destructive",
      });
      return;
    }
    setMarginSeedPick(null);
    beginEditUndo();
    setEdits((prev) => {
      const current = seedInnerPreset(prev[toothNumber] ?? createToothDesignEdit(), null);
      return { ...prev, [toothNumber]: applyDetectedMargin(current, hit.radii, hit.depths) };
    });
    setMarginReview((prev) => ({ ...prev, [toothNumber]: "detected" }));
    setMarginShown(true);
    queueSaveWorkRef.current();
  };

  useEffect(() => {
    setMarginSeedPick(null);
  }, [activeNumber, modifyTool, stage]);

  useEffect(() => {
    if (!marginSeedPick) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMarginSeedPick(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [marginSeedPick]);

  const confirmMargin = (toothNumber: string) => {
    if (marginReviewRef.current[toothNumber] !== "detected") return;
    if (editsRef.current[toothNumber]?.margin.deleted) return;
    const implant = editsRef.current[toothNumber]?.implant;
    if (implant?.on && !implant.aligned) return;
    beginEditUndo();
    setMarginReview((prev) => ({ ...prev, [toothNumber]: "confirmed" }));
    queueSaveWorkRef.current();
  };

  const applyPresetToTooth = (toothNumber: string, presetId: string) => {
    const preset = findDesignPreset(designLibraryRef.current, presetId);
    if (!preset) return;
    beginEditUndo();
    setEdits((prev) => {
      const current = prev[toothNumber] ?? createToothDesignEdit();
      const kind = innerKindOf(current, cavityKindsRef.current[toothNumber] ?? null);
      return { ...prev, [toothNumber]: applyDesignPreset(current, preset, kind) };
    });
    queueSaveWorkRef.current();
  };

  const onStage = (next: DesignStage) => {
    setStage(next);
    setMarginShown(next === "margin" || next === "design");
    if (next !== "scan") {
      setAlignKind(null);
      setAlignArch(null);
      setScanbodyPickTooth(null);
    }
    if (next === "margin") {
      if (designFold === "occlusal") setDesignFold("modify");
      runMarginDetect(marginToothNumbersRef.current);
    }
    if (next === "scan" || next === "model" || next === "milling") return;
    if (canUndercut) setUndercutMap(true);
    if (next === "design" && canContact) setContactMap(true);
  };

  const hasUpperScan = scans.some((row) => row.role === "upper");
  const hasLowerScan = scans.some((row) => row.role === "lower");
  const hasBiteScan = scans.some((row) => row.role === "bite");
  const canAlignModels = hasBiteScan && (hasUpperScan || hasLowerScan) && entries.length > 0;
  const canAdjustOcclusion = hasUpperScan && hasLowerScan && entries.length > 0;
  const occlusionOn = alignKind === "occlusion" && canAdjustOcclusion;

  const startOcclusion = () => {
    if (alignKind === "occlusion") {
      setAlignKind(null);
      return;
    }
    setAlignKind("occlusion");
    setAlignArch(null);
    setAlignPicks({ model: 0, bite: 0 });
    setOcclusionArch(prepArch === "lower" ? "upper" : "lower");
    setOcclusionMm(0);
  };

  const pickOcclusionArch = (arch: "upper" | "lower") => {
    if (arch !== occlusionArch) setOcclusionArch(arch);
  };

  const onOcclusionEdit = (phase: "start" | "end") => {
    if (phase === "start") {
      occlusionBeforeSigRef.current = viewerRef.current?.changedScanSignature() ?? "";
      pushJawCheckpoint();
      return;
    }
    discardJawCheckpoint(occlusionBeforeSigRef.current);
    setOcclusionMm(viewerRef.current?.occlusionVerticalMm() ?? 0);
    queueSaveWorkRef.current();
  };

  const onMeshEditPhase = (phase: "start" | "end") => {
    if (phase === "start") {
      meshEditBeforeSigRef.current = viewerRef.current?.changedScanSignature() ?? "";
      pushJawCheckpoint();
      return;
    }
    discardJawCheckpoint(meshEditBeforeSigRef.current);
    queueSaveWorkRef.current();
  };

  const toggleMeshEdit = (on: boolean) => {
    if (!on) {
      setMeshEdit(null);
      return;
    }
    setAlignKind(null);
    setAlignArch(null);
    setMeshEdit((prev) => prev ?? { ...DEFAULT_SCAN_MESH_EDIT });
  };

  const selectScanFold = (next: "align" | "mesh" | "scanbody" | null) => {
    const prev = scanFold;
    if (prev === next) return;
    setScanFold(next);
    if (prev === "align" && next !== "align") {
      viewerRef.current?.cancelAlign();
      setAlignKind(null);
      setAlignArch(null);
    }
    if (prev === "scanbody" && next !== "scanbody") setScanbodyPickTooth(null);
    if (next === "mesh") toggleMeshEdit(true);
    else if (prev === "mesh") toggleMeshEdit(false);
  };

  const patchMeshEdit = (patch: Partial<ScanMeshEdit>) => {
    setMeshEdit((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const applyMeshEdit = () => {
    const result = viewerRef.current?.meshEditApply();
    if (!result) return;
    if (result.kind === "whole") {
      toast({
        title: "스캔을 모두 지울 수는 없습니다.",
        description: "남길 부분을 선택에서 빼세요.",
        variant: "destructive",
      });
      return;
    }
    if (result.kind === "extractFailed") {
      toast({
        title: "발치 자리를 메우지 못했습니다.",
        description:
          result.reason === "edge" ? (
            <>
              치아 경계가 스캔 가장자리에 닿았습니다.
              <br />
              경계 브러시로 가장자리 쪽을 빼고 다시 적용하세요.
            </>
          ) : (
            <>
              경계가 꼬였거나 너무 깁니다.
              <br />
              경계를 좁히거나 브러시로 다듬은 뒤 다시 적용하세요.
            </>
          ),
        variant: "destructive",
      });
      return;
    }
    if (result.kind === "filled" && result.failed > 0) {
      toast({
        title: `구멍 ${result.failed}개를 메우지 못했습니다.`,
        description: (
          <>
            테두리가 꼬였거나 너무 깁니다.
            <br />
            주변을 다듬기로 정리한 뒤 다시 메우세요.
          </>
        ),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (alignKind) setMeshEdit(null);
  }, [alignKind]);

  const noExtractTeeth = meshEditStatus.teeth.length === 0;
  useEffect(() => {
    if (!noExtractTeeth) return;
    setMeshEdit((prev) =>
      prev?.tab === "extract" && prev.extractTool === "brush" ? { ...prev, extractTool: "pick" } : prev,
    );
  }, [noExtractTeeth]);

  useEffect(() => {
    if (stage !== "scan" || !open) setMeshEdit(null);
  }, [open, stage]);

  const runAutoAlign = async () => {
    const before = viewerRef.current?.changedScanSignature() ?? "";
    pushJawCheckpoint();
    setAlignKind("auto");
    setAlignArch(null);
    setAlignPicks({ model: 0, bite: 0 });
    setAlignBusy(true);
    const fitted = await viewerRef.current?.alignToBiteAuto();
    if (fitted !== true) discardJawCheckpoint(before);
    setAlignBusy(false);
    setAlignKind(null);
    if (fitted === true) {
      setArchAligned((prev) => ({
        upper: prev.upper || hasUpperScan,
        lower: prev.lower || hasLowerScan,
      }));
      queueSaveWorkRef.current();
      runMarginDetect(marginToothNumbersRef.current);
    }
  };

  const showTooth = (toothNumber: string) => {
    setSelectedTooth(toothNumber);
    const span = insertionSpanForTooth(plan.teeth, toothNumber);
    const restored =
      span.length > 0 &&
      viewerRef.current?.restoreInsertionView(span) === true;
    if (!restored) viewerRef.current?.focusTooth(toothNumber);
  };

  const setToothShown = (toothNumber: string, on: boolean) => {
    setHiddenTeeth((prev) => {
      const rest = prev.filter((number) => number !== toothNumber);
      return on ? rest : [...rest, toothNumber];
    });
  };

  const archShown = (arch: "upper" | "lower") => {
    const rows = scans.filter((scan) => scan.role === arch);
    if (rows.length > 0) return rows.every((scan) => visible[scan.id] !== false);
    return plan.teeth.some(
      (tooth) =>
        toothArchGroup(tooth.toothNumber) === arch && !hiddenTeeth.includes(tooth.toothNumber),
    );
  };

  /** 그 악 스캔과 그 악 치아의 다이·작업물을 같이 켜고 끈다. */
  const setArchShown = (arch: "upper" | "lower", on: boolean) => {
    setVisible((prev) => {
      const out = { ...prev };
      for (const scan of scans) {
        if (scan.role === arch) out[scan.id] = on;
      }
      return out;
    });
    const archTeeth = plan.teeth
      .filter((tooth) => toothArchGroup(tooth.toothNumber) === arch)
      .map((tooth) => tooth.toothNumber);
    setHiddenTeeth((prev) => {
      const rest = prev.filter((number) => !archTeeth.includes(number));
      return on ? rest : [...rest, ...archTeeth];
    });
  };

  /** 월드가 돌면 편집·실행 취소에 든 월드 벡터와 정점을 같은 회전으로 옮긴다. */
  const onWorldTurned = (turn: OralScanWorldTurn) => {
    const turnEdits = (rows: Record<string, ToothDesignEdit>) => {
      let changed = false;
      const next: Record<string, ToothDesignEdit> = { ...rows };
      for (const [number, edit] of Object.entries(rows)) {
        const implant = edit.implant;
        if (!implant.axis && implant.offset.every((value) => value === 0)) continue;
        next[number] = {
          ...edit,
          implant: {
            ...implant,
            axis: implant.axis ? turn.vector(implant.axis) : null,
            offset: turn.vector(implant.offset),
          },
        };
        changed = true;
      }
      return changed ? next : rows;
    };
    const nextEdits = turnEdits(editsRef.current);
    if (nextEdits !== editsRef.current) {
      editsRef.current = nextEdits;
      setEdits(nextEdits);
    }
    const book = historyRef.current;
    for (const snap of [...book.past, ...book.future]) {
      snap.edits = turnEdits(snap.edits);
      if (snap.jaws) {
        snap.jaws = snap.jaws.map((row) => ({
          ...row,
          positions: turn.jaw(row.id, row.positions),
        }));
      }
    }
  };

  /** 삽입축을 잡은 치아의 마진을 그 축으로 다시 잡는다. 못 찾은 치아와 확인한 마진은 그대로 둔다. */
  const applyAimedDetections = (toothNumbers: readonly string[]) => {
    const targets = toothNumbers.filter((number) => {
      if (marginReviewRef.current[number] === "confirmed") return false;
      if (editsRef.current[number]?.margin.deleted) return false;
      return true;
    });
    if (targets.length === 0) return;
    const detect = detectMargins(targets);
    const found = new Map<string, ToothDesignEdit>();
    for (const number of targets) {
      const next = detect(number, editsRef.current[number] ?? createToothDesignEdit(), false);
      if (next) found.set(number, next);
    }
    if (found.size === 0) return;
    beginEditUndo();
    setEdits((prev) => {
      const next = { ...prev };
      for (const [number, edit] of found) next[number] = edit;
      return next;
    });
    setMarginReview((prev) => {
      const next = { ...prev };
      for (const number of found.keys()) {
        if (next[number] !== "confirmed") next[number] = "detected";
      }
      return next;
    });
  };

  const insertionTaken = (toothNumbers: readonly string[]) => {
    const key = insertionAxisKey(toothNumbers);
    if (!key) return;
    setInsertionKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setInsertionShown(true);
    applyAimedDetections(toothNumbers);
    queueSaveWorkRef.current();
  };

  /** 지금 화면으로 삽입축을 잡고 저장한다. */
  const captureInsertion = (toothNumbers: readonly string[]) => {
    const viewer = viewerRef.current;
    const key = insertionAxisKey(toothNumbers);
    if (!viewer || !key) return;
    setInsertionShown(true);
    setCenterGuide((mode) => (mode === "off" ? "center" : mode));
    setToothInfoOpen(true);
    if (viewer.setInsertionFromView(toothNumbers) !== true) return;
    insertionTaken(toothNumbers);
    setAxisChangeHintKey(key);
  };

  const endAiming = () => {
    aimingRef.current = null;
    setAiming(null);
  };

  /** 치아 정보 아이콘 — 미리보기로 맞추고 아래에서 설정·취소한다. */
  const startAiming = (toothNumbers: readonly string[]) => {
    const viewer = viewerRef.current;
    const key = insertionAxisKey(toothNumbers);
    if (!viewer || !key) return;
    const prev = aimingRef.current;
    const before = prev?.before ?? viewer.exportInsertionAxes();
    if (prev && insertionAxisKey(prev.span) !== key) viewer.restoreInsertionAxes(before);
    const next = { span: [...toothNumbers], before };
    aimingRef.current = next;
    setAiming(next);
    setAxisChangeHintKey("");
    setInsertionShown(true);
    setCenterGuide((mode) => (mode === "off" ? "center" : mode));
    setToothInfoOpen(true);
    viewer.setInsertionFromView(toothNumbers, { preview: true });
  };

  const confirmAiming = () => {
    const current = aimingRef.current;
    if (!current) return;
    endAiming();
    if (viewerRef.current?.setInsertionFromView(current.span) !== true) return;
    insertionTaken(current.span);
  };

  const cancelAiming = () => {
    const current = aimingRef.current;
    if (!current) return;
    endAiming();
    viewerRef.current?.restoreInsertionAxes(current.before);
  };

  /** 작업 위저드 — 삽입축을 스팬 순서대로 안내한 뒤 마진·디자인으로 이어간다. */
  const insertionWizardSpans = useMemo(
    () => [...insertionSpansByOwner(plan.teeth).values()],
    [plan.teeth],
  );
  const wizardSteps = useMemo(() => {
    const pages = insertionWizardSpans.length;
    const steps: AlignWizardStep[] = insertionWizardSpans.map((span, index) => ({
      kind: "axis",
      span,
      page: index + 1,
      pages,
    }));
    for (const tooth of plan.teeth) {
      if (!tooth.implant) continue;
      steps.push({ kind: "library", tooth: tooth.toothNumber });
      steps.push({ kind: "scanbody", tooth: tooth.toothNumber });
    }
    steps.push({ kind: "margin" });
    steps.push({ kind: "design" });
    if (plan.teeth.some((tooth) => cavityKindOf(tooth))) {
      steps.push({ kind: "thickness" }, { kind: "export" });
    }
    return steps;
  }, [insertionWizardSpans, plan.teeth]);
  const wizardStepDone = (step: AlignWizardStep) => {
    if (step.kind === "axis") {
      const key = insertionAxisKey(step.span);
      return Boolean(key && insertionKeys.includes(key));
    }
    if (step.kind === "library") return Boolean(edits[step.tooth]?.implant.libraryId);
    if (step.kind === "scanbody") return edits[step.tooth]?.implant.aligned === true;
    return false;
  };
  const suggestedWizardIndex = useMemo(() => {
    const pending = wizardSteps.findIndex(
      (step) =>
        (step.kind === "axis" || step.kind === "library" || step.kind === "scanbody") &&
        !wizardStepDone(step),
    );
    if (pending >= 0) return pending;
    if (stage === "design") {
      const designAt = wizardSteps.findIndex((step) => step.kind === "design");
      if (designAt >= 0) return designAt;
    }
    const marginAt = wizardSteps.findIndex((step) => step.kind === "margin");
    return marginAt >= 0 ? marginAt : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, insertionKeys, stage, wizardSteps]);
  const [wizardIndex, setWizardIndex] = useState<number | null>(null);
  const activeWizardIndex =
    wizardSteps.length === 0
      ? 0
      : Math.min(wizardIndex ?? suggestedWizardIndex, wizardSteps.length - 1);
  const viewedWizardStep = wizardSteps[activeWizardIndex] ?? null;
  const viewedAxisKey =
    viewedWizardStep?.kind === "axis" ? insertionAxisKey(viewedWizardStep.span) : "";
  /** 아직 삽입축을 안 잡은 보철. 작업영역 아래 뱃지로 잡게 한다. */
  const pendingAxisSpan =
    viewedWizardStep?.kind === "axis" && viewedAxisKey && !insertionKeys.includes(viewedAxisKey)
      ? viewedWizardStep.span
      : null;
  const [axisPulseKey, setAxisPulseKey] = useState("");
  const highlightInsertionKey = axisPulseKey;
  const insertionKeysSeenRef = useRef(insertionKeys);

  useEffect(() => {
    const key = pendingAxisSpan ? viewedAxisKey : axisChangeHintKey;
    if (!key) {
      setAxisPulseKey("");
      return;
    }
    setAxisPulseKey(key);
    const timer = window.setTimeout(() => {
      setAxisPulseKey("");
      if (!pendingAxisSpan) setAxisChangeHintKey("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [pendingAxisSpan, viewedAxisKey, axisChangeHintKey]);

  /** 스캔을 열면 저장된 축이 없는 첫 보철을 교합면으로 보여 준다. 삽입축 설정 뱃지가 그 위에 뜬다. */
  const showMissingAxis = (savedKeys: readonly string[]) => {
    const lead = insertionWizardSpans.find((span) => {
      const key = insertionAxisKey(span);
      return Boolean(key && !savedKeys.includes(key));
    });
    if (lead?.[0]) showTooth(lead[0]);
  };

  useEffect(() => {
    const previous = insertionKeysSeenRef.current;
    insertionKeysSeenRef.current = insertionKeys;
    if (wizardIndex == null) return;
    const step = wizardSteps[wizardIndex];
    if (!step || step.kind !== "axis") return;
    const key = insertionAxisKey(step.span);
    if (!key || !insertionKeys.includes(key) || previous.includes(key)) return;
    let nextIndex = -1;
    for (let index = wizardIndex + 1; index < wizardSteps.length; index += 1) {
      const candidate = wizardSteps[index];
      if (!candidate) continue;
      if (candidate.kind !== "axis") {
        nextIndex = index;
        break;
      }
      const spanKey = insertionAxisKey(candidate.span);
      if (!spanKey || !insertionKeys.includes(spanKey)) {
        nextIndex = index;
        break;
      }
    }
    if (nextIndex >= 0) setWizardIndex(nextIndex);
  }, [insertionKeys, wizardIndex, wizardSteps]);

  useEffect(() => {
    if (wizardIndex == null) return;
    const step = wizardSteps[wizardIndex];
    if (!step || (step.kind !== "library" && step.kind !== "scanbody")) return;
    if (wizardStepDone(step)) setWizardIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, wizardIndex, wizardSteps]);

  useEffect(() => {
    if (busy || !viewedAxisKey || viewedWizardStep?.kind !== "axis") return;
    const lead = viewedWizardStep.span[0];
    if (!lead) return;
    showTooth(lead);
    setCenterGuide((mode) => (mode === "off" ? "center" : mode));
    setPanelsHidden(false);
    setToothInfoOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedAxisKey, busy]);

  const enqueueDraft = useCallback((task: () => Promise<void>) => {
    const run = draftQueueRef.current.then(task, task);
    draftQueueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const currentWorkDocument = useCallback((): WorkSessionDocument => {
    const axes =
      aimingRef.current?.before ??
      viewerRef.current?.exportInsertionAxes() ??
      sessionDocRef.current?.insertionAxes ??
      [];
    return {
      edits: editsRef.current,
      generated: generatedRef.current,
      marginReview: marginReviewRef.current,
      designScope: designScopeRef.current,
      modelSettings: modelSettingsRef.current,
      milling: millingDocRef.current,
      note: caseNoteRef.current,
      aiChat: toPersistedAiChat(aiChatRef.current),
      toothOverrides: toothOverridesRef.current,
      insertionAxes: axes,
      archAligned: archAlignedRef.current,
      jawFileBind: 1,
      camera:
        viewerRef.current?.exportCamera() ??
        sessionDocRef.current?.camera ??
        null,
      viewToggles: viewTogglesRef.current,
      savedAt: Date.now(),
    };
  }, []);

  const flushWorkDraft = useCallback(() => {
    if (!autoSaveRef.current) return Promise.resolve();
    const id = String(transferId || "").trim();
    if (!id) return Promise.resolve();
    return enqueueDraft(async () => {
      if (saveLockRef.current || suspendDraftRef.current) return;
      const document = currentWorkDocument();
      const docSig = workDocumentSignature(document);
      const sig = viewerRef.current?.changedScanSignature() ?? "";
      const meshes =
        sig && sig !== lastDraftSigRef.current
          ? (viewerRef.current?.exportChangedScans() ?? [])
          : [];
      if (docSig === lastDocSigRef.current && meshes.length === 0) return;
      await writeWorkSession(id, { meshes, document });
      if (meshes.length > 0 && sig) lastDraftSigRef.current = sig;
      lastDocSigRef.current = docSig;
      sessionDocRef.current = document;
    });
  }, [currentWorkDocument, enqueueDraft, transferId]);

  const queueSaveWork = useCallback(() => {
    if (!autoSaveRef.current) return;
    window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      void flushWorkDraft();
    }, 0);
  }, [flushWorkDraft]);
  queueSaveWorkRef.current = queueSaveWork;

  useEffect(() => {
    if (!open) return;
    const onHide = () => {
      window.clearTimeout(draftTimerRef.current);
      if (!autoSaveRef.current) return;
      void flushWorkDraft();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.clearTimeout(draftTimerRef.current);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [flushWorkDraft, open]);

  // 창이 열려 있는 동안 서버에 작업 중 표시를 남긴다. 해제는 닫고 저장을 마친 뒤(persistWorkingScans).
  useEffect(() => {
    const id = String(transferId || "").trim();
    if (!open || !id || !authToken) return;
    void sendWorkScanEditing(id, authToken, true);
    const timer = window.setInterval(() => {
      void sendWorkScanEditing(id, authToken, true);
    }, WORK_SCAN_EDITING_BEAT_MS);
    return () => window.clearInterval(timer);
  }, [authToken, open, transferId]);

  const persistWorkingScans = useCallback(async (snapshot: WorkCloseSnapshot) => {
    const { id, token, dirty, document, pendingRoles, serverAt } = snapshot;
    try {
      await enqueueDraft(async () => {
        try {
          const encoded =
            dirty.length > 0 ? await writeWorkDraftMeshes(id, dirty) : [];
          await writeWorkSessionDocument(id, document);
          const draft = await readWorkDraft(id);
          const dirtyRoles = new Set(dirty.map((row) => row.role));
          const wanted = new Set<WorkScanRole>([
            ...newerDraftRoles(draft, serverAt),
            ...dirtyRoles,
            ...pendingRoles,
          ]);
          if (wanted.size === 0) return;

          const blobs: File[] = [];
          const roles: WorkScanRole[] = [];
          for (const file of encoded) {
            if (!wanted.has(file.role)) continue;
            blobs.push(
              new File([file.bytes], file.fileName, {
                type: "application/octet-stream",
              }),
            );
            roles.push(file.role);
          }
          // 이번 세션에서 움직이지 않은 초안은 IndexedDB 바이트를 올린다.
          // 화면 배치까지 파일에 넣으면 다음에 열 때 배치가 두 번 적용된다.
          for (const file of draft?.files || []) {
            if (!wanted.has(file.role) || dirtyRoles.has(file.role) || !file.bytes) {
              continue;
            }
            blobs.push(
              new File([file.bytes], file.fileName, {
                type: "application/octet-stream",
              }),
            );
            roles.push(file.role);
          }
          if (blobs.length === 0) return;

          const uploaded = await uploadFiles(blobs);
          const mapped = uploaded.map((file, index) => {
            const originalName = String(
              file.originalName || blobs[index]?.name || "",
            ).trim();
            const s3Key = String(file.key || "").trim();
            const role = roles[index];
            const local = blobs[index];
            if (!originalName || !s3Key || !role || !local) return null;
            sessionScanFileCache.set(s3Key, local);
            return {
              local,
              patientName: "",
              tooth: "",
              scanRole: role,
              scanRoleSetBy: "lab" as const,
              file: {
                originalName,
                mimetype: "application/octet-stream",
                size: Number(file.size || local.size || 0) || 0,
                s3Key,
              },
            };
          });
          const payload = mapped.filter((row) => row != null);
          if (!payload.length) {
            throw new Error("작업 스캔 업로드에 실패했습니다.");
          }
          const cacheReady = Promise.all(
            payload.map((row) =>
              setFileBlob(s3FileBlobCacheKey(row.file.s3Key), row.local),
            ),
          ).then(
            () => undefined,
            () => undefined,
          );
          const appended = await apiFetch({
            path: `/api/practice/transfers/received/${encodeURIComponent(id)}/work-scan-files`,
            method: "POST",
            token,
            jsonBody: {
              files: payload.map((row) => ({
                patientName: row.patientName,
                tooth: row.tooth,
                scanRole: row.scanRole,
                scanRoleSetBy: row.scanRoleSetBy,
                file: row.file,
              })),
              archAligned: document.archAligned,
            },
          });
          if (!appended.ok) {
            throw new Error(
              apiMessage(appended.data) || "작업 스캔 저장에 실패했습니다.",
            );
          }
          const savedRoles = new Set(roles);
          const data = unwrapApiData(appended.data);
          const production =
            data.production && typeof data.production === "object"
              ? (data.production as Record<string, unknown>)
              : {};
          const synced = newestWorkScanUploadedAtMs(
            filesOfApi(production.labWorkScanFiles),
          );
          let stamp = 0;
          for (const role of savedRoles) {
            stamp = Math.max(stamp, synced.get(role) ?? 0);
          }
          if (stamp > 0) {
            await stampWorkDraftSavedAt(id, [...savedRoles], stamp);
          }
          await Promise.all([
            dropWorkDraftRoles(id, [...savedRoles]),
            cacheReady,
          ]);
          onWorkingScansPersisted?.({
            files: data.files,
            trashedFiles: data.trashedFiles,
            workScanFiles: production.labWorkScanFiles,
            workScanAlignment: production.workScanAlignment,
          });
          const labels = [...savedRoles].map((role) => oralScanRoleLabel(role));
          toast({
            title: "작업 스캔을 저장했습니다.",
            description: (
              <>
                {labels.join(", ")} DCM이 작업 파일에 추가됐습니다.
                <br />
                AI를 다시 열면 이 파일을 읽고, 목록에서 다운로드할 수 있습니다.
              </>
            ),
          });
        } catch (error) {
          suspendDraftRef.current = false;
          toast({
            title: "작업 스캔 저장 실패",
            description:
              error instanceof Error
                ? error.message
                : "작업 스캔을 저장하지 못했습니다.",
            variant: "destructive",
          });
        }
      });
    } finally {
      saveLockRef.current = false;
      void sendWorkScanEditing(id, token, false);
    }
  }, [enqueueDraft, onWorkingScansPersisted, toast, uploadFiles]);

  const undoWorkRef = useRef(undoWork);
  const redoWorkRef = useRef(redoWork);
  const finishStrokeRef = useRef(finishDesignStroke);
  undoWorkRef.current = undoWork;
  redoWorkRef.current = redoWork;
  finishStrokeRef.current = finishDesignStroke;

  const toggleMarginShown = () => {
    const next = !marginShown;
    setMarginShown(next);
    if (next) {
      setStage("margin");
      setModifyTool("margin");
      setAlignKind(null);
      setAlignArch(null);
    }
  };
  const toggleColorMap = () => {
    if (colorMap.on) {
      setColorMap((prev) => ({ ...prev, on: false }));
      return;
    }
    const anyIntaglio = Object.values(intaglios).some((row) => row.status === "ok");
    let mode = colorMap.mode;
    if (mode === "fit" && !anyIntaglio) mode = "contact";
    if (mode === "contact" && !canContact) mode = "thickness";
    setColorMap({ ...colorMap, on: true, mode });
    setMarginShown(true);
    setStage("design");
  };
  const toggleUndercut = () => {
    if (!canUndercut || insertionAxisVisible) return;
    setUndercutMap((on) => !on);
  };

  const runShortcut = (action: DesignKeyAction) => {
    const viewer = viewerRef.current;
    switch (action) {
      case "undo":
        return undoWorkRef.current();
      case "redo":
        return redoWorkRef.current();
      case "viewFit":
        return viewer?.setView("fit");
      case "viewHome":
        return viewer?.resetHomeView();
      case "viewOcclusal":
        return viewer?.setView("occlusal");
      case "viewBuccal":
        return viewer?.setView("buccal");
      case "viewLingual":
        return viewer?.setView("lingual");
      case "toggleScanColor":
        if (scans.length > 0) setColorMapping((on) => !on);
        return;
      case "toggleMargin":
        return toggleMarginShown();
      case "toggleGrid":
        return setCenterGuide((mode) => nextCenterGuide(mode));
      case "toggleColorMap":
        return toggleColorMap();
      case "toggleInsertion":
        return setInsertionShown((on) => !on);
      case "toggleUndercut":
        return toggleUndercut();
      case "sculptAdd":
        return setSculptBrush((prev) => ({ ...prev, shape: "add" }));
      case "sculptRemove":
        return setSculptBrush((prev) => ({ ...prev, shape: "remove" }));
      case "sculptSmooth":
        return setSculptBrush((prev) => ({ ...prev, shape: "smooth" }));
      case "sculptFlatten":
        return setSculptBrush((prev) => ({ ...prev, shape: "flatten" }));
      case "sculptInflate":
        return setSculptBrush((prev) => ({ ...prev, shape: "inflate" }));
    }
  };
  const runShortcutRef = useRef(runShortcut);
  runShortcutRef.current = runShortcut;
  /** 단축키를 받지 않는 때. 조작 설정 창은 전부, 겹친 창·페인트·밀링 화면은 실행 취소·다시 실행만 받는다. */
  const shortcutPausedRef = useRef({ all: false, view: false });
  shortcutPausedRef.current = {
    all: controlsOpen,
    view: presetDialog != null || exportOpen || paint.paintOn || stage === "milling",
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.isComposing ||
        (target instanceof HTMLElement &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable))
      ) {
        return;
      }
      const action = matchDesignKey(getDesignControls().keys, event);
      if (!action) return;
      const history = action === "undo" || action === "redo";
      const paused = shortcutPausedRef.current;
      if (paused.all || (!history && paused.view)) return;
      event.preventDefault();
      if (event.repeat && !history) return;
      runShortcutRef.current(action);
    };
    const onUp = () => finishStrokeRef.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open]);

  const requestOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (saveLockRef.current) return;
    leaveCase(() => onOpenChange(false));
  };
  closeAfterChatAttachRef.current = () => requestOpenChange(false);

  /** 이 의뢰 작업을 뒤에서 저장하고 떠난다. 닫기와 의뢰 이동이 같이 쓴다. */
  const leaveCase = (leave: () => void) => {
    window.clearTimeout(draftTimerRef.current);
    const id = String(transferId || "").trim();
    if (!autoSaveRef.current || alignLocked || !id || !authToken) {
      if (alignLocked) suspendDraftRef.current = true;
      if (id && authToken) void sendWorkScanEditing(id, authToken, false);
      leave();
      return;
    }
    const snapshot: WorkCloseSnapshot = {
      id,
      token: authToken,
      dirty: viewerRef.current?.exportChangedScans() ?? [],
      document: currentWorkDocument(),
      pendingRoles: [...pendingDraftRolesRef.current],
      serverAt: serverWorkScanAt(),
    };
    suspendDraftRef.current = true;
    saveLockRef.current = true;
    leave();
    window.requestAnimationFrame(() => {
      void persistWorkingScans(snapshot);
    });
  };

  const canMoveCase =
    caseNav != null && caseNav.count > (caseNav.position != null ? 1 : 0);
  const moveCase = (step: -1 | 1) => {
    if (!caseNav || !canMoveCase || saveLockRef.current || alignLocked) return;
    leaveCase(() => {
      markAiReopen();
      caseNav.onMove(step);
    });
  };

  const panelLayout: PanelLayout = panelsHidden
    ? "hidden"
    : chatOpen || modifyPanelOpen || toothInfoOpen
      ? "open"
      : "closed";
  const panelsShown = panelLayout !== "hidden";
  const panelAction = panelLayoutAction(panelLayout);
  if (
    open &&
    !panelsHidden &&
    (panelHeaderFoldedRef.current
      ? chatOpen || modifyPanelOpen || toothInfoOpen
      : true)
  ) {
    if (panelHeaderFoldedRef.current) panelHeaderFoldedRef.current = false;
    panelOpenMemoryRef.current = {
      chat: chatOpen,
      modify: modifyPanelOpen,
      toothInfo: toothInfoOpen,
    };
  }
  const cyclePanelLayout = () => {
    if (panelLayout === "open") {
      panelOpenMemoryRef.current = {
        chat: chatOpen,
        modify: modifyPanelOpen,
        toothInfo: toothInfoOpen,
      };
      panelHeaderFoldedRef.current = true;
      setChatOpen(false);
      setModifyPanelOpen(false);
      setToothInfoOpen(false);
      return;
    }
    if (panelLayout === "closed") {
      setPanelsHidden(true);
      return;
    }
    const remembered = panelOpenMemoryRef.current;
    panelHeaderFoldedRef.current = false;
    setPanelsHidden(false);
    setChatOpen(remembered.chat);
    setModifyPanelOpen(remembered.modify);
    setToothInfoOpen(remembered.toothInfo);
  };

  const saveViewImage = () => {
    const base = viewerRef.current?.captureCanvas();
    if (!base || !paint.paintRef.current?.hasInk()) {
      viewerRef.current?.saveImage();
      return;
    }
    void paint.paintRef.current.compositePng(base).then((blob) => {
      if (!blob) return;
      downloadBlobFile(blob, paintNoteFileName("작업"));
    });
  };

  const attachPaintToChat = () => {
    const surface = paint.paintRef.current;
    if (!onAttachChatFile || !surface) return null;
    const base = viewerRef.current?.captureCanvas();
    if (!base) return null;
    return surface.compositePng(base).then((blob) => {
      if (!blob) return null;
      const file = new File([blob], paintNoteFileName("작업"), { type: "image/png" });
      onAttachChatFile(file);
      toast({
        title: "채팅에 첨부했습니다.",
        description: (
          <>
            현재 화면 이미지가 대화 입력에 있습니다.
            <br />
            보내기를 누르면 상대에게 전달됩니다.
          </>
        ),
      });
      return file;
    });
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        className={cn(
          "inset-0 left-0 top-0 z-[480] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "sm:inset-0 sm:left-0 sm:top-0 sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0",
          "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        overlayClassName="z-[475]"
        hideClose
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            (target.closest("[data-radix-popper-content-wrapper]") ||
              target.closest("[data-lab-basket-layer]") ||
              target.closest(".lab-basket-layer-overlay"))
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="relative shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b bg-white/95 py-2 pl-5 pr-3 text-left">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-3 overflow-hidden">
            <DialogTitle className="shrink-0 text-base sm:text-lg">
              AI 디자인
            </DialogTitle>
            <CaseHeaderLines
              header={caseHeader}
              nav={
                caseNav ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 px-0 [&_svg]:!size-3.5"
                      disabled={!canMoveCase || alignLocked}
                      onClick={() => moveCase(-1)}
                      title="이전 미완료 의뢰"
                      aria-label="이전 미완료 의뢰"
                    >
                      <ChevronLeft />
                    </Button>
                    <span
                      className="min-w-7 text-center text-xs font-semibold tabular-nums text-foreground"
                      title={
                        caseNav.position != null
                          ? `미완료 ${caseNav.count}건 중 ${caseNav.position + 1}번째`
                          : `미완료 ${caseNav.count}건`
                      }
                    >
                      {caseNav.count}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 px-0 [&_svg]:!size-3.5"
                      disabled={!canMoveCase || alignLocked}
                      onClick={() => moveCase(1)}
                      title="다음 미완료 의뢰"
                      aria-label="다음 미완료 의뢰"
                    >
                      <ChevronRight />
                    </Button>
                  </span>
                ) : null
              }
            />
            {basketTag ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <LabBasketTagPickerButton
                  value={basketTag.value}
                  occupiedTags={basketTag.occupiedTags}
                  onChange={basketTag.onChange}
                  popoverClassName="z-[520]"
                />
                <LabBasketTagGuideButton elevated />
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5 pr-12">
            <Popover open={zoomOpen} onOpenChange={setZoomOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs tabular-nums"
                  title="확대율"
                  aria-label={`확대율 ${Math.round(textZoom * 100)}%`}
                >
                  {Math.round(textZoom * 100)}%
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="z-[520] w-[17.5rem] p-2">
                <div className="grid grid-cols-5 gap-1">
                  {TEXT_ZOOM_ROWS.flat().map((zoom) => (
                    <Button
                      key={zoom}
                      type="button"
                      size="sm"
                      variant={textZoom === zoom ? "default" : "outline"}
                      className="h-8 w-full whitespace-nowrap px-0 text-xs tabular-nums"
                      aria-pressed={textZoom === zoom}
                      onClick={() => {
                        setTextZoom(zoom);
                        try {
                          window.localStorage.setItem(TEXT_ZOOM_PREF_KEY, String(zoom));
                        } catch {
                          /* 확대율은 이 탭에서만 유지한다. */
                        }
                      }}
                    >
                      {Math.round(zoom * 100)}%
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 px-0 [&_svg]:!size-3.5"
              aria-label={panelAction}
              title={panelAction}
              onClick={cyclePanelLayout}
            >
              {panelLayout === "open" ? (
                <PanelLeftClose />
              ) : panelLayout === "closed" ? (
                <PanelLeftDashed />
              ) : (
                <PanelLeftOpen />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={paint.paintOn ? "default" : "outline"}
              className="relative h-8 w-8 px-0 [&_svg]:!size-3.5"
              aria-pressed={paint.paintOn}
              aria-label="페인트"
              title="페인트. 왼쪽은 그리기, 오른쪽은 화면 회전, 휠 버튼은 이동입니다."
              onClick={() => paint.setPaintOn((on) => !on)}
            >
              <Pencil />
              {!paint.paintOn && paint.count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-white" />
              ) : null}
            </Button>
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 px-0"
                  title="설정"
                  aria-label="설정"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="z-[520] w-auto space-y-3 p-3">
                <label className="flex items-center justify-between gap-4 whitespace-nowrap">
                  <span className="text-xs font-semibold text-foreground">자동 저장</span>
                  <Switch
                    checked={autoSave}
                    onCheckedChange={(on) => {
                      setAutoSave(on);
                      autoSaveRef.current = on;
                      try {
                        window.localStorage.setItem(AUTO_SAVE_PREF_KEY, on ? "1" : "0");
                      } catch {
                        /* 저장 설정은 이 탭에서만 유지한다. */
                      }
                      if (!on) window.clearTimeout(draftTimerRef.current);
                    }}
                    aria-label="자동 저장"
                    className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                  />
                </label>
                <div className="flex items-center justify-between gap-4 whitespace-nowrap border-t pt-3">
                  <span className="text-xs font-semibold text-foreground">단축키·마우스</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setSettingsOpen(false);
                      setControlsOpen(true);
                    }}
                  >
                    {controlPrefs.profile === "custom"
                      ? "직접 설정"
                      : DESIGN_CONTROL_PRESETS[controlPrefs.profile].label}
                  </Button>
                </div>
                <section className="border-t pt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">디자인 프리셋</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setSettingsOpen(false);
                        setPresetDialog({ presetId: null });
                      }}
                    >
                      관리
                    </Button>
                  </div>
                  <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                    {designLibrary.presets.map((preset) => (
                      <li key={preset.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                          onClick={() => {
                            setSettingsOpen(false);
                            setPresetDialog({ presetId: preset.id });
                          }}
                        >
                          <span className="truncate text-foreground">{presetDisplayName(preset.name)}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {preset.id === designLibrary.defaultId ? "기본" : preset.clinicName}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </PopoverContent>
            </Popover>
          </div>
          <DialogClose
            className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md bg-destructive text-destructive-foreground opacity-100 shadow-sm hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="닫기"
          >
            <X className="h-7 w-7" />
          </DialogClose>
        </DialogHeader>

        <div ref={bindWorkArea} className="relative min-h-0 min-w-0 flex-1">
            <OralScanOverlayViewer
              ref={viewerRef}
              items={viewerItems}
              onPaintSpace={setPaintSpace}
              visible={visible}
              colorMapping={colorMapping}
              ghostOpacity={ghostOn ? GHOST_OPACITY_ON : 1}
              prepArch={prepArch}
              focusToothNumbers={focusToothNumbers}
              toothBadges={viewerBadges}
              onSelectTooth={(toothNumber) => {
                showTooth(toothNumber);
                setLibraryPickerFor(null);
                setToothCardFor(null);
              }}
              connectorChips={viewerConnectorChips}
              onSelectConnector={(from) => {
                showTooth(from);
                setLibraryPickerFor(null);
                setConnectorFrom(from);
                setModifyTool("connector");
                setEditBrush("none");
                setHoleNote("");
                setScanbodyPickTooth(null);
                onStage("design");
              }}
              scanbodyPickTooth={scanbodyPickTooth}
              onScanbodyPicks={setScanbodyPicks}
              marginSeedPickTooth={marginSeedPick}
              onMarginSeedPick={redetectMarginFrom}
              onMarginUndercut={(tooth, count) =>
                setMarginUndercut((prev) =>
                  prev.tooth === tooth && prev.count === count ? prev : { tooth, count },
                )
              }
              onHoleIssues={(issues) =>
                setHoleIssues((prev) =>
                  JSON.stringify(prev) === JSON.stringify(issues) ? prev : issues,
                )
              }
              onCrownShells={(shells) =>
                setCrownShells((prev) =>
                  JSON.stringify(prev) === JSON.stringify(shells) ? prev : shells,
                )
              }
              onMarginTraceProgress={setMarginTracePoints}
              contactMap={
                contactMap ||
                (occlusionOn && canContact) ||
                (colorMap.on && colorMap.mode === "contact" && canContact)
              }
              colorMap={colorMap.on ? colorMap : null}
              onIntaglio={(info) =>
                setIntaglios((prev) =>
                  JSON.stringify(prev) === JSON.stringify(info) ? prev : info,
                )
              }
              undercutMap={paintUndercut}
              occlusalGapMm={occlusalGap}
              contactMode={contactMode}
              undercutLimit={undercutLimit}
              busy={busy}
              busyLabel={busy ? `스캔을 불러오는 중 ${progress}%` : ""}
              onScanColorChange={setHasScanColor}
              onInsertionAxisChange={(active) => {
                if (active) return;
                setInsertionKeys([]);
                setAxisChangeHintKey("");
                endAiming();
              }}
              onInsertionAxisAimed={(toothNumbers) => {
                applyAimedDetections(toothNumbers);
                queueSaveWorkRef.current();
              }}
              showInsertionAxis={insertionShown}
              centerGuide={centerGuide}
              designEdit={designEdit}
              onDesignGesture={onDesignGesture}
              dieMargins={dieMargins}
              showDies={dieShown}
              hiddenTeeth={hiddenTeeth}
              onWorldTurned={onWorldTurned}
              onDiesChange={setDieTeeth}
              showStoneModel={stage === "model"}
              onStoneModelChange={setStoneParts}
              manualAlignArch={alignKind === "points" ? alignArch : null}
              occlusionAdjust={
                occlusionOn ? { arch: occlusionArch, mode: occlusionMode } : null
              }
              onOcclusionEdit={onOcclusionEdit}
              meshEdit={stage === "scan" ? meshEdit : null}
              onMeshEditStatus={(status) =>
                setMeshEditStatus((prev) =>
                  sameScanMeshEditStatus(prev, status) ? prev : status,
                )
              }
              onMeshEdit={onMeshEditPhase}
              onAlignProgress={(picks) => {
                setAlignPicks(picks);
                if (picks.model >= 3 && picks.bite >= 3) {
                  alignBeforeSigRef.current =
                    viewerRef.current?.changedScanSignature() ?? "";
                  pushJawCheckpoint();
                  setAlignBusy(true);
                }
              }}
              onAlignMerged={(arch) => {
                setAlignBusy(false);
                setAlignArch(null);
                setAlignPicks({ model: 0, bite: 0 });
                setArchAligned((prev) => ({ ...prev, [arch]: true }));
                queueSaveWorkRef.current();
                runMarginDetect(marginToothNumbersRef.current);
              }}
              onAlignFailed={() => {
                discardJawCheckpoint(alignBeforeSigRef.current);
                setAlignBusy(false);
                setAlignPicks({ model: 0, bite: 0 });
              }}
              onAlignCancelled={() => {
                discardJawCheckpoint(alignBeforeSigRef.current);
                setAlignBusy(false);
              }}
              onAligningChange={setViewerAligning}
              onViewSettled={() => {
                const current = aimingRef.current;
                if (current) {
                  viewerRef.current?.setInsertionFromView(current.span, { preview: true });
                }
                queueSaveWorkRef.current();
              }}
              onMeshesReady={({ deformed, restore }) => {
                if (restore) {
                  const saved = sessionDocRef.current;
                  const axes = saved?.insertionAxes ?? [];
                  if (axes.length > 0) {
                    viewerRef.current?.restoreInsertionAxes(axes);
                    setInsertionKeys(axes.map((axis) => axis.key));
                  }
                  if (saved?.camera) viewerRef.current?.restoreCamera(saved.camera);
                  showMissingAxis(axes.map((axis) => axis.key));
                }
                if (deformed) queueSaveWorkRef.current();
              }}
              className="absolute inset-0"
            />
            {stage === "milling" ? (
              <LabMillingDiscView milling={milling} className="absolute inset-0 z-[5]" />
            ) : null}
            <ViewPaintSurface
              {...viewPaintSurfaceProps(paint)}
              enabled={paint.paintOn && stage !== "milling"}
              space={stage === "milling" ? null : paintSpace}
            />
            {paint.paintOn && stage !== "milling" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
                <ViewPaintToolbar
                  paint={paint}
                  twoRow
                  onSaveImage={saveViewImage}
                  onAttachChat={onAttachChatFile ? attachPaintToChat : undefined}
                  onRemoveChatFile={onRemoveChatFile}
                  onReorderChatFiles={onReorderChatFiles}
                  onSendToAi={sendPaintToAi}
                />
              </div>
            ) : null}
            <div
              className={cn(
                "pointer-events-none absolute left-1/2 top-3 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-1.5",
                stage === "milling" && "hidden",
              )}
            >
              <div className="pointer-events-auto relative flex items-center justify-center">
              <div className="absolute right-full mr-5 flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={insertionShown ? "default" : "outline"}
                    className={cn(viewToolBtn, "[&_svg]:!text-amber-500")}
                    title="삽입축"
                    aria-label="삽입축"
                    aria-pressed={insertionShown}
                    onClick={() => setInsertionShown((on) => !on)}
                  >
                    <ArrowDownToLine />
                    {workWide ? <span>삽입축</span> : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="z-[520]">
                  잡은 삽입축을 치아 위에 표시합니다.
                </TooltipContent>
              </Tooltip>
              <Button
                type="button"
                size="sm"
                variant={paintUndercut ? "default" : "outline"}
                className={cn(viewToolBtn, "[&_svg]:!text-red-700")}
                title={canUndercut ? "언더컷" : "주문 치아의 악을 알 수 없습니다"}
                aria-label="언더컷"
                aria-pressed={paintUndercut}
                disabled={!canUndercut}
                onClick={toggleUndercut}
              >
                <TriangleAlert />
                {workWide ? <span>언더컷</span> : null}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={marginShown ? "default" : "outline"}
                className={cn(viewToolBtn, "[&_svg]:!text-teal-500")}
                title="마진"
                aria-label="마진"
                aria-pressed={marginShown}
                onClick={toggleMarginShown}
              >
                <Spline />
                {workWide ? <span>마진</span> : null}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex">
                    <Button
                      type="button"
                      size="sm"
                      variant={dieShown ? "default" : "outline"}
                      className={cn(viewToolBtn, "[&_svg]:!text-[#e6d7ad]")}
                      aria-label="다이"
                      aria-pressed={dieShown}
                      disabled={dieTeeth.length === 0}
                      onClick={() => setDieShown((on) => !on)}
                    >
                      <Cylinder />
                      {workWide ? <span>다이</span> : null}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  {dieTeeth.length === 0 ? (
                    "마진을 잡으면 다이를 만듭니다."
                  ) : (
                    <>
                      마진을 0.75mm 넓혀 수직으로 자른 다이입니다.
                      <br />
                      치아 정보에서 체크한 치아의 다이만 보입니다.
                      <br />
                      다이가 있는 악 모델은 가립니다.
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={centerGuide === "off" ? "outline" : "default"}
                    className={viewToolBtn}
                    title={centerGuideLabel(centerGuide)}
                    aria-label={centerGuideLabel(centerGuide)}
                    aria-pressed={centerGuide !== "off"}
                    onClick={() => setCenterGuide((mode) => nextCenterGuide(mode))}
                  >
                    <Crosshair />
                    {workWide ? <span>{centerGuideLabel(centerGuide)}</span> : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  {centerGuide === "off" ? (
                    "중앙선을 켭니다."
                  ) : centerGuide === "center" ? (
                    <>
                      2mm 간격 모눈을 켭니다.
                      <br />
                      10mm마다 더 진합니다.
                    </>
                  ) : (
                    "선을 끕니다."
                  )}
                </TooltipContent>
              </Tooltip>
              <div className="absolute left-full ml-5 flex items-center gap-1">
              {scans.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant={colorMapping ? "default" : "outline"}
                  className={viewToolBtn}
                  title={colorMapping ? "스캔 색을 끄고 파란색으로 봅니다" : "스캔 원본 색으로 봅니다"}
                  aria-label="스캔색"
                  aria-pressed={colorMapping}
                  onClick={() => setColorMapping((on) => !on)}
                >
                  <Paintbrush />
                  {workWide ? <span>스캔색</span> : null}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={contactMap ? "default" : "outline"}
                className={viewToolBtn}
                title={canContact ? "교합 접촉" : "대합 스캔이 없습니다"}
                aria-label="교합 접촉"
                disabled={!canContact}
                onClick={() => {
                  if (!canContact) return;
                  setContactMap((on) => !on);
                  setMarginShown(true);
                  setStage("design");
                }}
              >
                <Palette />
                {workWide ? <span>교합 접촉</span> : null}
              </Button>
              <div className="relative flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant={colorMap.on ? "default" : "outline"}
                  className={viewToolBtn}
                  title="칼라맵"
                  aria-label="칼라맵"
                  aria-pressed={colorMap.on}
                  onClick={toggleColorMap}
                >
                  <Rainbow />
                  {workWide ? <span>칼라맵</span> : null}
                </Button>
                {colorMap.on ? (
                  <LabColorMapBar
                    state={colorMap}
                    onChange={setColorMap}
                    canContact={canContact}
                    hasIntaglio={Object.values(intaglios).some((row) => row.status === "ok")}
                  />
                ) : null}
              </div>
              </div>
              </div>
            </div>
            {panelsShown ? (
            <>
            <SnapFrame
              boundsRef={workAreaRef}
              pose={panelPose.chat ?? null}
              onPose={(pose) => movePanel("chat", pose)}
              anchorClass="bottom-3 right-3"
              resizable
              contentOpen={chatOpen}
              className="pointer-events-none flex max-w-[calc(100%-1.5rem)] flex-col"
            >
              <AiDesignChatPanel
                open={chatOpen}
                paintOn={paint.paintOn}
                draft={chatDraft}
                turns={aiChat}
                onToggle={() => setChatOpen((open) => !open)}
                onTogglePaint={() => paint.setPaintOn((on) => !on)}
                onDraft={setChatDraft}
                onSend={sendAiChat}
                onRemoveTurn={removeAiChatTurn}
              />
            </SnapFrame>
            <SnapFrame
              boundsRef={workAreaRef}
              pose={panelPose.stage ?? null}
              onPose={(pose) => movePanel("stage", pose)}
              anchorClass="left-3 top-3"
              className="pointer-events-none flex h-auto max-h-[calc(100%-1.5rem)] w-[min(18rem,calc(100%-1.5rem))] flex-col overflow-hidden"
            >
              <div className="pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background/95 text-sm shadow-sm">
                <DraggablePanelHeader
                  open={modifyPanelOpen}
                  onToggle={() => setModifyPanelOpen((open) => !open)}
                  className={cn("shrink-0 gap-3 px-3.5 py-2.5", modifyPanelOpen && "border-b")}
                >
                  <span className="font-semibold text-foreground">단계</span>
                </DraggablePanelHeader>
                {modifyPanelOpen ? (
                  <div className="min-h-0 space-y-5 overflow-y-auto px-3.5 py-2.5">
                    <section className="space-y-2">
                      <div className="grid grid-cols-5 gap-1">
                        {DESIGN_STAGES.map((item) => (
                          <Button
                            key={item.id}
                            type="button"
                            size="sm"
                            variant={stage === item.id ? "default" : "outline"}
                            className="h-7 px-1 text-[11px]"
                            data-coach={`stage-${item.id}`}
                            onClick={() => {
                              onStage(item.id);
                              if (item.id === "margin") setModifyTool("margin");
                              if (item.id === "design") setModifyTool("refine");
                            }}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    </section>
                    {stage === "model" ? (
                      <StageSubsection
                        title="모델 종류"
                        open={modelOpen}
                        onOpen={(on) => setModelOpen(on)}
                        coach="model-settings"
                        className="space-y-2.5"
                      >
                        <div className="space-y-1">
                          {MODEL_KINDS.map((kind) => (
                            <label
                              key={kind.id}
                              className="flex cursor-pointer items-center gap-2 text-[11px]"
                              title={kind.hint}
                            >
                              <input
                                type="radio"
                                name="lab-model-kind"
                                className="h-3.5 w-3.5 accent-primary"
                                checked={modelSettings.kind === kind.id}
                                onChange={() => patchModelSettings({ kind: kind.id })}
                              />
                              {kind.label}
                            </label>
                          ))}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span>받침 높이</span>
                            <span className="tabular-nums text-muted-foreground">
                              {modelSettings.heightMm} mm
                            </span>
                          </div>
                          <Slider
                            min={MODEL_HEIGHT_RANGE_MM.min}
                            max={MODEL_HEIGHT_RANGE_MM.max}
                            step={1}
                            value={[modelSettings.heightMm]}
                            onValueChange={([value]) =>
                              patchModelSettings({
                                heightMm: value ?? DEFAULT_MODEL_SETTINGS.heightMm,
                              })
                            }
                            aria-label="받침 높이"
                          />
                        </div>
                        <label className="flex items-center justify-between gap-3 text-xs font-medium">
                          다이 분리
                          <Switch
                            checked={modelSettings.kind === "die" || modelSettings.dieSplit}
                            disabled={modelSettings.kind === "die"}
                            onCheckedChange={(on) => patchModelSettings({ dieSplit: on })}
                            aria-label="다이 분리"
                            className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                          />
                        </label>
                        {modelSettings.kind === "die" || modelSettings.dieSplit ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-medium">
                              <span>다이 간격</span>
                              <span className="tabular-nums text-muted-foreground">
                                {modelSettings.dieGapMm.toFixed(2)} mm
                              </span>
                            </div>
                            <Slider
                              min={Math.round(MODEL_DIE_GAP_RANGE_MM.min * 100)}
                              max={Math.round(MODEL_DIE_GAP_RANGE_MM.max * 100)}
                              step={1}
                              value={[Math.round(modelSettings.dieGapMm * 100)]}
                              onValueChange={([value]) =>
                                patchModelSettings({
                                  dieGapMm: (value ?? DEFAULT_MODEL_SETTINGS.dieGapMm * 100) / 100,
                                })
                              }
                              aria-label="다이 간격"
                            />
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 w-full text-xs"
                          disabled={Boolean(stoneBlocked)}
                          title={stoneBlocked ?? undefined}
                          onClick={runStoneModel}
                        >
                          {stoneParts.length > 0 ? "모델 다시 생성" : "모델 생성"}
                        </Button>
                        {stoneStale ? (
                          <p className="text-[11px] leading-relaxed text-amber-700">
                            설정이나 마진이 바뀌었습니다.
                            <br />
                            다시 생성해야 내보낼 수 있습니다.
                          </p>
                        ) : null}
                        {stoneParts.length > 0 ? (
                          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                            {stoneParts.map((part) => (
                              <li key={part.id} className="flex justify-between gap-3">
                                <span className="font-medium text-foreground">{part.label}</span>
                                <span className="tabular-nums">
                                  {part.triangleCount.toLocaleString()} 면
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </StageSubsection>
                    ) : null}
                    {stage === "milling" ? <LabMillingPanel milling={milling} /> : null}
                    {stage === "scan" ? (
                      <StageSubsection
                        title="모델 정렬"
                        open={alignOpen}
                        onOpen={(on) => selectScanFold(on ? "align" : null)}
                      >
                        <div className="grid grid-cols-3 gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={alignBusy ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  disabled={!canAlignModels || alignLocked}
                                  onClick={() => void runAutoAlign()}
                                >
                                  자동
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              파일 위치에서 상악·하악을 바이트에 맞춥니다.
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={alignKind === "points" ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  disabled={!canAlignModels || alignLocked}
                                  onClick={() => {
                                    if (alignKind === "points") {
                                      setAlignKind(null);
                                      setAlignArch(null);
                                      return;
                                    }
                                    setAlignKind("points");
                                    setAlignArch(null);
                                    setAlignPicks({ model: 0, bite: 0 });
                                  }}
                                >
                                  반자동
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              붙일 악을 고른 뒤 점 3개씩 찍습니다.
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={alignKind === "occlusion" ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  disabled={!canAdjustOcclusion || alignLocked}
                                  onClick={startOcclusion}
                                >
                                  수동
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              바이트와 상관없이 상악이나 하악을 직접 옮깁니다.
                              <br />
                              상악·하악 스캔이 모두 있어야 합니다.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {occlusionOn ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-1">
                              {(["upper", "lower"] as const).map((arch) => (
                                <Button
                                  key={arch}
                                  type="button"
                                  size="sm"
                                  variant={occlusionArch === arch ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  onClick={() => pickOcclusionArch(arch)}
                                >
                                  {arch === "upper" ? "상악 이동" : "하악 이동"}
                                </Button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex min-w-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={occlusionMode === "vertical" ? "default" : "outline"}
                                      className="h-7 w-full px-2 text-[11px]"
                                      onClick={() => setOcclusionMode("vertical")}
                                    >
                                      수직
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="z-[520]">
                                  교합 축 방향으로만 벌리거나 다뭅니다.
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex min-w-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={occlusionMode === "free" ? "default" : "outline"}
                                      className="h-7 w-full px-2 text-[11px]"
                                      onClick={() => setOcclusionMode("free")}
                                    >
                                      자유 이동
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="z-[520]">
                                  모델을 끌면 화면과 나란히 옮겨집니다.
                                  <br />
                                  Shift를 누르고 끌면 화면 안에서 돕니다.
                                  <br />
                                  Alt(⌥)를 누르고 끌면 기울어집니다.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            {occlusionMode === "vertical" ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs font-medium">
                                  <span>교합 거리</span>
                                  <span className="tabular-nums text-muted-foreground">
                                    {occlusionMm >= 0 ? "+" : ""}
                                    {occlusionMm.toFixed(2)} mm
                                  </span>
                                </div>
                                <Slider
                                  min={-200}
                                  max={200}
                                  step={1}
                                  value={[Math.max(-200, Math.min(200, Math.round(occlusionMm * 100)))]}
                                  onValueChange={([value]) => {
                                    const mm = (value ?? 0) / 100;
                                    setOcclusionMm(mm);
                                    viewerRef.current?.previewOcclusionVertical(mm);
                                  }}
                                  onValueCommit={([value]) => {
                                    viewerRef.current?.commitOcclusionVertical((value ?? 0) / 100);
                                  }}
                                  aria-label="교합 거리"
                                />
                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                  +는 벌리고 −는 다뭅니다.
                                  <br />
                                  수동에 들어온 위치가 0입니다.
                                </p>
                              </div>
                            ) : (
                              <p className="text-[11px] leading-relaxed text-muted-foreground">
                                {occlusionArch === "upper" ? "상악" : "하악"}을 끌어 옮깁니다.
                                <br />
                                빈 곳을 끌면 화면이 돕니다.
                              </p>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 w-full px-2 text-[11px]"
                              onClick={() => viewerRef.current?.resetOcclusion()}
                            >
                              원래대로
                            </Button>
                          </div>
                        ) : null}
                        {alignLocked ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 w-full px-2 text-[11px]"
                            onClick={() => viewerRef.current?.cancelAlign()}
                          >
                            중단
                          </Button>
                        ) : null}
                        {alignKind === "points" ? (
                          <>
                            <div className="grid grid-cols-2 gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex min-w-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={alignArch === "upper" ? "default" : "outline"}
                                      className="h-7 w-full px-2 text-[11px]"
                                      disabled={!hasUpperScan || alignLocked}
                                      onClick={() => {
                                        if (alignArch === "upper") {
                                          viewerRef.current?.clearAlignPicks();
                                          setAlignPicks({ model: 0, bite: 0 });
                                          return;
                                        }
                                        setAlignArch("upper");
                                        setAlignPicks({ model: 0, bite: 0 });
                                      }}
                                    >
                                      상악
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="z-[520]">
                                  상악과 바이트만 화면 가운데에 나란히 보입니다.
                                  <br />
                                  같은 순서로 점 3개씩 찍습니다.
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex min-w-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={alignArch === "lower" ? "default" : "outline"}
                                      className="h-7 w-full px-2 text-[11px]"
                                      disabled={!hasLowerScan || alignLocked}
                                      onClick={() => {
                                        if (alignArch === "lower") {
                                          viewerRef.current?.clearAlignPicks();
                                          setAlignPicks({ model: 0, bite: 0 });
                                          return;
                                        }
                                        setAlignArch("lower");
                                        setAlignPicks({ model: 0, bite: 0 });
                                      }}
                                    >
                                      하악
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="z-[520]">
                                  하악과 바이트만 화면 가운데에 나란히 보입니다.
                                  <br />
                                  같은 순서로 점 3개씩 찍습니다.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            {alignArch ? (
                              <>
                                <p className="text-[11px] font-medium text-foreground">
                                  모델 {alignPicks.model}/3 · 바이트 {alignPicks.bite}/3
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-full px-2 text-[11px]"
                                  disabled={
                                    alignLocked ||
                                    (alignPicks.model === 0 && alignPicks.bite === 0)
                                  }
                                  onClick={() => {
                                    viewerRef.current?.clearAlignPicks();
                                    setAlignPicks({ model: 0, bite: 0 });
                                  }}
                                >
                                  점 지우기
                                </Button>
                              </>
                            ) : null}
                          </>
                        ) : null}
                      </StageSubsection>
                    ) : null}
                    {stage === "scan" ? (
                      <MeshEditSection
                        edit={meshEdit}
                        status={meshEditStatus}
                        disabled={entries.length === 0 || alignLocked || busy}
                        onToggle={(on) => selectScanFold(on ? "mesh" : null)}
                        onPatch={patchMeshEdit}
                        onApply={applyMeshEdit}
                        onInvert={() => viewerRef.current?.meshEditInvert()}
                        onClear={() => viewerRef.current?.meshEditClear()}
                        onSelectLoose={() => {
                          if (viewerRef.current?.meshEditSelectLoose()) return;
                          toast({ title: "떨어진 조각이 없습니다." });
                        }}
                        onPickAllHoles={(on) => viewerRef.current?.meshEditPickAllHoles(on)}
                        onExtract={(action) => viewerRef.current?.meshEditExtract(action)}
                      />
                    ) : null}
                    {stage === "scan" && scanbodyControls ? (
                      <ScanbodyAlignSection
                        scanbody={scanbodyControls}
                        open={scanbodyOpen}
                        onOpen={(on) => selectScanFold(on ? "scanbody" : null)}
                        toothLabel={
                          activeTooth ? formatProsthesisAiToothLabel(activeTooth) : null
                        }
                      />
                    ) : null}
                    {stage === "margin" || stage === "design" ? (
                      <LabProsthesisModifyPanel
                        tool={modifyTool}
                        onTool={(next) => {
                          setModifyTool(next);
                          setEditBrush(next === "cutback" ? "plus" : "none");
                          setHoleNote("");
                          if (next === "margin" || next === "insertion") onStage("margin");
                          else onStage("design");
                        }}
                        sculptBrush={sculptBrush}
                        onSculptBrush={setSculptBrush}
                        refineTab={refineTab}
                        onRefineTab={setRefineTab}
                        open={designFold === "modify"}
                        onOpen={(on) => setDesignFold(on ? "modify" : null)}
                        crownShellMm={activeNumber ? (crownShells[activeNumber] ?? null) : null}
                        intaglio={activeNumber ? (intaglios[activeNumber] ?? null) : null}
                        onViewFit={() => {
                          setColorMap((prev) => ({ ...prev, on: true, mode: "fit" }));
                          setMarginShown(true);
                        }}
                        marginMode={marginMode}
                        onMarginMode={setMarginMode}
                        brush={editBrush}
                        onBrush={setEditBrush}
                        edit={activeEdit}
                        onEdit={(next) => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          const previous = edits[activeNumber] ?? createToothDesignEdit();
                          if (next.margin.deleted && !previous.margin.deleted) {
                            setMarginReview((prev) => ({
                              ...prev,
                              [activeNumber]: "none",
                            }));
                          } else if (
                            !next.margin.deleted &&
                            marginLineChanged(previous, next)
                          ) {
                            setMarginReview((prev) =>
                              prev[activeNumber] === "confirmed"
                                ? prev
                                : { ...prev, [activeNumber]: "confirmed" },
                            );
                          }
                          setEdits((prev) => ({ ...prev, [activeNumber]: next }));
                          queueSaveWorkRef.current();
                        }}
                        connectors={spanConnectors}
                        connectorFrom={activeConnectorFrom}
                        onConnectorFrom={setConnectorFrom}
                        onConnector={setConnector}
                        bridgeAssembled={bridgeAssembled}
                        bridgeReady={bridgeReady}
                        onAssemble={(assembled) => setSpanAssembled(bridgeSpan, assembled)}
                        focusView={focusViewOn}
                        onFocusView={setFocusViewOn}
                        toothLabel={
                          activeTooth
                            ? formatProsthesisAiToothLabel(activeTooth)
                            : null
                        }
                        cavityKind={activeNumber ? (cavityKinds[activeNumber] ?? null) : null}
                        generated={
                          activeNumber ? generated[activeNumber] === true : false
                        }
                        isBridge={isBridgeSpan}
                        canMatchInsertion={entries.length > 0 && bridgeSpan.length > 0}
                        holeNote={holeNote}
                        holeIssue={activeNumber ? (holeIssues[activeNumber] ?? null) : null}
                        onViewHoleAxis={() => {
                          if (activeNumber) viewerRef.current?.viewHoleAxis(activeNumber);
                        }}
                        onRedetect={() => {
                          if (activeNumber) startMarginRedetect(activeNumber);
                        }}
                        redetectPicking={Boolean(activeNumber && marginSeedPick === activeNumber)}
                        undercutShown={paintUndercut}
                        canUndercut={canUndercut && !insertionAxisVisible}
                        onUndercut={setUndercutMap}
                        onClearMargin={() => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          const current = edits[activeNumber] ?? createToothDesignEdit();
                          setEdits((prev) => ({
                            ...prev,
                            [activeNumber]: {
                              ...current,
                              margin: { ...current.margin, deleted: true },
                            },
                          }));
                          setMarginReview((prev) => ({
                            ...prev,
                            [activeNumber]: "none",
                          }));
                          queueSaveWorkRef.current();
                        }}
                        onMatchInsertion={() => {
                          if (bridgeSpan.length === 0) return;
                          startAiming(bridgeSpan);
                          setModifyTool("insertion");
                        }}
                        onRemoveHook={() => {
                          if (!activeNumber) return;
                          beginEditUndo();
                          setEdits((prev) => {
                            const current = prev[activeNumber] ?? createToothDesignEdit();
                            return {
                              ...prev,
                              [activeNumber]: {
                                ...current,
                                hook: { ...current.hook, hooks: [] },
                              },
                            };
                          });
                          queueSaveWorkRef.current();
                        }}
                        designPresets={designLibrary.presets}
                        onOpenPresets={(presetId) => setPresetDialog({ presetId })}
                      />
                    ) : null}
                    {stage === "design" ? (
                      <StageSubsection
                        title="교합"
                        open={designFold === "occlusal"}
                        onOpen={(on) => setDesignFold(on ? "occlusal" : null)}
                      >
                        <label className="flex items-center justify-between gap-3 text-xs font-medium">
                          접촉
                          <Switch
                            checked={contactMap}
                            disabled={!canContact}
                            onCheckedChange={setContactMap}
                            aria-label="교합 접촉 표시"
                            className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                          />
                        </label>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span>교합 거리</span>
                            <span className="tabular-nums text-muted-foreground">
                              {occlusalGap.toFixed(2)} mm
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={50}
                            step={5}
                            value={[Math.round(occlusalGap * 100)]}
                            disabled={!canContact}
                            onValueChange={([value]) =>
                              setOcclusalGap((value ?? 10) / 100)
                            }
                            aria-label="교합 거리"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={contactMode === "cut" ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  onClick={() => setContactMode("cut")}
                                >
                                  절삭
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              목표보다 가까운 면은 붉고,
                              <br />
                              먼 면은 파랗습니다.
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={contactMode === "keep" ? "default" : "outline"}
                                  className="h-7 w-full px-2 text-[11px]"
                                  onClick={() => setContactMode("keep")}
                                >
                                  형태 유지
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="z-[520]">
                              초록 폭을 넓혀 형태를 남깁니다.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </StageSubsection>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </SnapFrame>
            </>
            ) : null}
            {focusShown && focusRow ? (
              <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2">
                <ConnectorFocusView
                  shot={connectorShot}
                  link={focusRow}
                  edit={focusRow.edit}
                  locked={bridgeAssembled}
                  onShift={(shiftXMm, shiftYMm) =>
                    setConnector(focusRow.from, {
                      ...focusRow.edit.connector,
                      shiftXMm,
                      shiftYMm,
                    })
                  }
                />
              </div>
            ) : null}
            {stage !== "milling" ? (
            <DesignViewerChrome
              crownShells={crownShells}
              teeth={plan.teeth}
              cavityKinds={cavityKinds}
              activeTooth={activeTooth}
              edits={edits}
              generated={generated}
              marginReview={marginReview}
              designLibrary={designLibrary}
              caseDefaultPresetId={caseDefaultPresetId}
              generating={generating}
              genLabel={genLabel}
              panelsShown={panelsShown}
              toothInfoOpen={toothInfoOpen}
              insertionKeys={insertionKeys}
              highlightInsertionKey={highlightInsertionKey}
              canSetInsertion={entries.length > 0}
              onSelectTooth={showTooth}
              hiddenTeeth={hiddenTeeth}
              archShown={archShown}
              onToggleTooth={setToothShown}
              onToggleArch={setArchShown}
              onSetInsertion={startAiming}
              onToggleInfo={() => setToothInfoOpen((open) => !open)}
              onConfirmMargin={confirmMargin}
              onGenerateTooth={(toothNumber) => void runGenerate([toothNumber])}
              onGenerateSpan={(span) => void runGenerate([...span])}
              onAssembleSpan={setSpanAssembled}
              onTogglePontic={togglePontic}
              libraryLabel={(toothNumber) => {
                const id = edits[toothNumber]?.implant.libraryId;
                const library = id ? libraryById.get(id) : null;
                if (!library) return null;
                return library.label || library.manufacturer;
              }}
              libraryIdOf={(toothNumber) => edits[toothNumber]?.implant.libraryId ?? null}
              scanbodyForLibrary={scanbodyForLibrary}
              scans={scans}
              scanShown={scanShown}
              fileState={fileState}
              onToggleScan={(id, on) => setVisible((prev) => ({ ...prev, [id]: on }))}
              dragScanId={dragScanId}
              dropScanId={dropScanId}
              onScanDragStart={setDragScanId}
              onScanDragEnd={() => {
                setDragScanId(null);
                setDropScanId(null);
              }}
              onScanDragOver={(id) => setDropScanId((prev) => (prev === id ? prev : id))}
              onScanDragLeave={(id) => setDropScanId((prev) => (prev === id ? null : prev))}
              onScanDrop={swapScans}
              screwPathAvailable={screwPathAvailable}
              screwPathShown={screwPathShown}
              onToggleScrewPath={setScrewPathShown}
              scanBusy={busy}
              scanProgress={progress}
              scanLoadError={loadError}
              workAreaRef={workAreaRef}
              toothPose={panelPose.tooth ?? null}
              onToothPose={(pose) => movePanel("tooth", pose)}
              onToggleScrewHole={(toothNumber, on) => patchImplant(toothNumber, { screwHole: on })}
              onClearTooth={(toothNumber) => {
                beginEditUndo();
                setGenerated((prev) => ({ ...prev, [toothNumber]: false }));
                const span = insertionSpanForTooth(plan.teeth, toothNumber);
                if (span.length > 1 && spanAssembled(span, editsRef.current)) {
                  setEdits((prev) => {
                    const out = { ...prev };
                    for (const tooth of span) {
                      const row = out[tooth] ?? createToothDesignEdit();
                      out[tooth] = {
                        ...row,
                        connector: { ...row.connector, assembled: false },
                      };
                    }
                    return out;
                  });
                }
                queueSaveWorkRef.current();
              }}
            />
            ) : null}
            {!busy &&
            stage !== "milling" &&
            entries.length > 0 &&
            (aiming || pendingAxisSpan || axisChangeHintKey) &&
            !toothCardFor &&
            !libraryPickerFor ? (
              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
                {aiming ? (
                  <>
                    <div className="flex items-center gap-1 rounded-full border bg-background/95 p-1 shadow-md">
                      <span className="px-2 text-xs font-semibold tabular-nums">
                        {aiming.span.length > 1
                          ? `브리지 ${aiming.span[0]}-${aiming.span[aiming.span.length - 1]}`
                          : `#${aiming.span[0]}`}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={confirmAiming}
                      >
                        설정
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={cancelAiming}
                      >
                        취소
                      </Button>
                    </div>
                    <p className="rounded-md bg-slate-700/85 px-2 py-1 text-center text-[11px] leading-relaxed text-white">
                      중앙선에 대상치 가운데를 맞추고
                      <br />
                      교합면에 수직으로 보도록 하세요.
                      <br />
                      화면을 멈추면 삽입축과 언더컷이 따라옵니다.
                    </p>
                  </>
                ) : pendingAxisSpan ? (
                  <>
                    <div className="flex items-center gap-1 rounded-full border bg-background/95 p-1 shadow-md">
                      <span className="px-2 text-xs font-semibold tabular-nums">
                        {pendingAxisSpan.length > 1
                          ? `브리지 ${pendingAxisSpan[0]}-${pendingAxisSpan[pendingAxisSpan.length - 1]}`
                          : `#${pendingAxisSpan[0]}`}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={() => captureInsertion(pendingAxisSpan)}
                      >
                        삽입축 설정
                      </Button>
                    </div>
                    <p className="rounded-md bg-slate-700/85 px-2 py-1 text-center text-[11px] leading-relaxed text-white">
                      중앙선에 대상치 가운데를 맞추고
                      <br />
                      교합면에 수직으로 보도록 하세요.
                      <br />
                      맞으면 삽입축 설정을 누르세요.
                    </p>
                  </>
                ) : (
                  <p className="rounded-md bg-slate-700/85 px-2 py-1 text-center text-[11px] leading-relaxed text-white">
                    삽입축을 바꾸려면 치아 정보의 삽입축 아이콘을 누르세요.
                  </p>
                )}
              </div>
            ) : null}
            {marginHint && !paint.paintOn && stage !== "milling" ? (
              <div
                className={cn(
                  "pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md px-3 py-2 text-center text-[11px] leading-relaxed shadow-sm",
                  marginHint.warn ? "bg-destructive/90 text-white" : "bg-slate-700/85 text-white",
                )}
              >
                {marginHint.body}
              </div>
            ) : null}
            {stage === "scan" && scanbodyOpen && activeTooth?.implant && activeImplant ? (
              <div className="pointer-events-none absolute bottom-14 left-1/2 z-10 -translate-x-1/2 rounded-md bg-slate-700/85 px-3 py-2 text-[11px] text-white shadow-sm">
                <p className="font-semibold">선택한 임플란트 라이브러리</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-white/70">임플란트</dt>
                  <dd>
                    {activeLibrary
                      ? `${activeLibrary.manufacturer} ${activeLibrary.brand}`.trim()
                      : "미선택"}
                  </dd>
                  <dt className="text-white/70">타입</dt>
                  <dd>{activeLibrary?.family || "-"}</dd>
                  <dt className="text-white/70">서브타입</dt>
                  <dd>{activeLibrary?.type || "-"}</dd>
                  <dt className="text-white/70">형상</dt>
                  <dd>{activeScanbodyLabel || "원기둥 근사"}</dd>
                </dl>
              </div>
            ) : null}
            {toothCardFor
              ? (() => {
                  const tooth = plan.teeth.find((row) => row.toothNumber === toothCardFor);
                  if (!tooth) return null;
                  return (
                    <div className="absolute bottom-14 right-3 z-40">
                      <LabToothTypeCard
                        toothNumber={tooth.toothNumber}
                        kind={toothKindNow(tooth)}
                        canPontic={insertionSpanForTooth(plan.teeth, tooth.toothNumber).length > 1}
                        takenNumbers={
                          new Set(
                            plan.teeth
                              .filter((row) => row.toothNumber !== tooth.toothNumber)
                              .map((row) => row.toothNumber),
                          )
                        }
                        onApply={(number, kind) => applyToothType(tooth, number, kind)}
                        onClose={() => setToothCardFor(null)}
                      />
                    </div>
                  );
                })()
              : null}
            {libraryPickerFor
              ? (() => {
                  const tooth = plan.teeth.find((row) => row.toothNumber === libraryPickerFor);
                  if (!tooth?.implant) return null;
                  const spec = orderSpecLines(tooth);
                  return (
                    <div className="absolute bottom-14 right-3 z-40">
                      <LabImplantLibraryPicker
                        toothNumber={tooth.toothNumber}
                        libraries={implantLibraries}
                        favorites={implantFavorites}
                        value={edits[tooth.toothNumber]?.implant.libraryId ?? null}
                        defaultManufacturer={tooth.implant.manufacturer}
                        orderLabel={[spec.implant, spec.scanbody].filter(Boolean).join(" · ")}
                        orderLibraryId={
                          orderTemplateSpec(tooth)
                            ? null
                            : (matchImplantLibrary(implantLibraries, tooth.implant)?.id ?? null)
                        }
                        onPick={(library) => pickImplantLibrary(tooth.toothNumber, library)}
                        onToggleFavorite={toggleImplantFavorite}
                        onClose={() => setLibraryPickerFor(null)}
                      />
                    </div>
                  );
                })()
              : null}
            <div className={cn(VIEW_GESTURE_HINT_LAYER_CLASS, "z-[90]")}>
              <ViewGestureHint storageKey="abuts.viewGestureHint.aiDesign.v2.dismissed" />
            </div>
          </div>
        <LabDesignPresetDialog
          open={presetDialog != null}
          onOpenChange={(next) => {
            if (!next) setPresetDialog(null);
          }}
          library={designLibrary}
          onSave={saveDesignLibrary}
          clinicName={clinicKey || null}
          initialPresetId={presetDialog?.presetId ?? null}
        />
        <LabDesignControlsDialog open={controlsOpen} onOpenChange={setControlsOpen} />
        <DesignExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          restorations={exportRows}
          scans={exportScans}
          busy={exportBusy}
          onDownload={(selection) => void downloadExport(selection)}
          onAttach={onAttachChatFile ? (selection) => void attachExport(selection) : null}
        />
        {open ? (
          <ScanbodyLibraryUpdatePrompt
            libraries={scanbodyCatalog.libraries}
            onUpdated={() => reloadScanbodyCatalog()}
            overlayClassName="z-[560]"
            className="z-[561]"
          />
        ) : null}
        {libraryConfirm
          ? (() => {
              const tooth = plan.teeth.find((row) => row.toothNumber === libraryConfirm.toothNumber);
              const spec = tooth ? orderSpecLines(tooth) : { implant: "", scanbody: "" };
              const orderText = [spec.implant, spec.scanbody].filter(Boolean).join(" · ") || "지정 없음";
              const nextText = `${libraryConfirm.library.manufacturer} ${libraryConfirm.library.label}`.trim();
              return (
                <AlertDialog
                  open
                  onOpenChange={(next) => {
                    if (!next) setLibraryConfirm(null);
                  }}
                >
                  <AlertDialogContent overlayClassName="z-[560]" className="z-[561]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>치과 의뢰와 다릅니다</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div>
                          치과 의뢰와 다른 임플란트·스캔바디입니다.
                          <br />
                          바꾸면 의뢰 내용과 달라집니다.
                          <br />
                          그래도 변경할까요?
                          <br />
                          <br />
                          의뢰: {orderText}
                          <br />
                          선택: {nextText}
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          applyImplantLibrary(
                            libraryConfirm.toothNumber,
                            libraryConfirm.library,
                            true,
                          )
                        }
                      >
                        변경
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            })()
          : null}
      </DialogContent>
    </Dialog>
  );
}

function toothArchGroup(toothNumber: string): "upper" | "lower" | "other" {
  const quadrant = String(toothNumber || "").replace(/\D/g, "")[0];
  if (quadrant === "1" || quadrant === "2") return "upper";
  if (quadrant === "3" || quadrant === "4") return "lower";
  return "other";
}

/**
 * 브리지는 연결된 치아를 한 스팬으로 묶는다.
 * 키는 스팬을 대표하는 행의 치아번호, 값은 스팬 전체(악궁 순서).
 */
function insertionSpansByOwner(
  teeth: readonly LabProsthesisAiTooth[],
): Map<string, string[]> {
  const order = new Map<string, number>();
  teeth.forEach((tooth, index) => order.set(tooth.toothNumber, index));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(right, left);
  };
  const ensure = (id: string) => {
    if (!id) return;
    if (!parent.has(id)) parent.set(id, id);
  };
  for (const tooth of teeth) {
    ensure(tooth.toothNumber);
    const bridged =
      tooth.prosthesisType === "브리지" || tooth.linkedTeeth.length > 0;
    if (!bridged) continue;
    for (const linked of tooth.linkedTeeth) {
      ensure(linked);
      union(tooth.toothNumber, linked);
    }
  }
  const members = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = members.get(root) ?? [];
    list.push(id);
    members.set(root, list);
  }
  const owner = new Map<string, string[]>();
  for (const list of members.values()) {
    const rows = list
      .filter((id) => order.has(id))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const lead = rows[0];
    if (!lead) continue;
    owner.set(lead, sortByArch(list));
  }
  return owner;
}

/** 스팬 중 주문에 있는 치아. 연결만 걸려 있고 주문 행이 없는 번호는 뺀다. */
function planSpanMembers(
  teeth: readonly LabProsthesisAiTooth[],
  span: readonly string[],
): string[] {
  return span.filter((tooth) => teeth.some((row) => row.toothNumber === tooth));
}

function insertionSpanForTooth(
  teeth: readonly LabProsthesisAiTooth[],
  toothNumber: string | null | undefined,
): string[] {
  const digits = fdiToothDigits(String(toothNumber || ""));
  if (!digits) return [];
  const spans = insertionSpansByOwner(teeth);
  const own = spans.get(digits);
  if (own) return own;
  for (const span of spans.values()) {
    if (span.includes(digits)) return span;
  }
  return [digits];
}

/** 주문 치아만 악궁 순서로 이은 커넥터. 설정은 앞 치아(from)에 둔다. */
function bridgeLinks(
  teeth: readonly LabProsthesisAiTooth[],
): Array<{ from: string; to: string }> {
  const pairs: Array<{ from: string; to: string }> = [];
  for (const span of insertionSpansByOwner(teeth).values()) {
    const ordered = planSpanMembers(teeth, span);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const from = ordered[index];
      const to = ordered[index + 1];
      if (from && to) pairs.push({ from, to });
    }
  }
  return pairs;
}

/** 내보내기 목록. 브리지는 스팬 하나가 파일 하나이고, 조립해야 낸다. */
function designExportRestorations(
  teeth: readonly LabProsthesisAiTooth[],
  generated: Record<string, boolean>,
  edits: Record<string, ToothDesignEdit>,
): DesignExportRestoration[] {
  const out: DesignExportRestoration[] = [];
  for (const block of toothInfoBlocks(teeth, insertionSpansByOwner(teeth))) {
    if (block.kind === "bridge") {
      const numbers = block.members.map((tooth) => tooth.toothNumber);
      const label = `브리지 ${numbers[0]}-${numbers[numbers.length - 1]}`;
      const made = numbers.every((tooth) => generated[tooth] === true);
      out.push({
        id: `bridge:${numbers.join(",")}`,
        label,
        fileName: `${label}.stl`,
        teeth: numbers,
        blocked: !made ? "생성 전" : !spanAssembled(numbers, edits) ? "조립 전" : null,
      });
      continue;
    }
    const tooth = block.tooth;
    if (!tooth.designable) continue;
    const label = `#${tooth.toothNumber} ${tooth.prosthesisType}`;
    out.push({
      id: `tooth:${tooth.toothNumber}`,
      label,
      fileName: `${label}.stl`,
      teeth: [tooth.toothNumber],
      blocked: generated[tooth.toothNumber] === true ? null : "생성 전",
    });
  }
  return out;
}

function exportBaseName(primary: string | null | undefined) {
  const name = String(primary || "")
    .replace(/\s*·\s*/g, "_")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return name ? `${name}_디자인` : "AI_디자인";
}

/** 수정값이 있는 스팬 치아가 모두 조립돼 있어야 조립된 브리지다. */
function spanAssembled(
  span: readonly string[],
  edits: Record<string, ToothDesignEdit>,
): boolean {
  const rows = span.map((tooth) => edits[tooth]).filter(Boolean);
  return rows.length > 1 && rows.every((edit) => edit!.connector.assembled);
}

type ToothInfoBlock =
  | { kind: "single"; tooth: LabProsthesisAiTooth }
  | { kind: "bridge"; members: LabProsthesisAiTooth[]; span: string[] };

/** 같은 악 안에서 브리지 스팬을 한 덩어리로 모은다. */
function toothInfoBlocks(
  teeth: readonly LabProsthesisAiTooth[],
  spans: ReadonlyMap<string, string[]>,
): ToothInfoBlock[] {
  const spanOf = new Map<string, string[]>();
  for (const span of spans.values()) {
    if (span.length < 2) continue;
    for (const id of span) spanOf.set(id, span);
  }
  const seen = new Set<string>();
  const blocks: ToothInfoBlock[] = [];
  for (const tooth of teeth) {
    if (seen.has(tooth.toothNumber)) continue;
    const span = spanOf.get(tooth.toothNumber);
    const members = span
      ? teeth
          .filter((row) => span.includes(row.toothNumber))
          .sort((a, b) => compareArch(a.toothNumber, b.toothNumber))
      : [tooth];
    for (const row of members) seen.add(row.toothNumber);
    if (!span || members.length < 2) {
      blocks.push({ kind: "single", tooth });
      continue;
    }
    blocks.push({ kind: "bridge", members: [...members], span });
  }
  return blocks;
}

function marginLineChanged(prev: ToothDesignEdit, next: ToothDesignEdit) {
  if (prev.margin.offsetMm !== next.margin.offsetMm) return true;
  if (prev.margin.radii.length !== next.margin.radii.length) return true;
  if (prev.margin.radii.some((radius, index) => radius !== next.margin.radii[index])) {
    return true;
  }
  const before = prev.margin.depths ?? [];
  const after = next.margin.depths ?? [];
  if (before.length !== after.length) return true;
  return before.some((depth, index) => depth !== after[index]);
}

/** 작업영역 안에서 패널이 붙는 자리. 숫자는 가장자리에 붙지 않은 픽셀. */
type PanelAxis = "start" | "end" | number;
type PanelPose = { x: PanelAxis; y: PanelAxis };
type DesignPanelId = "tooth" | "stage" | "chat";

function panelMetrics() {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return { edge: 0.75 * root, snap: 4 * root };
}

function axisPx(axis: PanelAxis, span: number, size: number, edge: number) {
  const max = Math.max(edge, span - size - edge);
  if (axis === "start") return edge;
  if (axis === "end") return max;
  return Math.min(Math.max(axis, edge), max);
}

function snapAxis(px: number, span: number, size: number, edge: number, snap: number): PanelAxis {
  const max = Math.max(edge, span - size - edge);
  const next = Math.min(Math.max(px, edge), max);
  if (next - edge <= snap) return "start";
  if (max - next <= snap) return "end";
  return next;
}

type PanelDragBind = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: (event: ReactMouseEvent, action: () => void) => void;
};

const PanelDragContext = createContext<PanelDragBind | null>(null);
const PanelFillContext = createContext(false);

type ResizeEdge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const RESIZE_HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: "n", className: "left-2 right-2 top-0 h-1.5 cursor-ns-resize" },
  { edge: "s", className: "bottom-0 left-2 right-2 h-1.5 cursor-ns-resize" },
  { edge: "w", className: "bottom-2 left-0 top-2 w-1.5 cursor-ew-resize" },
  { edge: "e", className: "bottom-2 right-0 top-2 w-1.5 cursor-ew-resize" },
  { edge: "nw", className: "left-0 top-0 h-3 w-3 cursor-nwse-resize" },
  { edge: "ne", className: "right-0 top-0 h-3 w-3 cursor-nesw-resize" },
  { edge: "sw", className: "bottom-0 left-0 h-3 w-3 cursor-nesw-resize" },
  { edge: "se", className: "bottom-0 right-0 h-3 w-3 cursor-nwse-resize" },
];

function SnapFrame({
  boundsRef,
  pose,
  onPose,
  anchorClass,
  className,
  resizable,
  contentOpen = true,
  children,
}: {
  boundsRef: RefObject<HTMLElement | null>;
  pose: PanelPose | null;
  onPose: (pose: PanelPose) => void;
  anchorClass: string;
  className?: string;
  /** 가장자리를 끌어 너비·높이를 바꾼다. */
  resizable?: boolean;
  /** 접히면 높이는 내용만큼, 펼치면 조절한 높이를 유지한다. */
  contentOpen?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | {
    ox: number;
    oy: number;
    moved: boolean;
    x: number;
    y: number;
  }>(null);
  const skipClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const resizeRef = useRef<null | {
    edge: ResizeEdge;
    x: number;
    y: number;
    l: number;
    t: number;
    w: number;
    h: number;
    moved: boolean;
  }>(null);
  const onPoseRef = useRef(onPose);
  onPoseRef.current = onPose;

  useLayoutEffect(() => {
    if (dragging) return;
    if (!pose) {
      setBox(null);
      return;
    }
    const bounds = boundsRef.current;
    const panel = panelRef.current;
    if (!bounds || !panel) return;
    const apply = () => {
      const { edge } = panelMetrics();
      const area = bounds.getBoundingClientRect();
      const left = axisPx(pose.x, area.width, panel.offsetWidth, edge);
      const top = axisPx(pose.y, area.height, panel.offsetHeight, edge);
      setBox((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bounds);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [boundsRef, dragging, pose]);

  const bind = useMemo<PanelDragBind>(() => {
    const finish = (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!drag?.moved) {
        setDragging(false);
        return;
      }
      skipClickRef.current = true;
      const bounds = boundsRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      setDragging(false);
      if (!bounds || !panel) return;
      const { edge, snap } = panelMetrics();
      const next = {
        x: snapAxis(drag.x, bounds.width, panel.width, edge, snap),
        y: snapAxis(drag.y, bounds.height, panel.height, edge, snap),
      };
      requestAnimationFrame(() => onPoseRef.current(next));
    };
    return {
      onPointerDown(event) {
        if (event.button !== 0) return;
        const bounds = boundsRef.current?.getBoundingClientRect();
        const panel = panelRef.current?.getBoundingClientRect();
        if (!bounds || !panel) return;
        dragRef.current = {
          ox: event.clientX - panel.left,
          oy: event.clientY - panel.top,
          moved: false,
          x: panel.left - bounds.left,
          y: panel.top - bounds.top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event) {
        const drag = dragRef.current;
        const boundsEl = boundsRef.current;
        const panelEl = panelRef.current;
        if (!drag || !boundsEl || !panelEl) return;
        const bounds = boundsEl.getBoundingClientRect();
        const rawX = event.clientX - drag.ox - bounds.left;
        const rawY = event.clientY - drag.oy - bounds.top;
        if (!drag.moved && Math.hypot(rawX - drag.x, rawY - drag.y) < 4) return;
        const { edge } = panelMetrics();
        const width = panelEl.offsetWidth;
        const height = panelEl.offsetHeight;
        const x = Math.min(Math.max(rawX, edge - width + 40), bounds.width - 40);
        const y = Math.min(Math.max(rawY, edge - height + 28), bounds.height - 28);
        drag.moved = true;
        drag.x = x;
        drag.y = y;
        setDragging(true);
        setBox({ left: x, top: y });
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onClick(event, action) {
        if (skipClickRef.current) {
          skipClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        action();
      },
    };
  }, [boundsRef]);

  const onResizeDown = (edge: ResizeEdge) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!bounds || !panel) return;
    resizeRef.current = {
      edge,
      x: event.clientX,
      y: event.clientY,
      l: panel.left - bounds.left,
      t: panel.top - bounds.top,
      w: panel.width,
      h: panel.height,
      moved: false,
    };
    setDragging(true);
    setBox({ left: panel.left - bounds.left, top: panel.top - bounds.top });
    setSize({ w: panel.width, h: panel.height });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = resizeRef.current;
    const boundsEl = boundsRef.current;
    if (!drag || !boundsEl) return;
    const bounds = boundsEl.getBoundingClientRect();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const minW = 16 * root;
    const minH = 10 * root;
    const { edge } = panelMetrics();
    let left = drag.l;
    let top = drag.t;
    let width = drag.w;
    let height = drag.h;
    const growWest = drag.edge.includes("w");
    const growEast = drag.edge.includes("e");
    const growNorth = drag.edge.includes("n");
    const growSouth = drag.edge.includes("s");
    if (growEast) width = drag.w + dx;
    if (growWest) {
      width = drag.w - dx;
      left = drag.l + dx;
    }
    if (growSouth) height = drag.h + dy;
    if (growNorth) {
      height = drag.h - dy;
      top = drag.t + dy;
    }
    width = Math.min(Math.max(width, minW), bounds.width - edge * 2);
    height = Math.min(Math.max(height, minH), bounds.height - edge * 2);
    if (growWest) left = drag.l + (drag.w - width);
    if (growNorth) top = drag.t + (drag.h - height);
    left = Math.min(Math.max(left, edge), bounds.width - width - edge);
    top = Math.min(Math.max(top, edge), bounds.height - height - edge);
    setBox({ left, top });
    setSize({ w: width, h: height });
  };

  const onResizeUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = resizeRef.current;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag?.moved) {
      setDragging(false);
      return;
    }
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    setDragging(false);
    if (!bounds || !panel) return;
    const { edge, snap } = panelMetrics();
    const next = {
      x: snapAxis(panel.left - bounds.left, bounds.width, panel.width, edge, snap),
      y: snapAxis(panel.top - bounds.top, bounds.height, panel.height, edge, snap),
    };
    requestAnimationFrame(() => onPoseRef.current(next));
  };

  const sized = size != null && contentOpen;

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute z-20 max-h-[calc(100%-1.5rem)]",
        dragging && "z-30",
        !box && anchorClass,
        box && !dragging && "transition-[left,top] duration-200 ease-out",
        resizable && !size && "w-[min(18rem,calc(100%-1.5rem))]",
        className,
      )}
      style={{
        ...(box ? { left: box.left, top: box.top, right: "auto", bottom: "auto" } : {}),
        ...(size ? { width: size.w, height: sized ? size.h : undefined } : {}),
      }}
    >
      <PanelFillContext.Provider value={sized}>
        <PanelDragContext.Provider value={bind}>{children}</PanelDragContext.Provider>
      </PanelFillContext.Provider>
      {resizable
        ? RESIZE_HANDLES.map((handle) => (
            <div
              key={handle.edge}
              role="separator"
              tabIndex={0}
              aria-label="채팅 패널 크기"
              aria-orientation={handle.edge === "n" || handle.edge === "s" ? "horizontal" : handle.edge === "e" || handle.edge === "w" ? "vertical" : undefined}
              className={cn("pointer-events-auto absolute z-10", handle.className)}
              onPointerDown={onResizeDown(handle.edge)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              onPointerCancel={onResizeUp}
            />
          ))
        : null}
    </div>
  );
}

function DraggablePanelHeader({
  open,
  onToggle,
  className,
  aside,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const drag = useContext(PanelDragContext);
  const toggle = (event: ReactMouseEvent) => {
    if (!drag) {
      onToggle();
      return;
    }
    drag.onClick(event, onToggle);
  };
  const chevron = (
    <ChevronDown
      className={cn(
        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
        open ? "rotate-180" : "",
      )}
    />
  );
  if (!aside) {
    return (
      <button
        type="button"
        className={cn(
          "flex w-full cursor-grab touch-none select-none items-center justify-between gap-2 text-left active:cursor-grabbing",
          className,
        )}
        aria-expanded={open}
        title="끌어 옮기면 가장자리에 붙습니다"
        onPointerDown={drag?.onPointerDown}
        onPointerMove={drag?.onPointerMove}
        onPointerUp={drag?.onPointerUp}
        onPointerCancel={drag?.onPointerCancel}
        onClick={toggle}
      >
        <span className="min-w-0 flex-1">{children}</span>
        {chevron}
      </button>
    );
  }
  return (
    <div
      className={cn("flex w-full items-center gap-0.5", className)}
      onPointerDown={drag?.onPointerDown}
      onPointerMove={drag?.onPointerMove}
      onPointerUp={drag?.onPointerUp}
      onPointerCancel={drag?.onPointerCancel}
    >
      <button
        type="button"
        className="flex min-w-0 cursor-grab touch-none select-none items-center text-left active:cursor-grabbing"
        aria-expanded={open}
        title="끌어 옮기면 가장자리에 붙습니다"
        onClick={toggle}
      >
        <span className="min-w-0">{children}</span>
      </button>
      <div onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        {aside}
      </div>
      <button
        type="button"
        className="ml-auto inline-flex h-6 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
        aria-label={open ? "접기" : "펼치기"}
        onClick={toggle}
      >
        {chevron}
      </button>
    </div>
  );
}

function AiDesignChatPanel({
  open,
  paintOn,
  draft,
  turns,
  onToggle,
  onTogglePaint,
  onDraft,
  onSend,
  onRemoveTurn,
}: {
  open: boolean;
  paintOn: boolean;
  draft: string;
  turns: readonly AiDesignChatTurn[];
  onToggle: () => void;
  onTogglePaint: () => void;
  onDraft: (value: string) => void;
  onSend: () => void;
  onRemoveTurn: (index: number) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const fill = useContext(PanelFillContext);
  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [open, turns.length]);
  let imageNo = 0;
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background/95 text-sm shadow-sm",
        fill && "h-full",
      )}
    >
      <DraggablePanelHeader
        open={open}
        onToggle={onToggle}
        className={cn("shrink-0 px-2.5", open && "border-b")}
      >
        <span className="inline-flex items-center gap-1.5 py-2 font-semibold text-foreground">
          <MessageSquare className="h-4 w-4" />
          AI
        </span>
      </DraggablePanelHeader>
      {open ? (
        <>
          <div
            className={cn(
              "min-h-0 space-y-2 overflow-y-auto px-2.5 py-2",
              fill ? "flex-1" : "max-h-[11rem] min-h-[9rem]",
            )}
          >
            {turns.length === 0 ? (
              <p className="text-xs text-muted-foreground">AI에게 디자인 명령해주세요.</p>
            ) : (
              turns.map((turn, index) => {
                const shotNo = turn.paintImageUrl ? ++imageNo : 0;
                return (
                <div
                  key={`${turn.role}-${index}`}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs text-foreground",
                    turn.role === "user" ? "ml-4 bg-primary/10" : "mr-4 bg-muted",
                  )}
                >
                  {turn.fromPaint ? (
                    <p className="mb-1 inline-flex items-center gap-1 font-medium text-primary">
                      <Pencil className="h-3.5 w-3.5" />
                      페인트
                    </p>
                  ) : null}
                  {turn.paintImageUrl ? (
                    <div className="relative mb-1">
                      <span className="absolute left-1 top-1 rounded bg-background/95 px-1 text-[0.65rem] font-semibold tabular-nums leading-4 shadow-sm">
                        ({shotNo})
                      </span>
                      <button
                        type="button"
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/95 text-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground [&_svg]:size-3"
                        aria-label={`${shotNo}번 첨부 지우기`}
                        title="이 이미지 지우기"
                        onClick={() => onRemoveTurn(index)}
                      >
                        <X />
                      </button>
                      <img
                        src={turn.paintImageUrl}
                        alt={`첨부 ${shotNo}`}
                        className="max-h-28 w-full rounded object-contain"
                      />
                    </div>
                  ) : null}
                  {turn.fromPaint && turn.text === "페인트 표시" ? null : (
                    <p className="whitespace-pre-wrap break-words">{turn.text}</p>
                  )}
                </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
          <form
            className="flex items-end gap-1 border-t p-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <button
              type="button"
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full [&_svg]:size-4",
                paintOn ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
              )}
              aria-label="페인트"
              aria-pressed={paintOn}
              title="페인트. 왼쪽은 그리기, 오른쪽은 화면 회전입니다."
              onClick={onTogglePaint}
            >
              <Pencil />
            </button>
            <textarea
              className="max-h-24 min-h-8 flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              rows={1}
              maxLength={2000}
              value={draft}
              placeholder="AI에게 디자인 명령해주세요."
              aria-label="AI에게 디자인 명령해주세요."
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) {
                  return;
                }
                event.preventDefault();
                onSend();
              }}
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 w-8 shrink-0 px-0"
              aria-label="보내기"
              disabled={!draft.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}

/** 스크류홀. 바깥 고리와 뚫린 속. */
function ScrewHoleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" />
    </svg>
  );
}

function DesignViewerChrome({
  teeth,
  activeTooth,
  edits,
  generated,
  marginReview,
  designLibrary,
  caseDefaultPresetId,
  generating,
  genLabel,
  panelsShown,
  toothInfoOpen,
  insertionKeys,
  highlightInsertionKey,
  canSetInsertion,
  onSelectTooth,
  hiddenTeeth,
  archShown,
  onToggleTooth,
  onToggleArch,
  onSetInsertion,
  onToggleInfo,
  onConfirmMargin,
  onGenerateTooth,
  onGenerateSpan,
  onAssembleSpan,
  onTogglePontic,
  onClearTooth,
  scans,
  scanShown,
  fileState,
  onToggleScan,
  dragScanId,
  dropScanId,
  onScanDragStart,
  onScanDragEnd,
  onScanDragOver,
  onScanDragLeave,
  onScanDrop,
  screwPathAvailable,
  screwPathShown,
  onToggleScrewPath,
  scanBusy,
  scanProgress,
  scanLoadError,
  workAreaRef,
  toothPose,
  onToothPose,
  libraryLabel,
  libraryIdOf,
  scanbodyForLibrary,
  onToggleScrewHole,
  cavityKinds,
  crownShells,
}: {
  cavityKinds: Record<string, CavityKind>;
  /** 뷰어가 맞춘 크라운에서 잰 가장 얇은 외면(mm). */
  crownShells: Record<string, number>;
  libraryLabel: (toothNumber: string) => string | null;
  libraryIdOf: (toothNumber: string) => string | null;
  scanbodyForLibrary: (toothNumber: string, libraryId: string | null) => string | null;
  onToggleScrewHole: (toothNumber: string, on: boolean) => void;
  teeth: LabProsthesisAiTooth[];
  activeTooth: LabProsthesisAiTooth | null;
  edits: Record<string, ToothDesignEdit>;
  generated: Record<string, boolean>;
  marginReview: Record<string, MarginReview>;
  designLibrary: DesignPresetLibrary;
  /** 치과에 연결된 프리셋, 없으면 기공소 기본 프리셋. */
  caseDefaultPresetId: string;
  generating: boolean;
  genLabel: string;
  panelsShown: boolean;
  toothInfoOpen: boolean;
  insertionKeys: readonly string[];
  highlightInsertionKey: string;
  canSetInsertion: boolean;
  onSelectTooth: (toothNumber: string) => void;
  hiddenTeeth: readonly string[];
  archShown: (arch: "upper" | "lower") => boolean;
  onToggleTooth: (toothNumber: string, on: boolean) => void;
  onToggleArch: (arch: "upper" | "lower", on: boolean) => void;
  onSetInsertion: (toothNumbers: readonly string[]) => void;
  onToggleInfo: () => void;
  onConfirmMargin: (toothNumber: string) => void;
  onGenerateTooth: (toothNumber: string) => void;
  onGenerateSpan: (span: readonly string[]) => void;
  onAssembleSpan: (span: readonly string[], assembled: boolean) => void;
  onTogglePontic: (toothNumber: string) => void;
  onClearTooth: (toothNumber: string) => void;
  scans: readonly MeshSource[];
  scanShown: (row: MeshSource) => boolean;
  fileState: Record<string, "loading" | "ready" | "error">;
  onToggleScan: (id: string, on: boolean) => void;
  dragScanId: string | null;
  dropScanId: string | null;
  onScanDragStart: (id: string) => void;
  onScanDragEnd: () => void;
  onScanDragOver: (id: string) => void;
  onScanDragLeave: (id: string) => void;
  onScanDrop: (sourceId: string, targetId: string) => void;
  screwPathAvailable: boolean;
  screwPathShown: boolean;
  onToggleScrewPath: (on: boolean) => void;
  scanBusy: boolean;
  scanProgress: number;
  scanLoadError: string;
  workAreaRef: RefObject<HTMLElement | null>;
  toothPose: PanelPose | null;
  onToothPose: (pose: PanelPose) => void;
}) {
  const [orderInfoOpen, setOrderInfoOpen] = useState(false);
  const spans = insertionSpansByOwner(teeth);
  const toothActionClass =
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md disabled:opacity-50";
  const iconClass = "h-3.5 w-3.5";
  const toothTipClass = "z-[520] bg-background text-base leading-snug text-foreground";
  const iconTip = (
    text: ReactNode,
    node: ReactElement<{ className?: string; disabled?: boolean }>,
  ) => {
    const disabled = node.props.disabled === true;
    const child = disabled
      ? cloneElement(node, { className: cn(node.props.className, "pointer-events-none") })
      : node;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{child}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className={toothTipClass}>
          {text}
        </TooltipContent>
      </Tooltip>
    );
  };

  const axisState = (span: readonly string[]) => {
    const spanKey = insertionAxisKey(span);
    return Boolean(spanKey && insertionKeys.includes(spanKey));
  };

  const shownCheckbox = (tooth: LabProsthesisAiTooth) => (
    <Checkbox
      className="h-3.5 w-3.5 shrink-0"
      checked={!hiddenTeeth.includes(tooth.toothNumber)}
      onCheckedChange={(checked) => onToggleTooth(tooth.toothNumber, checked === true)}
      aria-label={`#${tooth.toothNumber} 표시`}
      title="이 치아의 다이와 작업물을 화면에 표시합니다"
    />
  );

  const nameButton = (tooth: LabProsthesisAiTooth, axisOn: boolean) => (
    <>
      {shownCheckbox(tooth)}
      <button
        type="button"
        className={cn(
          "w-fit shrink-0 whitespace-nowrap rounded-md px-1 py-0.5 text-left",
          activeTooth?.toothNumber === tooth.toothNumber ? "bg-primary/10" : "hover:bg-muted",
        )}
        title={
          axisOn
            ? "삽입축을 잡았던 방향·각도·줌으로 봅니다"
            : "이 치아의 교합면을 봅니다"
        }
        onClick={() => onSelectTooth(tooth.toothNumber)}
      >
        <span className="font-semibold">#{tooth.toothNumber}</span>
      </button>
    </>
  );

  const insertionButton = (span: readonly string[], shared: boolean) => {
    const axisOn = axisState(span);
    const spanKey = insertionAxisKey(span);
    const highlighted = Boolean(highlightInsertionKey && spanKey === highlightInsertionKey);
    return iconTip(
      shared
        ? "누르면 아래에서 브리지 삽입축을 다시 잡습니다."
        : "누르면 아래에서 삽입축을 다시 잡습니다.",
      <button
        type="button"
        className={cn(
          toothActionClass,
          "bg-primary text-primary-foreground",
          !canSetInsertion && "opacity-50",
          highlighted && "practice-tooth-guide-pulse",
        )}
        aria-label={shared ? "브리지 삽입축" : "삽입축"}
        aria-pressed={axisOn}
        data-coach={spanKey ? `axis:${spanKey}` : undefined}
        disabled={!canSetInsertion}
        onClick={() => onSetInsertion(span)}
      >
        <Crosshair className={iconClass} />
      </button>,
    );
  };

  const toothEdit = (toothNumber: string) =>
    edits[toothNumber] ?? createToothDesignEdit();

  const toothThin = (number: string) => {
    const edit = edits[number];
    return Boolean(
      generated[number] === true &&
        edit &&
        designIsThin(edit, cavityKinds[number] ?? null, crownShells[number]),
    );
  };

  /** 검출한 와동 벽 중 삽입축과 평행하거나 언더컷인 곳 수. 크라운은 0. */
  const toothUndercut = (number: string) => {
    const edit = edits[number];
    if (!cavityKinds[number] || !edit || edit.margin.deleted) return 0;
    if ((marginReview[number] ?? "none") === "none") return 0;
    return cavityTaperSummary(edit.margin.cavity)?.undercut ?? 0;
  };

  const statusBits = (tooth: LabProsthesisAiTooth) => {
    const number = tooth.toothNumber;
    const made = generated[number] === true;
    const review = marginReview[number] ?? "none";
    const edit = edits[number];
    const thin = toothThin(number);
    const undercut = toothUndercut(number);
    const marginFound = !made && !edit?.pontic.on && (review === "detected" || review === "confirmed");
    const marginTip =
      review === "confirmed"
        ? "마진을 확인했습니다."
        : cavityKinds[number]
          ? "와동 마진을 잡았습니다."
          : "마진선을 잡았습니다.";
    return (
      <>
        {made ? iconTip(
          "생성됨",
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground">
            <Sparkles className={iconClass} />
          </span>,
        ) : null}
        {marginFound ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground"
                aria-label={
                  review === "detected" ? `${marginTip} 확인한 뒤 생성하세요.` : marginTip
                }
              >
                <Check className={iconClass} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className={toothTipClass}>
              {marginTip}
              {review === "detected" ? (
                <>
                  <br />
                  확인한 뒤 생성하세요.
                </>
              ) : null}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {thin ? iconTip(
          "최소 두께 미달",
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-destructive"
            aria-label="최소 두께"
            onClick={() => onSelectTooth(number)}
          >
            <TriangleAlert className={iconClass} />
          </button>,
        ) : null}
        {undercut > 0 ? iconTip(
          <>
            와동 벽 {undercut}곳이 삽입축과 평행하거나 언더컷입니다.
            <br />
            권장 테이퍼 {CAVITY_TAPER_RECOMMENDED}
          </>,
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-destructive"
            aria-label="언더컷"
            onClick={() => onSelectTooth(number)}
          >
            <TriangleAlert className={iconClass} />
          </button>,
        ) : null}
      </>
    );
  };

  const presetValue = (tooth: LabProsthesisAiTooth) => {
    const inner = toothEdit(tooth.toothNumber).inner;
    return inner.presetId === "" ? caseDefaultPresetId : (inner.presetId ?? "custom");
  };

  const presetLabel = (tooth: LabProsthesisAiTooth) => {
    const value = presetValue(tooth);
    const inner = toothEdit(tooth.toothNumber).inner;
    const row = designLibrary.presets.find((item) => item.id === value);
    if (row) return presetDisplayName(row.name);
    if (value === "custom") return "직접 조정";
    return presetDisplayName(inner.presetName || "지운 프리셋");
  };

  const generateButton = (tooth: LabProsthesisAiTooth) => {
    if (generated[tooth.toothNumber] === true) {
      return iconTip(
        "생성한 보철을 지웁니다",
        <button
          type="button"
          className={cn(toothActionClass, "text-muted-foreground hover:bg-muted")}
          aria-label="삭제"
          onClick={() => onClearTooth(tooth.toothNumber)}
        >
          <Trash2 className={iconClass} />
        </button>,
      );
    }
    if (!tooth.designable) {
      return iconTip(
        "생성",
        <button
          type="button"
          className={cn(toothActionClass, "bg-primary text-primary-foreground")}
          aria-label="생성"
          disabled
        >
          <Sparkles className={iconClass} />
        </button>,
      );
    }
    if (toothEdit(tooth.toothNumber).pontic.on) {
      return iconTip(
        "생성",
        <button
          type="button"
          className={cn(toothActionClass, "bg-primary text-primary-foreground")}
          aria-label="생성"
          disabled={generating}
          onClick={() => onGenerateTooth(tooth.toothNumber)}
        >
          <Sparkles className={iconClass} />
        </button>,
      );
    }
    const review = marginReview[tooth.toothNumber] ?? "none";
    const deleted = toothEdit(tooth.toothNumber).margin.deleted;
    const implant = tooth.implant ? toothEdit(tooth.toothNumber).implant : null;
    const implantBlock = implant
      ? !implant.libraryId
        ? "임플란트 라이브러리를 먼저 고릅니다."
        : !implant.aligned
          ? "스캔바디를 먼저 맞춥니다."
          : null
      : null;
    if (review === "detected" && !deleted && !implantBlock) {
      return iconTip(
        "마진을 확인합니다",
        <button
          type="button"
          className={cn(toothActionClass, "bg-primary text-primary-foreground")}
          aria-label="마진 확인"
          data-coach="margin-confirm"
          onClick={() => onConfirmMargin(tooth.toothNumber)}
        >
          <Check className={iconClass} />
        </button>,
      );
    }
    const ready = review === "confirmed" && !deleted && !implantBlock;
    const blocked = implantBlock ?? `${implant ? "EPL" : "마진"}을 확인한 뒤에 생성합니다.`;
    return iconTip(
      ready ? "생성" : blocked,
      <button
        type="button"
        className={cn(toothActionClass, "bg-primary text-primary-foreground")}
        disabled={generating || !ready}
        data-coach={ready ? "generate" : undefined}
        aria-label="생성"
        onClick={() => onGenerateTooth(tooth.toothNumber)}
      >
        <Sparkles className={iconClass} />
      </button>,
    );
  };

  const implantBits = (tooth: LabProsthesisAiTooth) => {
    if (!tooth.implant) return null;
    const implant = toothEdit(tooth.toothNumber).implant;
    return (
      <>
        {implant.aligned ? iconTip(
          "정렬됨",
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground">
            <Check className={iconClass} />
          </span>,
        ) : null}
        {iconTip(
          "스크류홀",
          <button
            type="button"
            className={cn(
              toothActionClass,
              "border",
              implant.screwHole
                ? "border-amber-500/50 bg-amber-500/15 text-amber-700"
                : "border-border text-muted-foreground",
            )}
            aria-label={`#${tooth.toothNumber} 스크류홀`}
            aria-pressed={implant.screwHole}
            onClick={() => onToggleScrewHole(tooth.toothNumber, !implant.screwHole)}
          >
            <ScrewHoleIcon className={iconClass} />
          </button>,
        )}
      </>
    );
  };

  const singleToothRow = (tooth: LabProsthesisAiTooth) => {
    const span = insertionSpanForTooth(teeth, tooth.toothNumber);
    const axisOn = axisState(span);
    return (
      <div className="flex items-center gap-2 py-0.5">
        <div className="flex w-6 shrink-0 items-center justify-center">
          {span.length > 0 ? insertionButton(span, false) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {nameButton(tooth, axisOn)}
          {statusBits(tooth)}
          {implantBits(tooth)}
          {generateButton(tooth)}
        </div>
      </div>
    );
  };

  const links = bridgeLinks(teeth);

  const roleButton = (tooth: LabProsthesisAiTooth, span: readonly string[]) => {
    const pontic = toothEdit(tooth.toothNumber).pontic.on;
    const lastAbutment =
      !pontic &&
      span.every(
        (number) => number === tooth.toothNumber || toothEdit(number).pontic.on,
      );
    return iconTip(
      lastAbutment
        ? "브리지에는 지대치가 하나 이상 있어야 합니다."
        : pontic
          ? "지대치로 바꾸면 마진을 다시 검출합니다."
          : "폰틱은 마진 없이 기저면으로 치조정에 얹습니다.",
      <button
        type="button"
        className={cn(
          toothActionClass,
          "border",
          pontic
            ? "border-violet-500/50 bg-violet-500/10 text-violet-700"
            : "border-sky-500/50 bg-sky-500/10 text-sky-700",
        )}
        disabled={lastAbutment}
        aria-label={pontic ? "폰틱" : "지대치"}
        aria-pressed={pontic}
        onClick={() => onTogglePontic(tooth.toothNumber)}
      >
        {pontic ? <Spline className={iconClass} /> : <CircleDot className={iconClass} />}
      </button>,
    );
  };

  const bridgeHeader = (span: readonly string[], members: LabProsthesisAiTooth[]) => {
    const ordered = sortByArch(span);
    const label = `${ordered[0]}-${ordered[ordered.length - 1]}`;
    const allMade = members.every((tooth) => generated[tooth.toothNumber] === true);
    const assembled = spanAssembled(span, edits);
    const weak = links.some(
      (link) =>
        span.includes(link.from) &&
        span.includes(link.to) &&
        connectorIsWeak(toothEdit(link.from), [link.from, link.to]),
    );
    const pending = members.filter((tooth) => generated[tooth.toothNumber] !== true);
    const spanReady = pending.every((tooth) => {
      const edit = toothEdit(tooth.toothNumber);
      if (edit.pontic.on) return true;
      if (tooth.implant && !(edit.implant.libraryId && edit.implant.aligned)) return false;
      return (
        tooth.designable &&
        !edit.margin.deleted &&
        marginReview[tooth.toothNumber] === "confirmed"
      );
    });
    return (
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="whitespace-nowrap text-xs font-semibold text-foreground" title="브리지">
          {label}
        </span>
        {allMade ? (
          assembled ? iconTip(
            "조립됨",
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-primary">
              <Link2 className={iconClass} />
            </span>,
          ) : iconTip(
            "조립 전",
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-accent-foreground">
              <TriangleAlert className={iconClass} />
            </span>,
          )
        ) : null}
        {allMade && weak ? iconTip(
          "커넥터 약함",
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-destructive"
            aria-label="커넥터 약함"
            onClick={() => {
              const lead = members[0];
              if (lead) onSelectTooth(lead.toothNumber);
            }}
          >
            <TriangleAlert className={iconClass} />
          </button>,
        ) : null}
        {!allMade ? iconTip(
          spanReady ? "브리지 생성" : "지대치 마진을 모두 확인한 뒤 생성합니다.",
          <button
            type="button"
            className={cn(toothActionClass, "bg-primary text-primary-foreground")}
            disabled={generating || !spanReady}
            aria-label="브리지 생성"
            onClick={() => onGenerateSpan(pending.map((tooth) => tooth.toothNumber))}
          >
            <Sparkles className={iconClass} />
          </button>,
        ) : null}
        {allMade ? iconTip(
          assembled
            ? "크라운이나 커넥터를 고치려면 분리합니다."
            : "커넥터로 브리지를 한 덩어리로 잇습니다.",
          <button
            type="button"
            className={cn(
              toothActionClass,
              assembled
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground",
            )}
            aria-label={assembled ? "분리" : "조립"}
            onClick={() => onAssembleSpan(span, !assembled)}
          >
            {assembled ? <Unlink className={iconClass} /> : <Link2 className={iconClass} />}
          </button>,
        ) : null}
      </div>
    );
  };

  const thinTeeth = teeth.filter((tooth) => toothThin(tooth.toothNumber));
  const undercutTeeth = teeth.filter((tooth) => toothUndercut(tooth.toothNumber) > 0);

  const filesFor = (role: MeshSource["role"]) => scans.filter((scan) => scan.role === role);

  const scanFileLabel = (scan: MeshSource) => {
    const failed = fileState[scan.id] === "error";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-scan-id={scan.id}
            draggable
            className="min-w-0 max-w-[9rem] cursor-grab truncate text-[11px] text-muted-foreground active:cursor-grabbing"
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", scan.id);
              event.dataTransfer.effectAllowed = "move";
              onScanDragStart(scan.id);
            }}
            onDragEnd={onScanDragEnd}
          >
            {failed ? (
              <TriangleAlert className="mr-0.5 inline h-3 w-3 text-destructive" />
            ) : null}
            {scan.fileName}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="z-[520]">
          {scan.fileName}
          <br />
          끌어 다른 악이나 바이트 위에 놓으면 역할을 맞바꿉니다.
        </TooltipContent>
      </Tooltip>
    );
  };

  const jawDrop = (files: readonly MeshSource[]) => {
    const targetOf = (event: { target: EventTarget | null }) => {
      const node = event.target instanceof Element ? event.target : null;
      return node?.closest("[data-scan-id]")?.getAttribute("data-scan-id") || files[0]?.id || "";
    };
    return {
      onDragOver: (event: ReactDragEvent<HTMLElement>) => {
        if (!dragScanId || files.some((scan) => scan.id === dragScanId)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const target = targetOf(event);
        if (target) onScanDragOver(target);
      },
      onDragLeave: (event: ReactDragEvent<HTMLElement>) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        const target = files.find((scan) => scan.id === dropScanId)?.id;
        if (target) onScanDragLeave(target);
      },
      onDrop: (event: ReactDragEvent<HTMLElement>) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData("text/plain");
        const target = targetOf(event);
        onScanDragEnd();
        if (sourceId && target) onScanDrop(sourceId, target);
      },
    };
  };

  const unassembledSpan = [...spans.values()].find((span) => {
    const rows = teeth.filter((tooth) => span.includes(tooth.toothNumber));
    return (
      span.length > 1 &&
      rows.length > 1 &&
      rows.every((tooth) => generated[tooth.toothNumber] === true) &&
      !spanAssembled(span, edits)
    );
  });

  const clinicBlocks = toothInfoBlocks(
    (["upper", "lower", "other"] as const).flatMap((arch) =>
      teeth.filter((tooth) => toothArchGroup(tooth.toothNumber) === arch),
    ),
    spans,
  ).filter((block) => {
    const members = block.kind === "bridge" ? block.members : [block.tooth];
    return members.some((tooth) => tooth.designable || Boolean(tooth.implant));
  });

  return (
    <>
      <style>
        {`@keyframes aiScanLine { 0% { transform: translateY(0); opacity: .25; } 50% { opacity: 1; } 100% { transform: translateY(58vh); opacity: .2; } }`}
      </style>

      <SnapFrame
        boundsRef={workAreaRef}
        pose={toothPose}
        onPose={onToothPose}
        anchorClass="right-3 top-3"
        className="pointer-events-none flex w-fit max-h-[calc(100%-18rem)] max-w-[min(20rem,calc(100%-1.5rem))] flex-col overflow-hidden"
      >
        {panelsShown ? (
          <div className="pointer-events-auto mt-1 flex max-h-full min-h-0 w-max max-w-full flex-col overflow-hidden rounded-lg border bg-background/95 text-sm shadow-sm">
            <DraggablePanelHeader
              open={toothInfoOpen}
              onToggle={onToggleInfo}
              className="px-2.5 py-2"
              aside={iconTip(
                "재료·임플란트·스캔바디",
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="재료·임플란트·스캔바디"
                  onClick={() => setOrderInfoOpen(true)}
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>,
              )}
            >
              <span className="font-semibold text-foreground">치아 정보</span>
            </DraggablePanelHeader>
            {toothInfoOpen ? (
              <div className="min-h-0 overflow-y-auto border-t px-2 py-2">
                {(
                  [
                    { id: "upper" as const, label: "상악" },
                    { id: "bite" as const, label: "바이트" },
                    { id: "lower" as const, label: "하악" },
                  ] as const
                ).map((row) => {
                  const files = filesFor(row.id);
                  const rowTeeth =
                    row.id === "bite"
                      ? []
                      : teeth.filter((tooth) => toothArchGroup(tooth.toothNumber) === row.id);
                  if (files.length === 0 && rowTeeth.length === 0) return null;
                  const shown =
                    row.id === "bite"
                      ? files.length > 0 && files.every(scanShown)
                      : archShown(row.id);
                  const blocked =
                    files.length > 0 &&
                    files.every((scan) => {
                      const state = fileState[scan.id];
                      return state === "loading" || state === "error";
                    });
                  const dropping =
                    Boolean(dragScanId) &&
                    files.some((scan) => scan.id === dropScanId) &&
                    !files.some((scan) => scan.id === dragScanId);
                  return (
                    <div key={row.id} className="mb-2.5 last:mb-0">
                      <div
                        className={cn(
                          "flex min-w-0 flex-wrap items-center gap-1 rounded py-0.5",
                          dropping && "bg-primary/10 ring-1 ring-primary",
                        )}
                        {...jawDrop(files)}
                      >
                        <Checkbox
                          className={cn("h-3.5 w-3.5", ROLE_CHECK[row.id])}
                          checked={shown}
                          disabled={blocked}
                          onCheckedChange={(checked) => {
                            if (row.id === "bite") {
                              const on = checked === true;
                              for (const scan of files) onToggleScan(scan.id, on);
                              return;
                            }
                            onToggleArch(row.id, checked === true);
                          }}
                          aria-label={`${row.label} 표시`}
                        />
                        <span className="shrink-0 text-xs font-medium text-foreground">{row.label}</span>
                        {files.map((scan) => (
                          <span key={scan.id} className="flex min-w-0 items-center">
                            {scanFileLabel(scan)}
                          </span>
                        ))}
                      </div>
                      {rowTeeth.length > 0 ? (
                        <ul className="ml-1.5 mt-1 border-l border-border pl-2">
                          {toothInfoBlocks(rowTeeth, spans).map((block) => {
                            if (block.kind === "bridge") {
                              const axisOn = axisState(block.span);
                              const members = block.members;
                              return (
                                <li key={`bridge-${block.span.join("-")}`} className="py-1">
                                  {bridgeHeader(block.span, members)}
                                  <div className="flex items-stretch gap-2">
                                    <div className="flex w-6 shrink-0 items-center justify-center">
                                      {insertionButton(block.span, true)}
                                    </div>
                                    <div className="relative min-w-0">
                                      {members.length > 1 ? (
                                        <span
                                          aria-hidden
                                          className="absolute bottom-[0.875rem] left-0 top-[0.875rem] w-[3px] bg-primary"
                                        />
                                      ) : null}
                                      <div className="flex flex-col">
                                        {members.map((tooth) => (
                                          <div
                                            key={tooth.toothNumber}
                                            className="flex h-7 items-center"
                                          >
                                            <span
                                              aria-hidden
                                              className="h-[3px] w-3 shrink-0 bg-primary"
                                            />
                                            <div className="flex min-w-0 items-center gap-1 pl-1">
                                              {nameButton(tooth, axisOn)}
                                              {roleButton(tooth, block.span)}
                                              {statusBits(tooth)}
                                              {implantBits(tooth)}
                                              {generateButton(tooth)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </li>
                              );
                            }
                            return (
                              <li
                                key={`${block.tooth.toothNumber}-${block.tooth.prosthesisType}`}
                                className="py-1"
                              >
                                {singleToothRow(block.tooth)}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
                {teeth.some((tooth) => toothArchGroup(tooth.toothNumber) === "other") ? (
                  <div className="mb-2.5 last:mb-0">
                    <p className="text-xs font-medium text-muted-foreground">기타</p>
                    <ul className="ml-1.5 mt-1 border-l border-border pl-2">
                      {toothInfoBlocks(
                        teeth.filter((tooth) => toothArchGroup(tooth.toothNumber) === "other"),
                        spans,
                      ).map((block) => {
                        if (block.kind !== "single") return null;
                        return (
                          <li
                            key={`${block.tooth.toothNumber}-${block.tooth.prosthesisType}`}
                            className="py-1"
                          >
                            {singleToothRow(block.tooth)}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {screwPathAvailable ? (
                  <label className="mt-1 flex items-center gap-1" title="스크류 경로">
                    <Checkbox
                      className="h-3.5 w-3.5 border-amber-500 data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:text-white"
                      checked={screwPathShown}
                      onCheckedChange={(checked) => onToggleScrewPath(checked === true)}
                      aria-label="스크류 경로 표시"
                    />
                    <span className="text-[11px] font-semibold text-primary">스크류</span>
                  </label>
                ) : null}
                {scanBusy ? <Progress value={scanProgress} className="mt-1 h-1.5" /> : null}
                {scanLoadError ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-destructive">{scanLoadError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </SnapFrame>

      <Dialog open={orderInfoOpen} onOpenChange={setOrderInfoOpen}>
        <DialogContent
          overlayClassName="z-[560]"
          className="z-[561] flex max-h-[min(40rem,calc(100dvh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl sm:p-0"
        >
          <DialogHeader className="px-5 pb-3 pt-5 text-left">
            <DialogTitle>치아 정보</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {clinicBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">표시할 재료와 라이브러리가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {clinicBlocks.map((block) => {
                  const members = block.kind === "bridge" ? block.members : [block.tooth];
                  const ordered = sortByArch(members.map((tooth) => tooth.toothNumber));
                  const heading =
                    block.kind === "bridge"
                      ? `${ordered[0]}–${ordered[ordered.length - 1]}`
                      : `#${members[0]?.toothNumber ?? ""}`;
                  const lead = members.find((tooth) => tooth.designable) ?? null;
                  const implants = members.filter((tooth) => tooth.implant);
                  const material = lead ? presetLabel(lead) : "";
                  const typeLabel = [
                    ...new Set(
                      members.map((tooth) => tooth.prosthesisType.trim()).filter(Boolean),
                    ),
                  ].join(" · ");
                  const bridgeTone = typeLabel === "브리지";
                  const crownTone = typeLabel === "크라운";
                  return (
                    <section
                      key={`${heading}-${ordered.join("-")}`}
                      className={cn(
                        "overflow-hidden rounded-xl border",
                        bridgeTone && "border-sky-500/30 bg-sky-500/[0.06]",
                        crownTone && "border-amber-500/30 bg-amber-500/[0.06]",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-2 px-3 py-2",
                          bridgeTone
                            ? "bg-sky-500/15"
                            : crownTone
                              ? "bg-amber-500/15"
                              : "bg-muted/40",
                        )}
                      >
                        <h3 className="min-w-0 text-sm font-semibold text-foreground">{heading}</h3>
                        <span className="ml-auto inline-flex w-fit shrink-0 items-center gap-2 whitespace-nowrap">
                          {material ? (
                            <span className="w-fit whitespace-nowrap text-xs text-foreground">{material}</span>
                          ) : null}
                          {typeLabel ? (
                            <span
                              className={cn(
                                "w-fit rounded-full bg-background px-2 py-0.5 text-[11px] font-medium",
                                bridgeTone && "text-sky-800 dark:text-sky-200",
                                crownTone && "text-amber-800 dark:text-amber-200",
                                !bridgeTone && !crownTone && "text-foreground",
                              )}
                            >
                              {typeLabel}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {implants.length > 0 ? (
                        <div className="space-y-3 px-3 py-3">
                          {implants.map((tooth) => {
                            const spec = orderSpecLines(tooth);
                            const libraryId = libraryIdOf(tooth.toothNumber);
                            const picked = libraryLabel(tooth.toothNumber);
                            const scan = scanbodyForLibrary(tooth.toothNumber, libraryId);
                            return (
                              <div
                                key={tooth.toothNumber}
                                className="space-y-2 rounded-lg border bg-muted/20 p-2.5"
                              >
                                {members.length > 1 ? (
                                  <p className="text-xs font-semibold text-foreground">#{tooth.toothNumber}</p>
                                ) : null}
                                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2">
                                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                    <Library className="h-3.5 w-3.5 shrink-0" />
                                    임플란트
                                  </span>
                                  <p className="min-w-0 text-xs leading-relaxed text-foreground">
                                    {implantWithManufacturer(
                                      tooth.implant?.manufacturer ?? "",
                                      picked || spec.implant || "지정 없음",
                                    )}
                                  </p>
                                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                    <Cylinder className="h-3.5 w-3.5 shrink-0" />
                                    스캔바디
                                  </span>
                                  <p className="min-w-0 text-xs leading-relaxed text-foreground">
                                    {spec.scanbody || scan || "지정 없음"}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {thinTeeth.length > 0 || undercutTeeth.length > 0 || unassembledSpan ? (
        <div className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {unassembledSpan ? (
            <button
              type="button"
              className="max-w-xs rounded-md bg-background/95 px-3 py-2 text-center text-xs font-medium text-foreground shadow-sm"
              onClick={() => {
                const lead = sortByArch(unassembledSpan)[0];
                if (lead) onSelectTooth(lead);
              }}
            >
              크라운·폰틱·커넥터를 만들었지만 아직 조립하지 않았습니다.
              <br />
              커넥터를 확인한 뒤 치아 정보에서 브리지를 조립하세요.
            </button>
          ) : null}
          {thinTeeth.length > 0 ? (
            <button
              type="button"
              className="max-w-xs rounded-md bg-background/95 px-3 py-2 text-center text-xs font-medium text-foreground shadow-sm"
              onClick={() => {
                const tooth = thinTeeth[0];
                if (tooth) onSelectTooth(tooth.toothNumber);
              }}
            >
              디자인에 최소 두께 미달이 있습니다.
              <br />
              치아 정보에서 해당 치아를 확인하세요.
            </button>
          ) : null}
          {undercutTeeth.length > 0 ? (
            <button
              type="button"
              className="max-w-xs rounded-md bg-background/95 px-3 py-2 text-center text-xs font-medium text-foreground shadow-sm"
              onClick={() => {
                const tooth = undercutTeeth[0];
                if (tooth) onSelectTooth(tooth.toothNumber);
              }}
            >
              {undercutTeeth.map((tooth) => `#${tooth.toothNumber}`).join(", ")} 와동 벽에 언더컷이 있습니다.
              <br />
              삽입축을 다시 잡거나 치과에 프렙 수정을 요청하세요.
            </button>
          ) : null}
        </div>
      ) : null}

      {generating ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-8 top-16 z-10 h-px bg-sky-400 shadow-[0_0_12px_2px_rgba(56,189,248,0.85)]"
            style={{ animation: "aiScanLine 1.15s ease-in-out infinite" }}
          />
          {genLabel ? (
            <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/95 px-3 py-1.5 text-xs text-foreground shadow-sm">
              {genLabel}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function CaseHeaderLines({
  header,
  nav,
}: {
  header?: LabProsthesisAiCaseHeader | null;
  nav?: ReactNode;
}) {
  const primary = String(header?.primary || "").trim();
  const dates = arrivalOnlyLabel(String(header?.dates || "").trim());
  if (!primary && !dates && !nav) return null;
  return (
    <p className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden text-xs text-muted-foreground">
      {primary ? (
        <span className="min-w-0 truncate font-medium text-foreground">
          {primary}
        </span>
      ) : null}
      {nav}
      {dates ? (
        <span className="shrink-0 tabular-nums">{dates}</span>
      ) : null}
    </p>
  );
}

function arrivalOnlyLabel(dates: string): string {
  const parts = dates
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  const arrival = parts.find((part) => part.startsWith("도착"));
  if (arrival) return arrival;
  const ship = parts.find((part) => part.startsWith("출고"));
  if (ship) return ship;
  return parts
    .filter((part) => !part.startsWith("주문") && !part.startsWith("재주문"))
    .join(" · ");
}

function collectMeshSources(
  files: ReadonlyArray<AiDesignFile> | null | undefined,
): MeshSource[] {
  const out: MeshSource[] = [];
  const seen = new Set<string>();
  for (const file of preferWorkingOralScanFiles(files || [])) {
    const fileName = String(file?.fileName || "").trim();
    const id = String(file?.s3Key || "").trim();
    if (!fileName || !id || seen.has(id) || !isOralScanMeshName(fileName)) {
      continue;
    }
    const role = resolveOralScanRole(file);
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    seen.add(id);
    out.push({ id, fileName, role });
  }
  return out;
}

function filesOfApi(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is {
      fileName?: string | null;
      originalName?: string | null;
      scanRole?: string | null;
      uploadedAt?: string | null;
    } => Boolean(row) && typeof row === "object",
  );
}

function unwrapApiData(raw: unknown): Record<string, unknown> {
  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data = body.data;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return body;
}

function apiMessage(raw: unknown): string {
  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return String(body.message || "").trim();
}

/** 서버 표시 TTL(3분)보다 짧게 갱신한다. */
const WORK_SCAN_EDITING_BEAT_MS = 60 * 1000;

/** 작업 중 표시. 실패해도 작업은 막지 않는다(TTL로 풀린다). */
function sendWorkScanEditing(transferId: string, token: string, active: boolean) {
  return apiFetch({
    path: `/api/practice/transfers/received/${encodeURIComponent(transferId)}/work-scan-editing`,
    method: "POST",
    token,
    jsonBody: { active },
  }).catch(() => null);
}

function collectImageSources(
  files: ReadonlyArray<AiDesignFile> | null | undefined,
): Array<{ id: string; fileName: string }> {
  const out: Array<{ id: string; fileName: string }> = [];
  const seen = new Set<string>();
  for (const file of files || []) {
    const fileName = String(file?.fileName || "").trim();
    const id = String(file?.s3Key || "").trim();
    if (!fileName || !id || seen.has(id) || !IMAGE_EXT.test(fileName)) continue;
    seen.add(id);
    out.push({ id, fileName });
  }
  return out;
}
